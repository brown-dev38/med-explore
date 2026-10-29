import "server-only";
import { backfillAttendanceResults } from "@/lib/attendance";

const worker = globalThis as typeof globalThis & {
  attendanceWorker?: ReturnType<typeof setInterval>;
  attendanceWorkerRunning?: Promise<void>;
  attendanceWorkerRerun?: boolean;
  attendanceReviewDeadlines?: Set<number>;
  attendanceReviewTimer?: ReturnType<typeof setTimeout>;
  attendanceNextReview?: number;
};

async function run(requireFresh = false) {
  if (worker.attendanceWorkerRunning) {
    if (requireFresh) worker.attendanceWorkerRerun = true;
    return worker.attendanceWorkerRunning;
  }
  const pending = (async () => {
    try {
      // Drain several batches when many students share the same QR deadline.
      for (let batch = 0; batch < 4; batch++) {
        const result = await backfillAttendanceResults();
        if (!result || result.processed < 250) break;
      }
    } catch (error) { console.error("Automatic check-in award processing failed:", error); }
  })();
  worker.attendanceWorkerRunning = pending;
  try { await pending; }
  finally {
    if (worker.attendanceWorkerRunning === pending) worker.attendanceWorkerRunning = undefined;
    if (worker.attendanceWorkerRerun) {
      worker.attendanceWorkerRerun = false;
      void run();
    }
  }
}

export function startAttendanceWorker() {
  if (worker.attendanceWorker) return;
  worker.attendanceWorker = setInterval(() => void run(), 15000);
  worker.attendanceWorker.unref();
  void run();
}

function scheduleNextReview() {
  const deadlines = worker.attendanceReviewDeadlines;
  if (!deadlines?.size) return;
  const next = Math.min(...deadlines);
  if (worker.attendanceReviewTimer && worker.attendanceNextReview === next) return;
  if (worker.attendanceReviewTimer) clearTimeout(worker.attendanceReviewTimer);
  worker.attendanceNextReview = next;
  worker.attendanceReviewTimer = setTimeout(() => {
    worker.attendanceReviewTimer = undefined;
    worker.attendanceNextReview = undefined;
    let due = false;
    for (const deadline of deadlines) {
      if (deadline <= Date.now()) { deadlines.delete(deadline); due = true; }
    }
    if (due) void run(true);
    scheduleNextReview();
  }, Math.max(0, next - Date.now()));
  worker.attendanceReviewTimer.unref();
}

export function scheduleAttendanceReview(expiresAt: Date) {
  const deadline = expiresAt.getTime();
  if (!Number.isFinite(deadline)) return;
  startAttendanceWorker();
  worker.attendanceReviewDeadlines ??= new Set();
  worker.attendanceReviewDeadlines.add(deadline);
  scheduleNextReview();
}

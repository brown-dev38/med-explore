export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startAttendanceWorker } = await import("@/lib/attendance-worker");
    startAttendanceWorker();
  }
}

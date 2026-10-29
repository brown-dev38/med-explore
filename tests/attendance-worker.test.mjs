import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { loadTypeScript } from "./load-typescript.mjs";

test("the server worker runs without a page, starts only once and skips overlapping batches", async (t) => {
  let tick;
  let calls = 0;
  let finish;
  resetWorker(t);
  t.mock.method(globalThis, "setInterval", (callback, interval) => {
    assert.equal(interval, 15000);
    tick = callback;
    return { unref() {} };
  });
  const { startAttendanceWorker } = loadTypeScript("../lib/attendance-worker.ts", {
    "server-only": {}, "@/lib/attendance": { backfillAttendanceResults: () => { calls++; return new Promise((resolve) => { finish = resolve; }); } },
  });
  startAttendanceWorker();
  startAttendanceWorker();
  assert.equal(calls, 1);
  tick();
  assert.equal(calls, 1);
  finish(); await setImmediate();
  tick();
  assert.equal(calls, 2);
  finish(); await setImmediate();
});

function resetWorker(t) {
  for (const key of ["attendanceWorker", "attendanceWorkerRunning", "attendanceWorkerRerun", "attendanceReviewDeadlines", "attendanceReviewTimer", "attendanceNextReview"]) {
    const previous = globalThis[key];
    delete globalThis[key];
    t.after(() => previous === undefined ? delete globalThis[key] : globalThis[key] = previous);
  }
}

test("QR deadlines run autonomously, coalesce duplicates and keep later sessions scheduled", async (t) => {
  resetWorker(t);
  t.mock.timers.enable({ apis: ["Date"], now: 100000 });
  let calls = 0;
  let active;
  t.mock.method(globalThis, "setInterval", () => ({ unref() {} }));
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    active = { callback, delay, unref() {} }; return active;
  });
  t.mock.method(globalThis, "clearTimeout", () => { active = undefined; });
  const { scheduleAttendanceReview } = loadTypeScript("../lib/attendance-worker.ts", {
    "server-only": {}, "@/lib/attendance": { backfillAttendanceResults: async () => { calls++; return { processed: 0 }; } },
  });
  scheduleAttendanceReview(new Date(160000));
  await setImmediate();
  assert.equal(calls, 1, "startup catches missed deadlines");
  const firstTimer = active;
  scheduleAttendanceReview(new Date(160000));
  scheduleAttendanceReview(new Date(180000));
  assert.equal(active, firstTimer);
  assert.equal(active.delay, 60000);
  scheduleAttendanceReview(new Date(130000));
  assert.equal(active.delay, 30000);
  assert.equal(calls, 1, "scheduling does not award early");
  t.mock.timers.setTime(130000); active.callback(); await setImmediate();
  assert.equal(calls, 2);
  assert.equal(active.delay, 30000);
  t.mock.timers.setTime(160000); active.callback(); await setImmediate();
  assert.equal(calls, 3, "identical deadlines run once");
  assert.equal(active.delay, 20000);
  t.mock.timers.setTime(180000); active.callback(); await setImmediate();
  assert.equal(calls, 4);
  assert.equal(globalThis.attendanceReviewDeadlines.size, 0);
});

test("an expiry during an in-flight batch requests a fresh pass instead of losing the deadline", async (t) => {
  resetWorker(t);
  t.mock.timers.enable({ apis: ["Date"], now: 100000 });
  let calls = 0;
  let expire;
  let finish;
  t.mock.method(globalThis, "setInterval", () => ({ unref() {} }));
  t.mock.method(globalThis, "setTimeout", (callback) => { expire = callback; return { unref() {} }; });
  const { scheduleAttendanceReview } = loadTypeScript("../lib/attendance-worker.ts", {
    "server-only": {}, "@/lib/attendance": { backfillAttendanceResults: () => {
      calls++; return new Promise((resolve) => { finish = resolve; });
    } },
  });
  scheduleAttendanceReview(new Date(101000));
  t.mock.timers.setTime(101000); expire();
  assert.equal(calls, 1);
  finish({ processed: 0 }); await setImmediate();
  assert.equal(calls, 2);
  finish({ processed: 0 }); await setImmediate();
});

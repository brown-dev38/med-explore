import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { loadTypeScript } from "./load-typescript.mjs";
import { browser } from "./activity-live-harness.mjs";

const live = loadTypeScript("../lib/activity-live.ts");

test("visible participant views receive another device's check-in on the five-second poll", async (context) => {
  let rows = [];
  const reads = [];
  const page = browser(context, async (url, options) => {
    assert.equal(url, "/api/activities/4/participations");
    assert.equal(options.cache, "no-store");
    return Response.json({ success: true, data: rows });
  });
  const resource = live.createActivityResource("/api/activities/4/participations", (data) => reads.push(data), () => {});
  const stop = live.watchActivityData((force) => { void resource.refresh(force); }, 5000);
  await setImmediate();
  assert.deepEqual(reads, [[]]);
  assert.equal([...page.intervals.values()][0].ms, 5000);
  rows = [{ id: "9", attendance: [{ eventType: "CHECK_IN" }] }];
  await page.tick();
  assert.deepEqual(reads.at(-1), rows);
  stop(); resource.dispose();
  assert.equal(page.intervals.size, 0);
  assert.equal(page.timeouts.size, 0);
});

test("hidden or offline pages pause requests and refresh when visible or reconnected", async (context) => {
  let requests = 0;
  const page = browser(context, async () => { requests++; return Response.json({ success: true, data: [] }); });
  page.pageDocument.visibilityState = "hidden";
  const resource = live.createActivityResource("/api/activities", () => {}, () => {});
  const stop = live.watchActivityData((force) => { void resource.refresh(force); }, 10000);
  await page.tick();
  assert.equal(requests, 0);
  page.pageDocument.visibilityState = "visible";
  page.pageDocument.dispatchEvent(new Event("visibilitychange"));
  await setImmediate();
  assert.equal(requests, 1);
  navigator.onLine = false;
  await page.tick();
  assert.equal(requests, 1);
  navigator.onLine = true;
  page.pageWindow.dispatchEvent(new Event("online"));
  await setImmediate();
  assert.equal(requests, 2);
  stop(); resource.dispose();
});

test("polling never overlaps and a mutation supersedes an older in-flight response", async (context) => {
  const requests = [];
  browser(context, (_url, options) => new Promise((resolve) => requests.push({ resolve, signal: options.signal })));
  const data = [];
  const resource = live.createActivityResource("/api/activities", (value) => data.push(value), () => {});
  const first = resource.refresh();
  assert.equal(resource.refresh(), first);
  assert.equal(requests.length, 1);
  const latest = resource.refresh(true);
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(Response.json({ success: true, data: ["checked in"] }));
  await latest;
  requests[0].resolve(Response.json({ success: true, data: ["not registered"] }));
  await first;
  assert.deepEqual(data, [["checked in"]]);
  resource.dispose();
});

test("errors retain the last successful data, retry, and ignore responses after leaving a page", async (context) => {
  let response = () => Response.json({ success: true, data: ["registered"] });
  const page = browser(context, () => response());
  const data = [];
  const errors = [];
  const resource = live.createActivityResource("/api/activities", (value) => data.push(value), (failed) => errors.push(failed));
  await resource.refresh();
  for (const failure of [() => Promise.reject(new Error("offline")), () => new Response("failed", { status: 503 }), () => new Response("invalid json")]) {
    response = failure;
    assert.equal(await resource.refresh(), false);
    assert.deepEqual(data, [["registered"]]);
  }
  response = () => Response.json({ success: true, data: ["checked out"] });
  assert.equal(await resource.refresh(), true);
  assert.equal(errors.at(-1), false);
  let finish;
  response = () => new Promise((resolve) => { finish = resolve; });
  const pending = resource.refresh();
  resource.dispose();
  finish(Response.json({ success: true, data: ["late"] }));
  await pending;
  assert.deepEqual(data.at(-1), ["checked out"]);
  assert.equal(page.timeouts.size, 0);
});

test("a committed activity change refreshes visible views immediately and advances the route revision", async (context) => {
  browser(context, async () => Response.json({ success: true, data: [] }));
  const requests = [];
  const stop = live.watchActivityData((force) => requests.push(force));
  const before = live.getActivityRevision();
  live.notifyActivityUpdate();
  assert.equal(live.getActivityRevision(), before + 1);
  assert.deepEqual(requests, [false, true]);
  stop();
  live.notifyActivityUpdate();
  assert.equal(requests.length, 2);
});

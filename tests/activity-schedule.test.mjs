import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const validation = loadTypeScript("../lib/validation.ts");
const fixture = {
  id: 4n, academicYearId: 1n, organizerId: 7n, title: "Draft activity", description: null, location: null,
  startsAt: new Date("2026-11-01T02:00:00Z"), endsAt: new Date("2026-11-01T04:00:00Z"),
  minMinutes: 90, status: "DRAFT", createdAt: new Date("2026-10-19T00:00:00Z"),
};
const schedule = { startsAt: "2026-11-02T02:00:00.000Z", endsAt: "2026-11-02T04:00:00.000Z" };
const principal = (role) => ({ id: "7", roles: [role], permissions: role === "ORGANIZER" ? ["activity.manage"] : [] });

function routes(user = principal("ADMIN"), options = {}) {
  let current = { ...fixture, ...options.activity, status: options.status ?? "DRAFT" };
  const calls = [];
  const audits = [];
  const api = loadTypeScript("../app/api/activities/[id]/route.ts", {
    "@/lib/prisma": { prisma: { activity: { findUnique: async ({ where }) => {
      calls.push("find");
      return where.id === current.id ? { ...current } : null;
    } } } },
    "@/lib/dal": { getCurrentUser: async () => user },
    "@/lib/permissions": permissions, "@/lib/validation": validation,
    "@/lib/admin-deletion": { DeletionError: class extends Error {} },
    "@/lib/api": loadTypeScript("../lib/api.ts"),
    "@/lib/activities": loadTypeScript("../lib/activities.ts", { "server-only": {} }),
    "@/lib/attendance": {
      AttendanceError: class extends Error {
        constructor(message, status) { super(message); this.status = status; }
      },
      attendanceTransaction: async (work) => {
        options.beforeTransaction?.();
        return work({
        activity: { update: async ({ where, data }) => {
          if (options.concurrentChange) current = { ...current, ...options.concurrentChange };
          const matches = Object.entries(where).every(([key, value]) => value instanceof Date
            ? current[key].getTime() === value.getTime() : current[key] === value);
          if (!matches) throw Object.assign(new Error("Record no longer matches"), { code: "P2025" });
          calls.push("update");
          current = { ...current, ...data };
          return { ...current };
        } },
        auditLog: { create: async ({ data }) => { audits.push(data); } },
        });
      },
      recalculateActivityAttendance: async () => { calls.push("recalculate"); },
    },
  });
  return {
    calls, audits, current: () => current,
    patch: (body = schedule, id = "4") => api.PATCH(new Request("https://example.test/api/activities/4", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
    }), { params: Promise.resolve({ id }) }),
  };
}

test("publication rejects drafts at or after their end time without updating status or attendance", async (context) => {
  const now = new Date("2026-11-01T04:00:00Z");
  context.mock.timers.enable({ apis: ["Date"], now });
  for (const role of ["ADMIN", "ORGANIZER"]) {
    for (const endsAt of [now, new Date(now.getTime() - 1)]) {
      const api = routes(principal(role), { activity: { endsAt } });
      const response = await api.patch({ status: "PUBLISHED" });
      assert.equal(response.status, 409);
      assert.match((await response.json()).message, /กรุณาแก้ไขเวลา/);
      assert.equal(api.current().status, "DRAFT");
      assert.deepEqual(api.calls, ["find"]);
      assert.equal(api.audits.length, 0);
    }
  }
});

test("an expired draft can be rescheduled and then published", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T05:00:00Z") });
  for (const role of ["ADMIN", "ORGANIZER"]) {
    const api = routes(principal(role));
    assert.equal((await api.patch(schedule)).status, 200);
    assert.equal(api.current().status, "DRAFT");
    assert.equal((await api.patch({ status: "PUBLISHED" })).status, 200);
    assert.equal(api.current().status, "PUBLISHED");
  }
});

test("a running draft remains publishable until its exact end time", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T03:59:59.999Z") });
  const api = routes();
  assert.equal((await api.patch({ status: "PUBLISHED" })).status, 200);
  assert.equal(api.current().status, "PUBLISHED");
});

test("publication rechecks expiry when the transaction begins", async (context) => {
  const now = new Date("2026-11-01T03:59:59.999Z");
  context.mock.timers.enable({ apis: ["Date"], now });
  const api = routes(principal("ADMIN"), { beforeTransaction: () => context.mock.timers.setTime(now.getTime() + 1) });
  assert.equal((await api.patch({ status: "PUBLISHED" })).status, 409);
  assert.equal(api.current().status, "DRAFT");
  assert.deepEqual(api.calls, ["find"]);
});

test("a concurrent schedule or status change prevents publication using stale timing", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T03:00:00Z") });
  for (const concurrentChange of [
    { endsAt: new Date("2026-11-01T02:30:00Z") }, { status: "CANCELLED" },
  ]) {
    const api = routes(principal("ADMIN"), { concurrentChange });
    assert.equal((await api.patch({ status: "PUBLISHED" })).status, 409);
    assert.notEqual(api.current().status, "PUBLISHED");
    assert.ok(!api.calls.includes("update"));
    assert.equal(api.audits.length, 0);
  }
});

test("ADMIN and ORGANIZER can edit draft start/end times, with old and new dates in the audit trail", async () => {
  for (const role of ["ADMIN", "ORGANIZER"]) {
    const api = routes(principal(role));
    const response = await api.patch();
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.startsAt, schedule.startsAt);
    assert.equal(data.endsAt, schedule.endsAt);
    assert.equal(data.status, "DRAFT");
    assert.deepEqual(api.calls, ["find", "update"]);
    assert.deepEqual(api.audits[0].details, {
      title: fixture.title, status: "DRAFT",
      previousStartsAt: fixture.startsAt.toISOString(), previousEndsAt: fixture.endsAt.toISOString(), ...schedule,
    });
  }
});

test("published, completed and cancelled schedules cannot be changed, including a simultaneous draft status override", async () => {
  for (const role of ["ADMIN", "ORGANIZER"]) {
    for (const status of ["PUBLISHED", "COMPLETED", "CANCELLED"]) {
      for (const body of [schedule, { startsAt: schedule.startsAt }, { endsAt: schedule.endsAt }, { ...schedule, status: "DRAFT" }]) {
        const api = routes(principal(role), { status });
        assert.equal((await api.patch(body)).status, 409);
        assert.equal(api.current().status, status);
        assert.deepEqual(api.calls, ["find"]);
        assert.equal(api.audits.length, 0);
      }
    }
  }
});

test("guests and students cannot edit schedules, including a student with activity.manage", async () => {
  for (const user of [null, principal("STUDENT"), { id: "9", roles: ["STUDENT"], permissions: ["activity.manage"] }]) {
    for (const body of [schedule]) {
      const api = routes(user);
      assert.equal((await api.patch(body)).status, user ? 403 : 401);
      assert.ok(!api.calls.includes("update"));
      assert.equal(api.audits.length, 0);
      if (!user || user.permissions.length === 0) assert.equal(api.calls.length, 0);
    }
  }
});

test("invalid dates, equal or reversed intervals and invalid partial edits never write", async () => {
  for (const body of [
    "{", { startsAt: "invalid" }, { endsAt: "invalid" },
    { startsAt: schedule.startsAt, endsAt: schedule.startsAt },
    { startsAt: schedule.endsAt, endsAt: schedule.startsAt },
    { startsAt: "2026-11-01T05:00:00Z" }, { endsAt: "2026-11-01T01:00:00Z" },
    { minMinutes: 0 }, { minMinutes: -1 }, { minMinutes: 1.5 }, { minMinutes: 1441 }, { minMinutes: "invalid" },
  ]) {
    const api = routes();
    assert.equal((await api.patch(body)).status, 400);
    assert.ok(!api.calls.includes("update"));
    assert.equal(api.audits.length, 0);
  }
});

test("partial edits and activities crossing midnight preserve a valid full interval", async () => {
  for (const body of [
    { startsAt: "2026-11-01T01:00:00Z" },
    { endsAt: "2026-11-01T05:00:00Z" },
    { startsAt: "2026-11-01T23:00:00+07:00", endsAt: "2026-11-02T01:00:00+07:00" },
  ]) {
    const api = routes();
    assert.equal((await api.patch(body)).status, 200);
    assert.equal(api.current().startsAt.toISOString(), body.startsAt ? new Date(body.startsAt).toISOString() : fixture.startsAt.toISOString());
    assert.equal(api.current().endsAt.toISOString(), body.endsAt ? new Date(body.endsAt).toISOString() : fixture.endsAt.toISOString());
  }
});

test("a concurrent publication, schedule change prevents saving against stale validation", async () => {
  for (const concurrentChange of [
    { status: "PUBLISHED" }, { status: "COMPLETED" },
    { startsAt: new Date("2026-11-01T01:30:00Z") }, { endsAt: new Date("2026-11-01T03:30:00Z") },
  ]) {
    for (const body of [schedule]) {
      const api = routes(principal("ADMIN"), { concurrentChange });
      assert.equal((await api.patch(body)).status, 409);
      assert.ok(!api.calls.includes("update"));
      assert.equal(api.audits.length, 0);
    }
  }
});

test("status-only publishing still works and unknown activities return 404", async () => {
  const api = routes();
  assert.equal((await api.patch({ status: "PUBLISHED" })).status, 200);
  assert.equal(api.current().status, "PUBLISHED");
  assert.ok(api.calls.includes("recalculate"));
  assert.equal((await routes().patch(schedule, "missing")).status, 404);
});

function editor(status = "DRAFT", changes = {}) {
  let cursor = 0;
  let refreshes = 0;
  let conflicts = 0;
  const state = [];
  const saved = [];
  const messages = [];
  const activity = { ...fixture, id: "4", academicYearId: "1", organizerId: "7", status,
    startsAt: fixture.startsAt.toISOString(), endsAt: fixture.endsAt.toISOString(), createdAt: fixture.createdAt.toISOString(), ...changes };
  const ui = Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"].map((name) => [name, name]));
  const { ActivityScheduleEditor } = loadTypeScript("../components/activity-schedule-editor.tsx", {
    react: {
      useId: () => "schedule-test",
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
      },
    },
    "next/navigation": { useRouter: () => ({ refresh() { refreshes++; } }) },
    "lucide-react": {}, "sonner": { toast: { success: (text) => messages.push(text), error: (text) => messages.push(text) } },
    "@/lib/datetime": loadTypeScript("../lib/datetime.ts"),
    "@/components/ui/button": { Button: "button" }, "@/components/ui/input": { Input: "input" },
    "@/components/ui/label": { Label: "label" }, "@/components/ui/dialog": ui,
  });
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  }
  function render() {
    cursor = 0;
    return nodes(ActivityScheduleEditor({ activity, onSaved: (value) => saved.push(value), onConflict: () => { conflicts++; } }));
  }
  function open() { render().find((node) => node.type === "button").props.onClick(); return render(); }
  function fill(startsAt, endsAt) {
    render().find((node) => node.type === "input" && node.props.id.endsWith("-start")).props.onChange({ target: { value: startsAt } });
    render().find((node) => node.type === "input" && node.props.id.endsWith("-end")).props.onChange({ target: { value: endsAt } });
  }
  return { render, open, fill, saved, messages, refreshes: () => refreshes, conflicts: () => conflicts,
    submit: () => render().find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }),
  };
}

test("the schedule editor is absent for every non-draft status", () => {
  for (const status of ["PUBLISHED", "COMPLETED", "CANCELLED"]) assert.deepEqual(editor(status).render(), []);
});

test("opening pre-fills timing and saving submits local times as ISO dates without any minimum-minute field", async (context) => {
  const ui = editor();
  const inputs = ui.open().filter((node) => node.type === "input");
  assert.equal(new Date(inputs[0].props.value).getTime(), fixture.startsAt.getTime());
  assert.equal(new Date(inputs[1].props.value).getTime(), fixture.endsAt.getTime());
  assert.equal(inputs.length, 2);
  ui.fill("2026-11-03T23:00", "2026-11-04T01:00", "60");
  const updated = { id: "4", startsAt: new Date("2026-11-03T23:00").toISOString(), endsAt: new Date("2026-11-04T01:00").toISOString(), minMinutes: 60 };
  context.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, "/api/activities/4");
    assert.equal(request.method, "PATCH");
    assert.deepEqual(JSON.parse(request.body), { startsAt: updated.startsAt, endsAt: updated.endsAt });
    return Response.json({ success: true, data: updated });
  });
  await ui.submit();
  assert.deepEqual(ui.saved, [updated]);
  assert.equal(ui.refreshes(), 1);
  assert.equal(ui.render().find((node) => node.type === "Dialog").props.open, false);
});

test("invalid editor intervals do not send requests and conflicts close and refresh stale activity data", async (context) => {
  const ui = editor();
  ui.open();
  const request = context.mock.method(globalThis, "fetch", async () => Response.json({ message: "กิจกรรมเปิดรับลงทะเบียนแล้ว" }, { status: 409 }));
  for (const [start, end] of [["", ""], ["2026-11-03T09:00", "2026-11-03T09:00"], ["2026-11-03T10:00", "2026-11-03T09:00"]]) {
    ui.fill(start, end);
    await ui.submit();
  }
  assert.equal(request.mock.callCount(), 0);
  ui.fill("2026-11-03T09:00", "2026-11-03T11:00", "60");
  await ui.submit();
  assert.equal(request.mock.callCount(), 1);
  assert.equal(ui.saved.length, 0);
  assert.equal(ui.conflicts(), 1);
  assert.equal(ui.refreshes(), 1);
  assert.equal(ui.render().find((node) => node.type === "Dialog").props.open, false);
});

test("saving unchanged times preserves original timestamp seconds", async (context) => {
  const dates = { startsAt: "2026-11-01T02:00:37.000Z", endsAt: "2026-11-01T04:00:48.000Z" };
  const ui = editor("DRAFT", dates);
  const inputs = ui.open().filter((node) => node.type === "input");
  ui.fill(inputs[0].props.value, inputs[1].props.value, "75");
  const request = context.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { ...dates });
    return Response.json({ data: { id: "4", ...dates, minMinutes: 75 } });
  });
  await ui.submit();
  assert.equal(request.mock.callCount(), 1);
  assert.equal(ui.saved.length, 1);
});

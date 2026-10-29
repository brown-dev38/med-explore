import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const validation = loadTypeScript("../lib/validation.ts");
const schema = loadTypeScript("../lib/participant-import-schema.ts", { "@/lib/green-star-import-schema": loadTypeScript("../lib/green-star-import-schema.ts") });
const studentWhere = loadTypeScript("../lib/activity-participants.ts", { "server-only": {}, "@/lib/prisma": {}, "@/lib/attendance": {}, "@/lib/attendance-results": {} }).participantStudentWhere;
const requestId = "ab664954-5d9b-44b0-b101-03c9e32f65f0";
const importInput = { target: { mode: "participants", academicYearId: "2", activityId: "4" }, studentCodes: ["001234"], requestId };

function setup(principal = { id: "7", roles: ["ADMIN"], permissions: [] }) {
  const calls = [];
  class AttendanceError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const mocks = {
    "@/lib/dal": { getCurrentUser: async () => principal }, "@/lib/permissions": loadTypeScript("../lib/permissions.ts"),
    "@/lib/api": loadTypeScript("../lib/api.ts"), "@/lib/validation": validation, "@/lib/attendance": { AttendanceError,
      backfillAttendanceResults: async (...args) => { calls.push({ kind: "settle", args }); },
    },
    "@/lib/request-origin": loadTypeScript("../lib/request-origin.ts"),
    "@/lib/participant-import-schema": schema, "@/lib/green-star-import-schema": loadTypeScript("../lib/green-star-import-schema.ts"),
    "@/lib/student-excel": { StudentExcelError: class extends Error {}, readStudentExcel: async () => { calls.push({ kind: "read" }); return [{ row: 1, studentCode: "001234", status: "ready" }]; } },
    "@/lib/activity-participants": { participantStudentWhere: studentWhere,
      addParticipantsAndAward: async (...args) => { calls.push({ kind: "add", args }); return { added: 1, imported: 1, awarded: 1, replayed: false }; },
      previewParticipantImport: async (...args) => { calls.push({ kind: "preview", args }); return args[1]; },
      cancelParticipantYellowStar: async (...args) => { calls.push({ kind: "cancel", args }); return { cancelled: true }; },
    },
    "@/lib/prisma": { prisma: {
      activity: { findUnique: async () => ({ id: 4n, status: "PUBLISHED" }) },
      user: { findMany: async (query) => { calls.push({ kind: "candidates", query }); return []; } },
      participation: { findMany: async () => { calls.push({ kind: "list" }); return []; }, findUnique: async () => null, create: async ({ data }) => { calls.push({ kind: "self-registration", data }); } },
    } },
    "@/lib/audit": { recordAudit: async () => {} }, "@/lib/participations": { toParticipationDto: (record) => record },
  };
  const collection = loadTypeScript("../app/api/activities/[id]/participants/route.ts", mocks);
  const candidates = loadTypeScript("../app/api/activities/[id]/participants/candidates/route.ts", mocks);
  const imports = loadTypeScript("../app/api/activities/[id]/participants/import/route.ts", mocks);
  const registration = loadTypeScript("../app/api/activities/[id]/participations/route.ts", mocks);
  const revoke = loadTypeScript("../app/api/activities/[id]/participants/[participationId]/yellow-star/route.ts", mocks);
  const context = { params: Promise.resolve({ id: "4" }) };
  const jsonRequest = (body, method = "POST", origin = "https://example.test") => new Request("https://example.test/api/activities/4/participants/import", { method, headers: { Origin: origin }, body: JSON.stringify(body) });
  return { calls,
    list: () => registration.GET(new Request("https://example.test/api/activities/4/participations"), context),
    add: (body = { userIds: ["42"], requestId }) => collection.POST(jsonRequest(body), context),
    candidates: () => candidates.GET(new Request("https://example.test/api/activities/4/participants/candidates?q=Student"), context),
    confirm: (body = importInput, origin) => imports.PUT(jsonRequest(body, "PUT", origin), context),
    preview: (filename = "students.xlsx", origin = "https://example.test") => {
      const body = new FormData(); body.set("academicYearId", "2"); body.set("file", new File(["excel"], filename));
      return imports.POST(new Request("https://example.test/api/activities/4/participants/import", { method: "POST", headers: { Origin: origin }, body }), context);
    },
    register: (body = {}) => registration.POST(jsonRequest(body), context),
    cancel: (participationId = "9", id = "4") => revoke.DELETE(new Request("https://example.test/api/activities/4/participants/9/yellow-star", { method: "DELETE" }), { params: Promise.resolve({ id, participationId }) }),
  };
}

test("only ADMIN and authorized ORGANIZER can add or import activity participants", async () => {
  for (const principal of [null, { id: "7", roles: ["STUDENT"], permissions: ["activity.manage"] }, { id: "7", roles: ["ORGANIZER"], permissions: [] }]) {
    const api = setup(principal);
    for (const method of ["add", "candidates", "preview", "confirm", "cancel"]) assert.equal((await api[method]()).status, principal ? 403 : 401);
    assert.equal(api.calls.length, 0);
  }
  const api = setup({ id: "7", roles: ["ORGANIZER"], permissions: ["activity.manage"] });
  assert.equal((await api.add({ userIds: ["42"], requestId, points: 999 })).status, 201);
  assert.deepEqual(api.calls[0].args, [4n, 7n, { userIds: ["42"], requestId }]);
});

test("live participant reads settle due awards for the requested activity before returning the list", async () => {
  for (const principal of [{ id: "7", roles: ["ADMIN"], permissions: [] }, { id: "7", roles: ["ORGANIZER"], permissions: ["activity.manage"] }]) {
    const api = setup(principal);
    assert.equal((await api.list()).status, 200);
    assert.deepEqual(api.calls, [{ kind: "settle", args: [undefined, 4n] }, { kind: "list" }]);
  }
  for (const principal of [null, { id: "42", roles: ["STUDENT"], permissions: [] }]) {
    const api = setup(principal);
    assert.equal((await api.list()).status, principal ? 403 : 401);
    assert.deepEqual(api.calls, []);
  }
});

test("candidate lookup requires an active STUDENT and excludes ADMIN and ORGANIZER roles", async () => {
  const api = setup();
  assert.equal((await api.candidates()).status, 200);
  const query = api.calls.find((call) => call.kind === "candidates").query;
  assert.equal(query.where.isActive, true);
  assert.deepEqual(query.where.userRoles.some, { role: { name: "STUDENT" } });
  assert.deepEqual(query.where.userRoles.none, { role: { name: { in: ["ADMIN", "ORGANIZER"] } } });
});

test("Excel upload only previews; confirmation binds the year/activity and ignores client-supplied points", async () => {
  const api = setup();
  assert.equal((await api.preview()).status, 200);
  assert.deepEqual(api.calls.map((call) => call.kind), ["read", "preview"]);
  assert.equal((await api.confirm({ ...importInput, points: 999 })).status, 201);
  assert.deepEqual(api.calls.at(-1).args, [4n, 7n, { studentCodes: ["001234"], requestId, academicYearId: "2" }]);
  assert.equal((await api.confirm({ ...importInput, target: { ...importInput.target, activityId: "5" } })).status, 400);
});

test("invalid IDs, oversized batches, unsupported files and cross-origin imports never reach the write service", async () => {
  const api = setup();
  for (const userIds of [[], ["invalid"], ["0"], ["9223372036854775808"], Array(501).fill("42")]) assert.equal((await api.add({ userIds })).status, 400);
  assert.equal((await api.preview("students.xls")).status, 400);
  assert.equal((await api.preview("students.xlsx", "https://attacker.test")).status, 403);
  assert.equal((await api.confirm(importInput, "https://attacker.test")).status, 403);
  assert.equal(api.calls.length, 0);
});

test("self-registration stays pending while staff single-student additions use immediate awards", async () => {
  const self = setup({ id: "42", roles: ["STUDENT"], permissions: [] });
  assert.equal((await self.register()).status, 201);
  assert.equal(self.calls[0].kind, "self-registration");
  assert.equal(self.calls[0].data.eligibilityStatus, "PENDING");
  assert.equal(self.calls.some((call) => call.kind === "add"), false);
  const staff = setup();
  assert.equal((await staff.register({ userId: "42", points: 999 })).status, 201);
  assert.deepEqual(staff.calls[0].args, [4n, 7n, { userIds: ["42"], requestId: undefined }]);
});

test("yellow-star cancellation binds both the activity and participation IDs and rejects malformed IDs", async () => {
  const api = setup({ id: "7", roles: ["ORGANIZER"], permissions: ["activity.manage"] });
  const response = await api.cancel();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { cancelled: true });
  assert.deepEqual(api.calls[0], { kind: "cancel", args: [4n, 9n, 7n] });
  for (const [participationId, activityId] of [["0", "4"], ["invalid", "4"], ["9", "9223372036854775808"]]) {
    assert.equal((await api.cancel(participationId, activityId)).status, 404);
  }
  assert.equal(api.calls.length, 1);
});

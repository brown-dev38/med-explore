import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const schema = loadTypeScript("../lib/green-star-import-schema.ts");
const input = { target: { mode: "work", academicYearId: "2" }, studentCodes: ["001234"], description: "Help prepare room", requestId: "7a095e62-eaf5-4b0b-8dd1-938f019787d0" };

function routes({ actor = { id: "7", roles: ["ADMIN"] }, failure } = {}) {
  const calls = [];
  class ImportError extends Error { constructor(message, status) { super(message); this.status = status; } }
  class ExcelError extends Error {}
  const check = () => { if (failure) throw new ImportError("Import blocked", failure); };
  const route = loadTypeScript("../app/api/green-stars/import/route.ts", {
    "@/lib/dal": { getCurrentUser: async () => actor },
    "@/lib/permissions": loadTypeScript("../lib/permissions.ts"),
    "@/lib/api": loadTypeScript("../lib/api.ts"),
    "@/lib/request-origin": loadTypeScript("../lib/request-origin.ts"),
    "@/lib/green-star-import-schema": schema,
    "@/lib/student-excel": { StudentExcelError: ExcelError, readStudentExcel: async (buffer) => { calls.push({ type: "read", bytes: buffer.byteLength }); return [{ row: 2, studentCode: "001234", status: "ready" }]; } },
    "@/lib/green-star-import": { GreenStarImportError: ImportError,
      previewGreenStarImport: async (target, rows) => { check(); calls.push({ type: "preview", target, rows }); return rows; },
      confirmGreenStarImport: async (...args) => { check(); calls.push({ type: "confirm", args }); return { imported: 1, replayed: false }; },
    },
  });
  return { calls,
    preview: ({ target = input.target, filename = "students.xlsx", contents = "excel", origin = "https://example.test", includeFile = true } = {}) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(target)) form.set(key, value);
      if (includeFile) form.set("file", new File([contents], filename));
      return route.POST(new Request("https://example.test/api/green-stars/import", { method: "POST", headers: { Origin: origin }, body: form }));
    },
    confirm: (body = input, origin = "https://example.test") => route.PUT(new Request("https://example.test/api/green-stars/import", { method: "PUT", headers: { Origin: origin }, body: JSON.stringify(body) })),
  };
}

test("Excel previews and confirmations require staff authorization and the browser's same origin", async () => {
  for (const actor of [null, { id: "7", roles: ["STUDENT"], permissions: ["activity.manage"] }, { id: "7", roles: ["UNKNOWN"] }]) {
    const api = routes({ actor });
    assert.equal((await api.preview()).status, actor ? 403 : 401);
    assert.equal((await api.confirm()).status, actor ? 403 : 401);
    assert.deepEqual(api.calls, []);
  }
  for (const origin of ["", "https://attacker.test"]) {
    const api = routes();
    assert.equal((await api.preview({ origin })).status, 403);
    assert.equal((await api.confirm(input, origin)).status, 403);
    assert.deepEqual(api.calls, []);
  }
});

test("a file preview returns rows with no writes; only confirmation imports the validated codes", async () => {
  for (const role of ["ADMIN", "ORGANIZER"]) {
    const api = routes({ actor: { id: "7", roles: [role] } });
    const preview = await api.preview();
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("Cache-Control"), "private, no-store");
    assert.equal((await preview.json()).data.rows[0].studentCode, "001234");
    assert.ok(!api.calls.some((call) => call.type === "confirm"));
    assert.equal((await api.confirm({ ...input, points: 999, actorId: "999" })).status, 201);
    assert.deepEqual(api.calls.find((call) => call.type === "confirm").args, [input, 7n]);
  }
});

test("activity imports require activity management permission in addition to staff role", async () => {
  const target = { mode: "activity", academicYearId: "2", activityId: "4" };
  for (const allowed of [false, true]) {
    const api = routes({ actor: { id: "7", roles: ["ORGANIZER"], permissions: allowed ? ["activity.manage"] : [] } });
    assert.equal((await api.preview({ target })).status, allowed ? 200 : 403);
    assert.equal((await api.confirm({ ...input, target })).status, allowed ? 201 : 403);
  }
});

test("missing files, unsupported formats, empty uploads, bad targets and invalid confirmations never reach import", async () => {
  for (const options of [{ includeFile: false }, { filename: "students.xls" }, { contents: "" }, { target: { mode: "work", academicYearId: "bad" } }]) {
    const api = routes();
    assert.equal((await api.preview(options)).status, 400);
    assert.deepEqual(api.calls, []);
  }
  for (const changes of [{ studentCodes: [] }, { studentCodes: ["001234", "001234"] }, { requestId: "bad" }, { description: "" }]) {
    const api = routes();
    assert.equal((await api.confirm({ ...input, ...changes })).status, 400);
    assert.deepEqual(api.calls, []);
  }
  assert.equal((await routes({ failure: 409 }).confirm()).status, 409);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const validation = loadTypeScript("../lib/validation.ts");
const year = { id: 1n, code: "2569", startsOn: new Date("2026-01-01"), endsOn: new Date("2026-12-31"), status: "DRAFT", createdAt: new Date("2026-01-01") };
const principal = (role) => ({ id: "7", name: "Organizer", roles: [role], permissions: [] });

function routes(user) {
  const calls = [];
  let current = { ...year };
  const academicYear = {
    findMany: async () => { calls.push("list"); return [current]; },
    findUnique: async ({ where }) => { calls.push("find"); return where.id === 1n || where.code === current.code ? current : null; },
    create: async ({ data }) => { calls.push("create"); return { ...year, ...data }; },
    update: async ({ data }) => { calls.push("update"); current = { ...current, ...data }; return current; },
    updateMany: async () => { calls.push("closePrevious"); return { count: 1 }; },
  };
  const prisma = { academicYear, $transaction: (fn) => fn({ academicYear }) };
  const mocks = {
    "@/lib/prisma": { prisma }, "@/lib/dal": { getCurrentUser: async () => user },
    "@/lib/permissions": permissions, "@/lib/validation": validation,
    "@/lib/audit": { recordAudit: async () => {} },
    "@/lib/academic-years": loadTypeScript("../lib/academic-years.ts", { "server-only": {}, "@/lib/prisma": { prisma } }),
    "@/lib/api": loadTypeScript("../lib/api.ts"),
    "@/lib/admin-deletion": { DeletionError: class extends Error {}, deleteAcademicYear: async () => { calls.push("delete"); return { id: "1" }; } },
  };
  const collection = loadTypeScript("../app/api/academic-years/route.ts", mocks);
  const detail = loadTypeScript("../app/api/academic-years/[id]/route.ts", mocks);
  const context = () => ({ params: Promise.resolve({ id: "1" }) });
  return {
    calls,
    list: () => collection.GET(new Request("https://example.test/api/academic-years")),
    get: () => detail.GET(new Request("https://example.test/api/academic-years/1"), context()),
    create: () => collection.POST(new Request("https://example.test/api/academic-years", { method: "POST", body: JSON.stringify({ code: "2570", startsOn: "2027-01-01", endsOn: "2027-12-31" }) })),
    patch: (body) => detail.PATCH(new Request("https://example.test/api/academic-years/1", { method: "PATCH", body: JSON.stringify(body) }), context()),
    remove: () => detail.DELETE(new Request("https://example.test/api/academic-years/1?role=ADMIN", { method: "DELETE" }), context()),
  };
}

test("organizers with existing sessions can read, create, edit and change year status, but cannot delete", async () => {
  const api = routes(principal("ORGANIZER"));
  assert.equal((await api.list()).status, 200);
  assert.equal((await api.get()).status, 200);
  assert.equal((await api.create()).status, 201);
  assert.equal((await api.patch({ code: "2569-updated" })).status, 200);
  for (const status of ["ACTIVE", "CLOSED", "DRAFT"]) {
    const response = await api.patch({ status });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.status, status);
  }
  assert.ok(api.calls.includes("closePrevious"));
  assert.equal((await api.remove()).status, 403);
  assert.ok(!api.calls.includes("delete"));
});

test("students and unauthenticated callers fail before academic-year queries or writes", async () => {
  for (const user of [principal("STUDENT"), null]) {
    const api = routes(user);
    for (const response of [await api.list(), await api.get(), await api.create(), await api.patch({ status: "ACTIVE" }), await api.remove()]) {
      assert.equal(response.status, user ? 403 : 401);
    }
    assert.deepEqual(api.calls, []);
  }
});

test("ADMIN retains deletion while management permission cannot grant deletion to ORGANIZER", async () => {
  const admin = routes(principal("ADMIN"));
  assert.equal((await admin.remove()).status, 200);
  assert.deepEqual(admin.calls, ["delete"]);
  const organizer = routes({ ...principal("ORGANIZER"), permissions: ["academic_year.manage"] });
  assert.equal((await organizer.remove()).status, 403);
  assert.deepEqual(organizer.calls, []);
});

test("organizer pages require a staff role and organizer sign-in lands on the overview", async () => {
  for (const role of ["ADMIN", "ORGANIZER", "STUDENT", "UNKNOWN", null]) {
    const api = loadTypeScript("../lib/dal.ts", {
      "server-only": {}, react: { cache: (fn) => fn },
      "next/navigation": { redirect: (path) => { throw new Error(`REDIRECT:${path}`); } },
      "@/lib/auth": { auth: async () => role ? { user: principal(role) } : null },
      "@/lib/permissions": permissions,
      "@/lib/session-notices": loadTypeScript("../lib/session-notices.ts"),
    });
    if (["ADMIN", "ORGANIZER"].includes(role)) assert.equal((await api.requireOrganizerAccess()).id, "7");
    else await assert.rejects(api.requireOrganizerAccess(), { message: `REDIRECT:${role ? "/forbidden" : "/login"}` });
  }
  assert.equal(permissions.dashboardPathFor(principal("ORGANIZER")), "/organizer");
  assert.equal(permissions.dashboardPathFor(principal("ADMIN")), "/admin");
  assert.equal(permissions.dashboardPathFor(principal("STUDENT")), "/dashboard");
});

function allNodes(node) {
  if (Array.isArray(node)) return node.flatMap(allNodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...allNodes(node.props?.children)];
}

test("academic-year manager hides deletion for organizers and retains normal management controls", () => {
  const mocks = {
    react: { useState: (initial) => [initial, () => {}] },
    "next/navigation": { useRouter: () => ({ refresh: () => {} }) }, sonner: { toast: {} }, "lucide-react": {},
  };
  for (const [module, exports] of [
    ["button", ["Button"]], ["badge", ["Badge"]], ["input", ["Input"]], ["label", ["Label"]],
    ["card", ["Card", "CardContent", "CardDescription", "CardHeader", "CardTitle"]],
    ["table", ["Table", "TableBody", "TableCell", "TableHead", "TableHeader", "TableRow"]],
    ["dialog", ["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"]],
  ]) mocks[`@/components/ui/${module}`] = Object.fromEntries(exports.map((name) => [name, name]));
  mocks["@/components/confirm-dialog"] = { ConfirmDialog: "ConfirmDialog" };
  const { AcademicYearManager } = loadTypeScript("../components/academic-year-manager.tsx", mocks);
  for (const canDelete of [false, true, undefined]) {
    const nodes = allNodes(AcademicYearManager({ initialYears: [{ ...year, id: "1", startsOn: "2026-01-01", endsOn: "2026-12-31" }], canDelete }));
    const buttons = nodes.filter((node) => node.type === "Button");
    assert.equal(buttons.filter((node) => node.props.variant === "destructive").length, canDelete ? 1 : 0);
    assert.ok(buttons.some((node) => node.props.children?.includes?.("เพิ่มปีการศึกษา")));
    assert.ok(buttons.some((node) => node.props.children?.includes?.("แก้ไข")));
    assert.ok(buttons.some((node) => node.props.children?.includes?.("เปิดใช้งาน")));
  }
});

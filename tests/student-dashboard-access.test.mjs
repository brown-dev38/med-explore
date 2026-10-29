import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const stop = (path) => { throw new Error(`REDIRECT:${path}`); };
const student = { id: 42n, username: "student42", firstname: "Student", lastname: "Forty Two", studentCode: "690042" };
const actor = (role) => ({ id: "7", name: "Viewer", roles: [role], permissions: [] });

function context(user, result = student) {
  const queries = [];
  const api = loadTypeScript("../lib/student-dashboard.ts", {
    "server-only": {}, react: { cache: (fn) => fn },
    "next/navigation": { redirect: stop, notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/dal": { requireAuth: async () => user ?? stop("/login") },
    "@/lib/permissions": permissions,
    "@/lib/prisma": { prisma: { user: { findFirst: async (query) => { queries.push(query); return result; } } } },
  });
  return { ...api, queries };
}

test("only students can open their own dashboard; staff are sent to their workspace", async () => {
  const api = context(actor("STUDENT"));
  const own = await api.getStudentDashboardContext();
  assert.equal(own.user.id, "7");
  assert.equal(own.basePath, "/dashboard");
  assert.equal(own.readOnly, false);
  for (const [role, path] of [["ADMIN", "/admin"], ["ORGANIZER", "/organizer"], ["UNKNOWN", "/forbidden"]]) {
    await assert.rejects(context(actor(role)).getStudentDashboardContext(), { message: `REDIRECT:${path}` });
  }
  await assert.rejects(context(null).getStudentDashboardContext(), { message: "REDIRECT:/login" });
});

test("ADMIN and ORGANIZER view the selected student's identity through their own workspace", async () => {
  for (const [role, area] of [["ADMIN", "admin"], ["ORGANIZER", "organizer"], ["ADMIN", "organizer"]]) {
    const api = context(actor(role));
    const viewed = await api.getStudentDashboardContext({ area, id: "42" });
    assert.equal(viewed.user.id, "42");
    assert.equal(viewed.user.name, "Student Forty Two");
    assert.equal(viewed.user.studentCode, "690042");
    assert.equal(viewed.readOnly, true);
    assert.equal(viewed.basePath, `/${area}/students/42/dashboard`);
    assert.deepEqual(api.queries[0].where, { id: 42n, userRoles: { some: { role: { name: "STUDENT" } } } });
    assert.equal(api.queries[0].select.passwordHash, undefined);
  }
});

test("student IDs never grant access: students, unknown roles and unauthenticated users fail before any query", async () => {
  for (const area of ["admin", "organizer"]) {
    for (const user of [actor("STUDENT"), actor("UNKNOWN"), { ...actor("UNKNOWN"), permissions: ["activity.manage"] }, null]) {
      const api = context(user);
      await assert.rejects(api.getStudentDashboardContext({ area, id: "42" }), { message: `REDIRECT:${user ? "/forbidden" : "/login"}` });
      await assert.rejects(api.requireStudentViewer(area));
      assert.equal(api.queries.length, 0);
    }
  }
  const organizer = context(actor("ORGANIZER"));
  await assert.rejects(organizer.getStudentDashboardContext({ area: "admin", id: "42" }), { message: "REDIRECT:/forbidden" });
  assert.equal(organizer.queries.length, 0);
});

test("invalid, missing and nonstudent targets return 404", async () => {
  for (const id of ["", "0", "-1", "abc", "1.5", "1e2", "01", "9223372036854775808", "9".repeat(100)]) {
    const api = context(actor("ADMIN"));
    await assert.rejects(api.getStudentDashboardContext({ area: "admin", id }), { message: "NOT_FOUND" });
    assert.equal(api.queries.length, 0);
  }
  await assert.rejects(context(actor("ADMIN"), null).getStudentDashboardContext({ area: "admin", id: "99" }), { message: "NOT_FOUND" });
});

test("proxy blocks every direct student dashboard path for staff and leaves student access intact", async () => {
  for (const role of ["ADMIN", "ORGANIZER", "STUDENT", "UNKNOWN", null]) {
    const { proxy } = loadTypeScript("../proxy.ts", {
      "@/lib/auth-cookies": loadTypeScript("../lib/auth-cookies.ts"),
      "next/server": { NextResponse: { redirect: (url) => ({ redirect: url.pathname }), next: () => ({ next: true }) } },
      "next-auth/jwt": { getToken: async () => role ? { uid: "7", roles: [role], permissions: [] } : null },
      "@/lib/permissions": permissions,
      "@/lib/account-status": { isActiveAccount: async () => true },
    });
    for (const path of ["/dashboard", "/dashboard/profile", "/dashboard/my-activities", "/dashboard/year-activities"]) {
      const result = await proxy({ nextUrl: { pathname: path }, url: `https://example.test${path}` });
      if (role === "STUDENT") assert.equal(result.next, true);
      else assert.equal(result.redirect, role === "ADMIN" ? "/admin" : role === "ORGANIZER" ? "/organizer" : role ? "/forbidden" : "/login");
    }
  }
});

test("organizers need no extra management permission to enter the student viewing route", async () => {
  const { proxy } = loadTypeScript("../proxy.ts", {
    "@/lib/auth-cookies": loadTypeScript("../lib/auth-cookies.ts"),
    "next/server": { NextResponse: { redirect: (url) => ({ redirect: url.pathname }), next: () => ({ next: true }) } },
    "next-auth/jwt": { getToken: async () => ({ uid: "7", roles: ["ORGANIZER"], permissions: [] }) },
    "@/lib/permissions": permissions,
    "@/lib/account-status": { isActiveAccount: async () => true },
  });
  const path = "/organizer/students/42/dashboard";
  assert.equal((await proxy({ nextUrl: { pathname: path }, url: `https://example.test${path}` })).next, true);
});

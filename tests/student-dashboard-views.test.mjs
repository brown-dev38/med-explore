import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

// Resolve the server component tree with inert UI primitives; no browser or DB writes.
async function nodesOf(node) {
  if (Array.isArray(node)) return (await Promise.all(node.map(nodesOf))).flat();
  if (!node || typeof node !== "object") return [];
  if (typeof node.type === "function") return nodesOf(await node.type(node.props));
  return [node, ...await nodesOf(node.props?.children), ...await nodesOf(node.props?.render)];
}

function view(name, readOnly, area = "admin") {
  const queries = [];
  const basePath = readOnly ? `/${area}/students/42/dashboard` : "/dashboard";
  const userId = readOnly ? "42" : "7";
  const recordQuery = (kind, result) => async (query) => { queries.push({ kind, query }); return result; };
  const activity = { id: 11n, title: "Selected student's activity", status: "PUBLISHED", startsAt: new Date("2026-01-01"), endsAt: new Date("2099-01-01"), minMinutes: 60 };
  const participation = {
    id: 12n, activity, status: "REGISTERED", starTransactions: [],
    attendanceRecords: [{ eventType: "CHECK_IN", occurredAt: new Date("2026-01-01") }],
  };
  const mocks = {
    "next/link": "a", "lucide-react": {},
    "@/lib/prisma": { prisma: {
      participation: { findMany: recordQuery("participations", [participation]) },
      activity: { findMany: recordQuery("activities", []), count: recordQuery("activityCount", 0) },
      starTransaction: {
        aggregate: recordQuery("stars", { _sum: { points: 3 } }),
        count: recordQuery("workCount", 1),
        findMany: recordQuery("work", [{ id: 88n, reason: "General service work", academicYear: { code: "2568" }, status: "APPROVED", points: 1, createdAt: new Date("2026-01-01") }]),
      },
      helperAssignment: { count: recordQuery("helperCount", 0), findMany: recordQuery("helpers", []) },
    } },
    "@/lib/student-dashboard": { getStudentDashboardContext: async () => ({ user: { id: userId, name: "Selected Student" }, basePath, readOnly }) },
    "@/lib/student-academic-years": { getStudentYearContext: async () => ({ years: [{ id: "1", code: "2568", status: "CLOSED" }], selectedYear: { id: "1", code: "2568" }, searchParams: {} }) },
    "@/lib/datetime": { formatThaiDateTime: (value) => value },
    "@/lib/attendance-calculation": loadTypeScript("../lib/attendance-calculation.ts"),
    "@/lib/student-activity-filters": loadTypeScript("../lib/student-activity-filters.ts"),
    "@/components/student-year-selector": { StudentYearSelector: "year-selector" },
    "@/components/reward-goals": { RewardGoals: "reward-goals" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/badge": { Badge: "badge" },
    "@/components/ui/card": Object.fromEntries(["Card", "CardContent", "CardHeader", "CardTitle", "CardDescription", "CardFooter"].map((key) => [key, "div"])),
    "@/components/ui/tabs": Object.fromEntries(["Tabs", "TabsContent", "TabsList", "TabsTrigger"].map((key) => [key, "div"])),
  };
  const Component = loadTypeScript(`../components/student-dashboard/${name}.tsx`, mocks).default;
  return { Component, queries, basePath, userId };
}

test("staff overview and history use the selected student's records and offer no self-service actions", async () => {
  for (const area of ["admin", "organizer"]) {
    for (const name of ["overview", "my-activities"]) {
      const api = view(name, true, area);
      const nodes = await nodesOf(api.Component({ target: { area, id: "42" }, searchParams: Promise.resolve({ academicYearId: "1" }) }));
      const links = nodes.filter((node) => node.type === "a").map((node) => node.props.href);
      assert.ok(links.every((href) => href.startsWith(api.basePath)), links.join(", "));
      assert.ok(!links.includes("/scan"));
      assert.ok(!links.includes("/dashboard/activities"));
      const personalQueries = api.queries.filter(({ kind }) => ["participations", "stars", "helpers", "helperCount", "work", "workCount"].includes(kind));
      assert.ok(personalQueries.length > 0);
      assert.ok(personalQueries.every(({ query }) => query.where.userId === 42n));
      if (name === "overview") {
        assert.equal(nodes.find((node) => node.type === "year-selector").props.basePath, api.basePath);
        assert.ok(links.some((href) => href === `${api.basePath}/year-activities?academicYearId=1&filter=missed`));
        assert.ok(personalQueries.filter(({ kind }) => kind === "stars").every(({ query }) => query.where.academicYearId === 1n));
      }
    }
  }
});

test("student overview retains registration and scan links and queries the signed-in student's records", async () => {
  const api = view("overview", false);
  const nodes = await nodesOf(api.Component({ searchParams: Promise.resolve({}) }));
  const links = nodes.filter((node) => node.type === "a").map((node) => node.props.href);
  assert.ok(links.includes("/dashboard/activities"));
  assert.ok(links.includes("/scan"));
  assert.ok(api.queries.filter(({ kind }) => ["participations", "stars", "helperCount"].includes(kind)).every(({ query }) => query.where.userId === 7n));
});

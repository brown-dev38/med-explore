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

function view(name, readOnly, area = "admin", options = {}) {
  const queries = [];
  const basePath = readOnly ? `/${area}/students/42/dashboard` : "/dashboard";
  const userId = readOnly ? "42" : "7";
  const yearId = options.yearId ?? "1";
  const yearStatus = options.yearStatus ?? "CLOSED";
  const recordQuery = (kind, result) => async (query) => { queries.push({ kind, query }); return typeof result === "function" ? result(query) : result; };
  const filterYear = (rows, query) => rows.filter((row) => {
    const year = query.where.academicYearId ?? query.where.activity?.academicYearId;
    return year === undefined || (row.academicYearId ?? row.activity?.academicYearId) === year;
  });
  const transactions = (options.transactions ?? [
    { starType: "YELLOW", status: "APPROVED", points: 3 },
    { starType: "GREEN", status: "APPROVED", points: 3 },
  ]).map((row) => ({ userId: BigInt(userId), academicYearId: 1n, redemptionId: null, ...row }));
  const aggregateStars = async (query) => {
    queries.push({ kind: "stars", query });
    const where = query.where;
    if (where.academicYear?.status?.not === "CLOSED" && yearStatus === "CLOSED") return { _sum: { points: 0 } };
    const rows = transactions.filter((row) => row.userId === where.userId && row.academicYearId === where.academicYearId
      && row.status === where.status && (!where.starType || row.starType === where.starType)
      && (!where.redemptionId || row.redemptionId !== null)
      && (!where.points?.lt || row.points < where.points.lt));
    return { _sum: { points: rows.reduce((total, row) => total + row.points, 0) } };
  };
  const activity = { id: 11n, academicYearId: 1n, title: "Selected student's activity", status: "PUBLISHED", startsAt: new Date("2026-01-01"), endsAt: new Date("2099-01-01"), minMinutes: 60 };
  const participation = {
    id: 12n, activity, status: "REGISTERED", starTransactions: [],
    attendanceRecords: [{ eventType: "CHECK_IN", occurredAt: new Date("2026-01-01") }],
  };
  const mocks = {
    "next/link": "a", "lucide-react": {},
    "@/lib/prisma": { prisma: {
      participation: { findMany: recordQuery("participations", (query) => filterYear(options.participations ?? [participation], query)) },
      activity: { findMany: recordQuery("activities", []), count: recordQuery("activityCount", 0) },
      starTransaction: {
        aggregate: aggregateStars,
        count: recordQuery("workCount", 1),
        findMany: recordQuery("work", (query) => filterYear(options.works ?? [{ id: 88n, academicYearId: 1n, reason: "General service work", academicYear: { code: "2568" }, status: "APPROVED", points: 1, createdAt: new Date("2026-01-01") }], query)),
      },
      helperAssignment: { count: recordQuery("helperCount", 0), findMany: recordQuery("helpers", (query) => filterYear(options.helpers ?? [], query)) },
    } },
    "@/lib/student-dashboard": { getStudentDashboardContext: async () => ({ user: { id: userId, name: "Selected Student" }, basePath, readOnly }) },
    "@/lib/student-academic-years": { getStudentYearContext: async () => options.noYear
      ? { years: [], selectedYear: null, searchParams: {} }
      : { years: [{ id: yearId, code: "2568", status: yearStatus }], selectedYear: { id: yearId, code: "2568", status: yearStatus }, searchParams: {} } },
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
  mocks["@/lib/rewards"] = {
    ...loadTypeScript("../lib/rewards.ts", { "server-only": {}, "@/lib/prisma": mocks["@/lib/prisma"] }),
    rewardCatalog: recordQuery("rewardCatalog", []),
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

function walletValues(nodes) {
  return Object.fromEntries(nodes.filter((node) => node.props?.["data-star-value"])
    .map((node) => [node.props["data-star-value"], node.props.children]));
}

test("overview separates five earned stars from spent and reserved stars using the redemption ledger", async () => {
  const scenarios = [
    { approved: 3, pending: 0, rejected: 0, available: 2 },
    { approved: 0, pending: 3, rejected: 0, available: 2 },
    { approved: 2, pending: 2, rejected: 0, available: 1 },
    { approved: 0, pending: 0, rejected: 3, available: 5 },
    { approved: 5, pending: 0, rejected: 0, available: 0 },
  ];
  for (const scenario of scenarios) {
    const transactions = [
      { starType: "YELLOW", status: "APPROVED", points: 2 },
      { starType: "GREEN", status: "APPROVED", points: 3 },
      { starType: "ADJUSTMENT", status: "APPROVED", points: -scenario.approved, redemptionId: 1n },
      { starType: "ADJUSTMENT", status: "PENDING", points: -scenario.pending, redemptionId: 2n },
      { starType: "ADJUSTMENT", status: "REJECTED", points: -scenario.rejected, redemptionId: 3n },
      { starType: "GREEN", status: "APPROVED", points: 100, userId: 99n },
      { starType: "GREEN", status: "APPROVED", points: 100, academicYearId: 99n },
    ];
    const api = view("overview", false, "admin", { transactions, yearStatus: "ACTIVE" });
    const nodes = await nodesOf(api.Component({ searchParams: Promise.resolve({}) }));
    assert.deepEqual(walletValues(nodes), { available: scenario.available, earned: 5, redeemed: scenario.approved, reserved: scenario.pending });
    const goals = nodes.find((node) => node.type === "reward-goals");
    assert.equal(goals.props.balance.available, scenario.available);
    assert.equal(goals.props.canRedeem, true);
    assert.ok(nodes.some((node) => node.type === "a" && node.props.href === "/dashboard/redemptions?academicYearId=1"));
  }
});

test("closed-year overview shows zero spendable stars while retaining earned and redeemed history", async () => {
  const api = view("overview", false, "admin", { yearStatus: "CLOSED", transactions: [
    { starType: "GREEN", status: "APPROVED", points: 5 },
    { starType: "ADJUSTMENT", status: "APPROVED", points: -3, redemptionId: 1n },
    { starType: "ADJUSTMENT", status: "PENDING", points: -1, redemptionId: 2n },
  ] });
  const nodes = await nodesOf(api.Component({ searchParams: Promise.resolve({}) }));
  assert.deepEqual(walletValues(nodes), { available: 0, earned: 5, redeemed: 3, reserved: 0 });
  assert.equal(nodes.find((node) => node.type === "reward-goals").props.canRedeem, false);
  assert.ok(!nodes.some((node) => node.type === "a" && node.props.href.startsWith("/scan")));
  assert.ok(nodes.some((node) => node.type === "a" && node.props.href === "/dashboard/my-activities?academicYearId=1"));
});

test("overview without an academic year shows an empty wallet and performs no data queries", async () => {
  const api = view("overview", false, "admin", { noYear: true });
  const nodes = await nodesOf(api.Component({ searchParams: Promise.resolve({}) }));
  assert.deepEqual(walletValues(nodes), { available: 0, earned: 0, redeemed: 0, reserved: 0 });
  assert.equal(api.queries.length, 0);
  assert.ok(!nodes.some((node) => node.type === "reward-goals"));
});

test("reward goals use spendable stars and respect year, stock and reward availability", async () => {
  const { RewardGoals } = loadTypeScript("../components/reward-goals.tsx", {
    "next/link": "a", "lucide-react": {}, "@/components/reward-image": { RewardImage: "reward-image" },
  });
  const reward = { id: "1", name: "Gift", costPoints: 3, isActive: true, stockQuantity: 2, imageUrl: null };
  for (const scenario of [
    { available: 1, canRedeem: true, changes: {}, message: "เก็บเพิ่มอีก 2 ดาว" },
    { available: 3, canRedeem: true, changes: {}, message: "ดาวถึงแล้ว ไปแลกกัน!" },
    { available: 3, canRedeem: false, changes: {}, message: "ดูรางวัลของปีนี้" },
    { available: 3, canRedeem: true, changes: { isActive: false }, message: "ยังไม่เปิดให้แลก" },
    { available: 3, canRedeem: true, changes: { stockQuantity: 0 }, message: "ของรางวัลหมดแล้ว" },
  ]) {
    const nodes = await nodesOf(RewardGoals({ academicYearId: "1", balance: { available: scenario.available, balance: 5, reserved: 5 - scenario.available }, rewards: [{ ...reward, ...scenario.changes }], canRedeem: scenario.canRedeem }));
    assert.equal(nodes.find((node) => node.type === "progress").props.value, Math.min(scenario.available, 3));
    assert.ok(nodes.some((node) => node.type === "p" && node.props.children === scenario.message));
  }
});

test("student overview retains registration and scan links and queries the signed-in student's records", async () => {
  const api = view("overview", false, "admin", { yearStatus: "ACTIVE" });
  const nodes = await nodesOf(api.Component({ searchParams: Promise.resolve({}) }));
  const links = nodes.filter((node) => node.type === "a").map((node) => node.props.href);
  assert.ok(links.includes("/dashboard/activities?academicYearId=1"));
  assert.ok(links.includes("/scan?academicYearId=1"));
  assert.ok(links.includes("/dashboard/my-activities?academicYearId=1"));
  assert.ok(api.queries.filter(({ kind }) => ["participations", "stars", "helperCount"].includes(kind)).every(({ query }) => query.where.userId === 7n));
});

test("my activities isolates participations, helper duties and general work by the selected academic year", async () => {
  const fixtures = [1n, 2n].map((academicYearId) => {
    const activity = { academicYearId, title: `Activity year ${academicYearId}`, status: "COMPLETED", startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-02"), minMinutes: 60 };
    return {
      participation: { id: academicYearId, activity, status: "ATTENDED", starTransactions: [], attendanceRecords: [] },
      helper: { id: academicYearId, activity: { ...activity, title: `Helper year ${academicYearId}` }, status: "COMPLETED", starTransactions: [] },
      work: { id: academicYearId, academicYearId, academicYear: { code: String(academicYearId) }, reason: `General work year ${academicYearId}`, status: "APPROVED", points: 1, createdAt: new Date("2026-01-01") },
    };
  });
  for (const yearId of ["1", "2"]) {
    for (const readOnly of [true, false]) {
      const api = view("my-activities", readOnly, "admin", { yearId, yearStatus: yearId === "1" ? "CLOSED" : "ACTIVE",
        participations: fixtures.map((row) => row.participation), helpers: fixtures.map((row) => row.helper), works: fixtures.map((row) => row.work) });
      const nodes = await nodesOf(api.Component({ searchParams: Promise.resolve({ academicYearId: yearId }) }));
      const text = nodes.flatMap((node) => [node.props.children].flat()).filter((value) => typeof value === "string").join(" ");
      const other = yearId === "1" ? "2" : "1";
      for (const label of ["Activity", "Helper", "General work"]) {
        assert.ok(text.includes(`${label} year ${yearId}`), text);
        assert.ok(!text.includes(`${label} year ${other}`), text);
      }
      assert.ok(api.queries.filter(({ kind }) => ["participations", "helpers"].includes(kind)).every(({ query }) => query.where.activity.academicYearId === BigInt(yearId)));
      assert.ok(api.queries.filter(({ kind }) => kind === "work").every(({ query }) => query.where.academicYearId === BigInt(yearId)));
      assert.equal(nodes.find((node) => node.type === "year-selector").props.selectedId, yearId);
    }
  }
});

test("my activities without an academic year never queries unfiltered history", async () => {
  const api = view("my-activities", false, "admin", { noYear: true });
  await nodesOf(api.Component({ searchParams: Promise.resolve({}) }));
  assert.equal(api.queries.length, 0);
});

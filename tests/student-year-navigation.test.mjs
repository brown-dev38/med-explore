import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

async function nodesOf(node) {
  if (Array.isArray(node)) return (await Promise.all(node.map(nodesOf))).flat();
  if (!node || typeof node !== "object") return [];
  if (typeof node.type === "function") return nodesOf(await node.type(node.props));
  return [node, ...await nodesOf(node.props?.children), ...await nodesOf(node.props?.render)];
}

const years = [
  { id: 2n, code: "2570", status: "ACTIVE" },
  { id: 1n, code: "2569", status: "CLOSED" },
  { id: 3n, code: "2571", status: "DRAFT" },
];

function yearContext(records = years) {
  return loadTypeScript("../lib/student-academic-years.ts", {
    "server-only": {},
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/prisma": { prisma: { academicYear: { findMany: async () => records } } },
    "@/lib/student-activity-filters": loadTypeScript("../lib/student-activity-filters.ts"),
  });
}

test("the scan page blocks closed, draft and missing years before mounting the scanner", async () => {
  for (const [records, query, expectedId] of [
    [years, { academicYearId: "1", token: "active-year-qr" }, "1"],
    [years, { academicYearId: "3" }, "3"],
    [[], {}, null],
  ]) {
    const { default: ScanPage } = loadTypeScript("../app/scan/page.tsx", {
      "next/link": "a", "./scan-client": { ScanClient: "scanner" },
      "@/lib/dal": { requireAuth: async () => ({ id: "7" }) },
      "@/lib/student-academic-years": yearContext(records),
    });
    const nodes = await nodesOf(ScanPage({ searchParams: Promise.resolve(query) }));
    assert.ok(!nodes.some((node) => node.type === "scanner"));
    assert.ok(nodes.some((node) => node.props.role === "status"));
    assert.equal(nodes.find((node) => node.type === "a").props.href, expectedId ? `/dashboard?academicYearId=${expectedId}` : "/dashboard");
  }
});

test("the scan page uses the explicit active year or defaults to it and rejects invalid year selection", async () => {
  const { default: ScanPage } = loadTypeScript("../app/scan/page.tsx", {
    "next/link": "a", "./scan-client": { ScanClient: "scanner" },
    "@/lib/dal": { requireAuth: async () => ({ id: "7" }) },
    "@/lib/student-academic-years": yearContext(),
  });
  for (const query of [{}, { academicYearId: "2" }]) {
    const nodes = await nodesOf(ScanPage({ searchParams: Promise.resolve(query) }));
    const scanner = nodes.find((node) => node.type === "scanner");
    assert.equal(scanner.props.academicYearId, "2");
    assert.equal(scanner.props.academicYearCode, "2570");
  }
  for (const academicYearId of ["999", ["1", "2"]]) {
    await assert.rejects(nodesOf(ScanPage({ searchParams: Promise.resolve({ academicYearId }) })), /NOT_FOUND/);
  }
});

test("the check-in activity list queries only the active selected year and keeps closed years read-only", async () => {
  const queries = [];
  const { default: Page } = loadTypeScript("../app/dashboard/activities/page.tsx", {
    "next/link": "a",
    "@/lib/student-dashboard": { getStudentDashboardContext: async () => ({ user: { id: "7" } }) },
    "@/lib/student-academic-years": yearContext(),
    "@/lib/prisma": { prisma: {
      activity: { findMany: async (query) => { queries.push(query); return []; } },
      participation: { findMany: async () => [] },
    } },
    "@/lib/activities": { toActivityDto: () => {} },
    "@/components/activities-browser": { ActivitiesBrowser: "activity-list" },
    "@/components/student-year-selector": { StudentYearSelector: "year-selector" },
  });
  const closed = await nodesOf(Page({ searchParams: Promise.resolve({ academicYearId: "1" }) }));
  assert.equal(queries.length, 0);
  assert.ok(!closed.some((node) => node.type === "activity-list"));
  assert.ok(closed.some((node) => node.type === "a" && node.props.href === "/dashboard/my-activities?academicYearId=1"));
  const active = await nodesOf(Page({ searchParams: Promise.resolve({ academicYearId: "2" }) }));
  assert.equal(queries[0].where.academicYearId, 2n);
  assert.equal(queries[0].where.status, "PUBLISHED");
  assert.equal(active.find((node) => node.type === "activity-list").props.academicYearId, "2");
});

test("desktop and mobile dashboard menus and breadcrumbs carry the selected student year", async () => {
  const mocks = {
    react: { Suspense: "suspense", useState: (initial) => [initial, () => {}], useEffect() {} },
    "next/link": "a", "lucide-react": {},
    "next/navigation": { usePathname: () => "/dashboard/my-activities", useSearchParams: () => new URLSearchParams({ academicYearId: "1" }) },
    "@/lib/dashboard-breadcrumbs": loadTypeScript("../lib/dashboard-breadcrumbs.ts"),
    "@/components/logout-button": { LogoutButton: "logout" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/dialog": Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogHeader", "DialogTitle"].map((name) => [name, name])),
    "@/components/ui/tooltip": Object.fromEntries(["Tooltip", "TooltipContent", "TooltipProvider", "TooltipTrigger"].map((name) => [name, name])),
  };
  const { DashboardShell } = loadTypeScript("../components/dashboard-shell.tsx", mocks);
  const items = [
    { href: "/dashboard", label: "Overview", icon: "dashboard", exact: true },
    { href: "/dashboard/my-activities", label: "History", icon: "activities" },
    { href: "/scan", label: "Scan", icon: "qr" },
  ];
  const nodes = await nodesOf(DashboardShell({ brand: "Test", navItems: items }));
  for (const label of ["เมนูหลัก", "เมนูหลักบนมือถือ"]) {
    const menu = nodes.find((node) => node.type === "nav" && node.props["aria-label"] === label);
    const links = (await nodesOf(menu)).filter((node) => node.type === "a");
    assert.deepEqual(links.map((node) => node.props.href), items.map((item) => `${item.href}?academicYearId=1`));
    assert.equal(links[1].props["aria-current"], "page");
  }
  const breadcrumbs = nodes.find((node) => node.type === "nav" && node.props["aria-label"] === "เส้นทางหน้าปัจจุบัน");
  assert.ok((await nodesOf(breadcrumbs)).some((node) => node.type === "a" && node.props.href === "/dashboard?academicYearId=1"));
});

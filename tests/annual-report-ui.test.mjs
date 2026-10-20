import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { loadTypeScript } from "./load-typescript.mjs";
import { reactHarness, nodes, text } from "./activity-live-harness.mjs";

const years = [{ id: "2", code: "2569", status: "ACTIVE" }, { id: "3", code: "2570", status: "CLOSED" }];
const options = loadTypeScript("../lib/annual-report-options.ts");
const summary = { activities: 1, registrations: 1, uniqueAttendees: 1, attendanceCount: 1, completedCount: 1, qualifiedCount: 1,
  minutes: 90, yellowStars: 1, greenStars: 0, earned: 1, spent: 0, balance: 1, reserved: 0, available: 1, redemptions: 0, issues: 0 };
function preview(id = "2") {
  return { success: true, data: { year: years.find((year) => year.id === id), generatedAt: "2026-10-20T06:00:00Z", summary,
    sheets: [{ id: "overview", name: "ภาพรวมประจำปี", columns: ["รายการ", "จำนวน"], rows: [["กิจกรรม", 1]], rowCount: 1 }] } };
}
function client() {
  const hooks = reactHarness();
  const mocks = { react: { ...hooks.react, useId: () => "reports-test" }, "lucide-react": {}, "sonner": { toast: {} }, "@/lib/annual-report-options": options };
  for (const [file, exports] of [["button", ["Button"]], ["badge", ["Badge"]], ["label", ["Label"]],
    ["card", ["Card", "CardContent", "CardDescription", "CardHeader", "CardTitle"]],
    ["table", ["Table", "TableBody", "TableCell", "TableHead", "TableHeader", "TableRow"]]]) {
    mocks[`@/components/ui/${file}`] = Object.fromEntries(exports.map((name) => [name, name]));
  }
  const { AnnualReports } = loadTypeScript("../components/annual-reports.tsx", mocks);
  return { render: (props = { years, initialYearId: "2" }) => nodes(hooks.render(() => AnnualReports(props))), hide: () => hooks.hide() };
}

test("preview requests cancel obsolete years and disable export while loading or failed", async (context) => {
  const requests = [];
  context.mock.method(globalThis, "fetch", (url, init) => new Promise((resolve) => requests.push({ url, signal: init.signal, resolve })));
  const ui = client();
  let result = ui.render();
  assert.equal(result.find((node) => node.type === "Button" && text(node).includes("ดาวน์โหลด Excel")).props.disabled, true);
  result.find((node) => node.type === "select" && node.props.id.endsWith("-year")).props.onChange({ target: { value: "3" } });
  result = ui.render();
  assert.equal(requests[0].signal.aborted, true);
  assert.match(requests[1].url, /academicYearId=3/);
  requests[0].resolve(Response.json(preview("2")));
  await setImmediate();
  assert.ok(!ui.render().some((node) => node.type === "h2"));
  requests[1].resolve(Response.json(preview("3")));
  await setImmediate();
  result = ui.render();
  assert.ok(result.some((node) => node.type === "h2" && text(node).includes("2570")));
  assert.equal(result.find((node) => node.type === "Button" && text(node).includes("ดาวน์โหลด Excel")).props.disabled, false);
  ui.hide();
});

test("switching report types clears incompatible filters and preserves the chosen academic year", async (context) => {
  const urls = [];
  context.mock.method(globalThis, "fetch", async (url) => { urls.push(url); return Response.json(preview()); });
  const ui = client();
  ui.render(); await setImmediate();
  const chooseReport = (value) => ui.render().find((node) => node.type === "select" && node.props.id.endsWith("-report")).props.onChange({ target: { value } });
  chooseReport("attendance"); ui.render(); await setImmediate();
  ui.render().find((node) => node.type === "select" && node.props.id.endsWith("-filter")).props.onChange({ target: { value: "COMPLETED" } });
  ui.render(); await setImmediate();
  assert.match(urls.at(-1), /activityStatus=COMPLETED/);
  chooseReport("stars"); ui.render(); await setImmediate();
  const query = new URL(urls.at(-1), "https://example.test").searchParams;
  assert.equal(query.get("academicYearId"), "2");
  assert.equal(query.get("activityStatus"), "all");
  assert.equal(query.get("starType"), "all");
  ui.hide();
});

test("preview failures offer a retry and an empty year list makes no API request", async (context) => {
  let failed = true;
  const requests = context.mock.method(globalThis, "fetch", async () => failed ? Response.json({ message: "ไม่พบปีการศึกษา" }, { status: 404 }) : Response.json(preview()));
  const ui = client(); ui.render(); await setImmediate();
  let result = ui.render();
  assert.ok(result.some((node) => node.props.role === "alert" && text(node) === "ไม่พบปีการศึกษา"));
  assert.equal(result.find((node) => node.type === "Button" && text(node).includes("ดาวน์โหลด Excel")).props.disabled, true);
  failed = false;
  result.find((node) => node.type === "Button" && text(node).includes("โหลดตัวอย่างล่าสุด")).props.onClick();
  ui.render(); await setImmediate(); result = ui.render();
  assert.ok(result.some((node) => node.type === "h2"));
  ui.hide();
  const before = requests.mock.callCount();
  const empty = client(); empty.render({ years: [], initialYearId: "" });
  await setImmediate();
  assert.equal(requests.mock.callCount(), before);
  empty.hide();
});

test("report pages enforce area permissions before listing academic years", async () => {
  const permissions = loadTypeScript("../lib/permissions.ts");
  for (const [role, area, allowed] of [["ADMIN", "admin", true], ["ADMIN", "organizer", true], ["ORGANIZER", "organizer", true], ["ORGANIZER", "admin", false], ["STUDENT", "organizer", false]]) {
    let reads = 0;
    const { AnnualReportsPage } = loadTypeScript("../components/annual-reports-page.tsx", {
      "@/lib/dal": { requireAuth: async () => ({ roles: [role], permissions: ["activity.manage", "star.approve", "reward.manage"] }) },
      "next/navigation": { redirect: () => { throw new Error("FORBIDDEN"); } }, "@/lib/permissions": permissions,
      "@/lib/student-academic-years": { getStudentYearContext: async () => { reads++; return { years, selectedYear: years[0] }; } },
      "@/components/annual-reports": { AnnualReports: "report-client" },
    });
    async function resolve(node) {
      if (!node || typeof node !== "object") return node;
      if (typeof node.type === "function") return resolve(await node.type(node.props));
      return node.props?.children ? resolve(node.props.children) : node;
    }
    if (allowed) {
      const node = await resolve(AnnualReportsPage({ area, searchParams: Promise.resolve({}) }));
      assert.equal(node.type, "report-client");
      assert.equal(reads, 1);
    } else {
      await assert.rejects(resolve(AnnualReportsPage({ area, searchParams: Promise.resolve({}) })), /FORBIDDEN/);
      assert.equal(reads, 0);
    }
  }
});

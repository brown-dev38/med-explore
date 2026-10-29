import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { loadTypeScript } from "./load-typescript.mjs";
import { browser, reactHarness, nodes, text } from "./activity-live-harness.mjs";

const activity = { id: "4", academicYearId: "2", organizerId: "1", title: "Live activity", description: null,
  location: null, startsAt: "2026-10-20T04:00:00Z", endsAt: "2026-10-20T06:00:00Z", minMinutes: 90, status: "PUBLISHED", participantCount: 0, myParticipation: null };

function view(name) {
  const hooks = reactHarness();
  const live = loadTypeScript("../lib/activity-live.ts");
  const resourceHook = loadTypeScript("../components/use-live-activity-data.ts", { react: hooks.react, "@/lib/activity-live": live });
  const mocks = { react: hooks.react, "next/link": "a", "lucide-react": {}, "sonner": { toast: { success() {}, error() {}, warning() {} } },
    "@/lib/activity-live": live,
    "@/lib/datetime": loadTypeScript("../lib/datetime.ts"),
    "@/lib/attendance-calculation": loadTypeScript("../lib/attendance-calculation.ts"),
    "@/components/use-live-activity-data": resourceHook,
    "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
    "@/components/activity-schedule-editor": { ActivityScheduleEditor: "ScheduleEditor" },
    "@/components/activity-publish-button": { ActivityPublishButton: "PublishButton" },
    "@/components/activity-qr-display": { ActivityQrDisplay: "QrDisplay" },
    "@/components/use-activity-qr": loadTypeScript("../components/use-activity-qr.ts", { react: hooks.react, "@/lib/activity-live": live }),
    "@/components/green-star-excel-import": { StudentExcelImport: "ExcelImport" },
  };
  for (const [file, names] of [
    ["button", ["Button"]], ["badge", ["Badge"]], ["input", ["Input"]], ["label", ["Label"]],
    ["card", ["Card", "CardContent", "CardFooter", "CardHeader", "CardTitle", "CardDescription"]],
    ["table", ["Table", "TableBody", "TableCell", "TableHead", "TableHeader", "TableRow"]],
    ["dialog", ["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"]],
    ["tabs", ["Tabs", "TabsContent", "TabsList", "TabsTrigger"]],
  ]) mocks[`@/components/ui/${file}`] = Object.fromEntries(names.map((value) => [value, value]));
  const componentModule = loadTypeScript(`../components/${name}.tsx`, mocks);
  const component = name === "activities-browser" ? componentModule.ActivitiesBrowser : componentModule.ActivityDetail;
  return { live, hide: () => hooks.hide(), render: (props) => nodes(hooks.render(() => component(props))) };
}

test("returning to a preserved activity page shows checked-in status after a successful check-in", async (context) => {
  let data = [{ ...activity }];
  const page = browser(context, async (url) => {
    assert.equal(url, "/api/activities?academicYearId=2");
    return Response.json({ success: true, data });
  });
  const ui = view("activities-browser");
  const props = { initial: [activity], academicYearId: "2" };
  assert.ok(ui.render(props).some((node) => node.type === "Button" && text(node) === "สแกน QR Check-in"));
  await setImmediate();
  ui.hide();
  assert.equal(page.intervals.size, 0);
  data = [{ ...activity, participantCount: 1, myParticipation: { id: "9", status: "REGISTERED", checkInAt: "2026-10-20T04:05:00Z", checkOutAt: null } }];
  ui.live.notifyActivityUpdate();
  ui.render(props); // Same props and state, with effects reactivated by React Activity.
  await setImmediate();
  let result = ui.render(props);
  assert.ok(result.some((node) => node.type === "Badge" && text(node).includes("ลงทะเบียนแล้ว")));
  assert.ok(result.some((node) => node.type === "Badge" && text(node).includes("เช็คอินแล้ว")));
  assert.ok(!result.some((node) => node.type === "Button" && text(node) === "ยกเลิกการลงทะเบียน"));
  data = [{ ...data[0], myParticipation: { ...data[0].myParticipation, checkOutAt: "2026-10-20T06:00:00Z" } }];
  await page.tick();
  result = ui.render(props);
  assert.ok(result.some((node) => node.type === "Badge" && text(node).includes("เช็คอินแล้ว")));
  ui.hide();
});

test("the participant table updates from another device while the import modal stays open", async (context) => {
  let data = [];
  const page = browser(context, async (url) => {
    assert.equal(url, "/api/activities/4/participations");
    return Response.json({ success: true, data });
  });
  const ui = view("activity-detail");
  const props = { activity, participants: [], initialHelpers: [] };
  let result = ui.render(props);
  await setImmediate();
  result.find((node) => node.type === "Button" && text(node) === "นำเข้า Excel").props.onClick();
  data = [{ id: "9", activityId: "4", userId: "7", userName: "New participant", email: "test@example.test", studentCode: "123",
    status: "REGISTERED", eligibilityStatus: "PENDING", attendedMinutes: null, yellowStarPoints: 0, reviewNote: null,
    attendance: [{ id: "12", eventType: "CHECK_IN", method: "QR", occurredAt: "2026-10-20T04:05:00Z" }] }];
  await page.tick();
  result = ui.render(props);
  assert.ok(result.some((node) => node.type === "CardTitle" && text(node) === "ตารางสรุปเวลาผู้เข้าร่วม (1 คน)"));
  assert.ok(result.some((node) => node.type === "TableCell" && text(node).includes("New participant")));
  const dialog = result.find((node) => node.type === "Dialog" && nodes(node).some((child) => child.type === "ExcelImport"));
  assert.ok(result.some((node) => node.type === "Dialog" && node.props.open === true), dialog && text(dialog));
  ui.hide();
  assert.equal(page.intervals.size, 0);
});

test("staff can add selected students with immediate awards and open a participant Excel modal", async (context) => {
  const posts = [];
  browser(context, async (url, options) => {
    if (options?.method === "POST") {
      posts.push({ url, body: JSON.parse(options.body) });
      return Response.json({ data: { added: 2, awarded: 2 } });
    }
    if (url.includes("/candidates")) return Response.json({ data: [
      { id: "42", name: "First Student", studentCode: "001234", email: "first@example.test" },
      { id: "43", name: "Second Student", studentCode: "001235", email: "second@example.test" },
    ] });
    return Response.json({ data: [] });
  });
  const ui = view("activity-detail");
  const props = { activity, participants: [] };
  ui.render(props).find((node) => node.type === "Button" && text(node) === "เพิ่มผู้เข้าร่วม").props.onClick();
  await setImmediate();
  ui.render(props).find((node) => node.type === "button" && text(node) === "เลือกทั้งหมดที่แสดง").props.onClick();
  await ui.render(props).find((node) => node.type === "Button" && text(node) === "เพิ่มที่เลือกและให้ดาว (2)").props.onClick();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "/api/activities/4/participants");
  assert.deepEqual(posts[0].body.userIds, ["42", "43"]);
  assert.match(posts[0].body.requestId, /^[0-9a-f-]{36}$/);
  ui.render(props).find((node) => node.type === "Button" && text(node) === "นำเข้า Excel").props.onClick();
  const modal = ui.render(props).find((node) => node.type === "Dialog" && nodes(node).some((child) => child.type === "ExcelImport"));
  assert.equal(modal.props.open, true);
  assert.deepEqual(nodes(modal).find((node) => node.type === "ExcelImport").props.target, { mode: "participants", activityId: "4", academicYearId: "2" });
  ui.hide();
});

test("participants paginate by ten, preserve the current page on live updates and handle a shrinking list", async (context) => {
  let data = Array.from({ length: 21 }, (_, index) => ({ id: String(index + 1), userName: `Student ${index + 1}`, studentCode: String(index + 1), attendance: [], yellowStarPoints: 0, eligibilityStatus: "PENDING", reviewNote: null }));
  const page = browser(context, async () => Response.json({ success: true, data }));
  const ui = view("activity-detail");
  const props = { activity, participants: data };
  const tableNames = (result) => result.filter((node) => node.type === "TableCell" && text(node).startsWith("Student ")).map(text);
  const button = (result, label) => result.find((node) => node.type === "Button" && text(node) === label);
  let result = ui.render(props);
  await setImmediate();
  assert.deepEqual(tableNames(result), data.slice(0, 10).map((row) => row.userName));
  assert.equal(button(result, "ก่อนหน้า").props.disabled, true);
  button(result, "ถัดไป").props.onClick();
  result = ui.render(props);
  assert.deepEqual(tableNames(result), data.slice(10, 20).map((row) => row.userName));
  await page.tick();
  result = ui.render(props);
  assert.equal(tableNames(result)[0], "Student 11");
  button(result, "ถัดไป").props.onClick();
  result = ui.render(props);
  assert.deepEqual(tableNames(result), ["Student 21"]);
  assert.equal(button(result, "ถัดไป").props.disabled, true);
  button(result, "ก่อนหน้า").props.onClick();
  assert.equal(tableNames(ui.render(props))[0], "Student 11");
  data = data.slice(0, 3);
  await page.tick();
  result = ui.render(props);
  assert.deepEqual(tableNames(result), data.map((row) => row.userName));
  assert.equal(button(result, "ถัดไป").props.disabled, true);
  data = [];
  await page.tick();
  result = ui.render(props);
  assert.deepEqual(tableNames(result), []);
  assert.ok(result.some((node) => node.type === "TableCell" && text(node) === "ยังไม่มีผู้ลงทะเบียนกิจกรรมนี้"));
  assert.equal(button(result, "ก่อนหน้า").props.disabled, true);
  assert.equal(button(result, "ถัดไป").props.disabled, true);
  ui.hide();
});

test("dashboard and history refresh once per activity change without a navigation refresh loop", (context) => {
  const page = browser(context, async () => Response.json({}));
  const live = loadTypeScript("../lib/activity-live.ts");
  const hooks = reactHarness();
  let pathname = "/scan";
  let count = 0;
  const router = { refresh: () => { count++; } };
  const { ActivityNavigationRefresh } = loadTypeScript("../components/activity-navigation-refresh.tsx", {
    react: hooks.react, "@/lib/activity-live": live,
    "next/navigation": { usePathname: () => pathname, useSearchParams: () => new URLSearchParams({ academicYearId: "2" }), useRouter: () => router },
  });
  const render = () => hooks.render(() => ActivityNavigationRefresh());
  render();
  live.notifyActivityUpdate();
  assert.equal(count, 0);
  pathname = "/dashboard"; render();
  assert.equal(count, 1);
  render(); page.pageWindow.dispatchEvent(new Event("focus"));
  assert.equal(count, 1);
  pathname = "/dashboard/my-activities"; render();
  assert.equal(count, 2);
  pathname = "/dashboard"; render();
  assert.equal(count, 2);
  live.notifyActivityUpdate();
  assert.equal(count, 3);
  hooks.hide();
});

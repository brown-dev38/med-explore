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
  const mocks = { react: hooks.react, "next/link": "a", "lucide-react": {}, "sonner": { toast: {} },
    "@/lib/activity-live": live,
    "@/lib/datetime": loadTypeScript("../lib/datetime.ts"),
    "@/lib/attendance-calculation": loadTypeScript("../lib/attendance-calculation.ts"),
    "@/components/use-live-activity-data": resourceHook,
    "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
    "@/components/activity-schedule-editor": { ActivityScheduleEditor: "ScheduleEditor" },
    "@/components/activity-publish-button": { ActivityPublishButton: "PublishButton" },
    "@/components/activity-qr-display": { ActivityQrDisplay: "QrDisplay" },
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

test("returning to a preserved activity page shows check-out after a successful check-in", async (context) => {
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
  assert.ok(result.some((node) => node.type === "Button" && text(node) === "สแกน QR Check-out"));
  assert.ok(!result.some((node) => node.type === "Button" && text(node) === "ยกเลิกการลงทะเบียน"));
  data = [{ ...data[0], myParticipation: { ...data[0].myParticipation, checkOutAt: "2026-10-20T06:00:00Z" } }];
  await page.tick();
  result = ui.render(props);
  assert.ok(result.some((node) => node.type === "Badge" && text(node).includes("บันทึกเวลาครบแล้ว")));
  ui.hide();
});

test("the participant table updates from another device while an edit dialog stays open", async (context) => {
  let data = [];
  const page = browser(context, async (url) => {
    assert.equal(url, "/api/activities/4/participations");
    return Response.json({ success: true, data });
  });
  const ui = view("activity-detail");
  const props = { activity, participants: [], initialHelpers: [] };
  let result = ui.render(props);
  await setImmediate();
  result.find((node) => node.type === "Button" && text(node).includes("ตั้งเวลาให้ทุกคน")).props.onClick();
  data = [{ id: "9", activityId: "4", userId: "7", userName: "New participant", email: "test@example.test", studentCode: "123",
    status: "REGISTERED", eligibilityStatus: "PENDING", attendedMinutes: null, yellowStarPoints: 0, reviewNote: null,
    attendance: [{ id: "12", eventType: "CHECK_IN", method: "QR", occurredAt: "2026-10-20T04:05:00Z" }] }];
  await page.tick();
  result = ui.render(props);
  assert.ok(result.some((node) => node.type === "CardTitle" && text(node) === "ตารางสรุปเวลาผู้เข้าร่วม (1 คน)"));
  assert.ok(result.some((node) => node.type === "TableCell" && text(node).includes("New participant")));
  const dialog = result.find((node) => node.type === "Dialog" && text(node).includes("ตั้งเวลาเข้า–ออกให้ทุกคน"));
  assert.ok(result.some((node) => node.type === "Dialog" && node.props.open === true), dialog && text(dialog));
  ui.hide();
  assert.equal(page.intervals.size, 0);
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

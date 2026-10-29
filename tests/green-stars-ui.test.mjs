import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";
import { reactHarness, nodes, text } from "./activity-live-harness.mjs";

const uiMocks = Object.fromEntries([
  ["button", ["Button"]], ["badge", ["Badge"]], ["input", ["Input"]], ["label", ["Label"]],
  ["card", ["Card", "CardContent", "CardHeader", "CardTitle", "CardDescription"]],
  ["table", ["Table", "TableBody", "TableCell", "TableHead", "TableHeader", "TableRow"]],
  ["dialog", ["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"]],
].map(([file, names]) => [`@/components/ui/${file}`, Object.fromEntries(names.map((name) => [name, name]))]));

test("work type, year and activity dropdowns navigate immediately and discard stale activity selections", () => {
  for (const area of ["admin", "organizer"]) {
    const pushes = [];
    const { GreenStarsFilters } = loadTypeScript("../components/green-stars-filters.tsx", {
      ...uiMocks, react: { useTransition: () => [false, (action) => action()] },
      "next/link": "a", "next/navigation": { useRouter: () => ({ push: (...args) => pushes.push(args) }) }, "lucide-react": {},
    });
    const props = {
      area, years: [{ id: "2", code: "2570", status: "ACTIVE" }], selectedYearId: "2", activityMode: true,
      activities: [{ id: "4", title: "Activity", dateLabel: "27 Oct", status: "PUBLISHED" }], selectedActivityId: "4",
    };
    const all = nodes(GreenStarsFilters(props));
    const select = (id) => all.find((node) => node.props.id === id);
    select("green-stars-work-type").props.onChange({ target: { value: "work" } });
    assert.deepEqual(pushes.at(-1), [`/${area}/green-stars?academicYearId=2`, { scroll: false }]);
    select("green-stars-year").props.onChange({ target: { value: "3" } });
    assert.equal(pushes.at(-1)[0], `/${area}/green-stars/activities?academicYearId=3`);
    select("green-stars-activity").props.onChange({ target: { value: "5" } });
    assert.equal(pushes.at(-1)[0], `/${area}/green-stars/activities?academicYearId=2&activityId=5`);
    const general = nodes(GreenStarsFilters({ ...props, activityMode: false }));
    assert.ok(!general.some((node) => node.props.id === "green-stars-activity"));
    general.find((node) => node.props.id === "green-stars-work-type").props.onChange({ target: { value: "activity" } });
    assert.equal(pushes.at(-1)[0], `/${area}/green-stars/activities?academicYearId=2`);
    const empty = nodes(GreenStarsFilters({ ...props, activities: [], years: [], selectedYearId: null }));
    assert.equal(empty.find((node) => node.props.id === "green-stars-year").props.disabled, true);
    assert.equal(empty.find((node) => node.props.id === "green-stars-activity").props.disabled, true);
  }
});

function manager(closed = false, context) {
  const harness = reactHarness();
  const timers = new Map();
  let timerId = 0;
  if (context) {
    context.mock.method(globalThis, "setTimeout", (callback) => { timers.set(++timerId, callback); return timerId; });
    context.mock.method(globalThis, "clearTimeout", (id) => timers.delete(id));
    context.after(() => harness.hide());
  }
  const { GreenStarManager } = loadTypeScript("../components/green-star-manager.tsx", {
    ...uiMocks, react: harness.react, "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "lucide-react": {}, sonner: { toast: { success() {}, error() {}, warning() {} } },
    "@/lib/datetime": { formatThaiDateTime: (value) => value },
    "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
    "@/components/green-star-excel-import": { GreenStarExcelImport: "ExcelImport" },
  });
  const helpers = Array.from({ length: 45 }, (_, i) => ({
    id: String(i + 1), userName: `Student ${i + 1}`, studentCode: String(1000 + i),
    status: i % 2 ? "COMPLETED" : "ASSIGNED", greenStarPoints: i % 2,
    description: "Help prepare room", completedAt: null,
  }));
  const render = () => harness.render(() => GreenStarManager({ activityId: "4", activityTitle: "Activity", yearId: "2", closed, initialHelpers: helpers }));
  render.tick = async () => { const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) await callback(); };
  return render;
}

const button = (tree, label) => nodes(tree).find((node) => node.type === "Button" && text(node) === label);
const rows = (tree) => nodes(nodes(tree).find((node) => node.type === "TableBody")).filter((node) => node.type === "TableRow");

test("helper pagination, status and search filters work together and reset to the first page", () => {
  const render = manager();
  assert.equal(rows(render()).length, 20);
  button(render(), "ถัดไป").props.onClick();
  assert.match(text(render()), /แสดง 21–40 จาก 45 รายการ/);
  button(render(), "ถัดไป").props.onClick();
  assert.equal(rows(render()).length, 5);
  assert.equal(button(render(), "ถัดไป").props.disabled, true);
  nodes(render()).find((node) => node.props.id === "helper-status-filter").props.onChange({ target: { value: "ASSIGNED" } });
  assert.match(text(render()), /แสดง 1–20 จาก 23 รายการ/);
  nodes(render()).find((node) => node.props.id === "helper-page-size").props.onChange({ target: { value: "10" } });
  assert.equal(rows(render()).length, 10);
  button(render(), "ถัดไป").props.onClick();
  nodes(render()).find((node) => node.props.id === "helper-filter").props.onChange({ target: { value: "Student 45" } });
  assert.equal(rows(render()).length, 1);
  assert.match(text(render()), /แสดง 1–1 จาก 1 รายการ/);
  button(render(), "ล้างตัวกรอง").props.onClick();
  assert.equal(rows(render()).length, 10);
  assert.match(text(render()), /แสดง 1–10 จาก 45 รายการ/);
  const importDialog = () => nodes(render()).find((node) => node.type === "Dialog" && nodes(node).some((child) => child.props.id === "helper-import-dialog"));
  assert.equal(importDialog().props.open, false);
  button(render(), "นำเข้า Excel").props.onClick();
  assert.equal(importDialog().props.open, true);
  assert.equal(button(render(), "นำเข้า Excel").props["aria-haspopup"], "dialog");
  const importer = nodes(importDialog()).find((node) => node.type === "ExcelImport");
  assert.deepEqual(importer.props.target, { mode: "activity", academicYearId: "2", activityId: "4" });
  importDialog().props.onOpenChange(false);
  assert.equal(importDialog().props.open, false);
});

test("closed years keep searching available while disabling all helper mutations", () => {
  const tree = manager(true)();
  for (const label of ["เพิ่มนิสิตช่วยงาน", "นำเข้า Excel", "ยืนยันและให้ 1 ดาว", "ยกเลิกการช่วยงาน"]) {
    assert.equal(button(tree, label).props.disabled, true);
  }
  assert.equal(nodes(tree).find((node) => node.type === "ExcelImport").props.disabled, true);
  assert.ok(!nodes(tree).find((node) => node.props.id === "helper-filter").props.disabled);
  assert.equal(button(tree, "รีเฟรช").props.disabled, false);
});

test("cancelling deletes the helper and refreshes the list instead of leaving a cancelled row", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: options?.method === "DELETE" ? { deleted: true } : [] });
  });
  const render = manager();
  button(render(), "ยกเลิกการช่วยงาน").props.onClick();
  const confirmation = nodes(render()).find((node) => node.type === "ConfirmDialog");
  assert.equal(calls.length, 0);
  assert.match(confirmation.props.description, /ลบรายชื่อนิสิต/);
  assert.equal(await confirmation.props.onConfirm(), true);
  assert.equal(calls[0].url, "/api/activities/4/helpers/1");
  assert.equal(calls[0].options.method, "DELETE");
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[1].url, "/api/activities/4/helpers");
  assert.match(text(render()), /ยังไม่มีนิสิตช่วยงาน/);
  assert.equal(button(render(), "ยกเลิกการช่วยงาน"), undefined);
});

test("a rejected cancellation keeps the helper in the list", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ message: "Cannot delete" }, { status: 409 }));
  const render = manager();
  button(render(), "ยกเลิกการช่วยงาน").props.onClick();
  assert.equal(await nodes(render()).find((node) => node.type === "ConfirmDialog").props.onConfirm(), false);
  assert.equal(rows(render()).length, 20);
});

const candidateCheckbox = (render, id) => nodes(render()).find((node) => node.props.type === "checkbox" && node.props.value === id);
const addDialog = (render) => nodes(render()).find((node) => node.type === "Dialog");
const addForm = (render) => nodes(render()).find((node) => node.type === "form");

test("activity helpers can be selected across searches, toggle all shown and submit together in one request", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/candidates")) return Response.json({ data: url.endsWith("q=Other")
      ? [{ id: "103", name: "Other Student", studentCode: "003" }]
      : [{ id: "101", name: "First Student", studentCode: "001" }, { id: "102", name: "Second Student", studentCode: "002" }] });
    return Response.json({ data: options?.method === "POST" ? { added: 2 } : [] });
  });
  const render = manager(false, t);
  button(render(), "เพิ่มนิสิตช่วยงาน").props.onClick();
  render();
  await render.tick();
  candidateCheckbox(render, "101").props.onChange();
  button(render(), "เลือกทั้งหมดที่แสดง").props.onClick();
  assert.equal(candidateCheckbox(render, "102").props.checked, true);
  button(render(), "ยกเลิกเลือกทั้งหมดที่แสดง").props.onClick();
  assert.equal(candidateCheckbox(render, "101").props.checked, false);
  candidateCheckbox(render, "101").props.onChange();
  nodes(render()).find((node) => node.props.id === "helper-search").props.onChange({ target: { value: "Other" } });
  render();
  await render.tick();
  button(render(), "เลือกทั้งหมดที่แสดง").props.onClick();
  button(render(), "ยกเลิกเลือกทั้งหมดที่แสดง").props.onClick();
  assert.match(text(render()), /เลือกแล้ว 1 คน/);
  candidateCheckbox(render, "103").props.onChange();
  assert.equal(addDialog(render).props.open, true);
  assert.match(text(render()), /เลือกแล้ว 2 คน/);
  nodes(render()).find((node) => node.props.id === "helper-description").props.onChange({ target: { value: "Registration desk" } });
  await addForm(render).props.onSubmit({ preventDefault() {} });
  const posts = calls.filter((call) => call.options?.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "/api/activities/4/helpers");
  assert.deepEqual(JSON.parse(posts[0].options.body), { userIds: ["101", "103"], description: "Registration desk" });
  assert.equal(addDialog(render).props.open, false);
});

test("failed bulk addition retains selected helpers and opening a fresh add form clears the selection", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => options?.method === "POST"
    ? Response.json({ message: "Try again" }, { status: 409 })
    : Response.json({ data: [{ id: "101", name: "Student", studentCode: null }] }));
  const render = manager(false, t);
  button(render(), "เพิ่มนิสิตช่วยงาน").props.onClick();
  render();
  await render.tick();
  candidateCheckbox(render, "101").props.onChange();
  await addForm(render).props.onSubmit({ preventDefault() {} });
  assert.equal(addDialog(render).props.open, true);
  assert.equal(candidateCheckbox(render, "101").props.checked, true);
  button(render(), "ล้างที่เลือก").props.onClick();
  assert.equal(candidateCheckbox(render, "101").props.checked, false);
  assert.equal(nodes(render()).find((node) => node.props.type === "submit").props.disabled, true);
  candidateCheckbox(render, "101").props.onChange();
  addDialog(render).props.onOpenChange(false);
  button(render(), "เพิ่มนิสิตช่วยงาน").props.onClick();
  assert.match(text(render()), /เพิ่มนิสิตและให้คนละ 1 ดาว \(0 คน\)/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";
import { reactHarness, nodes, text } from "./activity-live-harness.mjs";

const work = { mode: "work", academicYearId: "2" };
const activity = { mode: "activity", academicYearId: "2", activityId: "4" };
const previewRows = [
  { row: 2, studentCode: "001234", name: "Student Name", status: "ready", message: "พร้อมนำเข้า" },
  { row: 3, studentCode: "001234", status: "duplicate", message: "รหัสซ้ำในไฟล์" },
  { row: 4, studentCode: "999999", status: "not-found", message: "ไม่พบนิสิต" },
];

function setup(target = work, disabled = false) {
  const harness = reactHarness();
  let refreshes = 0;
  let reloads = 0;
  const mocks = {};
  for (const [file, names] of [["button", ["Button"]], ["label", ["Label"]], ["card", ["Card", "CardHeader", "CardTitle", "CardDescription", "CardContent"]], ["table", ["Table", "TableHeader", "TableRow", "TableHead", "TableBody", "TableCell"]]]) {
    mocks[`@/components/ui/${file}`] = Object.fromEntries(names.map((name) => [name, name]));
  }
  const Component = loadTypeScript("../components/green-star-excel-import.tsx", {
    ...mocks, react: { ...harness.react, useId: () => "excel" }, "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
    "lucide-react": {}, sonner: { toast: { success() {}, error() {}, warning() {} } },
    "@/lib/green-star-import-schema": loadTypeScript("../lib/green-star-import-schema.ts"),
    "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
  }).GreenStarExcelImport;
  return { render: () => harness.render(() => Component({ target, targetLabel: "Academic year / Activity", disabled, onImported: async () => { reloads++; } })), counts: () => ({ refreshes, reloads }) };
}

async function preview(ui, filename = "students.xlsx") {
  nodes(ui.render()).find((node) => node.props?.type === "file").props.onChange({ target: { files: [new File(["excel"], filename)] } });
  await nodes(ui.render()).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
}

function prepare(ui) {
  nodes(ui.render()).find((node) => node.type === "textarea").props.onChange({ target: { value: "Help prepare room" } });
  nodes(ui.render()).find((node) => node.type === "Button" && /^นำเข้า/.test(text(node))).props.onClick();
  return nodes(ui.render()).find((node) => node.type === "ConfirmDialog");
}

test("upload only previews; confirmation imports the valid row once and refreshes the history", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls.push(options);
    return Response.json({ data: options.method === "POST" ? { rows: previewRows } : { imported: 1 } });
  });
  const ui = setup();
  await preview(ui);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body.get("file").name, "students.xlsx");
  assert.match(text(ui.render()), /พร้อมนำเข้า 1 คน/);
  assert.match(text(ui.render()), /ข้าม 2 แถว/);
  const dialog = prepare(ui);
  assert.equal(dialog.props.open, true);
  assert.match(dialog.props.description, /ให้คนละ 1 ดาวสีเขียว/);
  assert.equal(calls.length, 1);
  assert.equal(await dialog.props.onConfirm(), true);
  const body = JSON.parse(calls[1].body);
  assert.deepEqual(body.studentCodes, ["001234"]);
  assert.deepEqual(body.target, work);
  assert.equal(body.description, "Help prepare room");
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(ui.counts(), { refreshes: 1, reloads: 1 });
  assert.match(text(ui.render()), /นำเข้าสำเร็จ 1 คน/);
});

test("a failed confirmation keeps the same request ID for retry and blocks simultaneous submissions", async (t) => {
  const puts = [];
  let resolve;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (options.method === "POST") return Response.json({ data: { rows: previewRows } });
    puts.push(JSON.parse(options.body));
    if (puts.length === 1) throw new Error("Connection lost");
    return new Promise((done) => { resolve = done; });
  });
  const ui = setup();
  await preview(ui);
  const dialog = prepare(ui);
  assert.equal(await dialog.props.onConfirm(), false);
  const retry = nodes(ui.render()).find((node) => node.type === "ConfirmDialog").props.onConfirm;
  const pending = retry();
  assert.equal(await retry(), false);
  assert.deepEqual(puts[0], puts[1]);
  assert.equal(nodes(ui.render()).find((node) => node.props?.type === "file").props.disabled, true);
  resolve(Response.json({ data: { imported: 1 } }));
  assert.equal(await pending, true);
  assert.equal(puts.length, 2);
});

test("activity import explains assignment without stars; closed years and invalid files cannot import", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return Response.json({ data: { rows: previewRows } }); });
  const ui = setup(activity);
  await preview(ui);
  assert.match(prepare(ui).props.description, /ยังไม่ให้ดาวสีเขียว/);
  assert.equal(nodes(setup(work, true).render()).some((node) => node.type === "form"), false);
  const invalid = setup();
  await preview(invalid, "students.xls");
  assert.equal(requests, 1);
  assert.match(text(invalid.render()), /กรุณาเลือกไฟล์ Excel/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";
import { reactHarness, nodes, text } from "./activity-live-harness.mjs";

const initialCandidates = [
  { id: "42", name: "First Student", studentCode: "001234" },
  { id: "43", name: "Second Student", studentCode: null },
];

function setup(context, options = {}) {
  const harness = reactHarness();
  let refreshes = 0;
  let timerId = 0;
  const timers = new Map();
  context.mock.method(globalThis, "setTimeout", (callback) => { timers.set(++timerId, callback); return timerId; });
  context.mock.method(globalThis, "clearTimeout", (id) => timers.delete(id));
  const mocks = Object.fromEntries([
    ["button", ["Button"]], ["input", ["Input"]], ["label", ["Label"]],
    ["card", ["Card", "CardContent", "CardDescription", "CardHeader", "CardTitle"]],
  ].map(([file, names]) => [`@/components/ui/${file}`, Object.fromEntries(names.map((name) => [name, name]))]));
  const { GreenWorkAwardForm } = loadTypeScript("../components/green-work-award-form.tsx", {
    ...mocks, react: harness.react, "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
    "lucide-react": {}, sonner: { toast: { success() {}, error() {} } },
    "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
  });
  const render = () => harness.render(() => GreenWorkAwardForm({ yearId: "2", yearCode: "2570", closed: false, initialCandidates, ...options }));
  return { render, refreshes: () => refreshes, cleanup: () => harness.hide(),
    tick: async () => { const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) await callback(); },
  };
}

const checkbox = (ui, id) => nodes(ui.render()).find((node) => node.props.type === "checkbox" && node.props.value === id);
const button = (ui, label) => nodes(ui.render()).find((node) => node.type === "Button" && text(node) === label);
const dialog = (ui) => nodes(ui.render()).find((node) => node.type === "ConfirmDialog");
function submit(ui, description = "Help prepare room") {
  nodes(ui.render()).find((node) => node.type === "textarea").props.onChange({ target: { value: description } });
  nodes(ui.render()).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  return dialog(ui);
}

test("students can be selected immediately without searching and group confirmation sends one batch", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => { calls.push({ url, options }); return Response.json({ data: { awarded: 2 } }); });
  const ui = setup(t);
  assert.equal(calls.length, 0);
  assert.ok(checkbox(ui, "42"));
  assert.ok(checkbox(ui, "43"));
  checkbox(ui, "42").props.onChange();
  checkbox(ui, "43").props.onChange();
  assert.equal(checkbox(ui, "42").props.checked, true);
  assert.equal(checkbox(ui, "43").props.checked, true);
  const confirmation = submit(ui);
  assert.match(confirmation.props.description, /รวม 2 ดาว/);
  assert.equal(calls.length, 0);
  assert.equal(await confirmation.props.onConfirm(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/green-stars");
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.userIds, ["42", "43"]);
  assert.equal(body.academicYearId, "2");
  assert.equal(body.description, "Help prepare room");
  assert.equal(body.students, undefined);
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(ui.refreshes(), 1);
  assert.equal(checkbox(ui, "42").props.checked, false);
});

test("select-all toggles only displayed results and preserves selections from earlier searches", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    return Response.json({ data: [{ id: "44", name: "Third Student", studentCode: "001236" }] });
  });
  const ui = setup(t);
  checkbox(ui, "42").props.onChange();
  nodes(ui.render()).find((node) => node.props.id === "work-student-query").props.onChange({ target: { value: "Third" } });
  ui.render();
  await ui.tick();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith("q=Third"));
  button(ui, "เลือกทั้งหมดที่แสดง").props.onClick();
  assert.equal(checkbox(ui, "44").props.checked, true);
  button(ui, "ยกเลิกเลือกทั้งหมดที่แสดง").props.onClick();
  assert.equal(checkbox(ui, "44").props.checked, false);
  button(ui, "เลือกทั้งหมดที่แสดง").props.onClick();
  assert.match(text(ui.render()), /เลือกแล้ว 2 คน/);
  const confirmation = submit(ui);
  assert.deepEqual(confirmation.props.description.includes("First Student"), true);
  assert.deepEqual(confirmation.props.description.includes("Third Student"), true);
  confirmation.props.onOpenChange(false);
  nodes(ui.render()).find((node) => node.props.id === "work-student-query").props.onChange({ target: { value: "" } });
  assert.equal(checkbox(ui, "42").props.checked, true);
  assert.equal(checkbox(ui, "43").props.checked, false);
  button(ui, "ล้างที่เลือก").props.onClick();
  assert.equal(checkbox(ui, "42").props.checked, false);
  ui.cleanup();
});

test("select-all completes a partial selection, deduplicates and can clear it at the 500 student limit", (t) => {
  const candidates = Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: `Student ${i}`, studentCode: null }));
  const ui = setup(t, { initialCandidates: candidates });
  checkbox(ui, "0").props.onChange();
  button(ui, "เลือกทั้งหมดที่แสดง").props.onClick();
  assert.equal(nodes(ui.render()).filter((node) => node.props.type === "checkbox" && node.props.checked).length, 500);
  assert.equal(button(ui, "ยกเลิกเลือกทั้งหมดที่แสดง").props.disabled, false);
  assert.match(text(ui.render()), /เลือกแล้ว 500 คน/);
  button(ui, "ยกเลิกเลือกทั้งหมดที่แสดง").props.onClick();
  assert.equal(nodes(ui.render()).filter((node) => node.props.type === "checkbox" && node.props.checked).length, 0);
});

test("retrying an uncertain batch keeps its request ID, blocks duplicate clicks and uses a new ID for changed work", async (t) => {
  const bodies = [];
  let resolve;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 1) throw new Error("Connection lost");
    return new Promise((done) => { resolve = done; });
  });
  const ui = setup(t);
  checkbox(ui, "42").props.onChange();
  assert.equal(await submit(ui).props.onConfirm(), false);
  const pending = dialog(ui).props.onConfirm();
  assert.equal(await dialog(ui).props.onConfirm(), false);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].requestId, bodies[1].requestId);
  resolve(Response.json({ message: "Try again" }, { status: 500 }));
  assert.equal(await pending, false);
  dialog(ui).props.onOpenChange(false);
  submit(ui, "Different work");
  const next = dialog(ui).props.onConfirm();
  assert.notEqual(bodies[2].requestId, bodies[0].requestId);
  resolve(Response.json({ data: { awarded: 1 } }));
  assert.equal(await next, true);
});

test("closed years expose no award form or student searches", async (t) => {
  let searches = 0;
  t.mock.method(globalThis, "fetch", async () => { searches++; throw new Error("Unexpected request"); });
  const ui = setup(t, { closed: true });
  assert.ok(!nodes(ui.render()).some((node) => node.type === "form"));
  await ui.tick();
  assert.equal(searches, 0);
});

test("both staff pages preload candidates and place modal actions above history", async () => {
  for (const area of ["admin", "organizer"]) {
    for (const status of ["ACTIVE", "CLOSED"]) {
      let candidateLoads = 0;
      const { GreenStarsPage } = loadTypeScript("../components/green-stars-page.tsx", {
        "next/navigation": { notFound() { throw new Error("NOT_FOUND"); }, redirect() { throw new Error("REDIRECT"); } },
        "@/lib/prisma": {}, "@/lib/helpers": {}, "@/lib/permissions": {},
        "@/lib/dal": { requireAdminAccess: async () => ({}), requireOrganizerAccess: async () => ({}) },
        "@/lib/green-star-work": { getStandaloneGreenStarCandidates: async () => { candidateLoads++; return initialCandidates; } },
        "@/lib/student-academic-years": { getStudentYearContext: async (params) => ({ years: [], selectedYear: { id: "2", code: "2570", status }, searchParams: await params }) },
        "@/components/green-stars-filters": { GreenStarsFilters: "filters" },
        "@/components/green-star-manager": { GreenStarManager: "manager" },
        "@/components/green-work-actions": { GreenWorkActions: "actions" },
        "@/components/green-star-excel-import": { GreenStarExcelImport: "excel" },
        "@/components/green-work-history": { GreenWorkHistory: "history" },
      });
      const shell = GreenStarsPage({ area, searchParams: Promise.resolve({ academicYearId: "2", page: "2", pageSize: "10" }) });
      const content = await shell.props.children.type(shell.props.children.props);
      const sections = nodes(content).filter((node) => ["actions", "history"].includes(node.type));
      assert.deepEqual(sections.map((node) => node.type), ["actions", "history"]);
      assert.equal(candidateLoads, status === "ACTIVE" ? 1 : 0);
      assert.deepEqual(sections[0].props.initialCandidates, status === "ACTIVE" ? initialCandidates : []);
      assert.equal(sections[1].props.yearId, "2");
      assert.equal(sections[1].props.requestedPage, 2);
      assert.equal(sections[1].props.requestedPageSize, 10);
    }
  }
});

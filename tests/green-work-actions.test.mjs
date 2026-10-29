import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";
import { reactHarness, nodes, text } from "./activity-live-harness.mjs";

function setup(closed = false) {
  const harness = reactHarness();
  const mocks = Object.fromEntries([
    ["button", ["Button"]], ["card", ["Card", "CardHeader", "CardTitle", "CardDescription"]],
    ["dialog", ["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription"]],
  ].map(([file, names]) => [`@/components/ui/${file}`, Object.fromEntries(names.map((name) => [name, name]))]));
  const { GreenWorkActions } = loadTypeScript("../components/green-work-actions.tsx", {
    ...mocks, react: harness.react, "lucide-react": {},
    "@/components/green-work-award-form": { GreenWorkAwardForm: "AwardForm" },
    "@/components/green-star-excel-import": { GreenStarExcelImport: "ExcelImport" },
  });
  return () => harness.render(() => GreenWorkActions({ yearId: "2", yearCode: "2570", closed, initialCandidates: [] }));
}

const dialog = (render, id) => nodes(render()).find((node) => node.type === "Dialog" && nodes(node).some((child) => child.props.id === id));
const button = (render, label) => nodes(render()).find((node) => node.type === "Button" && text(node) === label);

test("general work opens add-student and Excel modals with the selected academic year", () => {
  const render = setup();
  assert.equal(dialog(render, "work-add-dialog").props.open, false);
  assert.equal(dialog(render, "work-import-dialog").props.open, false);
  button(render, "เพิ่มนิสิตช่วยงาน").props.onClick();
  assert.equal(dialog(render, "work-add-dialog").props.open, true);
  const form = nodes(dialog(render, "work-add-dialog")).find((node) => node.type === "AwardForm");
  assert.equal(form.props.yearId, "2");
  form.props.onAwarded();
  assert.equal(dialog(render, "work-add-dialog").props.open, false);
  button(render, "นำเข้า Excel").props.onClick();
  assert.equal(dialog(render, "work-import-dialog").props.open, true);
  assert.deepEqual(nodes(dialog(render, "work-import-dialog")).find((node) => node.type === "ExcelImport").props.target, { mode: "work", academicYearId: "2" });
  dialog(render, "work-import-dialog").props.onOpenChange(false);
  assert.equal(dialog(render, "work-import-dialog").props.open, false);
});

test("closed years disable both general-work action buttons", () => {
  const render = setup(true);
  assert.equal(button(render, "เพิ่มนิสิตช่วยงาน").props.disabled, true);
  assert.equal(button(render, "นำเข้า Excel").props.disabled, true);
  assert.equal(nodes(render()).find((node) => node.type === "ExcelImport").props.disabled, true);
});

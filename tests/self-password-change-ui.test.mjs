import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";
import { reactHarness, nodes, text } from "./activity-live-harness.mjs";

function form({ hasPassword = true } = {}) {
  const harness = reactHarness();
  const mocks = { react: { ...harness.react, useId: () => "self-password" }, "lucide-react": {} };
  for (const [file, names] of [["button", ["Button"]], ["input", ["Input"]], ["label", ["Label"]], ["alert", ["Alert", "AlertDescription"]], ["card", ["Card", "CardContent", "CardHeader", "CardTitle", "CardDescription"]]]) {
    mocks[`@/components/ui/${file}`] = Object.fromEntries(names.map((name) => [name, name]));
  }
  const { ChangePasswordForm } = loadTypeScript("../components/change-password-form.tsx", mocks);
  const render = () => harness.render(() => ChangePasswordForm({ hasPassword }));
  return { render,
    fill(currentPassword = "old-password", password = "new-password", confirmPassword = password) {
      for (const [name, value] of Object.entries({ currentPassword, password, confirmPassword })) {
        nodes(render()).find((node) => node.type === "Input" && node.props.name === name).props.onChange({ target: { value } });
      }
    },
    submit: () => nodes(render()).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }),
  };
}

test("profile password form uses empty password inputs with correct autocomplete and an explicit reveal button", () => {
  const ui = form();
  const fields = nodes(ui.render()).filter((node) => node.type === "Input");
  assert.equal(fields.length, 3);
  assert.ok(fields.every((node) => node.props.type === "password" && node.props.value === ""));
  assert.equal(fields[0].props.autoComplete, "current-password");
  assert.ok(fields.slice(1).every((node) => node.props.autoComplete === "new-password"));
  nodes(ui.render()).find((node) => node.type === "Button" && text(node) === "แสดงรหัสผ่าน").props.onClick();
  assert.ok(nodes(ui.render()).filter((node) => node.type === "Input").every((node) => node.props.type === "text"));
});

test("form rejects missing current password, mismatched confirmation, reused passwords and excessive UTF-8 length", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return Response.json({}); });
  for (const values of [["", "new-password"], ["old-password", "short"], ["old-password", "new-password", "wrong"], ["old-password", "old-password"], ["old-password", "ก".repeat(25)]]) {
    const ui = form();
    ui.fill(...values); await ui.submit();
    assert.ok(nodes(ui.render()).some((node) => node.props?.role === "alert"));
  }
  assert.equal(requests, 0);
});

test("saving only sends password fields once, disables inputs while pending, and clears all secrets on success", async (t) => {
  const requests = [];
  let finish;
  t.mock.method(globalThis, "fetch", async (url, options) => { requests.push({ url, options }); return new Promise((resolve) => { finish = resolve; }); });
  const ui = form(); ui.fill();
  const saved = ui.submit(); await ui.submit();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/users/me/password");
  assert.equal(requests[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(requests[0].options.body), { currentPassword: "old-password", password: "new-password", confirmPassword: "new-password" });
  assert.ok(nodes(ui.render()).filter((node) => node.type === "Input").every((node) => node.props.disabled));
  finish(Response.json({ data: { changed: true } })); await saved;
  assert.ok(nodes(ui.render()).filter((node) => node.type === "Input").every((node) => node.props.value === "" && node.props.type === "password"));
  assert.ok(nodes(ui.render()).some((node) => node.props?.role === "status" && text(node).includes("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว")));
});

test("server or network errors allow retry and never display a successful change", async (t) => {
  let networkFailure = false;
  t.mock.method(globalThis, "fetch", async () => { if (networkFailure) throw new Error("offline"); return Response.json({ message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }, { status: 403 }); });
  const ui = form(); ui.fill(); await ui.submit();
  assert.ok(text(ui.render()).includes("รหัสผ่านปัจจุบันไม่ถูกต้อง"));
  networkFailure = true; await ui.submit();
  assert.ok(text(ui.render()).includes("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้"));
  assert.equal(nodes(ui.render()).some((node) => node.props?.role === "status"), false);
  assert.ok(nodes(ui.render()).filter((node) => node.type === "Input").every((node) => !node.props.disabled));
});

test("accounts without a local password get clear instructions instead of an unusable form", () => {
  const tree = form({ hasPassword: false }).render();
  assert.ok(text(tree).includes("กรุณาติดต่อผู้ดูแลระบบ"));
  assert.equal(nodes(tree).some((node) => node.type === "form"), false);
});

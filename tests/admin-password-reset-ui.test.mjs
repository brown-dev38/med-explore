import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";
import { reactHarness, nodes, text } from "./activity-live-harness.mjs";

function controls() {
  const mocks = {};
  for (const [file, names] of [
    ["button", ["Button"]], ["input", ["Input"]], ["label", ["Label"]], ["badge", ["Badge"]],
    ["alert", ["Alert", "AlertDescription"]],
    ["dialog", ["Dialog", "DialogContent", "DialogTitle", "DialogDescription", "DialogFooter", "DialogHeader"]],
    ["card", ["Card", "CardContent", "CardDescription", "CardHeader", "CardTitle"]],
    ["table", ["Table", "TableBody", "TableCell", "TableHead", "TableHeader", "TableRow"]],
  ]) mocks[`@/components/ui/${file}`] = Object.fromEntries(names.map((name) => [name, name]));
  return mocks;
}
function dialog() {
  const harness = reactHarness();
  const notices = [];
  let closes = 0;
  const { ResetUserPasswordDialog } = loadTypeScript("../components/reset-user-password-dialog.tsx", {
    ...controls(), react: { ...harness.react, useId: () => "reset" }, "lucide-react": {},
    sonner: { toast: { success: (message) => notices.push(message) } },
  });
  const render = () => harness.render(() => ResetUserPasswordDialog({ user: { id: "2", username: "student", email: "student@example.test" }, onClose: () => { closes++; } }));
  const fields = () => nodes(render()).filter((node) => node.type === "Input");
  return { render, notices, closes: () => closes,
    fill(password, confirmPassword = password) { fields()[0].props.onChange({ target: { value: password } }); fields()[1].props.onChange({ target: { value: confirmPassword } }); },
    submit: () => nodes(render()).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }),
  };
}

test("password dialog opens empty, lets ADMIN reveal only the new values, and rejects mismatched confirmation", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return Response.json({}); });
  const ui = dialog();
  const fields = nodes(ui.render()).filter((node) => node.type === "Input");
  assert.ok(fields.every((node) => node.props.type === "password" && node.props.value === "" && node.props.autoComplete === "new-password"));
  assert.ok(text(ui.render()).includes("ดูรหัสผ่านเดิมไม่ได้"));
  ui.fill("new-password", "different-password");
  await ui.submit();
  assert.equal(requests, 0);
  assert.ok(text(ui.render()).includes("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน"));
  nodes(ui.render()).find((node) => node.type === "Button" && text(node) === "แสดงรหัสผ่านใหม่").props.onClick();
  assert.ok(nodes(ui.render()).filter((node) => node.type === "Input").every((node) => node.props.type === "text"));
});

test("saving sends one request, blocks closing while pending, and clears entered passwords on success", async (t) => {
  const requests = [];
  let finish;
  t.mock.method(globalThis, "fetch", async (url, options) => { requests.push({ url, options }); return new Promise((resolve) => { finish = resolve; }); });
  const ui = dialog();
  ui.fill("new-password");
  const saved = ui.submit();
  await ui.submit();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/users/2/password");
  assert.equal(requests[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(requests[0].options.body), { password: "new-password", confirmPassword: "new-password" });
  ui.render().props.onOpenChange(false);
  assert.equal(ui.closes(), 0);
  assert.ok(nodes(ui.render()).filter((node) => node.type === "Input").every((node) => node.props.disabled));
  finish(Response.json({ success: true, data: { id: "2" } }));
  await saved;
  assert.equal(ui.closes(), 1);
  assert.ok(nodes(ui.render()).filter((node) => node.type === "Input").every((node) => node.props.value === ""));
  assert.equal(ui.notices.length, 1);
  assert.ok(!ui.notices[0].includes("new-password"));
});

test("server rejection stays visible and allows retry without closing the dialog", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ message: "ไม่มีสิทธิ์เปลี่ยนรหัสผ่าน" }, { status: 403 }));
  const ui = dialog();
  ui.fill("new-password");
  await ui.submit();
  assert.equal(ui.closes(), 0);
  assert.ok(text(ui.render()).includes("ไม่มีสิทธิ์เปลี่ยนรหัสผ่าน"));
  assert.ok(nodes(ui.render()).filter((node) => node.type === "Input").every((node) => !node.props.disabled));
});

test("only ADMIN sees reset controls for students and organizers, and opening another account gets a fresh dialog", () => {
  const harness = reactHarness();
  const { UsersTable } = loadTypeScript("../app/admin/users/users-table.tsx", {
    ...controls(), react: harness.react, "lucide-react": {}, sonner: { toast: {} },
    "@/lib/permissions": loadTypeScript("../lib/permissions.ts"),
    "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
    "@/components/create-user-dialog": { CreateUserDialog: "CreateUserDialog" },
    "@/components/user-role-selector": { UserRoleSelector: "UserRoleSelector" },
    "@/components/reset-user-password-dialog": { ResetUserPasswordDialog: "ResetUserPasswordDialog" },
  });
  const props = { currentUserId: "1", canDeleteUsers: true, initialResult: {
    items: ["ADMIN", "STUDENT", "ORGANIZER"].map((role, index) => ({ id: String(index + 1), username: role, email: role+"@example.test", roles: [role], isActive: true })),
    page: 1, totalPages: 1, total: 3, activeAdminCount: 1,
  } };
  const render = (canResetPasswords = true) => harness.render(() => UsersTable({ ...props, canResetPasswords }));
  const resetButtons = (tree) => nodes(tree).filter((node) => node.type === "Button" && node.props["aria-label"]?.startsWith("เปลี่ยนรหัสผ่าน"));
  assert.equal(resetButtons(render(false)).length, 0);
  const buttons = resetButtons(render());
  assert.deepEqual(buttons.map((node) => node.props["aria-label"]), ["เปลี่ยนรหัสผ่าน STUDENT", "เปลี่ยนรหัสผ่าน ORGANIZER"]);
  buttons[0].props.onClick();
  const first = nodes(render()).find((node) => node.type === "ResetUserPasswordDialog");
  assert.equal(first.props.user.id, "2");
  first.props.onClose();
  assert.equal(nodes(render()).some((node) => node.type === "ResetUserPasswordDialog"), false);
  resetButtons(render())[1].props.onClick();
  const next = nodes(render()).find((node) => node.type === "ResetUserPasswordDialog");
  assert.equal(next.props.user.id, "3");
  assert.notEqual(next.key, first.key);
});

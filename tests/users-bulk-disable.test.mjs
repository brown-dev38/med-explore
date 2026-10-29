import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { loadTypeScript } from "./load-typescript.mjs";
import { browser, reactHarness, nodes, text } from "./activity-live-harness.mjs";

function mount(t, { failingId, activeAdminCount = 2, inactiveIds = ["3"] } = {}) {
  const users = Array.from({ length: 12 }, (_, index) => ({
    id: String(index + 1), username: `user-${index + 1}`, email: `user-${index + 1}@example.test`,
    firstname: "Test", lastname: String(index + 1), studentCode: `00123${index + 1}`, isActive: !inactiveIds.includes(String(index + 1)),
    roles: index < 2 ? ["ADMIN"] : ["STUDENT"], createdAt: new Date().toISOString(),
  }));
  const result = (page) => ({ items: users.slice((page - 1) * 10, page * 10), total: users.length, activeAdminCount, page, pageSize: 10, totalPages: 2 });
  const writes = [];
  const reads = [];
  browser(t, async (url, options) => {
    if (options?.method === "PATCH") {
      const id = url.split("/").at(-1);
      writes.push({ id, body: JSON.parse(options.body) });
      if (id === failingId) return Response.json({ message: "มีการแก้ไขข้อมูลพร้อมกัน กรุณาลองใหม่" }, { status: 409 });
      users.find((user) => user.id === id).isActive = JSON.parse(options.body).isActive;
      return Response.json({ success: true });
    }
    reads.push(new URL(url, "https://example.test"));
    return Response.json({ data: result(Number(reads.at(-1).searchParams.get("page") ?? 1)) });
  });
  const hooks = reactHarness();
  const mocks = { react: hooks.react, "lucide-react": {}, "sonner": { toast: { success() {}, error() {} } },
    "@/lib/permissions": loadTypeScript("../lib/permissions.ts"),
    "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
    "@/components/create-user-dialog": { CreateUserDialog: "CreateUserDialog" },
    "@/components/user-role-selector": { UserRoleSelector: "UserRoleSelector" },
    "@/components/reset-user-password-dialog": { ResetUserPasswordDialog: "ResetUserPasswordDialog" },
  };
  for (const [file, names] of [
    ["button", ["Button"]], ["badge", ["Badge"]], ["input", ["Input"]], ["label", ["Label"]],
    ["card", ["Card", "CardContent", "CardDescription", "CardHeader", "CardTitle"]],
    ["table", ["Table", "TableHeader", "TableHead", "TableBody", "TableRow", "TableCell"]],
    ["dialog", ["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"]],
  ]) mocks[`@/components/ui/${file}`] = Object.fromEntries(names.map((name) => [name, name]));
  const { UsersTable } = loadTypeScript("../app/admin/users/users-table.tsx", mocks);
  const initialResult = result(1);
  const render = () => nodes(hooks.render(() => UsersTable({ initialResult, currentUserId: "1", canDeleteUsers: true })));
  const button = (label) => render().find((node) => node.type === "Button" && text(node) === label);
  const checkbox = (id) => render().find((node) => node.type === "input" && node.props["aria-label"] === `เลือกผู้ใช้ user-${id}`);
  const confirm = () => render().find((node) => node.type === "ConfirmDialog" && node.props.open);
  return { render, button, checkbox, confirm, writes, reads };
}

test("bulk selection includes inactive users but excludes self and the last active admin, and select-all toggles", (t) => {
  const api = mount(t, { activeAdminCount: 1 });
  assert.equal(api.checkbox("1").props.disabled, true);
  assert.equal(api.checkbox("2").props.disabled, true);
  assert.equal(api.checkbox("3").props.disabled, false);
  api.button("เลือกทั้งหมดในหน้านี้").props.onClick();
  assert.equal(api.checkbox("4").props.checked, true);
  api.button("ยกเลิกเลือกทั้งหมดในหน้านี้").props.onClick();
  assert.equal(api.checkbox("4").props.checked, false);
  assert.equal(api.button("ปิดใช้งานที่เลือก").props.disabled, true);
  assert.deepEqual(api.writes, []);
});

test("bulk disable preserves selections across pages, confirms once and retains failed accounts for retry", async (t) => {
  const api = mount(t, { failingId: "4" });
  api.checkbox("4").props.onChange();
  await api.button("ถัดไป").props.onClick();
  // Pagination starts an asynchronous list request.
  await setImmediate();
  api.checkbox("11").props.onChange();
  api.button("ปิดใช้งานที่เลือก").props.onClick();
  assert.match(api.confirm().props.title, /2 บัญชี/);
  assert.deepEqual(api.writes, [], "no account changes before confirmation");
  const pending = api.confirm().props.onConfirm();
  assert.equal(api.button("ปิดใช้งานที่เลือก").props.disabled, true);
  await pending;
  assert.deepEqual(api.writes, [{ id: "4", body: { isActive: false } }, { id: "11", body: { isActive: false } }]);
  assert.equal(api.checkbox("11").props.disabled, false);
  assert.equal(api.checkbox("11").props.checked, false);
  const alert = api.render().find((node) => node.props.role === "alert");
  assert.match(text(alert), /user-4: มีการแก้ไขข้อมูลพร้อมกัน/);
  assert.ok(api.render().some((node) => node.type === "span" && text(node).includes("เลือกแล้ว 1 บัญชี")));
  api.button("ล้างการเลือก").props.onClick();
  assert.equal(api.button("ปิดใช้งานที่เลือก").props.disabled, true);
});

test("bulk activation updates only inactive selections and leaves active selections available for deactivation", async (t) => {
  const api = mount(t, { inactiveIds: ["3", "5"] });
  for (const id of ["3", "4", "5"]) api.checkbox(id).props.onChange();
  assert.equal(api.button("เปิดใช้งานที่เลือก").props.disabled, false);
  assert.equal(api.button("ปิดใช้งานที่เลือก").props.disabled, false);
  api.button("เปิดใช้งานที่เลือก").props.onClick();
  assert.match(api.confirm().props.title, /เปิดใช้งานผู้ใช้ 2 บัญชี/);
  assert.deepEqual(api.writes, []);
  await api.confirm().props.onConfirm();
  assert.deepEqual(api.writes, [{ id: "3", body: { isActive: true } }, { id: "5", body: { isActive: true } }]);
  assert.equal(api.checkbox("3").props.checked, false);
  assert.equal(api.checkbox("4").props.checked, true);
  assert.equal(api.button("เปิดใช้งานที่เลือก").props.disabled, true);
  api.button("ปิดใช้งานที่เลือก").props.onClick();
  await api.confirm().props.onConfirm();
  assert.deepEqual(api.writes.at(-1), { id: "4", body: { isActive: false } });
});

test("student-code searches preserve leading zeros and query the complete user list", async (t) => {
  const api = mount(t);
  api.render().find((node) => node.type === "Input" && node.props.id === "search-q").props.onChange({ target: { value: " 001234 " } });
  api.render().find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  await setImmediate();
  assert.equal(api.reads.at(-1).searchParams.get("q"), "001234");
  assert.equal(api.reads.at(-1).searchParams.get("page"), "1");
});

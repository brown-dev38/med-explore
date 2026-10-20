import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { loadTypeScript } from "./load-typescript.mjs";
import { reactHarness, nodes, text } from "./activity-live-harness.mjs";

function controls() {
  const mocks = {};
  for (const [file, names] of [["button", ["Button"]], ["input", ["Input"]], ["label", ["Label"]], ["alert", ["Alert", "AlertDescription", "AlertTitle"]], ["card", ["Card", "CardHeader", "CardTitle", "CardDescription", "CardContent"]]]) {
    mocks[`@/components/ui/${file}`] = Object.fromEntries(names.map((name) => [name, name]));
  }
  return mocks;
}

test("login always shows Microsoft, disables it until configured, and retains password authentication", async () => {
  for (const enabled of [false, true]) {
    const harness = reactHarness();
    const calls = [];
    const pushes = [];
    let microsoftRequests = 0;
    const LoginForm = loadTypeScript("../app/login/login-form.tsx", {
      ...controls(), react: harness.react, "next/link": "a", "lucide-react": {}, sonner: { toast: { success() {} } },
      "next/navigation": { useRouter: () => ({ push: (url) => pushes.push(url), refresh() {} }), useSearchParams: () => new URLSearchParams() },
      "@/lib/permissions": loadTypeScript("../lib/permissions.ts"), "@/lib/session-notices": { getSessionNotice: () => null },
      "@/components/suspended-account-dialog": { SuspendedAccountDialog: "dialog" }, "@/components/microsoft-icon": { MicrosoftIcon: "icon" },
      "@/lib/auth-client": { getMicrosoftSignInUrl: async () => { microsoftRequests++; }, signInWithCredentials: async (...args) => { calls.push(args); return { ok: true, session: { user: { roles: ["STUDENT"] } } }; } },
    }).default;
    const render = () => harness.render(() => LoginForm({ microsoftEnabled: enabled }));
    const tree = render();
    const microsoft = nodes(tree).find((node) => node.type === "Button" && text(node) === "เข้าสู่ระบบด้วย Microsoft");
    assert.equal(microsoft.props.disabled, !enabled);
    assert.equal(microsoft.props.type, "button");
    assert.equal(microsoft.props["aria-describedby"], "microsoft-login-status");
    assert.ok(text(tree).includes(enabled ? "สำหรับบัญชีองค์กรที่ผูกไว้ในโปรไฟล์แล้ว" : "Microsoft ยังไม่เปิดให้บริการ"));
    if (!enabled) await microsoft.props.onClick();
    assert.equal(microsoftRequests, 0);
    nodes(tree).find((node) => node.props?.id === "identifier").props.onChange({ target: { value: "student" } });
    nodes(tree).find((node) => node.props?.id === "password").props.onChange({ target: { value: "password" } });
    await render().props.onSubmit({ preventDefault() {} });
    assert.deepEqual(calls, [["student", "password", "/"]]);
    assert.deepEqual(pushes, ["/dashboard"]);
  }
});

test("profile requires a password before linking and starts OAuth only after the server creates the intent", async (t) => {
  const harness = reactHarness();
  const calls = [];
  const oauth = [];
  const destinations = [];
  const old = globalThis.window;
  globalThis.window = { location: { assign: (url) => destinations.push(url) } };
  t.after(() => { if (old === undefined) delete globalThis.window; else globalThis.window = old; });
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    calls.push({ url, options });
    return Response.json({ data: options.method === "POST" ? { callbackUrl: "/dashboard/profile?microsoft=linked" } : { enabled: true, account: null } });
  });
  const { MicrosoftAccountSettings } = loadTypeScript("../components/microsoft-account-settings.tsx", {
    ...controls(), react: { ...harness.react, useId: () => "local-password" }, "lucide-react": {},
    "next/navigation": { useRouter: () => ({}), useSearchParams: () => new URLSearchParams() },
    "@/components/microsoft-icon": { MicrosoftIcon: "icon" }, "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
    "@/lib/auth-client": { getMicrosoftSignInUrl: async (...args) => { oauth.push(args); return "https://login.microsoftonline.com/authorize"; } },
  });
  const render = () => harness.render(() => MicrosoftAccountSettings());
  render(); await setImmediate();
  let tree = render();
  assert.equal(nodes(tree).find((node) => node.type === "Button" && text(node) === "ผูกบัญชี Microsoft").props.disabled, true);
  nodes(tree).find((node) => node.type === "Input").props.onChange({ target: { value: "local-password" } });
  tree = render();
  nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  await setImmediate();
  assert.deepEqual(JSON.parse(calls[1].options.body), { password: "local-password" });
  assert.deepEqual(oauth, [["/dashboard/profile?microsoft=linked", true]]);
  assert.deepEqual(destinations, ["https://login.microsoftonline.com/authorize"]);
});

test("staff viewing another student's profile never see Microsoft linking controls", async () => {
  const ProfileView = loadTypeScript("../components/profile-view.tsx", {
    ...controls(), "lucide-react": {}, "next/navigation": { redirect() { throw new Error("unexpected redirect"); } },
    "@/lib/prisma": { prisma: { user: { findUnique: async () => ({}) } } },
    "@/lib/dal": { requireAuth: async () => ({ id: "7" }) },
    "@/lib/student-dashboard": { getStudentDashboardContext: async () => ({ user: { id: "42" } }) },
    "@/lib/users": { toUserDto: () => ({ username: "student", email: "student@university.test", roles: ["STUDENT"], isActive: true }) },
    "@/components/ui/badge": { Badge: "Badge" },
    "@/components/microsoft-account-settings": { MicrosoftAccountSettings: "MicrosoftAccountSettings" },
    "@/components/change-password-form": { ChangePasswordForm: "ChangePasswordForm" },
  }).ProfileView;
  assert.ok(nodes(await ProfileView({})).some((node) => node.type === "MicrosoftAccountSettings"));
  assert.ok(nodes(await ProfileView({})).some((node) => node.type === "ChangePasswordForm"));
  const target = { area: "admin", id: "42" };
  assert.equal(nodes(await ProfileView({ target })).some((node) => node.type === "MicrosoftAccountSettings"), false);
  assert.equal(nodes(await ProfileView({ target })).some((node) => node.type === "ChangePasswordForm"), false);
});

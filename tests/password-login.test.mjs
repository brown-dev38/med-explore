import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";
import { reactHarness, nodes, text } from "./activity-live-harness.mjs";

function controls() {
  const mocks = {};
  for (const [file, names] of [["button", ["Button"]], ["input", ["Input"]], ["label", ["Label"]], ["alert", ["Alert", "AlertDescription", "AlertTitle"]], ["card", ["Card", "CardHeader", "CardTitle", "CardDescription", "CardContent"]]]) {
    mocks[`@/components/ui/${file}`] = Object.fromEntries(names.map((name) => [name, name]));
  }
  return mocks;
}

test("only the password provider can sign in and it uses the existing local account and permissions", async () => {
  const queries = [];
  const authUser = loadTypeScript("../lib/auth-user.ts");
  let user = { id: 7n, username: "student", firstname: "Student", lastname: "Name", email: "student@example.test", isActive: true, passwordHash: "stored-hash",
    userRoles: [{ role: { name: "STUDENT", permissions: [{ permission: { code: "activity.read" } }] } }] };
  const options = loadTypeScript("../lib/auth.ts", {
    "next-auth": { getServerSession: async () => null },
    "next-auth/providers/credentials": (options) => ({ ...options, id: "credentials" }),
    "@/lib/prisma": { prisma: { user: { findFirst: async (query) => { queries.push(query); return user; } } } },
    "@/lib/account-status": {}, "@/lib/auth-user": authUser,
    bcrypt: { compare: async (password, hash) => password === "password" && hash === "stored-hash" },
  }).authOptions;
  assert.deepEqual(options.providers.map((provider) => provider.id), ["credentials"]);
  assert.equal(await options.callbacks.signIn({ account: { provider: "credentials" } }), true);
  for (const account of [null, { provider: "azure-ad" }, { provider: "other" }]) {
    assert.equal(await options.callbacks.signIn({ account }), false);
  }
  const provider = options.providers[0];
  assert.deepEqual(await provider.authorize({ username: " student ", password: "password" }), {
    id: "7", name: "Student Name", email: user.email, role: "STUDENT", roles: ["STUDENT"], permissions: ["activity.read"],
  });
  assert.deepEqual(queries[0], { where: { OR: [{ studentCode: "student" }, { email: "student" }, { username: "student" }] }, include: authUser.authUserRelations });
  assert.equal(await provider.authorize({ username: "student", password: "wrong" }), null);
  user = { ...user, isActive: false };
  assert.equal(await provider.authorize({ username: "student", password: "password" }), null);
  user = { ...user, isActive: true, passwordHash: null };
  assert.equal(await provider.authorize({ username: "student", password: "password" }), null);
  user = null;
  assert.equal(await provider.authorize({ username: "missing", password: "password" }), null);
  assert.equal(await provider.authorize({ username: " ", password: "password" }), null);
});

test("login offers password authentication and opens the user's dashboard", async () => {
  const harness = reactHarness();
  const calls = [];
  const pushes = [];
  const LoginForm = loadTypeScript("../app/login/login-form.tsx", {
    ...controls(), react: harness.react, "next/link": "a", "lucide-react": {}, sonner: { toast: { success() {} } },
    "next/navigation": { useRouter: () => ({ push: (url) => pushes.push(url), refresh() {} }), useSearchParams: () => new URLSearchParams() },
    "@/lib/permissions": loadTypeScript("../lib/permissions.ts"), "@/lib/session-notices": { getSessionNotice: () => null },
    "@/components/suspended-account-dialog": { SuspendedAccountDialog: "dialog" },
    "@/lib/auth-client": { signInWithCredentials: async (...args) => { calls.push(args); return { ok: true, session: { user: { roles: ["STUDENT"] } } }; } },
  }).default;
  const render = () => harness.render(() => LoginForm());
  const tree = render();
  assert.doesNotMatch(text(tree), /Microsoft/i);
  assert.equal(nodes(tree).filter((node) => node.type === "Button" && node.props.type === "submit").length, 1);
  nodes(tree).find((node) => node.props?.id === "identifier").props.onChange({ target: { value: " student " } });
  nodes(tree).find((node) => node.props?.id === "password").props.onChange({ target: { value: "password" } });
  await render().props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [["student", "password", "/"]]);
  assert.deepEqual(pushes, ["/dashboard"]);
});

test("profiles offer password changes only to the owner and have no account linking controls", async () => {
  const ProfileView = loadTypeScript("../components/profile-view.tsx", {
    ...controls(), "lucide-react": {}, "next/navigation": { redirect() { throw new Error("unexpected redirect"); } },
    "@/lib/prisma": { prisma: { user: { findUnique: async () => ({ passwordHash: "stored-hash" }) } } },
    "@/lib/dal": { requireAuth: async () => ({ id: "7" }) },
    "@/lib/student-dashboard": { getStudentDashboardContext: async () => ({ user: { id: "42" } }) },
    "@/lib/users": { toUserDto: () => ({ username: "student", email: "student@example.test", roles: ["STUDENT"], isActive: true }) },
    "@/components/ui/badge": { Badge: "Badge" },
    "@/components/change-password-form": { ChangePasswordForm: "ChangePasswordForm" },
  }).ProfileView;
  const owner = await ProfileView({});
  assert.equal(nodes(owner).find((node) => node.type === "ChangePasswordForm").props.hasPassword, true);
  assert.doesNotMatch(text(owner), /Microsoft/i);
  for (const area of ["admin", "organizer"]) {
    const tree = await ProfileView({ target: { area, id: "42" } });
    assert.equal(nodes(tree).some((node) => node.type === "ChangePasswordForm"), false);
    assert.doesNotMatch(text(tree), /Microsoft/i);
  }
});

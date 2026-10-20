import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadTypeScript } from "./load-typescript.mjs";

const tenantId = "11111111-1111-1111-1111-111111111111";
const objectId = "22222222-2222-2222-2222-222222222222";
const clientId = "33333333-3333-3333-3333-333333333333";
const identity = { tenantId, objectId, label: "member@university.test" };
const config = loadTypeScript("../lib/microsoft-config.ts");
const permissions = loadTypeScript("../lib/permissions.ts");
const toAuthUser = loadTypeScript("../lib/auth-user.ts").toAuthUser;
const localUser = { id: 7n, username: "member", firstname: "Local", lastname: "User", email: "local@university.test", isActive: true,
  userRoles: [{ role: { name: "STUDENT", permissions: [{ permission: { code: "activity.read" } }] } }] };
const account = { provider: "azure-ad", providerAccountId: "verified-subject" };

function configured(t) {
  for (const [name, value] of Object.entries({ MICROSOFT_TENANT_ID: tenantId, MICROSOFT_CLIENT_ID: clientId, MICROSOFT_CLIENT_SECRET: "test-only", NEXTAUTH_URL: "https://portal.test" })) {
    const old = process.env[name]; process.env[name] = value;
    t.after(() => { if (old === undefined) delete process.env[name]; else process.env[name] = old; });
  }
}
const profile = (extra = {}) => ({ tid: tenantId, oid: objectId, sub: account.providerAccountId, iss: `https://login.microsoftonline.com/${tenantId}/v2.0`, email: identity.label, ...extra });

test("Microsoft requires a configured single tenant and rejects shared or personal endpoints", (t) => {
  configured(t);
  assert.ok(config.getMicrosoftConfig());
  for (const invalid of ["common", "organizations", "consumers", "9188040d-6c67-4c5b-b112-36a304b66dad", "", "bad"]) {
    process.env.MICROSOFT_TENANT_ID = invalid;
    assert.equal(config.getMicrosoftConfig(), null);
  }
  process.env.MICROSOFT_TENANT_ID = tenantId;
  delete process.env.MICROSOFT_CLIENT_SECRET;
  assert.equal(config.getMicrosoftConfig(), null);
});

test("validated token identity uses immutable tenant/object IDs and checks issuer and subject", (t) => {
  configured(t);
  assert.deepEqual(config.microsoftIdentityFromProfile(profile(), account.providerAccountId), identity);
  for (const extra of [{ tid: objectId }, { iss: "https://attacker.test" }, { sub: "other-subject" }, { oid: "email@university.test" }]) {
    assert.equal(config.microsoftIdentityFromProfile(profile(extra), account.providerAccountId), null);
  }
  for (const value of [null, "string", {}, []]) assert.equal(config.microsoftIdentityFromProfile(value, account.providerAccountId), null);
  const changed = config.microsoftIdentityFromProfile(profile({ email: "new@university.test" }), account.providerAccountId);
  assert.equal(changed.objectId, objectId);
  assert.equal(changed.label, "new@university.test");
  assert.equal(config.microsoftLinkCookieOptions().httpOnly, true);
  assert.equal(config.microsoftLinkCookieOptions().secure, true);
  assert.equal(config.microsoftLinkCookieOptions().maxAge, 600);
});

function service() {
  const intents = new Map();
  const accounts = new Map();
  const audits = [];
  let active = true;
  const prisma = {
    user: { findUnique: async () => ({ isActive: active, passwordHash: "hash" }) },
    microsoftAccount: {
      findUnique: async ({ where }) => [...accounts.values()].find((a) => where.userId !== undefined ? a.userId === where.userId : a.tenantId === where.tenantId_objectId.tenantId && a.objectId === where.tenantId_objectId.objectId) ?? null,
      findFirst: async ({ where }) => [...accounts.values()].find((a) => a.id === where.id && a.userId === where.userId) ?? null,
      create: async ({ data }) => { const value = { id: 9n, ...data }; accounts.set(data.userId, value); return value; },
      deleteMany: async ({ where }) => { accounts.delete(where.userId); },
    },
    microsoftLinkIntent: {
      create: async ({ data }) => intents.set(data.id, data),
      deleteMany: async ({ where }) => {
        let count = 0;
        for (const [id, item] of intents) {
          const match = where.OR ? item.userId === where.OR[0].userId || item.expiresAt <= where.OR[1].expiresAt.lte
            : where.id ? id === where.id && item.userId === where.userId && item.expiresAt > where.expiresAt.gt : item.userId === where.userId;
          if (match) { intents.delete(id); count++; }
        }
        return { count };
      },
    },
    auditLog: { create: async ({ data }) => audits.push(data) },
    $transaction: async (fn) => {
      const oldIntents = new Map(intents), oldAccounts = new Map(accounts);
      try { return await fn(prisma); }
      catch (error) { intents.clear(); accounts.clear(); for (const [k,v] of oldIntents) intents.set(k,v); for (const [k,v] of oldAccounts) accounts.set(k,v); throw error; }
    },
  };
  const api = loadTypeScript("../lib/microsoft-accounts.ts", {
    "server-only": {}, "@/lib/prisma": { prisma }, "@/lib/microsoft-config": config,
    bcrypt: { compare: async (password) => password === "correct-password" },
  });
  return { ...api, intents, accounts, audits, suspend: () => { active = false; } };
}

test("linking requires the local password and stores only an expiring hash bound to the current user", async () => {
  const api = service();
  await assert.rejects(api.prepareMicrosoftLink("7", "wrong"), { code: "password" });
  assert.equal(api.intents.size, 0);
  const token = await api.prepareMicrosoftLink("7", "correct-password");
  const stored = [...api.intents.values()][0];
  assert.notEqual(stored.id, token);
  assert.equal(stored.id, createHash("sha256").update(token).digest("hex"));
  assert.equal(stored.userId, 7n);
  assert.ok(stored.expiresAt > new Date() && stored.expiresAt <= new Date(Date.now() + 600000));
  await assert.rejects(api.completeMicrosoftLink(token, "8", identity), { code: "expired" });
  assert.equal(api.accounts.size, 0);
  await api.completeMicrosoftLink(token, "7", identity);
  assert.equal(api.accounts.get(7n).objectId, objectId);
  assert.equal(api.audits[0].action, "auth.microsoft.link");
  await assert.rejects(api.completeMicrosoftLink(token, "7", identity), { code: "expired" });
});

test("new link attempts replace old intents; expired, suspended, and already used accounts cannot link", async () => {
  const api = service();
  const old = await api.prepareMicrosoftLink("7", "correct-password");
  const token = await api.prepareMicrosoftLink("7", "correct-password");
  assert.equal(api.intents.size, 1);
  await assert.rejects(api.completeMicrosoftLink(old, "7", identity), { code: "expired" });
  api.accounts.set(8n, { id: 10n, userId: 8n, ...identity });
  await assert.rejects(api.completeMicrosoftLink(token, "7", identity), { code: "in-use" });
  assert.equal(api.accounts.has(7n), false);
  api.accounts.clear();
  [...api.intents.values()][0].expiresAt = new Date(0);
  await assert.rejects(api.completeMicrosoftLink(token, "7", identity), { code: "expired" });
  const fresh = await api.prepareMicrosoftLink("7", "correct-password");
  api.suspend();
  await assert.rejects(api.completeMicrosoftLink(fresh, "7", identity), { code: "expired" });
});

test("unlink requires the local password and revokes linked sessions and pending intents", async () => {
  const api = service();
  api.accounts.set(7n, { id: 9n, userId: 7n, ...identity });
  assert.equal(await api.microsoftSessionIsLinked("9", "7"), true);
  await assert.rejects(api.unlinkMicrosoftAccount("7", "wrong"), { code: "password" });
  await api.unlinkMicrosoftAccount("7", "correct-password");
  assert.equal(await api.microsoftSessionIsLinked("9", "7"), false);
  assert.equal(api.audits[0].action, "auth.microsoft.unlink");
});

function auth({ linked = { id: 9n, user: localUser }, intent, session = null, complete = async () => {}, stillLinked = true } = {}) {
  return loadTypeScript("../lib/auth.ts", {
    "@/lib/prisma": {}, "@/lib/account-status": { getAccountStatus: async () => "ACTIVE" },
    "next-auth": { getServerSession: async () => session },
    "next-auth/providers/credentials": (options) => ({ ...options, id: "credentials" }),
    "next-auth/providers/azure-ad": (options) => ({ ...options, id: "azure-ad" }),
    "next/headers": { cookies: async () => ({ get: () => intent ? { value: intent } : undefined }) },
    "@/lib/microsoft-config": config, "@/lib/auth-user": { toAuthUser }, "@/lib/permissions": permissions,
    "@/lib/microsoft-accounts": { findMicrosoftAccount: async () => linked, completeMicrosoftLink: complete, microsoftSessionIsLinked: async () => stillLinked, MicrosoftAccountError: class extends Error {} },
  }).authOptions;
}

test("Microsoft sign-in refuses unlinked, wrong-tenant, or suspended accounts and enforces OIDC protections", async (t) => {
  configured(t);
  const options = auth({ linked: null });
  const provider = options.providers.find((p) => p.id === "azure-ad");
  assert.equal(provider.idToken, true);
  assert.deepEqual(provider.checks, ["pkce", "state", "nonce"]);
  assert.equal(await options.callbacks.signIn({ account, profile: profile() }), "/login?error=MicrosoftNotLinked");
  assert.equal(await options.callbacks.signIn({ account, profile: profile({ tid: objectId }) }), "/login?error=MicrosoftTenant");
  assert.equal(await auth({ linked: { id: 9n, user: { ...localUser, isActive: false } } }).callbacks.signIn({ account, profile: profile() }), "/login?reason=account-suspended");
  assert.equal(await auth().callbacks.signIn({ account, profile: profile() }), true);
});

test("Microsoft sessions use the existing local ID and local roles, even if Microsoft claims ADMIN", async (t) => {
  configured(t);
  const token = await auth().callbacks.jwt({ token: {}, account, profile: profile({ roles: ["ADMIN"] }), user: { id: objectId, roles: ["ADMIN"] } });
  assert.equal(token.uid, "7");
  assert.deepEqual(token.roles, ["STUDENT"]);
  assert.deepEqual(token.permissions, ["activity.read"]);
  assert.equal(token.email, localUser.email);
  assert.equal(token.microsoftAccountId, "9");
});

test("link callback requires a current local session and preserves that session instead of signing into a different user", async (t) => {
  configured(t);
  const args = { account, profile: profile() };
  assert.equal(await auth({ intent: "test" }).callbacks.signIn(args), "/login?error=MicrosoftLinkExpired");
  const calls = [];
  const options = auth({ intent: "test", session: { accountStatus: "ACTIVE", user: { id: "7", roles: ["ORGANIZER"] } }, complete: async (...args) => calls.push(args) });
  assert.equal(await options.callbacks.signIn(args), "/organizer/profile?microsoft=linked");
  assert.deepEqual(calls, [["test", "7", identity]]);
});

test("unlink invalidates Microsoft sessions but keeps credentials sessions working", async (t) => {
  configured(t);
  const callbacks = auth({ stillLinked: false }).callbacks;
  const microsoftToken = await callbacks.jwt({ token: { uid: "7", microsoftAccountId: "9", roles: ["STUDENT"] } });
  assert.equal(microsoftToken.uid, undefined);
  assert.equal(microsoftToken.accountStatus, "UNAUTHENTICATED");
  const passwordToken = await callbacks.jwt({ token: { uid: "7", roles: ["STUDENT"] } });
  assert.equal(passwordToken.uid, "7");
  const relogin = await callbacks.jwt({ token: { microsoftAccountId: "9" }, user: toAuthUser(localUser), account: { provider: "credentials" } });
  assert.equal(relogin.microsoftAccountId, undefined);
});

test("revoked Microsoft cookies cannot cause login redirect loops", async () => {
  const { proxy } = loadTypeScript("../proxy.ts", {
    "next-auth/jwt": { getToken: async () => ({ uid: "7", roles: ["STUDENT"], microsoftAccountId: "9" }) },
    "@/lib/permissions": permissions, "@/lib/account-status": { isActiveAccount: async () => true },
    "@/lib/microsoft-accounts": { microsoftSessionIsLinked: async () => false },
  });
  const response = await proxy({ nextUrl: { pathname: "/login" }, url: "https://portal.test/login", cookies: { getAll: () => [{ name: "next-auth.session-token" }] } });
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.cookies.getAll()[0].expires.getTime(), 0);
});

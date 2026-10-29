import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { once } from "node:events";
import { projectRoot } from "../scripts/production-env.mjs";

// Explicit opt-in: launches only a temporary LOOPBACK server against a closed
// local DB port. It never connects to the configured database or server IP.
test("the production launcher serves pages, secure namespaced auth cookies and API authorization", {
  skip: process.env.PRODUCTION_HTTP_TEST !== "1", timeout: 30000,
}, async (t) => {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((accept, reject) => listener.close((error) => error ? reject(error) : accept()));
  const child = spawn(process.execPath, ["scripts/start-production.mjs"], {
    cwd: projectRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", PORT: String(port),
      NEXTAUTH_URL: "https://127.0.0.2:8443", NEXTAUTH_SECRET: randomBytes(48).toString("base64url"),
      DATABASE_URL: "mysql://verification_only:verification-only-password@127.0.0.1:1/verification_only",
    },
  });
  // Drain output without logging connection diagnostics or request data.
  child.stdout.resume(); child.stderr.resume();
  t.after(async () => {
    if (child.exitCode !== null) return;
    const ended = once(child, "exit");
    if (process.platform === "win32") {
      // Windows SIGTERM ends a wrapper immediately; terminate only this test's
      // known process tree so the Next.js child cannot outlive the test.
      try {
        await promisify(execFile)("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
      } catch {
        // Restricted runners may deny process-tree enumeration. At least close
        // the wrapper and our inherited pipes; WinSW handles the full tree on IIS.
        child.kill("SIGTERM");
        child.stdout.destroy(); child.stderr.destroy();
      }
    } else child.kill("SIGTERM");
    await ended;
  });
  const origin = `http://127.0.0.1:${port}`;
  let login;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) assert.fail("Production launcher exited before it became ready");
    try { login = await fetch(`${origin}/login`, { redirect: "manual", signal: AbortSignal.timeout(1000) }); break; }
    catch { await setTimeout(200); }
  }
  assert.ok(login, "production server must become ready");
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("x-content-type-options"), "nosniff");
  assert.equal(login.headers.get("x-frame-options"), "DENY");
  assert.equal(login.headers.get("x-powered-by"), null);
  assert.match(await login.text(), /<html/);
  const csrf = await fetch(`${origin}/api/auth/csrf`);
  assert.equal(csrf.status, 200);
  assert.ok((await csrf.json()).csrfToken);
  const cookies = csrf.headers.getSetCookie();
  assert.ok(cookies.some((cookie) => cookie.startsWith("__Host-medexplore.csrf-token=") && /; Secure/i.test(cookie) && /; HttpOnly/i.test(cookie)));
  assert.ok(cookies.every((cookie) => !cookie.includes("next-auth.")), "do not overwrite another project's default cookies");
  const session = await fetch(`${origin}/api/auth/session`);
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), {});
  const users = await fetch(`${origin}/api/users`, { redirect: "manual" });
  assert.equal(users.status, 401);
});

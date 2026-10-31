import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadProductionEnvironment, validateProductionEnvironment, projectRoot } from "../scripts/production-env.mjs";

const valid = {
  DATABASE_URL: "mysql://med_explore_app:test-database-password@127.0.0.1:3306/med_explore",
  NEXTAUTH_URL: "https://10.205.10.200:8443",
  NEXTAUTH_SECRET: "pY6VvQ9F4pQhJ2L5AcJ3Z0W1xI4r7MB8cF1v6wY2",
  PORT: "3101",
};

test("production commands load only .env.production and explicit service environment takes precedence", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "medexplore-production-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, ".env"), "DATABASE_URL=mysql://do-not-use-dev-db\nNEXTAUTH_SECRET=development\n");
  assert.equal(loadProductionEnvironment(directory, {}).DATABASE_URL, undefined);
  writeFileSync(join(directory, ".env.production"), "PORT=3101\nNEXTAUTH_URL=https://10.205.10.200:8443\n");
  const env = loadProductionEnvironment(directory, { PORT: "3102" });
  assert.equal(env.PORT, "3102");
  assert.equal(env.NEXTAUTH_URL, valid.NEXTAUTH_URL);
  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.NEXTAUTH_SECRET, undefined);
});

test("production configuration accepts private IP HTTPS origins with a separate frontend port", () => {
  assert.deepEqual(validateProductionEnvironment(valid), { port: "3101", origin: valid.NEXTAUTH_URL });
  assert.deepEqual(validateProductionEnvironment({ ...valid, NEXTAUTH_URL: "https://medexplore.medicine.up.ac.th" }), {
    port: "3101", origin: "https://medexplore.medicine.up.ac.th",
  });
});

test("production files preserve quoted secrets, ignore local overrides and reload without changing the caller's environment", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "medexplore-production-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, ".env.local"), "NEXTAUTH_SECRET=must-not-load-local\n");
  writeFileSync(join(directory, ".env.production.local"), "PORT=9999\n");
  writeFileSync(join(directory, ".env.production"), [
    'NODE_ENV="development"', 'PORT="03101"',
    `NEXTAUTH_URL="${valid.NEXTAUTH_URL}"`,
    `NEXTAUTH_SECRET="${valid.NEXTAUTH_SECRET}#literal"`,
    `DATABASE_URL="${valid.DATABASE_URL}"`,
  ].join("\n"));
  const inherited = Object.freeze({ NODE_ENV: "development" });
  const loaded = loadProductionEnvironment(directory, inherited);
  assert.equal(loaded.NEXTAUTH_SECRET, `${valid.NEXTAUTH_SECRET}#literal`);
  assert.equal(loaded.NODE_ENV, "production");
  assert.deepEqual(validateProductionEnvironment(loaded), { port: "3101", origin: valid.NEXTAUTH_URL });
  assert.deepEqual(loadProductionEnvironment(directory, inherited), loaded);
  writeFileSync(join(directory, ".env.production"), "PORT=3102\n");
  assert.equal(loadProductionEnvironment(directory, inherited).PORT, "3102");
  assert.equal(loaded.PORT, "03101");
  assert.deepEqual(inherited, { NODE_ENV: "development" });
});

test("explicit empty service values fail validation instead of silently using a file secret", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "medexplore-production-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, ".env.production"), Object.entries(valid).map(([key, value]) => `${key}="${value}"`).join("\n"));
  for (const key of ["DATABASE_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET"]) {
    const loaded = loadProductionEnvironment(directory, { [key]: "" });
    assert.equal(loaded[key], "");
    assert.throws(() => validateProductionEnvironment(loaded), new RegExp(key));
  }
});

test("preflight handles missing production values and aggregates errors without exposing credentials", () => {
  for (const key of ["DATABASE_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET"]) {
    for (const value of [undefined, null, "", "   "]) {
      assert.throws(() => validateProductionEnvironment({ ...valid, [key]: value }), new RegExp(key));
    }
  }
  const invalid = { DATABASE_URL: "mysql://private-user:private-password@", NEXTAUTH_URL: "http://private-host", NEXTAUTH_SECRET: "private-secret", PORT: "private-port" };
  assert.throws(() => validateProductionEnvironment(invalid), (error) => {
    for (const key of Object.keys(invalid)) assert.match(error.message, new RegExp(key));
    for (const value of Object.values(invalid)) assert.ok(!error.message.includes(value));
    return true;
  });
});

test("preflight accepts valid port boundaries and defaults but rejects malformed ports and unsafe origins", () => {
  for (const [PORT, expected] of [[undefined, "3101"], ["1", "1"], ["65535", "65535"], ["03101", "3101"]]) {
    assert.equal(validateProductionEnvironment({ ...valid, PORT }).port, expected);
  }
  for (const PORT of ["", "-1", "1.5", "1e3", " 3101", "3101 ", "123456"]) {
    assert.throws(() => validateProductionEnvironment({ ...valid, PORT }), /PORT/);
  }
  for (const NEXTAUTH_URL of ["https://127.0.0.1", "https://[::1]", "https://site.invalid", "https://example.com", "https://example.ac.th", "https://site.ac.th/#fragment"]) {
    assert.throws(() => validateProductionEnvironment({ ...valid, NEXTAUTH_URL }), /NEXTAUTH_URL/);
  }
  assert.equal(validateProductionEnvironment({ ...valid, NEXTAUTH_URL: "https://site.ac.th:443/" }).origin, "https://site.ac.th");
});

test("preflight rejects unsafe origins, invalid ports, placeholders and incomplete database configuration without leaking values", () => {
  for (const NEXTAUTH_URL of ["http://10.205.10.200:8443", "https://localhost:8443", "https://site.example", "https://user:password@activity.university.ac.th", "https://activity.university.ac.th/subpath", "https://activity.university.ac.th?x=1"]) {
    assert.throws(() => validateProductionEnvironment({ ...valid, NEXTAUTH_URL }), /NEXTAUTH_URL/);
  }
  for (const PORT of ["0", "65536", "3101oops"]) assert.throws(() => validateProductionEnvironment({ ...valid, PORT }), /PORT/);
  for (const NEXTAUTH_SECRET of ["short", "REPLACE_WITH_A_RANDOM_SECRET", "x".repeat(48)]) assert.throws(() => validateProductionEnvironment({ ...valid, NEXTAUTH_SECRET }), /NEXTAUTH_SECRET/);
  for (const DATABASE_URL of ["", "mysql://root@localhost/db", "postgres://user:password@localhost/db", "mysql://user:password@localhost/"]) assert.throws(() => validateProductionEnvironment({ ...valid, DATABASE_URL }), /DATABASE_URL/);
  assert.throws(() => validateProductionEnvironment({ ...valid, NEXTAUTH_SECRET: "private-token-to-never-display" }), (error) => !error.message.includes("private-token-to-never-display"));
});

test("production preflight can validate without contacting or modifying a database", () => {
  const result = spawnSync(process.execPath, ["scripts/production.mjs", "check", "--config-only"], {
    cwd: projectRoot, env: { ...process.env, ...valid }, encoding: "utf8", timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Production configuration: OK/);
  assert.ok(!result.stdout.includes(valid.NEXTAUTH_SECRET));
  assert.ok(!result.stdout.includes(valid.DATABASE_URL));
});

test("production CLI rejects invalid config before reaching a database and never prints secret values", () => {
  const env = { ...process.env, ...valid, NEXTAUTH_SECRET: "private-invalid-secret" };
  for (const script of ["scripts/production.mjs", "scripts/start-production.mjs"]) {
    const result = spawnSync(process.execPath, [script, "check"], {
      cwd: projectRoot, env, encoding: "utf8", timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /NEXTAUTH_SECRET/);
    const output = result.stdout + result.stderr;
    assert.ok(!output.includes(env.NEXTAUTH_SECRET));
    assert.ok(!output.includes(env.DATABASE_URL));
    assert.doesNotMatch(output, /Database connection|PrismaClient/);
  }
});

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
    cwd: projectRoot, env: { ...process.env, ...valid }, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Production configuration: OK/);
  assert.ok(!result.stdout.includes(valid.NEXTAUTH_SECRET));
  assert.ok(!result.stdout.includes(valid.DATABASE_URL));
});

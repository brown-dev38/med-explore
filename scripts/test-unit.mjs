import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// Integration suites opt into real database writes or start an HTTP server.
// Keep the default test command independent of local .env and live services.
const files = readdirSync(new URL("../tests/", import.meta.url))
  .filter((name) => name.endsWith(".test.mjs") && !name.endsWith(".integration.test.mjs"))
  .sort()
  .map((name) => `tests/${name}`);

if (files.length === 0) {
  console.error("No unit tests found.");
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "test" },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) console.error(`Unable to start unit tests: ${result.error.message}`);
  process.exitCode = result.status ?? 1;
}

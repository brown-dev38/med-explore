import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { prepareProductionEnvironment, projectRoot } from "./production-env.mjs";
import { nextCli, runNode } from "./production-process.mjs";

try {
  const { env, port } = prepareProductionEnvironment();
  if (!existsSync(resolve(projectRoot, ".next/BUILD_ID"))) throw new Error("No production build found. Run npm run build:production before starting the service.");
  // Only IIS on this machine may reach Node.js directly.
  await runNode([nextCli, "start", "--hostname", "127.0.0.1", "--port", port], env);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to start the production server.");
  process.exitCode = 1;
}

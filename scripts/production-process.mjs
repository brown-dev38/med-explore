import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { projectRoot } from "./production-env.mjs";

export async function runNode(args, env) {
  const child = spawn(process.execPath, args, { cwd: projectRoot, env, stdio: "inherit", windowsHide: true });
  const stop = (signal) => { if (!child.killed) child.kill(signal); };
  const onInterrupt = () => stop("SIGINT");
  const onTerminate = () => stop("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    await new Promise((accept, reject) => {
      child.once("error", () => reject(new Error("Unable to start the production command. Check Node.js installation and permissions.")));
      child.once("exit", (code, signal) => code === 0 ? accept() : reject(new Error(`Production command stopped (${signal ?? `exit ${code}`}).`)));
    });
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}

export const nextCli = resolve(projectRoot, "node_modules/next/dist/bin/next");
export const prismaCli = resolve(projectRoot, "node_modules/prisma/build/index.js");

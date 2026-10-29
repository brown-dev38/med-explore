import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { prepareProductionEnvironment } from "./production-env.mjs";
import { nextCli, prismaCli, runNode } from "./production-process.mjs";

try {
  const command = process.argv[2];
  if (!["check", "build", "migrate", "bootstrap"].includes(command)) throw new Error("Usage: node scripts/production.mjs check [--config-only] | build | migrate | bootstrap");
  const { env, origin, port } = prepareProductionEnvironment();
  if (command === "check") {
    console.log("Production configuration: OK (secret values are not displayed).");
    console.log(`Public origin: ${origin}; Node.js listens only on 127.0.0.1:${port}.`);
    if (!process.argv.includes("--config-only")) {
      const db = new PrismaClient({ adapter: new PrismaMariaDb(env.DATABASE_URL) });
      try {
        await db.$queryRaw`SELECT 1`;
        console.log("Database connection: OK (read-only check; no migrations or writes).");
      } catch { throw new Error("Database connection failed. Check DATABASE_URL, database availability and permissions; credentials are not displayed."); }
      finally { await db.$disconnect(); }
    }
  } else if (command === "build") {
    await runNode([prismaCli, "generate"], env);
    await runNode([nextCli, "build"], env);
  } else if (command === "migrate") {
    await runNode([prismaCli, "migrate", "deploy"], env);
  } else {
    await runNode(["prisma/seed-production.ts"], env);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production command failed.");
  process.exitCode = 1;
}

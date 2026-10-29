import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { bootstrapProduction, productionBootstrapInput } from "./bootstrap-production.mjs";

// Invoke through `node --env-file=.env.production prisma/seed-production.ts`.
// Unlike the development seed, this entry point never loads .env or demo data.
async function main() {
  const input = productionBootstrapInput(process.env);
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL as string) });
  try {
    const result = await bootstrapProduction(prisma, input, bcrypt.hash);
    console.log(result.created
      ? "Production roles/permissions and the initial ADMIN were created. Remove BOOTSTRAP_ADMIN_PASSWORD from the environment after setup."
      : "Production roles/permissions are ready. Existing ADMIN credentials were preserved.");
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => {
  // Prisma errors may include connection strings/query values; log known errors only.
  const code = (error as { code?: string })?.code;
  if (code) console.error(`Production bootstrap failed (${code}). Verify migrations, connectivity and account conflicts, then retry.`);
  else if (error instanceof Error && (error.message.startsWith("Production bootstrap requires") || error.message.startsWith("DATABASE_URL is required") || error.message.startsWith("Set ") || error.message.startsWith("Bootstrap username/email") || error.message.startsWith("Existing account") || error.message.startsWith("ADMIN role initialization"))) console.error(error.message);
  else console.error("Production bootstrap failed. Verify database connectivity and migrations, then retry. No partial bootstrap was committed.");
  process.exitCode = 1;
});

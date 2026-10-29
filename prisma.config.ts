import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Client generation during npm ci does not need a database URL. Migration
  // commands still require one; production wrappers validate it before running.
  datasource: process.env.DATABASE_URL ? { url: process.env.DATABASE_URL } : undefined,
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.ts",
  },
});

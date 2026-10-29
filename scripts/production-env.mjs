import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parse } from "dotenv";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const placeholder = /REPLACE_|CHANGE_ME|your[_-]?(?:password|secret)|<[^>]+>/i;

// Never fall back to the developer's .env. Explicit service environment wins.
export function loadProductionEnvironment(directory = projectRoot, inherited = process.env) {
  const path = resolve(directory, ".env.production");
  const file = existsSync(path) ? parse(readFileSync(path)) : {};
  return { ...file, ...inherited, NODE_ENV: "production" };
}

export function validateProductionEnvironment(env) {
  const errors = [];
  const required = ["DATABASE_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET"];
  for (const name of required) {
    if (typeof env[name] !== "string" || !env[name].trim() || placeholder.test(env[name])) errors.push(`${name}: set a real production value`);
  }
  try {
    const url = new URL(env.DATABASE_URL);
    if (url.protocol !== "mysql:" || !url.hostname || !url.username || !url.password || url.pathname.length <= 1) throw new Error();
  } catch { errors.push("DATABASE_URL: use a mysql:// URL with database, username and password"); }
  try {
    const url = new URL(env.NEXTAUTH_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error();
    if (/\.(?:example|invalid)$/.test(url.hostname) || ["example.com", "example.ac.th"].includes(url.hostname)) throw new Error();
  } catch { errors.push("NEXTAUTH_URL: use the real HTTPS origin, including its public port; no path or credentials"); }
  if (typeof env.NEXTAUTH_SECRET !== "string" || env.NEXTAUTH_SECRET.length < 32 || new Set(env.NEXTAUTH_SECRET).size < 12) errors.push("NEXTAUTH_SECRET: generate a random secret of at least 32 characters");
  const port = env.PORT ?? "3101";
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) errors.push("PORT: use a free Node.js loopback port between 1 and 65535");
  if (errors.length) throw new Error(`Production configuration is incomplete:\n- ${[...new Set(errors)].join("\n- ")}`);
  return { port: String(Number(port)), origin: new URL(env.NEXTAUTH_URL).origin };
}

export function prepareProductionEnvironment() {
  if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Production commands require Node.js 24 or newer; use Node.js 24 LTS on Windows Server.");
  const env = loadProductionEnvironment();
  const config = validateProductionEnvironment(env);
  return { env, ...config };
}

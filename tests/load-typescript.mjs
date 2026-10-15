import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const moduleRequire = createRequire(import.meta.url);

export function loadTypeScript(relativePath, mocks = {}) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => name in mocks ? mocks[name] : moduleRequire(name), loadedModule, loadedModule.exports,
  );
  return loadedModule.exports;
}

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { run } from "node:test";
import { spec } from "node:test/reporters";

const cwd = path.resolve(".");
const outDir = path.join(cwd, ".test-build");
fs.mkdirSync(outDir, { recursive: true });

const filesToTranspile = [
  "lib/errors/error-types.ts",
  "lib/errors/sanitize.ts",
  "lib/errors/provider-error-adapters.ts",
  "lib/errors/normalize-error.ts",
  "lib/errors/error-reporter.ts",
  "lib/dialogs/error-dialog-service.ts",
  "lib/dialogs/confirm-dialog-service.ts",
  "lib/notifications/notification-types.ts",
  "lib/notifications/notification-store.ts",
  "lib/errors/__tests__/error-system.test.ts"
];

for (const relPath of filesToTranspile) {
  const fullPath = path.join(cwd, relPath);
  if (!fs.existsSync(fullPath)) continue;
  const content = fs.readFileSync(fullPath, "utf-8");

  const transpiled = ts.transpileModule(content, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      esModuleInterop: true,
    }
  });

  let jsCode = transpiled.outputText.replace(/from\s+["'](\.[^"']+)["']/g, (match, p1) => {
    if (p1.endsWith(".js")) return match;
    return `from "${p1}.js"`;
  });

  const outPath = path.join(outDir, relPath.replace(/\.tsx?$/, ".js"));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, jsCode, "utf-8");
}

const testFile = path.join(outDir, "lib/errors/__tests__/error-system.test.js");

run({ files: [testFile] })
  .on("test:fail", () => {
    process.exitCode = 1;
  })
  .compose(new spec())
  .pipe(process.stdout);

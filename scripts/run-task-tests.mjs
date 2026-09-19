import { build } from "esbuild";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(repoRoot, "node_modules/.cache/task-delegation.test.mjs");

try {
  await build({
    entryPoints: [path.join(repoRoot, "scripts/task-delegation.test.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    packages: "external",
    logLevel: "warning",
    loader: { ".jpg": "text", ".png": "text", ".svg": "text" },
    define: { __REPO_ROOT__: JSON.stringify(repoRoot) },
  });

  await import(pathToFileURL(outfile).href);
} finally {
  await rm(outfile, { force: true }).catch(() => {});
}

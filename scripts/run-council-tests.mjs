/**
 * Bundles and runs the Council Hub regression tests with esbuild, then exits with
 * the test runner's status code. Output is written to the operating system's temp
 * directory so nothing is generated inside the repository.
 */
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = await mkdtemp(path.join(tmpdir(), "shristi-council-tests-"));
const outfile = path.join(outDir, "council-hub.test.mjs");

try {
  await build({
    entryPoints: [path.join(repoRoot, "scripts/council-hub.test.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "warning",
    define: { __REPO_ROOT__: JSON.stringify(repoRoot) },
  });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(outDir, { recursive: true, force: true });
}

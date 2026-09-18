/**
 * Runs the Google Sheets bridge tests (scripts/sheets.test.ts) through esbuild,
 * so the suite exercises the real TypeScript modules without a test framework.
 *
 * Usage: node scripts/run-sheets-tests.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

// esbuild is resolved by absolute path: the repository's node_modules is installed for
// another platform, and the JS API still knows how to reach the linux binary.
const esbuildEntry = join(repo, "node_modules", "esbuild", "lib", "main.js");
const { build } = await import(pathToFileURL(esbuildEntry).href);

const workDir = mkdtempSync(join(tmpdir(), "shristi-sheets-run-"));
const outfile = join(workDir, "bundled.mjs");
await build({
  entryPoints: [join(here, "sheets.test.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: "inline",
  logLevel: "warning",
  external: ["esbuild"],
  define: { __REPO_ROOT__: JSON.stringify(repo) },
});

const result = spawnSync(process.execPath, [outfile], { stdio: "inherit", cwd: repo });
rmSync(workDir, { recursive: true, force: true });
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);

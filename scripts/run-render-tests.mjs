/**
 * Runs the server-render checks in scripts/render.test.tsx.
 *
 * react-dom/server cannot render portals, so the hub's Modal component is swapped for a
 * stub (see the modal stub plugin below); everything else is the real application code.
 *
 * Usage: node scripts/run-render-tests.mjs [--sheets]
 *        --sheets renders with a spreadsheet already connected.
 */
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const withSheets = process.argv.includes("--sheets");

/* ------------------------------------------------- browser globals for SSR */
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};
globalThis.sessionStorage = {
  getItem: (key) => (key === "shristi-preview-session-v3" ? JSON.stringify({ userId: "shr-085", token: "render-check" }) : null),
  setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0,
};

/* A roster with the primary administrator, so the screens render signed in. */
store.set("shristi-council-school-roster-v5", JSON.stringify({
  users: [{
    id: "shr-085", name: "Arnab Shrestha", email: "72019arnab@shristiacademy.edu.np", aliases: [],
    password: "demo-password", grade: 10, gradeLabel: "Grade 10", house: "Blue", houseLabel: "Blue House",
    status: "active", role: "admin", createdAt: "2026-01-01T00:00:00.000Z",
  }],
}));
if (withSheets) {
  store.set("shristi-sheets-config-v1", JSON.stringify({
    apiUrl: "https://script.google.com/macros/s/AKfyRenderCheck/exec",
    pollSeconds: 60,
    sections: { housePoints: true, calendar: true, finances: true },
  }));
}

/* Modal renders through createPortal, which react-dom/server cannot do. */
const element = (nodeName) => ({
  nodeType: 1, nodeName, style: {}, classList: { add() {}, remove() {} },
  setAttribute() {}, removeAttribute() {}, appendChild() {}, removeChild() {},
  addEventListener() {}, removeEventListener() {}, focus() {}, contains: () => false,
  querySelector: () => null, querySelectorAll: () => [], children: [],
});
globalThis.window = globalThis;
globalThis.document = {
  nodeType: 9, hidden: false,
  documentElement: element("HTML"), body: element("BODY"),
  createElement: (name) => element(String(name).toUpperCase()),
  createTextNode: () => ({ nodeType: 3, textContent: "" }),
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener: () => {}, removeEventListener: () => {}, activeElement: null,
};
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} });
globalThis.BroadcastChannel = class { postMessage() {} addEventListener() {} removeEventListener() {} close() {} };
globalThis.addEventListener = () => undefined;
globalThis.removeEventListener = () => undefined;

/* ------------------------------------------------------------------ bundle */
const { build } = await import(pathToFileURL(join(repo, "node_modules/esbuild/lib/main.js")).href);

const modalStub = {
  name: "modal-stub",
  setup(build) {
    build.onResolve({ filter: /^(?:\.\.?\/)+(?:components\/)?ui$/ }, (args) => (
      /[\\/]src[\\/]components[\\/]/.test(args.importer)
        ? { path: args.path, namespace: "modal-stub" }
        : undefined
    ));
    build.onLoad({ filter: /.*/, namespace: "modal-stub" }, () => ({
      contents: 'export * from "../src/components/ui"; export function Modal() { return null; }',
      loader: "ts",
      resolveDir: join(repo, "scripts"),
    }));
  },
};

/* The bundle sits inside node_modules so bare imports (react, react-dom/server) resolve. */
const outDir = join(repo, "node_modules", ".render-checks");
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, "render-check.cjs");

await build({
  entryPoints: [join(here, "render.test.tsx")],
  outfile,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  jsx: "automatic",
  logLevel: "warning",
  loader: { ".jpg": "dataurl", ".png": "dataurl", ".svg": "dataurl", ".webp": "dataurl" },
  define: { "process.env.NODE_ENV": '"development"', __RENDER_CHECK_SHEETS__: String(withSheets) },
  plugins: [modalStub],
});

/* -------------------------------------------------------------------- run */
const { checks } = createRequire(import.meta.url)(outfile);
let failed = 0;
console.log(`\nRender checks (${withSheets ? "spreadsheet connected" : "nothing connected"})`);
for (const check of checks) {
  try {
    const { ok, detail } = check.run();
    if (!ok) failed += 1;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${check.name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${check.name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}
rmSync(outDir, { recursive: true, force: true });

console.log(`\n${checks.length - failed}/${checks.length} render checks passed`);
process.exit(failed ? 1 : 0);

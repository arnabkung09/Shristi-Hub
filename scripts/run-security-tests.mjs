/**
 * Security regression checks.
 *
 * The hub ships to a public URL, so these checks fail the build when a hardening decision
 * is undone: shared role passwords, a client-side "verification code", a role switcher that
 * works on the live platform, credentials written to browser storage, or Firestore rules
 * that stop protecting the shared documents.
 *
 * Usage: node scripts/run-security-tests.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

let passed = 0;
const failures = [];

function check(name, run) {
  try {
    const detail = run();
    passed += 1;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(join(repo, path), "utf8");
}

/** Every .ts/.tsx source file under src/. */
function sourceFiles(dir = join(repo, "src"), out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const sources = sourceFiles().map((full) => ({ path: relative(repo, full), text: readFileSync(full, "utf8") }));

console.log("\nSign-in hardening");

check("no shared role password can sign anyone in", () => {
  // These strings used to be accepted for every account of a role (admin123, ...).
  const banned = ["admin123", "council123", "teacher123", "grade123", "student123"];
  const offenders = sources.filter((file) => banned.some((value) => file.text.includes(value)));
  assert(offenders.length === 0, `shared credential found in ${offenders.map((file) => file.path).join(", ")}`);
  return `${sources.length} source files scanned`;
});

check("local password sign-in is a development-only fallback", () => {
  const hub = read("src/store/hub.tsx");
  assert(hub.includes("DEVELOPMENT_BUILD && localStudent?.password && localStudent.password === password"),
    "the offline password fallback is not gated behind DEVELOPMENT_BUILD");
  assert(/const signInDirect = \(userId: string\) => \{\s*\n\s*if \(!DEVELOPMENT_BUILD\)/.test(hub),
    "signInDirect must refuse to run outside a development build");
  assert(/const signInDirect = \(userId: string\) => \{\s*\n\s*if \(!DEVELOPMENT_BUILD\)/.test(hub),
    "signInDirect must refuse to run outside a development build");
  return "Firebase-only in production";
});

check("no role switcher ships at all", () => {
  const offenders = sources.filter((file) => /DemoStrip|switchDemoRole|DEMO PLATFORM/.test(file.text));
  assert(offenders.length === 0, `role-preview UI remains in ${offenders.map((file) => file.path).join(", ")}`);
  const app = read("src/App.tsx");
  assert(!app.includes("DemoStrip"), "the app shell must not mount a demo strip");
  return "removed from the application";
});

check("the login screen advertises no credentials", () => {
  const login = read("src/components/Login.tsx");
  for (const forbidden of ["fillDemoAccount", "Quick demo accounts", "admin123"]) {
    assert(!login.includes(forbidden), `Login.tsx still contains "${forbidden}"`);
  }
  assert(login.includes("Administrator Confirmation Needed"), "the alias flow should point at administrator confirmation");
  if (login.includes("Development sign-in")) {
    assert(login.includes("{DEVELOPMENT_BUILD && ("), "the development sign-in panel must be gated behind DEVELOPMENT_BUILD");
    assert(!/Development sign-in[^]*?password/.test(login), "the development panel must not carry passwords");
  }
  return "no demo credentials on the sign-in screen";
});

check("there is no client-side 'verification code' step", () => {
  assert(!existsSync(join(repo, "src/lib/verification.ts")), "src/lib/verification.ts must stay deleted");
  const offenders = sources.filter((file) => /issueConfirmationCode|verifyConfirmationCode|\b123456\b/.test(file.text));
  assert(offenders.length === 0, `verification-code references remain in ${offenders.map((file) => file.path).join(", ")}`);
  return "alias identity is administrator-controlled";
});

check("passwords are never written to browser storage in production", () => {
  const hub = read("src/store/hub.tsx");
  assert(hub.includes("withoutStoredCredentials(state)"), "state persistence must strip credentials");
  assert(/password: ""/.test(hub.slice(hub.indexOf("function withoutStoredCredentials"))), "the strip must clear the password field");
  return "localStorage holds no passwords";
});

console.log("\nSecrets");

check("no service-account material is committed", () => {
  const forbidden = ["private_key", "BEGIN PRIVATE KEY", "serviceAccount.json", "FIREBASE_SERVICE_ACCOUNT"];
  const offenders = sources.filter((file) => forbidden.some((value) => file.text.includes(value)));
  assert(offenders.length === 0, `service-account material in ${offenders.map((file) => file.path).join(", ")}`);
  assert(!existsSync(join(repo, ".env")) && !existsSync(join(repo, ".env.local")), "an .env file is committed");
  return "only public identifiers are shipped";
});

check(".gitignore keeps local secrets out of the repository", () => {
  const ignore = read(".gitignore");
  for (const pattern of [".env", "serviceAccount"]) {
    assert(ignore.includes(pattern), `.gitignore should ignore ${pattern}*`);
  }
  return ".env*, serviceAccount* ignored";
});

console.log("\nGoogle Sheets endpoint");

check("the built-in Apps Script endpoint is still wired", () => {
  const config = read("src/lib/sheets/config.ts");
  const match = config.match(/BUILT_IN_SHEETS_API_URL\s*=\s*\n?\s*"(https:[/][/]script\.google\.com[/]macros[/]s[/][A-Za-z0-9_-]+[/]exec)"/);
  assert(match, "BUILT_IN_SHEETS_API_URL must be a hardcoded Apps Script /exec URL");
  assert(!config.includes("http://"), "the endpoint must be https only");
  return match[1].slice(0, 46) + "…";
});

check("no Google API key is used for the spreadsheet reads", () => {
  const sheets = sources.filter((file) => file.path.startsWith("src/lib/sheets/"));
  const offenders = sheets.filter((file) => /[?&]key=|AIza[0-9A-Za-z_-]{10}/.test(file.text));
  assert(offenders.length === 0, `API key found in ${offenders.map((file) => file.path).join(", ")}`);
  return "public /exec URL only";
});

console.log("\nFirestore rules");

check("the shared documents stay protected", () => {
  const rules = read("firestore.rules");
  assert(/match \/hubState\/main \{[^]*?allow create, update: if admin\(\)/.test(rules), "hubState/main must be administrator-writable only");
  assert(rules.includes("allow read: if admin() || activeMember();"), "hubState/main must stay member-readable only");
  assert(/match \/hubChat\/council\/messages\/\{messageId\} \{[^]*?allow read: if councilHubMember\(\);/.test(rules),
    "hub chat must be gated by explicit membership");
  assert(/match \/publicConfig\/sheets \{[^]*?allow create, update: if admin\(\)/.test(rules), "the sheets endpoint must be administrator-writable");
  assert(rules.includes("allow read, write: if false;"), "the catch-all deny rule is missing");
  return "rules parse as expected";
});

check("the sheets config document only accepts a safe shape", () => {
  const rules = read("firestore.rules");
  const block = rules.slice(rules.indexOf("match /publicConfig/sheets"), rules.indexOf("match /__connection_test__"));
  assert(block.includes("hasOnly(['apiUrl'"), "the document must validate its keys");
  assert(block.includes("matches('^https://.*')"), "the endpoint must be validated as https");
  return "admin-only, https-only, known keys";
});

check("no rule grants an open write", () => {
  const rules = read("firestore.rules");
  const loose = rules.split("\n").filter((line) => /allow .*write/.test(line) && /if true/.test(line));
  assert(loose.length === 0, `open write rule: ${loose.join(" ")}`);
  return "every write is authenticated";
});

check("the rules files are structurally sound", () => {
  for (const file of ["firestore.rules", "storage.rules"]) {
    const rules = read(file);
    assert(rules.trimStart().startsWith("rules_version = '2';"), `${file} must start with rules_version = '2';`);
    const open = (rules.match(/\{/g) ?? []).length;
    const close = (rules.match(/\}/g) ?? []).length;
    assert(open === close, `${file} has unbalanced braces (${open} vs ${close})`);
  }
  const firestore = read("firestore.rules");
  assert(firestore.includes("service cloud.firestore {"), "firestore.rules must declare the firestore service");
  const defined = new Set([...firestore.matchAll(/function (\w+)\(/g)].map((match) => match[1]));
  const used = new Set([...firestore.matchAll(/([a-zA-Z_][\w]*)\(/g)].map((match) => match[1]));
  const builtins = new Set([
    "get", "exists", "debug", "match", "function", "allow", "if", "return", "in",
    "size", "hasOnly", "hasAny", "hasAll", "matches", "lower", "upper", "data", "keys", "diff",
    "affectedKeys", "unaffectedKeys", "getAfterInit", "toSet", "join", "split", "replace", "trim", "toString",
  ]);
  const missing = [...used].filter((name) => !defined.has(name) && !builtins.has(name) && !/^[A-Z]/.test(name));
  // Only report names that look like rule helpers (declared nowhere at all).
  const unknown = missing.filter((name) => firestore.includes(`${name}()`));
  assert(unknown.length === 0, `undefined rule function(s): ${unknown.join(", ")}`);
  return "firestore.rules + storage.rules";
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((failure) => console.log(` - ${failure}`));
  process.exit(1);
}
process.exit(0);

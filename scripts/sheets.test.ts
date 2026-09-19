/**
 * Google Sheets bridge tests.
 *
 * The spreadsheet is the source of truth for House Points, Calendar, and Monetary Fund,
 * so these tests feed the exact row payloads the Apps Script endpoint returns — cell
 * strings, `Rs` amounts, day-first dates, blank Points cells — through the same
 * parse → derive pipeline the hub uses, and check the numbers the existing components
 * render. No Google account is needed: the rows are fixtures.
 *
 * Run: node scripts/run-sheets-tests.mjs
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

declare const __REPO_ROOT__: string;
/** Absolute repo path — esbuild replaces __REPO_ROOT__ at bundle time. */
const REPO = typeof __REPO_ROOT__ === "string" ? __REPO_ROOT__ : new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const out = mkdtempSync(join(tmpdir(), "shristi-sheets-"));

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.log(`  ✗ ${name}\n      ${message.split("\n").slice(0, 3).join("\n      ")}`);
  }
}

const group = (title: string) => console.log(`\n${title}`);

/* ------------------------------------------------------------------ build */
const esbuild = await import(pathToFileURL(join(REPO, "node_modules/esbuild/lib/main.js")).href);
const entry = join(out, "entry.ts");
const fs = await import("node:fs");
fs.writeFileSync(entry, `
export * as parse from ${JSON.stringify(join(REPO, "src/lib/sheets/parse.ts"))};
export * as derive from ${JSON.stringify(join(REPO, "src/lib/sheets/derive.ts"))};
export * as config from ${JSON.stringify(join(REPO, "src/lib/sheets/config.ts"))};
export * as client from ${JSON.stringify(join(REPO, "src/lib/sheets/client.ts"))};
export * as types from ${JSON.stringify(join(REPO, "src/lib/sheets/types.ts"))};
`);

const bundle = join(out, "bundle.mjs");
await esbuild.build({
  entryPoints: [entry],
  outfile: bundle,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  logLevel: "silent",
  define: { __REPO_ROOT__: JSON.stringify(REPO) },
});

const { parse, derive, config, types, client } = await import(pathToFileURL(bundle).href);

/* ---------------------------------------------------------- house points */
/**
 * Exactly what Apps Script hands over for the House Points tab. The sheet is only
 * Specific | Type | House | Position | Teams Won | Points, so the fixtures cover what
 * council members actually type: full house names, "1st" instead of 1, blank Points
 * cells (the hub's scoring table fills them), and one explicit special award.
 */
const rawHousePoints = [
  { Specific: "Spelling Bee (Senior)", Type: "Individual", House: "Annapurna", Position: 1, "Teams Won": 1, Points: 3 },
  { Specific: "Inter-house Football", Type: "Team", House: "Dhaulagiri", Position: "1st", "Teams Won": 1, Points: "" },
  { Specific: "Science Quiz", Type: "Individual", House: "Manaslu", Position: "3rd", "Teams Won": "", Points: "" },
  { Specific: "Cleanliness Drive", Type: "Team", House: "Dhaulagiri House", Position: 2, "Teams Won": 2, Points: "" },
  { Specific: "Art Contest", Type: "Individual", House: "Blue", Position: 1, "Teams Won": 1, Points: 5 },
  { Specific: "Inter-house Debate", Type: "Individual", House: "Annapurna", Position: 2, "Teams Won": 1, Points: "" },
];

const housePointRows = parse.parseRows(rawHousePoints, parse.parseHousePointRow);

group("House Points: rows → house totals");
const points = derive.deriveHousePoints({ rows: housePointRows });

await test("every row with a house and points is kept", () => {
  assert.equal(points.results.length, rawHousePoints.length);
  assert.equal(points.skipped, 0);
});

await test("house totals add up the Points column", () => {
  // Blue = Team 1st (6) + Team 2nd (4) + Art Contest (5) = 15, Red = 3 + 2 = 5, Green = 1
  assert.deepEqual(points.totals, { Blue: 15, Red: 5, Green: 1 });
  assert.deepEqual(points.houseRowCounts, { Blue: 3, Red: 2, Green: 1 });
});

await test("a blank Points cell falls back to the standard scoring table", () => {
  const byName = (name: string) => points.results.find((row) => row.specific === name)!;
  assert.equal(byName("Inter-house Football").points, 6);      // Team 1st
  assert.equal(byName("Inter-house Football").fromTable, true);
  assert.equal(byName("Science Quiz").points, 1);              // Individual 3rd
  assert.equal(byName("Cleanliness Drive").points, 4);         // Team 2nd
  assert.equal(byName("Inter-house Debate").points, 2);        // Individual 2nd
});

await test("an explicit Points cell overrides the table (special awards need no inference)", () => {
  const art = points.results.find((row) => row.specific === "Art Contest")!;
  assert.equal(art.points, 5);
  assert.equal(art.fromTable, false);
});

await test("the current leader and margin come straight from the totals", () => {
  assert.equal(points.leader, "Blue");
  assert.equal(points.leaderPoints, 15);
  assert.equal(points.margin, 10);
});

await test("school house names resolve to the hub's houses", () => {
  assert.equal(derive.resolveHouse("Dhaulagiri"), "Blue");
  assert.equal(derive.resolveHouse("Annapurna House"), "Red");
  assert.equal(derive.resolveHouse("manaslu"), "Green");
  assert.equal(derive.resolveHouse("Blue"), "Blue");
  assert.equal(derive.resolveHouse("Gandaki"), null);
});

await test("results keep Type, Position and Teams Won for the ledger badges", () => {
  const quiz = points.results.find((row) => row.specific === "Science Quiz")!;
  assert.equal(quiz.type, "Individual");
  assert.equal(quiz.position, 3);
  assert.equal(derive.positionLabel(quiz.position), "3rd");
  assert.equal(quiz.teamsWon, null);                          // blank cell
  const drive = points.results.find((row) => row.specific === "Cleanliness Drive")!;
  assert.equal(drive.teamsWon, 2);
});

await test("recent results are newest-first (the last sheet row leads)", () => {
  assert.equal(points.recent[0].specific, "Inter-house Debate");
  assert.equal(points.recent[0].row, 7);                      // header is row 1
  assert.ok(points.results.every((row, index, all) => index === 0 || all[index - 1].row > row.row));
});

await test("rows without a house or a usable points value are skipped with a warning", () => {
  const rows = parse.parseRows([
    { Specific: "No house", Type: "Individual", House: "", Position: 1, Points: 5 },
    { Specific: "No points", Type: "Team", House: "Manaslu", Position: 5, Points: "" },
    { Specific: "Fine", Type: "Individual", House: "Manaslu", Position: 1, Points: 3 },
  ], parse.parseHousePointRow);
  const derived = derive.deriveHousePoints({ rows });
  assert.equal(derived.results.length, 1);
  assert.equal(derived.skipped, 2);
  assert.equal(derived.warnings.length, 1);
  assert.ok(derived.warnings[0].includes("skipped"));
});

await test("an unrecognised house name is reported so it can be mapped in the admin panel", () => {
  const rows = parse.parseRows([{ Specific: "Mystery", Type: "Individual", House: "Gandaki", Position: 1, Points: 3 }], parse.parseHousePointRow);
  const derived = derive.deriveHousePoints({ rows });
  assert.equal(derived.results.length, 0);
  assert.ok(derived.warnings.some((warning) => warning.includes("Gandaki")));
});

await test("a custom house map is additive and overrides the defaults", () => {
  const rows = parse.parseRows([{ Specific: "Mystery", Type: "Individual", House: "Gandaki House", Position: 1, Points: 7 }], parse.parseHousePointRow);
  const derived = derive.deriveHousePoints({ rows, houseMap: { "Gandaki House": "Green" } });
  assert.deepEqual(derived.totals, { Blue: 0, Red: 0, Green: 7 });
  // and the default mapping still works alongside it
  assert.equal(derive.resolveHouse("Dhaulagiri", derive.effectiveHouseMap({ "Gandaki House": "Green" })), "Blue");
});

group("House Points: standard scoring table");
await test("Individual is 3 / 2 / 1 and Team is 6 / 4 / 2", () => {
  assert.equal(derive.standardPoints("Individual", "1"), 3);
  assert.equal(derive.standardPoints("Individual", "2"), 2);
  assert.equal(derive.standardPoints("Individual", "3"), 1);
  assert.equal(derive.standardPoints("Team", "1"), 6);
  assert.equal(derive.standardPoints("Team", "2"), 4);
  assert.equal(derive.standardPoints("Team", "3"), 2);
  assert.equal(derive.standardPoints("Individual", "4"), null);
});

await test("Type and Position accept the wording people actually type", () => {
  assert.equal(derive.awardType("individual"), "Individual");
  assert.equal(derive.awardType("TEAM"), "Team");
  assert.equal(derive.awardType(""), null);
  assert.equal(derive.positionNumber("1"), 1);
  assert.equal(derive.positionNumber("2nd"), 2);
  assert.equal(derive.positionNumber("second"), 2);
  assert.equal(derive.positionNumber("3rd place"), 3);
  assert.equal(derive.positionNumber(""), null);
});

/* ---------------------------------------------------------------- calendar */
/** The Calendar tab is Date | Type | Details — five types, day-first dates. */
const rawCalendar = [
  { Date: "02/05/2026", Type: "Holiday", Details: "Weekend" },
  { Date: "05/05/2026", Type: "Competition", Details: "Spelling Bee" },
  { Date: "08/05/2026", Type: "Examination", Details: "Mathematics Examination" },
  { Date: "10/05/2026", Type: "Event", Details: "Council Assembly" },
  { Date: "04/05/2026", Type: "Normal", Details: "Department Meeting" },
  { Date: "06/05/2026", Type: "Competition", Details: "Inter-house Quiz" },
];
const TODAY = "2026-05-06";
const calendarRows = parse.parseRows(rawCalendar, parse.parseCalendarRow);
const calendar = derive.deriveCalendar({ rows: calendarRows, todayIso: TODAY });

group("Calendar: rows → the month grid, agenda and upcoming list");
await test("every row becomes an entry, ordered by date", () => {
  assert.equal(calendar.entries.length, rawCalendar.length);
  assert.equal(calendar.skipped, 0);
  assert.equal(calendar.entries[0].details, "Weekend");
  assert.deepEqual(calendar.entries.map((entry) => entry.date), [
    "2026-05-02", "2026-05-04", "2026-05-05", "2026-05-06", "2026-05-08", "2026-05-10",
  ]);
});

await test("dd/mm/yyyy dates are read day-first", () => {
  assert.equal(calendar.entries[0].date, "2026-05-02");
  assert.equal(parse.isoDate("02/05/2026"), "2026-05-02");
  assert.equal(parse.isoDate("2026-05-02"), "2026-05-02");
  // ambiguous values follow the school convention (day first)
  assert.equal(parse.isoDate("03/04/2026"), "2026-04-03");
});

await test("the five types are recognised in any casing", () => {
  assert.equal(derive.calendarType("Holiday").type, "holiday");
  assert.equal(derive.calendarType("NORMAL").type, "normal");
  assert.equal(derive.calendarType("competition").type, "competition");
  assert.equal(derive.calendarType("Event").type, "event");
  assert.equal(derive.calendarType("Examination").type, "examination");
  assert.equal(calendar.entries[1].typeLabel, "Normal");
});

await test("today, upcoming and past are cut from the same rows", () => {
  assert.deepEqual(calendar.today.map((entry) => entry.details), ["Inter-house Quiz"]);
  assert.deepEqual(calendar.upcoming.map((entry) => entry.details), ["Inter-house Quiz", "Mathematics Examination", "Council Assembly"]);
  assert.deepEqual(calendar.past.map((entry) => entry.details), ["Spelling Bee", "Department Meeting", "Weekend"]);
});

await test("per-type counts feed the filter bar", () => {
  assert.equal(calendar.counts.holiday, 1);
  assert.equal(calendar.counts.normal, 1);
  assert.equal(calendar.counts.competition, 2);
  assert.equal(calendar.counts.event, 1);
  assert.equal(calendar.counts.examination, 1);
});

await test("multiple entries on one date are grouped for the month cell", () => {
  const rows = parse.parseRows([...rawCalendar, { Date: "08/05/2026", Type: "Event", Details: "Prize Giving" }], parse.parseCalendarRow);
  const derived = derive.deriveCalendar({ rows, todayIso: TODAY });
  assert.equal(derived.byDate["2026-05-08"].length, 2);
});

await test("rows project into the existing SchoolEvent shape for other screens", () => {
  const holiday = calendar.events.find((event) => event.title === "Weekend")!;
  assert.equal(holiday.date, "2026-05-02");
  assert.equal(holiday.eventType, "Holiday");
  assert.equal(holiday.status, "completed");
  assert.equal(holiday.category, "Assembly");
  const exam = calendar.events.find((event) => event.title === "Mathematics Examination")!;
  assert.equal(exam.status, "upcoming");
  assert.equal(exam.category, "Academic");
});

await test("sheet calendar rows never claim places are full", () => {
  assert.ok(calendar.events.every((event) => event.capacity === 0));
});

await test("a row without a date or details is skipped with a warning", () => {
  const rows = parse.parseRows([
    { Date: "", Type: "Event", Details: "No date" },
    { Date: "11/05/2026", Type: "Event", Details: "" },
    { Date: "11/05/2026", Type: "Event", Details: "Prize Giving" },
  ], parse.parseCalendarRow);
  const derived = derive.deriveCalendar({ rows, todayIso: TODAY });
  assert.equal(derived.entries.length, 1);
  assert.equal(derived.skipped, 2);
  assert.ok(derived.warnings[0].includes("skipped"));
});

await test("an unrecognised Type is flagged but still shown as a Normal day", () => {
  const rows = parse.parseRows([{ Date: "11/05/2026", Type: "Picnic", Details: "Class outing" }], parse.parseCalendarRow);
  const derived = derive.deriveCalendar({ rows, todayIso: TODAY });
  assert.equal(derived.entries[0].type, "normal");
  assert.ok(derived.warnings.some((warning) => warning.includes("Picnic")));
});

/* ----------------------------------------------------------- monetary fund */
/** The Monetary Fund tab is Date | Type | Amount | Description. */
const rawMoney = [
  { Date: "02/05/2026", Type: "Income", Amount: 5000, Description: "Event collection" },
  { Date: "03/05/2026", Type: "Expense", Amount: 1500, Description: "Event materials" },
  { Date: "04/05/2026", Type: "income", Amount: "Rs 1,200.50", Description: "Merchandise" },
  { Date: "05/05/2026", Type: "EXPENSE", Amount: "(250)", Description: "Refund adjustment" },
];
const moneyRows = parse.parseRows(rawMoney, parse.parseTransactionRow);
const money = derive.deriveFinances({ rows: moneyRows });

group("Monetary Fund: rows → totals and balance");
await test("total income, total expenses and balance are computed, never hardcoded", () => {
  assert.equal(money.income, 6200.5);
  assert.equal(money.expense, 1750);
  assert.equal(money.balance, 4450.5);
  assert.equal(money.inflowCount, 2);
  assert.equal(money.outflowCount, 2);
});

await test("income and expense are recognised in any casing", () => {
  assert.equal(derive.financeType("Income"), "income");
  assert.equal(derive.financeType("EXPENSE"), "expense");
  assert.equal(derive.financeType("Received"), "income");
  assert.equal(derive.financeType("Paid"), "expense");
  assert.equal(derive.financeType("Transfer"), null);
});

await test("rows project into the existing FinanceEntry shape", () => {
  const latest = money.entries[0];
  assert.equal(latest.date, "2026-05-05");
  assert.equal(latest.type, "expense");
  assert.equal(latest.title, "Refund adjustment");
  assert.equal(latest.amount, 250);
  assert.equal(latest.status, "Recorded");
  assert.equal(latest.sheetId, "mf-5");
});

await test("the sheet only fills what it has: no categories, refs or approvers", () => {
  assert.ok(money.entries.every((entry) => entry.category === "" && entry.invoiceRef === "" && entry.approvedBy === ""));
});

await test("unrecognised Types and blank amounts are skipped with a warning", () => {
  const rows = parse.parseRows([
    { Date: "06/05/2026", Type: "Transfer", Amount: 900, Description: "Internal" },
    { Date: "06/05/2026", Type: "Income", Amount: "", Description: "No amount" },
    { Date: "06/05/2026", Type: "Income", Amount: 0, Description: "Zero" },
    { Date: "06/05/2026", Type: "Income", Amount: 250, Description: "Fine" },
  ], parse.parseTransactionRow);
  const derived = derive.deriveFinances({ rows });
  assert.equal(derived.entries.length, 1);
  assert.equal(derived.skipped, 3);
  assert.equal(derived.warnings.length, 2);
});

group("Parsing: what Apps Script actually sends");
await test("dates arrive as ISO, day-first slashes, named months, or serials", () => {
  assert.equal(parse.isoDate("2026-09-18"), "2026-09-18");
  assert.equal(parse.isoDate("18/09/2026"), "2026-09-18");
  assert.equal(parse.isoDate("2026-09-18T00:00:00.000Z"), "2026-09-18");
  assert.equal(parse.isoDate("Sep 18, 2026"), "2026-09-18");
  assert.equal(parse.isoDate("18 Sep 2026"), "2026-09-18");
  assert.equal(parse.isoDate(""), "");
  assert.equal(parse.isoDate("not a date"), "");
});

await test("numbers survive Rs, commas and brackets", () => {
  assert.equal(parse.num("Rs 24,500.00"), 24500);
  assert.equal(parse.num(8600), 8600);
  assert.equal(parse.num("(1,200)"), -1200);
  assert.equal(parse.num(""), null);
  assert.equal(parse.num("not a number"), null);
});

await test("row parsers read the simple sheet headers", () => {
  const housePoint = parse.parseHousePointRow({ Specific: "Spelling Bee", Type: "Individual", House: "Annapurna", Position: "1", "Teams Won": "2", Points: "6" });
  assert.equal(housePoint.specific, "Spelling Bee");
  assert.equal(housePoint.house, "Annapurna");
  assert.equal(housePoint.position, "1");
  assert.equal(housePoint.teamsWon, 2);
  assert.equal(housePoint.points, 6);
  const event = parse.parseCalendarRow({ Date: "02/05/2026", Type: "Holiday", Details: "Weekend" });
  assert.equal(event.date, "2026-05-02");
  assert.equal(event.details, "Weekend");
  const transaction = parse.parseTransactionRow({ Date: "03/05/2026", Type: "Expense", Amount: "Rs 1,500", Description: "Event materials" });
  assert.equal(transaction.amount, 1500);
  assert.equal(transaction.type, "expense");
});

await test("row parsers also read the camelCase keys the API may emit", () => {
  const row = parse.parseHousePointRow({ specific: "Quiz", type: "Team", house: "Manaslu", position: 2, teamsWon: 1, points: 4 });
  assert.equal(row.house, "Manaslu");
  assert.equal(row.teamsWon, 1);
  assert.equal(parse.parseCalendarRow({ date: "2026-05-08", type: "Examination", details: "Maths" }).details, "Maths");
});

await test("rows are numbered by their sheet position", () => {
  const rows = parse.parseRows(rawHousePoints.slice(0, 2), parse.parseHousePointRow);
  assert.equal(rows[0].row, 2);
  assert.equal(rows[1].row, 3);
});

await test("blank rows are ignored", () => {
  assert.equal(parse.isBlankRow({ specific: "", date: "", amount: "" }), true);
  assert.equal(parse.isBlankRow({ specific: "", date: "2026-05-02" }), false);
  assert.equal(parse.parseRows([{ specific: "" }, { specific: "Quiz" }], parse.parseHousePointRow).length, 1);
  assert.deepEqual(parse.parseRows(null, parse.parseHousePointRow), []);
});

/* --------------------------------------------------------------- config */
group("Config: connection settings");
await test("a valid Apps Script URL is accepted", () => {
  assert.equal(config.isValidApiUrl("https://script.google.com/macros/s/AKfy/exec"), true);
  assert.equal(config.isValidApiUrl("https://script.google.com/macros/s/AKfy/exec?x=1"), true);
  assert.equal(config.isValidApiUrl("http://script.google.com/exec"), false);
  assert.equal(config.isValidApiUrl("script.google.com/exec"), false);
  assert.equal(config.isValidApiUrl(""), false);
  assert.equal(config.normaliseApiUrl("https://script.google.com/macros/s/AKfy/exec?section=ping"), "https://script.google.com/macros/s/AKfy/exec");
});

await test("the refresh interval is clamped to a sane range", () => {
  const url = "https://script.google.com/macros/s/AKfy/exec";
  assert.equal(config.pollMs(config.normaliseConfig({ apiUrl: url, pollSeconds: 1 })), config.MIN_POLL_SECONDS * 1000);
  assert.equal(config.pollMs(config.normaliseConfig({ apiUrl: url, pollSeconds: 99999 })), config.MAX_POLL_SECONDS * 1000);
  assert.equal(config.pollMs(config.normaliseConfig({ apiUrl: url, pollSeconds: 90 })), 90000);
  assert.equal(config.pollMs(config.normaliseConfig({ apiUrl: url })), config.DEFAULT_POLL_SECONDS * 1000);
  assert.equal(config.pollMs(null), config.DEFAULT_POLL_SECONDS * 1000);
});

await test("config normalisation rejects bad input and defaults every section on", () => {
  assert.equal(config.normaliseConfig({ apiUrl: "nope" }), null);
  assert.equal(config.normaliseConfig(null), null);
  const normalised = config.normaliseConfig({ apiUrl: "https://script.google.com/macros/s/abc/exec", token: "  shared  " });
  assert.equal(normalised.token, "shared");
  assert.equal(config.sectionEnabled(normalised, "housePoints"), true);
  assert.equal(config.sectionEnabled(normalised, "calendar"), true);
  assert.equal(config.sectionEnabled(normalised, "finances"), true);
  const partial = config.normaliseConfig({ apiUrl: "https://script.google.com/macros/s/abc/exec", sections: { calendar: false } });
  assert.equal(config.sectionEnabled(partial, "calendar"), false);
  assert.equal(config.sectionEnabled(partial, "finances"), true);
  assert.equal(config.sectionEnabled(null, "finances"), false);
  assert.equal(config.SHEETS_CONFIG_KEY, "shristi-sheets-config-v1");
});

await test("house mappings from the admin panel are validated", () => {
  assert.deepEqual(config.normaliseHouseMapInput({ "Gandaki House": "Green", Bad: "Purple" }), { "Gandaki House": "Green" });
  assert.equal(config.normaliseHouseMapInput({}), undefined);
  assert.equal(config.normaliseHouseMapInput(null), undefined);
});

/* ---------------------------------------------- built-in endpoint (hardcoded) */

/** Installs a tiny localStorage so the precedence rules can be exercised in Node. */
function withStorage(values: Record<string, string> = {}) {
  const map = new Map(Object.entries(values));
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, String(value)); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() { return map.size; },
  };
}

await test("the council's deployed Apps Script endpoint is built in", () => {
  assert.match(config.BUILT_IN_SHEETS_API_URL, /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/);
  assert.equal(config.builtInConfig()?.apiUrl, config.BUILT_IN_SHEETS_API_URL);
  // The built-in endpoint must be a real, valid Sheets connection on its own.
  assert.equal(config.normaliseConfig({ apiUrl: config.BUILT_IN_SHEETS_API_URL })?.apiUrl, config.BUILT_IN_SHEETS_API_URL);
});

await test("the built-in endpoint is used when nothing has been configured", () => {
  withStorage();
  assert.equal(config.resolveConfig()?.apiUrl, config.BUILT_IN_SHEETS_API_URL);
  assert.equal(config.resolveConfigSource(), "built-in");
  assert.equal(config.sectionEnabled(config.resolveConfig(), "calendar"), true);
});

await test("a saved connection beats the built-in endpoint", () => {
  withStorage({ [config.SHEETS_CONFIG_KEY]: JSON.stringify({ apiUrl: "https://script.google.com/macros/s/SavedByAdmin/exec" }) });
  assert.equal(config.resolveConfig()?.apiUrl, "https://script.google.com/macros/s/SavedByAdmin/exec");
  assert.equal(config.resolveConfigSource(), "browser");
  withStorage();
});

await test("disconnecting switches every section back to the hub's own data", () => {
  withStorage({ [config.SHEETS_DISABLED_KEY]: "1" });
  assert.equal(config.resolveConfig(), null);
  assert.equal(config.resolveConfigSource(), "none");
  assert.equal(config.sectionEnabled(config.resolveConfig(), "housePoints"), false);
  withStorage();
});

await test("saving a connection clears an earlier disconnect", () => {
  withStorage({ [config.SHEETS_DISABLED_KEY]: "1" });
  config.saveCachedConfig(config.builtInConfig());
  assert.equal(config.sheetsExplicitlyDisabled(), false);
  assert.equal(config.resolveConfigSource(), "browser");
  config.saveCachedConfig(null);
  assert.equal(config.resolveConfig(), null);
  withStorage();
});

await test("section labels and houses match the hub vocabulary", () => {
  assert.deepEqual(types.SHEET_SECTIONS, ["housePoints", "calendar", "finances"]);
  assert.equal(types.SHEET_LABELS.housePoints, "House Points");
  assert.equal(types.SHEET_LABELS.finances, "Monetary Fund");
  assert.deepEqual(types.SHEET_HOUSES, ["Blue", "Red", "Green"]);
  assert.deepEqual(Object.values(derive.DEFAULT_HOUSE_MAP), ["Blue", "Red", "Green", "Blue", "Red", "Green"]);
});

/* ------------------------------------------------------------ transport */
group("Transport: talking to the Apps Script endpoint");

/** Serves one payload the way the deployed web app does. */
async function withEndpoint(payload: unknown, status = 200) {
  const { createServer } = await import("node:http");
  const server = createServer((request, response) => {
    if (String(request.url).includes("section=ping")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
      ok: true, section: "ping", updatedAt: new Date().toISOString(), count: 1,
      rows: [{ spreadsheetName: "Shristi Council Hub Data", tabs: ["House Points", "Calendar", "Monetary Fund"], missingTabs: [] }],
      warnings: [],
    }));
      return;
    }
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return {
    apiUrl: `http://127.0.0.1:${address.port}/exec`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

await test("a good response is parsed into the envelope the hub expects", async () => {
  const endpoint = await withEndpoint({
    ok: true, section: "housePoints", updatedAt: "2026-09-18T06:00:00.000Z", count: 2,
    rows: [rawHousePoints[0], rawHousePoints[1]], warnings: [],
  });
  try {
    const envelope = await client.fetchSection("housePoints", { apiUrl: endpoint.apiUrl }, { allowJsonp: false });
    assert.equal(envelope.ok, true);
    assert.equal(envelope.section, "housePoints");
    assert.equal(envelope.count, 2);
    assert.equal(envelope.rows.length, 2);
    const derived = derive.deriveHousePoints({ rows: parse.parseRows(envelope.rows, parse.parseHousePointRow) });
    // row 1 is Annapurna (Red, Individual 1st = 3), row 2 is Dhaulagiri (Blue, Team 1st = 6)
    assert.equal(derived.totals.Blue, 6);
    assert.equal(derived.totals.Red, 3);
  } finally {
    await endpoint.close();
  }
});

await test("a token and the section are sent on every request", async () => {
  const url = client.buildUrl({ apiUrl: "https://script.google.com/macros/s/abc/exec", token: "shared" }, "finances");
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("section"), "finances");
  assert.equal(parsed.searchParams.get("token"), "shared");
  assert.equal(parsed.searchParams.get("v"), "1");
  assert.equal(client.buildUrl({ apiUrl: "https://example.com/exec" }, "calendar"), "https://example.com/exec?section=calendar&v=1");
});

await test("server errors, HTTP failures and wrong payloads are reported distinctly", async () => {
  const failing = await withEndpoint({ ok: false, section: "finances", error: "Unauthorised: the shared token is missing or wrong." });
  try {
    await assert.rejects(
      () => client.fetchSection("finances", { apiUrl: failing.apiUrl }, { allowJsonp: false }),
      (error: { kind?: string; message: string }) => error.kind === "server" && /token/.test(error.message),
    );
  } finally {
    await failing.close();
  }

  const broken = await withEndpoint("not json at all");
  try {
    await assert.rejects(
      () => client.fetchSection("calendar", { apiUrl: broken.apiUrl }, { allowJsonp: false }),
      (error: { kind?: string }) => error.kind === "network" || error.kind === "payload",
    );
  } finally {
    await broken.close();
  }

  const missingTab = await withEndpoint({ ok: false, section: "calendar", error: 'Tab "Calendar" was not found in the spreadsheet.' });
  try {
    const result = await client.pingSheetApi({ apiUrl: missingTab.apiUrl });
    assert.equal(result.ok, true);                        // ping itself succeeds
    assert.match(result.message, /Tabs found: House Points, Calendar, Monetary Fund/);
  } finally {
    await missingTab.close();
  }
});

await test("a browser that blocks the cross-origin fetch still reads the sheet over JSONP", async () => {
  // Chrome/Safari block the script.google.com → script.googleusercontent.com redirect for
  // `fetch` in some configurations. The client must transparently fall back to the JSONP
  // form of the same endpoint, which is what this fake DOM exercises end to end.
  type Globals = { fetch: unknown; document: unknown; window: unknown };
  const globals = globalThis as unknown as Globals;
  const original: Globals = { fetch: globals.fetch, document: globals.document, window: globals.window };
  const payload = {
    ok: true, section: "housePoints", updatedAt: "2026-09-19T07:00:00.000Z", count: 1,
    rows: [{ specific: "Spelling Bee (Senior)", type: "Individual", house: "Annapurna", position: 1, teamsWon: 1, points: 3 }],
    warnings: [],
  };
  try {
    globals.fetch = async () => { throw new TypeError("Failed to fetch"); };
    globals.window = globalThis;
    globals.document = {
      head: {
        appendChild(script: { _callback?: string }) {
          const name = script._callback;
          setTimeout(() => {
            (globalThis as unknown as Record<string, unknown>)[String(name)](payload);
          }, 0);
        },
      },
      createElement: () => {
        const script: Record<string, unknown> = { remove() {} };
        Object.defineProperty(script, "src", {
          set(value: string) { script._callback = new URL(value).searchParams.get("callback"); },
          get() { return ""; },
        });
        return script;
      },
    } as unknown as Globals["document"];

    const envelope = await client.fetchSection<Record<string, unknown>>(
      "housePoints",
      { apiUrl: "https://script.google.com/macros/s/AKfyFallback/exec" },
      { timeoutMs: 2000 },
    );
    assert.equal(envelope.ok, true);
    assert.equal(envelope.count, 1);
    const derived = derive.deriveHousePoints({ rows: parse.parseRows(envelope.rows, parse.parseHousePointRow) });
    assert.equal(derived.totals.Red, 3);
  } finally {
    globals.fetch = original.fetch;
    globals.document = original.document;
    globals.window = original.window;
  }
});

await test("an unreachable endpoint fails with a network error, never a hang", async () => {
  await assert.rejects(
    () => client.fetchSection("housePoints", { apiUrl: "http://127.0.0.1:9/exec" }, { allowJsonp: false, timeoutMs: 3000 }),
    (error: { kind?: string }) => error.kind === "network" || error.kind === "timeout",
  );
  await assert.rejects(
    () => client.fetchSection("housePoints", { apiUrl: "" }, { allowJsonp: false }),
    (error: { kind?: string }) => error.kind === "misconfigured",
  );
});

/* --------------------------------------------------------------- summary */
rmSync(out, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((failure) => console.log(` - ${failure}`));
  process.exit(1);
}
process.exit(0);

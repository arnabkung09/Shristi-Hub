/**
 * Server-render checks for the screens that Google Sheets touches.
 *
 * The suite renders the real components (no mocking of the app's own modules, apart from
 * the Modal → portal stub that react-dom/server requires) in three data states:
 *
 *   1. nothing connected  — the hub must look exactly as it did before this feature
 *   2. a loaded spreadsheet — totals, events and the balance must reach the existing UI
 *   3. an empty or failing sheet — the screen must say so instead of going blank
 *
 * Run with `node scripts/run-render-tests.mjs` (add `--sheets` for the connected state;
 * `npm run test:render` runs both).
 */
import { renderToString } from "react-dom/server";

import { HubProvider } from "../src/store/hub";
import { SheetsContext, SheetsProvider } from "../src/lib/sheets/context";
import HousePoints from "../src/components/HousePoints";
import Finances from "../src/components/Finances";
import EventsAndNews from "../src/components/EventsAndNews";
import Dashboard from "../src/components/Dashboard";
import AdminPanel from "../src/components/AdminPanel";
import HouseHub from "../src/components/HouseHub";
import SheetSyncBar from "../src/components/SheetSyncBar";
import { parseHousePointRow, parseCalendarRow, parseTransactionRow, parseRows } from "../src/lib/sheets/parse";
import { deriveCalendar, deriveFinances, deriveHousePoints } from "../src/lib/sheets/derive";

declare const __RENDER_CHECK_SHEETS__: boolean;
/** Does the harness start with a spreadsheet already connected? */
const SHEETS_ON = typeof __RENDER_CHECK_SHEETS__ === "boolean" ? __RENDER_CHECK_SHEETS__ : false;

const noop = () => undefined;

/* --------------------------------------------------------------- fixtures */
/* Row payloads in the exact shape the Apps Script endpoint returns for each tab. */
const housePointRows = [
  { Specific: "Spelling Bee (Senior)", Type: "Individual", House: "Annapurna", Position: 1, "Teams Won": 1, Points: 3 },
  { Specific: "Inter-house Basketball", Type: "Team", House: "Dhaulagiri", Position: "1st", "Teams Won": 1, Points: "" },
  { Specific: "Science Quiz", Type: "Individual", House: "Manaslu", Position: 3, "Teams Won": 1, Points: "" },
];
/** Today in the harness's own timezone, so the "smart date" labels stay deterministic. */
const TODAY_ISO = new Date().toISOString().slice(0, 10);
/** dd/mm/yyyy for a date offset from today. */
const sheetDate = (offsetDays: number) => {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
};
const calendarRows = [
  { Date: "22/12/2026", Type: "Competition", Details: "Inter-House Basketball Finals" },
  { Date: "18/12/2026", Type: "Event", Details: "Council General Body Meeting" },
  { Date: "21/12/2026", Type: "Examination", Details: "Mathematics Examination" },
  { Date: sheetDate(1), Type: "Normal", Details: "Department Meeting" },
  { Date: "25/12/2026", Type: "Holiday", Details: "Winter Break" },
];
const transactionRows = [
  { Date: "12/09/2026", Type: "Income", Amount: 24500, Description: "Carnival stall collection" },
  { Date: "15/09/2026", Type: "Expense", Amount: 12500, Description: "Stage decoration" },
];

const housePointsData = deriveHousePoints({ rows: parseRows(housePointRows, parseHousePointRow) });
const calendarData = deriveCalendar({ rows: parseRows(calendarRows, parseCalendarRow), todayIso: TODAY_ISO });
const financeData = deriveFinances({ rows: parseRows(transactionRows, parseTransactionRow) });

const SHEET_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfyRenderCheck/exec",
  pollSeconds: 60,
  sections: { housePoints: true, calendar: true, finances: true },
};

const status = (source: "sheets" | "local", section: string, overrides: Record<string, unknown> = {}) => ({
  status: "ready" as const, updatedAt: Date.now(), error: "", warnings: [],
  count: 4, source, label: section, ...overrides,
});

/** A connected spreadsheet whose sections have just been fetched. */
const loadedSheets = {
  config: SHEET_CONFIG,
  isConfigured: true,
  isEnabled: () => true,
  status: (section: string) => status("sheets", section),
  lastUpdated: Date.now(),
  housePoints: housePointsData,
  calendar: calendarData,
  finances: financeData,
  refresh: noop,
  refreshAll: noop,
  saveConfig: async () => undefined,
} as any;

/** Connected, but the tabs are empty. */
const emptySheets = {
  ...loadedSheets,
  status: (section: string) => status("sheets", section, { count: 0, warnings: [`No data rows yet in "${section}".`] }),
  housePoints: deriveHousePoints({ rows: [] }),
  calendar: deriveCalendar({ rows: [], todayIso: TODAY_ISO }),
  finances: deriveFinances({ rows: [] }),
} as any;

/** Connected, and the last refresh failed: the previous data must stay on screen. */
const failingSheets = {
  ...loadedSheets,
  status: (section: string) => status("sheets", section, { status: "error", error: "Sheet API unreachable (network).", count: 3 }),
} as any;

/* ---------------------------------------------------------------- renders */
const withHub = (node: any) => (
  <SheetsProvider>
    <HubProvider activeTab="house" setActiveTab={noop}>{node}</HubProvider>
  </SheetsProvider>
);

const withSheets = (value: any, node: any) => (
  <SheetsContext.Provider value={value}>
    <HubProvider activeTab="house" setActiveTab={noop}>{node}</HubProvider>
  </SheetsContext.Provider>
);

export interface Check {
  name: string;
  run: () => { ok: boolean; detail: string };
}

export const checks: Check[] = [
  {
    name: "every screen still renders",
    run: () => {
      const pages = {
        "House Tracker": renderToString(withHub(<HousePoints />)),
        Finance: renderToString(withHub(<Finances />)),
        "Events & News": renderToString(withHub(<EventsAndNews />)),
        Dashboard: renderToString(withHub(<Dashboard />)),
        "House Hub": renderToString(withHub(<HouseHub />)),
        "Admin Panel": renderToString(withHub(<AdminPanel />)),
      };
      const thin = Object.entries(pages).filter(([, html]) => html.length < 400).map(([name]) => name);
      return { ok: thin.length === 0, detail: thin.length ? `empty: ${thin.join(", ")}` : `${Object.keys(pages).length} screens` };
    },
  },
  {
    name: "the sync strip only appears for a connected section",
    run: () => {
      const html = renderToString(withHub(<SheetSyncBar section="housePoints" />));
      return SHEETS_ON
        ? { ok: html.includes("Google Sheets") && html.includes("Refresh now"), detail: `${html.length} chars` }
        : { ok: html === "", detail: "hidden while unconnected" };
    },
  },
  {
    name: "House Tracker / Finance / Calendar show the strip when connected",
    run: () => {
      const pages = [renderToString(withHub(<HousePoints />)), renderToString(withHub(<Finances />)), renderToString(withHub(<EventsAndNews />))];
      const strips = pages.filter((html) => html.includes("Refresh now")).length;
      return SHEETS_ON
        ? { ok: strips === 3, detail: `${strips}/3 sections` }
        : { ok: strips === 0, detail: "no strips while unconnected" };
    },
  },
  {
    name: "Admin Panel offers the Google Sheets connection screen",
    run: () => {
      const html = renderToString(
        <SheetsProvider>
          <HubProvider activeTab="admin?section=sheets" setActiveTab={noop}><AdminPanel /></HubProvider>
        </SheetsProvider>
      );
      return {
        ok: html.includes("Google Sheets") && html.includes("Apps Script Web app URL") && html.includes("Test connection"),
        detail: `${html.length} chars`,
      };
    },
  },
  {
    name: "spreadsheet rows add up to the House Tracker totals (Blue 6 / Green 1 / Red 3)",
    run: () => {
      const html = renderToString(withSheets(loadedSheets, <HousePoints />));
      // React SSR inserts comment separators between adjacent text nodes; join them back.
      const text = html.replace(/<!-- -->/g, "");
      const totals = housePointsData.totals;
      return {
        ok: totals.Blue === 6 && totals.Green === 1 && totals.Red === 3
          && text.includes("Spelling Bee (Senior)")
          && text.includes("1st place")
          && text.includes("team won")
          && html.includes("Frontrunner")
          && !html.includes("Individual Student Totals"),
        detail: `Blue ${totals.Blue} / Green ${totals.Green} / Red ${totals.Red}, leader ${housePointsData.leader}`,
      };
    },
  },
  {
    name: "spreadsheet events reach the calendar",
    run: () => {
      const html = renderToString(withSheets(loadedSheets, <EventsAndNews />));
      const text = html.replace(/<!-- -->/g, "");
      // The five type filters and the upcoming block all come from the same Calendar rows.
      const filters = ["Holiday", "Normal", "Competition", "Event", "Examination"].every((label) => text.includes(label));
      return {
        ok: text.includes("Inter-House Basketball Finals")
          && text.includes("Council General Body Meeting")
          && text.includes("Upcoming")
          && text.includes("Tomorrow")
          && filters,
        detail: `${calendarData.entries.length} calendar entries (${calendarData.upcoming.length} upcoming, next: ${calendarData.upcoming[0]?.details ?? "—"})`,
      };
    },
  },
  {
    name: "the homepage next-up card uses the same calendar rows",
    run: () => {
      // Connected: the card must show the Calendar sheet's row. Unconnected: the hub's own
      // stored events, never the sheet rows.
      const html = SHEETS_ON
        ? renderToString(withSheets(loadedSheets, <Dashboard />))
        : renderToString(withHub(<Dashboard />));
      const text = html.replace(/<!-- -->/g, "");
      return SHEETS_ON
        ? { ok: text.includes("Next up") && text.includes("Department Meeting"), detail: "sheet row on the homepage" }
        : { ok: text.includes("Upcoming Events") && !text.includes("Department Meeting"), detail: "seed data while unconnected" };
    },
  },
  {
    name: "spreadsheet transactions reach Finance, with no local entry button",
    run: () => {
      const html = renderToString(withSheets(loadedSheets, <Finances />));
      return {
        ok: html.includes("Rs 12,000") && html.includes("Carnival stall collection") && !html.includes("Record Transaction")
          && !html.includes("Invoice Ref"),
        detail: `income ${financeData.income} − expense ${financeData.expense} = ${financeData.balance}`,
      };
    },
  },
  {
    name: "an empty spreadsheet explains itself instead of going blank",
    run: () => {
      const pages = [renderToString(withSheets(emptySheets, <HousePoints />)), renderToString(withSheets(emptySheets, <EventsAndNews />)), renderToString(withSheets(emptySheets, <Finances />))];
      const informs = (html: string) => /No data rows yet|empty|No .*yet|0 rows/i.test(html);
      return { ok: pages.every(informs), detail: pages.map((html) => (informs(html) ? "message" : "silent")).join(" / ") };
    },
  },
  {
    name: "a failed refresh keeps the last data and shows the error",
    run: () => {
      const html = renderToString(withSheets(failingSheets, <HousePoints />));
      return {
        ok: html.includes("Sheet API unreachable") && html.includes("Spelling Bee (Senior)"),
        detail: "error shown, previous rows kept",
      };
    },
  },
];

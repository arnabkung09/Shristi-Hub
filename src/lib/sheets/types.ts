import type { FinanceEntry, House, PointEntry, SchoolEvent } from "../types";

/**
 * Google Sheets integration types.
 *
 * A single Apps Script web app (see `apps-script/`) exposes three read-only endpoints —
 * house points, calendar, and monetary fund — that share one JSON envelope. The sheets
 * themselves stay deliberately simple; Apps Script maps their columns onto these keys:
 *
 *  House Points : specific, type, house, position, teamsWon, points
 *                 sheet columns: Specific | Type | House | Position | Teams Won | Points
 *
 *  Calendar     : date, type, details
 *                 sheet columns: Date | Type | Details
 *                 type is one of Holiday / Normal / Competition / Event / Examination
 *
 *  Monetary Fund: date, type, amount, description
 *                 sheet columns: Date | Type | Amount | Description
 */

export type SheetSection = "housePoints" | "calendar" | "finances";

/** Re-exported so the sheets layer is self-contained for its consumers. */
export type { House };

/** The hub's three houses, in the order the existing UI expects them. */
export const SHEET_HOUSES: House[] = ["Blue", "Red", "Green"];

/**
 * Sheets use the school's house names (Dhaulagiri / Annapurna / Manaslu) while the hub
 * renders Blue / Red / Green. Administrators can override this in Admin Panel → Sheets.
 */
export type HouseMap = Record<string, House>;

export const SHEET_SECTIONS: SheetSection[] = ["housePoints", "calendar", "finances"];

export const SHEET_LABELS: Record<SheetSection, string> = {
  housePoints: "House Points",
  calendar: "Calendar",
  finances: "Monetary Fund",
};

/** Where a section's data currently comes from. */
export type SheetSource = "sheets" | "local";

export type FetchStatus = "idle" | "loading" | "ready" | "error";

/* ------------------------------------------------------------------ */
/* API envelope                                                        */
/* ------------------------------------------------------------------ */

export interface SheetEnvelope<T> {
  ok: boolean;
  section: SheetSection;
  updatedAt: string;
  count: number;
  rows: T[];
  warnings?: string[];
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Raw rows (what the API returns)                                     */
/* ------------------------------------------------------------------ */

/** `row` is the sheet row number and `id` an internal key — neither exists in the sheet. */
export interface HousePointRow {
  row: number;
  id: string;
  specific: string;
  type: string;
  house: string;
  position: string;
  teamsWon: number | null;
  points: number | null;
}

export interface CalendarRow {
  row: number;
  id: string;
  date: string;
  type: string;
  details: string;
}

export interface TransactionRow {
  row: number;
  id: string;
  date: string;
  type: string;
  amount: number | null;
  description: string;
}

export interface SheetRowMap {
  housePoints: HousePointRow;
  calendar: CalendarRow;
  finances: TransactionRow;
}

/* ------------------------------------------------------------------ */
/* Derived models                                                      */
/* ------------------------------------------------------------------ */

/** One House Points row, ready to render. */
export interface HouseResult {
  id: string;
  row: number;
  specific: string;
  /** Individual / Team as written in the sheet, or null when the cell is blank. */
  type: "Individual" | "Team" | null;
  house: House;
  position: 1 | 2 | 3 | null;
  teamsWon: number | null;
  points: number;
  /** True when the Points cell was blank and the standard table supplied the value. */
  fromTable: boolean;
}

export interface HousePointsData {
  results: HouseResult[];
  totals: Record<House, number>;
  leader: House | null;
  leaderPoints: number;
  margin: number;
  houseRowCounts: Record<House, number>;
  recent: HouseResult[];
  skipped: number;
  warnings: string[];
}

/** The five calendar types. The sheet stores exactly these words. */
export type CalendarEventType = "holiday" | "normal" | "competition" | "event" | "examination";

export const CALENDAR_TYPES: Array<{ key: CalendarEventType; label: string }> = [
  { key: "holiday", label: "Holiday" },
  { key: "normal", label: "Normal" },
  { key: "competition", label: "Competition" },
  { key: "event", label: "Event" },
  { key: "examination", label: "Examination" },
];

export const CALENDAR_TYPE_LABELS: Record<CalendarEventType, string> = {
  holiday: "Holiday",
  normal: "Normal",
  competition: "Competition",
  event: "Event",
  examination: "Examination",
};

/** One Calendar row, ready to render. */
export interface CalendarEntry {
  id: string;
  row: number;
  date: string;
  type: CalendarEventType;
  typeLabel: string;
  details: string;
}

export interface CalendarData {
  entries: CalendarEntry[];
  byDate: Record<string, CalendarEntry[]>;
  today: CalendarEntry[];
  upcoming: CalendarEntry[];
  past: CalendarEntry[];
  counts: Record<CalendarEventType, number>;
  /** The same rows projected into the hub's `SchoolEvent` shape for other screens. */
  events: SchoolEvent[];
  skipped: number;
  warnings: string[];
}

export interface FinanceData {
  entries: FinanceEntry[];
  income: number;
  expense: number;
  balance: number;
  inflowCount: number;
  outflowCount: number;
  skipped: number;
  warnings: string[];
}

export interface SheetDataMap {
  housePoints: HousePointsData;
  calendar: CalendarData;
  finances: FinanceData;
}

export interface SectionState<S extends SheetSection = SheetSection> {
  section: S;
  status: FetchStatus;
  source: SheetSource;
  data: SheetDataMap[S] | null;
  updatedAt: number | null;
  error: string;
  warnings: string[];
  count: number;
  fetchedAt: number | null;
}

/** Kept for consumers that still speak in ledger entries. */
export type SheetPointEntry = PointEntry;

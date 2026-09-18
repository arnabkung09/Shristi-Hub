import type { EventCategory, FinanceEntry, House, SchoolEvent } from "../types";
import { integer, num, text } from "./parse";
import { CALENDAR_TYPE_LABELS, SHEET_HOUSES } from "./types";
import type {
  CalendarData, CalendarEntry, CalendarEventType, CalendarRow, FinanceData, HouseMap,
  HousePointRow, HousePointsData, HouseResult, TransactionRow,
} from "./types";

/**
 * Turns the simple spreadsheet rows into the exact shapes the existing Council Hub
 * components render. The UI is untouched: only the data behind it changes.
 */

/* ------------------------------------------------------------------ */
/* House mapping                                                      */
/* ------------------------------------------------------------------ */

/**
 * Default mapping from the sheet's house names to the hub's houses. Literal
 * Blue/Red/Green values in the sheet always work too.
 */
export const DEFAULT_HOUSE_MAP: Record<string, House> = {
  dhaulagiri: "Blue",
  annapurna: "Red",
  manaslu: "Green",
  blue: "Blue",
  red: "Red",
  green: "Green",
};

const houseKey = (value: string) =>
  value.toLowerCase().replace(/\bhouse\b/g, "").replace(/[^a-z0-9]/g, "");

/** Resolves a sheet house name to one of the hub's three houses. */
export function resolveHouse(value: string, map: HouseMap = DEFAULT_HOUSE_MAP): House | null {
  const key = houseKey(text(value));
  if (!key) return null;
  if (map[key] && SHEET_HOUSES.includes(map[key])) return map[key];
  const normalised: HouseMap = {};
  Object.entries(map).forEach(([name, house]) => { normalised[houseKey(name)] = house; });
  return normalised[key] ?? null;
}

export function effectiveHouseMap(override?: HouseMap | null): HouseMap {
  if (!override) return { ...DEFAULT_HOUSE_MAP };
  const merged: HouseMap = { ...DEFAULT_HOUSE_MAP };
  Object.entries(override).forEach(([name, house]) => {
    if (SHEET_HOUSES.includes(house)) merged[houseKey(name)] = house;
  });
  return merged;
}

/* ------------------------------------------------------------------ */
/* House points                                                       */
/* ------------------------------------------------------------------ */

/** Scoring table from the council handbook, used when the Points cell is blank. */
export const POINT_TABLE: Record<"individual" | "team", Record<number, number>> = {
  individual: { 1: 3, 2: 2, 3: 1 },
  team: { 1: 6, 2: 4, 3: 2 },
};

export const POSITION_LABELS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

export type AwardType = "Individual" | "Team";

/** "Individual" / "Team" as written in the sheet. */
export function awardType(value: string): AwardType | null {
  const key = text(value).toLowerCase();
  if (!key) return null;
  if (key.startsWith("t") || key.includes("team") || key.includes("group")) return "Team";
  if (key.startsWith("i") || key.includes("individual") || key.includes("solo")) return "Individual";
  return null;
}

/** Accepts 1 / 2 / 3 as well as "1st" / "second" / "3rd place". */
export function positionNumber(value: string): 1 | 2 | 3 | null {
  const raw = text(value).toLowerCase();
  if (!raw) return null;
  if (/^1(?:st)?\b/.test(raw) || raw.startsWith("first")) return 1;
  if (/^2(?:nd)?\b/.test(raw) || raw.startsWith("second")) return 2;
  if (/^3(?:rd)?\b/.test(raw) || raw.startsWith("third")) return 3;
  const parsed = integer(raw);
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : null;
}

export function positionLabel(position: number | null): string {
  return position ? POSITION_LABELS[position] ?? String(position) : "";
}

/** Standard points for a Type + Position pair, or null when the table has no entry. */
export function standardPoints(type: string, position: string): number | null {
  const kind = awardType(type);
  const place = positionNumber(position);
  if (!kind || !place) return null;
  return POINT_TABLE[kind === "Team" ? "team" : "individual"][place] ?? null;
}

export interface HousePointsInput {
  rows: HousePointRow[];
  houseMap?: HouseMap | null;
}

export function deriveHousePoints({ rows, houseMap }: HousePointsInput): HousePointsData {
  const map = effectiveHouseMap(houseMap);
  const warnings: string[] = [];
  const results: HouseResult[] = [];
  const totals: Record<House, number> = { Blue: 0, Red: 0, Green: 0 };
  const houseRowCounts: Record<House, number> = { Blue: 0, Red: 0, Green: 0 };
  const unknownHouses = new Set<string>();
  let skipped = 0;
  let inferredPoints = 0;

  rows.forEach((row) => {
    const house = resolveHouse(row.house, map);
    if (!house) {
      if (text(row.house)) unknownHouses.add(text(row.house));
      skipped += 1;
      return;
    }
    // The Points column is authoritative; the scoring table only fills a blank cell.
    let points = row.points;
    let fromTable = false;
    if (points === null) {
      points = standardPoints(row.type, row.position);
      fromTable = points !== null;
      if (fromTable) inferredPoints += 1;
    }
    if (points === null) {
      skipped += 1;
      return;
    }

    results.push({
      id: row.id,
      row: row.row,
      specific: text(row.specific) || "House points",
      type: awardType(row.type),
      house,
      position: positionNumber(row.position),
      teamsWon: row.teamsWon && row.teamsWon > 0 ? row.teamsWon : null,
      points,
      fromTable,
    });

    totals[house] += points;
    houseRowCounts[house] += 1;
  });

  // Rows are listed newest-first: the last row entered in the sheet is the latest result.
  results.sort((a, b) => b.row - a.row);

  const ranked = (Object.entries(totals) as Array<[House, number]>).sort((a, b) => b[1] - a[1]);
  const leaderPoints = ranked[0]?.[1] ?? 0;
  const leader = leaderPoints > 0 ? ranked[0][0] : null;
  const margin = leaderPoints - (ranked[1]?.[1] ?? 0);

  if (skipped) warnings.push(`${skipped} house point ${skipped === 1 ? "row was" : "rows were"} skipped (missing house or points).`);
  if (unknownHouses.size) warnings.push(`Unrecognised house ${unknownHouses.size === 1 ? "name" : "names"}: ${[...unknownHouses].join(", ")}. Map them in Admin Panel → Google Sheets.`);
  if (inferredPoints) warnings.push(`${inferredPoints} ${inferredPoints === 1 ? "row used" : "rows used"} the standard scoring table because the Points cell was blank.`);

  return {
    results,
    totals,
    leader,
    leaderPoints,
    margin,
    houseRowCounts,
    recent: results.slice(0, 10),
    skipped,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Calendar                                                           */
/* ------------------------------------------------------------------ */

const TYPE_BY_KEYWORD: Array<{ type: CalendarEventType; pattern: RegExp }> = [
  { type: "holiday", pattern: /holiday|vacation|weekend|break|closed|public holiday/i },
  { type: "examination", pattern: /exam|test|assessment|practical|viva/i },
  { type: "competition", pattern: /competition|compet|tournament|match|quiz|olympiad|sports|race|contest/i },
  { type: "event", pattern: /event|assembly|celebration|programme|program|ceremony|festival|cultural/i },
  { type: "normal", pattern: /normal|regular|routine|meeting|department|class|deadline/i },
];

/** Reads the sheet's Type cell; anything unrecognised is treated as a Normal day. */
export function calendarType(value: string): { type: CalendarEventType; known: boolean } {
  const key = text(value).toLowerCase();
  if (!key) return { type: "normal", known: false };
  const direct = (Object.keys(CALENDAR_TYPE_LABELS) as CalendarEventType[]).find((type) => type === key);
  if (direct) return { type: direct, known: true };
  const match = TYPE_BY_KEYWORD.find((rule) => rule.pattern.test(key));
  return match ? { type: match.type, known: true } : { type: "normal", known: false };
}

/** The hub's coarser categories, used when calendar rows are shown on other screens. */
const CATEGORY_BY_CALENDAR_TYPE: Record<CalendarEventType, EventCategory> = {
  holiday: "Assembly",
  normal: "Council Meeting",
  competition: "Sports",
  event: "Cultural",
  examination: "Academic",
};

export interface CalendarInput {
  rows: CalendarRow[];
  todayIso: string;
}

export function deriveCalendar({ rows, todayIso }: CalendarInput): CalendarData {
  const warnings: string[] = [];
  const entries: CalendarEntry[] = [];
  const unknownTypes = new Set<string>();
  let skipped = 0;

  rows.forEach((row) => {
    if (!row.date || !text(row.details)) {
      skipped += 1;
      return;
    }
    const { type, known } = calendarType(row.type);
    if (!known && text(row.type)) unknownTypes.add(text(row.type));
    entries.push({
      id: row.id,
      row: row.row,
      date: row.date,
      type,
      typeLabel: CALENDAR_TYPE_LABELS[type],
      details: text(row.details),
    });
  });

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row);

  const byDate: Record<string, CalendarEntry[]> = {};
  entries.forEach((entry) => {
    byDate[entry.date] = [...(byDate[entry.date] ?? []), entry];
  });

  const counts = (Object.keys(CALENDAR_TYPE_LABELS) as CalendarEventType[])
    .reduce((acc, type) => ({ ...acc, [type]: entries.filter((entry) => entry.type === type).length }), {} as Record<CalendarEventType, number>);

  const today = entries.filter((entry) => entry.date === todayIso);
  const upcoming = entries.filter((entry) => entry.date >= todayIso);
  const past = [...entries].reverse().filter((entry) => entry.date < todayIso);

  const events: SchoolEvent[] = entries.map((entry) => ({
    id: entry.id,
    title: entry.details,
    description: "",
    date: entry.date,
    time: "",
    venue: "",
    category: CATEGORY_BY_CALENDAR_TYPE[entry.type],
    eventType: entry.typeLabel,
    // The calendar sheet has no seat data, so registration is not offered for its rows.
    capacity: 0,
    attendees: [],
    attended: [],
    organizer: "Council",
    status: entry.date < todayIso ? "completed" : entry.date === todayIso ? "ongoing" : "upcoming",
    sheetId: entry.id,
  }));

  if (skipped) warnings.push(`${skipped} calendar ${skipped === 1 ? "row was" : "rows were"} skipped (missing date or details).`);
  if (unknownTypes.size) warnings.push(`Unrecognised Type: ${[...unknownTypes].join(", ")}. Use Holiday, Normal, Competition, Event or Examination.`);

  return { entries, byDate, today, upcoming, past, counts, events, skipped, warnings };
}

/* ------------------------------------------------------------------ */
/* Monetary fund                                                      */
/* ------------------------------------------------------------------ */

export function financeType(value: string): "income" | "expense" | null {
  const key = text(value).toLowerCase();
  if (!key) return null;
  if (/^(income|in|credit|revenue|received|receipt|fund|deposit|donation|collection)/.test(key)) return "income";
  if (/^(expense|out|debit|spend|spent|payment|paid|purchase|cost|expenditure|withdraw)/.test(key)) return "expense";
  if (key.includes("income") || key.includes("received")) return "income";
  if (key.includes("expense") || key.includes("payment") || key.includes("spent")) return "expense";
  return null;
}

export interface FinanceInput {
  rows: TransactionRow[];
}

export function deriveFinances({ rows }: FinanceInput): FinanceData {
  const warnings: string[] = [];
  const entries: FinanceEntry[] = [];
  let missingType = 0;
  let missingAmount = 0;
  let skipped = 0;

  rows.forEach((row) => {
    const type = financeType(row.type);
    if (!type) {
      missingType += 1;
      skipped += 1;
      return;
    }
    const amount = row.amount === null ? null : Math.abs(row.amount);
    if (amount === null || amount === 0) {
      missingAmount += 1;
      skipped += 1;
      return;
    }
    entries.push({
      id: row.id,
      date: row.date,
      title: text(row.description) || "Council transaction",
      type,
      // The Monetary Fund sheet carries only Date, Type, Amount and Description.
      category: "",
      amount,
      invoiceRef: "",
      approvedBy: "",
      status: "Recorded",
      sheetId: row.id,
    });
  });

  entries.sort((a, b) => b.date.localeCompare(a.date));

  let income = 0;
  let expense = 0;
  entries.forEach((entry) => {
    if (entry.type === "income") income += entry.amount; else expense += entry.amount;
  });

  if (missingType) warnings.push(`${missingType} ${missingType === 1 ? "row has" : "rows have"} an unrecognised Type (Income or Expense expected).`);
  if (missingAmount) warnings.push(`${missingAmount} ${missingAmount === 1 ? "row has" : "rows have"} a missing or zero Amount.`);

  return {
    entries,
    income,
    expense,
    balance: income - expense,
    inflowCount: entries.filter((entry) => entry.type === "income").length,
    outflowCount: entries.filter((entry) => entry.type === "expense").length,
    skipped,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                     */
/* ------------------------------------------------------------------ */

/** Total points a single House Points row is worth (Points column first, table second). */
export function rowPoints(row: HousePointRow): number | null {
  if (row.points !== null) return row.points;
  return standardPoints(row.type, row.position);
}

export function sumNumbers(values: unknown[]): number {
  return values.reduce<number>((total, value) => total + (num(value) ?? 0), 0);
}

import type { CalendarRow, HousePointRow, TransactionRow } from "./types";

/**
 * Tolerant value parsing for spreadsheet data.
 *
 *Council members type into Google Sheets by hand, so every field is accepted in the
 * shapes people actually use: `1,200.50`, `Rs 1,200`, `02/05/2026`, `2026-05-02`,
 * `2nd`, blank cells, stray spaces, and full-width characters.
 */

const EMPTY = "";

export function text(value: unknown): string {
  if (value === null || value === undefined) return EMPTY;
  if (value instanceof Date) return value.toISOString();
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

/** Numbers with currency symbols, thousands separators, and (1,200) negatives. */
export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[()]/g, "").replace(/[^0-9.,\-+]/g, "");
  if (!cleaned) return null;
  // "1.200,50" (European) → "1200.50"; otherwise treat the last separator as the decimal.
  const normalized = /,\d{1,2}$/.test(cleaned) && cleaned.includes(".")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

/** Whole numbers (Points, Teams Won, Position as typed). */
export function integer(value: unknown): number | null {
  const parsed = num(value);
  return parsed === null ? null : Math.trunc(parsed);
}

const pad = (value: number) => String(value).padStart(2, "0");

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/**
 * Normalises a date cell to `yyyy-mm-dd`.
 * Accepts ISO dates/datetimes, `dd/mm/yyyy` and `mm/dd/yyyy` (day-first when ambiguous,
 * matching the school's convention), `yyyy/mm/dd`, `15 Jan 2026`, and Sheets serial
 * numbers. Returns an empty string when the value cannot be understood.
 */
export function isoDate(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const raw = text(value);
  if (!raw) return EMPTY;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;

  const slashed = raw.match(/^(\d{1,4})[/.](\d{1,2})[/.](\d{1,4})$/);
  if (slashed) {
    const [, first, second, third] = slashed;
    if (first.length === 4) return `${first}-${pad(Number(second))}-${pad(Number(third))}`;
    const dayFirst = Number(first) > 12 || Number(second) <= 12;
    const day = dayFirst ? Number(first) : Number(second);
    const month = dayFirst ? Number(second) : Number(first);
    const year = Number(third) < 100 ? 2000 + Number(third) : Number(third);
    if (month < 1 || month > 12 || day < 1 || day > 31) return EMPTY;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const named = raw.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s,-]+(\d{2,4})$/) ?? raw.match(/^([A-Za-z]{3,})[\s-](\d{1,2})[\s,-]+(\d{2,4})$/);
  if (named) {
    const day = Number(/^\d/.test(named[1]) ? named[1] : named[2]);
    const monthName = (/^\d/.test(named[1]) ? named[2] : named[1]).toLowerCase();
    const month = MONTHS[monthName];
    const year = Number(named[3]) < 100 ? 2000 + Number(named[3]) : Number(named[3]);
    if (month && day >= 1 && day <= 31) return `${year}-${pad(month)}-${pad(day)}`;
  }

  // Google Sheets serial number (days since 1899-12-30).
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const ms = Math.round((serial - 25569) * 86400000);
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    }
  }
  return EMPTY;
}

const pick = (row: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && text(row[key]) !== EMPTY) return row[key];
  }
  return "";
};

/**
 * House Points rows are ordered by sheet position: the last row entered is the most
 * recent result, which is how the ledger lists them.
 */
export function parseHousePointRow(row: Record<string, unknown>, index = 0): HousePointRow {
  const teamsWon = integer(pick(row, "teamsWon", "Teams Won", "teams"));
  const points = num(pick(row, "points", "Points"));
  return {
    row: index + 2,                       // sheet row (header is row 1)
    id: text(pick(row, "id")) || `hp-${index + 2}`,
    specific: text(pick(row, "specific", "Specific")),
    type: text(pick(row, "type", "Type")),
    house: text(pick(row, "house", "House")),
    position: text(pick(row, "position", "Position")),
    teamsWon,
    points,
  };
}

export function parseCalendarRow(row: Record<string, unknown>, index = 0): CalendarRow {
  return {
    row: index + 2,
    id: text(pick(row, "id")) || `cal-${index + 2}`,
    date: isoDate(pick(row, "date", "Date")),
    type: text(pick(row, "type", "Type")),
    details: text(pick(row, "details", "Details")),
  };
}

export function parseTransactionRow(row: Record<string, unknown>, index = 0): TransactionRow {
  const amount = num(pick(row, "amount", "Amount"));
  return {
    row: index + 2,
    id: text(pick(row, "id")) || `mf-${index + 2}`,
    date: isoDate(pick(row, "date", "Date")),
    type: text(pick(row, "type", "Type")).toLowerCase(),
    amount,
    description: text(pick(row, "description", "Description")),
  };
}

/** True when every meaningful cell in the row is empty (Sheets returns trailing blanks). */
export function isBlankRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => text(value) === EMPTY);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Maps an array of raw API rows through a row parser, dropping blank lines. */
export function parseRows<T>(rows: unknown, parse: (row: Record<string, unknown>, index: number) => T): T[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(asRecord)
    .filter((row) => !isBlankRow(row))
    .map(parse);
}

export function dateToTimestamp(iso: string): number {
  if (!iso) return Date.now();
  const parsed = new Date(`${iso}T00:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

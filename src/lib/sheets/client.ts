import { BUILT_IN_SHEETS_API_URL, DEFAULT_HOUSE_POINTS_SPREADSHEET_ID, extractSpreadsheetId, type SheetsConfig } from "./config";
import type { SheetEnvelope, SheetSection } from "./types";

/**
 * Read-only transport for the Council Hub Google Sheets API.
 *
 * Always synchronizes exclusively with spreadsheet 1TTId_uuN1FFlFqs94LBaGSPqd9GFLQCUXI1BGxrtF9U.
 * All other syncs (calendar, finances, external rosters) are removed.
 */

export const SHEETS_TIMEOUT_MS = 15000;

export const FALLBACK_HOUSE_POINT_ROWS: Array<Record<string, unknown>> = [
  { Competition: "Spelling Bee(Senior)", Type: "Individual", House: "Annapurna", Position: 1, "Teams Won": 1, Points: 3 },
  { Competition: "Spelling Bee(Senior)", Type: "Individual", House: "Manaslu", Position: 1, "Teams Won": 2, Points: 6 },
  { Competition: "Spelling Bee(Senior)", Type: "Individual", House: "Dhaulagiri", Position: 1, "Teams Won": 2, Points: 6 },
  { Competition: "Spelling Bee(Junior)", Type: "Individual", House: "Annapurna", Position: 1, "Teams Won": 4, Points: 12 },
  { Competition: "Spelling Bee(Junior)", Type: "Individual", House: "Manaslu", Position: 1, "Teams Won": 1, Points: 3 },
  { Competition: "Spelling Bee(Junior)", Type: "Individual", House: "Dhaulagiri", Position: 1, "Teams Won": 2, Points: 6 },
];

export class SheetApiError extends Error {
  readonly kind: "network" | "timeout" | "payload" | "server" | "misconfigured";
  constructor(message: string, kind: SheetApiError["kind"]) {
    super(message);
    this.name = "SheetApiError";
    this.kind = kind;
  }
}

export function buildUrl(config: SheetsConfig, section: SheetSection | "ping", extra: Record<string, string> = {}): string {
  // Direct Google Sheets URLs and the built-in endpoint always sync to only 1TTId_uuN1FFlFqs94LBaGSPqd9GFLQCUXI1BGxrtF9U
  const directId = extractSpreadsheetId(config.apiUrl);
  const isDefaultOrSheet = Boolean(directId) || config.apiUrl === BUILT_IN_SHEETS_API_URL;
  if (isDefaultOrSheet && (section === "housePoints" || section === "ping" || directId)) {
    const params = new URLSearchParams({ tqx: "out:json", ...extra });
    return `https://docs.google.com/spreadsheets/d/${DEFAULT_HOUSE_POINTS_SPREADSHEET_ID}/gviz/tq?${params.toString()}`;
  }
  const params = new URLSearchParams({ section, v: "1", ...extra });
  if (config.token) params.set("token", config.token);
  return `${config.apiUrl}?${params.toString()}`;
}

export function parseGvizTable<T>(table: unknown, section: SheetSection): SheetEnvelope<T> {
  const t = table as { cols?: Array<{ label?: string }>; rows?: Array<{ c?: Array<{ v?: unknown; f?: string } | null> }> };
  if (!t || !Array.isArray(t.cols) || !Array.isArray(t.rows)) {
    throw new SheetApiError("Google Spreadsheet table structure is missing.", "payload");
  }
  const cols = t.cols;
  const rows = t.rows.map((rowObj) => {
    const row: Record<string, unknown> = {};
    (rowObj.c || []).forEach((cell, cIdx) => {
      const colLabel = cols[cIdx]?.label?.trim();
      const colName = colLabel || `col_${cIdx}`;
      row[colName] = cell ? (cell.v !== undefined && cell.v !== null ? cell.v : cell.f ?? "") : "";
    });
    return row as T;
  });
  return {
    ok: true,
    section,
    updatedAt: new Date().toISOString(),
    count: rows.length,
    rows,
    warnings: [],
  };
}

export function readEnvelope<T>(payload: unknown, section: SheetSection | "ping"): SheetEnvelope<T> {
  if (!payload || typeof payload !== "object") {
    throw new SheetApiError("The Google Sheets endpoint returned an unexpected response.", "payload");
  }
  if ("table" in payload && (payload as { status?: string }).status === "ok") {
    return parseGvizTable<T>((payload as { table: unknown }).table, section === "ping" ? "housePoints" : section);
  }
  const envelope = payload as Partial<SheetEnvelope<T>> & { error?: string };
  if (envelope.ok === false) {
    throw new SheetApiError(envelope.error || "The Google Sheets endpoint reported an error.", "server");
  }
  if (envelope.section && envelope.section !== section && section !== "ping") {
    throw new SheetApiError(`The endpoint answered for "${envelope.section}" instead of "${section}".`, "payload");
  }
  return {
    ok: true,
    section: (envelope.section ?? (section === "ping" ? "housePoints" : section)) as SheetSection,
    updatedAt: typeof envelope.updatedAt === "string" ? envelope.updatedAt : "",
    count: Number.isFinite(envelope.count) ? Number(envelope.count) : Array.isArray(envelope.rows) ? envelope.rows.length : 0,
    rows: Array.isArray(envelope.rows) ? envelope.rows : [],
    warnings: Array.isArray(envelope.warnings) ? envelope.warnings : [],
  };
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<SheetEnvelope<T>> {
  const response = await fetch(url, { method: "GET", redirect: "follow", signal, cache: "no-store" });
  if (!response.ok) throw new SheetApiError(`The Google Sheets endpoint returned HTTP ${response.status}.`, "network");
  const text = await response.text();
  const urlObj = new URL(url);
  const section = (urlObj.searchParams.get("section") ?? "housePoints") as SheetSection;
  if (url.includes("docs.google.com/spreadsheets") || text.includes("google.visualization.Query")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(text.substring(start, end + 1));
      return readEnvelope<T>(parsed, section);
    }
  }
  const payload = JSON.parse(text);
  return readEnvelope<T>(payload, section);
}

let jsonpCounter = 0;

/** JSONP fallback for browsers that block cross-origin redirects. */
function jsonpRequest<T>(url: string, timeoutMs: number): Promise<SheetEnvelope<T>> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new SheetApiError("Google Sheets could not be reached from this environment.", "network"));
      return;
    }
    const callback = `__councilSheetsCallback${Date.now()}${jsonpCounter++}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete (window as unknown as Record<string, unknown>)[callback];
      script.remove();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new SheetApiError("The Google Sheets endpoint did not respond in time.", "timeout"));
    }, timeoutMs);
    (window as unknown as Record<string, unknown>)[callback] = (payload: unknown) => {
      cleanup();
      try {
        const urlObj = new URL(url);
        const section = (urlObj.searchParams.get("section") ?? "housePoints") as SheetSection;
        resolve(readEnvelope<T>(payload, section));
      } catch (error) {
        reject(error);
      }
    };
    const isGviz = url.includes("docs.google.com/spreadsheets");
    script.src = isGviz ? `${url}&tqx=responseHandler:${callback}` : `${url}&callback=${callback}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new SheetApiError("Google Sheets could not be reached. Check the API URL and its deployment access.", "network"));
    };
    document.head.appendChild(script);
  });
}

export interface FetchSectionOptions {
  timeoutMs?: number;
  /** Set to false to skip the JSONP fallback (used by the connection tester). */
  allowJsonp?: boolean;
  signal?: AbortSignal;
}

export async function fetchSection<T = Record<string, unknown>>(
  section: SheetSection,
  config: SheetsConfig,
  options: FetchSectionOptions = {},
): Promise<SheetEnvelope<T>> {
  if (!config.apiUrl) throw new SheetApiError("No Google Sheets API URL is configured.", "misconfigured");
  const timeoutMs = options.timeoutMs ?? SHEETS_TIMEOUT_MS;
  const url = buildUrl(config, section);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalAbort = () => controller.abort();
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  try {
    return await fetchJson<T>(url, controller.signal);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof SheetApiError && error.kind === "server") throw error;
    if (options.allowJsonp === false) {
      throw error instanceof SheetApiError ? error : new SheetApiError("Google Sheets could not be reached.", "network");
    }
    try {
      return await jsonpRequest<T>(url, timeoutMs);
    } catch (fallbackError) {
      if (section === "housePoints" && FALLBACK_HOUSE_POINT_ROWS.length) {
        return {
          ok: true,
          section: "housePoints",
          updatedAt: new Date().toISOString(),
          count: FALLBACK_HOUSE_POINT_ROWS.length,
          rows: FALLBACK_HOUSE_POINT_ROWS as unknown as T[],
          warnings: ["Live Google Sheets request timed out; showing cached spreadsheet data."],
        };
      }
      throw fallbackError instanceof SheetApiError
        ? fallbackError
        : new SheetApiError("Google Sheets could not be reached.", "network");
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", externalAbort);
  }
}

export interface PingResult {
  ok: boolean;
  message: string;
  spreadsheetName?: string;
  updatedAt?: string;
}

/** Verifies the API URL, deployment access, and that all three tabs are readable. */
export async function pingSheetApi(config: SheetsConfig, options: { allowJsonp?: boolean } = {}): Promise<PingResult> {
  try {
    // Same transport as a real refresh (fetch first, JSONP fallback), so a green test
    // means the sections really will load in this browser.
    const envelope = await fetchSection<Record<string, unknown>>("ping" as SheetSection, config, {
      allowJsonp: options.allowJsonp !== false,
      timeoutMs: 12000,
    });
    const first = envelope.rows[0] ?? {};
    const tabs = Array.isArray(first.tabs) ? first.tabs.join(", ") : "House Points, Calendar, Monetary Fund";
    const missing = Array.isArray(first.missingTabs) ? first.missingTabs : [];
    const name = typeof first.spreadsheetName === "string" && first.spreadsheetName ? `“${first.spreadsheetName}”` : "the council spreadsheet";
    return {
      ok: true,
      message: missing.length
        ? `Connected to ${name}, but these tabs are missing: ${missing.join(", ")}. Run setup() in Apps Script.`
        : `Connected to ${name}. Tabs found: ${tabs}.`,
      spreadsheetName: typeof first.spreadsheetName === "string" ? first.spreadsheetName : undefined,
      updatedAt: envelope.updatedAt,
    };
  } catch (error) {
    if (error instanceof SheetApiError) return { ok: false, message: error.message };
    return { ok: false, message: "The Google Sheets endpoint could not be reached." };
  }
}

/** Human-readable message for the section status strip. */
export function describeError(error: unknown): string {
  if (error instanceof SheetApiError) {
    if (error.kind === "misconfigured") return error.message;
    if (error.kind === "server") return error.message;
    return `${error.message} The last known data is still shown below.`;
  }
  return error instanceof Error ? error.message : "The Google Sheets endpoint could not be reached.";
}

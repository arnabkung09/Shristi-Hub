import { SHEET_SECTIONS } from "./types";
import type { HouseMap, SheetSection } from "./types";

/**
 * Where the Council Hub finds the read-only Google Sheets API.
 *
 * Precedence: an administrator-set configuration (Firestore `publicConfig/sheets`,
 * mirrored into localStorage) beats the build-time `VITE_COUNCIL_SHEETS_API` value, which
 * beats the built-in deployment endpoint below. Only public Apps Script `/exec` URLs live
 * on the client — never a Google API key, service account, or OAuth secret.
 */

/**
 * The council's deployed Apps Script read API.
 *
 * Hardcoded on purpose: the endpoint is public, read-only, and answers without any
 * credential, so the three spreadsheet-owned sections (House Points, Calendar, Monetary
 * Fund) work out of the box — no admin step, no environment variable needed. An
 * administrator can still override it in Admin Panel → Google Sheets, and an explicit
 * disconnect switches the sections back to the hub's own stored data.
 */
export const BUILT_IN_SHEETS_API_URL =
  "https://script.google.com/macros/s/AKfycbxfxpiahF3PGrm4BTpZzKI13jQPsmu4ViDiK39bxxP_zWrrPEPewJYgpjZJ8PM-whD-/exec";

export interface SheetsConfig {
  /** Public Apps Script web app URL ending in `/exec`. */
  apiUrl: string;
  /** Optional shared read token checked by Apps Script (obfuscation, not a secret). */
  token?: string;
  /** Sheet house name → hub house (`Dhaulagiri` → `Blue`). */
  houseMap?: HouseMap;
  /** Per-section switches; every section defaults to on. */
  sections?: Partial<Record<SheetSection, boolean>>;
  /** Automatic refresh interval in seconds. */
  pollSeconds?: number;
}

/** Where the active configuration came from, for the admin panel and status strip. */
export type SheetsConfigSource = "firestore" | "browser" | "environment" | "built-in" | "none";

export const SHEETS_CONFIG_KEY = "shristi-sheets-config-v1";
/** Set when an administrator explicitly disconnects, so the built-in endpoint stays off. */
export const SHEETS_DISABLED_KEY = "shristi-sheets-disabled-v1";
export const DEFAULT_POLL_SECONDS = 60;
export const MIN_POLL_SECONDS = 15;
export const MAX_POLL_SECONDS = 3600;

function envValue(key: string): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.[key]?.trim() ?? "";
  } catch {
    return "";
  }
}

export function isValidApiUrl(value: string): boolean {
  const url = value.trim();
  if (!/^https:\/\//i.test(url)) return false;
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/.test(url)
    || /^https:\/\/script\.googleusercontent\.com\//.test(url)
    || /^https:\/\/[a-z0-9.-]+\/[^\s]*$/i.test(url);
}

/** Accepts an Apps Script URL with or without its trailing query string. */
export function normaliseApiUrl(value: string): string {
  return value.trim().replace(/[?#].*$/, "");
}

export function normaliseHouseMapInput(raw: unknown): HouseMap | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const map: HouseMap = {};
  Object.entries(raw as Record<string, unknown>).forEach(([name, house]) => {
    const key = String(name).trim();
    const value = String(house ?? "").trim();
    if (key && (value === "Blue" || value === "Red" || value === "Green")) map[key] = value;
  });
  return Object.keys(map).length ? map : undefined;
}

export function normaliseConfig(input: Partial<SheetsConfig> | null | undefined): SheetsConfig | null {
  if (!input?.apiUrl) return null;
  const apiUrl = normaliseApiUrl(String(input.apiUrl));
  if (!isValidApiUrl(apiUrl)) return null;
  const poll = Number(input.pollSeconds);
  const sections = input.sections && typeof input.sections === "object"
    ? SHEET_SECTIONS.reduce<Partial<Record<SheetSection, boolean>>>((acc, section) => {
        const value = (input.sections as Record<string, unknown>)[section];
        if (value !== undefined) acc[section] = Boolean(value);
        return acc;
      }, {})
    : undefined;
  return {
    apiUrl,
    token: input.token?.trim() || undefined,
    houseMap: normaliseHouseMapInput(input.houseMap),
    sections: sections && Object.keys(sections).length ? sections : undefined,
    pollSeconds: Number.isFinite(poll) ? Math.min(Math.max(Math.round(poll), MIN_POLL_SECONDS), MAX_POLL_SECONDS) : undefined,
  };
}

function parseConfig(raw: string | null): SheetsConfig | null {
  if (!raw) return null;
  try {
    return normaliseConfig(JSON.parse(raw) as Partial<SheetsConfig>);
  } catch {
    return null;
  }
}

/** The deployed council endpoint, as a ready-to-use configuration. */
export function builtInConfig(): SheetsConfig | null {
  return normaliseConfig({ apiUrl: BUILT_IN_SHEETS_API_URL });
}

/** Build-time configuration: `VITE_COUNCIL_SHEETS_API` / `VITE_COUNCIL_SHEETS_TOKEN`. */
export function envConfig(): SheetsConfig | null {
  const apiUrl = envValue("VITE_COUNCIL_SHEETS_API");
  if (!apiUrl) return null;
  return normaliseConfig({
    apiUrl,
    token: envValue("VITE_COUNCIL_SHEETS_TOKEN") || undefined,
    pollSeconds: Number(envValue("VITE_COUNCIL_SHEETS_POLL")) || undefined,
  });
}

/** Configuration saved in this browser by an administrator. */
export function cachedConfig(): SheetsConfig | null {
  try {
    return parseConfig(localStorage.getItem(SHEETS_CONFIG_KEY));
  } catch {
    return null;
  }
}

/** True when an administrator explicitly disconnected the spreadsheet sections. */
export function sheetsExplicitlyDisabled(): boolean {
  try {
    return localStorage.getItem(SHEETS_DISABLED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Persists the administrator's choice. Passing `null` means "disconnect": the built-in
 * endpoint is switched off too, so the sections fall back to the hub's stored data until an
 * administrator saves a connection again.
 */
export function saveCachedConfig(config: SheetsConfig | null): void {
  try {
    if (config) {
      localStorage.setItem(SHEETS_CONFIG_KEY, JSON.stringify(config));
      localStorage.removeItem(SHEETS_DISABLED_KEY);
    } else {
      localStorage.removeItem(SHEETS_CONFIG_KEY);
      localStorage.setItem(SHEETS_DISABLED_KEY, "1");
    }
  } catch {
    /* Storage may be unavailable; the in-memory config still applies for this session. */
  }
}

/** Configuration saved in this browser, without falling back to the built-in endpoint. */
export function savedConfig(): SheetsConfig | null {
  return cachedConfig() ?? envConfig();
}

/**
 * The configuration the hub should run on right now:
 * administrator-saved browser config → build-time environment → built-in endpoint,
 * unless an administrator disconnected the integration.
 */
export function resolveConfig(): SheetsConfig | null {
  const saved = cachedConfig() ?? envConfig();
  if (saved) return saved;
  return sheetsExplicitlyDisabled() ? null : builtInConfig();
}

/** Which layer supplied the active configuration. */
export function resolveConfigSource(): SheetsConfigSource {
  if (cachedConfig()) return "browser";
  if (envConfig()) return "environment";
  if (!sheetsExplicitlyDisabled() && builtInConfig()) return "built-in";
  return "none";
}

export const CONFIG_SOURCE_LABELS: Record<SheetsConfigSource, string> = {
  firestore: "Shared Firestore configuration",
  browser: "Saved in this browser",
  environment: "Build environment variable",
  "built-in": "Built-in council endpoint",
  none: "Not connected",
};

export function pollMs(config: SheetsConfig | null): number {
  return Math.max(MIN_POLL_SECONDS, config?.pollSeconds ?? DEFAULT_POLL_SECONDS) * 1000;
}

export function sectionEnabled(config: SheetsConfig | null, section: SheetSection): boolean {
  if (!config) return false;
  return config.sections?.[section] !== false;
}

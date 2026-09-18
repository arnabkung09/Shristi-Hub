import { SHEET_SECTIONS } from "./types";
import type { HouseMap, SheetSection } from "./types";

/**
 * Where the Council Hub finds the read-only Google Sheets API.
 *
 * Precedence: an administrator-set configuration (Firestore `publicConfig/sheets`,
 * mirrored into localStorage) beats the build-time `VITE_COUNCIL_SHEETS_API` value.
 * Only the public Apps Script `/exec` URL lives on the client — never a Google API key,
 * service account, or OAuth secret.
 */

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

export const SHEETS_CONFIG_KEY = "shristi-sheets-config-v1";
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

export function saveCachedConfig(config: SheetsConfig | null): void {
  try {
    if (config) localStorage.setItem(SHEETS_CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(SHEETS_CONFIG_KEY);
  } catch {
    /* Storage may be unavailable; the in-memory config still applies for this session. */
  }
}

export function resolveConfig(): SheetsConfig | null {
  return cachedConfig() ?? envConfig();
}

export function pollMs(config: SheetsConfig | null): number {
  return Math.max(MIN_POLL_SECONDS, config?.pollSeconds ?? DEFAULT_POLL_SECONDS) * 1000;
}

export function sectionEnabled(config: SheetsConfig | null, section: SheetSection): boolean {
  if (!config) return false;
  return config.sections?.[section] !== false;
}

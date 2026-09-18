import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { readCloudSheetsConfig, writeCloudSheetsConfig } from "../firebase-client";
import { describeError, fetchSection } from "./client";
import { cachedConfig, envConfig, normaliseConfig, pollMs, saveCachedConfig, sectionEnabled, type SheetsConfig } from "./config";
import { deriveCalendar, deriveFinances, deriveHousePoints } from "./derive";
import { parseCalendarRow, parseHousePointRow, parseRows, parseTransactionRow } from "./parse";
import { SHEET_SECTIONS, SHEET_LABELS } from "./types";
import type { CalendarData, FetchStatus, FinanceData, HousePointsData, SheetSection } from "./types";

/**
 * Live Google Sheets data for the three spreadsheet-owned sections.
 *
 * The provider fetches on mount, refreshes on an interval, on tab focus, and on demand.
 * Each section is fetched independently, so one broken tab never blanks the others, and
 * the previous data stays visible with an error notice if a refresh fails.
 */

interface SectionRuntime {
  status: FetchStatus;
  updatedAt: number | null;
  error: string;
  warnings: string[];
  count: number;
}

export interface SectionStatus extends SectionRuntime {
  source: "sheets" | "local";
  label: string;
}

export interface SheetsContextValue {
  config: SheetsConfig | null;
  isConfigured: boolean;
  isEnabled: (section: SheetSection) => boolean;
  status: (section: SheetSection) => SectionStatus;
  lastUpdated: number | null;
  housePoints: HousePointsData | null;
  calendar: CalendarData | null;
  finances: FinanceData | null;
  refresh: (section: SheetSection) => void;
  refreshAll: () => void;
  saveConfig: (config: SheetsConfig | null) => Promise<void>;
}

const emptyRuntime: SectionRuntime = { status: "idle", updatedAt: null, error: "", warnings: [], count: 0 };

const makeRuntime = (): Record<SheetSection, SectionRuntime> =>
  SHEET_SECTIONS.reduce((acc, section) => ({ ...acc, [section]: { ...emptyRuntime } }), {} as Record<SheetSection, SectionRuntime>);

function mergeWarnings(...groups: Array<string[] | undefined>): string[] {
  return groups.flatMap((group) => group ?? []).filter(Boolean).slice(0, 4);
}

const DISABLED: SheetsContextValue = {
  config: null,
  isConfigured: false,
  isEnabled: () => false,
  status: (section) => ({ ...emptyRuntime, source: "local", label: SHEET_LABELS[section] }),
  lastUpdated: null,
  housePoints: null,
  calendar: null,
  finances: null,
  refresh: () => undefined,
  refreshAll: () => undefined,
  saveConfig: async () => undefined,
};

/**
 * Exported so tests (and any future embedder) can supply a fully loaded context and
 * render the hub's sections against spreadsheet data without a live endpoint.
 */
export const SheetsContext = createContext<SheetsContextValue>(DISABLED);

export function SheetsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SheetsConfig | null>(() => cachedConfig() ?? envConfig());
  const [runtime, setRuntime] = useState<Record<SheetSection, SectionRuntime>>(makeRuntime);
  const [housePoints, setHousePoints] = useState<HousePointsData | null>(null);
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [finances, setFinances] = useState<FinanceData | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const patch = useCallback((section: SheetSection, changes: Partial<SectionRuntime>) => {
    setRuntime((prev) => ({ ...prev, [section]: { ...prev[section], ...changes } }));
  }, []);

  const load = useCallback(async (section: SheetSection, options: { silent?: boolean } = {}) => {
    const current = configRef.current;
    if (!current || !sectionEnabled(current, section)) return;
    const silent = Boolean(options.silent);
    setRuntime((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        status: silent && prev[section].updatedAt ? prev[section].status : "loading",
        error: silent ? prev[section].error : "",
      },
    }));
    try {
      if (section === "housePoints") {
        const envelope = await fetchSection(section, current);
        const rows = parseRows(envelope.rows, parseHousePointRow);
        const derived = deriveHousePoints({ rows, houseMap: current.houseMap });
        setHousePoints(derived);
        patch(section, { status: "ready", updatedAt: Date.now(), error: "", warnings: mergeWarnings(envelope.warnings, derived.warnings), count: rows.length });
      } else if (section === "calendar") {
        const envelope = await fetchSection(section, current);
        const rows = parseRows(envelope.rows, parseCalendarRow);
        const derived = deriveCalendar({ rows, todayIso: new Date().toISOString().slice(0, 10) });
        setCalendar(derived);
        patch(section, { status: "ready", updatedAt: Date.now(), error: "", warnings: mergeWarnings(envelope.warnings, derived.warnings), count: rows.length });
      } else {
        const envelope = await fetchSection(section, current);
        const rows = parseRows(envelope.rows, parseTransactionRow);
        const derived = deriveFinances({ rows });
        setFinances(derived);
        patch(section, { status: "ready", updatedAt: Date.now(), error: "", warnings: mergeWarnings(envelope.warnings, derived.warnings), count: rows.length });
      }
    } catch (error) {
      patch(section, { status: "error", error: describeError(error) });
    }
  }, [patch]);

  const refresh = useCallback((section: SheetSection) => { void load(section); }, [load]);
  const refreshAll = useCallback(() => {
    const current = configRef.current;
    if (!current) return;
    SHEET_SECTIONS.forEach((section) => { if (sectionEnabled(current, section)) void load(section); });
  }, [load]);

  // Initial load whenever the endpoint changes.
  useEffect(() => {
    if (!config) {
      setHousePoints(null);
      setCalendar(null);
      setFinances(null);
      setRuntime(makeRuntime());
      return;
    }
    SHEET_SECTIONS.forEach((section) => { if (sectionEnabled(config, section)) void load(section); });
  }, [config, load]);

  // Periodic refresh, plus a refresh when the tab regains focus or the network returns.
  useEffect(() => {
    if (!config) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const current = configRef.current;
      if (!current) return;
      SHEET_SECTIONS.forEach((section) => { if (sectionEnabled(current, section)) void load(section, { silent: true }); });
    };
    const interval = setInterval(tick, pollMs(config));
    const onVisible = () => { if (typeof document === "undefined" || !document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    function onOnline() { tick(); }
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [config, load]);

  // Administrator-managed endpoint from Firestore (signed-in sessions only).
  useEffect(() => {
    let cancelled = false;
    void readCloudSheetsConfig()
      .then((remote) => {
        if (cancelled || !remote) return;
        const normalised = normaliseConfig(remote);
        if (!normalised) return;
        saveCachedConfig(normalised);
        setConfig(normalised);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const saveConfig = useCallback(async (next: SheetsConfig | null) => {
    const normalised = next ? normaliseConfig(next) : null;
    saveCachedConfig(normalised);
    setConfig(normalised);
    if (normalised) await writeCloudSheetsConfig(normalised);
  }, []);

  const value = useMemo<SheetsContextValue>(() => ({
    config,
    isConfigured: Boolean(config),
    isEnabled: (section) => Boolean(config && sectionEnabled(config, section)),
    status: (section) => ({ ...runtime[section], source: config && sectionEnabled(config, section) ? "sheets" : "local", label: SHEET_LABELS[section] }),
    lastUpdated: SHEET_SECTIONS.reduce<number | null>((latest, section) => {
      const value = runtime[section].updatedAt;
      if (!value) return latest;
      return latest === null ? value : Math.max(latest, value);
    }, null),
    housePoints,
    calendar,
    finances,
    refresh,
    refreshAll,
    saveConfig,
  }), [config, runtime, housePoints, calendar, finances, refresh, refreshAll, saveConfig]);

  return <SheetsContext.Provider value={value}>{children}</SheetsContext.Provider>;
}

export function useSheets(): SheetsContextValue {
  return useContext(SheetsContext);
}

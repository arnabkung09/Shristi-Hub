import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { observeFirebaseAuth, readCloudSheetsConfig, subscribeCloudSheetsConfig, writeCloudSheetsConfig } from "../firebase-client";
import { describeError, fetchSection } from "./client";
import {
  CONFIG_SOURCE_LABELS, normaliseConfig, pollMs, resolveConfig, resolveConfigSource,
  saveCachedConfig, sectionEnabled, sheetsExplicitlyDisabled,
} from "./config";
import type { SheetsConfig, SheetsConfigSource } from "./config";
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
  /** Where the active configuration came from (built-in endpoint, admin, env…). */
  source: SheetsConfigSource;
  sourceLabel: string;
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
  source: "none",
  sourceLabel: CONFIG_SOURCE_LABELS.none,
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
  // The built-in council endpoint is active out of the box; an administrator-saved
  // configuration (browser or Firestore) takes over as soon as it is available.
  const [config, setConfig] = useState<SheetsConfig | null>(() => resolveConfig());
  const [source, setSource] = useState<SheetsConfigSource>(() => resolveConfigSource());
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

  // Administrator-managed endpoint from Firestore. It is read before, during, and after
  // sign-in (the document is public, read-only configuration) and kept live, so a URL
  // saved once by an administrator reaches every visitor — signed in or not.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const applyRemote = (remote: Partial<SheetsConfig> | null | undefined) => {
      if (cancelled || !remote) return;
      // An administrator who disconnected on this device stays disconnected until they
      // save a connection again — a shared document must not switch the sections back on
      // behind their back.
      if (sheetsExplicitlyDisabled()) return;
      const normalised = normaliseConfig(remote);
      if (!normalised) return;
      saveCachedConfig(normalised);
      setConfig(normalised);
      setSource("firestore");
    };

    const loadOnce = () => {
      void readCloudSheetsConfig()
        .then((remote) => applyRemote(remote))
        .catch(() => undefined);
    };

    const startSubscription = () => {
      unsubscribe?.();
      unsubscribe = subscribeCloudSheetsConfig((remote) => applyRemote(remote));
    };

    startSubscription();
    loadOnce();

    // A freshly signed-in session may be the first one allowed to read the document, so
    // re-read and re-subscribe whenever the authentication state changes.
    const stopAuth = observeFirebaseAuth(() => {
      if (cancelled) return;
      startSubscription();
      loadOnce();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      stopAuth();
    };
  }, []);

  const saveConfig = useCallback(async (next: SheetsConfig | null) => {
    const normalised = next ? normaliseConfig(next) : null;
    // Apply locally first so the sections react immediately…
    saveCachedConfig(normalised);
    setConfig(normalised);
    setSource(normalised ? "browser" : "none");
    // …then publish, so the whole school sees the same endpoint on every device. A
    // failure here (signed out, rules, offline) is surfaced to the administrator instead
    // of being swallowed.
    await writeCloudSheetsConfig(normalised);
  }, []);

  const value = useMemo<SheetsContextValue>(() => ({
    config,
    source,
    sourceLabel: CONFIG_SOURCE_LABELS[source],
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
  }), [config, source, runtime, housePoints, calendar, finances, refresh, refreshAll, saveConfig]);

  return <SheetsContext.Provider value={value}>{children}</SheetsContext.Provider>;
}

export function useSheets(): SheetsContextValue {
  return useContext(SheetsContext);
}

import { useEffect, useState } from "react";
import {
  AlertTriangle, CircleCheck, ExternalLink, LoaderCircle, Plug, RefreshCw, Save,
  Sheet, Table2, Trash2, Unplug,
} from "lucide-react";
import { useHub } from "../../store/hub";
import { useSheets } from "../../lib/sheets/context";
import { pingSheetApi } from "../../lib/sheets/client";
import { DEFAULT_HOUSE_MAP, effectiveHouseMap } from "../../lib/sheets/derive";
import {
  BUILT_IN_SHEETS_API_URL, DEFAULT_POLL_SECONDS, MAX_POLL_SECONDS, MIN_POLL_SECONDS,
  isValidApiUrl, normaliseConfig,
} from "../../lib/sheets/config";
import { SHEET_SECTIONS } from "../../lib/sheets/types";
import type { House, HouseMap, SheetSection } from "../../lib/sheets/types";
import { Badge, Modal } from "../ui";

const HOUSE_CHOICES: House[] = ["Blue", "Red", "Green"];

interface MappingRow {
  name: string;
  house: House;
}

const defaultMappingRows = (): MappingRow[] => [
  { name: "Dhaulagiri", house: "Blue" },
  { name: "Annapurna", house: "Red" },
  { name: "Manaslu", house: "Green" },
];

function mappingRows(map: HouseMap | undefined): MappingRow[] {
  if (!map) return defaultMappingRows();
  const rows = Object.entries(effectiveHouseMap(map))
    .filter(([name]) => !/^(blue|red|green)$/i.test(name.trim()))
    .map(([name, house]) => ({ name, house }));
  return rows.length ? rows : defaultMappingRows();
}

const toHouseMap = (rows: MappingRow[]): HouseMap => {
  const map: HouseMap = {};
  rows.forEach((row) => { if (row.name.trim()) map[row.name.trim()] = row.house; });
  return map;
};

const ago = (timestamp: number | null) => {
  if (!timestamp) return "never";
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/**
 * Admin Panel → Google Sheets. Connects the three spreadsheet-owned sections and shows
 * their sync state. No Google credentials live here: the only value stored is the public
 * read-only Apps Script `/exec` URL.
 */
export default function SheetsConnection() {
  const { announce, setActiveTab } = useHub();
  const sheets = useSheets();
  const [apiUrl, setApiUrl] = useState(sheets.config?.apiUrl ?? "");
  const [token, setToken] = useState(sheets.config?.token ?? "");
  const [pollSeconds, setPollSeconds] = useState(String(sheets.config?.pollSeconds ?? DEFAULT_POLL_SECONDS));
  const [sections, setSections] = useState<Record<SheetSection, boolean>>(() =>
    SHEET_SECTIONS.reduce((acc, section) => ({ ...acc, [section]: sheets.config?.sections?.[section] !== false }), {} as Record<SheetSection, boolean>));
  const [mapping, setMapping] = useState<MappingRow[]>(() => mappingRows(sheets.config?.houseMap));
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!sheets.config) return;
    setApiUrl(sheets.config.apiUrl);
    setToken(sheets.config.token ?? "");
    setPollSeconds(String(sheets.config.pollSeconds ?? DEFAULT_POLL_SECONDS));
    setSections(SHEET_SECTIONS.reduce((acc, section) => ({ ...acc, [section]: sheets.config?.sections?.[section] !== false }), {} as Record<SheetSection, boolean>));
    setMapping(mappingRows(sheets.config.houseMap));
  }, [sheets.config]);

  const draft = () => normaliseConfig({
    apiUrl,
    token,
    pollSeconds: Number(pollSeconds),
    sections,
    houseMap: toHouseMap(mapping),
  });

  const test = async () => {
    setError("");
    setStatus(null);
    const config = draft();
    if (!config) { setError("Enter the Apps Script Web app URL that ends with /exec."); return; }
    setTesting(true);
    try {
      const result = await pingSheetApi(config);
      setStatus(result);
      if (!result.ok) setError(result.message);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setError("");
    const config = draft();
    if (!config) { setError("Enter the Apps Script Web app URL that ends with /exec."); return; }
    setSaving(true);
    try {
      // Applies in this browser first, then publishes to Firestore for every device.
      await sheets.saveConfig(config);
      announce("Google Sheets connection saved and published. Every device now reads the spreadsheet.");
    } catch (e) {
      // The local connection is already live; only the shared copy failed.
      setError(`${e instanceof Error ? e.message : "Unable to publish the connection."} The sections in this browser are already reading from it.`);
      announce("Google Sheets connection saved in this browser. Sign in with Google to share it with every device.", "error");
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    try {
      await sheets.saveConfig(null);
      announce("Google Sheets disconnected. The three sections show the hub's own stored data again.", "error");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to publish the disconnect.");
      announce("Google Sheets disconnected in this browser only — sign in with Google to apply it everywhere.", "error");
    }
    setConfirmClear(false);
    setStatus(null);
  };

  const configured = sheets.isConfigured;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]">
      <section className="panel panel-pad">
        <div className="panel-heading">
          <div>
            <h2><Sheet className="!text-emerald-500" />House Points Google Sheets Source</h2>
            <p>House Points synchronizes directly with the competition spreadsheet. Calendar and Monetary Fund remain locally managed in the hub.</p>
          </div>
          {configured && <Badge tone="emerald"><CircleCheck className="h-3 w-3" />Connected</Badge>}
        </div>

        <div className="form-stack">
          <label className="form-field">
            <span>Apps Script Web app URL</span>
            <input
              className="control"
              placeholder="https://script.google.com/macros/s/AKfy.../exec"
              value={apiUrl}
              onChange={(event) => setApiUrl(event.target.value)}
              spellCheck={false}
            />
          </label>
          <div className="integration-row">
            <span>Endpoint source</span>
            <strong className="text-right text-[11px]">{sheets.sourceLabel}</strong>
          </div>
          <p className="small-note">
            The council's own read-only endpoint is built in and active out of the box, synchronizing the House Points
            competition spreadsheet directly. Calendar and Monetary Fund are managed directly within the hub. Paste another <code>/exec</code> URL or Google Sheet URL to point the hub at a
            different spreadsheet, or{" "}
            <button
              type="button"
              className="text-action inline !p-0 align-baseline"
              onClick={() => setApiUrl(BUILT_IN_SHEETS_API_URL)}
            >
              restore the built-in endpoint
            </button>
            . Deploying your own copy: <code>apps-script/Code.gs</code> as a Web app (Execute as: <strong>Me</strong>,
            Who has access: <strong>Anyone</strong>) — full steps in <code>GOOGLE-SHEETS-SETUP.md</code>.
          </p>

          <div className="form-grid">
            <label className="form-field">
              <span>Shared read token (optional)</span>
              <input className="control" placeholder="Leave blank if unused" value={token} onChange={(event) => setToken(event.target.value)} spellCheck={false} />
            </label>
            <label className="form-field">
              <span>Auto-refresh every (seconds)</span>
              <input
                className="control"
                type="number"
                min={MIN_POLL_SECONDS}
                max={MAX_POLL_SECONDS}
                value={pollSeconds}
                onChange={(event) => setPollSeconds(event.target.value)}
              />
            </label>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3.5 text-xs">
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">Synchronized Spreadsheet Section</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              <strong>House Points</strong> is the single section synchronized from the competition spreadsheet.
              Calendar and Finances are managed directly within the Council Hub without sheet dependencies.
            </p>
            <div className="mt-2.5 flex items-center gap-2 font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Only House Points is synced · Scoring: 6/4/2 (team) · 3/2/1 (individual)</span>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2">House names used in the sheet</p>
            <p className="small-note mb-3">The spreadsheet uses the school's house names; the hub shows Blue, Red, and Green. Adjust the mapping if the sheet uses different names.</p>
            <div className="form-stack">
              {mapping.map((row, index) => (
                <div key={`${row.name}-${index}`} className="flex flex-wrap items-center gap-2">
                  <input
                    className="control !w-auto min-w-[160px] flex-1"
                    aria-label={`Sheet house name ${index + 1}`}
                    value={row.name}
                    placeholder="e.g. Dhaulagiri"
                    onChange={(event) => setMapping(mapping.map((entry, i) => (i === index ? { ...entry, name: event.target.value } : entry)))}
                  />
                  <select
                    className="control !w-[150px]"
                    aria-label={`Hub house for ${row.name || `row ${index + 1}`}`}
                    value={row.house}
                    onChange={(event) => setMapping(mapping.map((entry, i) => (i === index ? { ...entry, house: event.target.value as House } : entry)))}
                  >
                    {HOUSE_CHOICES.map((house) => <option key={house} value={house}>{house} House</option>)}
                  </select>
                  <button className="icon-action red" aria-label={`Remove mapping for ${row.name || "row"}`} onClick={() => setMapping(mapping.filter((_, i) => i !== index))}><Trash2 /></button>
                </div>
              ))}
            </div>
            <button className="text-action mt-3" onClick={() => setMapping([...mapping, { name: "", house: "Blue" }])}>+ Add another house name</button>
            <button className="text-action mt-3 ml-4" onClick={() => setMapping(defaultMappingRows())}>Reset to defaults</button>
          </div>

          {error && <p role="alert" className="inline-message error">{error}</p>}
          {status?.ok && <p className="inline-message"><CircleCheck className="mr-1 inline h-3.5 w-3.5 text-[var(--green)]" />{status.message}</p>}

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={() => void test()} disabled={testing || !apiUrl.trim()}>
              {testing ? <LoaderCircle className="animate-spin" /> : <Plug />}{testing ? "Testing…" : "Test connection"}
            </button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={saving || !isValidApiUrl(apiUrl)}>
              {saving ? <LoaderCircle className="animate-spin" /> : <Save />}{saving ? "Saving…" : "Save connection"}
            </button>
            {configured && <button className="btn btn-secondary" onClick={() => sheets.refreshAll()}><RefreshCw />Refresh all sections</button>}
            {configured && <button className="btn btn-danger" onClick={() => setConfirmClear(true)}><Unplug />Disconnect</button>}
          </div>
        </div>
      </section>

      <div className="space-y-5">
        <section className="panel panel-pad">
          <div className="panel-heading"><div><h2><Table2 />Sync status</h2><p>House Points synchronizes live with the Google Sheet.</p></div></div>
          <div className="form-stack">
            {(() => {
              const state = sheets.status("housePoints");
              return (
                <div className="rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-xs">House Points Sheet</strong>
                    {state.source === "sheets" ? (
                      state.status === "error"
                        ? <Badge tone="amber"><AlertTriangle className="h-3 w-3" />Refresh failed</Badge>
                        : state.status === "idle" || state.status === "loading"
                          ? <Badge tone="slate"><LoaderCircle className="h-3 w-3 animate-spin" />Loading</Badge>
                          : <Badge tone="emerald">{state.count} rows</Badge>
                    ) : <Badge tone="slate">Hub data</Badge>}
                  </div>
                  <p className="small-note mt-2">
                    {state.source === "sheets"
                      ? `Updated ${ago(state.updatedAt)}${state.error ? ` · ${state.error}` : ""}`
                      : "Not read from a spreadsheet — the hub keeps its own stored records."}
                  </p>
                  {state.warnings.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {state.warnings.map((warning) => <li key={warning} className="text-[10px] text-slate-400">• {warning}</li>)}
                    </ul>
                  )}
                  {state.source === "sheets" && (
                    <button className="text-action mt-2" onClick={() => sheets.refresh("housePoints")}><RefreshCw />Refresh House Points</button>
                  )}
                </div>
              );
            })()}
            <div className="integration-row"><span>Last successful sync</span><strong className="text-right text-[11px]">{ago(sheets.lastUpdated)}</strong></div>
          </div>
        </section>

        <section className="panel panel-pad">
          <div className="panel-heading"><div><h2><Sheet />What the spreadsheet controls</h2><p>Only House Points is synchronized from the spreadsheet.</p></div></div>
          <div className="form-stack">
            <div className="integration-row"><span>House Points</span><strong className="text-right text-[11px]">Standings, audit ledger, house totals</strong></div>
            <div className="integration-row"><span>Scoring Rules</span><strong className="text-right text-[11px]">Team: 6/4/2 pts · Individual: 3/2/1 pts</strong></div>
            <div className="integration-row"><span>Spreadsheet ID</span><strong className="text-right font-mono text-[10px]">1TTId_uuN1FFlFqs94LBaGSPqd9GFLQCUXI1BGxrtF9U</strong></div>
            <p className="inline-message">
              Calendar events and Monetary Fund transactions are managed directly and securely within the hub.
            </p>
            <div className="integration-row"><span>Name mapping</span><strong className="text-right text-[11px]">{Object.keys(DEFAULT_HOUSE_MAP).filter((key) => !/^(blue|red|green)$/.test(key)).join(", ")} → Blue/Red/Green</strong></div>
            <a className="text-action" href="https://docs.google.com/spreadsheets/d/1TTId_uuN1FFlFqs94LBaGSPqd9GFLQCUXI1BGxrtF9U/edit" target="_blank" rel="noreferrer noopener">
              <ExternalLink />Open Google Sheet
            </a>
            <button className="btn btn-secondary" onClick={() => setActiveTab("admin?section=hub")}>Council Hub access settings</button>
          </div>
        </section>
      </div>

      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Disconnect Google Sheets" icon={<Unplug />}>
        <p className="inline-message">
          House Points will go back to the hub's own stored data on this device, and the
          shared Firestore override is removed. Nothing is ever deleted from the spreadsheet. The built-in council
          endpoint stays available: save a connection (or press “restore the built-in endpoint” and save) to switch
          House Points back to the sheet.
        </p>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={() => setConfirmClear(false)}>Cancel</button>
          <button className="btn btn-danger" onClick={() => void disconnect()}><Unplug />Disconnect</button>
        </div>
      </Modal>
    </div>
  );
}

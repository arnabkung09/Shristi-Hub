import { useMemo, useState } from "react";
import { ArrowUpRight, Crown, ExternalLink, LayoutGrid, Minus, Plus, Search, ShieldCheck, Table, Trophy, Users } from "lucide-react";
import { useHub, uid } from "../store/hub";
import { houseFullName, houseLogo, houseShortName } from "../lib/admin";
import { Badge, Btn, Card, Field, HouseMark, Modal, SectionTitle, Select, inputCls } from "./ui";
import SheetSyncBar from "./SheetSyncBar";
import { Reveal } from "./Effects";
import { deriveHousePoints, positionLabel } from "../lib/sheets/derive";
import { FALLBACK_HOUSE_POINT_ROWS } from "../lib/sheets/client";
import { parseHousePointRow, parseRows } from "../lib/sheets/parse";
import { POINT_CATEGORIES, HOUSES } from "../lib/seed";
import { cn } from "../utils/cn";
import type { House } from "../lib/types";

const HOUSE_GRADIENT: Record<House, string> = {
  Blue: "from-blue-600/20 via-blue-500/[0.06] to-transparent",
  Red: "from-red-600/20 via-red-500/[0.06] to-transparent",
  Green: "from-green-600/20 via-green-500/[0.06] to-transparent",
};
const HOUSE_ACCENT: Record<House, string> = { Blue: "text-blue-500 dark:text-blue-300", Red: "text-red-500 dark:text-red-300", Green: "text-green-600 dark:text-green-300" };
const HOUSE_BAR: Record<House, string> = { Blue: "bg-blue-500", Red: "bg-red-500", Green: "bg-green-500" };

export default function HousePoints({ openAwardOnMount = false }: { openAwardOnMount?: boolean }) {
  const { state, user, hasPermission, houseTotals, dispatch, sheets } = useHub();
  // House Points live in the council spreadsheet once it is connected: the hub reads the
  // ledger from there and awarding happens by adding a row in Google Sheets.
  const sheetPoints = sheets.isEnabled("housePoints") ? sheets.housePoints : null;
  const canManage = hasPermission("houses") && !sheets.isEnabled("housePoints");
  const [awardOpen, setAwardOpen] = useState(openAwardOnMount && canManage);
  const [house, setHouse] = useState<House>("Blue");
  const [amount, setAmount] = useState("50");
  const [units, setUnits] = useState("1");
  const [mode, setMode] = useState<"award" | "deduct">("award");
  const [category, setCategory] = useState<string>(POINT_CATEGORIES[0]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [fHouse, setFHouse] = useState("All");
  const [fType, setFType] = useState("All");
  const [fSearch, setFSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const sheetResults = sheetPoints?.results ?? null;

  const standings = useMemo(
    () => (Object.entries(houseTotals) as Array<[House, number]>).sort((a, b) => b[1] - a[1]),
    [houseTotals]
  );
  const totalPoints = standings.reduce((s, [, v]) => s + Math.max(0, v), 0) || 1;

  // The spreadsheet is the single source of truth for House Points.
  const fallbackResults = useMemo(
    () => deriveHousePoints({ rows: parseRows(FALLBACK_HOUSE_POINT_ROWS, parseHousePointRow) }).results,
    []
  );
  const activeResults = sheetResults && sheetResults.length ? sheetResults : fallbackResults;

  // House Points rows are shown newest first, filtered by house, type and search.
  const filteredResults = useMemo(
    () => activeResults
      .filter((row) => (fHouse === "All" ? true : row.house === fHouse))
      .filter((row) => (fType === "All" ? true : row.type === fType))
      .filter((row) => {
        if (!fSearch.trim()) return true;
        const q = fSearch.toLowerCase();
        return (row.specific || "").toLowerCase().includes(q) ||
          (row.competition || "").toLowerCase().includes(q) ||
          houseFullName(state.houses, row.house).toLowerCase().includes(q);
      }),
    [activeResults, fHouse, fType, fSearch, state.houses]
  );

  const parsedAmount = parseInt(amount, 10);
  const parsedUnits = parseInt(units, 10);
  const previewTotal = Number.isFinite(parsedAmount) && parsedAmount > 0 && Number.isFinite(parsedUnits) && parsedUnits > 0
    ? parsedAmount * parsedUnits
    : 0;

  const submit = () => {
    const n = parseInt(amount, 10);
    const u = parseInt(units, 10);
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a positive number of points.");
    if (!Number.isFinite(u) || u < 1 || u > 50) return setError("Enter how many teams / individuals earned it (1 to 50).");
    if (!reason.trim()) return setError("A reason / justification is required.");
    if (!user) return;
    const total = n * u;
    const delta = mode === "award" ? total : -total;
    const label = houseFullName(state.houses, house);
    dispatch({
      type: "AWARD_POINTS",
      entry: {
        id: uid(), house, delta, category: category as (typeof POINT_CATEGORIES)[number],
        reason: reason.trim(), officerName: user.name, timestamp: Date.now(),
        units: u, pointsEach: n,
      },
      notification: {
        id: uid(),
        title: `${label} ${delta > 0 ? "+" : ""}${delta} pts`,
        body: u > 1 ? `${category} — ${n} pts × ${u} teams/individuals = ${total}. ${reason.trim()}` : `${category} — ${reason.trim()}`,
        timestamp: Date.now(), urgent: Math.abs(delta) >= 100,
        senderName: user.name, senderRole: user.role,
        audience: { kind: "all" }, actionTab: "houses", readBy: [], kind: "system",
      },
    });
    setAwardOpen(false); setReason(""); setAmount("50"); setUnits("1"); setError(null);
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="House Championship"
        subtitle="Live standings synchronized directly from the official House Points Google Spreadsheet"
        action={canManage && (
          <Btn onClick={() => setAwardOpen(true)}>
            <Trophy className="h-4 w-4" /> Award / Deduct Points
          </Btn>
        )}
      />

      <SheetSyncBar section="housePoints" />

      {/* Podium */}
      <Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          {standings.map(([h, pts], i) => {
            const share = Math.round((Math.max(0, pts) / totalPoints) * 100);
            const margin = i === 0 ? pts - (standings[1]?.[1] ?? 0) : undefined;
            return (
              <Card key={h} className={cn("hover-lift relative overflow-hidden p-5 sm:p-6", i === 0 && "ring-1 ring-amber-400/40")}>
                <div className={cn("absolute inset-0 bg-gradient-to-br", HOUSE_GRADIENT[h])} />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <HouseMark house={h} className="h-11 w-11 text-sm" />
                    {i === 0 ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">
                        <Crown className="h-3 w-3" /> Frontrunner
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rank {i + 1}</span>
                    )}
                  </div>
                  <p className={cn("mt-4 font-display text-sm font-bold uppercase tracking-wider", HOUSE_ACCENT[h])}>{houseFullName(state.houses, h)}</p>
                  <p className="mt-1 font-display text-4xl font-extrabold tabular-nums text-slate-900 dark:text-white sm:text-5xl">
                    {pts.toLocaleString()}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/[0.08]">
                    <div className={cn("h-full animate-bar-grow rounded-full", HOUSE_BAR[h])} style={{ width: `${Math.max(share, 4)}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {share}% of all school points{margin !== undefined && margin > 0 && <> · leads by <span className="font-bold text-slate-600 dark:text-slate-300">{margin.toLocaleString()}</span></>}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </Reveal>

      {/* Ledger */}
      <Reveal delay={120}>
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">Competition & Points Ledger</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    <Table className="h-3 w-3" /> Spreadsheet Format
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {sheetResults
                    ? "Official scoring format: Competition, Type, House, Position, Teams Won, Points"
                    : "Every competition and transaction recorded in the house points log"}
                </p>
              </div>

              {/* View switcher and filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-xl border border-black/[0.08] bg-black/[0.03] p-1 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                      viewMode === "table"
                        ? "bg-white text-slate-900 shadow-sm dark:bg-ink-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <Table className="h-3.5 w-3.5" /> Table
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                      viewMode === "cards"
                        ? "bg-white text-slate-900 shadow-sm dark:bg-ink-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" /> Feed
                  </button>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search competition..."
                    value={fSearch}
                    onChange={(e) => setFSearch(e.target.value)}
                    className="h-8 rounded-xl border border-black/[0.08] bg-transparent pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-accent focus:outline-none dark:border-white/[0.08] dark:text-slate-200"
                  />
                </div>

                <Select value={fHouse} onChange={setFHouse} className="!w-auto !py-1.5 text-xs">
                  <option value="All">All Houses</option>
                  {HOUSES.map((h) => <option key={h} value={h}>{houseFullName(state.houses, h)}</option>)}
                </Select>
                <Select value={fType} onChange={setFType} className="!w-auto !py-1.5 text-xs">
                  <option value="All">All Types</option>
                  <option value="Individual">Individual</option>
                  <option value="Team">Team</option>
                </Select>
              </div>
            </div>

            {/* Google Sheets Link strip */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3.5 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-slate-700 dark:text-slate-300">
                  Google Sheet: <code className="rounded bg-black/[0.05] px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-600 dark:bg-white/[0.05] dark:text-emerald-400">1TTId_uuN1FFlFqs94LBaGSPqd9GFLQCUXI1BGxrtF9U</code>
                </span>
              </div>
              <a
                href="https://docs.google.com/spreadsheets/d/1TTId_uuN1FFlFqs94LBaGSPqd9GFLQCUXI1BGxrtF9U/edit"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Open Google Spreadsheet <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Scoring formula strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] px-3.5 py-2 text-xs">
              <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                Official Scoring Formula:
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                <span><strong>Team:</strong> 1st = 6 pts · 2nd = 4 pts · 3rd = 2 pts</span>
                <span className="hidden text-slate-400 sm:inline">|</span>
                <span><strong>Individual:</strong> 1st = 3 pts · 2nd = 2 pts · 3rd = 1 pt</span>
              </div>
            </div>
          </div>

          {viewMode === "table" ? (
            <div className="overflow-x-auto rounded-xl border border-black/[0.08] dark:border-white/[0.08]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-black/[0.08] bg-black/[0.02] font-bold uppercase tracking-wider text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 sm:px-5">Competition</th>
                    <th scope="col" className="px-4 py-3 sm:px-5">Type</th>
                    <th scope="col" className="px-4 py-3 sm:px-5">House</th>
                    <th scope="col" className="px-4 py-3 text-center sm:px-5">Position</th>
                    <th scope="col" className="px-4 py-3 text-center sm:px-5">Teams Won</th>
                    <th scope="col" className="px-4 py-3 text-right sm:px-5">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                        {activeResults.length === 0 ? "No results yet — add a row to the House Points sheet." : "No entries match these filters."}
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                        <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white sm:px-5">
                          <span className="block font-medium text-slate-900 dark:text-slate-100">{row.competition || row.specific}</span>
                          <span className="text-[10px] text-slate-400">Row {row.row} · Google Sheets{row.fromTable && " · standard scoring table"}</span>
                        </td>
                        <td className="px-4 py-3.5 sm:px-5">
                          <Badge tone={row.type === "Team" ? "indigo" : "emerald"}>{row.type ?? "Individual"}</Badge>
                        </td>
                        <td className="px-4 py-3.5 sm:px-5">
                          <div className="flex items-center gap-2">
                            <HouseMark house={row.house} className="h-5 w-5 text-xs" />
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {houseFullName(state.houses, row.house)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center sm:px-5">
                          <Badge tone="amber">{row.position ? `${positionLabel(row.position)} place` : "1st place"}</Badge>
                        </td>
                        <td className="px-4 py-3.5 text-center sm:px-5">
                          <Badge tone="indigo"><Users className="h-3 w-3" />{row.teamsWon ? `${row.teamsWon} ${row.teamsWon === 1 ? "team won" : "teams won"}` : "1 team won"}</Badge>
                        </td>
                        <td className="px-4 py-3.5 text-right font-display text-sm font-extrabold tabular-nums text-emerald-600 dark:text-emerald-300 sm:px-5">
                          +{row.points}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {filteredResults.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  {activeResults.length === 0 ? "No results yet — add a row to the House Points sheet." : "No entries match these filters."}
                </p>
              ) : (
                filteredResults.map((row) => (
                  <div key={row.id} className="flex items-start gap-3.5 py-3.5">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-display text-sm font-extrabold tabular-nums text-emerald-600 dark:text-emerald-300">+{row.points}</span>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{houseFullName(state.houses, row.house)}</span>
                        {row.type && <Badge tone="emerald">{row.type}</Badge>}
                        {row.position && <Badge tone="amber">{positionLabel(row.position)} place</Badge>}
                        {row.teamsWon && (
                          <Badge tone="indigo"><Users className="h-3 w-3" />{row.teamsWon} {row.teamsWon === 1 ? "team won" : "teams won"}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{row.specific}</p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        Row {row.row} · Google Sheets{row.fromTable && " · standard scoring table"}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </Card>
      </Reveal>

      {/* Award modal */}
      <Modal open={awardOpen && canManage} onClose={() => { setAwardOpen(false); setError(null); }} title="Award / Deduct House Points">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["award", "deduct"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-bold transition-all",
                  mode === m
                    ? m === "award" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300"
                    : "border-black/10 text-slate-500 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.05]"
                )}
              >
                {m === "award" ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                {m === "award" ? "Award Points" : "Deduct Points"}
              </button>
            ))}
          </div>

          <Field label="House">
            <div className="grid grid-cols-3 gap-2">
              {HOUSES.map((h) => {
                const logo = houseLogo(state.houses, h);
                return (
                  <button
                    key={h}
                    onClick={() => setHouse(h)}
                    className={cn(
                      "flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-bold transition-all",
                      house === h
                        ? h === "Blue" ? "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-300"
                          : h === "Red" ? "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300"
                          : "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-300"
                        : "border-black/10 text-slate-500 dark:border-white/10"
                    )}
                  >
                    {logo && <img src={logo} alt="" className="h-5 w-5 rounded-full object-cover" />}
                    {houseShortName(state.houses, h)}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Points each" hint="Points per team / individual.">
              <input type="number" min={1} className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Teams / individuals" hint="How many achieved this?">
              <div className="relative">
                <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="number" min={1} max={50} className={`${inputCls} pl-10`} value={units} onChange={(e) => setUnits(e.target.value)} />
              </div>
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-indigo-500/25 bg-indigo-500/[0.07] px-4 py-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">
              {parsedAmount || 0} pts × {parsedUnits || 0} {parsedUnits === 1 ? "team" : "teams"}
            </span>
            <span className="font-display text-xl font-extrabold tabular-nums text-indigo-500 dark:text-indigo-300">
              {mode === "award" ? "+" : "−"}{previewTotal.toLocaleString()} pts
            </span>
          </div>

          <Field label="Category">
            <Select value={category} onChange={setCategory}>
              {POINT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>

          <Field label="Reason / justification" hint="Required — appears in the public audit ledger.">
            <textarea
              rows={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., 1st Place in Inter-House Quiz"
            />
          </Field>

          {error && <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}

          <div className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] px-3.5 py-2.5 text-xs text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-accent" /> Broadcasts to all devices instantly</span>
            <Btn onClick={submit} variant={mode === "award" ? "success" : "danger"} className="min-h-[38px]">
              {mode === "award" ? "Award" : "Deduct"} {previewTotal.toLocaleString()} pts
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

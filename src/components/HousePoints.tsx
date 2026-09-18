import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Crown, Filter, Minus, Plus, ShieldCheck, Trophy, Users } from "lucide-react";
import { useHub, relativeTime, uid } from "../store/hub";
import { houseFullName, houseLogo, houseShortName } from "../lib/admin";
import { Badge, Btn, Card, Field, HouseMark, Modal, SectionTitle, Select, inputCls } from "./ui";
import SheetSyncBar from "./SheetSyncBar";
import { Reveal } from "./Effects";
import { positionLabel } from "../lib/sheets/derive";
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
  const { state, user, hasPermission, houseTotals, dispatch, pointsLedger, sheets } = useHub();
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
  const [fCategory, setFCategory] = useState("All");
  const [fType, setFType] = useState("All");
  const sheetResults = sheetPoints?.results ?? null;

  const standings = useMemo(
    () => (Object.entries(houseTotals) as Array<[House, number]>).sort((a, b) => b[1] - a[1]),
    [houseTotals]
  );
  const totalPoints = standings.reduce((s, [, v]) => s + Math.max(0, v), 0) || 1;

  const ledger = useMemo(() => {
    return pointsLedger
      .filter((e) => (fHouse === "All" ? true : e.house === fHouse))
      .filter((e) => (fCategory === "All" ? true : e.category === fCategory))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [pointsLedger, fHouse, fCategory]);

  // House Points rows are shown newest first, filtered by house and by Individual / Team.
  const sheetLedger = useMemo(
    () => (sheetResults ?? [])
      .filter((row) => (fHouse === "All" ? true : row.house === fHouse))
      .filter((row) => (fType === "All" ? true : row.type === fType)),
    [sheetResults, fHouse, fType]
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
        subtitle="Live standings across Sports, Academics, Cultural, Discipline and Service"
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
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">Points Audit Ledger</h3>
              <p className="text-xs text-slate-400">
                {sheetResults ? "Every result in the House Points spreadsheet — newest first" : "Every transaction, timestamped and attributed"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <Select value={fHouse} onChange={setFHouse} className="!w-auto !py-2 text-xs">
                <option value="All">All</option>
                {HOUSES.map((h) => <option key={h} value={h}>{houseFullName(state.houses, h)}</option>)}
              </Select>
              {sheetResults ? (
                <Select value={fType} onChange={setFType} className="!w-auto !py-2 text-xs">
                  <option>All</option>
                  <option>Individual</option>
                  <option>Team</option>
                </Select>
              ) : (
                <Select value={fCategory} onChange={setFCategory} className="!w-auto !py-2 text-xs">
                  <option>All</option>
                  {POINT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </Select>
              )}
            </div>
          </div>

          <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {sheetResults ? (
              <>
                {sheetLedger.length === 0 && (
                  <p className="py-10 text-center text-sm text-slate-400">
                    {sheetResults.length === 0 ? "No results yet — add a row to the House Points sheet." : "No entries match these filters."}
                  </p>
                )}
                {sheetLedger.map((row) => (
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
                          <Badge tone="indigo"><Users className="h-3 w-3" />{row.teamsWon} {row.teamsWon === 1 ? "team" : "teams"} won</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{row.specific}</p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        Row {row.row} · Google Sheets{row.fromTable && " · standard scoring table"}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            ) : (
            <>
            {ledger.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No entries match these filters.</p>}
            {ledger.map((e) => (
              <div key={e.id} className="flex items-start gap-3.5 py-3.5">
                <span className={cn(
                  "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display text-xs font-extrabold",
                  e.delta > 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-red-500/10 text-red-600 dark:text-red-300"
                )}>
                  {e.delta > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("font-display text-sm font-extrabold tabular-nums", e.delta > 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300")}>
                      {e.delta > 0 ? "+" : ""}{e.delta}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{houseFullName(state.houses, e.house)}</span>
                    <Badge tone="slate">{e.category}</Badge>
                    {e.position && <Badge tone="amber">{e.position} place</Badge>}
                    {e.awardCategory && <Badge tone="emerald">{e.awardCategory}</Badge>}
                    {e.units && e.units > 1 && (
                      <Badge tone="indigo"><Users className="h-3 w-3" />{e.pointsEach} × {e.units}</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{e.reason}</p>
                  {e.studentName && (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {e.studentName}{e.grade ? ` · ${e.grade}` : ""}{e.classLabel ? ` · ${e.classLabel}` : ""}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    {relativeTime(e.timestamp)} · by {e.officerName}
                    {e.sheetId && <span className="ml-1.5 normal-case tracking-normal text-slate-400">· {e.sheetId}</span>}
                  </p>
                </div>
              </div>
            ))}
            </>
            )}
          </div>
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

import { useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, IndianRupee, Plus, ReceiptText, Scale, TrendingUp,
} from "lucide-react";
import { uid, useHub } from "../store/hub";
import { Badge, Btn, Card, Field, Modal, SectionTitle, Select, StatCard, inputCls } from "./ui";
import SheetSyncBar from "./SheetSyncBar";
import { cn } from "../utils/cn";
import type { FinanceStatus, FinanceType } from "../lib/types";

const STATUS_TONE: Record<FinanceStatus, "emerald" | "amber" | "blue"> = {
  Approved: "emerald", Pending: "amber", Reimbursed: "blue", Recorded: "blue",
};

const CATEGORIES = ["Allocation", "Events", "Fundraiser", "Merchandise", "Sports", "Editorial", "Operations", "Welfare"];

const fmt = (n: number) => `Rs ${Math.abs(n).toLocaleString("en-IN")}`;

export default function Finances({ openNewOnMount = false }: { openNewOnMount?: boolean }) {
  const { user, hasPermission, dispatch, financeEntries, sheets } = useHub();
  // The Monetary Fund ledger lives in the council spreadsheet once it is connected:
  // the hub reads every transaction from there instead of its local ledger.
  const sheetActive = sheets.isEnabled("finances");
  const canManage = hasPermission("finances") && !sheetActive;
  const [open, setOpen] = useState(openNewOnMount && canManage);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "", type: "expense" as FinanceType, category: "Events",
    amount: "", invoiceRef: "", status: "Pending" as FinanceStatus,
  });

  const totals = useMemo(() => {
    let income = 0, expense = 0;
    financeEntries.forEach((f) => { f.type === "income" ? (income += f.amount) : (expense += f.amount); });
    return { income, expense, net: income - expense };
  }, [financeEntries]);

  const rows = useMemo(
    () =>
      [...financeEntries]
        .filter((f) => (filter === "all" ? true : f.type === filter))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [financeEntries, filter]
  );

  if (!user) return null;

  const submit = () => {
    const amount = parseFloat(form.amount);
    if (!form.title.trim() || !Number.isFinite(amount) || amount <= 0) return setError("Title and a positive amount are required.");
    dispatch({
      type: "ADD_TRANSACTION",
      entry: {
        id: uid(), date: new Date().toISOString().slice(0, 10), title: form.title.trim(),
        type: form.type, category: form.category, amount,
        invoiceRef: form.invoiceRef.trim() || `${form.type === "income" ? "INR" : "EXP"}-${Math.floor(1000 + Math.random() * 9000)}`,
        approvedBy: form.status === "Pending" ? "—" : user.name.split(" ").map((w, i) => (i === 0 ? `${w[0]}.` : w)).join(" "),
        status: form.status,
      },
    });
    setOpen(false); setError(null);
    setForm({ title: "", type: "expense", category: "Events", amount: "", invoiceRef: "", status: "Pending" });
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Finance & Budget Transparency"
        subtitle="Every rupee in and out of the council treasury — fully public to students"
        action={canManage && <Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Record Transaction</Btn>}
      />

      <SheetSyncBar section="finances" />

      <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Total Revenue" value={fmt(totals.income)} sub={`${financeEntries.filter((f) => f.type === "income").length} inflows`} tone="emerald" />
        <StatCard icon={<ReceiptText className="h-5 w-5" />} label="Total Expenditure" value={fmt(totals.expense)} sub={`${financeEntries.filter((f) => f.type === "expense").length} outflows`} tone="red" />
        <StatCard icon={<Scale className="h-5 w-5" />} label="Net Operating Balance" value={`${totals.net < 0 ? "− " : ""}${fmt(totals.net)}`} sub={totals.net >= 0 ? "healthy runway" : "deficit — review spend"} tone={totals.net >= 0 ? "indigo" : "amber"} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.07]">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">Ledger Entries</h3>
          <div className="flex gap-1.5">
            {(["all", "income", "expense"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "min-h-[34px] rounded-lg px-3 text-xs font-bold capitalize transition-all",
                  filter === f ? "bg-accent text-white" : "text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                )}
              >
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] text-[10px] uppercase tracking-[0.18em] text-slate-400 dark:border-white/[0.07]">
                <th className="px-5 py-3 font-bold">Date</th>
                <th className="px-5 py-3 font-bold">Description</th>
                <th className="px-5 py-3 font-bold">Type</th>
                {!sheetActive && <th className="px-5 py-3 font-bold">Category</th>}
                {!sheetActive && <th className="px-5 py-3 font-bold">Invoice Ref</th>}
                <th className="px-5 py-3 text-right font-bold">Amount (Rs.)</th>
                {!sheetActive && <th className="px-5 py-3 font-bold">Approved By</th>}
                {!sheetActive && <th className="px-5 py-3 font-bold">Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={sheetActive ? 4 : 8} className="px-5 py-10 text-center text-sm text-slate-400">
                    {sheetActive
                      ? "No transactions yet — add a row to the Monetary Fund sheet (Date, Type, Amount, Description)."
                      : "No ledger entries match this filter."}
                  </td>
                </tr>
              )}
              {rows.map((f) => (
                <tr key={f.id} className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-400">{new Date(`${f.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2.5 font-semibold text-slate-800 dark:text-slate-100" title={f.remarks || undefined}>
                      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", f.type === "income" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-red-500/10 text-red-500 dark:text-red-300")}>
                        {f.type === "income" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                      </span>
                      {f.title}
                    </span>
                    {(f.counterparty || f.paymentMethod || f.department) && (
                      <span className="mt-1 block pl-9 text-[10px] text-slate-400">
                        {[f.counterparty, f.paymentMethod, f.department].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 capitalize text-slate-500 dark:text-slate-300">{f.type}</td>
                  {!sheetActive && <td className="px-5 py-3.5 text-slate-500 dark:text-slate-300">{f.category}</td>}
                  {!sheetActive && <td className="px-5 py-3.5 font-mono text-xs text-slate-400">{f.invoiceRef}</td>}
                  <td className={cn("px-5 py-3.5 text-right font-display font-bold tabular-nums", f.type === "income" ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-300")}>
                    {f.type === "income" ? "+" : "−"}{f.amount.toLocaleString("en-IN")}
                  </td>
                  {!sheetActive && <td className="px-5 py-3.5 text-slate-500 dark:text-slate-300">{f.approvedBy}</td>}
                  {!sheetActive && <td className="px-5 py-3.5"><Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Record modal */}
      <Modal open={open && canManage} onClose={() => { setOpen(false); setError(null); }} title="Record Transaction">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["income", "expense"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setForm({ ...form, type: t })}
                className={cn(
                  "flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-bold capitalize transition-all",
                  form.type === t
                    ? t === "income" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300"
                    : "border-black/10 text-slate-500 dark:border-white/10"
                )}
              >
                <IndianRupee className="h-4 w-4" /> {t}
              </button>
            ))}
          </div>
          <Field label="Transaction title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Stage decorations — Founders' Week" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (Rs.)"><input type="number" min={1} className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" /></Field>
            <Field label="Category">
              <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice / receipt ref" hint="Optional — auto-generated if blank.">
              <input className={inputCls} value={form.invoiceRef} onChange={(e) => setForm({ ...form, invoiceRef: e.target.value })} placeholder="EXP-2281" />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(v) => setForm({ ...form, status: v as FinanceStatus })}>
                <option>Pending</option>
                <option>Approved</option>
                <option>Reimbursed</option>
              </Select>
            </Field>
          </div>
          {error && <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn onClick={submit}><ReceiptText className="h-4 w-4" /> Record entry</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

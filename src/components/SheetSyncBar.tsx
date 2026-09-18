import { AlertTriangle, Cloud, LoaderCircle, RefreshCw, Sheet } from "lucide-react";
import { useSheets } from "../lib/sheets/context";
import type { SheetSection } from "../lib/sheets/types";
import { cn } from "../utils/cn";

function ago(timestamp: number | null): string {
  if (!timestamp) return "not synced yet";
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Sync strip for a Google Sheets-owned section: source, last updated, refresh, and any
 * error or row warning. Renders nothing at all while the section is not connected to a
 * spreadsheet, so the existing interface is unchanged for local data.
 */
export default function SheetSyncBar({ section, className }: { section: SheetSection; className?: string }) {
  const sheets = useSheets();
  if (!sheets.isEnabled(section)) return null;
  const status = sheets.status(section);
  const loading = status.status === "loading";
  const failed = status.status === "error";
  const warnings = status.warnings;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 dark:border-white/[0.07] dark:bg-white/[0.03]", className)}>
      <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
        <Sheet className="h-3.5 w-3.5 text-emerald-500" />
        Google Sheets
        <span className="font-medium normal-case tracking-normal text-slate-400">· {status.label}</span>
      </span>
      <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
        {loading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Cloud className={cn("h-3 w-3", failed ? "text-amber-500" : "text-emerald-500")} />}
        {loading ? "Syncing…" : failed ? "Refresh failed" : `Updated ${ago(status.updatedAt)}`}
        {!loading && status.count > 0 && <span className="text-slate-400">· {status.count} rows</span>}
      </span>
      <span className="ml-auto flex items-center gap-3">
        <span className="hidden text-[10px] text-slate-400 sm:inline">Read-only · edit rows in the spreadsheet</span>
        <button
          className="btn btn-secondary !min-h-[30px] !px-3 !text-[10px]"
          onClick={() => sheets.refresh(section)}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh now
        </button>
      </span>
      {(failed || warnings.length > 0) && (
        <div className="w-full space-y-1">
          {failed && (
            <p role="alert" className="flex items-start gap-2 text-[10px] leading-relaxed text-amber-600 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{status.error}</span>
            </p>
          )}
          {warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

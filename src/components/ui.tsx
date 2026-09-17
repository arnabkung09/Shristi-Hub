import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../utils/cn";
import { avatarHue, initials, useHub } from "../store/hub";
import { houseFullName, houseLogo } from "../lib/admin";
import type { House } from "../lib/types";

/* ---------------- crest ---------------- */

export function Crest({ className, src }: { className?: string; src?: string }) {
  if (src) {
    return <img src={src} alt="" className={cn("object-contain", className)} />;
  }
  return (
    <svg viewBox="0 0 56 58" className={className} aria-hidden="true">
      <rect x="1" y="1" width="54" height="56" rx="13" fill="#fafbfd" stroke="#d5dde5" />
      <circle cx="28" cy="27" r="20" fill="#f6f8fc" stroke="#748fa2" strokeWidth=".6" />
      <circle cx="28" cy="27" r="16.8" fill="none" stroke="#8a9eae" strokeWidth=".5" strokeDasharray="1 1.5" />
      <path d="M28 12 39 17v13c0 6-6 11-11 13-5-2-11-7-11-13V17z" fill="#d5bd6c" stroke="#314d63" strokeWidth="1.2" />
      <path d="M28 15 36 19v11c0 4-4 8-8 10-4-2-8-6-8-10V19z" fill="#36566c" stroke="#f0df9c" />
      <path d="M28 15v25" stroke="#ebd68a" strokeWidth=".8" />
      <path d="M22 24c2-1 4-1 6 0 2-1 4-1 6 0v9c-2-1-4-1-6 0-2-1-4-1-6 0z" fill="#f4e7b4" stroke="#d1b766" strokeWidth=".5" />
      <path d="M28 24v9M23 27h3m-3 2h3m4-2h3m-3 2h3" stroke="#446173" strokeWidth=".6" />
      <path d="M13 21c-5 9-1 18 10 22m20-22c5 9 1 18-10 22" fill="none" stroke="#648096" strokeWidth="1" />
      <path d="m13 24-3-2m3 6-4-2m5 6-4-1m6 4h-4m7 3h-4m28-14 3-2m-3 6 4-2m-5 6 4-1m-6 4h4m-7 3h4" fill="none" stroke="#648096" strokeWidth="1.2" />
      <text x="28" y="10.5" textAnchor="middle" fontFamily="Georgia, serif" fontSize="4.3" fontWeight="bold" fill="#304a62">SHRISTI ACADEMY</text>
      <path d="M17 44q11 5 22 0l-2 5q-9 3-18 0z" fill="#e3eaf0" stroke="#587187" strokeWidth=".5" />
      <text x="28" y="48" textAnchor="middle" fontFamily="Georgia, serif" fontSize="3.3" fill="#3c556a">LEARN · LEAD · SERVE</text>
    </svg>
  );
}

/* ---------------- layout primitives ---------------- */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-2xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(16,18,22,0.05)]",
      "dark:border-white/[0.07] dark:bg-ink-900 dark:shadow-none",
      className
    )}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------- buttons ---------------- */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "amber";

const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-accent text-white hover:bg-indigo-500 active:bg-indigo-600 shadow-sm",
  secondary: "border border-black/10 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-ink-800 dark:text-slate-200 dark:hover:bg-ink-700",
  ghost: "text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10",
  danger: "bg-red-500 text-white hover:bg-red-400 active:bg-red-600 shadow-sm",
  success: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm",
  amber: "bg-amber-500 text-amber-950 hover:bg-amber-400 shadow-sm",
};

export function Btn({
  children, onClick, variant = "primary", className, disabled, type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-[38px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-45",
        btnVariants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

/* ---------------- badges ---------------- */

type Tone = "slate" | "indigo" | "red" | "amber" | "emerald" | "blue" | "green" | "violet";

const tones: Record<Tone, string> = {
  slate: "bg-slate-500/10 text-slate-600 ring-slate-500/25 dark:text-slate-300",
  indigo: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/25 dark:text-indigo-300",
  red: "bg-red-500/10 text-red-600 ring-red-500/25 dark:text-red-300",
  amber: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  emerald: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-300",
  blue: "bg-blue-500/10 text-blue-600 ring-blue-500/25 dark:text-blue-300",
  green: "bg-green-500/10 text-green-600 ring-green-500/25 dark:text-green-300",
  violet: "bg-violet-500/10 text-violet-600 ring-violet-500/25 dark:text-violet-300",
};

export function Badge({ children, tone = "slate", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
      tones[tone], className
    )}>
      {children}
    </span>
  );
}

export function HouseBadge({ house }: { house: House | null }) {
  const { state } = useHub();
  if (!house) return <Badge tone="slate">No House</Badge>;
  const tone = house === "Blue" ? "blue" : house === "Red" ? "red" : "green";
  const logo = houseLogo(state.houses, house);
  return (
    <Badge tone={tone}>
      {logo ? (
        <img src={logo} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
      ) : (
        <span className={cn("h-1.5 w-1.5 rounded-full", house === "Blue" ? "bg-blue-500" : house === "Red" ? "bg-red-500" : "bg-green-500")} />
      )}
      {houseFullName(state.houses, house)}
    </Badge>
  );
}

export function HouseMark({ house, className }: { house: House | null; className?: string }) {
  const { state } = useHub();
  if (!house) {
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-full bg-slate-400 font-display font-bold text-white", className ?? "h-8 w-8 text-xs")}>
        T
      </span>
    );
  }
  const logo = houseLogo(state.houses, house);
  if (logo) {
    return <img src={logo} alt={`${houseFullName(state.houses, house)} logo`} className={cn("rounded-full object-cover", className ?? "h-8 w-8")} />;
  }
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full font-display font-bold text-white", house === "Blue" ? "bg-blue-500" : house === "Red" ? "bg-red-500" : "bg-green-500", className ?? "h-8 w-8 text-xs")}>
      {houseFullName(state.houses, house).slice(0, 1)}
    </span>
  );
}

export function RoleBadge({ role }: { role: "admin" | "council" | "student" }) {
  if (role === "admin") return <Badge tone="violet">Admin</Badge>;
  if (role === "council") return <Badge tone="indigo">Council</Badge>;
  return <Badge tone="slate">Student</Badge>;
}

/* ---------------- avatar ---------------- */

export function Avatar({ name, house, size = "md", ring = false, className }: { name: string; house: House | null; size?: "sm" | "md" | "lg"; ring?: boolean; className?: string }) {
  const sizes = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-14 w-14 text-base" };
  return (
    <span className={cn(
      "grid shrink-0 place-items-center rounded-full font-bold text-white",
      house ? avatarHue(house) : "bg-slate-400", sizes[size],
      ring && "ring-2 ring-white/70 dark:ring-ink-900",
      className
    )}>
      {initials(name)}
    </span>
  );
}

/* ---------------- form controls ---------------- */

export const inputCls = "control";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">{hint}</span>}
    </label>
  );
}

export function Select({ value, onChange, children, className }: {
  value: string; onChange: (v: string) => void; children: ReactNode; className?: string;
}) {
  return (
    <select aria-label="Select filter or option" value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, className)}>
      {children}
    </select>
  );
}

/* ---------------- modal ---------------- */

export function Modal({ open, onClose, title, children, wide, subtitle, icon }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; subtitle?: string; icon?: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex='0']") ?? []);
    const frame = requestAnimationFrame(() => (focusable()[0] ?? dialog.current)?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); }
      if (e.key === "Tab") {
        const items = focusable();
        if (!items.length) { e.preventDefault(); return; }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#05080e]/75 p-4 backdrop-blur-[5px] sm:p-6"
          onClick={onClose}
        >
          <motion.div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex max-h-[90svh] w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl",
              wide ? "sm:max-w-3xl" : "sm:max-w-[600px]"
            )}
          >
            <div className="mx-5 flex items-center gap-3 border-b border-[var(--border)] py-5 sm:mx-6">
              {icon && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-indigo-400/15 bg-indigo-500/10 text-indigo-300 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
              <div className="min-w-0 flex-1">
                <h3 id={titleId} className="font-display text-[15px] font-bold">{title}</h3>
                {subtitle && <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">{subtitle}</p>}
              </div>
              <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>, document.body
  );
}

/* ---------------- misc ---------------- */

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-black/15 px-6 py-14 text-center dark:border-white/15">
      <span className="text-slate-300 dark:text-slate-600">{icon}</span>
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: {
  tabs: Array<{ id: string; label: string; icon?: ReactNode }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-black/[0.07] bg-black/[0.03] p-1 dark:border-white/[0.07] dark:bg-white/[0.04]">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex min-h-[38px] shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-200",
            active === t.id
              ? "bg-white text-slate-900 shadow-sm dark:bg-ink-700 dark:text-white"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ icon, label, value, sub, tone = "indigo" }: {
  icon: ReactNode; label: string; value: ReactNode; sub?: string; tone?: Tone;
}) {
  const iconTones: Record<Tone, string> = {
    slate: "bg-slate-500/10 text-slate-500 dark:text-slate-300",
    indigo: "bg-indigo-500/10 text-indigo-500 dark:text-indigo-300",
    red: "bg-red-500/10 text-red-500 dark:text-red-300",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    blue: "bg-blue-500/10 text-blue-500 dark:text-blue-300",
    green: "bg-green-500/10 text-green-600 dark:text-green-300",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  };
  return (
    <Card className="animate-slide-up p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
        </div>
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", iconTones[tone])}>{icon}</span>
      </div>
    </Card>
  );
}

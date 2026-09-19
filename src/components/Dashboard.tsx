import {
  AlertTriangle, ArrowRight, ArrowUpRight, CalendarDays, ClipboardList, Crown,
  Megaphone, Medal, MessageSquareHeart, PlusCircle, Radio, Trophy, Vote, Wallet,
} from "lucide-react";
import { useHub, fmtDate, isoDay, targetsUser } from "../store/hub";
import { houseFullName, houseLogo, houseShortName } from "../lib/admin";
import { Badge, Btn, Card, HouseBadge, SectionTitle, StatCard } from "./ui";
import { cn } from "../utils/cn";
import type { House } from "../lib/types";

const MEDAL_STYLE = [
  { icon: <Crown className="h-4 w-4 text-amber-400" />, ring: "ring-amber-400/50", label: "1st" },
  { icon: <Medal className="h-4 w-4 text-slate-400" />, ring: "ring-slate-400/40", label: "2nd" },
  { icon: <Medal className="h-4 w-4 text-orange-400/80" />, ring: "ring-orange-400/30", label: "3rd" },
];

/** Type colours on the homepage mirror the calendar's five spreadsheet types. */
const TYPE_TONE: Record<string, string> = {
  Holiday: "type-holiday", Normal: "type-normal", Competition: "type-competition",
  Event: "type-event", Examination: "type-examination",
};

const HOUSE_TEXT: Record<House, string> = {
  Blue: "text-blue-500 dark:text-blue-300",
  Red: "text-red-500 dark:text-red-300",
  Green: "text-green-600 dark:text-green-300",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { state, user, canManage, hasPermission, setActiveTab, houseTotals, calendarEvents } = useHub();
  if (!user) return null;

  const upcomingEvents = calendarEvents
    .filter((e) => e.date >= isoDay())
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextUp = upcomingEvents.slice(0, 3);
  const nextLabel = (date: string) => {
    const days = Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${isoDay()}T00:00:00`)) / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    return fmtDate(date);
  };
  const openTasks = state.tasks.filter((t) => t.status !== "done");
  const activePolls = state.polls.filter((p) => p.expires >= new Date().toISOString().slice(0, 10));
  const urgent = state.announcements.find((a) => a.priority === "urgent" && targetsUser(a.audience, user));
  const standings = (Object.entries(houseTotals) as Array<[House, number]>).sort((a, b) => b[1] - a[1]);
  const maxPoints = Math.max(...standings.map(([, v]) => v), 1);
  const leader = standings[0];

  const quickActions: Array<{ label: string; desc: string; icon: React.ReactNode; tab: string; manageOnly?: boolean }> = [
    { label: "Award House Points", desc: "Log a win or deduction", icon: <Trophy className="h-4.5 w-4.5" />, tab: "houses?award=1", manageOnly: true },
    { label: "Create Announcement", desc: "Post to the noticeboard", icon: <Megaphone className="h-4.5 w-4.5" />, tab: "events?compose=notice", manageOnly: true },
    { label: "New Task", desc: "Assign council work", icon: <ClipboardList className="h-4.5 w-4.5" />, tab: "tasks?new=1", manageOnly: true },
    { label: "Record Transaction", desc: "Income or expense", icon: <Wallet className="h-4.5 w-4.5" />, tab: "finances?new=1", manageOnly: true },
    { label: "Browse Events", desc: `${upcomingEvents.length} upcoming`, icon: <CalendarDays className="h-4.5 w-4.5" />, tab: "events" },
    { label: "Submit Suggestion", desc: "Share feedback with council", icon: <MessageSquareHeart className="h-4.5 w-4.5" />, tab: "voice" },
    { label: "Vote Now", desc: `${activePolls.length} active polls`, icon: <Vote className="h-4.5 w-4.5" />, tab: "voice?polls=1" },
    { label: "Broadcast Hub", desc: "Ping all devices", icon: <Radio className="h-4.5 w-4.5" />, tab: "broadcast", manageOnly: true },
  ].filter((a) => !a.manageOnly || hasPermission(a.tab.split("?")[0]));

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <Card className="relative overflow-hidden p-6 sm:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.14),transparent_55%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{fmtDate(new Date().toISOString().slice(0, 10))}</p>
            <h1 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              {greeting()}, {user.name.split(" ")[0]}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <HouseBadge house={user.house} />
              {!user.isStaff && <Badge tone="slate">Grade {user.grade}</Badge>}
              {user.councilPost && <Badge tone="indigo">{user.councilPost}</Badge>}
              <Badge tone="emerald"><span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-500" /> Live sync on</Badge>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">House Cup frontrunner</p>
            <p className={cn("mt-1 flex items-center justify-end gap-2 font-display text-4xl font-extrabold", HOUSE_TEXT[leader[0]])}>{houseLogo(state.houses, leader[0]) && <img src={houseLogo(state.houses, leader[0])} alt="" className="h-9 w-9 rounded-full object-cover" />}{houseShortName(state.houses, leader[0])}</p>
            <p className="text-xs text-slate-400">{leader[1].toLocaleString()} pts</p>
          </div>
        </div>
      </Card>

      {/* Urgent spotlight */}
      {urgent && (
        <button
          onClick={() => setActiveTab("events")}
          className="group w-full animate-slide-up rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/[0.10] via-red-500/[0.05] to-transparent p-4 text-left transition-all hover:border-red-500/50 sm:p-5"
        >
          <div className="flex items-start gap-3.5">
            <span className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-500/15">
              <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
              <span className="absolute inset-0 animate-ping-slow rounded-xl border border-red-500/40" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="red">Urgent Notice</Badge>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-red-400/80">pinned spotlight</span>
              </div>
              <p className="mt-1.5 font-display text-base font-bold text-slate-900 dark:text-white sm:text-lg">{urgent.title}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{urgent.body}</p>
            </div>
            <ArrowRight className="mt-2 h-5 w-5 shrink-0 text-red-400 transition-transform group-hover:translate-x-1" />
          </div>
        </button>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={<CalendarDays className="h-5 w-5" />} label="Upcoming Events" value={upcomingEvents.length} sub="RSVP open on all" tone="indigo" />
        <StatCard icon={<ClipboardList className="h-5 w-5" />} label="Pending Tasks" value={openTasks.length} sub={canManage ? "council pipeline" : "council is on it"} tone="amber" />
        <StatCard icon={<Vote className="h-5 w-5" />} label="Active Polls" value={activePolls.length} sub="your vote counts" tone="emerald" />
        <StatCard icon={<Crown className="h-5 w-5" />} label="Cup Frontrunner" value={leader[0]} sub={`${leader[1].toLocaleString()} points`} tone={leader[0] === "Blue" ? "blue" : leader[0] === "Red" ? "red" : "green"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* Quick actions */}
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Quick actions" subtitle={canManage ? "Officer controls at your fingertips" : "Jump back in"} />
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((a) => (
              <button
                key={a.label}
                onClick={() => setActiveTab(a.tab)}
                className="group flex flex-col gap-2.5 rounded-2xl border border-black/[0.06] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/[0.07] dark:border-white/[0.07] dark:hover:border-accent/50"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                  {a.icon}
                </span>
                <span>
                  <span className="flex items-center gap-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                    {a.label}
                    <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-400">{a.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        {/* Mini leaderboard */}
        <Card className="p-5 sm:p-6">
          <SectionTitle
            title="House Cup standings"
            subtitle="Live championship snapshot"
            action={<Btn variant="ghost" className="min-h-[32px] px-2 text-xs" onClick={() => setActiveTab("houses")}>Full board <ArrowRight className="h-3.5 w-3.5" /></Btn>}
          />
          <div className="space-y-4">
            {standings.map(([house, pts], i) => (
              <div key={house}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("grid h-7 w-7 place-items-center rounded-full ring-2", MEDAL_STYLE[i].ring, "bg-white dark:bg-ink-800")}>
                      {MEDAL_STYLE[i].icon}
                    </span>
                    {houseLogo(state.houses, house) ? <img src={houseLogo(state.houses, house)} alt="" className="h-6 w-6 rounded-full object-cover" /> : null}
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{houseFullName(state.houses, house)}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{MEDAL_STYLE[i].label}</span>
                  </div>
                  <span className={cn("font-display text-lg font-extrabold tabular-nums", HOUSE_TEXT[house])}>{pts.toLocaleString()}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.07]">
                  <div
                    className={cn(
                      "h-full animate-bar-grow rounded-full",
                      house === "Blue" ? "bg-gradient-to-r from-blue-600 to-blue-400" : house === "Red" ? "bg-gradient-to-r from-red-600 to-red-400" : "bg-gradient-to-r from-green-600 to-green-400"
                    )}
                    style={{ width: `${Math.max(6, (pts / maxPoints) * 100)}%` }}
                  />
                </div>
                {i === 0 && standings[1] && (
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    leads by {(standings[0][1] - standings[1][1]).toLocaleString()} pts
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-black/[0.03] px-3.5 py-2.5 text-xs text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
            <PlusCircle className="h-3.5 w-3.5 shrink-0 text-accent" />
            Points update the moment council logs them — no refresh needed.
          </div>
        </Card>

        {/* Next up — the same calendar rows the Calendar page renders */}
        {nextUp.length > 0 && (
          <Card className="p-5 sm:p-6">
            <SectionTitle
              title="Next up"
              subtitle="Straight from the council calendar"
              action={<Btn variant="ghost" className="min-h-[32px] px-2 text-xs" onClick={() => setActiveTab("events")}>Calendar <ArrowRight className="h-3.5 w-3.5" /></Btn>}
            />
            <div className="space-y-3">
              {nextUp.map((event) => (
                <button
                  key={event.id}
                  onClick={() => setActiveTab("events")}
                  className="flex w-full items-center gap-3 rounded-xl border border-black/[0.06] px-3.5 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/40 dark:border-white/[0.07]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><CalendarDays className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-100">{event.title}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-400">{nextLabel(event.date)}</span>
                  </span>
                  <span className={cn("type-chip", TYPE_TONE[event.eventType ?? ""] ?? "type-normal")}>{event.eventType ?? event.category}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

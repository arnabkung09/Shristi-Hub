import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { AlarmClock, ArrowRight, CircleCheck, ShieldAlert, X } from "lucide-react";
import { HubProvider, useHub, targetsUser, TAB_KEY } from "./store/hub";
import { chime } from "./lib/realtime";
import Navbar, { DemoStrip } from "./components/Navbar";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import HousePoints from "./components/HousePoints";
import CouncilMembers from "./components/CouncilMembers";
import EventsAndNews from "./components/EventsAndNews";
import HouseHub from "./components/HouseHub";
import CouncilHub from "./components/CouncilHub";
import TaskManagement from "./components/TaskManagement";
import FeedbackAndPolls from "./components/FeedbackAndPolls";
import MeetingsAndFiles from "./components/MeetingsAndFiles";
import Finances from "./components/Finances";
import Gallery from "./components/Gallery";
import AdminNotificationsHub from "./components/AdminNotificationsHub";
import AdminPanel, { TermsContent } from "./components/AdminPanel";
import HomePortal from "./components/HomePortal";
import { MouseGlow } from "./components/Effects";
import { Modal } from "./components/ui";

interface Toast {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
  actionTab?: string;
}

function Toasts() {
  const { state, user, setActiveTab, feedback } = useHub();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dismissed, setDismissed] = useState(0);
  const seen = useRef<Set<string>>(new Set(state.notifications.map((n) => n.id)));

  useEffect(() => {
    if (!user) return;
    const fresh = state.notifications.filter(
      (n) => targetsUser(n.audience, user) && !seen.current.has(n.id)
    );
    state.notifications.forEach((n) => seen.current.add(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => seen.current.add(n.id));
    const newest = fresh[0];
    chime(newest.urgent);
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      try {
        const desktop = new Notification(newest.title, { body: newest.body, tag: newest.id });
        desktop.onclick = () => { window.focus(); if (newest.actionTab) setActiveTab(newest.actionTab); desktop.close(); };
      } catch { /* In-app alerts remain available when a browser blocks desktop notifications. */ }
    }
    const toast: Toast = { id: newest.id, title: newest.title, body: newest.body, urgent: newest.urgent, actionTab: newest.actionTab };
    setToasts((t) => [toast, ...t].slice(0, 3));
    if (!newest.urgent) {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== newest.id)), 6000);
    }
  }, [state.notifications, user]);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[95] flex w-[min(92vw,380px)] flex-col gap-2.5">
      <AnimatePresence>
        {feedback && feedback.id !== dismissed && <motion.div key={`feedback-${feedback.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl" role={feedback.tone === "error" ? "alert" : "status"}>{feedback.tone === "error" ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" /> : <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />}<p className="flex-1 text-[11px] leading-relaxed text-[var(--text)]">{feedback.text}</p><button aria-label="Dismiss message" onClick={() => setDismissed(feedback.id)} className="icon-action !h-5 !w-5"><X /></button></motion.div>}
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={`pointer-events-auto overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-lg ${
              t.urgent
                ? "border-red-500/50 bg-red-950/90 text-white"
                : "border-black/10 bg-white/95 text-slate-900 dark:border-white/10 dark:bg-ink-850/95 dark:text-white"
            }`}
          >
            {t.urgent && (
              <div className="flex items-center gap-2 bg-red-500/20 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-red-300">
                <ShieldAlert className="h-3.5 w-3.5" /> Urgent broadcast
              </div>
            )}
            <div className="flex items-start gap-3 p-4">
              <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.urgent ? "bg-red-500/20 text-red-300" : "bg-accent/10 text-accent"}`}>
                <AlarmClock className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{t.title}</p>
                <p className={`mt-0.5 line-clamp-2 text-xs ${t.urgent ? "text-red-200/90" : "text-slate-500 dark:text-slate-400"}`}>{t.body}</p>
                {t.actionTab && (
                  <button
                    onClick={() => { setActiveTab(t.actionTab!); setToasts((x) => x.filter((y) => y.id !== t.id)); }}
                    className={`mt-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider ${t.urgent ? "text-red-300 hover:text-red-200" : "text-accent hover:opacity-80"}`}
                  >
                    Open {t.actionTab} <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
              <button
                aria-label="Dismiss"
                onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${t.urgent ? "text-red-200/70 hover:bg-white/10" : "text-slate-400 hover:bg-black/5 dark:hover:bg-white/10"}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Shell() {
  const { user, activeTab, state } = useHub();
  const [legal, setLegal] = useState<"terms" | "credits" | null>(null);
  const [base, query] = activeTab.split("?");
  const footerNote = state.branding.footerNote;

  if (!user) return <Login />;

  const canManage = user.role === "admin" || user.role === "council";
  const q = query ?? "";

  const section = (() => {
    switch (base) {
      case "home": return <HomePortal />;
      case "admin": return <AdminPanel />;
      case "houses": return <HousePoints openAwardOnMount={q.includes("award=1")} />;
      case "house": return <HouseHub />;
      case "council-hub": return <CouncilHub />;
      case "directory": return <CouncilMembers />;
      case "events":
        return <EventsAndNews initialTab={q.includes("compose=notice") || q.includes("tab=notices") ? "news" : "calendar"} />;
      case "notices": return <EventsAndNews initialTab="news" />;
      case "tasks": return canManage ? <TaskManagement openNewOnMount={q.includes("new=1")} /> : <Restricted />;
      case "voice": return <FeedbackAndPolls initialTab={q.includes("polls=1") ? "polls" : "suggestions"} />;
      case "meetings": return <MeetingsAndFiles />;
      case "finances": return <Finances openNewOnMount={q.includes("new=1")} />;
      case "gallery": return <Gallery />;
      case "broadcast": return canManage ? <AdminNotificationsHub /> : <Restricted />;
      default: return <Dashboard />;
    }
  })();

  return (
    <div className="app-shell">
      <MouseGlow />
      <a href="#main-content" onClick={(e) => { e.preventDefault(); document.getElementById("main-content")?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:p-3 focus:text-black">Skip to main content</a>
      <DemoStrip />
      <Navbar />
      <main className="site-container site-main" id="main-content" tabIndex={-1}>
        <div key={activeTab} className="page-motion">
          {section}
        </div>
      </main>
      <footer className="site-footer"><div className="site-container footer-inner"><p>Active Session: <span className="text-[var(--faint)]">{user.id}</span> <span className="mx-1 text-[var(--border)]">|</span> Affiliation: {user.email}</p><div className="footer-links"><button onClick={() => setLegal("terms")}>Terms & Conditions</button><span className="text-[var(--faint)]">/</span><button onClick={() => setLegal("credits")}>Credits Page</button></div><p>{footerNote}</p></div></footer>
      <Modal open={!!legal} onClose={() => setLegal(null)} title={legal === "credits" ? "Credits Page" : "Terms & Conditions"} wide><TermsContent creditsOnly={legal === "credits"} /><div className="dialog-actions"><button className="btn btn-secondary" onClick={() => setLegal(null)}>Close View</button></div></Modal>
      <Toasts />
    </div>
  );
}

function Restricted() {
  const { setActiveTab } = useHub();
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-500">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h2 className="mt-4 font-display text-xl font-bold text-slate-900 dark:text-white">Council access required</h2>
      <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
        This section is reserved for council officers and administrators.
      </p>
      <button onClick={() => setActiveTab("dashboard")} className="mt-5 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
        Back to dashboard <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTabState] = useState(() => {
    try { return window.location.hash.slice(1) || localStorage.getItem(TAB_KEY) || "admin"; } catch { return "admin"; }
  });

  const setActiveTab = useCallback((t: string) => {
    setActiveTabState(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* noop */ }
    if (window.location.hash.slice(1) !== t) window.history.pushState(null, "", `#${t}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    const onNavigate = () => { const tab = window.location.hash.slice(1) || "admin"; setActiveTabState(tab); window.scrollTo(0, 0); };
    window.addEventListener("popstate", onNavigate);
    window.addEventListener("hashchange", onNavigate);
    return () => { window.removeEventListener("popstate", onNavigate); window.removeEventListener("hashchange", onNavigate); };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <HubProvider activeTab={activeTab} setActiveTab={setActiveTab}>
        <Shell />
      </HubProvider>
    </MotionConfig>
  );
}

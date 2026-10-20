import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { ReactLenis } from "lenis/react";
import { Bell, CircleCheck, ShieldAlert, X, ArrowRight, AlarmClock } from "lucide-react";
import { HubProvider, useHub, targetsUser, TAB_KEY } from "./store/hub";
import { SheetsProvider } from "./lib/sheets/context";
import { chime } from "./lib/realtime";
import Navbar from "./components/Navbar";
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
import { Crest, Modal } from "./components/ui";
import OSNotificationBeacon from "./components/OSNotificationBeacon";
import { getNotificationPreferences, triggerOSNotification, getNotifiedIds, markAsNotified, hasBeenNotified } from "./lib/firebase-client";
import PushAlertsPrompt from "./components/PushAlertsPrompt";
import PushAlertsButton from "./components/PushAlertsButton";

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
  const seen = useRef<Set<string>>(new Set([...getNotifiedIds(), ...state.notifications.map((n) => n.id)]));
  const sessionStartTime = useRef(Date.now());
  const initialMountRef = useRef(true);

  useEffect(() => {
    if (!user) return;
    if (initialMountRef.current) {
      initialMountRef.current = false;
      state.notifications.forEach((n) => seen.current.add(n.id));
      return;
    }
    const fresh = state.notifications.filter(
      (n) => !n.isHistorical && targetsUser(n.audience, user) && !seen.current.has(n.id) && !hasBeenNotified(n.id) && Number(n.timestamp || 0) >= sessionStartTime.current - 1500
    );
    state.notifications.forEach((n) => seen.current.add(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => {
      seen.current.add(n.id);
      markAsNotified(n.id);
    });
    const prefs = getNotificationPreferences();

    fresh.slice(0, 3).forEach((newest) => {
      chime(newest.urgent);

      // 1. Trigger real OS-level Web Push / Desktop Notification if enabled
      if (prefs.osNotifications) {
        void triggerOSNotification({
          title: newest.title,
          body: newest.body,
          icon: state.branding?.logoUrl || undefined,
          tag: newest.id,
          actionTab: newest.actionTab,
          urgent: newest.urgent,
        });
      }

      // 2. Trigger in-app toast if enabled
      if (prefs.inAppNotifications) {
        const toast: Toast = { id: newest.id, title: newest.title, body: newest.body, urgent: newest.urgent, actionTab: newest.actionTab };
        setToasts((t) => [toast, ...t.filter((x) => x.id !== newest.id)].slice(0, 3));
        if (!newest.urgent) {
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== newest.id)), 6000);
        }
      }
    });
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
              {state.branding?.logoUrl ? (
                <Crest
                  src={state.branding.logoUrl}
                  className="mt-0.5 h-9 w-9 shrink-0 rounded-xl border border-black/10 bg-white p-1 object-contain dark:border-white/10"
                />
              ) : (
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.urgent ? "bg-red-500/20 text-red-300" : "bg-accent/10 text-accent"}`}>
                  <AlarmClock className="h-4 w-4" />
                </span>
              )}
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

function TopCouncilAlertsBanner() {
  const { user } = useHub();
  const [permission, setPermission] = useState(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("shristi_top_alerts_banner_dismissed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const check = () => setPermission(Notification.permission);
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  if (!user || permission === "granted" || permission === "unsupported" || dismissed) {
    return null;
  }

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/80 via-slate-900/95 to-purple-950/80 p-3.5 sm:p-4 shadow-xl backdrop-blur-md animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/20 text-indigo-400">
            <Bell className="h-5 w-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h4 className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-bold text-white">
              <span>Enable Council Alerts</span>
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                Visible to everyone
              </span>
            </h4>
            <p className="mt-0.5 text-[11px] sm:text-xs text-slate-300">
              Get instant push notifications for emergency assembly notices, house points updates, council polls, and direct messages.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <div className="w-full sm:w-auto min-w-[170px]">
            <PushAlertsButton />
          </div>
          <button
            type="button"
            aria-label="Dismiss banner"
            onClick={() => {
              setDismissed(true);
              try { localStorage.setItem("shristi_top_alerts_banner_dismissed", "true"); } catch {}
            }}
            className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
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
      case "tasks": return <TaskManagement openNewOnMount={canManage && q.includes("new=1")} />;
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
      <Navbar />
      <main className="site-container site-main" id="main-content" tabIndex={-1}>
        {/* Enable Council Alerts Banner: At the top of every page for maximum visibility */}
        <TopCouncilAlertsBanner />
        <div key={base} className="page-motion">
          {section}
        </div>
      </main>
      <footer className="site-footer">
        <div className="site-container footer-inner">
          <p>Active Session: <span className="text-[var(--faint)]">{user.id}</span> <span className="mx-1 text-[var(--border)]">|</span> Affiliation: {user.email}</p>
          <div className="footer-links"><button onClick={() => setLegal("terms")}>Terms & Conditions</button><span className="text-[var(--faint)]">/</span><button onClick={() => setLegal("credits")}>Credits Page</button></div>
          <p>{footerNote}</p>
        </div>
      </footer>
      <Modal open={!!legal} onClose={() => setLegal(null)} title={legal === "credits" ? "Credits Page" : "Terms & Conditions"} wide><TermsContent creditsOnly={legal === "credits"} /><div className="dialog-actions"><button className="btn btn-secondary" onClick={() => setLegal(null)}>Close View</button></div></Modal>
      <OSNotificationBeacon />
      <PushAlertsPrompt />
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

  const [smoothScroll] = useState(() =>
    typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const tree = (
    <MotionConfig reducedMotion="user">
      <SheetsProvider>
        <HubProvider activeTab={activeTab} setActiveTab={setActiveTab}>
          <Shell />
        </HubProvider>
      </SheetsProvider>
    </MotionConfig>
  );

  if (!smoothScroll) return tree;
  return (
    <ReactLenis root options={{ lerp: 0.1, autoRaf: true }}>
      {tree}
    </ReactLenis>
  );
}

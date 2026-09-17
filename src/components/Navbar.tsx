import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, CircleCheck, LogOut, Menu, Moon, Shield, Sun, UserRound } from "lucide-react";
import { relativeTime, targetsUser, useHub } from "../store/hub";
import { houseFullName } from "../lib/admin";
import { Crest, HouseMark, Modal } from "./ui";
import { enableFirebasePush, firebaseAuth } from "../lib/firebase-client";
import type { Role } from "../lib/types";

const LINKS = [
  { id: "home", label: "Home Portal", lines: ["Home", "Portal"] },
  { id: "dashboard", label: "Dashboard", lines: ["Dashboard"] },
  { id: "events", label: "Events & News", lines: ["Events &", "News"] },
  { id: "voice", label: "Polls & Feedback", lines: ["Polls &", "Feedback"] },
  { id: "tasks", label: "Tasks", lines: ["Tasks"] },
  { id: "houses", label: "House Points", lines: ["House", "Points"] },
  { id: "house", label: "House Hub", lines: ["House", "Hub"] },
  { id: "council-hub", label: "Council Hub", lines: ["Council", "Hub"] },
  { id: "meetings", label: "Meetings & Files", lines: ["Meetings", "& Files"] },
  { id: "finances", label: "Finance", lines: ["Finance"] },
  { id: "directory", label: "Directory", lines: ["Directory"] },
  { id: "gallery", label: "Gallery", lines: ["Gallery"] },
  { id: "admin", label: "Admin Panel", lines: ["Admin", "Panel"] },
];

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const pointer = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) closeRef.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key); };
  }, [open]);
  return ref;
}

export function DemoStrip() {
  const { user, switchDemoRole } = useHub();
  return (
    <div className="demo-strip">
      <span className="demo-tag">DEMO PLATFORM</span>
      <span className="demo-explainer">Explore the council workspace. Switch roles to preview permissions.</span>
      <div className="demo-roles" aria-label="Preview role">
        {(["student", "council", "admin"] as Role[]).map((role) => (
          <button key={role} aria-pressed={user?.role === role} onClick={() => switchDemoRole(role)}>{role}</button>
        ))}
      </div>
    </div>
  );
}

function NotificationBell() {
  const { state, user, unreadCount, dispatch, setActiveTab, announce } = useHub();
  const [open, setOpen] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  if (!user) return null;
  const notifications = state.notifications.filter((n) => targetsUser(n.audience, user));
  const enablePush = async () => {
    setEnablingPush(true);
    try {
      await enableFirebasePush(user);
      announce("Real Firebase push notifications are enabled on this device.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Push registration failed.", "error");
    } finally {
      setEnablingPush(false);
    }
  };
  return (
    <div className="relative" ref={ref}>
      <button className="nav-icon" aria-label={`Notifications, ${unreadCount} unread`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Bell />
        {unreadCount > 0 && <span className="notification-dot" />}
      </button>
      <AnimatePresence>
        {open && <motion.div className="nav-popover" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}>
          <div className="popover-heading"><strong>Notifications <span className="text-[var(--purple)]">({unreadCount})</span></strong><button onClick={() => dispatch({ type: "MARK_ALL_READ", userId: user.id })}><CheckCheck className="mr-1 inline h-3 w-3" />Mark all read</button></div>
          <div className="max-h-[365px] overflow-y-auto">
            {!notifications.length && <p className="p-8 text-center text-xs text-[var(--muted)]">You are all caught up.</p>}
            {notifications.slice(0, 15).map((n) => <button key={n.id} className={`notice-item ${!n.readBy.includes(user.id) ? "unread" : ""}`} onClick={() => { dispatch({ type: "MARK_READ", notifId: n.id, userId: user.id }); if (n.actionTab) setActiveTab(n.actionTab); setOpen(false); }}>
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.urgent ? "bg-rose-500" : "bg-indigo-400"}`} />
              <span><strong>{n.title}</strong><p>{n.body}</p><small>{n.senderName} / {relativeTime(n.timestamp)}</small></span>
            </button>)}
          </div>
          <div className="border-t border-[var(--border)] p-3">
            <button className="btn btn-primary w-full" disabled={enablingPush || !firebaseAuth.currentUser} onClick={() => void enablePush()}>
              <Bell className="h-3.5 w-3.5" />{enablingPush ? "Registering device..." : Notification.permission === "granted" ? "Refresh push registration" : "Enable real push notifications"}
            </button>
            {!firebaseAuth.currentUser && <p className="mt-2 text-center text-[9px] text-[var(--faint)]">Sign in with Google to enable push.</p>}
          </div>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { state, user, setActiveTab, signOutSession, firebaseEmail } = useHub();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button className="profile-trigger" aria-label="Open profile menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span><span className="profile-name">{user.name}</span><span className="profile-meta"><CircleCheck />Roster verified <span className="role-tag">{user.role}</span></span></span>
        <span className="profile-initial">{user.name[0]}</span>
      </button>
      {open && <div className="nav-popover !w-[280px] page-motion">
        <div className="p-4"><strong className="text-xs">{user.name}</strong><p className="mt-1 break-all text-[10px] text-[var(--muted)]">{user.email}</p><p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--purple)]"><HouseMark house={user.house} className="h-4 w-4 text-[7px]" />{user.gradeLabel ?? "Staff"} / {user.house ? houseFullName(state.houses, user.house) : "No House"}</p></div>
        <button className="notice-item !items-center !text-[11px]" onClick={() => { setOpen(false); setProfile(true); }}><UserRound className="h-3.5 w-3.5 text-[var(--purple)]" />My profile</button>
        {user.role === "admin" && <button className="notice-item !items-center !text-[11px]" onClick={() => { setActiveTab("admin"); setOpen(false); }}><Shield className="h-3.5 w-3.5 text-[var(--purple)]" />Council administration</button>}
        <button className="notice-item !items-center !text-[11px] text-rose-500" onClick={() => void signOutSession()}><LogOut className="h-3.5 w-3.5" />Sign out{firebaseEmail ? " of Google" : ""}</button>
      </div>}
      <Modal open={profile} onClose={() => setProfile(false)} title="My student profile" icon={<UserRound />} subtitle="Your identity in the Shristi Academy council workspace.">
        <div className="form-stack">
          {[["Full name", user.name], ["Institutional email", user.email], ["Account ID", user.id.toUpperCase()], ["Class", user.gradeLabel ?? "Staff"], ["House", user.house ? houseFullName(state.houses, user.house) : "No House"], ["Council office", user.councilTitle ?? "—"], ["Account status", user.status]].map(([label, value]) => <div key={label} className="integration-row"><span>{label}</span><strong className="break-all text-right text-[11px]">{value}</strong></div>)}
        </div>
        <div className="dialog-actions"><button className="btn btn-secondary" onClick={() => setProfile(false)}>Close profile</button></div>
      </Modal>
    </div>
  );
}

export default function Navbar() {
  const { user, state, dispatch, activeTab, setActiveTab, signOutSession } = useHub();
  const [drawer, setDrawer] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const current = activeTab.split("?")[0];
  const active = current === "notices" ? "events" : current === "broadcast" ? "admin" : current;

  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;

    // Reveal the current section without scrolling the rest of the page.
    const revealActiveLink = () => {
      const link = navigation.querySelector<HTMLAnchorElement>('[aria-current="page"]');
      if (!link || navigation.scrollWidth <= navigation.clientWidth) return;
      const bounds = navigation.getBoundingClientRect();
      const linkBounds = link.getBoundingClientRect();
      if (linkBounds.left < bounds.left || linkBounds.right > bounds.right) {
        navigation.scrollLeft += linkBounds.left - bounds.left - (navigation.clientWidth - linkBounds.width) / 2;
      }
    };

    revealActiveLink();
    window.addEventListener("resize", revealActiveLink);
    return () => window.removeEventListener("resize", revealActiveLink);
  }, [active, user?.role]);

  if (!user) return null;
  const links = LINKS.filter((l) => l.id !== "admin" || user.role === "admin");
  const councilHubAccess = state.councilHubMembers.includes(user.id) || user.role === "admin";
  const go = (id: string) => { setActiveTab(id); setDrawer(false); };
  return (
    <header className="site-header">
      <div className="site-container nav-inner">
        <button className="brand" onClick={() => go("home")} aria-label={`${state.branding.schoolName} home`}>
          <Crest className="brand-crest rounded-lg" src={state.branding.logoUrl} />
          <span><span className="brand-title">{state.branding.schoolName}</span><span className="brand-subtitle">{state.branding.boardName}</span></span>
        </button>
        <nav ref={navigationRef} className="primary-nav" aria-label="Main navigation">
          {links.filter((link) => link.id !== "council-hub" || councilHubAccess).map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              className={active === link.id ? "active" : ""}
              aria-label={link.label}
              aria-current={active === link.id ? "page" : undefined}
              onClick={(e) => { e.preventDefault(); go(link.id); }}
            >
              <span className="nav-link-label">{link.lines.map((line) => <span key={line}>{line}</span>)}</span>
            </a>
          ))}
        </nav>
        <div className="nav-controls">
          <button className="nav-icon !text-amber-500" aria-label={`Switch to ${state.theme === "dark" ? "light" : "dark"} mode`} onClick={() => dispatch({ type: "SET_THEME", theme: state.theme === "dark" ? "light" : "dark" })}>{state.theme === "dark" ? <Sun /> : <Moon />}</button>
          <NotificationBell />
          <UserMenu />
          <button className="signout" onClick={() => void signOutSession()}>Sign<br />Out</button>
          <button className="nav-icon mobile-menu-trigger" aria-label="Open navigation menu" aria-expanded={drawer} onClick={() => setDrawer(true)}><Menu /></button>
        </div>
      </div>
      <Modal open={drawer} onClose={() => setDrawer(false)} title={state.branding.schoolName} subtitle={`${state.branding.boardName} / ${state.branding.session}`} icon={<Shield />}>
        <nav className="grid grid-cols-2 gap-2" aria-label="Mobile navigation">{links.filter((link) => link.id !== "council-hub" || councilHubAccess).map((link) => <button key={link.id} className={`btn min-h-11 justify-start ${active === link.id ? "btn-primary" : "btn-secondary"}`} onClick={() => go(link.id)}>{link.label}</button>)}</nav>
        <div className="dialog-actions"><button className="btn btn-danger" onClick={() => void signOutSession()}><LogOut />Sign out</button></div>
      </Modal>
    </header>
  );
}
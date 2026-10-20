import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, CircleCheck, Download, LogOut, Menu, RefreshCw, Shield, Smartphone, UserRound } from "lucide-react";
import { initials, relativeTime, targetsUser, useHub } from "../store/hub";
import { houseFullName } from "../lib/admin";
import { Crest, HouseMark, Modal } from "./ui";
import { enableFirebasePush } from "../lib/firebase-client";
import NotificationSettings from "./NotificationSettings";
import { usePWAInstall } from "../hooks/usePWAInstall";

const LINKS = [
  { id: "home", label: "Home Portal", lines: ["Home", "Portal"] },
  { id: "dashboard", label: "Dashboard", lines: ["Dashboard"] },
  { id: "directory", label: "Directory", lines: ["Directory"] },
  { id: "events", label: "Events & News", lines: ["Events &", "News"] },
  { id: "voice", label: "Polls & Feedback", lines: ["Polls &", "Feedback"] },
  { id: "tasks", label: "Tasks", lines: ["Tasks"] },
  { id: "houses", label: "House Points", lines: ["House", "Points"] },
  { id: "house", label: "House Hub", lines: ["House", "Hub"] },
  { id: "council-hub", label: "Council Hub", lines: ["Council", "Hub"] },
  { id: "meetings", label: "Meetings & Files", lines: ["Meetings", "& Files"] },
  { id: "finances", label: "Finance", lines: ["Finance"] },
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

function NotificationBell() {
  const { state, user, unreadCount, dispatch, setActiveTab, announce } = useHub();
  const [open, setOpen] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [osPulsing, setOsPulsing] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  useEffect(() => {
    const handleOSAlert = () => {
      setOsPulsing(true);
      const timer = setTimeout(() => setOsPulsing(false), 3500);
      return () => clearTimeout(timer);
    };
    window.addEventListener("shristi-os-notification-fired", handleOSAlert);
    return () => window.removeEventListener("shristi-os-notification-fired", handleOSAlert);
  }, []);

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
      <button
        className={`nav-icon transition-all ${osPulsing ? "!text-emerald-400 ring-2 ring-emerald-400/50 shadow-lg shadow-emerald-500/20" : ""}`}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell className={osPulsing ? "animate-bounce" : ""} />
        {unreadCount > 0 && <span className="notification-dot" />}
        {osPulsing && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && <motion.div className="nav-popover" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}>
          <div className="popover-heading">
            <strong className="flex items-center gap-2">
              {state.branding.logoUrl && (
                <Crest src={state.branding.logoUrl} className="h-4 w-4 rounded object-contain" />
              )}
              <span>Notifications <span className="text-[var(--purple)]">({unreadCount})</span></span>
            </strong>
            <button onClick={() => dispatch({ type: "MARK_ALL_READ", userId: user.id })}><CheckCheck className="mr-1 inline h-3 w-3" />Mark all read</button>
          </div>
          <div className="max-h-[365px] overflow-y-auto">
            {!notifications.length && <p className="p-8 text-center text-xs text-[var(--muted)]">You are all caught up.</p>}
            {notifications.slice(0, 15).map((n) => <button key={n.id} className={`notice-item ${!n.readBy.includes(user.id) ? "unread" : ""}`} onClick={() => { dispatch({ type: "MARK_READ", notifId: n.id, userId: user.id }); if (n.actionTab) setActiveTab(n.actionTab); setOpen(false); }}>
              {state.branding.logoUrl ? (
                <Crest src={state.branding.logoUrl} className="mt-0.5 h-6 w-6 shrink-0 rounded-md object-contain" />
              ) : (
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.urgent ? "bg-rose-500" : "bg-indigo-400"}`} />
              )}
              <span><strong>{n.title}</strong><p>{n.body}</p><small>{n.senderName} / {relativeTime(n.timestamp)}</small></span>
            </button>)}
          </div>
          <div className="border-t border-[var(--border)] p-3">
            <button className="btn btn-primary w-full" disabled={enablingPush} onClick={() => void enablePush()}>
              <Bell className="h-3.5 w-3.5" />{enablingPush ? "Registering device..." : (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") ? "Device registered for push" : "Enable push notifications"}
            </button>
            <button
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-black/5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-black/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent("shristi-open-notification-settings"));
              }}
            >
              <Smartphone className="h-3 w-3 text-indigo-400" />
              Mobile & OS Notification Settings
            </button>
            {(typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") && <p className="mt-2 text-center text-[9px] text-[var(--faint)]">Receive instant broadcasts and urgent school alerts on this device.</p>}
          </div>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { state, user, dispatch, announce, setActiveTab, signOutSession, firebaseEmail, firebasePhotoUrl } = useHub();
  const { isInstallable, isInstalled: pwaInstalled, isIOS: pwaIOS, install: triggerPWAInstall } = usePWAInstall();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(false);
  const [profileTab, setProfileTab] = useState<"profile" | "notifications">("profile");
  const [imgError, setImgError] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  const profilePhotoUrl = firebasePhotoUrl || user?.avatarUrl || null;

  useEffect(() => {
    setImgError(false);
  }, [profilePhotoUrl]);

  useEffect(() => {
    const handleOpenNotifSettings = () => {
      setProfileTab("notifications");
      setProfile(true);
    };
    window.addEventListener("shristi-open-notification-settings", handleOpenNotifSettings);
    return () => window.removeEventListener("shristi-open-notification-settings", handleOpenNotifSettings);
  }, []);

  if (!user) return null;

  const syncGooglePhoto = () => {
    if (!firebasePhotoUrl) {
      announce("Sign in with Google to pull your Google account profile picture.", "error");
      return;
    }
    try {
      dispatch({ type: "SET_AVATAR", userId: user.id, url: firebasePhotoUrl });
      setImgError(false);
      announce("Profile picture synced from your Google account.");
    } catch (e) {
      announce(e instanceof Error ? e.message : "Unable to sync Google profile photo.", "error");
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button className="profile-trigger" aria-label="Open profile menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span><span className="profile-name">{user.name}</span><span className="profile-meta"><CircleCheck />Roster verified <span className="role-tag">{user.role === "admin" ? "Admin" : user.role === "council" ? "Council" : user.role === "teacher" ? "Teacher" : user.role === "grade" ? "Class" : "Student"}</span></span></span>
        <span className="profile-initial">
          {profilePhotoUrl && !imgError ? (
            <img
              src={profilePhotoUrl}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="h-full w-full rounded-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            user.name[0]
          )}
        </span>
      </button>
      {open && <div className="nav-popover !w-[280px] page-motion">
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border)]">
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-rose-500 font-display text-sm font-bold text-white ring-2 ring-indigo-500/30">
            {profilePhotoUrl && !imgError ? (
              <img
                src={profilePhotoUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              initials(user.name)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-xs">{user.name}</strong>
            <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{firebaseEmail ?? user.email}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[var(--purple)]"><HouseMark house={user.house} className="h-4 w-4 text-[7px]" />{user.role === "teacher" ? "Teacher / Staff" : user.gradeLabel ?? "Staff"} / {user.house ? houseFullName(state.houses, user.house) : "No House"}</p>
          </div>
        </div>
        <button className="notice-item !items-center !text-[11px]" onClick={() => { setOpen(false); setProfileTab("profile"); setProfile(true); }}><UserRound className="h-3.5 w-3.5 text-[var(--purple)]" />My profile</button>
        <button className="notice-item !items-center !text-[11px]" onClick={() => { setOpen(false); setProfileTab("notifications"); setProfile(true); }}><Bell className="h-3.5 w-3.5 text-[var(--purple)]" />Mobile & OS notifications</button>
        {!pwaInstalled && (isInstallable || pwaIOS) && (
          <button
            className="notice-item !items-center !text-[11px] text-indigo-400 font-medium"
            onClick={() => {
              setOpen(false);
              if (isInstallable) {
                void triggerPWAInstall();
              } else {
                setProfileTab("notifications");
                setProfile(true);
              }
            }}
          >
            {isInstallable ? <Download className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
            {isInstallable ? "Install Mobile App" : "Add to iPhone/iPad Home Screen"}
          </button>
        )}
        {user.role === "admin" && <button className="notice-item !items-center !text-[11px]" onClick={() => { setActiveTab("admin"); setOpen(false); }}><Shield className="h-3.5 w-3.5 text-[var(--purple)]" />Council administration</button>}
        <button className="notice-item !items-center !text-[11px] text-rose-500" onClick={() => void signOutSession()}><LogOut className="h-3.5 w-3.5" />Sign out{firebaseEmail ? " of Google" : ""}</button>
      </div>}
      <Modal
        open={profile}
        onClose={() => setProfile(false)}
        title={profileTab === "profile" ? "My Account Profile" : "Notification Settings"}
        icon={profileTab === "profile" ? <UserRound /> : <Bell />}
        subtitle={profileTab === "profile" ? "Your verified role and identity in the Shristi Academy workspace." : "Configure Mobile (Android/iOS) and OS desktop push notifications, haptic vibration, and alert preferences."}
        wide
      >
        <div className="mb-4 flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setProfileTab("profile")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold transition-all ${
              profileTab === "profile"
                ? "bg-ink-800 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <UserRound className="h-3.5 w-3.5" />
            Profile Details
          </button>
          <button
            type="button"
            onClick={() => setProfileTab("notifications")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold transition-all ${
              profileTab === "notifications"
                ? "bg-ink-800 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            Notification Settings
          </button>
        </div>

        {profileTab === "profile" ? (
          <div className="form-stack">
            {/* Google Account Profile Picture Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-inset)] p-4">
              <div className="flex items-center gap-4 min-w-0">
                <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-rose-500 font-display text-xl font-bold text-white ring-2 ring-indigo-500/40 shadow-md">
                  {profilePhotoUrl && !imgError ? (
                    <img
                      src={profilePhotoUrl}
                      alt={`${user.name} profile picture`}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    initials(user.name)
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-display text-base font-bold text-white truncate">{user.name}</h4>
                    {firebasePhotoUrl && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        <CircleCheck className="h-3 w-3" /> Google Photo Active
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{firebaseEmail ?? user.email}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--purple)]">
                    <HouseMark house={user.house} className="h-4 w-4 text-[8px]" />
                    {user.role === "admin" ? "Administrator" : user.role === "council" ? (user.councilTitle ?? "Council Officer") : user.role === "teacher" ? "Teacher / Staff" : (user.gradeLabel ?? "Student")}
                    {user.house ? ` · ${houseFullName(state.houses, user.house)}` : ""}
                  </p>
                </div>
              </div>
              {firebasePhotoUrl && (
                <button
                  type="button"
                  className="btn btn-secondary !text-[10px] shrink-0"
                  onClick={syncGooglePhoto}
                >
                  <RefreshCw className="h-3 w-3" /> Sync Google Photo
                </button>
              )}
            </div>

            {[
              ["Full name", user.name],
              ["Verified Role", user.role === "admin" ? "Administrator" : user.role === "council" ? "Council Officer" : user.role === "teacher" ? "Teacher / Staff" : user.role === "grade" ? "Class Account" : "Student"],
              ["Institutional email", user.email],
              ...(firebaseEmail && firebaseEmail.toLowerCase() !== user.email.toLowerCase() ? [["Signed-in Google email", firebaseEmail]] : []),
              ["Account ID", user.id.toUpperCase()],
              ["Class / Group", user.role === "teacher" ? "Staff" : (user.gradeLabel ?? "Staff")],
              ["House", user.house ? houseFullName(state.houses, user.house) : "No House"],
              ["Council office", user.councilTitle ?? "—"],
              ["Account status", user.status],
            ].map(([label, value]) => <div key={label} className="integration-row"><span>{label}</span><strong className="break-all text-right text-[11px]">{value}</strong></div>)}
          </div>
        ) : (
          <NotificationSettings onClose={() => setProfile(false)} />
        )}

        <div className="dialog-actions mt-5">
          <button className="btn btn-secondary" onClick={() => setProfile(false)}>Close</button>
        </div>
      </Modal>
    </div>
  );
}

export default function Navbar() {
  const { user, state, activeTab, setActiveTab, signOutSession } = useHub();
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
  const go = (id: string) => { setActiveTab(id); setDrawer(false); };
  return (
    <header className="site-header">
      <div className="site-container nav-inner">
        <button className="brand" onClick={() => go("home")} aria-label={`${state.branding.schoolName} home`}>
          <Crest className="brand-crest rounded-lg" src={state.branding.logoUrl} />
          <span><span className="brand-title">{state.branding.schoolName}</span><span className="brand-subtitle">{state.branding.boardName}</span></span>
        </button>
        <nav ref={navigationRef} className="primary-nav" aria-label="Main navigation">
          {links.map((link) => (
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
          <NotificationBell />
          <UserMenu />
          <button className="signout" onClick={() => void signOutSession()}>Sign<br />Out</button>
          <button className="nav-icon mobile-menu-trigger" aria-label="Open navigation menu" aria-expanded={drawer} onClick={() => setDrawer(true)}><Menu /></button>
        </div>
      </div>
      <Modal open={drawer} onClose={() => setDrawer(false)} title={state.branding.schoolName} subtitle={`${state.branding.boardName} / ${state.branding.session}`} icon={state.branding.logoUrl ? <Crest className="h-5 w-5" src={state.branding.logoUrl} /> : undefined}>
        <nav className="grid grid-cols-2 gap-2" aria-label="Mobile navigation">{links.map((link) => <button key={link.id} className={`btn min-h-11 justify-start ${active === link.id ? "btn-primary" : "btn-secondary"}`} onClick={() => go(link.id)}>{link.label}</button>)}</nav>
        <div className="dialog-actions"><button className="btn btn-danger" onClick={() => void signOutSession()}><LogOut />Sign out</button></div>
      </Modal>
    </header>
  );
}
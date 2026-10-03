import { useState, useEffect } from "react";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Send,
  Sparkles,
  Layers,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  requestNotificationPermission,
  enableFirebasePush,
  triggerOSNotification,
  type NotificationPreferences,
} from "../lib/firebase-client";
import { useHub } from "../store/hub";

interface NotificationSettingsProps {
  onClose?: () => void;
}

export default function NotificationSettings({ onClose: _onClose }: NotificationSettingsProps) {
  const { user, announce, notify } = useHub();

  const [prefs, setPrefs] = useState<NotificationPreferences>(() => getNotificationPreferences());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission;
  });
  const [swActive, setSwActive] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [testingOS, setTestingOS] = useState(false);
  const [testingInApp, setTestingInApp] = useState(false);

  // Check service worker state
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        setSwActive(Boolean(reg?.active));
      }).catch(() => setSwActive(false));
    }
  }, []);

  // Listen for changes from other tabs or components
  useEffect(() => {
    const handlePrefsChanged = (e: Event) => {
      const customEvent = e as CustomEvent<NotificationPreferences>;
      if (customEvent.detail) {
        setPrefs(customEvent.detail);
      }
    };
    window.addEventListener("shristi-notification-prefs-changed", handlePrefsChanged);
    return () => window.removeEventListener("shristi-notification-prefs-changed", handlePrefsChanged);
  }, []);

  const refreshPermissionState = () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  };

  const handleToggleOS = (checked: boolean) => {
    const updated: NotificationPreferences = { ...prefs, osNotifications: checked };
    setPrefs(updated);
    saveNotificationPreferences(updated);
    announce(checked ? "OS desktop notifications enabled." : "OS desktop notifications muted.");
  };

  const handleToggleInApp = (checked: boolean) => {
    const updated: NotificationPreferences = { ...prefs, inAppNotifications: checked };
    setPrefs(updated);
    saveNotificationPreferences(updated);
    announce(checked ? "In-app toast alerts enabled." : "In-app toast alerts muted.");
  };

  const handleRequestOrRefreshPermission = async () => {
    setRegistering(true);
    try {
      const res = await requestNotificationPermission();
      setPermission(res);

      if (res === "granted" && user) {
        await enableFirebasePush(user);
        announce("Desktop push notifications authorized and registered.");
      } else if (res === "denied") {
        announce("Browser permission is blocked. Please allow notifications in site settings.", "error");
      } else {
        announce("Notification permission was not granted.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      announce(msg, "error");
    } finally {
      refreshPermissionState();
      setRegistering(false);
    }
  };

  const handleTestOSNotification = async () => {
    setTestingOS(true);
    try {
      if (permission !== "granted") {
        const res = await requestNotificationPermission();
        setPermission(res);
        if (res !== "granted") {
          announce("Please grant browser notification permission first.", "error");
          setTestingOS(false);
          return;
        }
      }

      await triggerOSNotification({
        title: "Shristi Council Alert",
        body: "Real OS-level desktop notification test verified successfully!",
        actionTab: "dashboard",
        urgent: true,
      });

      announce("Test desktop alert dispatched to your operating system.");
    } catch (err) {
      announce(err instanceof Error ? err.message : "Failed to trigger desktop notification.", "error");
    } finally {
      setTimeout(() => setTestingOS(false), 800);
    }
  };

  const handleTestInAppToast = () => {
    setTestingInApp(true);
    if (!prefs.inAppNotifications) {
      announce("In-app notifications are currently toggled off below.", "error");
      setTestingInApp(false);
      return;
    }

    notify({
      title: "In-App Toast Preview",
      body: "This is a real-time floating in-app toast alert from the Shristi Council Hub.",
      urgent: false,
      audience: { kind: "all" },
      senderName: user?.name ?? "System",
      senderRole: user?.role ?? "admin",
      actionTab: "dashboard",
    });

    announce("In-app notification toast triggered.");
    setTimeout(() => setTestingInApp(false), 800);
  };

  const getPermissionBadge = () => {
    if (permission === "granted") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Allowed & Active
        </span>
      );
    }
    if (permission === "denied") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Blocked by Browser
        </span>
      );
    }
    if (permission === "unsupported") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/15 px-2.5 py-1 text-xs font-semibold text-slate-500">
          Unsupported Environment
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <HelpCircle className="h-3.5 w-3.5" />
        Default (Not Requested)
      </span>
    );
  };

  return (
    <div className="space-y-5 text-slate-900 dark:text-white">
      {/* 1. Subscription & Permission Status Card */}
      <div className="rounded-xl border border-[var(--border)] bg-slate-50/70 p-4 dark:bg-ink-850/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--purple)]/10 text-[var(--purple)]">
              <Bell className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Subscription Status</p>
              <h4 className="text-sm font-semibold">Web Push & System Alerts</h4>
            </div>
          </div>
          <div>{getPermissionBadge()}</div>
        </div>

        <div className="mt-3.5 grid grid-cols-1 gap-2 border-t border-[var(--border)] pt-3 text-xs sm:grid-cols-3">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Monitor className="h-3.5 w-3.5 text-indigo-400" />
            <span>OS Notification: {prefs.osNotifications ? "Enabled" : "Disabled"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Layers className="h-3.5 w-3.5 text-purple-400" />
            <span>In-App Toast: {prefs.inAppNotifications ? "Enabled" : "Disabled"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Service Worker: {swActive ? "Active" : "Standby"}</span>
          </div>
        </div>
      </div>

      {/* 2. Permission Recovery or Re-trigger Section */}
      {permission === "denied" && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div className="flex-1 text-xs">
              <h5 className="font-bold text-rose-600 dark:text-rose-400">
                Browser Permission Denied / Blocked
              </h5>
              <p className="mt-1 leading-relaxed text-rose-700/90 dark:text-rose-200/90">
                You or your browser previously denied notifications for this site. Modern browsers intentionally suppress repeat permission popups once denied.
              </p>
              <div className="mt-2.5 rounded-lg bg-white/70 p-2.5 font-mono text-[11px] text-slate-800 dark:bg-black/30 dark:text-rose-100">
                <p className="font-sans font-semibold text-slate-900 dark:text-white">How to restore notifications:</p>
                <ol className="mt-1.5 list-inside list-decimal space-y-1 font-sans">
                  <li>Click the lock or site settings icon (🔒 / ⚙️) next to the URL in your browser address bar.</li>
                  <li>Find <strong>Notifications</strong> and change it from <em>Block</em> to <strong>Allow</strong>.</li>
                  <li>Click <strong>&ldquo;Re-check Permission&rdquo;</strong> below.</li>
                </ol>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleRequestOrRefreshPermission()}
                  disabled={registering}
                  className="btn btn-primary !h-8 !px-3 !text-xs !bg-rose-600 hover:!bg-rose-500"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${registering ? "animate-spin" : ""}`} />
                  {registering ? "Checking..." : "Re-check & Request Permission"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {permission === "default" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="flex-1 text-xs">
              <h5 className="font-bold text-amber-700 dark:text-amber-300">
                Browser Push Permission Not Yet Enabled
              </h5>
              <p className="mt-1 leading-relaxed text-amber-800/90 dark:text-amber-200/90">
                Grant permission to receive instant operating system alerts for emergency school announcements, poll updates, and house point achievements.
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => void handleRequestOrRefreshPermission()}
                  disabled={registering}
                  className="btn btn-primary !h-8 !px-3 !text-xs"
                >
                  <Bell className="h-3.5 w-3.5" />
                  {registering ? "Requesting..." : "Enable Browser Notifications"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {permission === "granted" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Browser push permission is verified and active.</span>
          </div>
          <button
            type="button"
            onClick={() => void handleRequestOrRefreshPermission()}
            disabled={registering}
            className="btn btn-secondary !h-7 !px-2.5 !text-[11px]"
          >
            <RefreshCw className={`h-3 w-3 ${registering ? "animate-spin" : ""}`} />
            {registering ? "Syncing..." : "Re-sync Push Token"}
          </button>
        </div>
      )}

      {/* 3. Separate Toggles for OS Notifications & In-App Notifications */}
      <div className="rounded-xl border border-[var(--border)] p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Notification Delivery Preferences</h4>
        
        <div className="mt-3 divide-y divide-[var(--border)]">
          {/* OS-Level Notifications Toggle */}
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-[var(--purple)]" />
                <span className="text-xs font-semibold">OS Desktop & Web Push Notifications</span>
                {prefs.osNotifications ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">ON</span>
                ) : (
                  <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">MUTED</span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                Fires genuine operating system desktop alerts and banners outside the browser window (even when this tab is focused or minimized).
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={prefs.osNotifications}
                onChange={(e) => handleToggleOS(e.target.checked)}
                className="peer sr-only"
                aria-label="Toggle OS Desktop Notifications"
              />
              <div className="h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-[var(--purple)] peer-checked:after:translate-x-full peer-focus:outline-none dark:bg-slate-700" />
            </label>
          </div>

          {/* In-App Notifications Toggle */}
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-semibold">In-App Floating Toast Alerts</span>
                {prefs.inAppNotifications ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">ON</span>
                ) : (
                  <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">MUTED</span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                Displays floating popover banners in the bottom-right corner while navigating within the student council hub.
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={prefs.inAppNotifications}
                onChange={(e) => handleToggleInApp(e.target.checked)}
                className="peer sr-only"
                aria-label="Toggle In-App Floating Toast Alerts"
              />
              <div className="h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-[var(--purple)] peer-checked:after:translate-x-full peer-focus:outline-none dark:bg-slate-700" />
            </label>
          </div>
        </div>
      </div>

      {/* 4. Interactive Test Buttons */}
      <div className="rounded-xl border border-[var(--border)] bg-slate-50/50 p-4 dark:bg-ink-850/40">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Test Alert Verification</h4>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Verify that your device and sound system correctly output notifications.
        </p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => void handleTestOSNotification()}
            disabled={testingOS || permission === "denied" || !prefs.osNotifications}
            className="btn btn-primary !h-8 !px-3 !text-xs"
            title={
              !prefs.osNotifications
                ? "Enable OS notifications toggle above to test"
                : permission === "denied"
                ? "Allow notifications in browser settings first"
                : "Trigger a real desktop notification"
            }
          >
            <Send className="h-3.5 w-3.5" />
            {testingOS ? "Dispatched..." : "Test OS Desktop Notification"}
          </button>

          <button
            type="button"
            onClick={handleTestInAppToast}
            disabled={testingInApp || !prefs.inAppNotifications}
            className="btn btn-secondary !h-8 !px-3 !text-xs"
            title={!prefs.inAppNotifications ? "Enable in-app notifications toggle above to test" : "Show an in-app toast card"}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {testingInApp ? "Showing..." : "Test In-App Toast"}
          </button>
        </div>
      </div>
    </div>
  );
}

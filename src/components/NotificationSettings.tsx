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
  Smartphone,
  Vibrate,
  Download,
  Share2,
  PlusSquare,
} from "lucide-react";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  requestNotificationPermission,
  enableFirebasePush,
  triggerOSNotification,
  getMobileDeviceInfo,
  triggerMobileHapticTest,
  type NotificationPreferences,
  type MobileDeviceInfo,
} from "../lib/firebase-client";
import { useHub } from "../store/hub";
import { usePWAInstall } from "../hooks/usePWAInstall";

interface NotificationSettingsProps {
  onClose?: () => void;
}

export default function NotificationSettings({ onClose: _onClose }: NotificationSettingsProps) {
  const { user, announce, notify } = useHub();
  const { isInstallable, isInstalled: pwaInstalled, isAndroid: pwaAndroid, install: triggerPWAInstall } = usePWAInstall();

  const [prefs, setPrefs] = useState<NotificationPreferences>(() => getNotificationPreferences());
  const [deviceInfo, setDeviceInfo] = useState<MobileDeviceInfo>(() => getMobileDeviceInfo());
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
  const [testingHaptic, setTestingHaptic] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<{
    type: "os" | "in-app" | "haptic";
    time: string;
    latencyMs?: number;
    message: string;
  } | null>(null);

  // Check service worker state and device info
  useEffect(() => {
    setDeviceInfo(getMobileDeviceInfo());
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
    announce(checked ? "OS & Mobile push notifications enabled." : "OS & Mobile push notifications muted.");
  };

  const handleToggleHaptics = (checked: boolean) => {
    const updated: NotificationPreferences = { ...prefs, mobileHaptics: checked };
    setPrefs(updated);
    saveNotificationPreferences(updated);
    announce(checked ? "Mobile vibration feedback enabled." : "Mobile vibration feedback muted.");
    if (checked) {
      triggerMobileHapticTest([100, 50, 100]);
    }
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
        announce("Mobile & Desktop push notifications authorized and registered.");
      } else if (res === "denied") {
        announce("Browser permission is blocked. Please allow notifications in site/browser settings.", "error");
      } else if (res === "unsupported") {
        announce("Web Push is unavailable in this browser view. On iOS, add to Home Screen first.", "error");
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
    const start = performance.now();
    try {
      if (permission !== "granted") {
        const res = await requestNotificationPermission();
        setPermission(res);
        if (res !== "granted") {
          announce(
            deviceInfo.isIOS && !deviceInfo.isStandalone
              ? "On iOS, add this app to your Home Screen first to enable push notifications."
              : "Please grant browser notification permission first.",
            "error"
          );
          setTestingOS(false);
          return;
        }
      }

      await triggerOSNotification({
        title: "Shristi Council Alert",
        body: deviceInfo.isMobile
          ? "Mobile push alert & vibration verified successfully on your phone!"
          : "Real OS-level desktop notification test verified successfully!",
        actionTab: "dashboard",
        urgent: true,
      });

      const elapsed = Math.round(performance.now() - start);
      setLastTestResult({
        type: "os",
        time: new Date().toLocaleTimeString(),
        latencyMs: Math.max(1, elapsed),
        message: deviceInfo.isMobile
          ? "Mobile system notification and haptics dispatched to your device."
          : "Desktop OS notification alert dispatched to your window manager.",
      });

      announce(
        deviceInfo.isMobile
          ? "Mobile push alert dispatched to phone notification shade."
          : "Test desktop alert dispatched to your operating system."
      );
    } catch (err) {
      announce(err instanceof Error ? err.message : "Failed to trigger push notification.", "error");
    } finally {
      setTimeout(() => setTestingOS(false), 400);
    }
  };

  const handleTestHaptic = () => {
    setTestingHaptic(true);
    const vibrated = triggerMobileHapticTest([200, 100, 200, 100, 200]);
    setLastTestResult({
      type: "haptic",
      time: new Date().toLocaleTimeString(),
      message: vibrated
        ? "Mobile haptic vibration motor pulsed (5-pulse rhythm)."
        : "Vibration API called (active on physical Android/mobile devices).",
    });
    announce(vibrated ? "Haptic vibration pulse triggered." : "Mobile vibration pattern simulated.");
    setTimeout(() => setTestingHaptic(false), 300);
  };

  const handleTestInAppToast = () => {
    setTestingInApp(true);
    const start = performance.now();
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

    const elapsed = Math.round(performance.now() - start);
    setLastTestResult({
      type: "in-app",
      time: new Date().toLocaleTimeString(),
      latencyMs: Math.max(1, elapsed),
      message: "In-app toast alert displayed on screen.",
    });

    announce("In-app notification toast triggered.");
    setTimeout(() => setTestingInApp(false), 400);
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
          Blocked in Browser
        </span>
      );
    }
    if (permission === "unsupported") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/15 px-2.5 py-1 text-xs font-semibold text-slate-500">
          {deviceInfo.isIOS && !deviceInfo.isStandalone ? "Add to Home Screen Required" : "Unsupported View"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <HelpCircle className="h-3.5 w-3.5" />
        Default (Not Enabled)
      </span>
    );
  };

  return (
    <div className="space-y-5 text-slate-900 dark:text-white">
      {/* 1. Device & Subscription Status Card */}
      <div className="rounded-xl border border-[var(--border)] bg-slate-50/70 p-4 dark:bg-ink-850/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--purple)]/15 text-[var(--purple)]">
              {deviceInfo.isMobile ? <Smartphone className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Device Platform</p>
                <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-500">
                  {deviceInfo.deviceLabel}
                </span>
              </div>
              <h4 className="text-sm font-semibold">
                {deviceInfo.isIOS
                  ? "Apple iPhone / iPad (iOS)"
                  : deviceInfo.isAndroid
                  ? "Android Smartphone / Tablet"
                  : "Desktop Operating System"}
              </h4>
            </div>
          </div>
          <div>{getPermissionBadge()}</div>
        </div>

        <div className="mt-3.5 grid grid-cols-1 gap-2 border-t border-[var(--border)] pt-3 text-xs sm:grid-cols-3">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            {deviceInfo.isMobile ? <Smartphone className="h-3.5 w-3.5 text-indigo-400" /> : <Monitor className="h-3.5 w-3.5 text-indigo-400" />}
            <span>OS & Push: {prefs.osNotifications ? "Enabled" : "Muted"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Vibrate className="h-3.5 w-3.5 text-purple-400" />
            <span>Mobile Haptics: {prefs.mobileHaptics !== false ? "Active" : "Off"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Service Worker: {swActive ? "Active" : "Standby"}</span>
          </div>
        </div>
      </div>

      {/* 2. Apple iOS Specific Guide & Home Screen Support */}
      {deviceInfo.isIOS && !deviceInfo.isStandalone && !pwaInstalled && (
        <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-500/20 text-indigo-400">
              <Share2 className="h-4 w-4" />
            </span>
            <div className="flex-1 text-xs">
              <div className="flex items-center gap-2">
                <h5 className="font-bold text-indigo-600 dark:text-indigo-300">
                  Apple iOS Web Push Setup (iPhone & iPad)
                </h5>
                <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-400 uppercase">
                  iOS 16.4+
                </span>
              </div>
              <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-300">
                Apple requires web apps to be added to your Home Screen before Safari allows lock screen push notifications, app badges, and sounds.
              </p>
              
              <div className="mt-3 rounded-lg border border-indigo-500/20 bg-white/70 p-3 dark:bg-black/30">
                <p className="font-semibold text-slate-900 dark:text-white">Follow these simple steps:</p>
                <ol className="mt-2 space-y-2 text-[11px] text-slate-700 dark:text-slate-200">
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-bold text-indigo-400">1</span>
                    <span>Tap Safari&apos;s <strong>Share</strong> button <Share2 className="inline h-3.5 w-3.5 text-indigo-400" /> in the bottom toolbar.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-bold text-indigo-400">2</span>
                    <span>Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare className="inline h-3.5 w-3.5 text-indigo-400" />.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-bold text-indigo-400">3</span>
                    <span>Tap <strong>Add</strong> in the top-right corner to place the <strong>Shristi Hub</strong> icon on your home screen.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-bold text-indigo-400">4</span>
                    <span>Open the app from your home screen and tap <strong>&ldquo;Enable Mobile Notifications&rdquo;</strong>.</span>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Android Specific Installation & Direct Push Info */}
      {(deviceInfo.isAndroid || pwaAndroid) && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <Smartphone className="h-4 w-4" />
              </span>
              <div className="text-xs">
                <h5 className="font-bold text-emerald-600 dark:text-emerald-400">
                  Android Native Notification Shade & Push Active
                </h5>
                <p className="mt-1 leading-relaxed text-emerald-700/90 dark:text-emerald-200/90">
                  Android supports direct system push alerts, lock screen banners, tactile vibration haptics, and custom app badge icons.
                </p>
              </div>
            </div>
            {isInstallable && (
              <button
                type="button"
                onClick={() => void triggerPWAInstall()}
                className="btn btn-primary !h-8 shrink-0 !px-3 !text-xs !bg-emerald-600 hover:!bg-emerald-500"
              >
                <Download className="h-3.5 w-3.5" />
                Install on Phone
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Permission Status Actions */}
      {permission === "denied" && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div className="flex-1 text-xs">
              <h5 className="font-bold text-rose-600 dark:text-rose-400">
                Browser Permission Denied / Blocked
              </h5>
              <p className="mt-1 leading-relaxed text-rose-700/90 dark:text-rose-200/90">
                Notifications were denied on this device. Browsers suppress repeat dialogs once blocked.
              </p>
              <div className="mt-2.5 rounded-lg bg-white/70 p-2.5 font-mono text-[11px] text-slate-800 dark:bg-black/30 dark:text-rose-100">
                <p className="font-sans font-semibold text-slate-900 dark:text-white">How to restore on mobile/desktop:</p>
                <ol className="mt-1.5 list-inside list-decimal space-y-1 font-sans">
                  <li>Tap the site settings / lock icon (🔒 / ⚙️) next to the URL bar.</li>
                  <li>Find <strong>Notifications</strong> and change it to <strong>Allow</strong>.</li>
                  <li>Tap <strong>&ldquo;Re-check Permission&rdquo;</strong> below.</li>
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
                Push Permission Not Yet Enabled
              </h5>
              <p className="mt-1 leading-relaxed text-amber-800/90 dark:text-amber-200/90">
                Authorize notifications to receive instant mobile phone banners, vibration alerts, and urgent student council broadcasts.
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => void handleRequestOrRefreshPermission()}
                  disabled={registering}
                  className="btn btn-primary !h-8 !px-3 !text-xs"
                >
                  <Bell className="h-3.5 w-3.5" />
                  {registering ? "Requesting..." : "Enable Mobile & OS Notifications"}
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
            <span>Push notifications are authorized and connected to your account.</span>
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

      {/* 5. Notification Delivery Preferences Toggles */}
      <div className="rounded-xl border border-[var(--border)] p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Delivery Preferences</h4>
        
        <div className="mt-3 divide-y divide-[var(--border)]">
          {/* OS & Mobile Push Notifications Toggle */}
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-[var(--purple)]" />
                <span className="text-xs font-semibold">OS & Mobile Push Notifications</span>
                {prefs.osNotifications ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">ON</span>
                ) : (
                  <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">MUTED</span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                Fires real lock screen alerts, notification shade banners, and desktop alerts outside the browser.
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={prefs.osNotifications}
                onChange={(e) => handleToggleOS(e.target.checked)}
                className="peer sr-only"
                aria-label="Toggle OS & Mobile Notifications"
              />
              <div className="h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-[var(--purple)] peer-checked:after:translate-x-full peer-focus:outline-none dark:bg-slate-700" />
            </label>
          </div>

          {/* Mobile Haptic Vibration Toggle */}
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Vibrate className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-semibold">Mobile Haptic Feedback / Vibration</span>
                {prefs.mobileHaptics !== false ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">ON</span>
                ) : (
                  <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">OFF</span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                Pulses phone vibration motor on incoming notifications (urgent announcements trigger strong rhythmic pulses).
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={prefs.mobileHaptics !== false}
                onChange={(e) => handleToggleHaptics(e.target.checked)}
                className="peer sr-only"
                aria-label="Toggle Mobile Haptics"
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
                Displays floating popover banners inside the hub while navigating between tabs.
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

      {/* 6. Interactive Diagnostics & Test Buttons */}
      <div className="rounded-xl border border-[var(--border)] bg-slate-50/50 p-4 dark:bg-ink-850/40">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Test Alert Verification</h4>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Verify delivery across your operating system, phone notification shade, sound, and vibration motor.
        </p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => void handleTestOSNotification()}
            disabled={testingOS || permission === "denied" || !prefs.osNotifications}
            className="btn btn-primary !h-8 !px-3 !text-xs"
            title={
              !prefs.osNotifications
                ? "Enable notifications toggle above to test"
                : permission === "denied"
                ? "Allow notifications in browser settings first"
                : "Trigger real system notification"
            }
          >
            <Send className="h-3.5 w-3.5" />
            {testingOS ? "Dispatched..." : deviceInfo.isMobile ? "Test Mobile Push & Sound" : "Test OS Desktop Notification"}
          </button>

          <button
            type="button"
            onClick={handleTestHaptic}
            disabled={testingHaptic}
            className="btn btn-secondary !h-8 !px-3 !text-xs"
            title="Test phone vibration motor"
          >
            <Vibrate className={`h-3.5 w-3.5 ${testingHaptic ? "animate-pulse text-purple-400" : ""}`} />
            {testingHaptic ? "Vibrating..." : "Test Mobile Vibration"}
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

        {lastTestResult && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span>{lastTestResult.message} ({lastTestResult.time})</span>
            </div>
            {lastTestResult.latencyMs !== undefined && (
              <span className="font-mono text-[10px] font-semibold text-emerald-500">
                Latency: {lastTestResult.latencyMs}ms
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

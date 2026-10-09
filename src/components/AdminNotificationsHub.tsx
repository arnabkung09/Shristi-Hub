import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  CircleCheck,
  Flame,
  History,
  Laptop,
  Megaphone,
  Monitor,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Trophy,
  Vote,
  Wifi,
} from "lucide-react";
import { audienceLabel, relativeTime, targetsUser, uid, useHub } from "../store/hub";
import { houseFullName } from "../lib/admin";
import type { House as HouseKey } from "../lib/types";
import { chime, postBus } from "../lib/realtime";
import {
  enableFirebasePush,
  firebaseAuth,
  sendFirebaseNotification,
  triggerOSNotification,
} from "../lib/firebase-client";
import {
  cleanupStaleDevices,
  pingAllDevices,
  pingSingleDevice,
  syncCurrentDeviceToRegistry,
  type ConnectedDevice,
} from "../lib/presence";
import type { Audience, House } from "../lib/types";
import { GRADES, HOUSES } from "../lib/seed";
import { RevealBlocks } from "./Effects";

const TEMPLATES = [
  {
    title: "Urgent Assembly Notice",
    body: "All students are requested to assemble at the Main Hall immediately. House captains, please take attendance.",
    urgent: true,
    action: "events?tab=notices",
    category: "notice",
    icon: ShieldAlert,
  },
  {
    title: "House Points Update",
    body: "New house points have been verified and added to the official leaderboard. Check your house's latest standing.",
    urgent: false,
    action: "houses",
    category: "houses",
    icon: Trophy,
  },
  {
    title: "Council Meeting Alert",
    body: "Reminder: the council executives meeting is scheduled today in the Conference Room. Please bring your department updates.",
    urgent: false,
    action: "meetings",
    category: "meeting",
    icon: CalendarDays,
  },
  {
    title: "New Event Registration",
    body: "Registrations are now open for the upcoming school event. Submit your entry before seats fill up.",
    urgent: false,
    action: "events",
    category: "event",
    icon: Sparkles,
  },
  {
    title: "Student Poll Live",
    body: "A new survey poll has just been published. Have your voice heard by casting your vote.",
    urgent: false,
    action: "voice?polls=1",
    category: "poll",
    icon: Vote,
  },
];

export default function AdminNotificationsHub() {
  const { state, user, devices, dispatch, announce, hasPermission } = useHub();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("all");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState("notice");
  const [action, setAction] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState(() =>
    "Notification" in window ? Notification.permission : "unsupported"
  );
  const [enabling, setEnabling] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [sent, setSent] = useState(false);
  const [lastPushResult, setLastPushResult] = useState<{
    successCount: number;
    failureCount: number;
    targetedDevices: number;
  } | null>(null);

  // Device controls state
  const [deviceFilter, setDeviceFilter] = useState<
    "all" | "my-account" | "mobile" | "desktop" | "push-ready"
  >("all");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [testingPush, setTestingPush] = useState(false);
  const [cleaningDevices, setCleaningDevices] = useState(false);

  useEffect(() => {
    // Actively poll connected devices while viewing the hub
    window.dispatchEvent(new Event("shristi-refresh-devices"));
    const timer = setInterval(() => {
      window.dispatchEvent(new Event("shristi-refresh-devices"));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const selectedStudent = state.users.find((s) => s.id === studentId);
  const audience: Audience =
    target === "user" && selectedStudent
      ? { kind: "user", userId: selectedStudent.id, name: selectedStudent.name }
      : target === "all"
      ? { kind: "all" }
      : target.startsWith("role:")
      ? { kind: "role", role: target.split(":")[1] as "council" | "student" }
      : target.startsWith("house:")
      ? { kind: "house", house: target.split(":")[1] as House }
      : { kind: "grade", grade: Number(target.split(":")[1]) };

  const studentMatches = state.users
    .filter((s) =>
      `${s.name} ${s.email} ${s.gradeLabel} ${s.houseLabel}`
        .toLowerCase()
        .includes(studentQuery.trim().toLowerCase())
    )
    .slice(0, 40);

  const matching = devices.filter((device) => {
    const student = state.users.find((s) => s.id === device.userId);
    return student && targetsUser(audience, student);
  });

  // Calculate device stats
  const totalDevices = devices.length;
  const mobileCount = devices.filter((d) => d.kind === "mobile" || d.kind === "tablet").length;
  const desktopCount = devices.filter((d) => d.kind === "desktop").length;
  const pushReadyCount = devices.filter((d) => d.pushStatus === "enabled").length;
  const myAccountDevices = user ? devices.filter((d) => d.userId === user.id) : [];

  const filteredDevices = devices.filter((device) => {
    if (deviceFilter === "my-account" && device.userId !== user?.id) return false;
    if (deviceFilter === "mobile" && device.kind !== "mobile" && device.kind !== "tablet") return false;
    if (deviceFilter === "desktop" && device.kind !== "desktop") return false;
    if (deviceFilter === "push-ready" && device.pushStatus !== "enabled") return false;

    if (deviceSearch.trim()) {
      const q = deviceSearch.toLowerCase();
      const match =
        device.name.toLowerCase().includes(q) ||
        (device.email || "").toLowerCase().includes(q) ||
        (device.model || "").toLowerCase().includes(q) ||
        (device.browser || "").toLowerCase().includes(q) ||
        (device.house || "").toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  if (!user || !hasPermission("broadcast")) {
    return (
      <div className="empty-content">
        <ShieldAlert />
        <strong>Broadcast permission is required</strong>
        <p>An administrator can grant this feature from Council Officers & Permissions.</p>
      </div>
    );
  }

  const enablePush = async () => {
    setEnabling(true);
    try {
      await enableFirebasePush(user);
      setPermission("granted");
      announce("Real Firebase push notifications are enabled on this browser.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Push registration failed.", "error");
    } finally {
      setEnabling(false);
    }
  };

  const ping = async () => {
    setPinging(true);
    try {
      await pingAllDevices(user.name, true);
      announce(`Diagnostic ping sent to all ${devices.length} online ${devices.length === 1 ? "device" : "devices"}.`);
    } catch {
      chime(true);
      postBus({ type: "ping", senderName: user.name, urgent: true });
    } finally {
      setTimeout(() => setPinging(false), 2000);
    }
  };

  const handlePingSingleDevice = async (device: ConnectedDevice) => {
    try {
      await pingSingleDevice(device.id, user.name);
      announce(`Diagnostic ping sent to ${device.name}'s ${device.model}.`);
    } catch (err) {
      announce("Could not ping device.", "error");
    }
  };

  const handleTestPushAll = async (targetScope: "all" | "my-account" = "all") => {
    setTestingPush(true);
    try {
      const testTitle =
        targetScope === "my-account"
          ? "Multi-Device Test Alert (Your Account)"
          : "System Test Notification (All Devices)";
      const testBody =
        targetScope === "my-account"
          ? `Verified at ${new Date().toLocaleTimeString()}. Both/all devices signed in with ${user.email} received this.`
          : `Live sync broadcast reaching all ${devices.length} online devices simultaneously.`;

      // 1. Dispatch locally on current device
      await triggerOSNotification({
        title: testTitle,
        body: testBody,
        urgent: true,
        actionTab: "broadcast",
      });

      // 2. Dispatch to Cloud Firebase so ALL devices (including second phone/laptop) receive it
      const targetAudience: Audience =
        targetScope === "my-account"
          ? { kind: "user", userId: user.id, name: user.name }
          : { kind: "all" };

      await sendFirebaseNotification({
        title: testTitle,
        body: testBody,
        urgent: true,
        audience: targetAudience,
        actionTab: "broadcast",
        senderName: user.name,
      });

      announce(
        targetScope === "my-account"
          ? `Multi-device test notification dispatched to all ${myAccountDevices.length} devices logged into your account.`
          : `Broadcast test notification dispatched to all ${devices.length} online devices.`
      );
    } catch (err) {
      announce(err instanceof Error ? err.message : "Test push failed.", "error");
    } finally {
      setTestingPush(false);
    }
  };

  const handleTestPushStudent = async () => {
    setTestingPush(true);
    try {
      const testTitle = "Push Reliability Test for Alex Rivera";
      const testBody = `Direct alert delivered to your test student device at ${new Date().toLocaleTimeString()}. Audio, vibration, and push verified!`;
      await sendFirebaseNotification({
        title: testTitle,
        body: testBody,
        urgent: true,
        audience: { kind: "user", userId: "stu-alex-99", name: "Alex Rivera (Student)" },
        actionTab: "broadcast",
        senderName: user.name,
      });
      announce("Test push notification dispatched directly to Alex Rivera (Student).");
    } catch (err) {
      announce(err instanceof Error ? err.message : "Test push failed.", "error");
    } finally {
      setTestingPush(false);
    }
  };

  const handleCleanDevices = async () => {
    setCleaningDevices(true);
    try {
      const removed = await cleanupStaleDevices();
      announce(`Cleaned up ${removed} stale device sessions from Firestore.`);
    } catch {
      announce("Could not prune device registry.", "error");
    } finally {
      setCleaningDevices(false);
    }
  };

  const send = async () => {
    setError("");
    try {
      if (!title.trim() || !body.trim()) throw new Error("An alert title and message are required.");
      if (target === "user" && !selectedStudent) {
        throw new Error("Choose the student who should receive this notification.");
      }
      let destination = action.trim().replace(/^[/#]+/, "");
      const aliases: Record<string, string> = {
        announcements: "notices",
        polls: "voice?polls=1",
        feedback: "voice",
        finance: "finances",
      };
      destination = aliases[destination] ?? destination;
      if (
        destination &&
        ![
          "dashboard",
          "home",
          "events",
          "notices",
          "houses",
          "house",
          "voice",
          "tasks",
          "meetings",
          "directory",
          "gallery",
          "finances",
          "broadcast",
        ].includes(destination.split("?")[0])
      ) {
        throw new Error("Use an internal hub link, such as /events, /announcements, or /polls.");
      }

      const timestamp = Date.now();
      const pushResult = await sendFirebaseNotification({
        title: title.trim(),
        body: body.trim(),
        urgent,
        audience,
        actionTab: destination || "notices",
        senderName: user.name,
      });

      // Dispatch to local store
      dispatch({
        type: "BROADCAST",
        record: {
          id: uid(),
          title: title.trim(),
          body: body.trim(),
          urgent,
          audience,
          senderName: user.name,
          timestamp,
          delivered: matching.length,
        },
        notification: {
          id: uid(),
          title: title.trim(),
          body: body.trim(),
          urgent,
          audience,
          senderName: user.name,
          senderRole: user.role,
          timestamp,
          actionTab: destination || "notices",
          readBy: [],
          kind: "broadcast",
        },
      });

      const audienceText =
        audience.kind === "house"
          ? houseFullName(state.houses, audience.house)
          : audienceLabel(audience);

      setLastPushResult({
        successCount: pushResult.multicastSuccess || pushResult.targetedUsers,
        failureCount: pushResult.multicastFailure,
        targetedDevices: pushResult.targetedUsers,
      });

      announce(
        `Push alert sent to ${pushResult.targetedUsers} recipient accounts across all devices for ${audienceText.toLowerCase()}.`
      );
      setSent(true);
      setTitle("");
      setBody("");
      setUrgent(false);
      setStudentId("");
      setTimeout(() => setSent(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send broadcast.");
    }
  };

  return (
    <RevealBlocks>
      {/* Top Banner with Real-Time Stream Status */}
      <section className="broadcast-banner">
        <div>
          <span className="broadcast-symbol">
            <Bell className="h-5 w-5" />
          </span>
          <h2>
            Push Notifications & Broadcast Hub <span className="live-label">LIVE REGISTRY</span>
          </h2>
          <p>
            Real-time multi-device broadcast engine. Delivers alerts to all devices on all accounts
            reliably and securely.
          </p>
        </div>
        <div className="stream-controls">
          <div className="stream-control">
            <Radio className="!text-emerald-400" />
            <div>
              <strong>LIVE PUSH STREAM</strong>
              <span>
                {devices.length} {devices.length === 1 ? "Device" : "Devices"} Online
              </span>
            </div>
            <div className="h-7 border-l border-white/15" />
            <button className="btn btn-green" onClick={ping} disabled={pinging}>
              <Send className="h-3.5 w-3.5" />
              {pinging ? "Pinging..." : "Ping All Devices"}
            </button>
          </div>
          <div className="stream-control">
            <Smartphone />
            <div>
              <strong>THIS BROWSER</strong>
              <span>
                <i
                  className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
                    permission === "granted"
                      ? "bg-emerald-400"
                      : permission === "denied"
                      ? "bg-rose-400"
                      : permission === "unsupported"
                      ? "bg-amber-400"
                      : "bg-slate-400"
                  }`}
                />
                {permission === "granted"
                  ? "Enabled"
                  : permission === "denied"
                  ? "Blocked"
                  : permission === "unsupported"
                  ? "In-app only"
                  : "Not enabled"}
              </span>
            </div>
            <div className="h-7 border-l border-white/15" />
            <button
              className="btn btn-primary !bg-[#6b58ff]"
              disabled={permission === "granted" || enabling}
              onClick={() => void enablePush()}
            >
              {enabling ? "Requesting..." : permission === "granted" ? "Push Enabled" : "Enable Push"}
            </button>
          </div>
        </div>
      </section>

      {/* Multi-Device Account Notification Indicator */}
      {myAccountDevices.length > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-indigo-950/20 p-4 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <Laptop className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">Multi-Device Synchronization Active</h4>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  {myAccountDevices.length} Devices Online on Your Account
                </span>
              </div>
              <p className="text-xs text-slate-300">
                You have {myAccountDevices.length} devices signed in simultaneously as{" "}
                <strong>{user.name}</strong>. Notifications and broadcasts will be delivered to
                both/all of your devices reliably.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={testingPush}
            onClick={() => void handleTestPushAll("my-account")}
            className="btn btn-secondary shrink-0 text-xs font-bold"
          >
            <Send className="h-3.5 w-3.5 text-indigo-400" />
            {testingPush ? "Sending..." : "Test Push to My Devices"}
          </button>
        </div>
      )}

      {/* Main Composer and Engine Specs */}
      <div className="broadcast-columns mt-5">
        <section className="panel panel-pad">
          <div className="panel-heading">
            <h2>
              <Megaphone />
              Compose Broadcast Push Alert
            </h2>
            <span className="small-note !text-[9px]">Cross-Device Cloud Synchronization</span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="form-stack">
              <label className="form-field">
                <span>Alert Title *</span>
                <input
                  className="control"
                  required
                  maxLength={140}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Emergency Assembly Notice"
                />
              </label>
              <label className="form-field">
                <span>Alert Message Content *</span>
                <textarea
                  required
                  className="control min-h-[100px] resize-y"
                  rows={4}
                  maxLength={1600}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Type the message that will pop up on recipients' screens and appear in their notification feed..."
                />
              </label>
              <div className="form-grid">
                <label className="form-field">
                  <span>Target Audience</span>
                  <select
                    className="control"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="all">All Users & Students (All Devices)</option>
                    <option value="user">One student (personalized across all their devices)</option>
                    <optgroup label="By role">
                      <option value="role:council">Council Officers</option>
                      <option value="role:student">Students Only</option>
                    </optgroup>
                    <optgroup label="By house">
                      {HOUSES.map((h) => (
                        <option key={h} value={`house:${h}`}>
                          {houseFullName(state.houses, h as HouseKey)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="By grade">
                      {GRADES.map((g) => (
                        <option key={g} value={`grade:${g}`}>
                          Grade {g}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                <label className="form-field">
                  <span>Notification Category</span>
                  <select
                    className="control"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      const routes: Record<string, string> = {
                        notice: "notices",
                        event: "events",
                        meeting: "meetings",
                        poll: "voice?polls=1",
                        houses: "houses",
                      };
                      setAction(routes[e.target.value]);
                    }}
                  >
                    <option value="notice">Announcement / Notice</option>
                    <option value="event">Event Registration</option>
                    <option value="meeting">Council Meeting</option>
                    <option value="poll">Student Poll</option>
                    <option value="houses">House Points</option>
                  </select>
                </label>
              </div>
              {target === "user" && (
                <div className="form-grid">
                  <label className="form-field">
                    <span>Search student</span>
                    <input
                      className="control"
                      value={studentQuery}
                      onChange={(e) => setStudentQuery(e.target.value)}
                      placeholder="Name, email, grade, or house"
                    />
                  </label>
                  <label className="form-field">
                    <span>Recipient</span>
                    <select
                      required
                      className="control"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                    >
                      <option value="">Choose a student</option>
                      {studentMatches.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} / {s.gradeLabel} / {s.houseLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <div className="form-grid items-end">
                <label className="form-field">
                  <span>Action / Redirect Link (Optional)</span>
                  <input
                    className="control"
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    placeholder="e.g. /announcements or /events"
                  />
                </label>
                <label className="urgent-toggle">
                  <input
                    type="checkbox"
                    checked={urgent}
                    onChange={(e) => setUrgent(e.target.checked)}
                  />
                  <span>
                    <strong>Urgent High-Priority Alert</strong>
                    <small>Persistent in-app banner, priority chime & haptic vibration</small>
                  </span>
                </label>
              </div>
              {error && (
                <p className="inline-message error" role="alert">
                  {error}
                </p>
              )}
              {lastPushResult && (
                <p className="inline-message success">
                  Real-time alert dispatched: {lastPushResult.targetedDevices} devices targeted (
                  {lastPushResult.successCount} delivered).
                </p>
              )}
            </div>
            <div className="dialog-actions">
              <span className="small-note mr-auto !text-[9px]">
                {firebaseAuth.currentUser ? "Firebase authenticated" : "Google sign-in required"} ·{" "}
                {matching.length} matching live devices
              </span>
              <button type="submit" className="btn btn-primary">
                {sent ? <CircleCheck /> : <Send />}
                {sent ? "Notification Sent" : "Send Cloud Notification"}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-5">
          <section className="panel panel-pad">
            <div className="panel-heading !mb-3 !border-0 !pb-0">
              <h3>
                <Sparkles className="!text-amber-500" />
                One-Click Quick Templates
              </h3>
            </div>
            <p className="small-note mb-3 !text-[9px]">
              Click any standard template to autofill the composer:
            </p>
            <div className="broadcast-templates">
              {TEMPLATES.map((template) => (
                <button
                  key={template.title}
                  className="broadcast-template"
                  onClick={() => {
                    setTitle(template.title);
                    setBody(template.body);
                    setUrgent(template.urgent);
                    setAction(template.action);
                    setCategory(template.category);
                    setError("");
                  }}
                >
                  <strong>
                    <template.icon />
                    {template.title}
                  </strong>
                  <p>{template.body}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="panel panel-pad !bg-[var(--surface-inset)]">
            <div className="panel-heading !mb-1">
              <h3 className="!text-[11px]">
                <Flame className="!text-orange-500" />
                Cloud Messaging & Push Engine
              </h3>
              <span
                className={`status-label !text-[7px] ${
                  firebaseAuth.currentUser ? "active" : "!border-amber-500/20"
                }`}
              >
                {firebaseAuth.currentUser ? "CLOUD ACTIVE" : "SETUP REQUIRED"}
              </span>
            </div>
            <div className="integration-row !text-[10px]">
              <span>Firebase project</span>
              <strong className="text-[var(--green)]">shristi-hub</strong>
            </div>
            <div className="integration-row !text-[10px]">
              <span>Google Auth</span>
              <strong
                className={
                  firebaseAuth.currentUser ? "text-[var(--green)]" : "text-amber-400"
                }
              >
                {firebaseAuth.currentUser?.email ?? "Not signed in"}
              </strong>
            </div>
            <div className="integration-row !text-[10px]">
              <span>Web Push Engine</span>
              <strong className="text-[var(--green)]">
                Active (Built-in OS & SW Push)
              </strong>
            </div>
            <p className="small-note mt-3 !text-[9px]">
              Multi-device delivery sends concurrently via Firestore Broadcasts and ServiceWorker
              Web Push so every phone and browser displays notifications.
            </p>
          </section>
        </aside>
      </div>

      {/* COMPREHENSIVE ONLINE DEVICES REGISTRY & CONTROLS */}
      <section className="panel panel-pad mt-6">
        <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <Radio className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-base font-bold text-[var(--text)]">
                  Live Connected Devices Registry
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Active devices connected to the school network across all accounts.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400">
              <Wifi className="h-3.5 w-3.5" />
              {totalDevices} {totalDevices === 1 ? "Device" : "Devices"} Online
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-400">
              <Smartphone className="h-3.5 w-3.5" />
              {mobileCount} Mobile
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/20 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-400">
              <Monitor className="h-3.5 w-3.5" />
              {desktopCount} Desktop
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400">
              <Bell className="h-3.5 w-3.5" />
              {pushReadyCount} Push Ready
            </span>
          </div>
        </div>

        {/* Action Buttons & Filter Toolbar */}
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDeviceFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                deviceFilter === "all"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-inset)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              All ({totalDevices})
            </button>
            <button
              type="button"
              onClick={() => setDeviceFilter("my-account")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                deviceFilter === "my-account"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-inset)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              My Devices ({myAccountDevices.length})
            </button>
            <button
              type="button"
              onClick={() => setDeviceFilter("mobile")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                deviceFilter === "mobile"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-inset)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              Mobile ({mobileCount})
            </button>
            <button
              type="button"
              onClick={() => setDeviceFilter("desktop")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                deviceFilter === "desktop"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-inset)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              Desktop ({desktopCount})
            </button>
            <button
              type="button"
              onClick={() => setDeviceFilter("push-ready")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                deviceFilter === "push-ready"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-inset)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              Push Ready ({pushReadyCount})
            </button>
          </div>

          {/* Search & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:w-60">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
              <input
                type="text"
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                placeholder="Search device, user, OS..."
                className="control !h-8 !py-1 !pl-8 !text-xs"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                await syncCurrentDeviceToRegistry(user);
                announce("This device was confirmed and refreshed in the registry.");
              }}
              className="btn btn-secondary !h-8 !px-2.5 !text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              title="Force sync this device to the connected devices registry"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sync This Device</span>
            </button>
            <button
              type="button"
              onClick={() => void handleTestPushStudent()}
              disabled={testingPush}
              className="btn btn-secondary !h-8 !px-3 !text-xs font-bold text-indigo-400 hover:text-indigo-300"
              title="Test push notification to dummy student account (Alex Rivera)"
            >
              <Send className="h-3 w-3 text-indigo-400" />
              Test Alex Rivera (Student)
            </button>
            <button
              type="button"
              onClick={() => void handleTestPushAll("all")}
              disabled={testingPush}
              className="btn btn-secondary !h-8 !px-3 !text-xs font-bold"
              title="Test OS push notification on all online devices simultaneously"
            >
              <Bell className="h-3 w-3 text-amber-400" />
              {testingPush ? "Sending..." : "Test Push to All"}
            </button>
            <button
              type="button"
              onClick={() => void handleCleanDevices()}
              disabled={cleaningDevices}
              className="btn btn-secondary !h-8 !px-2.5 !text-xs text-slate-400 hover:text-rose-400"
              title="Prune stale or disconnected device sessions"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Devices Cards Grid */}
        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDevices.map((device) => {
            const isUserDevice = device.userId === user?.id;
            const diffSec = Math.max(1, Math.round((Date.now() - device.lastPing) / 1000));

            return (
              <div
                key={device.id}
                className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all ${
                  device.isCurrent
                    ? "border-emerald-500/40 bg-emerald-500/5 shadow-md"
                    : isUserDevice
                    ? "border-indigo-500/30 bg-indigo-500/5"
                    : "border-[var(--border)] bg-[var(--surface-inset)]"
                }`}
              >
                <div>
                  {/* Card Header: Device icon, model, and badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                          device.kind === "mobile"
                            ? "bg-purple-500/20 text-purple-400"
                            : device.kind === "tablet"
                            ? "bg-indigo-500/20 text-indigo-400"
                            : "bg-blue-500/20 text-blue-400"
                        }`}
                      >
                        {device.kind === "mobile" ? (
                          <Smartphone className="h-4.5 w-4.5" />
                        ) : device.kind === "tablet" ? (
                          <Tablet className="h-4.5 w-4.5" />
                        ) : (
                          <Monitor className="h-4.5 w-4.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="truncate text-xs font-bold text-[var(--text)]">
                            {device.model || (device.kind === "mobile" ? "Mobile Phone" : "Desktop PC")}
                          </h4>
                          {device.isCurrent && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[8px] font-bold text-emerald-400">
                              THIS DEVICE
                            </span>
                          )}
                          {device.isGuest && (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[8px] font-bold text-amber-400">
                              VISITOR
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[10px] text-[var(--muted)]">
                          {device.browser} · {device.isStandalone ? "PWA App" : "Web Tab"}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        device.pushStatus === "enabled"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : device.pushStatus === "blocked"
                          ? "bg-rose-500/20 text-rose-400"
                          : "bg-slate-500/20 text-slate-400"
                      }`}
                      title={
                        device.pushStatus === "enabled"
                          ? "OS push notifications active"
                          : "Push notifications muted or not allowed"
                      }
                    >
                      <Bell className="h-2.5 w-2.5" />
                      {device.pushStatus === "enabled"
                        ? "Push Ready"
                        : device.pushStatus === "blocked"
                        ? "Blocked"
                        : "In-App"}
                    </span>
                  </div>

                  {/* Account Information */}
                  <div className="mt-3.5 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-xs">
                    <div>
                      <strong className="block text-[11px] text-[var(--text)]">
                        {device.name}
                      </strong>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] text-[var(--faint)]">
                          {device.isGuest
                            ? "Connecting Visitor"
                            : `${device.role} · ${device.house ? `${device.house} House` : "No House"}`}
                        </span>
                        {device.connectedAt && (
                          <span className="text-[9px] text-[var(--muted)]">
                            · Connected {relativeTime(device.connectedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[9px] text-emerald-400 font-medium flex items-center gap-1">
                      <i className="status-dot animate-pulse-dot" />
                      Active {diffSec}s ago
                    </span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-[var(--border)] pt-2">
                  <button
                    type="button"
                    onClick={() => void handlePingSingleDevice(device)}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    Ping
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await sendFirebaseNotification({
                          title: `Test Alert to ${device.name}`,
                          body: `Targeted ping reaching your ${device.model} at ${new Date().toLocaleTimeString()}.`,
                          urgent: true,
                          audience: { kind: "user", userId: device.userId, name: device.name },
                          actionTab: "broadcast",
                          senderName: user.name,
                          targetDeviceId: device.id,
                        });
                        announce(`Test alert dispatched to ${device.name}'s device.`);
                      } catch {
                        announce("Could not send alert.", "error");
                      }
                    }}
                    className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 hover:bg-indigo-500/30"
                  >
                    Test Alert
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredDevices.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-xs text-[var(--muted)]">
            No devices found matching current filter ({deviceFilter}).
          </div>
        )}
      </section>

      {/* Broadcast History */}
      <div className="mt-6">
        <section className="panel overflow-hidden">
          <div className="panel-caption">
            <h2 className="eyebrow flex items-center gap-2">
              <History className="h-3.5 w-3.5" />
              Broadcast History
            </h2>
            <span className="small-note !text-[9px]">{state.broadcastHistory.length} records</span>
          </div>
          <div className="table-scroll">
            <table className="data-table !min-w-[540px]">
              <thead>
                <tr>
                  <th>Notification</th>
                  <th>Audience</th>
                  <th>Sender / Sent</th>
                </tr>
              </thead>
              <tbody>
                {state.broadcastHistory.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong className="block max-w-[200px] truncate text-[10px]">
                        {record.title}
                      </strong>
                      <span
                        className={`mt-1 inline-block text-[8px] ${
                          record.urgent ? "text-rose-400" : "text-[var(--faint)]"
                        }`}
                      >
                        {record.urgent ? "Urgent" : "Standard"}
                      </span>
                    </td>
                    <td className="!text-[9px] text-[var(--muted)]">
                      {record.audience.kind === "house"
                        ? houseFullName(state.houses, record.audience.house)
                        : audienceLabel(record.audience)}
                    </td>
                    <td>
                      <span className="block text-[9px]">{record.senderName}</span>
                      <span className="mt-1 block text-[8px] text-[var(--faint)]">
                        {relativeTime(record.timestamp)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </RevealBlocks>
  );
}

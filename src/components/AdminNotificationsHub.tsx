import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleCheck,
  Clock,
  Flame,
  History,
  Laptop,
  Megaphone,
  MessageSquare,
  Monitor,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Sliders,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Trophy,
  Users,
  Vote,
  Wifi,
} from "lucide-react";
import { audienceLabel, formatTemplate, relativeTime, targetsUser, uid, useHub } from "../store/hub";
import { houseFullName } from "../lib/admin";
import type { House as HouseKey, NotificationTemplate, Student } from "../lib/types";
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
import { DEFAULT_NOTIFICATION_TEMPLATES } from "../lib/content";
import { RevealBlocks } from "./Effects";

const TEMPLATE_ICONS: Record<string, typeof Bell> = {
  poll_new: Vote,
  poll_teacher: Users,
  suggestion_reply: MessageSquare,
  council_message: Megaphone,
  house_message: Trophy,
  inactive_user: Clock,
  assembly_urgent: ShieldAlert,
  house_points: Trophy,
  council_meeting: CalendarDays,
  event_reg: Sparkles,
  task_assigned: CheckCircle2,
};

const SAMPLE_VARS: Record<string, string> = {
  question: "Should the school library remain open on Saturdays?",
  expires: "Tomorrow at 5 PM",
  creator: "Arnab Shrestha",
  responder: "Arnab Shrestha",
  role: "Council President",
  status: "Approved",
  suggestion: "Install additional charging stations in the senior common room",
  response: "Approved by council. Maintenance will install 8 outlets this week.",
  author: "Arnab Shrestha",
  title: "Upcoming Council Assembly",
  message: "Please review the agenda and attendance sheets before 2 PM today.",
  house: "Red",
  name: "Aadeesh Bista",
  days: "4",
  taskTitle: "Coordinate Sports Day Registration Booth",
  dueDate: "Nov 15",
  department: "Sports & Games",
};

function previewInterpolate(text: string): string {
  let res = text;
  for (const [k, v] of Object.entries(SAMPLE_VARS)) {
    res = res.replaceAll(`{${k}}`, v);
  }
  return res;
}

export default function AdminNotificationsHub() {
  const { state, user, devices, dispatch, announce, hasPermission } = useHub();
  const [activeSection, setActiveSection] = useState<
    "broadcast" | "templates" | "inactivity" | "devices" | "history"
  >("broadcast");

  // Broadcast Composer State
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

  // Notification Template Manager State
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("poll_new");
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateActionTab, setTemplateActionTab] = useState("");
  const [templateUrgent, setTemplateUrgent] = useState(false);
  const [testingTemplatePush, setTestingTemplatePush] = useState(false);

  // Device controls state
  const [deviceFilter, setDeviceFilter] = useState<
    "all" | "my-account" | "mobile" | "desktop" | "push-ready"
  >("all");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [testingPush, setTestingPush] = useState(false);
  const [cleaningDevices, setCleaningDevices] = useState(false);

  // Inactivity State
  const [sendingInactiveAlerts, setSendingInactiveAlerts] = useState(false);
  const [inactiveSearch, setInactiveSearch] = useState("");

  useEffect(() => {
    // Actively poll connected devices while viewing the hub
    window.dispatchEvent(new Event("shristi-refresh-devices"));
    const timer = setInterval(() => {
      window.dispatchEvent(new Event("shristi-refresh-devices"));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Sync template editor fields when selectedTemplateId changes
  useEffect(() => {
    const current =
      state.notificationTemplates?.[selectedTemplateId] ||
      DEFAULT_NOTIFICATION_TEMPLATES[selectedTemplateId];
    if (current) {
      setTemplateTitle(current.title);
      setTemplateBody(current.body);
      setTemplateActionTab(current.actionTab || "");
      setTemplateUrgent(current.urgent);
    }
  }, [selectedTemplateId, state.notificationTemplates]);

  // Inactivity calculation: members away for > 3 days
  const now = Date.now();
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const inactiveMembers = useMemo(() => {
    return state.users
      .map((u) => {
        const lastActiveTs =
          u.lastActive || (u.createdAt ? Date.parse(u.createdAt) : 0) || 0;
        const inactiveMs = now - lastActiveTs;
        const inactiveDays = Math.max(1, Math.floor(inactiveMs / (24 * 60 * 60 * 1000)));
        return {
          user: u,
          lastActiveTs,
          inactiveMs,
          inactiveDays,
          isInactive: inactiveMs >= THREE_DAYS_MS,
        };
      })
      .filter((item) => item.isInactive);
  }, [state.users, now]);

  const filteredInactive = useMemo(() => {
    if (!inactiveSearch.trim()) return inactiveMembers;
    const q = inactiveSearch.toLowerCase();
    return inactiveMembers.filter(
      (m) =>
        m.user.name.toLowerCase().includes(q) ||
        m.user.email.toLowerCase().includes(q) ||
        (m.user.houseLabel || "").toLowerCase().includes(q) ||
        (m.user.gradeLabel || "").toLowerCase().includes(q)
    );
  }, [inactiveMembers, inactiveSearch]);

  const selectedStudent = state.users.find((s) => s.id === studentId);
  const audience: Audience =
    target === "user" && selectedStudent
      ? { kind: "user", userId: selectedStudent.id, name: selectedStudent.name }
      : target === "all"
      ? { kind: "all" }
      : target.startsWith("role:")
      ? { kind: "role", role: target.split(":")[1] as "council" | "student" | "teacher" }
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
    if (deviceFilter === "mobile" && device.kind !== "mobile" && device.kind !== "tablet")
      return false;
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
      announce(
        `Diagnostic ping sent to all ${devices.length} online ${
          devices.length === 1 ? "device" : "devices"
        }.`
      );
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
    } catch {
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

      await triggerOSNotification({
        title: testTitle,
        body: testBody,
        urgent: true,
        actionTab: "broadcast",
      });

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
      if (!title.trim() || !body.trim())
        throw new Error("An alert title and message are required.");
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
      const notifId = uid();
      const pushResult = await sendFirebaseNotification({
        id: notifId,
        title: title.trim(),
        body: body.trim(),
        urgent,
        audience,
        actionTab: destination || "notices",
        senderName: user.name,
      });

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
          delivered: Math.max(matching.length, pushResult.targetedUsers),
        },
        notification: {
          id: notifId,
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

  // Template Management Handlers
  const currentTemplate =
    state.notificationTemplates?.[selectedTemplateId] ||
    DEFAULT_NOTIFICATION_TEMPLATES[selectedTemplateId];

  const handleSaveTemplate = () => {
    if (!currentTemplate) return;
    const updated: NotificationTemplate = {
      ...currentTemplate,
      title: templateTitle.trim() || currentTemplate.title,
      body: templateBody.trim() || currentTemplate.body,
      actionTab: templateActionTab.trim() || currentTemplate.actionTab,
      urgent: templateUrgent,
    };
    dispatch({
      type: "UPDATE_NOTIFICATION_TEMPLATES",
      templates: {
        [selectedTemplateId]: updated,
      },
    });
    announce(`Template "${updated.name}" updated successfully.`);
  };

  const handleResetTemplate = () => {
    const defaultTpl = DEFAULT_NOTIFICATION_TEMPLATES[selectedTemplateId];
    if (!defaultTpl) return;
    setTemplateTitle(defaultTpl.title);
    setTemplateBody(defaultTpl.body);
    setTemplateActionTab(defaultTpl.actionTab || "");
    setTemplateUrgent(defaultTpl.urgent);
    dispatch({
      type: "UPDATE_NOTIFICATION_TEMPLATES",
      templates: {
        [selectedTemplateId]: defaultTpl,
      },
    });
    announce(`Template "${defaultTpl.name}" reset to system default.`);
  };

  const handleTestTemplatePush = async () => {
    setTestingTemplatePush(true);
    try {
      const previewTitle = previewInterpolate(templateTitle);
      const previewBody = previewInterpolate(templateBody);
      await triggerOSNotification({
        title: previewTitle,
        body: previewBody,
        urgent: templateUrgent,
        actionTab: templateActionTab || "dashboard",
      });
      await sendFirebaseNotification({
        title: previewTitle,
        body: previewBody,
        urgent: templateUrgent,
        audience: { kind: "user", userId: user.id, name: user.name },
        actionTab: templateActionTab || "dashboard",
        senderName: user.name,
      });
      announce(`Test push alert dispatched for "${currentTemplate?.name || selectedTemplateId}".`);
    } catch (err) {
      announce(err instanceof Error ? err.message : "Test push failed.", "error");
    } finally {
      setTestingTemplatePush(false);
    }
  };

  // Inactivity Handlers
  const handleSendSingleInactive = async (targetUser: Student, days: number) => {
    try {
      const tpl =
        state.notificationTemplates?.inactive_user || DEFAULT_NOTIFICATION_TEMPLATES.inactive_user;
      const formattedTitle = formatTemplate(tpl.title, { name: targetUser.name, days });
      const formattedBody = formatTemplate(tpl.body, { name: targetUser.name, days });
      await sendFirebaseNotification({
        title: formattedTitle,
        body: formattedBody,
        urgent: tpl.urgent,
        audience: { kind: "user", userId: targetUser.id, name: targetUser.name },
        actionTab: tpl.actionTab || "dashboard",
        senderName: user.name,
      });
      announce(`Inactivity push notification dispatched to ${targetUser.name}.`);
    } catch (err) {
      announce(err instanceof Error ? err.message : "Failed to dispatch alert.", "error");
    }
  };

  const handleSendAllInactive = async () => {
    if (!inactiveMembers.length) return;
    setSendingInactiveAlerts(true);
    try {
      const tpl =
        state.notificationTemplates?.inactive_user || DEFAULT_NOTIFICATION_TEMPLATES.inactive_user;
      let count = 0;
      for (const m of inactiveMembers) {
        const formattedTitle = formatTemplate(tpl.title, {
          name: m.user.name,
          days: m.inactiveDays,
        });
        const formattedBody = formatTemplate(tpl.body, {
          name: m.user.name,
          days: m.inactiveDays,
        });
        await sendFirebaseNotification({
          title: formattedTitle,
          body: formattedBody,
          urgent: tpl.urgent,
          audience: { kind: "user", userId: m.user.id, name: m.user.name },
          actionTab: tpl.actionTab || "dashboard",
          senderName: user.name,
        });
        count++;
      }
      announce(`Inactivity alert sent to all ${count} inactive members!`);
    } catch (err) {
      announce(err instanceof Error ? err.message : "Failed to dispatch alerts.", "error");
    } finally {
      setSendingInactiveAlerts(false);
    }
  };

  // Dynamic quick templates in sidebar referencing customized templates
  const quickTemplates = useMemo(() => {
    const cur = { ...DEFAULT_NOTIFICATION_TEMPLATES, ...(state.notificationTemplates ?? {}) };
    return [
      {
        key: "assembly_urgent",
        title: cur.assembly_urgent?.title || "Urgent Assembly Notice",
        body: cur.assembly_urgent?.body || "All students are requested to assemble at the Main Hall immediately.",
        urgent: cur.assembly_urgent?.urgent ?? true,
        action: cur.assembly_urgent?.actionTab || "events?tab=notices",
        category: "notice",
        icon: ShieldAlert,
      },
      {
        key: "house_points",
        title: cur.house_points?.title || "House Points Update",
        body: cur.house_points?.body || "New house points have been verified and added to the official leaderboard.",
        urgent: cur.house_points?.urgent ?? false,
        action: cur.house_points?.actionTab || "houses",
        category: "houses",
        icon: Trophy,
      },
      {
        key: "council_meeting",
        title: cur.council_meeting?.title || "Council Meeting Alert",
        body: cur.council_meeting?.body || "Reminder: the council executives meeting is scheduled today in Conference Room.",
        urgent: cur.council_meeting?.urgent ?? false,
        action: cur.council_meeting?.actionTab || "meetings",
        category: "meeting",
        icon: CalendarDays,
      },
      {
        key: "event_reg",
        title: cur.event_reg?.title || "New Event Registration",
        body: cur.event_reg?.body || "Registrations are now open for the upcoming school event.",
        urgent: cur.event_reg?.urgent ?? false,
        action: cur.event_reg?.actionTab || "events",
        category: "event",
        icon: Sparkles,
      },
      {
        key: "poll_new",
        title: cur.poll_new?.title || "Student Poll Live",
        body: cur.poll_new?.body || "A new survey poll has just been published.",
        urgent: cur.poll_new?.urgent ?? false,
        action: cur.poll_new?.actionTab || "voice?polls=1",
        category: "poll",
        icon: Vote,
      },
    ];
  }, [state.notificationTemplates]);

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

      {/* SECTION NAVIGATION PILLS */}
      <nav aria-label="Notification hub sections" className="mt-5 flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
        <button
          type="button"
          onClick={() => setActiveSection("broadcast")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            activeSection === "broadcast"
              ? "bg-[var(--accent)] text-white shadow-md"
              : "bg-[var(--surface-inset)] text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          <Megaphone className="h-3.5 w-3.5" />
          Broadcast Composer
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("templates")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            activeSection === "templates"
              ? "bg-[var(--accent)] text-white shadow-md"
              : "bg-[var(--surface-inset)] text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          Notification Templates
          <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.2 text-[10px] font-bold text-indigo-300">
            {Object.keys(DEFAULT_NOTIFICATION_TEMPLATES).length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("inactivity")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            activeSection === "inactivity"
              ? "bg-[var(--accent)] text-white shadow-md"
              : "bg-[var(--surface-inset)] text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Inactive Members (&gt; 3 Days)
          {inactiveMembers.length > 0 && (
            <span className="rounded-full bg-rose-500/20 px-1.5 py-0.2 text-[10px] font-bold text-rose-300">
              {inactiveMembers.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("devices")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            activeSection === "devices"
              ? "bg-[var(--accent)] text-white shadow-md"
              : "bg-[var(--surface-inset)] text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          <Radio className="h-3.5 w-3.5" />
          Online Devices Registry
          <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-bold text-emerald-300">
            {totalDevices}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("history")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            activeSection === "history"
              ? "bg-[var(--accent)] text-white shadow-md"
              : "bg-[var(--surface-inset)] text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          Broadcast History
          <span className="rounded-full bg-slate-500/20 px-1.5 py-0.2 text-[10px] font-bold text-slate-300">
            {state.broadcastHistory.length}
          </span>
        </button>
      </nav>

      {/* VIEW 1: BROADCAST COMPOSER */}
      {activeSection === "broadcast" && (
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
                      <option value="all">All Users &amp; Students (All Devices)</option>
                      <option value="user">One student (personalized across all their devices)</option>
                      <optgroup label="By role">
                        <option value="role:council">Council Officers</option>
                        <option value="role:teacher">Teachers &amp; Staff (Database)</option>
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
                        setAction(routes[e.target.value] || "notices");
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
                      <small>Persistent in-app banner, priority chime &amp; haptic vibration</small>
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
                {quickTemplates.map((template) => (
                  <button
                    key={template.key}
                    type="button"
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
                  Cloud Messaging &amp; Push Engine
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
                <strong className="text-[var(--green)]">Active (Built-in OS &amp; SW Push)</strong>
              </div>
              <p className="small-note mt-3 !text-[9px]">
                Multi-device delivery sends concurrently via Firestore Broadcasts and ServiceWorker
                Web Push so every phone and browser displays notifications.
              </p>
            </section>
          </aside>
        </div>
      )}

      {/* VIEW 2: EDITABLE NOTIFICATION TEMPLATES */}
      {activeSection === "templates" && (
        <section className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Templates list on left */}
          <div className="space-y-2 lg:col-span-4">
            <div className="panel panel-pad">
              <div className="panel-heading !mb-2 !border-0 !pb-0">
                <h3>
                  <Sliders className="h-4 w-4 text-indigo-400" />
                  Notification Types
                </h3>
              </div>
              <p className="text-[11px] text-[var(--muted)]">
                Select a notification type to edit its default title, text message, urgency, and destination.
              </p>
              <div className="mt-3 space-y-1.5">
                {Object.keys(DEFAULT_NOTIFICATION_TEMPLATES).map((key) => {
                  const tpl =
                    state.notificationTemplates?.[key] || DEFAULT_NOTIFICATION_TEMPLATES[key];
                  const IconComponent = TEMPLATE_ICONS[key] || Bell;
                  const isSelected = selectedTemplateId === key;
                  const isCustomized = Boolean(state.notificationTemplates?.[key]);

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedTemplateId(key)}
                      className={`flex w-full items-center justify-between gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-500/15 shadow-sm"
                          : "border-[var(--border)] bg-[var(--surface-inset)] hover:border-indigo-500/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                            isSelected
                              ? "bg-indigo-500 text-white"
                              : "bg-[var(--surface)] text-[var(--muted)]"
                          }`}
                        >
                          <IconComponent className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate text-xs font-bold text-[var(--text)]">
                            {tpl.name}
                          </strong>
                          <span className="block truncate text-[10px] text-[var(--muted)]">
                            {tpl.category}
                          </span>
                        </div>
                      </div>
                      {isCustomized && (
                        <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-bold text-emerald-300">
                          CUSTOM
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Template Editor Form & Live Preview on right */}
          <div className="space-y-5 lg:col-span-8">
            <div className="panel panel-pad">
              <div className="panel-heading !mb-4">
                <div className="flex items-center gap-2.5">
                  {(() => {
                    const CurIcon = TEMPLATE_ICONS[selectedTemplateId] || Bell;
                    return (
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/20 text-indigo-400">
                        <CurIcon className="h-4 w-4" />
                      </span>
                    );
                  })()}
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text)]">
                      {currentTemplate?.name || selectedTemplateId}
                    </h3>
                    <p className="text-[10px] text-[var(--muted)]">
                      Category: <strong>{currentTemplate?.category}</strong> · Identifier:{" "}
                      <code>{selectedTemplateId}</code>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetTemplate}
                    className="btn btn-secondary !h-8 !px-3 !text-xs font-semibold"
                    title="Restore system default message and title"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset to Default
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    className="btn btn-primary !h-8 !px-3 !text-xs font-bold"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Save Template
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <label className="form-field">
                  <span className="flex items-center justify-between">
                    <strong>Notification Title *</strong>
                    <small className="text-[10px] text-[var(--muted)]">
                      Appears on lock screens and OS banners
                    </small>
                  </span>
                  <input
                    className="control"
                    value={templateTitle}
                    onChange={(e) => setTemplateTitle(e.target.value)}
                    placeholder="Enter notification title..."
                  />
                </label>

                <label className="form-field">
                  <span className="flex items-center justify-between">
                    <strong>Message Body Template *</strong>
                    <small className="text-[10px] text-[var(--muted)]">
                      Dynamic parameters will be injected automatically
                    </small>
                  </span>
                  <textarea
                    rows={4}
                    className="control min-h-[90px] resize-y"
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    placeholder="Enter notification message body..."
                  />
                </label>

                {/* Clickable Variable Chips */}
                {currentTemplate?.variables && currentTemplate.variables.length > 0 && (
                  <div>
                    <span className="block text-[11px] font-bold text-[var(--text)]">
                      Available Message Variables:
                    </span>
                    <p className="text-[10px] text-[var(--muted)] mb-1.5">
                      Click any tag to append it into the message template:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {currentTemplate.variables.map((variable) => (
                        <button
                          key={variable}
                          type="button"
                          onClick={() => {
                            setTemplateBody((prev) => `${prev} ${variable}`.trim());
                          }}
                          className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] font-mono font-bold text-indigo-300 hover:bg-indigo-500/25 transition-all"
                        >
                          + {variable}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="form-field">
                    <span>Target Hub Tab / Destination (Action Tab)</span>
                    <input
                      className="control"
                      value={templateActionTab}
                      onChange={(e) => setTemplateActionTab(e.target.value)}
                      placeholder="e.g. voice, councilHub, house, tasks, dashboard"
                    />
                  </label>

                  <div className="flex items-end">
                    <label className="urgent-toggle w-full">
                      <input
                        type="checkbox"
                        checked={templateUrgent}
                        onChange={(e) => setTemplateUrgent(e.target.checked)}
                      />
                      <span>
                        <strong>Urgent Priority Flag</strong>
                        <small>Plays priority chime and presents high-priority toast</small>
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* LIVE SIMULATED OS NOTIFICATION PREVIEW */}
              <div className="mt-6 rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
                <div className="flex items-center justify-between pb-3 border-b border-indigo-500/20">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-indigo-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Live Push Notification Preview
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={testingTemplatePush}
                    onClick={() => void handleTestTemplatePush()}
                    className="btn btn-secondary !h-7 !px-2.5 !text-[11px] font-bold text-indigo-300 hover:text-indigo-200"
                  >
                    <Send className="h-3 w-3 text-indigo-400" />
                    {testingTemplatePush ? "Dispatching..." : "Send Test Alert to My Device"}
                  </button>
                </div>

                <div className="mt-3 flex items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-3.5 shadow-inner">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600/30 text-indigo-400 border border-indigo-500/40">
                    <Bell className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate text-xs font-bold text-white">
                        {previewInterpolate(templateTitle) || "Notification Title"}
                      </strong>
                      <span className="text-[10px] text-slate-400 font-mono">Just now</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-200 leading-relaxed">
                      {previewInterpolate(templateBody) || "Notification message content..."}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                      <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[9px] font-bold text-indigo-300">
                        Destination: /{templateActionTab || "dashboard"}
                      </span>
                      {templateUrgent && (
                        <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[9px] font-bold text-rose-300">
                          URGENT PRIORITY
                        </span>
                      )}
                      <span className="text-[9px] text-slate-400">
                        Shristi Student Council Hub
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* VIEW 3: INACTIVE MEMBERS (> 3 DAYS) */}
      {activeSection === "inactivity" && (
        <section className="panel panel-pad mt-5">
          <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-500/20 text-rose-400">
                <Clock className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-base font-bold text-[var(--text)]">
                  Inactive Accounts Monitor (&gt; 3 Days Away)
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Students and council officers who have been inactive for more than 3 consecutive
                  days. Dispatch re-engagement push notifications.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={sendingInactiveAlerts || inactiveMembers.length === 0}
                onClick={() => void handleSendAllInactive()}
                className="btn btn-primary !h-8 !px-3.5 !text-xs font-bold"
              >
                <Send className="h-3.5 w-3.5" />
                {sendingInactiveAlerts
                  ? "Dispatching..."
                  : `Send Inactivity Alert to All (${inactiveMembers.length})`}
              </button>
            </div>
          </div>

          {/* Quick Metrics Badges */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Total Roster Accounts
              </span>
              <strong className="mt-1 block text-xl font-bold text-[var(--text)]">
                {state.users.length}
              </strong>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Active Recently (&le; 3 Days)
              </span>
              <strong className="mt-1 block text-xl font-bold text-emerald-400">
                {state.users.length - inactiveMembers.length}
              </strong>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                Inactive Members (&gt; 3 Days)
              </span>
              <strong className="mt-1 block text-xl font-bold text-rose-400">
                {inactiveMembers.length}
              </strong>
            </div>
          </div>

          {/* Search bar */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
              <input
                type="text"
                value={inactiveSearch}
                onChange={(e) => setInactiveSearch(e.target.value)}
                placeholder="Search inactive user by name, email, house..."
                className="control !h-8 !py-1 !pl-8 !text-xs"
              />
            </div>
            <span className="text-xs text-[var(--muted)]">
              Showing {filteredInactive.length} of {inactiveMembers.length} inactive
            </span>
          </div>

          {/* Table of Inactive Members */}
          <div className="mt-4">
            {filteredInactive.length > 0 ? (
              <div className="table-scroll">
                <table className="data-table !min-w-[620px]">
                  <thead>
                    <tr>
                      <th>Student / Account</th>
                      <th>Role &amp; Affiliation</th>
                      <th>Last Active</th>
                      <th>Inactive Duration</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInactive.map((item) => (
                      <tr key={item.user.id}>
                        <td>
                          <strong className="block text-xs font-bold text-[var(--text)]">
                            {item.user.name}
                          </strong>
                          <span className="block text-[10px] text-[var(--muted)]">
                            {item.user.email}
                          </span>
                        </td>
                        <td>
                          <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300">
                            {item.user.role}
                          </span>
                          <span className="ml-1 text-[10px] text-[var(--muted)]">
                            {item.user.gradeLabel} · {item.user.houseLabel}
                          </span>
                        </td>
                        <td className="text-[10px] text-[var(--muted)]">
                          {item.lastActiveTs
                            ? relativeTime(item.lastActiveTs)
                            : "Never recorded (since account creation)"}
                        </td>
                        <td>
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                            {item.inactiveDays} days away
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => void handleSendSingleInactive(item.user, item.inactiveDays)}
                            className="btn btn-secondary !h-7 !px-2.5 !text-[11px] font-bold text-rose-400 hover:text-rose-300"
                          >
                            <Send className="h-3 w-3" />
                            Send Inactivity Push
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                <h4 className="mt-2 text-sm font-bold text-emerald-400">
                  Great Network Engagement!
                </h4>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {inactiveMembers.length === 0
                    ? "All registered students and council members have been active within the last 3 days."
                    : "No inactive members matched your search query."}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* VIEW 4: LIVE CONNECTED DEVICES REGISTRY */}
      {activeSection === "devices" && (
        <section className="panel panel-pad mt-5">
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
                              {device.model ||
                                (device.kind === "mobile" ? "Mobile Phone" : "Desktop PC")}
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
                            : device.pushStatus === "denied"
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
                          : device.pushStatus === "denied"
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
                              : `${device.role} · ${
                                  device.house ? `${device.house} House` : "No House"
                                }`}
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
      )}

      {/* VIEW 5: BROADCAST HISTORY */}
      {activeSection === "history" && (
        <div className="mt-5">
          <section className="panel overflow-hidden">
            <div className="panel-caption">
              <h2 className="eyebrow flex items-center gap-2">
                <History className="h-3.5 w-3.5" />
                Broadcast History
              </h2>
              <span className="small-note !text-[9px]">
                {state.broadcastHistory.length} records
              </span>
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
      )}
    </RevealBlocks>
  );
}

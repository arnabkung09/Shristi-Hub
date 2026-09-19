import { useState } from "react";
import { Bell, CalendarDays, CircleCheck, Flame, History, Megaphone, Monitor, Radio, Send, ShieldAlert, Smartphone, Sparkles, Trophy, Vote } from "lucide-react";
import { audienceLabel, relativeTime, targetsUser, uid, useHub } from "../store/hub";
import { houseFullName } from "../lib/admin";
import type { House as HouseKey } from "../lib/types";
import { chime, postBus } from "../lib/realtime";
import { enableFirebasePush, firebaseAuth, getVapidKey, sendFirebaseNotification } from "../lib/firebase-client";
import type { Audience, House } from "../lib/types";
import { GRADES, HOUSES } from "../lib/seed";
import { RevealBlocks } from "./Effects";

const TEMPLATES = [
  { title: "Urgent Assembly Notice", body: "All students are requested to assemble at the Main Hall immediately. House captains, please take attendance.", urgent: true, action: "events?tab=notices", category: "notice", icon: ShieldAlert },
  { title: "House Points Update", body: "New house points have been verified and added to the official leaderboard. Check your house's latest standing.", urgent: false, action: "houses", category: "houses", icon: Trophy },
  { title: "Council Meeting Alert", body: "Reminder: the council executives meeting is scheduled today in the Conference Room. Please bring your department updates.", urgent: false, action: "meetings", category: "meeting", icon: CalendarDays },
  { title: "New Event Registration", body: "Registrations are now open for the upcoming school event. Submit your entry before seats fill up.", urgent: false, action: "events", category: "event", icon: Sparkles },
  { title: "Student Poll Live", body: "A new survey poll has just been published. Have your voice heard by casting your vote.", urgent: false, action: "voice?polls=1", category: "poll", icon: Vote },
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
  const [permission, setPermission] = useState(() => "Notification" in window ? Notification.permission : "unsupported");
  const [enabling, setEnabling] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [sent, setSent] = useState(false);
  const [lastPushResult, setLastPushResult] = useState<{ successCount: number; failureCount: number; targetedDevices: number } | null>(null);
  const selectedStudent = state.users.find((s) => s.id === studentId);
  const audience: Audience =
    target === "user" && selectedStudent ? { kind: "user", userId: selectedStudent.id, name: selectedStudent.name } :
    target === "all" ? { kind: "all" } :
    target.startsWith("role:") ? { kind: "role", role: target.split(":")[1] as "council" | "student" } :
    target.startsWith("house:") ? { kind: "house", house: target.split(":")[1] as House } :
    { kind: "grade", grade: Number(target.split(":")[1]) };
  const studentMatches = state.users.filter((s) => `${s.name} ${s.email} ${s.gradeLabel} ${s.houseLabel}`.toLowerCase().includes(studentQuery.trim().toLowerCase())).slice(0, 40);
  const matching = devices.filter((device) => {
    const student = state.users.find((s) => s.id === device.userId);
    return student && targetsUser(audience, student);
  });
  if (!user || !hasPermission("broadcast")) return <div className="empty-content"><ShieldAlert /><strong>Broadcast permission is required</strong><p>An administrator can grant this feature from Council Officers & Permissions.</p></div>;

  const enablePush = async () => {
    setEnabling(true);
    try {
      await enableFirebasePush(user);
      setPermission("granted");
      announce("Real Firebase push notifications are enabled on this browser.");
    }
    catch (error) { announce(error instanceof Error ? error.message : "Push registration failed.", "error"); }
    finally { setEnabling(false); }
  };
  const ping = () => {
    chime(true); postBus({ type: "ping", senderName: user.name, urgent: true }); setPinging(true);
    announce(`Diagnostic ping sent to ${devices.length} open ${devices.length === 1 ? "tab" : "tabs"}.`);
    setTimeout(() => setPinging(false), 2000);
  };
  const send = async () => {
    setError("");
    try {
      if (!title.trim() || !body.trim()) throw new Error("An alert title and message are required.");
      if (target === "user" && !selectedStudent) throw new Error("Choose the student who should receive this notification.");
      let destination = action.trim().replace(/^[/#]+/, "");
      const aliases: Record<string, string> = { announcements: "notices", polls: "voice?polls=1", feedback: "voice", finance: "finances" };
      destination = aliases[destination] ?? destination;
      if (destination && !["dashboard", "home", "events", "notices", "houses", "house", "voice", "tasks", "meetings", "directory", "gallery", "finances"].includes(destination.split("?")[0])) throw new Error("Use an internal hub link, such as /events, /announcements, or /polls.");
      const timestamp = Date.now();
      const pushResult = await sendFirebaseNotification({ title: title.trim(), body: body.trim(), urgent, audience, actionTab: destination || "notices", senderName: user.name });
      dispatch({ type: "BROADCAST", record: { id: uid(), title: title.trim(), body: body.trim(), urgent, audience, senderName: user.name, timestamp, delivered: matching.length }, notification: { id: uid(), title: title.trim(), body: body.trim(), urgent, audience, senderName: user.name, senderRole: user.role, timestamp, actionTab: destination || "notices", readBy: [], kind: "broadcast" } });
      const audienceText = audience.kind === "house" ? houseFullName(state.houses, audience.house) : audienceLabel(audience);
      setLastPushResult({ successCount: pushResult.targetedUsers, failureCount: 0, targetedDevices: pushResult.targetedUsers });
      announce(`Cloud inbox notification sent to ${pushResult.targetedUsers} provisioned users for ${audienceText.toLowerCase()}.`);
      setSent(true); setTitle(""); setBody(""); setUrgent(false); setStudentId("");
      setTimeout(() => setSent(false), 2500);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to send broadcast."); }
  };
  return <RevealBlocks>
    <section className="broadcast-banner">
      <div><span className="broadcast-symbol"><Bell className="h-5 w-5" /></span><h2>Push Notifications & Broadcast Hub <span className="live-label">LIVE PREVIEW</span></h2><p>Compose and broadcast in-app alerts to students and council officers.</p></div>
      <div className="stream-controls"><div className="stream-control"><Radio className="!text-emerald-400" /><div><strong>LIVE PUSH STREAM</strong><span>{devices.length} {devices.length === 1 ? "Device" : "Devices"} Online</span></div><div className="h-7 border-l border-white/15" /><button className="btn btn-green" onClick={ping}><Send />{pinging ? "Ping sent" : "Ping All Devices"}</button></div><div className="stream-control"><Smartphone /><div><strong>THIS BROWSER</strong><span><i className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${permission === "granted" ? "bg-emerald-400" : "bg-rose-400"}`} />{permission === "granted" ? "Enabled" : permission === "denied" ? "Blocked" : permission === "unsupported" ? "In-app only" : "Not enabled"}</span></div><div className="h-7 border-l border-white/15" /><button className="btn btn-primary !bg-[#6b58ff]" disabled={permission === "granted" || enabling} onClick={() => void enablePush()}>{enabling ? "Requesting..." : permission === "granted" ? "Push Enabled" : "Enable Push"}</button></div></div>
    </section>

    <div className="broadcast-columns">
      <section className="panel panel-pad"><div className="panel-heading"><h2><Megaphone />Compose Broadcast Push Alert</h2><span className="small-note !text-[9px]">In-App Synchronization</span></div>
        <form onSubmit={(e) => { e.preventDefault(); void send(); }}><div className="form-stack">
          <label className="form-field"><span>Alert Title *</span><input className="control" required maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Emergency Assembly Notice" /></label>
          <label className="form-field"><span>Alert Message Content *</span><textarea required className="control min-h-[100px] resize-y" rows={4} maxLength={1600} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type the message that will pop up on recipients' screens and appear in their notification feed..." /></label>
          <div className="form-grid"><label className="form-field"><span>Target Audience</span><select className="control" value={target} onChange={(e) => setTarget(e.target.value)}><option value="all">All Users & Students</option><option value="user">One student (personalized)</option><optgroup label="By role"><option value="role:council">Council Officers</option><option value="role:student">Students Only</option></optgroup><optgroup label="By house">{HOUSES.map((h) => <option key={h} value={`house:${h}`}>{houseFullName(state.houses, h as HouseKey)}</option>)}</optgroup><optgroup label="By grade">{GRADES.map((g) => <option key={g} value={`grade:${g}`}>Grade {g}</option>)}</optgroup></select></label><label className="form-field"><span>Notification Category</span><select className="control" value={category} onChange={(e) => { setCategory(e.target.value); const routes: Record<string, string> = { notice: "notices", event: "events", meeting: "meetings", poll: "voice?polls=1", houses: "houses" }; setAction(routes[e.target.value]); }}><option value="notice">Announcement / Notice</option><option value="event">Event Registration</option><option value="meeting">Council Meeting</option><option value="poll">Student Poll</option><option value="houses">House Points</option></select></label></div>
          {target === "user" && (
            <div className="form-grid">
              <label className="form-field"><span>Search student</span><input className="control" value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="Name, email, grade, or house" /></label>
              <label className="form-field"><span>Recipient</span><select required className="control" value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Choose a student</option>{studentMatches.map((s) => <option key={s.id} value={s.id}>{s.name} / {s.gradeLabel} / {s.houseLabel}</option>)}</select></label>
            </div>
          )}
          <div className="form-grid items-end"><label className="form-field"><span>Action / Redirect Link (Optional)</span><input className="control" value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. /announcements or /events" /></label><label className="urgent-toggle"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /><span><strong>Urgent High-Priority Alert</strong><small>Persistent in-app banner and priority chime</small></span></label></div>
          {error && <p className="inline-message error" role="alert">{error}</p>}
          {lastPushResult && <p className="inline-message success">Last Firestore inbox delivery: {lastPushResult.successCount} provisioned users targeted.</p>}
        </div><div className="dialog-actions"><span className="small-note mr-auto !text-[9px]">{firebaseAuth.currentUser ? "Firebase authenticated" : "Google sign-in required"} · {matching.length} live tabs</span><button type="submit" className="btn btn-primary">{sent ? <CircleCheck /> : <Send />}{sent ? "Notification Sent" : "Send Cloud Notification"}</button></div></form>
      </section>

      <aside className="space-y-5"><section className="panel panel-pad"><div className="panel-heading !mb-3 !border-0 !pb-0"><h3><Sparkles className="!text-amber-500" />One-Click Quick Templates</h3></div><p className="small-note mb-3 !text-[9px]">Click any standard template to autofill the composer:</p><div className="broadcast-templates">{TEMPLATES.map((template) => <button key={template.title} className="broadcast-template" onClick={() => { setTitle(template.title); setBody(template.body); setUrgent(template.urgent); setAction(template.action); setCategory(template.category); setError(""); }}><strong><template.icon />{template.title}</strong><p>{template.body}</p></button>)}</div></section>
        <section className="panel panel-pad !bg-[var(--surface-inset)]"><div className="panel-heading !mb-1"><h3 className="!text-[11px]"><Flame className="!text-orange-500" />Cloud Messaging & Push Engine</h3><span className={`status-label !text-[7px] ${firebaseAuth.currentUser && getVapidKey() ? "active" : "!border-amber-500/20"}`}>{firebaseAuth.currentUser && getVapidKey() ? "READY" : "SETUP REQUIRED"}</span></div><div className="integration-row !text-[10px]"><span>Firebase project</span><strong className="text-[var(--green)]">shristi-hub</strong></div><div className="integration-row !text-[10px]"><span>Google Auth</span><strong className={firebaseAuth.currentUser ? "text-[var(--green)]" : "text-amber-400"}>{firebaseAuth.currentUser?.email ?? "Not signed in"}</strong></div><div className="integration-row !text-[10px]"><span>Web Push VAPID</span><strong className={getVapidKey() ? "text-[var(--green)]" : "text-amber-400"}>{getVapidKey() ? "Configured" : "Missing"}</strong></div><p className="small-note mt-3 !text-[9px]">Foreground messages use Firebase Messaging. Background messages are handled by the registered service worker.</p></section>
      </aside>
    </div>

    <div className="mt-6 grid items-start gap-5 md:grid-cols-[1.7fr_1fr]"><section className="panel overflow-hidden"><div className="panel-caption"><h2 className="eyebrow flex items-center gap-2"><History className="h-3.5 w-3.5" />Broadcast History</h2><span className="small-note !text-[9px]">{state.broadcastHistory.length} records</span></div><div className="table-scroll"><table className="data-table !min-w-[540px]"><thead><tr><th>Notification</th><th>Audience</th><th>Sender / Sent</th></tr></thead><tbody>{state.broadcastHistory.map((record) => <tr key={record.id}><td><strong className="block max-w-[200px] truncate text-[10px]">{record.title}</strong><span className={`mt-1 inline-block text-[8px] ${record.urgent ? "text-rose-400" : "text-[var(--faint)]"}`}>{record.urgent ? "Urgent" : "Standard"}</span></td><td className="!text-[9px] text-[var(--muted)]">{record.audience.kind === "house" ? houseFullName(state.houses, record.audience.house) : audienceLabel(record.audience)}</td><td><span className="block text-[9px]">{record.senderName}</span><span className="mt-1 block text-[8px] text-[var(--faint)]">{relativeTime(record.timestamp)}</span></td></tr>)}</tbody></table></div></section><section className="panel panel-pad"><div className="panel-heading"><h3><Radio />Connected Devices</h3><span className="small-note">{devices.length} online</span></div>{devices.map((device) => <div key={device.id} className="integration-row"><span className="flex items-center gap-2">{device.kind === "mobile" ? <Smartphone className="h-4 w-4 text-[var(--purple)]" /> : <Monitor className="h-4 w-4 text-[var(--purple)]" />}<span><strong className="block text-[10px] text-[var(--text)]">{device.name}</strong><small className="text-[8px]">{houseFullName(state.houses, device.house as HouseKey)} / {device.kind}</small></span></span><span className="!text-[var(--green)] text-[9px]"><i className="status-dot animate-pulse-dot" />Live</span></div>)}</section></div>
  </RevealBlocks>;
}
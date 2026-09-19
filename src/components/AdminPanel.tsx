import { useEffect, useState } from "react";
import { Award, Bell, Building2, CheckSquare, CirclePlus, CloudOff, Database, DatabaseZap, Download, FileText, Flame, ImagePlus, Layers3, LockKeyhole, MessagesSquare, Palette, Search, Sheet, Shield, ShieldCheck, SlidersHorizontal, Star, Trash2, UserPlus, Users, Vote } from "lucide-react";
import { initials, relativeTime, useHub } from "../store/hub";
import { departmentFor, downloadJson, FEATURE_PERMISSIONS, PRIMARY_ADMIN_ID, publicRoster, ratingStats, taskDepartment } from "../lib/admin";
import { GRADE_VALUES, HOUSE_VALUES, INSTITUTIONAL_EMAIL_DOMAIN } from "../lib/ssot-auth";
import { renderRichText } from "../lib/content";

import { Modal } from "./ui";
import RosterTable from "./admin/RosterTable";
import CouncilControls, { type CouncilAction } from "./admin/CouncilControls";
import CouncilHubMembersPanel from "./admin/CouncilHubMembersPanel";
import SheetsConnection from "./admin/SheetsConnection";
import BrandingPanel from "./admin/BrandingPanel";
import FirebaseConnection from "./admin/FirebaseConnection";
import AdminNotificationsHub from "./AdminNotificationsHub";
import PollsAuditPanel from "./admin/PollsAuditPanel";

export default function AdminPanel() {
  const { state, user, activeTab, setActiveTab } = useHub();
  const params = new URLSearchParams(activeTab.split("?")[1] ?? "");
  const requestedSection = params.get("section") ?? "roster";
  const section = ["roster", "officers", "hub", "sheets", "departments", "polls", "branding", "images", "broadcast", "sync", "feedback", "terms"].includes(requestedSection) ? requestedSection : "roster";
  useEffect(() => {
    document.getElementById(`admin-tab-${section}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [section]);
  const officerCount = state.users.filter((u) => u.role !== "student" && (u.status === "active" || state.permissions[u.id])).length;
  const tabs = [
    { id: "roster", label: `Databases (${state.users.length})`, icon: Database },
    { id: "officers", label: `Council Officers (${officerCount})`, icon: Users },
    { id: "hub", label: `Council Hub (${state.councilHubMembers.length})`, icon: MessagesSquare },
    { id: "sheets", label: "Google Sheets", icon: Sheet },
    { id: "departments", label: `Departments (${state.departments.length})`, icon: Building2 },
    { id: "polls", label: `Polls & Surveys (${state.polls.length})`, icon: Vote },
    { id: "branding", label: "Branding & Content", icon: Palette },
    { id: "images", label: "Active Images (Max 5)", icon: Layers3 },
    { id: "broadcast", label: "Push Notifications", icon: Bell },
    { id: "sync", label: "Firestore Sync", icon: DatabaseZap },
    { id: "feedback", label: `Site Feedback (${state.siteRatings.length})`, icon: Star },
    { id: "terms", label: "Terms & Credits", icon: FileText },
  ];
  if (user?.role !== "admin") return <div className="empty-content"><LockKeyhole /><strong>Administrator access required</strong><p>Switch to the admin demo role to preview this workspace.</p></div>;
  const select = (id: string) => setActiveTab(`admin?section=${id}`);
  return (
    <div>
      <div className="admin-intro">
        <div><div className="admin-heading"><Shield /><h1>Council System<br />Administration</h1></div><p className="admin-description">Add or remove students, control Council Hub access, synchronize all site and branding data to Firestore, connect spreadsheets, reset credentials, manage executive roles, and customise platform branding.</p></div>
        <nav className="admin-tabs" role="tablist" aria-label="Administration sections">
          {tabs.map((tab, i) => <button key={tab.id} id={`admin-tab-${tab.id}`} role="tab" aria-selected={section === tab.id} aria-controls="admin-content" tabIndex={section === tab.id ? 0 : -1} onClick={() => select(tab.id)} onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]; select(next.id); requestAnimationFrame(() => document.getElementById(`admin-tab-${next.id}`)?.focus()); }
          }}><tab.icon /><span>{tab.label}</span></button>)}
        </nav>
      </div>
      <div role="tabpanel" id="admin-content" aria-labelledby={`admin-tab-${section}`} className="page-motion" key={section}>
        {section === "roster" ? <RosterTable /> : section === "officers" ? <OfficerPanel /> : section === "hub" ? <CouncilHubMembersPanel /> : section === "sheets" ? <SheetsConnection /> : section === "departments" ? <DepartmentsPanel /> : section === "polls" ? <PollsAuditPanel /> : section === "branding" ? <BrandingPanel /> : section === "images" ? <ActiveImages /> : section === "broadcast" ? <AdminNotificationsHub /> : section === "sync" ? <SyncPanel /> : section === "feedback" ? <FeedbackPanel /> : <TermsContent />}
      </div>
    </div>
  );
}

function OfficerPanel() {
  const { state, dispatch, announce, setActiveTab } = useHub();
  const [section, setSection] = useState("officers");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<CouncilAction | null>(null);
  const officers = state.users.filter((u) => u.role !== "student" && (u.status === "active" || state.permissions[u.id]) && `${u.name} ${u.email} ${u.councilTitle}`.toLowerCase().includes(query.toLowerCase()));
  const changeDepartment = (userId: string, department: string) => {
    try { dispatch({ type: "SET_DEPARTMENT", userId, department }); announce("Officer department updated."); }
    catch (e) { announce(e instanceof Error ? e.message : "Unable to update department.", "error"); }
  };
  return <>
    <div className="officer-toolbar"><div className="compact-tabs"><button className={section === "officers" ? "active" : ""} onClick={() => setSection("officers")}><Shield />Council Officers & Permissions <span className="ml-1 text-[9px]">{officers.length}</span></button><button className={section === "delegation" ? "active" : ""} onClick={() => setSection("delegation")}><CheckSquare />Task Delegation & Verification</button></div><button className="btn btn-primary" onClick={() => setAction({ kind: "appoint", source: "admin" })}><UserPlus />Add Executive Council Member</button></div>
    {section === "officers" ? <>
      <div className="officer-search"><div className="search-control"><Search /><input className="control !bg-[var(--surface)]" aria-label="Search council members" placeholder="Search council members, email or position..." value={query} onChange={(e) => setQuery(e.target.value)} /></div><p className="small-note text-[var(--faint)]">Showing <strong className="text-[var(--text)]">{officers.length}</strong> user accounts</p></div>
      <section className="panel overflow-hidden"><div className="panel-caption"><h2 className="eyebrow">Council Officers & System Clearances</h2><span className="eyebrow">Granular Access Controls</span></div><div className="table-scroll"><table className="data-table !min-w-[880px]"><thead><tr><th className="w-[27%]">Council Officer / User</th><th className="w-[30%]">Role & Department</th><th>Granular Feature Permissions</th><th className="actions-heading">Actions</th></tr></thead><tbody>{officers.map((officer) => <tr key={officer.id}>
        <td className="!py-5"><div className="member-inline"><span className="mini-avatar">{officer.avatarUrl ? <img src={officer.avatarUrl} alt="" /> : initials(officer.name)}</span><div><strong>{officer.name}</strong><span className="ml-2 text-[8px] text-[var(--green)]">{officer.status === "active" ? "Verified" : "Pending"}</span><small>{officer.email}</small><em>{officer.councilTitle === "President" ? "Council President" : officer.councilTitle}</em></div></div></td>
        <td><div className="officer-selects"><select className="control !w-[79px]" aria-label={`Role for ${officer.name}`} value={officer.role} disabled={officer.id === PRIMARY_ADMIN_ID} onChange={(e) => { if (e.target.value === "student") setAction({ kind: "remove", userId: officer.id }); }}><option value={officer.role}>{officer.role.toUpperCase()}</option><option value="student">STUDENT</option></select><select className="control" aria-label={`Department for ${officer.name}`} value={departmentFor(officer, state.departments)} onChange={(e) => changeDepartment(officer.id, e.target.value)}>{state.departments.map((d) => <option key={d}>{d}</option>)}</select></div></td>
        <td><span className="clearance"><Shield className="h-3 w-3" />{officer.role === "admin" ? "Full Administrator Clearance" : `${state.permissions[officer.id]?.length ?? 0} / ${FEATURE_PERMISSIONS.length} Features Enabled`}</span></td>
        <td><div className="flex justify-end gap-4"><button className="text-action" onClick={() => setAction({ kind: "permissions", userId: officer.id })}><SlidersHorizontal />Permissions</button><button className="text-action green" onClick={() => setAction({ kind: "delegate", userId: officer.id })}><CheckSquare />Delegate</button></div></td>
      </tr>)}</tbody></table></div>{!officers.length && <div className="empty-content m-5"><Users /><strong>No council members match this search</strong><p>Search by name, school email, or council title.</p></div>}</section>
    </> : <section className="panel panel-pad"><div className="panel-heading"><div><h2><CheckSquare />Task Delegation & Verification</h2><p>Assign work, then mark it complete so it appears under that department's completed milestones.</p></div><button className="btn btn-secondary" onClick={() => setActiveTab("directory")}>View department milestones</button></div><div className="table-scroll"><table className="data-table !min-w-[780px]"><thead><tr><th>Task</th><th>Officer</th><th>Department</th><th>Status</th><th className="actions-heading">Actions</th></tr></thead><tbody>{state.tasks.map((task) => {
      const officer = state.users.find((u) => u.id === task.assigneeId);
      const dept = taskDepartment(task, state.users, state.departments);
      return <tr key={task.id}><td className="font-semibold">{task.title}</td><td>{officer?.name ?? "Unassigned"}</td><td className="text-[var(--muted)]">{dept}</td><td><span className={task.status === "done" ? "status-label active" : "status-label"}>{task.status === "done" ? "Completed" : task.status === "review" ? "Under review" : task.status === "progress" ? "In progress" : "To do"}</span></td><td><div className="flex justify-end gap-3">{task.status !== "done" && <><button className="text-action" onClick={() => setAction({ kind: "delegate", userId: task.assigneeId })}>Reassign</button><button className="text-action green" onClick={() => { dispatch({ type: "MOVE_TASK", taskId: task.id, status: "done" }); announce(`"${task.title}" marked complete and added to ${dept} milestones.`); }}><CheckSquare />Mark complete</button></>}</div></td></tr>;
    })}</tbody></table></div></section>}
    {action && <CouncilControls key={`${action.kind}-${action.userId ?? "new"}`} action={action} onClose={() => setAction(null)} />}
  </>;
}

function DepartmentsPanel() {
  const { state, dispatch, announce } = useHub();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  return <section className="panel panel-pad">
    <div className="panel-heading"><div><h2><Building2 />Manage Council Departments</h2><p>Create, view, and remove student council departments. Changes update forms and filters across the portal immediately.</p></div></div>
    <p className="inline-message mb-4">These departments are used in officer assignments, task delegation, directory filters, and completed-milestone badges.</p>
    <form className="department-form" onSubmit={(e) => { e.preventDefault(); try { dispatch({ type: "ADD_DEPARTMENT", name }); announce(`${name.trim()} department added.`); setName(""); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "Unable to add department."); } }}><input className="control" aria-label="New department name" placeholder="Enter new department name (e.g. Environmental Care)..." required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /><button className="btn btn-primary" type="submit"><CirclePlus />Add Department</button></form>
    {error && !removing && <p role="alert" className="inline-message error mb-4">{error}</p>}
    <h3 className="eyebrow">Current Active Departments ({state.departments.length})</h3>
    <div className="department-grid">{state.departments.map((department) => <div key={department} className="department-row"><span><Building2 /></span><span>{department}</span><button className="icon-action red" aria-label={`Remove ${department} department`} title="Remove department" onClick={() => { setRemoving(department); setError(""); }}><Trash2 /></button></div>)}</div>
    <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove Council Department" icon={<Building2 />}><p className="inline-message">Remove <strong>{removing}</strong>? Officers and tasks currently in this department will move to General. The General department is always retained.</p>{error && <p role="alert" className="inline-message error mt-4">{error}</p>}<div className="dialog-actions"><button className="btn btn-secondary" onClick={() => setRemoving(null)}>Cancel</button><button className="btn btn-danger" onClick={() => { try { dispatch({ type: "DELETE_DEPARTMENT", name: removing! }); announce("Department removed."); setRemoving(null); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "Unable to remove department."); } }}><Trash2 />Remove department</button></div></Modal>
  </section>;
}

function ActiveImages() {
  const { state, dispatch, announce, setActiveTab } = useHub();
  const images = state.gallery.filter((g) => g.image);
  return <section className="panel panel-pad"><div className="panel-heading"><div><h2><Layers3 />Manage Active Images <span className="outline-count">{state.activeImageIds.length} / 5 active</span></h2><p>Choose up to five gallery images for the Home Portal. Your selection is saved locally.</p></div><button className="btn btn-primary" onClick={() => setActiveTab("gallery")}><ImagePlus />Manage gallery</button></div><div className="image-admin-grid">{images.map((photo) => <div key={photo.id} className="image-admin-item"><img src={photo.image} alt={photo.title} loading="lazy" /><div><h3>{photo.title}</h3><label><input type="checkbox" checked={state.activeImageIds.includes(photo.id)} onChange={(e) => { try { dispatch({ type: "SET_ACTIVE_IMAGE", imageId: photo.id, active: e.target.checked }); announce("Home Portal image selection saved."); } catch (err) { announce(err instanceof Error ? err.message : "Unable to update images.", "error"); } }} />Display on Home Portal</label></div></div>)}</div></section>;
}

function SyncPanel() {
  const { state } = useHub();
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
      <FirebaseConnection />
      <section className="panel panel-pad">
        <div className="panel-heading">
          <h2><Database />Local Administration Audit</h2>
        </div>
        {!state.audit.length ? (
          <div className="empty-content">
            <ShieldCheck />
            <strong>No administrative changes yet</strong>
            <p>Roster edits, permissions, and branding updates appear here.</p>
          </div>
        ) : (
          <div className="audit-list">
            {state.audit.slice(0, 16).map((entry) => (
              <div key={entry.id}>
                <span className="capitalize">
                  {entry.action}
                  <small>{entry.actor}</small>
                </span>
                <small className="whitespace-nowrap">{relativeTime(entry.timestamp)}</small>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FeedbackPanel() {
  const { state } = useHub();
  const stats = ratingStats(state.siteRatings);
  const recent = [...state.siteRatings].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.4fr]">
      <section className="panel panel-pad">
        <div className="panel-heading"><div><h2><Star className="!text-amber-400" />Site Rating Summary</h2><p>Live results from the Home Portal rating widget.</p></div></div>
        <div className="flex items-end gap-3">
          <p className="font-display text-6xl font-extrabold tabular-nums">{stats.count ? stats.average.toFixed(1) : "—"}</p>
          <div className="pb-2">
            <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((s) => <Star key={s} className={`h-4 w-4 ${Math.round(stats.average) >= s ? "fill-amber-400 text-amber-400" : "text-[var(--faint)]"}`} />)}</div>
            <p className="mt-1 text-[10px] text-[var(--muted)]">{stats.count} {stats.count === 1 ? "rating" : "ratings"} submitted</p>
          </div>
        </div>
        <div className="mt-5 space-y-2.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = stats.distribution[star - 1];
            const pct = stats.count ? Math.round((count / stats.count) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-2.5">
                <span className="flex w-10 items-center gap-1 text-[11px] font-bold tabular-nums">{star}<Star className="h-3 w-3 text-amber-400" /></span>
                <div className="rating-bar flex-1"><span style={{ width: `${pct}%` }} /></div>
                <span className="w-12 text-right text-[10px] tabular-nums text-[var(--muted)]">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel overflow-hidden">
        <div className="panel-caption"><h2 className="eyebrow">Individual ratings</h2><span className="small-note !text-[9px]">Latest {recent.length}</span></div>
        {!recent.length ? (
          <div className="empty-content m-5"><Star /><strong>No ratings yet</strong><p>Student ratings from the Home Portal will appear here.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table !min-w-[520px]">
              <thead><tr><th>Student</th><th>Rating</th><th>Comment</th><th>Submitted</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.userId}>
                    <td><strong className="block text-[11px]">{r.userName}</strong><span className="text-[9px] text-[var(--faint)]">{r.house} House</span></td>
                    <td><span className="flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((s) => <Star key={s} className={`h-3 w-3 ${s <= r.value ? "fill-amber-400 text-amber-400" : "text-[var(--faint)]"}`} />)}</span></td>
                    <td className="!whitespace-normal"><span className="block max-w-[220px] text-[10px] leading-relaxed text-[var(--muted)]">{r.comment || "—"}</span></td>
                    <td className="text-[9px] text-[var(--faint)]">{relativeTime(r.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function TermsContent({ creditsOnly = false }: { creditsOnly?: boolean }) {
  const { state } = useHub();
  const source = creditsOnly ? state.legal.credits : state.legal.terms;
  return <section className="panel panel-pad"><div className="panel-heading"><h2>{creditsOnly ? <Award /> : <FileText />}{creditsOnly ? "Platform Credits" : "Terms & Conditions"}</h2><span className="eyebrow">{state.branding.footerNote}</span></div><div className="terms-prose">
    {renderRichText(source).map((block) => (
      <div key={block.key}>{block.heading && <h3>{block.heading}</h3>}<p className="whitespace-pre-wrap">{block.body}</p></div>
    ))}
    {!creditsOnly && <p className="mt-6 text-[10px] text-[var(--faint)]">Administrators can edit this page in Admin Panel / Branding & Content.</p>}
  </div></section>;
}
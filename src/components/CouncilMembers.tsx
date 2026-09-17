import { useState } from "react";
import { Award, Building2, Camera, CheckSquare, CircleCheck, ExternalLink, Mail, Search, Shield, SlidersHorizontal, Tag } from "lucide-react";
import { fmtDate, initials, useHub } from "../store/hub";
import { departmentFor, FEATURE_PERMISSIONS, tasksForDepartment } from "../lib/admin";
import { GRADES } from "../lib/seed";
import { Modal } from "./ui";
import CouncilControls, { type CouncilAction } from "./admin/CouncilControls";

export default function CouncilMembers() {
  const { state, user, setActiveTab, dispatch, announce } = useHub();
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("all");
  const [role, setRole] = useState("all");
  const [area, setArea] = useState("all");
  const [milestone, setMilestone] = useState<string | null>(null);
  const [action, setAction] = useState<CouncilAction | null>(null);
  const admin = user?.role === "admin";
  const officers = state.users.filter((u) => u.role !== "student" && (u.status === "active" || state.permissions[u.id]));
  const filtered = officers.filter((u) => `${u.name} ${u.email} ${u.councilTitle} ${u.houseLabel} ${u.id}`.toLowerCase().includes(query.toLowerCase()) && (grade === "all" || u.grade === Number(grade)) && (role === "all" || u.role === role) && (area === "all" || departmentFor(u, state.departments) === area));
  const departmentTasks = milestone ? tasksForDepartment(milestone, state.tasks, state.users, state.departments) : [];
  const completed = departmentTasks.filter((t) => t.status === "done");
  const openWork = departmentTasks.filter((t) => t.status !== "done");
  return (
    <>
      <div className="directory-heading"><div><h1>Shristi Student Council Members <span className="outline-count">{officers.length} Executive {officers.length === 1 ? "Member" : "Members"}</span></h1><p>Meet the student council officers, manage council members, or click a department badge to explore completed milestones.</p></div>{admin && <button className="btn btn-primary mt-1" onClick={() => setAction({ kind: "appoint" })}><Shield />Add Student to Council</button>}</div>

      <section className="panel department-explorer"><h2 className="eyebrow">Explore Completed Tasks by Council Department</h2><p className="small-note mb-2">Departments match the Admin Panel list. Completed delegated work is archived here.</p><div className="department-chips">{state.departments.map((department) => <button key={department} onClick={() => setMilestone(department)}><Building2 />{department}<span>{tasksForDepartment(department, state.tasks, state.users, state.departments).filter((t) => t.status === "done").length} Done</span></button>)}</div></section>

      <div className="panel directory-filters"><div className="search-control"><Search /><input className="control" aria-label="Search council directory" placeholder="Search students by name, email, class, position, ID, or house..." value={query} onChange={(e) => setQuery(e.target.value)} /></div><select className="control" aria-label="Filter council by class" value={grade} onChange={(e) => setGrade(e.target.value)}><option value="all">All Classes</option>{GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select><select className="control" aria-label="Filter council by role" value={role} onChange={(e) => setRole(e.target.value)}><option value="all">All Roles</option><option value="admin">Admin</option><option value="council">Council</option></select><select className="control" aria-label="Filter council by department" value={area} onChange={(e) => setArea(e.target.value)}><option value="all">All Areas</option>{state.departments.map((d) => <option key={d}>{d}</option>)}</select></div>

      <section className="executive-section"><div className="panel-heading"><h2><Award />Student Council Executive Body</h2><span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[10px] font-semibold text-[var(--purple)]">{filtered.length} {filtered.length === 1 ? "Member" : "Members"} Listed</span></div>
        <div className="member-grid">{filtered.map((officer) => {
          const clearance = officer.role === "admin" ? FEATURE_PERMISSIONS.length : (state.permissions[officer.id]?.length ?? 0);
          return <article key={officer.id} className="executive-member">
            <button className="member-portrait" aria-label={`Update profile picture for ${officer.name}`} disabled={!admin && user?.id !== officer.id} onClick={() => setAction({ kind: "photo", userId: officer.id })}>{officer.avatarUrl ? <img src={officer.avatarUrl} alt={officer.name} /> : <span>{initials(officer.name)}</span>}{(admin || user?.id === officer.id) && <span className="portrait-edit"><Camera className="h-5 w-5" /></span>}</button>
            <div className="member-info"><h3>{officer.name}<CircleCheck className="verified-icon" /></h3><span className="council-title">{officer.councilTitle === "President" ? "Council President" : officer.councilTitle ?? "Council Officer"}</span><p className="member-email"><Mail /><span title={officer.email}>{officer.email}</span></p><button className="member-department" onClick={() => setMilestone(departmentFor(officer, state.departments))}><Tag />{departmentFor(officer, state.departments)} Department <ExternalLink /></button><p className="member-department !text-[var(--muted)]"><Shield className="!text-[var(--purple)]" />Clearances: <strong className="text-[var(--purple)]">{clearance}/{FEATURE_PERMISSIONS.length} Active</strong></p>
              {admin && <><div className="member-action-row"><button className="btn btn-outline" onClick={() => setAction({ kind: "permissions", userId: officer.id })}><SlidersHorizontal />Permissions</button><button className="btn border-emerald-500/20 bg-emerald-500/5 text-[var(--green)]" onClick={() => setAction({ kind: "delegate", userId: officer.id })}><CheckSquare />Delegate</button></div><button className="member-remove" onClick={() => setAction({ kind: "remove", userId: officer.id })}>Remove from Council</button></>}
            </div>
          </article>;
        })}</div>
        {!filtered.length && <div className="empty-content"><Search /><strong>No council members match your filters</strong><p>Try another name, class, role, or department.</p><button className="btn btn-secondary" onClick={() => { setQuery(""); setGrade("all"); setRole("all"); setArea("all"); }}>Clear filters</button></div>}
      </section>

      <Modal open={!!milestone} onClose={() => setMilestone(null)} title={<span>{milestone} Department <span className="ml-2 inline-block font-sans text-[10px] font-semibold text-[var(--purple)]">Completed Milestones</span></span>} icon={<Award className="!text-amber-500" />} subtitle={`${completed.length} tasks completed / ${openWork.length} active in backlog`}>
        <div className="form-stack">
          {openWork.length > 0 && admin && (
            <div>
              <p className="eyebrow mb-2">Open delegated work</p>
              {openWork.map((task) => (
                <div key={task.id} className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] p-4">
                  <div className="min-w-0"><h3 className="text-xs font-semibold">{task.title}</h3><p className="small-note mt-1">{state.users.find((s) => s.id === task.assigneeId)?.name} / {fmtDate(task.due)}</p></div>
                  <button className="btn btn-green !min-h-8 !px-3 !text-[9px]" onClick={() => { dispatch({ type: "MOVE_TASK", taskId: task.id, status: "done" }); announce(`"${task.title}" marked complete and added to ${milestone} milestones.`); }}>Mark complete</button>
                </div>
              ))}
            </div>
          )}
          {completed.length ? completed.map((task) => (
            <div key={task.id} className="rounded-xl border border-[var(--border)] p-4">
              <h3 className="flex items-center gap-2 text-xs font-semibold"><CircleCheck className="h-4 w-4 text-[var(--green)]" />{task.title}</h3>
              <p className="small-note mt-2">{task.details}</p>
              <p className="mt-3 text-[9px] text-[var(--faint)]">{state.users.find((s) => s.id === task.assigneeId)?.name} / {fmtDate(task.due)}</p>
            </div>
          )) : <div className="empty-content !min-h-[120px]"><CircleCheck /><strong>No completed tasks logged for {milestone} yet</strong><p>{admin ? "Mark a delegated task complete to archive it here." : "Completed department work will appear here."}</p></div>}
        </div>
        <div className="dialog-actions">{completed.length > 0 && <button className="btn btn-outline" onClick={() => { setMilestone(null); setActiveTab("tasks"); }}>View task board</button>}<button className="btn btn-secondary" onClick={() => setMilestone(null)}>Close View</button></div>
      </Modal>
      {action && <CouncilControls key={`${action.kind}-${action.userId ?? "new"}`} action={action} onClose={() => setAction(null)} />}
    </>
  );
}
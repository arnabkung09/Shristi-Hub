import { useState } from "react";
import { Award, Building2, Camera, CheckSquare, CircleCheck, ExternalLink, Mail, Pencil, Plus, Search, Shield, SlidersHorizontal, Tag, Trash2, Users } from "lucide-react";
import { fmtDate, initials, uid, useHub } from "../store/hub";
import { departmentFor, FEATURE_PERMISSIONS, tasksForDepartment } from "../lib/admin";
import { GRADES } from "../lib/seed";
import { RevealBlocks } from "./Effects";
import { HouseMark, Modal } from "./ui";
import CouncilControls, { type CouncilAction } from "./admin/CouncilControls";

function OfficerPortrait({
  name,
  avatarUrl,
  canEdit,
  onClick,
}: {
  name: string;
  avatarUrl?: string;
  canEdit: boolean;
  onClick: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <button
      className="member-portrait"
      aria-label={`Update profile picture for ${name}`}
      disabled={!canEdit}
      onClick={onClick}
    >
      {avatarUrl && !imgErr ? (
        <img src={avatarUrl} alt={name} onError={() => setImgErr(true)} />
      ) : (
        <span>{initials(name)}</span>
      )}
      {canEdit && (
        <span className="portrait-edit" title="Change profile picture">
          <Camera className="h-5 w-5" />
        </span>
      )}
    </button>
  );
}

export default function CouncilMembers() {
  const { state, user, setActiveTab, dispatch, announce, hasPermission } = useHub();
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("all");
  const [role, setRole] = useState("all");
  const [area, setArea] = useState("all");
  const [milestone, setMilestone] = useState<string | null>(null);
  const [action, setAction] = useState<CouncilAction | null>(null);

  // Completed task management within milestone modal
  const [addingTask, setAddingTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDetails, setNewDetails] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDetails, setEditDetails] = useState("");

  const admin = user?.role === "admin";
  const canManage = admin || hasPermission("tasks");
  const officers = state.users.filter((u) => u.role === "council" || u.role === "admin");
  const filtered = officers.filter(
    (u) =>
      `${u.name} ${u.email} ${u.councilTitle ?? ""} ${u.houseLabel ?? ""} ${u.id} ${departmentFor(u, state.departments)}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (grade === "all" || u.grade === Number(grade)) &&
      (role === "all" || u.role === role) &&
      (area === "all" || departmentFor(u, state.departments) === area)
  );
  const departmentTasks = milestone ? tasksForDepartment(milestone, state.tasks, state.users, state.departments) : [];
  const completed = departmentTasks.filter((t) => t.status === "done");
  const openWork = departmentTasks.filter((t) => t.status !== "done");

  const handleAddMilestoneTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !milestone) return;
    try {
      dispatch({
        type: "ADD_TASK",
        task: {
          id: uid(),
          title: newTitle.trim(),
          details: newDetails.trim(),
          due: new Date().toISOString().slice(0, 10),
          priority: "Medium",
          assigneeId: newAssignee,
          status: "done",
          createdBy: user?.name ?? "Council Officer",
          createdAt: Date.now(),
          completedAt: Date.now(),
          department: milestone,
        },
      });
      announce(`"${newTitle.trim()}" added to ${milestone} Department completed milestones.`);
      setNewTitle("");
      setNewDetails("");
      setNewAssignee("");
      setAddingTask(false);
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to add task.", "error");
    }
  };

  const handleSaveEdit = (taskId: string) => {
    if (!editTitle.trim()) return;
    try {
      dispatch({
        type: "EDIT_TASK",
        task: {
          id: taskId,
          title: editTitle.trim(),
          details: editDetails.trim(),
        },
      });
      announce("Milestone updated.");
      setEditingTaskId(null);
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to update milestone.", "error");
    }
  };

  const handleDeleteTask = (task: (typeof state.tasks)[0]) => {
    try {
      dispatch({ type: "DELETE_TASK", taskId: task.id });
      announce(`"${task.title}" removed from ${milestone} Department log.`);
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to remove task.", "error");
    }
  };

  const totalCompletedAcrossDepts = state.tasks.filter((t) => t.status === "done").length;

  return (
    <RevealBlocks>
      <div className="directory-heading">
        <div>
          <h1>
            Shristi Student Council Members{" "}
            <span className="outline-count">
              {officers.length} Executive {officers.length === 1 ? "Member" : "Members"}
            </span>
          </h1>
          <p>
            Meet the student council officers, manage council members &amp; portraits, or inspect tasks completed by each council department.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              className="btn btn-outline mt-1"
              onClick={() => setAction({ kind: "delegate" })}
            >
              <CheckSquare /> Delegate Task
            </button>
          )}
          {admin && (
            <button
              className="btn btn-primary mt-1"
              onClick={() => setAction({ kind: "appoint", source: "directory" })}
            >
              <Shield /> Add Member to Directory
            </button>
          )}
        </div>
      </div>

      <section className="panel department-explorer">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <h2 className="eyebrow">Tasks Done by Council Departments ({totalCompletedAcrossDepts} Total Completed)</h2>
            <p className="small-note mt-0.5">
              Departments match the Admin Panel &amp; Task Board. Click any department to view, log, or edit completed milestones.
            </p>
          </div>
          <button className="btn btn-secondary !min-h-7 !px-3 !text-[10px]" onClick={() => setActiveTab("tasks")}>
            <CheckSquare className="h-3.5 w-3.5" /> Open Full Task Board
          </button>
        </div>

        <div className="department-chips">
          {state.departments.map((department) => {
            const deptAll = tasksForDepartment(department, state.tasks, state.users, state.departments);
            const deptDone = deptAll.filter((t) => t.status === "done").length;
            return (
              <button key={department} onClick={() => setMilestone(department)}>
                <Building2 />
                {department}
                <span>{deptDone} Done</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.departments.map((department) => {
            const deptTasks = tasksForDepartment(department, state.tasks, state.users, state.departments);
            const deptDone = deptTasks.filter((t) => t.status === "done");
            const deptOpen = deptTasks.filter((t) => t.status !== "done");
            const deptOfficers = officers.filter((o) => departmentFor(o, state.departments) === department);
            return (
              <div
                key={department}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-3.5 flex flex-col justify-between gap-2.5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setMilestone(department)}
                      className="font-display text-xs font-bold hover:text-[var(--purple)] flex items-center gap-1.5 text-left"
                    >
                      <Building2 className="h-3.5 w-3.5 text-[var(--purple)] shrink-0" />
                      <span>{department} Department</span>
                    </button>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-500">
                      {deptDone.length} Done · {deptOpen.length} Open
                    </span>
                  </div>

                  <p className="mt-1 text-[10px] text-[var(--faint)] flex items-center gap-1">
                    <Users className="h-3 w-3 shrink-0" />
                    {deptOfficers.length
                      ? deptOfficers.map((o) => o.name).join(", ")
                      : "General Council Team"}
                  </p>

                  {deptDone.length > 0 ? (
                    <ul className="mt-2.5 space-y-1.5 border-t border-[var(--border)] pt-2">
                      {deptDone.slice(0, 3).map((t) => {
                        const assignee = state.users.find((u) => u.id === t.assigneeId);
                        return (
                          <li key={t.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
                            <CircleCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                                {t.title}
                              </span>
                              <span className="block text-[9px] text-[var(--faint)]">
                                {assignee ? assignee.name : "Department Team"} · {fmtDate(t.due)}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                      {deptDone.length > 3 && (
                        <li className="text-[10px] font-semibold text-[var(--purple)]">
                          +{deptDone.length - 3} more completed {deptDone.length - 3 === 1 ? "task" : "tasks"}
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="mt-2 border-t border-[var(--border)] pt-2 text-[10px] italic text-[var(--faint)]">
                      No completed tasks logged yet.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    className="btn btn-outline !min-h-7 !px-2.5 !py-1 !text-[10px] w-full justify-center"
                    onClick={() => setMilestone(department)}
                  >
                    <Award className="h-3 w-3" /> {canManage ? "View & Log Milestones" : "View Completed Log"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="panel directory-filters">
        <div className="search-control">
          <Search />
          <input
            className="control"
            aria-label="Search council directory"
            placeholder="Search council members by name, email, class, position, department, ID, or house..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="control"
          aria-label="Filter council by class"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value="all">All Classes</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <select
          className="control"
          aria-label="Filter council by role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="council">Council</option>
        </select>
        <select
          className="control"
          aria-label="Filter council by department"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          <option value="all">All Departments</option>
          {state.departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <section className="executive-section">
        <div className="panel-heading">
          <h2>
            <Award />
            Student Council Executive Body
          </h2>
          <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[10px] font-semibold text-[var(--purple)]">
            {filtered.length} {filtered.length === 1 ? "Member" : "Members"} Listed
          </span>
        </div>
        <div className="member-grid">
          {filtered.map((officer) => {
            const clearance =
              officer.role === "admin"
                ? FEATURE_PERMISSIONS.length
                : (state.permissions[officer.id]?.length ?? 0);
            const officerDept = departmentFor(officer, state.departments);
            const officerTasks = state.tasks.filter((t) => t.assigneeId === officer.id);
            const officerDoneCount = officerTasks.filter((t) => t.status === "done").length;
            const officerOpenCount = officerTasks.filter((t) => t.status !== "done").length;
            const canEditPhoto = Boolean(admin || user?.id === officer.id);

            return (
              <article key={officer.id} className="executive-member">
                <OfficerPortrait
                  name={officer.name}
                  avatarUrl={officer.avatarUrl}
                  canEdit={canEditPhoto}
                  onClick={() => setAction({ kind: "photo", userId: officer.id })}
                />
                <div className="member-info">
                  <div className="flex items-center justify-between gap-2">
                    <h3>
                      {officer.name}
                      <CircleCheck className="verified-icon" />
                    </h3>
                    {officer.house && <HouseMark house={officer.house} className="h-5 w-5 text-[8px] shrink-0" />}
                  </div>
                  <span className="council-title">
                    {officer.councilTitle === "President"
                      ? "Council President"
                      : (officer.councilTitle ?? "Council Officer")}
                    {officer.gradeLabel ? ` · ${officer.gradeLabel}` : ""}
                  </span>
                  <p className="member-email">
                    <Mail />
                    <span title={officer.email}>{officer.email}</span>
                  </p>
                  <button
                    className="member-department"
                    onClick={() => setMilestone(officerDept)}
                  >
                    <Tag />
                    {officerDept} Department <ExternalLink />
                  </button>
                  <p className="member-department !text-[var(--muted)]">
                    <Shield className="!text-[var(--purple)]" />
                    Clearances:{" "}
                    <strong className="text-[var(--purple)]">
                      {clearance}/{FEATURE_PERMISSIONS.length} Active
                    </strong>
                    {" · "}
                    <span className="text-emerald-500 font-semibold">
                      {officerDoneCount} Done
                    </span>
                    {officerOpenCount > 0 ? ` (${officerOpenCount} active)` : ""}
                  </p>
                  {(admin || user?.id === officer.id) && (
                    <>
                      <div className="member-action-row">
                        <button
                          className="btn btn-outline"
                          onClick={() => setAction({ kind: "photo", userId: officer.id })}
                          title="Upload or change portrait photo"
                        >
                          <Camera /> Photo
                        </button>
                        {admin && (
                          <>
                            <button
                              className="btn btn-outline"
                              onClick={() => setAction({ kind: "permissions", userId: officer.id })}
                            >
                              <SlidersHorizontal /> Permissions
                            </button>
                            <button
                              className="btn border-emerald-500/20 bg-emerald-500/5 text-[var(--green)]"
                              onClick={() => setAction({ kind: "delegate", userId: officer.id })}
                            >
                              <CheckSquare /> Delegate
                            </button>
                          </>
                        )}
                      </div>
                      {admin && (
                        <button
                          className="member-remove"
                          onClick={() => setAction({ kind: "remove", userId: officer.id, source: "directory" })}
                        >
                          Remove from Directory
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {!filtered.length && (
          <div className="empty-content">
            <Search />
            <strong>No council members match your filters</strong>
            <p>Try another name, class, role, or department.</p>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setQuery("");
                setGrade("all");
                setRole("all");
                setArea("all");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      <Modal
        open={!!milestone}
        onClose={() => {
          setMilestone(null);
          setAddingTask(false);
          setEditingTaskId(null);
        }}
        title={
          <span>
            {milestone} Department{" "}
            <span className="ml-2 inline-block font-sans text-[10px] font-semibold text-[var(--purple)]">
              Completed Milestones
            </span>
          </span>
        }
        icon={<Award className="!text-amber-500" />}
        subtitle={`${completed.length} tasks completed / ${openWork.length} active in backlog`}
      >
        <div className="form-stack">
          {canManage && (
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <span className="text-xs font-semibold text-[var(--muted)]">Manage {milestone} Log</span>
              <button
                type="button"
                className="btn btn-outline !min-h-7 !px-2.5 !text-[10px] !py-1"
                onClick={() => setAddingTask((v) => !v)}
              >
                <Plus className="h-3 w-3" />
                {addingTask ? "Cancel" : "Add Completed Task"}
              </button>
            </div>
          )}

          {addingTask && canManage && (
            <form onSubmit={handleAddMilestoneTask} className="rounded-xl border border-accent/20 bg-accent/5 p-3 space-y-2.5">
              <h4 className="text-xs font-bold text-accent">Log Completed Task for {milestone}</h4>
              <input
                className="control !text-xs !py-1.5"
                placeholder="Task or milestone title..."
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <textarea
                className="control !text-xs !py-1.5"
                rows={2}
                placeholder="Details or deliverables (optional)..."
                value={newDetails}
                onChange={(e) => setNewDetails(e.target.value)}
              />
              <select
                className="control !text-xs !py-1.5"
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
              >
                <option value="">Department Team (Unassigned)</option>
                {officers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({departmentFor(o, state.departments)})
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn btn-secondary !min-h-7 !px-2.5 !text-[10px]" onClick={() => setAddingTask(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary !min-h-7 !px-2.5 !text-[10px]">
                  <CircleCheck className="h-3 w-3" /> Save to Log
                </button>
              </div>
            </form>
          )}

          {openWork.length > 0 && canManage && (
            <div>
              <p className="eyebrow mb-2">Open delegated work in {milestone}</p>
              {openWork.map((task) => (
                <div key={task.id} className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] p-4">
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold">{task.title}</h3>
                    {task.details && <p className="small-note mt-1">{task.details}</p>}
                    <p className="small-note mt-1">
                      {state.users.find((s) => s.id === task.assigneeId)?.name || "Department Team"} / Due {fmtDate(task.due)}
                    </p>
                  </div>
                  <button
                    className="btn btn-green !min-h-8 !px-3 !text-[9px]"
                    onClick={() => {
                      dispatch({ type: "MOVE_TASK", taskId: task.id, status: "done" });
                      announce(`"${task.title}" marked complete and added to ${milestone} milestones.`);
                    }}
                  >
                    Mark complete
                  </button>
                </div>
              ))}
            </div>
          )}

          {completed.length ? (
            completed.map((task) => {
              const isEditing = editingTaskId === task.id;
              return (
                <div key={task.id} className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        className="control !text-xs !py-1.5"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                      <textarea
                        className="control !text-xs !py-1.5"
                        rows={2}
                        value={editDetails}
                        onChange={(e) => setEditDetails(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary !min-h-7 !px-2.5 !text-[10px]"
                          onClick={() => setEditingTaskId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary !min-h-7 !px-2.5 !text-[10px]"
                          onClick={() => handleSaveEdit(task.id)}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="flex items-center gap-2 text-xs font-semibold">
                          <CircleCheck className="h-4 w-4 text-[var(--green)] shrink-0" />
                          <span>{task.title}</span>
                        </h3>
                        {task.details && <p className="small-note mt-1.5">{task.details}</p>}
                        <p className="mt-2 text-[9px] text-[var(--faint)]">
                          {state.users.find((s) => s.id === task.assigneeId)?.name || "Department Team"} / {fmtDate(task.due)}
                        </p>
                      </div>

                      {canManage && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            className="icon-action text-slate-500 hover:text-slate-800"
                            title="Edit task"
                            onClick={() => {
                              setEditingTaskId(task.id);
                              setEditTitle(task.title);
                              setEditDetails(task.details || "");
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="icon-action red"
                            title="Remove from department log"
                            onClick={() => handleDeleteTask(task)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="empty-content !min-h-[120px]">
              <CircleCheck />
              <strong>No completed tasks logged for {milestone} yet</strong>
              <p>
                {canManage
                  ? "Mark an active task complete or click 'Add Completed Task' above to log achievements."
                  : "Completed department work will appear here."}
              </p>
            </div>
          )}
        </div>
        <div className="dialog-actions">
          <button
            className="btn btn-outline"
            onClick={() => {
              setMilestone(null);
              setActiveTab("tasks");
            }}
          >
            View Task Management Board
          </button>
          <button className="btn btn-secondary" onClick={() => setMilestone(null)}>
            Close View
          </button>
        </div>
      </Modal>
      {action && <CouncilControls key={`${action.kind}-${action.userId ?? "new"}`} action={action} onClose={() => setAction(null)} />}
    </RevealBlocks>
  );
}
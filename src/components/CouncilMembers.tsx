import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Award,
  Building2,
  Camera,
  CheckSquare,
  CircleCheck,
  ExternalLink,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Star,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import { fmtDate, initials, sortDirectoryOfficers, uid, useHub } from "../store/hub";
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
      type="button"
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
  const [activeView, setActiveView] = useState<"members" | "departments">("members");
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
  const [editDepartment, setEditDepartment] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editDue, setEditDue] = useState("");

  const admin = user?.role === "admin";
  const canManage = admin || hasPermission("tasks");
  const officers = state.users.filter((u) => u.role === "council" || u.role === "admin");

  const sortedOfficers = sortDirectoryOfficers(officers, state.directoryOrder);

  const filtered = sortedOfficers.filter(
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

  const totalCompletedAcrossDepts = state.tasks.filter((t) => t.status === "done").length;

  // Admin control: set officer to show first in the directory
  const handleShowFirst = (officerId: string) => {
    try {
      dispatch({ type: "MOVE_DIRECTORY_OFFICER", userId: officerId, direction: "top" });
      const officer = state.users.find((u) => u.id === officerId);
      announce(`Prioritized ${officer?.name ?? "Officer"} to show first in the Council Directory.`, "success");
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to prioritize officer.", "error");
    }
  };

  // Admin control: move officer up or down in directory order
  const handleMoveOfficer = (officerId: string, direction: "up" | "down") => {
    try {
      dispatch({ type: "MOVE_DIRECTORY_OFFICER", userId: officerId, direction });
      const officer = state.users.find((u) => u.id === officerId);
      announce(`Moved ${officer?.name ?? "Officer"} ${direction} in Directory.`, "success");
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to move officer.", "error");
    }
  };

  // Admin control: set officer department in directory
  const handleSetOfficerDepartment = (officerId: string, newDept: string) => {
    try {
      dispatch({ type: "SET_DEPARTMENT", userId: officerId, department: newDept });
      const officer = state.users.find((u) => u.id === officerId);
      announce(`Assigned ${officer?.name ?? "Officer"} to ${newDept} Department.`, "success");
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to assign department.", "error");
    }
  };

  // Admin control: reset directory ordering to default hierarchy
  const handleResetOrder = () => {
    try {
      dispatch({ type: "SET_DIRECTORY_ORDER", order: [] });
      announce("Directory order reset to default officer hierarchy.", "success");
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to reset order.", "error");
    }
  };

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

  const startEditingMilestoneTask = (task: (typeof state.tasks)[0], deptFallback?: string) => {
    const resolvedDept = task.department || deptFallback || milestone || state.departments[0] || "General";
    if (!milestone) {
      setMilestone(resolvedDept);
    }
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDetails(task.details || "");
    setEditDepartment(resolvedDept);
    setEditAssignee(task.assigneeId || "");
    setEditDue(task.due || new Date().toISOString().slice(0, 10));
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
          department: editDepartment || milestone || undefined,
          assigneeId: editAssignee,
          due: editDue || undefined,
        },
      });
      announce("Department log task updated.", "success");
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

  return (
    <RevealBlocks>
      {/* Header */}
      <div className="directory-heading flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold font-display text-slate-900 dark:text-white">
            Shristi Student Council Directory{" "}
            <span className="outline-count">
              {officers.length} Executive {officers.length === 1 ? "Member" : "Members"}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1.5 leading-relaxed">
            Browse the executive council members, manage directory priorities, or inspect milestones achieved by each department.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canManage && (
            <button
              type="button"
              className="btn btn-outline min-h-[38px] text-xs font-semibold"
              onClick={() => setAction({ kind: "delegate" })}
            >
              <CheckSquare /> Delegate Task
            </button>
          )}
          {admin && (
            <button
              type="button"
              className="btn btn-primary min-h-[38px] text-xs font-semibold"
              onClick={() => setAction({ kind: "appoint", source: "directory" })}
            >
              <Shield /> Add Member
            </button>
          )}
        </div>
      </div>

      {/* Togglable Segmented Control: Council Members vs Tasks Done by Departments */}
      <div className="directory-toggle-bar mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-1 items-center gap-1.5 p-1 rounded-xl bg-[var(--surface-inset)]">
            <button
              type="button"
              onClick={() => setActiveView("members")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-bold text-xs transition-all ${
                activeView === "members"
                  ? "bg-[var(--surface)] text-[var(--purple)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
              aria-pressed={activeView === "members"}
            >
              <Users className="h-4 w-4 shrink-0 text-[var(--purple)]" />
              <span>Council Members</span>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-[var(--purple)]">
                {officers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("departments")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-bold text-xs transition-all ${
                activeView === "departments"
                  ? "bg-[var(--surface)] text-[var(--purple)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
              aria-pressed={activeView === "departments"}
            >
              <Award className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>Tasks Done by Departments</span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                {totalCompletedAcrossDepts} Done
              </span>
            </button>
          </div>

          {activeView === "departments" && (
            <button
              type="button"
              className="btn btn-secondary !min-h-9 !text-xs shrink-0 self-stretch sm:self-auto justify-center"
              onClick={() => setActiveTab("tasks")}
            >
              <CheckSquare className="h-3.5 w-3.5" /> Full Task Board
            </button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* VIEW 1: COUNCIL MEMBERS DIRECTORY (TOGGLABLE VIEW)          */}
      {/* ============================================================ */}
      {activeView === "members" && (
        <div className="space-y-5 animate-fade-in">
          {/* Admin Priority Notice / Quick Help */}
          {admin && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 text-xs text-[var(--text)]">
              <div className="flex items-center gap-2.5">
                <Star className="h-4 w-4 text-amber-500 shrink-0" />
                <span>
                  <strong>Admin Directory Control:</strong> Use <strong>★ Show First</strong> or the <strong>↑</strong> and <strong>↓</strong> buttons on any member card to prioritize who is displayed first. You can also assign departments directly on each card.
                </span>
              </div>
              <button
                type="button"
                onClick={handleResetOrder}
                className="btn btn-outline !min-h-7 !px-2.5 !py-1 !text-[10px] shrink-0 self-end sm:self-auto"
                title="Reset to default leadership hierarchy"
              >
                <RotateCcw className="h-3 w-3" /> Reset Order
              </button>
            </div>
          )}

          {/* Directory Search & Filters (Mobile Responsive) */}
          <div className="panel directory-filters">
            <div className="search-control">
              <Search />
              <input
                className="control"
                aria-label="Search council directory"
                placeholder="Search council members by name, email, class, position, department, or ID..."
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

          {/* Council Executive Members Grid */}
          <section className="executive-section">
            <div className="panel-heading flex items-center justify-between gap-2">
              <h2>
                <Award />
                Student Council Executive Body
              </h2>
              <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[10px] font-semibold text-[var(--purple)]">
                {filtered.length} {filtered.length === 1 ? "Member" : "Members"} Shown
              </span>
            </div>

            <div className="member-grid">
              {filtered.map((officer, index) => {
                const clearance =
                  officer.role === "admin"
                    ? FEATURE_PERMISSIONS.length
                    : (state.permissions[officer.id]?.length ?? 0);
                const officerDept = departmentFor(officer, state.departments);
                const officerTasks = state.tasks.filter((t) => t.assigneeId === officer.id);
                const officerDoneCount = officerTasks.filter((t) => t.status === "done").length;
                const officerOpenCount = officerTasks.filter((t) => t.status !== "done").length;
                const canEditPhoto = Boolean(admin || user?.id === officer.id);
                const isFirst = index === 0;
                const isLast = index === filtered.length - 1;
                const isPinned = Boolean(officer.directoryPinned);

                return (
                  <article key={officer.id} className="executive-member">
                    <OfficerPortrait
                      name={officer.name}
                      avatarUrl={officer.avatarUrl}
                      canEdit={canEditPhoto}
                      onClick={() => setAction({ kind: "photo", userId: officer.id })}
                    />
                    <div className="member-info">
                      {/* Name & House Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <h3>
                          {officer.name}
                          <CircleCheck className="verified-icon" />
                        </h3>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isPinned && (
                            <span
                              className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[9px] font-bold text-amber-500 flex items-center gap-1"
                              title="Pinned to show first in Council Directory"
                            >
                              <Star className="h-2.5 w-2.5 fill-current" /> Pinned
                            </span>
                          )}
                          {officer.house && <HouseMark house={officer.house} className="h-5 w-5 text-[8px] shrink-0" />}
                        </div>
                      </div>

                      {/* Title & Grade */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="council-title">
                          {officer.councilTitle === "President"
                            ? "Council President"
                            : (officer.councilTitle ?? "Council Officer")}
                          {officer.gradeLabel ? ` · ${officer.gradeLabel}` : ""}
                        </span>
                        <span className="text-[10px] font-semibold text-[var(--faint)]">
                          #{index + 1}
                        </span>
                      </div>

                      {/* Email */}
                      <p className="member-email">
                        <Mail />
                        <span title={officer.email}>{officer.email}</span>
                      </p>

                      {/* Department: Editable by Admin directly in the Directory! */}
                      {admin ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-2">
                          <Building2 className="h-3.5 w-3.5 text-[var(--purple)] shrink-0" />
                          <span className="text-[10px] font-bold text-[var(--muted)]">Dept:</span>
                          <select
                            value={officerDept}
                            onChange={(e) => handleSetOfficerDepartment(officer.id, e.target.value)}
                            className="control !min-h-[28px] !py-0.5 !px-2 !text-[10px] font-bold text-[var(--purple)] flex-1 min-w-[120px] dark:bg-ink-800"
                            aria-label={`Set department for ${officer.name}`}
                          >
                            {state.departments.map((d) => (
                              <option key={d} value={d}>
                                {d} Department
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="member-department"
                          onClick={() => {
                            setActiveView("departments");
                            setMilestone(officerDept);
                          }}
                          title="View tasks completed by this department"
                        >
                          <Tag />
                          {officerDept} Department <ExternalLink className="h-3 w-3" />
                        </button>
                      )}

                      {/* Clearances & Task stats */}
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

                      {/* Admin Prioritization Controls: Show First, Move Up, Move Down */}
                      {admin && (
                        <div className="mt-2.5 pt-2 border-t border-[var(--border)] flex flex-wrap items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--faint)] mr-1">
                            Order:
                          </span>
                          {!isFirst ? (
                            <button
                              type="button"
                              className="btn btn-outline !min-h-[28px] !py-1 !px-2 !text-[9px] flex items-center gap-1"
                              onClick={() => handleShowFirst(officer.id)}
                              title="Show this officer first in the Council Directory"
                            >
                              <Star className="h-3 w-3 text-amber-500" /> Show First
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-[9px] font-bold text-amber-500">
                              <Star className="h-3 w-3 fill-current" /> Shown First
                            </span>
                          )}
                          <button
                            type="button"
                            className="icon-action !h-7 !w-7"
                            disabled={isFirst}
                            onClick={() => handleMoveOfficer(officer.id, "up")}
                            title="Move up in directory"
                            aria-label={`Move ${officer.name} up in directory`}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="icon-action !h-7 !w-7"
                            disabled={isLast}
                            onClick={() => handleMoveOfficer(officer.id, "down")}
                            title="Move down in directory"
                            aria-label={`Move ${officer.name} down in directory`}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Actions: Photo, Permissions, Delegate */}
                      {(admin || user?.id === officer.id) && (
                        <>
                          <div className="member-action-row">
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => setAction({ kind: "photo", userId: officer.id })}
                              title="Upload or change portrait photo"
                            >
                              <Camera /> Photo
                            </button>
                            {admin && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => setAction({ kind: "permissions", userId: officer.id })}
                                >
                                  <SlidersHorizontal /> Permissions
                                </button>
                                <button
                                  type="button"
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
                              type="button"
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
                  type="button"
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
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW 2: TASKS DONE BY DEPARTMENTS (TOGGLABLE VIEW)          */}
      {/* ============================================================ */}
      {activeView === "departments" && (
        <section className="panel department-explorer animate-fade-in p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="eyebrow flex items-center gap-1.5 text-xs">
                <Building2 className="h-4 w-4 text-[var(--purple)]" />
                <span>Tasks Done by Council Departments ({totalCompletedAcrossDepts} Total Completed)</span>
              </h2>
              <p className="small-note mt-1">
                Explore milestones achieved by each department or open any department to inspect completed tasks and log new work.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary !min-h-8 !px-3 !text-xs shrink-0 self-start sm:self-auto"
              onClick={() => setActiveTab("tasks")}
            >
              <CheckSquare className="h-3.5 w-3.5" /> Full Task Board
            </button>
          </div>

          {/* Department Quick Filter Chips */}
          <div className="department-chips mb-5">
            {state.departments.map((department) => {
              const deptAll = tasksForDepartment(department, state.tasks, state.users, state.departments);
              const deptDone = deptAll.filter((t) => t.status === "done").length;
              return (
                <button key={department} type="button" onClick={() => setMilestone(department)}>
                  <Building2 />
                  {department}
                  <span>{deptDone} Done</span>
                </button>
              );
            })}
          </div>

          {/* Department Cards Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.departments.map((department) => {
              const deptTasks = tasksForDepartment(department, state.tasks, state.users, state.departments);
              const deptDone = deptTasks.filter((t) => t.status === "done");
              const deptOpen = deptTasks.filter((t) => t.status !== "done");
              const deptOfficers = officers.filter((o) => departmentFor(o, state.departments) === department);
              return (
                <div
                  key={department}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-inset)] p-4 flex flex-col justify-between gap-3 shadow-sm hover:border-[var(--purple)] transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setMilestone(department)}
                        className="font-display text-sm font-bold hover:text-[var(--purple)] flex items-center gap-1.5 text-left"
                      >
                        <Building2 className="h-4 w-4 text-[var(--purple)] shrink-0" />
                        <span>{department} Department</span>
                      </button>
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        {deptDone.length} Done · {deptOpen.length} Open
                      </span>
                    </div>

                    <p className="mt-1.5 text-[11px] text-[var(--faint)] flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      {deptOfficers.length
                        ? deptOfficers.map((o) => o.name).join(", ")
                        : "General Council Team"}
                    </p>

                    {deptDone.length > 0 ? (
                      <ul className="mt-3 space-y-2 border-t border-[var(--border)] pt-2.5">
                        {deptDone.slice(0, 4).map((t) => {
                          const assignee = state.users.find((u) => u.id === t.assigneeId);
                          return (
                            <li key={t.id} className="flex items-start justify-between gap-2 text-xs leading-snug group">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <CircleCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <span className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                                    {t.title}
                                  </span>
                                  <span className="block text-[10px] text-[var(--faint)]">
                                    {assignee ? assignee.name : "Department Team"} · {fmtDate(t.due)}
                                  </span>
                                </div>
                              </div>
                              {canManage && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => startEditingMilestoneTask(t, department)}
                                    className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)] hover:border-[var(--purple)] hover:text-[var(--purple)] flex items-center gap-1 transition-colors"
                                    title="Edit this logged task"
                                  >
                                    <Pencil className="h-2.5 w-2.5" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTask(t)}
                                    className="rounded-md border border-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-500 hover:bg-red-500/10 flex items-center transition-colors"
                                    title="Delete this logged task"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                        {deptDone.length > 4 && (
                          <li className="text-[11px] font-semibold text-[var(--purple)]">
                            +{deptDone.length - 4} more completed {deptDone.length - 4 === 1 ? "task" : "tasks"}
                          </li>
                        )}
                      </ul>
                    ) : (
                      <p className="mt-2.5 border-t border-[var(--border)] pt-2.5 text-xs italic text-[var(--faint)]">
                        No completed tasks logged yet.
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[var(--border)]">
                    <button
                      type="button"
                      className="btn btn-outline !min-h-8 !px-3 !py-1 !text-xs w-full justify-center font-semibold"
                      onClick={() => setMilestone(department)}
                    >
                      <Award className="h-3.5 w-3.5" /> {canManage ? "View & Log Milestones" : "View Completed Log"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Milestone Modal */}
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
            <span className="ml-2 inline-block font-sans text-xs font-semibold text-[var(--purple)]">
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
                    type="button"
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
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--faint)] mb-1">
                          Task / Milestone Title
                        </label>
                        <input
                          className="control !text-xs !py-1.5"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="Milestone title"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--faint)] mb-1">
                            Department
                          </label>
                          <select
                            className="control !text-xs !py-1.5"
                            value={editDepartment || milestone || ""}
                            onChange={(e) => setEditDepartment(e.target.value)}
                          >
                            {state.departments.map((d) => (
                              <option key={d} value={d}>
                                {d} Department
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--faint)] mb-1">
                            Completed By
                          </label>
                          <select
                            className="control !text-xs !py-1.5"
                            value={editAssignee}
                            onChange={(e) => setEditAssignee(e.target.value)}
                          >
                            <option value="">Department Team</option>
                            {officers.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--faint)] mb-1">
                            Date
                          </label>
                          <input
                            type="date"
                            className="control !text-xs !py-1.5"
                            value={editDue}
                            onChange={(e) => setEditDue(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--faint)] mb-1">
                          Details / Outcome Notes
                        </label>
                        <textarea
                          className="control !text-xs !py-1.5"
                          rows={2}
                          value={editDetails}
                          onChange={(e) => setEditDetails(e.target.value)}
                          placeholder="Summary of deliverables or impact..."
                        />
                      </div>
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
                          Save Changes
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
                            onClick={() => startEditingMilestoneTask(task)}
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
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setMilestone(null);
              setActiveTab("tasks");
            }}
          >
            View Task Management Board
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setMilestone(null)}>
            Close View
          </button>
        </div>
      </Modal>

      {action && (
        <CouncilControls
          key={`${action.kind}-${action.userId ?? "new"}`}
          action={action}
          onClose={() => setAction(null)}
        />
      )}
    </RevealBlocks>
  );
}
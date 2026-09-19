import { useMemo, useState } from "react";
import {
  AlarmClock,
  Award,
  Building2,
  Calendar,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  GripVertical,
  Loader,
  Pencil,
  Plus,
  RotateCcw,
  ScanSearch,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react";
import { uid, useHub, fmtDate } from "../store/hub";
import { Avatar, Badge, Btn, Card, Field, Modal, SectionTitle, Select, inputCls } from "./ui";
import { TASK_PRIORITIES } from "../lib/seed";
import { cn } from "../utils/cn";
import type { CouncilTask, TaskPriority, TaskStatus } from "../lib/types";
import { departmentFor, taskDepartment } from "../lib/admin";

const COLUMNS: Array<{ id: TaskStatus; label: string; icon: React.ReactNode; accent: string }> = [
  { id: "todo", label: "To Do", icon: <CircleDashed className="h-4 w-4" />, accent: "text-slate-500 dark:text-slate-300" },
  { id: "progress", label: "In Progress", icon: <Loader className="h-4 w-4" />, accent: "text-blue-500 dark:text-blue-300" },
  { id: "review", label: "Under Review", icon: <ScanSearch className="h-4 w-4" />, accent: "text-amber-600 dark:text-amber-300" },
  { id: "done", label: "Completed", icon: <CheckCircle2 className="h-4 w-4" />, accent: "text-emerald-600 dark:text-emerald-300" },
];

const PRIORITY_TONE: Record<TaskPriority, "slate" | "blue" | "amber" | "red"> = {
  Low: "slate",
  Medium: "blue",
  High: "amber",
  Urgent: "red",
};

function defaultDueDate(days = 7) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

function dueMeta(due: string, status: TaskStatus) {
  const today = new Date().toISOString().slice(0, 10);
  if (status === "done") return { cls: "text-emerald-600 dark:text-emerald-300", label: `Done · ${fmtDate(due)}` };
  if (due < today) return { cls: "text-red-600 dark:text-red-300 font-bold", label: `Overdue · ${fmtDate(due)}` };
  if (due === today) return { cls: "text-amber-600 dark:text-amber-300 font-bold", label: "Due today" };
  return { cls: "text-slate-400", label: `Due ${fmtDate(due)}` };
}

export default function TaskManagement({ openNewOnMount = false }: { openNewOnMount?: boolean }) {
  const { state, user, dispatch, hasPermission, announce } = useHub();
  const canManage = hasPermission("tasks");

  // Board filters
  const [open, setOpen] = useState(openNewOnMount && canManage);
  const [mineOnly, setMineOnly] = useState(false);
  const [boardDeptFilter, setBoardDeptFilter] = useState<string>("all");

  // Drag and Drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [recentlyCompletedId, setRecentlyCompletedId] = useState<string | null>(null);

  // "Done by Department" Log state
  const [logDeptFilter, setLogDeptFilter] = useState<string>("all");
  const [logSearch, setLogSearch] = useState("");
  const [addLogOpen, setAddLogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<CouncilTask | null>(null);
  const [deletingTask, setDeletingTask] = useState<CouncilTask | null>(null);

  // New task form state
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    title: "",
    details: "",
    due: defaultDueDate(7),
    priority: "Medium" as TaskPriority,
    assigneeId: "",
    department: "",
  });

  // Direct completed task log form state
  const [addLogError, setAddLogError] = useState<string | null>(null);
  const [addLogForm, setAddLogForm] = useState({
    title: "",
    details: "",
    due: new Date().toISOString().slice(0, 10),
    priority: "Medium" as TaskPriority,
    assigneeId: "",
    department: "",
  });

  // Edit task form state
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    details: "",
    due: "",
    priority: "Medium" as TaskPriority,
    assigneeId: "",
    department: "",
  });

  const council = useMemo(
    () => state.users.filter((u) => u.role === "council" || u.role === "admin"),
    [state.users]
  );

  // Active tasks for the board
  const boardTasks = useMemo(() => {
    return state.tasks.filter((t) => {
      if (mineOnly && user && t.assigneeId !== user.id) return false;
      if (boardDeptFilter !== "all") {
        const dept = taskDepartment(t, state.users, state.departments);
        if (dept !== boardDeptFilter) return false;
      }
      return true;
    });
  }, [state.tasks, mineOnly, user, boardDeptFilter, state.users, state.departments]);

  // All completed tasks
  const completedTasks = useMemo(() => {
    return state.tasks.filter((t) => t.status === "done");
  }, [state.tasks]);

  // Completed task counts per department
  const deptCompletedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of state.departments) counts[d] = 0;
    for (const t of completedTasks) {
      const dept = taskDepartment(t, state.users, state.departments);
      counts[dept] = (counts[dept] ?? 0) + 1;
    }
    return counts;
  }, [completedTasks, state.departments, state.users]);

  // Filtered completed tasks for "Done by Department" section
  const filteredCompletedTasks = useMemo(() => {
    return completedTasks.filter((t) => {
      const dept = taskDepartment(t, state.users, state.departments);
      if (logDeptFilter !== "all" && dept !== logDeptFilter) return false;
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase();
        const officer = state.users.find((u) => u.id === t.assigneeId);
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDetails = t.details?.toLowerCase().includes(q);
        const matchesDept = dept.toLowerCase().includes(q);
        const matchesOfficer = officer?.name.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDetails && !matchesDept && !matchesOfficer) return false;
      }
      return true;
    });
  }, [completedTasks, logDeptFilter, logSearch, state.users, state.departments]);

  if (!user) return null;

  // Open creation modal with smart defaults
  const handleOpenCreate = () => {
    const initialDept = boardDeptFilter !== "all" ? boardDeptFilter : (state.departments[0] ?? "General");
    setCreateForm({
      title: "",
      details: "",
      due: defaultDueDate(7),
      priority: "Medium",
      assigneeId: "",
      department: initialDept,
    });
    setCreateError(null);
    setOpen(true);
  };

  // Open direct Add Completed Task modal
  const handleOpenAddLog = () => {
    const initialDept = logDeptFilter !== "all" ? logDeptFilter : (state.departments[0] ?? "General");
    setAddLogForm({
      title: "",
      details: "",
      due: new Date().toISOString().slice(0, 10),
      priority: "Medium",
      assigneeId: user.role === "council" ? user.id : "",
      department: initialDept,
    });
    setAddLogError(null);
    setAddLogOpen(true);
  };

  // Open edit modal for a completed task
  const handleOpenEdit = (task: CouncilTask) => {
    const dept = taskDepartment(task, state.users, state.departments);
    setEditingTask(task);
    setEditForm({
      title: task.title,
      details: task.details || "",
      due: task.due,
      priority: task.priority,
      assigneeId: task.assigneeId || "",
      department: dept,
    });
    setEditError(null);
  };

  // Create & delegate a new task
  const handleCreateTask = () => {
    if (!createForm.title.trim()) return setCreateError("Task title is required.");
    const chosenDept = createForm.department || (state.departments[0] ?? "General");
    const chosenDue = createForm.due || defaultDueDate(7);

    const newTask: CouncilTask = {
      id: uid(),
      title: createForm.title.trim(),
      details: createForm.details.trim(),
      due: chosenDue,
      priority: createForm.priority,
      assigneeId: createForm.assigneeId,
      status: "todo",
      createdBy: user.name,
      createdAt: Date.now(),
      department: chosenDept,
    };

    const notification = createForm.assigneeId
      ? {
          id: uid(),
          title: "New task assigned to you",
          body: `"${newTask.title}" — due ${fmtDate(newTask.due)} · ${newTask.priority} priority (${chosenDept} Dept).`,
          timestamp: Date.now(),
          urgent: newTask.priority === "Urgent",
          senderName: user.name,
          senderRole: user.role,
          audience: { kind: "user" as const, userId: createForm.assigneeId },
          actionTab: "tasks",
          readBy: [],
          kind: "system" as const,
        }
      : undefined;

    try {
      dispatch({ type: "ADD_TASK", task: newTask, notification });
      announce(`Task "${newTask.title}" delegated to ${chosenDept} Department.`);
      setOpen(false);
      setCreateError(null);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unable to create task.");
    }
  };

  // Save directly to "Done by Department" log
  const handleSaveAddLog = () => {
    if (!addLogForm.title.trim()) return setAddLogError("Task title is required.");
    const chosenDept = addLogForm.department || (state.departments[0] ?? "General");
    const chosenDue = addLogForm.due || new Date().toISOString().slice(0, 10);

    const newTask: CouncilTask = {
      id: uid(),
      title: addLogForm.title.trim(),
      details: addLogForm.details.trim(),
      due: chosenDue,
      priority: addLogForm.priority,
      assigneeId: addLogForm.assigneeId,
      status: "done",
      createdBy: user.name,
      createdAt: Date.now(),
      completedAt: Date.now(),
      department: chosenDept,
    };

    try {
      dispatch({ type: "ADD_TASK", task: newTask });
      announce(`"${newTask.title}" recorded in ${chosenDept} Department completed log!`, "success");
      setRecentlyCompletedId(newTask.id);
      setTimeout(() => setRecentlyCompletedId(null), 4000);
      setAddLogOpen(false);
      setAddLogError(null);
    } catch (err) {
      setAddLogError(err instanceof Error ? err.message : "Unable to log completed task.");
    }
  };

  // Save edits to a completed task
  const handleSaveEdit = () => {
    if (!editingTask) return;
    if (!editForm.title.trim()) return setEditError("Task title is required.");

    try {
      dispatch({
        type: "EDIT_TASK",
        task: {
          id: editingTask.id,
          title: editForm.title.trim(),
          details: editForm.details.trim(),
          due: editForm.due || editingTask.due,
          priority: editForm.priority,
          assigneeId: editForm.assigneeId,
          department: editForm.department,
          status: "done",
        },
      });
      announce(`"${editForm.title.trim()}" updated in department log.`);
      setEditingTask(null);
      setEditError(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Unable to update task.");
    }
  };

  // Remove task from log
  const handleConfirmDelete = () => {
    if (!deletingTask) return;
    const dept = taskDepartment(deletingTask, state.users, state.departments);
    try {
      dispatch({ type: "DELETE_TASK", taskId: deletingTask.id });
      announce(`"${deletingTask.title}" removed from ${dept} Department log.`);
      setDeletingTask(null);
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to remove task.", "error");
    }
  };

  // Reopen task back to In Progress
  const handleReopenTask = (task: CouncilTask) => {
    try {
      dispatch({ type: "MOVE_TASK", taskId: task.id, status: "progress" });
      announce(`"${task.title}" reopened to In Progress on the task board.`);
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to reopen task.", "error");
    }
  };

  // Drag-and-drop drop handler
  const handleDropTask = (taskId: string, targetCol: TaskStatus) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetCol) return;

    const dept = taskDepartment(task, state.users, state.departments);

    try {
      dispatch({ type: "MOVE_TASK", taskId: task.id, status: targetCol });
      if (targetCol === "done") {
        announce(`"${task.title}" completed and automatically logged to ${dept} Department records!`, "success");
        setRecentlyCompletedId(task.id);
        setTimeout(() => setRecentlyCompletedId(null), 4000);
      } else if (task.status === "done") {
        announce(`"${task.title}" reopened to ${COLUMNS.find((c) => c.id === targetCol)?.label ?? targetCol}.`);
      } else {
        announce(`"${task.title}" moved to ${COLUMNS.find((c) => c.id === targetCol)?.label ?? targetCol}.`);
      }
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to move task.", "error");
    }
  };

  // Check if an officer belongs to the selected department
  const isDeptOfficer = (officerId: string, department: string) => {
    const officer = state.users.find((u) => u.id === officerId);
    return officer ? departmentFor(officer, state.departments) === department : false;
  };

  return (
    <div className="space-y-8">
      {/* Page Title & Primary Actions */}
      <SectionTitle
        title="Task Management Board"
        subtitle={
          canManage
            ? "Drag tasks across columns to update their status. Dragging to Completed automatically logs them by department."
            : "Follow student council initiatives, delegated tasks, and completed department milestones."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {!canManage && (
              <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-[10px] font-semibold text-[var(--purple)]">
                Student View · Read-Only
              </span>
            )}

            <button
              onClick={() => setMineOnly((v) => !v)}
              className={cn(
                "min-h-[38px] rounded-xl border px-3 text-xs font-bold transition-all",
                mineOnly
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-black/10 text-slate-500 hover:border-black/20 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20"
              )}
            >
              Assigned to me
            </button>

            {/* Jump to Done by Department */}
            <button
              onClick={() => {
                const el = document.getElementById("done-by-department");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
            >
              <Award className="h-3.5 w-3.5" />
              <span>Done by Dept ({completedTasks.length})</span>
            </button>

            {canManage && (
              <Btn onClick={handleOpenCreate}>
                <Plus className="h-4 w-4" /> Delegate Task
              </Btn>
            )}
          </div>
        }
      />

      {/* Board Department Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Board Filter:</span>
        <button
          onClick={() => setBoardDeptFilter("all")}
          className={cn(
            "rounded-xl border px-2.5 py-1 text-xs font-semibold transition-all",
            boardDeptFilter === "all"
              ? "border-accent bg-accent text-white"
              : "border-black/10 bg-black/[0.02] text-slate-600 hover:border-black/20 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
          )}
        >
          All Departments ({state.tasks.length})
        </button>
        {state.departments.map((dept) => {
          const count = state.tasks.filter((t) => taskDepartment(t, state.users, state.departments) === dept).length;
          return (
            <button
              key={dept}
              onClick={() => setBoardDeptFilter(dept)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold transition-all",
                boardDeptFilter === dept
                  ? "border-accent bg-accent text-white"
                  : "border-black/10 bg-black/[0.02] text-slate-600 hover:border-black/20 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
              )}
            >
              <Building2 className="h-3 w-3" />
              <span>{dept}</span>
              <span className="opacity-75 font-normal">({count})</span>
            </button>
          );
        })}
      </div>

      {/* 4 Kanban Columns with Drag-and-Drop */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const colTasks = boardTasks.filter((t) => t.status === col.id);
          const isOver = dragOverCol === col.id;
          const isDoneCol = col.id === "done";

          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverCol !== col.id) setDragOverCol(col.id);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOverCol(col.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  if (dragOverCol === col.id) setDragOverCol(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
                if (taskId) handleDropTask(taskId, col.id);
                setDragOverCol(null);
                setDraggedTaskId(null);
              }}
              className={cn(
                "flex min-h-[260px] flex-col rounded-2xl border p-3 transition-all duration-200",
                isOver && isDoneCol
                  ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/40 dark:border-emerald-400 dark:bg-emerald-950/25 scale-[1.01]"
                  : isOver
                  ? "border-accent bg-accent/5 ring-2 ring-accent/30 scale-[1.01]"
                  : "border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02]"
              )}
            >
              {/* Column Header */}
              <div className="mb-3 flex items-center gap-2 px-1.5">
                <span className={col.accent}>{col.icon}</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{col.label}</span>
                <span className="ml-auto rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:bg-white/[0.08] dark:text-slate-300">
                  {colTasks.length}
                </span>
              </div>

              {/* Special Drop Notice for Completed Column */}
              {isOver && isDoneCol && (
                <div className="mb-2.5 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/20 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-200 animate-pulse">
                  <Sparkles className="h-3.5 w-3.5" /> Drop to complete & log to department!
                </div>
              )}

              {/* Tasks List */}
              <div className="flex-1 space-y-2.5">
                {colTasks.length === 0 && (
                  <p className="rounded-xl border border-dashed border-black/10 px-3 py-8 text-center text-xs text-slate-400 dark:border-white/10">
                    {col.id === "done" ? "No completed tasks yet" : "No tasks in this column"}
                  </p>
                )}
                {colTasks.map((t) => {
                  const canMove = user.role === "admin" || (canManage && (t.assigneeId === user.id || !t.assigneeId || user.role === "council"));
                  return (
                    <TaskCard
                      key={t.id}
                      task={t}
                      canMove={canMove}
                      isDragging={draggedTaskId === t.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggedTaskId(t.id);
                      }}
                      onDragEnd={() => {
                        setDraggedTaskId(null);
                        setDragOverCol(null);
                      }}
                      onMove={(status) => handleDropTask(t.id, status)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* DONE BY DEPARTMENT SECTION (EDITABLE LOG)                   */}
      {/* ============================================================ */}
      <section
        id="done-by-department"
        className="rounded-3xl border border-black/[0.08] bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-ink-900 sm:p-7"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <Award className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl flex items-center gap-2">
                  <span>Done by Department</span>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {completedTasks.length} Logged
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Verified log of completed tasks and department milestones. Dragging any task to the Completed column logs it here automatically.
                </p>
              </div>
            </div>
          </div>

          {canManage && (
            <Btn onClick={handleOpenAddLog} className="shrink-0">
              <Plus className="h-4 w-4" /> Add Completed Task
            </Btn>
          )}
        </div>

        {/* Filter Controls: Department Chips & Search Bar */}
        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-black/[0.06] pb-4 dark:border-white/[0.06]">
          {/* Department Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setLogDeptFilter("all")}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs font-bold transition-all",
                logDeptFilter === "all"
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                  : "border-black/10 bg-black/[0.02] text-slate-600 hover:border-black/20 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
              )}
            >
              All Departments ({completedTasks.length})
            </button>
            {state.departments.map((dept) => {
              const count = deptCompletedCounts[dept] ?? 0;
              return (
                <button
                  key={dept}
                  onClick={() => setLogDeptFilter(dept)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all",
                    logDeptFilter === dept
                      ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                      : "border-black/10 bg-black/[0.02] text-slate-600 hover:border-black/20 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
                  )}
                >
                  <Building2 className="h-3 w-3" />
                  <span>{dept}</span>
                  <span className={cn("rounded-full px-1.5 text-[10px]", logDeptFilter === dept ? "bg-white/20 text-white" : "bg-black/5 dark:bg-white/10")}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px] sm:w-72">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              className={cn(inputCls, "!pl-9 text-xs")}
              placeholder="Search completed log..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Log Entries List */}
        <div className="mt-5 space-y-3">
          {filteredCompletedTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 p-8 text-center dark:border-white/10">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500/40" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                No completed tasks logged for {logDeptFilter === "all" ? "any department" : `${logDeptFilter} Department`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {canManage
                  ? "Drag a task to the Completed column on the board above, or click '+ Add Completed Task' to record finished work."
                  : "Completed work for this department will appear here."}
              </p>
              {canManage && (
                <div className="mt-4">
                  <Btn variant="secondary" onClick={handleOpenAddLog}>
                    <Plus className="h-4 w-4" /> Add Completed Task to Log
                  </Btn>
                </div>
              )}
            </div>
          ) : (
            filteredCompletedTasks.map((task) => {
              const dept = taskDepartment(task, state.users, state.departments);
              const assignee = state.users.find((u) => u.id === task.assigneeId);
              const isRecent = task.id === recentlyCompletedId;

              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-all sm:flex-row sm:items-center",
                    isRecent
                      ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/40 dark:border-emerald-400 dark:bg-emerald-950/20"
                      : "border-black/[0.06] bg-black/[0.015] hover:border-black/15 dark:border-white/[0.06] dark:bg-white/[0.015] dark:hover:border-white/15"
                  )}
                >
                  {/* Task details */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                        {task.title}
                      </h4>
                      <Badge tone="indigo">
                        <Building2 className="h-3 w-3" />
                        {dept}
                      </Badge>
                      <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>
                      {isRecent && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          <Sparkles className="h-3 w-3" /> Just Logged
                        </span>
                      )}
                    </div>

                    {task.details && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 pl-7 leading-relaxed">
                        {task.details}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pl-7 text-[11px] text-slate-400 dark:text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Completed · {fmtDate(task.due)}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1.5">
                        {assignee ? (
                          <>
                            <Avatar name={assignee.name} house={assignee.house} size="sm" />
                            <span className="font-semibold text-slate-600 dark:text-slate-300">{assignee.name}</span>
                          </>
                        ) : (
                          <span className="font-semibold text-slate-500">Department Team</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Actions for log item */}
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
                      <button
                        onClick={() => handleOpenEdit(task)}
                        className="flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-black/20 hover:bg-black/5 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                        title="Edit this completed entry"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleReopenTask(task)}
                        className="flex items-center gap-1 rounded-lg border border-blue-500/20 bg-blue-500/5 px-2.5 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-500/10 dark:text-blue-400"
                        title="Reopen task and return to active board"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reopen</span>
                      </button>

                      <button
                        onClick={() => setDeletingTask(task)}
                        className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
                        title="Remove from department log"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* MODAL 1: SIMPLIFIED TASK DELEGATION MODAL                    */}
      {/* ============================================================ */}
      <Modal
        open={open && canManage}
        onClose={() => {
          setOpen(false);
          setCreateError(null);
        }}
        title="Delegate New Council Task"
        subtitle="Department assignment is front-and-center. Assign to a department and optionally designate a council officer."
      >
        <div className="space-y-4">
          {/* 1. Department Assignment (Front and Center!) */}
          <div className="rounded-2xl border border-accent/20 bg-accent/[0.03] p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Assign to Department <span className="text-red-500">*</span>
              </span>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-bold text-accent">
                {createForm.department || state.departments[0] || "General"}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {state.departments.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setCreateForm({ ...createForm, department: d })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all",
                    createForm.department === d
                      ? "border-accent bg-accent text-white shadow-sm"
                      : "border-black/10 bg-white text-slate-700 hover:border-accent/40 dark:border-white/10 dark:bg-ink-800 dark:text-slate-300"
                  )}
                >
                  <Building2 className="h-3 w-3" />
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Task Title */}
          <Field label="Task Title *">
            <input
              className={inputCls}
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              placeholder="e.g., Organize inter-house debate tournament"
              autoFocus
            />
          </Field>

          {/* 3. Assignee (Optional - Department Team or specific officer) */}
          <Field
            label="Assignee (Officer or Department Team)"
            hint="Leave as Department Team to assign to all department officers, or select an individual officer."
          >
            <Select
              value={createForm.assigneeId}
              onChange={(v) => {
                const officer = council.find((c) => c.id === v);
                setCreateForm({
                  ...createForm,
                  assigneeId: v,
                  department: officer ? departmentFor(officer, state.departments) : createForm.department,
                });
              }}
            >
              <option value="">
                Department Team ({createForm.department || "General"} Department — Unassigned)
              </option>
              <optgroup label={`★ Officers in ${createForm.department || "Selected Department"}`}>
                {council
                  .filter((c) => isDeptOfficer(c.id, createForm.department))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.councilPost ? `— ${c.councilPost}` : ""}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="All Council Officers">
                {council
                  .filter((c) => !isDeptOfficer(c.id, createForm.department))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.councilPost ? `— ${c.councilPost}` : ""}
                    </option>
                  ))}
              </optgroup>
            </Select>
          </Field>

          {/* 4. Deadline with Quick Presets */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Deadline
              </span>
              <div className="flex items-center gap-1">
                {[
                  { label: "Today", days: 0 },
                  { label: "Tomorrow", days: 1 },
                  { label: "3 Days", days: 3 },
                  { label: "1 Week", days: 7 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setCreateForm({ ...createForm, due: defaultDueDate(preset.days) })}
                    className="rounded-lg border border-black/10 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-accent hover:text-accent dark:border-white/10 dark:text-slate-300"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="date"
              className={inputCls}
              value={createForm.due}
              onChange={(e) => setCreateForm({ ...createForm, due: e.target.value })}
            />
          </div>

          {/* 5. Priority Selection */}
          <Field label="Priority">
            <div className="grid grid-cols-4 gap-1.5">
              {TASK_PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCreateForm({ ...createForm, priority: p })}
                  className={cn(
                    "rounded-xl border py-1.5 text-xs font-bold transition-all",
                    createForm.priority === p
                      ? "border-accent bg-accent text-white shadow-sm"
                      : "border-black/10 bg-black/[0.02] text-slate-600 hover:border-black/20 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>

          {/* 6. Details / Instructions (Optional) */}
          <Field label="Details / Instructions (Optional)">
            <textarea
              rows={3}
              className={inputCls}
              value={createForm.details}
              onChange={(e) => setCreateForm({ ...createForm, details: e.target.value })}
              placeholder="Guidelines, links, deliverables, or checklist for the department..."
            />
          </Field>

          {createError && (
            <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-600 dark:text-red-300">
              {createError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Btn>
            <Btn onClick={handleCreateTask}>
              <ClipboardList className="h-4 w-4" /> Delegate Task
            </Btn>
          </div>
        </div>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL 2: ADD COMPLETED TASK DIRECTLY TO LOG                  */}
      {/* ============================================================ */}
      <Modal
        open={addLogOpen}
        onClose={() => {
          setAddLogOpen(false);
          setAddLogError(null);
        }}
        title="Add Completed Task to Department Log"
        subtitle="Directly archive completed tasks and milestones into a department's records."
      >
        <div className="space-y-4">
          {/* Department Choice */}
          <Field label="Department *">
            <Select
              value={addLogForm.department}
              onChange={(v) => setAddLogForm({ ...addLogForm, department: v })}
            >
              {state.departments.map((d) => (
                <option key={d} value={d}>
                  {d} Department
                </option>
              ))}
            </Select>
          </Field>

          {/* Title */}
          <Field label="Completed Task / Milestone Title *">
            <input
              className={inputCls}
              value={addLogForm.title}
              onChange={(e) => setAddLogForm({ ...addLogForm, title: e.target.value })}
              placeholder="e.g., Finalized Term 2 Sports Day Schedule"
              autoFocus
            />
          </Field>

          {/* Assignee / Completed By */}
          <Field label="Completed By (Officer or Department Team)">
            <Select
              value={addLogForm.assigneeId}
              onChange={(v) => setAddLogForm({ ...addLogForm, assigneeId: v })}
            >
              <option value="">Department Team (General/Team work)</option>
              {council.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.councilPost ? `— ${c.councilPost}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          {/* Date & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Completion Date">
              <input
                type="date"
                className={inputCls}
                value={addLogForm.due}
                onChange={(e) => setAddLogForm({ ...addLogForm, due: e.target.value })}
              />
            </Field>

            <Field label="Priority">
              <Select
                value={addLogForm.priority}
                onChange={(v) => setAddLogForm({ ...addLogForm, priority: v as TaskPriority })}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Details */}
          <Field label="Details / Achievement Notes (Optional)">
            <textarea
              rows={3}
              className={inputCls}
              value={addLogForm.details}
              onChange={(e) => setAddLogForm({ ...addLogForm, details: e.target.value })}
              placeholder="Summary of results, links, or notes..."
            />
          </Field>

          {addLogError && (
            <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-600 dark:text-red-300">
              {addLogError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="secondary" onClick={() => setAddLogOpen(false)}>
              Cancel
            </Btn>
            <Btn onClick={handleSaveAddLog}>
              <CheckCircle2 className="h-4 w-4" /> Save to Department Log
            </Btn>
          </div>
        </div>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL 3: EDIT COMPLETED TASK ENTRY                           */}
      {/* ============================================================ */}
      <Modal
        open={!!editingTask}
        onClose={() => {
          setEditingTask(null);
          setEditError(null);
        }}
        title="Edit Department Log Entry"
        subtitle={editingTask ? `Update details for "${editingTask.title}"` : ""}
      >
        <div className="space-y-4">
          <Field label="Department *">
            <Select
              value={editForm.department}
              onChange={(v) => setEditForm({ ...editForm, department: v })}
            >
              {state.departments.map((d) => (
                <option key={d} value={d}>
                  {d} Department
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Task Title *">
            <input
              className={inputCls}
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              placeholder="Task title"
            />
          </Field>

          <Field label="Assignee / Completed By">
            <Select
              value={editForm.assigneeId}
              onChange={(v) => setEditForm({ ...editForm, assigneeId: v })}
            >
              <option value="">Department Team</option>
              {council.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.councilPost ? `— ${c.councilPost}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                className={inputCls}
                value={editForm.due}
                onChange={(e) => setEditForm({ ...editForm, due: e.target.value })}
              />
            </Field>

            <Field label="Priority">
              <Select
                value={editForm.priority}
                onChange={(v) => setEditForm({ ...editForm, priority: v as TaskPriority })}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Details / Notes">
            <textarea
              rows={3}
              className={inputCls}
              value={editForm.details}
              onChange={(e) => setEditForm({ ...editForm, details: e.target.value })}
              placeholder="Notes or deliverables..."
            />
          </Field>

          {editError && (
            <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-600 dark:text-red-300">
              {editError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="secondary" onClick={() => setEditingTask(null)}>
              Cancel
            </Btn>
            <Btn onClick={handleSaveEdit}>
              <CheckCircle2 className="h-4 w-4" /> Save Changes
            </Btn>
          </div>
        </div>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL 4: DELETE CONFIRMATION MODAL                           */}
      {/* ============================================================ */}
      <Modal
        open={!!deletingTask}
        onClose={() => setDeletingTask(null)}
        title="Remove from Department Log"
        icon={<Trash2 className="text-red-500" />}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Are you sure you want to remove{" "}
            <strong className="text-slate-900 dark:text-white">"{deletingTask?.title}"</strong> from the{" "}
            <strong>{deletingTask ? taskDepartment(deletingTask, state.users, state.departments) : ""} Department</strong>{" "}
            log?
          </p>
          <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300">
            This task entry will be permanently deleted from completed milestones and reports.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="secondary" onClick={() => setDeletingTask(null)}>
              Cancel
            </Btn>
            <Btn variant="danger" onClick={handleConfirmDelete}>
              <Trash2 className="h-4 w-4" /> Remove Entry
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TaskCard({
  task,
  canMove,
  isDragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  task: CouncilTask;
  canMove: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (status: TaskStatus) => void;
}) {
  const { state } = useHub();
  const assignee = state.users.find((u) => u.id === task.assigneeId);
  const dept = taskDepartment(task, state.users, state.departments);
  const due = dueMeta(task.due, task.status);

  return (
    <Card
      draggable={canMove}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "p-3.5 transition-all select-none",
        canMove ? "cursor-grab active:cursor-grabbing hover:border-accent/40 hover:-translate-y-0.5 hover:shadow-md" : "",
        isDragging ? "opacity-35 scale-95 border-accent ring-2 ring-accent/40" : ""
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0 flex-1">
          {canMove && (
            <span
              className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              title="Drag to move columns"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}
          <p className="text-sm font-bold leading-snug text-slate-900 dark:text-white break-words">
            {task.title}
          </p>
        </div>
        <span className="shrink-0">
          <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <Badge tone="indigo">
          <Building2 className="h-3 w-3" />
          {dept}
        </Badge>
      </div>

      {task.details && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {task.details}
        </p>
      )}

      <p className={cn("mt-2.5 flex items-center gap-1.5 text-[11px]", due.cls)}>
        <AlarmClock className="h-3.5 w-3.5 shrink-0" />
        <span>{due.label}</span>
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.05] pt-2.5 dark:border-white/[0.06]">
        {assignee ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={assignee.name} house={assignee.house} size="sm" />
            <span className="truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {assignee.name.split(" ")[0]}
            </span>
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-slate-400">Team</span>
        )}

        {canMove && (
          <select
            value={task.status}
            onChange={(e) => onMove(e.target.value as TaskStatus)}
            className="rounded-lg border border-black/10 bg-transparent px-1.5 py-0.5 text-[10px] font-bold text-slate-500 focus:outline-none dark:border-white/10 dark:text-slate-300 dark:[&>option]:bg-ink-800"
            aria-label="Move task status"
          >
            {COLUMNS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </Card>
  );
}

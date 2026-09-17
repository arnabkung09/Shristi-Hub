import { useMemo, useState } from "react";
import { AlarmClock, CheckCircle2, CircleDashed, ClipboardList, Loader, Plus, ScanSearch } from "lucide-react";
import { uid, useHub, fmtDate } from "../store/hub";
import { Avatar, Badge, Btn, Card, Field, Modal, SectionTitle, Select, inputCls } from "./ui";
import { TASK_PRIORITIES } from "../lib/seed";
import { cn } from "../utils/cn";
import type { CouncilTask, TaskPriority, TaskStatus } from "../lib/types";
import { departmentFor } from "../lib/admin";

const COLUMNS: Array<{ id: TaskStatus; label: string; icon: React.ReactNode; accent: string }> = [
  { id: "todo", label: "To Do", icon: <CircleDashed className="h-4 w-4" />, accent: "text-slate-500 dark:text-slate-300" },
  { id: "progress", label: "In Progress", icon: <Loader className="h-4 w-4" />, accent: "text-blue-500 dark:text-blue-300" },
  { id: "review", label: "Under Review", icon: <ScanSearch className="h-4 w-4" />, accent: "text-amber-600 dark:text-amber-300" },
  { id: "done", label: "Completed", icon: <CheckCircle2 className="h-4 w-4" />, accent: "text-emerald-600 dark:text-emerald-300" },
];

const PRIORITY_TONE: Record<TaskPriority, "slate" | "blue" | "amber" | "red"> = {
  Low: "slate", Medium: "blue", High: "amber", Urgent: "red",
};

function dueMeta(due: string, status: TaskStatus) {
  const today = new Date().toISOString().slice(0, 10);
  if (status === "done") return { cls: "text-emerald-600 dark:text-emerald-300", label: `Done · ${fmtDate(due)}` };
  if (due < today) return { cls: "text-red-600 dark:text-red-300 font-bold", label: `Overdue · ${fmtDate(due)}` };
  if (due === today) return { cls: "text-amber-600 dark:text-amber-300 font-bold", label: "Due today" };
  return { cls: "text-slate-400", label: `Due ${fmtDate(due)}` };
}

export default function TaskManagement({ openNewOnMount = false }: { openNewOnMount?: boolean }) {
  const { state, user, dispatch, hasPermission } = useHub();
  const canManage = hasPermission("tasks");
  const [open, setOpen] = useState(openNewOnMount && canManage);
  const [mineOnly, setMineOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", details: "", due: "", priority: "Medium" as TaskPriority, assigneeId: "", department: "" });

  const council = state.users.filter((u) => u.role === "council" || u.role === "admin");
  const tasks = useMemo(
    () => state.tasks.filter((t) => (mineOnly && user ? t.assigneeId === user.id : true)),
    [state.tasks, mineOnly, user]
  );

  if (!user) return null;

  const createTask = () => {
    if (!form.title.trim() || !form.due || !form.assigneeId) return setError("Title, deadline and assignee are required.");
    const assignee = council.find((c) => c.id === form.assigneeId);
    dispatch({
      type: "ADD_TASK",
      task: {
        id: uid(), title: form.title.trim(), details: form.details.trim(), due: form.due,
        priority: form.priority, assigneeId: form.assigneeId, status: "todo",
        createdBy: user.name, createdAt: Date.now(), department: form.department || (assignee ? departmentFor(assignee, state.departments) : (state.departments[0] ?? "General")),
      },
      notification: {
        id: uid(), title: "New task assigned to you", body: `"${form.title.trim()}" — due ${fmtDate(form.due)} · ${form.priority} priority.`,
        timestamp: Date.now(), urgent: form.priority === "Urgent",
        senderName: user.name, senderRole: user.role,
        audience: { kind: "user", userId: form.assigneeId },
        actionTab: "tasks", readBy: [], kind: "system",
      },
    });
    setOpen(false); setError(null);
    setForm({ title: "", details: "", due: "", priority: "Medium", assigneeId: "", department: "" });
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Task Management Board"
        subtitle="Internal pipeline for council officers — updates propagate to every officer instantly"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMineOnly((v) => !v)}
              className={cn(
                "min-h-[40px] rounded-xl border px-3.5 text-xs font-bold transition-all",
                mineOnly ? "border-accent/50 bg-accent/10 text-accent" : "border-black/10 text-slate-500 dark:border-white/10 dark:text-slate-300"
              )}
            >
              Assigned to me
            </button>
            {canManage && <Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New Task</Btn>}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className="flex min-h-[220px] flex-col rounded-2xl border border-black/[0.06] bg-black/[0.02] p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="mb-3 flex items-center gap-2 px-1.5">
                <span className={col.accent}>{col.icon}</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{col.label}</span>
                <span className="ml-auto rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:bg-white/[0.08] dark:text-slate-300">
                  {colTasks.length}
                </span>
              </div>

              <div className="flex-1 space-y-2.5">
                {colTasks.length === 0 && (
                  <p className="rounded-xl border border-dashed border-black/10 px-3 py-6 text-center text-xs text-slate-400 dark:border-white/10">No tasks</p>
                )}
                {colTasks.map((t) => <TaskCard key={t.id} task={t} />)}
              </div>
            </div>
          );
        })}
      </div>

      {/* New task modal */}
      <Modal open={open && canManage} onClose={() => { setOpen(false); setError(null); }} title="New Council Task">
        <div className="space-y-4">
          <Field label="Task title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Print finalist certificates" /></Field>
          <Field label="Details / instructions"><textarea rows={3} className={inputCls} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Context, links, definitions of done…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deadline"><input type="date" className={inputCls} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                {TASK_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Assignee (council roster)">
            <Select value={form.assigneeId} onChange={(v) => {
              const officer = council.find((c) => c.id === v);
              setForm({ ...form, assigneeId: v, department: officer ? departmentFor(officer, state.departments) : form.department });
            }}>
              <option value="">Select officer…</option>
              {council.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.councilPost ? ` — ${c.councilPost}` : ""}</option>
              ))}
            </Select>
          </Field>
          <Field label="Department">
            <Select value={form.department} onChange={(v) => setForm({ ...form, department: v })}>
              <option value="">Use officer's department</option>
              {state.departments.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>
          <p className="rounded-xl bg-accent/[0.08] px-3.5 py-2.5 text-xs font-medium text-accent">
            The assignee receives a direct in-app notification the moment you create this task.
          </p>
          {error && <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn onClick={createTask}><ClipboardList className="h-4 w-4" /> Assign task</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TaskCard({ task }: { task: CouncilTask }) {
  const { state, user, dispatch, hasPermission } = useHub();
  const assignee = state.users.find((u) => u.id === task.assigneeId);
  const due = dueMeta(task.due, task.status);
  const canMove = user?.role === "admin" || (hasPermission("tasks") && task.assigneeId === user?.id);

  return (
    <Card className="p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold leading-snug text-slate-900 dark:text-white">{task.title}</p>
        <span className="flex shrink-0 items-center gap-1">
          <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>
        </span>
      </div>
      <p className="mt-1.5 text-[10px] font-semibold text-accent">{task.department ?? (assignee ? departmentFor(assignee, state.departments) : "General")}</p>
      {task.details && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{task.details}</p>}

      <p className={cn("mt-2.5 flex items-center gap-1.5 text-[11px]", due.cls)}>
        <AlarmClock className="h-3.5 w-3.5" /> {due.label}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.05] pt-2.5 dark:border-white/[0.06]">
        {assignee ? (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={assignee.name} house={assignee.house} size="sm" />
            <span className="truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">{assignee.name.split(" ")[0]}</span>
          </span>
        ) : <span className="text-[11px] text-slate-400">Unassigned</span>}

        {canMove && (
          <select
            value={task.status}
            onChange={(e) => dispatch({ type: "MOVE_TASK", taskId: task.id, status: e.target.value as TaskStatus })}
            className="rounded-lg border border-black/10 bg-transparent px-1.5 py-1 text-[10px] font-bold text-slate-500 focus:outline-none dark:border-white/10 dark:text-slate-300 dark:[&>option]:bg-ink-800"
          >
            {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
      </div>
    </Card>
  );
}

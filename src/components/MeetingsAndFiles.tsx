import { useMemo, useState } from "react";
import {
  BookMarked, CalendarPlus, Clock, Download, FileText, FileCheck2, ListOrdered,
  MapPin, Search, Users,
} from "lucide-react";
import { uid, useHub, fmtDate } from "../store/hub";
import { RevealBlocks } from "./Effects";
import { Avatar, Badge, Btn, Card, EmptyState, Field, Modal, Select, Tabs, inputCls } from "./ui";
import { RESOURCES } from "../lib/seed";
import { cn } from "../utils/cn";
import type { Meeting } from "../lib/types";
import { downloadResource, resourceText } from "../lib/resources";

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const { state, user, hasPermission, dispatch } = useHub();
  const canManage = hasPermission("meetings");
  const [open, setOpen] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState(meeting.minutes ?? "");
  const upcoming = meeting.date >= new Date().toISOString().slice(0, 10);

  return (
    <Card className="p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.06] dark:hover:shadow-black/30">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={upcoming ? "emerald" : "slate"}>{upcoming ? "Upcoming" : "Concluded"}</Badge>
        {meeting.minutes ? <Badge tone="indigo"><FileCheck2 className="h-3 w-3" /> Minutes recorded</Badge> : !upcoming && <Badge tone="amber">Minutes pending</Badge>}
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-slate-400">{fmtDate(meeting.date)}</span>
      </div>

      <h3 className="mt-2.5 font-display text-base font-bold text-slate-900 dark:text-white">{meeting.title}</h3>

      <div className="mt-2.5 grid grid-cols-2 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-accent" /> {meeting.startTime} — {meeting.endTime}</span>
        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-accent" /> {meeting.venue}</span>
      </div>

      <div className="mt-3">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          <ListOrdered className="h-3.5 w-3.5" /> Agenda
        </p>
        <ol className="mt-1.5 space-y-1">
          {meeting.agenda.map((a, i) => (
            <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-accent">{i + 1}.</span> {a}
            </li>
          ))}
        </ol>
      </div>

      {meeting.minutes && (
        <div className="mt-3 rounded-xl bg-black/[0.03] px-3.5 py-3 dark:bg-white/[0.04]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Minutes of Meeting</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{meeting.minutes}</p>
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
        <div className="flex items-center">
          {meeting.attendeeIds.slice(0, 5).map((id) => {
            const u = state.users.find((x) => x.id === id);
            return u ? <Avatar key={id} name={u.name} house={u.house} size="sm" ring className="-ml-1.5 first:ml-0" /> : null;
          })}
          <span className="ml-2 flex items-center gap-1 text-[11px] text-slate-400">
            <Users className="h-3 w-3" /> {meeting.attendeeIds.length}
          </span>
        </div>
        {canManage && (
          <Btn variant="secondary" className="min-h-[34px] text-[11px]" onClick={() => { setMinutesDraft(meeting.minutes ?? ""); setOpen(true); }}>
            {meeting.minutes ? "Edit minutes" : "Record minutes"}
          </Btn>
        )}
      </div>

      {canManage && user && (
        <Modal open={open} onClose={() => setOpen(false)} title="Record Minutes of Meeting">
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Formal record for <strong>{meeting.title}</strong> — decisions, action items and owners.
            </p>
            <textarea
              rows={7} className={inputCls} value={minutesDraft} onChange={(e) => setMinutesDraft(e.target.value)}
              placeholder="e.g., Budget approved 11-1. Action: V. Reddy to confirm AV vendor by Friday…"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setOpen(false)}>Cancel</Btn>
              <Btn disabled={minutesDraft.trim().length < 10} onClick={() => { dispatch({ type: "SAVE_MINUTES", meetingId: meeting.id, minutes: minutesDraft.trim() }); setOpen(false); }}>
                <FileCheck2 className="h-4 w-4" /> Save minutes
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

export default function MeetingsAndFiles() {
  const { state, user, dispatch, hasPermission } = useHub();
  const [tab, setTab] = useState("meetings");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [resourceId, setResourceId] = useState<string | null>(null);
  const selectedResource = RESOURCES.find((r) => r.id === resourceId);
  const [form, setForm] = useState({ title: "", date: "", startTime: "15:30", endTime: "16:30", venue: "", agenda: "" });

  const categories = useMemo(() => ["All", ...Array.from(new Set(RESOURCES.map((r) => r.category)))], []);
  const resources = useMemo(() => {
    const q = search.trim().toLowerCase();
    return RESOURCES
      .filter((r) => (catFilter === "All" ? true : r.category === catFilter))
      .filter((r) => (q ? r.title.toLowerCase().includes(q) || r.tag.toLowerCase().includes(q) : true));
  }, [search, catFilter]);

  if (!user) return null;
  const council = state.users.filter((u) => u.role === "council" || u.role === "admin");

  const schedule = () => {
    if (!form.title.trim() || !form.date || !form.venue.trim()) return setError("Title, date and venue are required.");
    dispatch({
      type: "ADD_MEETING",
      meeting: {
        id: uid(), title: form.title.trim(), date: form.date, startTime: form.startTime, endTime: form.endTime,
        venue: form.venue.trim(), attendeeIds: council.map((c) => c.id),
        agenda: form.agenda.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8),
      },
    });
    setOpen(false); setError(null);
    setForm({ title: "", date: "", startTime: "15:30", endTime: "16:30", venue: "", agenda: "" });
  };

  const canManage = hasPermission("meetings");

  return (
    <div className="space-y-6">
      <RevealBlocks>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={[
            { id: "meetings", label: "Meetings & Minutes", icon: <BookMarked className="h-4 w-4" /> },
            { id: "files", label: "Resource Library", icon: <FileText className="h-4 w-4" /> },
          ]}
          active={tab}
          onChange={setTab}
        />
        {canManage && tab === "meetings" && (
          <Btn onClick={() => setOpen(true)}><CalendarPlus className="h-4 w-4" /> Schedule Meeting</Btn>
        )}
      </div>

      {tab === "meetings" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...state.meetings]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((m) => <MeetingCard key={m.id} meeting={m} />)}
        </div>
      ) : (
        <>
          <Card className="p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className={`${inputCls} pl-10`}
                  placeholder="Search documents by title or tag (PDF, DOCX)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={catFilter} onChange={setCatFilter} className="md:!w-56">
                {categories.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </div>
          </Card>

          {resources.length === 0 ? (
            <EmptyState icon={<FileText className="h-8 w-8" />} title="No documents found" hint="Try a different search or category." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {resources.map((r) => (
                <Card key={r.id} className="group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.06] dark:hover:shadow-black/30">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent">
                      <FileText className="h-5 w-5" />
                    </span>
                    <Badge tone="slate">Template</Badge>
                  </div>
                  <h3 className="mt-3 text-sm font-bold leading-snug text-slate-900 dark:text-white">{r.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">{r.category}</p>
                  <div className="mt-auto flex items-center justify-between pt-4">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{r.updated} / Preview</span>
                    <button aria-label={`View ${r.title}`} title="View and download template" onClick={() => setResourceId(r.id)} className={cn(
                      "grid h-8 w-8 place-items-center rounded-lg border border-black/10 text-slate-400 transition-all group-hover:border-accent group-hover:text-accent",
                      "dark:border-white/10"
                    )}>
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={!!selectedResource} onClose={() => setResourceId(null)} title={selectedResource?.title ?? "Resource preview"} icon={<FileText />} wide>
        {selectedResource && <><pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-5 font-sans text-xs leading-relaxed text-[var(--muted)]">{resourceText(selectedResource)}</pre><div className="dialog-actions"><button className="btn btn-secondary" onClick={() => setResourceId(null)}>Close view</button><button className="btn btn-primary" onClick={() => downloadResource(selectedResource)}><Download />Download TXT template</button></div></>}
      </Modal>

      {/* Schedule modal */}
      <Modal open={open && canManage} onClose={() => { setOpen(false); setError(null); }} title="Schedule Meeting / Plan Agenda">
        <div className="space-y-4">
          <Field label="Meeting title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Founders' Week Planning Sync" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date"><input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Start"><input type="time" className={inputCls} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
            <Field label="End"><input type="time" className={inputCls} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
          </div>
          <Field label="Venue"><input className={inputCls} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="e.g., Council Room, Admin Block" /></Field>
          <Field label="Agenda items" hint="One item per line (max 8).">
            <textarea rows={4} className={inputCls} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} placeholder={"Budget approval\nHouse points audit\nSuggestion digest"} />
          </Field>
          {error && <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn onClick={schedule}><CalendarPlus className="h-4 w-4" /> Schedule meeting</Btn>
          </div>
        </div>
      </Modal>
      </RevealBlocks>
    </div>
  );
}

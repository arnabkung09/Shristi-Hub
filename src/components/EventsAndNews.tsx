import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, MapPin, Megaphone, Newspaper, Plus, Sparkles, Tag, Trash2, UserCheck, Users, X } from "lucide-react";
import { audienceLabel, fmtDate, relativeTime, targetsUser, uid, useHub } from "../store/hub";
import { categoryToEventType } from "../lib/content";
import { GRADES, HOUSES } from "../lib/seed";
import { Modal } from "./ui";
import type { Audience, EventCategory, NoticePriority, SchoolEvent } from "../lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CATEGORY_BY_TYPE: Record<string, EventCategory> = {
  Meetings: "Council Meeting", Workshops: "Academic", "Sports & Games": "Sports",
  "Cultural & Arts": "Cultural", "School Assembly": "Assembly", "Community Drive": "Cultural",
};
const PRIORITY_TONE: Record<NoticePriority, string> = { urgent: "#fb3f63", important: "#f5a623", general: "#8b7bff", event: "#00bd8b" };
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const typeOf = (event: SchoolEvent) => event.eventType ?? categoryToEventType(event.category);

export default function EventsAndNews({ initialTab = "calendar" }: { initialTab?: string }) {
  const { state, user, dispatch, announce, hasPermission } = useHub();
  const canManage = hasPermission("events");
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(iso(today));
  const [tab, setTab] = useState(initialTab === "news" ? "news" : "calendar");
  const [editing, setEditing] = useState<SchoolEvent | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [typeManager, setTypeManager] = useState(false);
  const [newsComposer, setNewsComposer] = useState(false);

  const events = useMemo(() => state.events.filter((e) => filter === "all" || typeOf(e) === filter), [state.events, filter]);
  const byDate = useMemo(() => {
    const map = new Map<string, SchoolEvent[]>();
    events.forEach((event) => map.set(event.date, [...(map.get(event.date) ?? []), event]));
    return map;
  }, [events]);
  const news = useMemo(() => (user ? state.announcements.filter((a) => targetsUser(a.audience, user)) : []), [state.announcements, user]);

  if (!user) return null;
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: Array<string | null> = [...Array(monthStart.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => iso(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)))];
  while (cells.length % 7 !== 0) cells.push(null);
  const selectedEvents = byDate.get(selected) ?? [];

  return (
    <div>
      <div className="directory-heading">
        <div><h1>Events & News <span className="outline-count">{state.events.length} scheduled</span></h1><p>Browse the school calendar, reserve your place at an event, and catch up on council news.</p></div>
        <div className="flex flex-wrap gap-2">
          {canManage && tab === "calendar" && <button className="btn btn-primary" onClick={() => setCreating(selected)}><CalendarPlus />Add Event</button>}
          {canManage && tab === "news" && <button className="btn btn-primary" onClick={() => setNewsComposer(true)}><Megaphone />Publish News</button>}
        </div>
      </div>

      <div className="compact-tabs mb-5" role="tablist" aria-label="Events and news views">
        <button role="tab" aria-selected={tab === "calendar"} className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}><CalendarDays />Event Calendar</button>
        <button role="tab" aria-selected={tab === "news"} className={tab === "news" ? "active" : ""} onClick={() => setTab("news")}><Newspaper />News & Announcements</button>
      </div>

      {tab === "calendar" ? (
        <>
          <section className="panel panel-pad mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="eyebrow">Event Type Categories:</h2>
              <div className="flex items-center gap-3">
                <span className="eyebrow !text-[9px]">Filtered: {filter === "all" ? "All" : filter}</span>
                {canManage && <button className="text-action" onClick={() => setTypeManager(true)}><Plus />Manage Event Types</button>}
              </div>
            </div>
            <div className="category-chips">
              <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}><Sparkles />All Categories</button>
              {state.eventTypes.map((type) => (
                <button key={type} className={filter === type ? "active" : ""} onClick={() => setFilter(type)}><Tag />{type}
                  <span className="chip-count">{state.events.filter((e) => typeOf(e) === type).length}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel calendar-shell">
            <header className="calendar-head">
              <div className="flex items-center gap-3">
                <h2>{cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2>
                <button className="today-pill" onClick={() => { const now = new Date(); setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(iso(now)); }}>TODAY</button>
              </div>
              <div className="pagination-buttons">
                <button aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></button>
                <button aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></button>
              </div>
            </header>
            <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day.toUpperCase()}</span>)}</div>
            <div className="calendar-grid">
              {cells.map((date, index) => {
                if (!date) return <div key={`blank-${index}`} className="calendar-cell empty" aria-hidden />;
                const dayEvents = byDate.get(date) ?? [];
                const isToday = date === iso(today);
                return (
                  <button key={date} className={`calendar-cell ${selected === date ? "selected" : ""}`} aria-label={`${fmtDate(date)}, ${dayEvents.length} events`} aria-pressed={selected === date}
                    onClick={() => setSelected(date)} onDoubleClick={() => canManage && setCreating(date)}>
                    <span className={`calendar-daynum ${isToday ? "today" : ""}`}>{Number(date.slice(-2))}</span>
                    <span className="calendar-events">
                      {dayEvents.slice(0, 3).map((event) => <span key={event.id} className="event-pill" title={event.title}>{event.time} {event.title}</span>)}
                      {dayEvents.length > 3 && <span className="event-more">+{dayEvents.length - 3} more</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel panel-pad mt-5">
            <div className="panel-heading">
              <div><h2><CalendarDays />{fmtDate(selected)}</h2><p>{selectedEvents.length ? `${selectedEvents.length} scheduled ${selectedEvents.length === 1 ? "event" : "events"}` : "No events scheduled for this date."}</p></div>
              {canManage && <button className="btn btn-secondary" onClick={() => setCreating(selected)}><Plus />Add on this date</button>}
            </div>
            {!selectedEvents.length ? (
              <div className="empty-content"><CalendarDays /><strong>Nothing scheduled</strong><p>{canManage ? "Select a date and add an event, or double-click any calendar day." : "Check another date on the calendar."}</p></div>
            ) : (
              <div className="day-event-list">
                {selectedEvents.map((event) => {
                  const registered = event.attendees.includes(user.id);
                  const full = event.attendees.length >= event.capacity;
                  return (
                    <article key={event.id} className="day-event">
                      <div className="day-event-time"><Clock />{event.time}</div>
                      <div className="min-w-0 flex-1">
                        <h3>{event.title}</h3>
                        <p className="small-note mt-1">{event.description}</p>
                        <p className="day-event-meta"><MapPin />{event.venue}<span className="mx-1">/</span><Users />{event.attendees.length} of {event.capacity}<span className="mx-1">/</span><Tag />{typeOf(event)}</p>
                      </div>
                      <div className="day-event-actions">
                        <button className={`btn ${registered ? "btn-secondary" : "btn-primary"}`} disabled={!registered && full} onClick={() => dispatch({ type: "RSVP", eventId: event.id, userId: user.id })}>
                          {registered ? <><Check />Registered</> : full ? "Event full" : "Register"}
                        </button>
                        {canManage && <><button className="icon-action" aria-label={`Edit ${event.title}`} onClick={() => setEditing(event)}><UserCheck /></button><button className="icon-action red" aria-label={`Delete ${event.title}`} onClick={() => { dispatch({ type: "DELETE_EVENT", eventId: event.id }); announce("Event removed from the calendar."); }}><Trash2 /></button></>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <section>
          <div className="news-grid">
            {news.map((item) => (
              <article key={item.id} className="news-card" style={{ borderTopColor: PRIORITY_TONE[item.priority] }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="news-tag" style={{ color: PRIORITY_TONE[item.priority], borderColor: `${PRIORITY_TONE[item.priority]}55` }}>{item.priority === "urgent" && <AlertTriangle className="h-3 w-3" />}{item.priority}</span>
                  <span className="news-audience">{audienceLabel(item.audience)}</span>
                  <span className="ml-auto text-[9px] text-[var(--faint)]">{relativeTime(item.timestamp)}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <footer>{item.authorName} / {item.authorPost}</footer>
              </article>
            ))}
          </div>
          {!news.length && <div className="empty-content"><Newspaper /><strong>No news for you yet</strong><p>Council announcements addressed to you will appear here.</p></div>}
        </section>
      )}

      {(creating || editing) && <EventDialog date={creating ?? editing!.date} event={editing} onClose={() => { setCreating(null); setEditing(null); }} />}

      <Modal open={typeManager} onClose={() => setTypeManager(false)} title="Manage Event Types" icon={<Tag />} subtitle="Categories appear as calendar filters and in the event form.">
        <TypeManager />
        <div className="dialog-actions"><button className="btn btn-secondary" onClick={() => setTypeManager(false)}>Close</button></div>
      </Modal>

      {newsComposer && <NewsDialog onClose={() => setNewsComposer(false)} />}
    </div>
  );
}

function TypeManager() {
  const { state, dispatch, announce } = useHub();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const run = (fn: () => void, message: string) => {
    try { fn(); announce(message); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Unable to update event types."); }
  };
  return (
    <div className="form-stack">
      <form className="department-form !mb-0" onSubmit={(e) => { e.preventDefault(); run(() => dispatch({ type: "ADD_EVENT_TYPE", name }), `${name.trim()} added.`); setName(""); }}>
        <input className="control" required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Inter-School Fixtures" />
        <button className="btn btn-primary" type="submit"><Plus />Add type</button>
      </form>
      {error && <p role="alert" className="inline-message error">{error}</p>}
      <div className="department-grid !grid-cols-2">
        {state.eventTypes.map((type) => (
          <div key={type} className="department-row"><span><Tag /></span><span>{type}</span><button className="icon-action red" aria-label={`Remove ${type}`} onClick={() => run(() => dispatch({ type: "DELETE_EVENT_TYPE", name: type }), `${type} removed.`)}><Trash2 /></button></div>
        ))}
      </div>
    </div>
  );
}

function EventDialog({ date, event, onClose }: { date: string; event: SchoolEvent | null; onClose: () => void }) {
  const { state, user, dispatch, announce } = useHub();
  const [form, setForm] = useState({
    title: event?.title ?? "", description: event?.description ?? "", date: event?.date ?? date,
    time: event?.time ?? "15:00", venue: event?.venue ?? "", type: event ? (event.eventType ?? categoryToEventType(event.category)) : state.eventTypes[0],
    capacity: String(event?.capacity ?? 100), notify: !event,
  });
  const [error, setError] = useState("");
  const save = () => {
    try {
      if (!form.title.trim() || !form.venue.trim() || !form.date) throw new Error("Title, date, and venue are required.");
      const capacity = Math.max(1, Number(form.capacity) || 1);
      const category = CATEGORY_BY_TYPE[form.type] ?? "Cultural";
      if (event) {
        dispatch({ type: "UPDATE_EVENT", event: { ...event, title: form.title.trim(), description: form.description.trim(), date: form.date, time: form.time, venue: form.venue.trim(), category, eventType: form.type, capacity } });
        announce("Event updated.");
      } else {
        const created: SchoolEvent = { id: uid(), title: form.title.trim(), description: form.description.trim(), date: form.date, time: form.time, venue: form.venue.trim(), category, eventType: form.type, capacity, attendees: [], attended: [], organizer: user!.name };
        dispatch({
          type: "ADD_EVENT", event: created,
          notification: form.notify ? { id: uid(), title: "New event published", body: `${created.title} on ${fmtDate(created.date)} at ${created.venue}.`, timestamp: Date.now(), urgent: false, senderName: user!.name, senderRole: user!.role, audience: { kind: "all" }, actionTab: "events", readBy: [], kind: "system" } : undefined,
        });
        announce("Event added to the calendar.");
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save this event."); }
  };
  return (
    <Modal open onClose={onClose} title={event ? "Edit Event" : "Add Event"} icon={<CalendarPlus />} subtitle={`Scheduled for ${fmtDate(form.date)}`} wide>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="form-stack">
          <label className="form-field"><span>Event title</span><input required className="control" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Inter-House Basketball Final" /></label>
          <label className="form-field"><span>Description</span><textarea rows={3} className="control resize-y" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What should students know?" /></label>
          <div className="form-grid"><label className="form-field"><span>Date</span><input required type="date" className="control" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label className="form-field"><span>Time</span><input required type="time" className="control" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label></div>
          <div className="form-grid"><label className="form-field"><span>Venue</span><input required className="control" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="e.g. Main Basketball Court" /></label><label className="form-field"><span>Event type</span><select className="control" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{state.eventTypes.map((t) => <option key={t}>{t}</option>)}</select></label></div>
          <div className="form-grid"><label className="form-field"><span>Seat capacity</span><input type="number" min={1} className="control" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
            {!event && <label className="permission-row"><input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} /><span><strong>Notify students</strong><small>Send an in-app alert when saved</small></span></label>}
          </div>
          {error && <p role="alert" className="inline-message error">{error}</p>}
        </div>
        <div className="dialog-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary"><CalendarPlus />{event ? "Save changes" : "Add to calendar"}</button></div>
      </form>
    </Modal>
  );
}

function NewsDialog({ onClose }: { onClose: () => void }) {
  const { user, dispatch, announce } = useHub();
  const [form, setForm] = useState({ title: "", body: "", priority: "general" as NoticePriority, target: "all" });
  const [error, setError] = useState("");
  const audience: Audience = form.target === "all" ? { kind: "all" } : form.target.startsWith("house:") ? { kind: "house", house: form.target.split(":")[1] as "Blue" | "Red" | "Green" } : form.target.startsWith("grade:") ? { kind: "grade", grade: Number(form.target.split(":")[1]) } : { kind: "role", role: "council" };
  return (
    <Modal open onClose={onClose} title="Publish News" icon={<Newspaper />} subtitle="News cards appear in the News & Announcements tab.">
      <form onSubmit={(e) => {
        e.preventDefault();
        try {
          if (!form.title.trim() || !form.body.trim()) throw new Error("A headline and story are required.");
          const timestamp = Date.now();
          dispatch({
            type: "ADD_ANNOUNCEMENT",
            announcement: { id: uid(), title: form.title.trim(), body: form.body.trim(), priority: form.priority, audience, authorName: user!.name, authorPost: user!.councilTitle ?? "Council", timestamp },
            notification: { id: uid(), title: form.title.trim(), body: form.body.trim(), timestamp, urgent: form.priority === "urgent", senderName: user!.name, senderRole: user!.role, audience, actionTab: "notices", readBy: [], kind: "broadcast" },
          });
          announce("News published.");
          onClose();
        } catch (err) { setError(err instanceof Error ? err.message : "Unable to publish."); }
      }}>
        <div className="form-stack">
          <label className="form-field"><span>Headline</span><input required maxLength={120} className="control" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="form-field"><span>Story</span><textarea required rows={5} className="control resize-y" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
          <div className="form-grid">
            <label className="form-field"><span>Priority</span><select className="control" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as NoticePriority })}><option value="general">General</option><option value="important">Important</option><option value="urgent">Urgent</option><option value="event">Event notice</option></select></label>
            <label className="form-field"><span>Audience</span><select className="control" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}><option value="all">All students</option><option value="role:council">Council only</option>{HOUSES.map((h) => <option key={h} value={`house:${h}`}>{h} House</option>)}{GRADES.map((g) => <option key={g} value={`grade:${g}`}>Grade {g}</option>)}</select></label>
          </div>
          {error && <p role="alert" className="inline-message error">{error}</p>}
        </div>
        <div className="dialog-actions"><button type="button" className="btn btn-secondary" onClick={onClose}><X />Cancel</button><button type="submit" className="btn btn-primary"><Megaphone />Publish news</button></div>
      </form>
    </Modal>
  );
}

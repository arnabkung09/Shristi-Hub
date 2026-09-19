import { useMemo, useState } from "react";
import { AlertTriangle, Building2, CalendarDays, CalendarPlus, CalendarClock, Check, ChevronLeft, ChevronRight, Clock, GraduationCap, LayoutGrid, ListOrdered, MapPin, Megaphone, Newspaper, Plus, Sparkles, Sun, Tag, Trash2, Trophy, UserCheck, Users, X } from "lucide-react";
import { audienceLabel, fmtDate, relativeTime, targetsUser, uid, useHub } from "../store/hub";
import { categoryToEventType } from "../lib/content";
import { CALENDAR_TYPES } from "../lib/sheets/types";
import { GRADES, HOUSES } from "../lib/seed";
import { Btn, Modal } from "./ui";
import { RevealBlocks } from "./Effects";
import SheetSyncBar from "./SheetSyncBar";
import type { Audience, EventCategory, NoticePriority, SchoolEvent } from "../lib/types";
import type { CalendarEntry, CalendarEventType } from "../lib/sheets/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CATEGORY_BY_TYPE: Record<string, EventCategory> = {
  Meetings: "Council Meeting", Workshops: "Academic", "Sports & Games": "Sports",
  "Cultural & Arts": "Cultural", "School Assembly": "Assembly", "Community Drive": "Cultural",
};
const PRIORITY_TONE: Record<NoticePriority, string> = { urgent: "#fb3f63", important: "#f5a623", general: "#8b7bff", event: "#00bd8b" };
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const typeOf = (event: SchoolEvent) => event.eventType ?? categoryToEventType(event.category);
/** Sheet rows carry a start and end time; local events only have a single time. */
const timeLabel = (event: SchoolEvent) => (event.endTime ? `${event.time || event.endTime}–${event.endTime}` : event.time || "All day");
/**
 * The Calendar sheet stores five types; the hub decides how each one looks. Keeping the
 * presentation here means the spreadsheet stays Date | Type | Details.
 */
/** Local (non-sheet) events keep their own status wording. */
const EVENT_STATUS_TEXT: Record<string, string> = { upcoming: "Upcoming", ongoing: "Today", completed: "Completed", cancelled: "Cancelled" };
const STATUS_TONE: Record<string, string> = { upcoming: "active", ongoing: "active", completed: "", cancelled: "" };

const CAL_TYPE_META: Record<CalendarEventType, { icon: typeof Sun; pill: string; tone: "slate" | "amber" | "indigo" | "red" | "emerald" }> = {
  holiday: { icon: Sun, pill: "type-holiday", tone: "slate" },
  normal: { icon: CalendarClock, pill: "type-normal", tone: "slate" },
  competition: { icon: Trophy, pill: "type-competition", tone: "amber" },
  event: { icon: Sparkles, pill: "type-event", tone: "indigo" },
  examination: { icon: GraduationCap, pill: "type-examination", tone: "red" },
};

const dayLabel = (dateIso: string, todayIso: string) => {
  const days = Math.round((Date.parse(`${dateIso}T00:00:00`) - Date.parse(`${todayIso}T00:00:00`)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === 2) return "Day after tomorrow";
  if (days > 2 && days < 7) return new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" });
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
};
const longDate = (dateIso: string) => new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const shortDate = (dateIso: string) => new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();

export default function EventsAndNews({ initialTab = "calendar" }: { initialTab?: string }) {
  const { state, user, dispatch, announce, hasPermission, calendarEvents, sheets } = useHub();
  // Once the Calendar spreadsheet is connected it becomes the source of truth: the
  // existing calendar renders its rows and events are created by adding a sheet row.
  const sheetCalendar = sheets.isEnabled("calendar") ? sheets.calendar : null;
  const canManage = hasPermission("events") && !sheets.isEnabled("calendar");
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(iso(today));
  const [tab, setTab] = useState(initialTab === "news" ? "news" : "calendar");
  const [statusFilter] = useState("all");
  const [view, setView] = useState<"month" | "agenda">("month");
  const [detail, setDetail] = useState<CalendarEntry | null>(null);
  const [editing, setEditing] = useState<SchoolEvent | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [typeManager, setTypeManager] = useState(false);
  const [newsComposer, setNewsComposer] = useState(false);

  const events = useMemo(
    () => calendarEvents
      .filter((e) => filter === "all" || typeOf(e) === filter)
      .filter((e) => statusFilter === "all" || (e.status ?? "upcoming") === statusFilter),
    [calendarEvents, filter, statusFilter]
  );
  const byDate = useMemo(() => {
    const map = new Map<string, SchoolEvent[]>();
    events.forEach((event) => map.set(event.date, [...(map.get(event.date) ?? []), event]));
    return map;
  }, [events]);
  /** Calendar-sheet rows after the type filter — the one dataset behind every calendar view. */
  const sheetEntries = useMemo(
    () => (sheetCalendar?.entries ?? []).filter((entry) => filter === "all" || entry.type === filter),
    [sheetCalendar, filter]
  );
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    sheetEntries.forEach((entry) => map.set(entry.date, [...(map.get(entry.date) ?? []), entry]));
    return map;
  }, [sheetEntries]);
  const news = useMemo(() => (user ? state.announcements.filter((a) => targetsUser(a.audience, user)) : []), [state.announcements, user]);
  const typeOptions = useMemo(
    () => (sheetCalendar ? [...new Set([...state.eventTypes, ...calendarEvents.map(typeOf)])] : state.eventTypes),
    [sheetCalendar, state.eventTypes, calendarEvents]
  );
  const counts = useMemo(() => {
    const todayIso = iso(new Date());
    const dates = sheetCalendar ? sheetCalendar.entries.map((entry) => entry.date) : calendarEvents.map((event) => event.date);
    return {
      today: dates.filter((date) => date === todayIso).length,
      upcoming: dates.filter((date) => date > todayIso).length,
      past: dates.filter((date) => date < todayIso).length,
    };
  }, [sheetCalendar, calendarEvents]);
  const upcomingList = useMemo(
    () => (sheetCalendar ? sheetCalendar.upcoming.filter((entry) => entry.date > iso(new Date())).slice(0, 5) : []),
    [sheetCalendar]
  );

  if (!user) return null;
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: Array<string | null> = [...Array(monthStart.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => iso(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)))];
  while (cells.length % 7 !== 0) cells.push(null);
  const selectedEvents = byDate.get(selected) ?? [];

  return (
    <div>
      <RevealBlocks>
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
          <SheetSyncBar section="calendar" className="mb-5" />

          <section className="panel panel-pad mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="eyebrow">Event Type Categories:</h2>
              <div className="flex items-center gap-3">
                <span className="eyebrow !text-[9px]">
                  {sheetCalendar
                    ? `Today: ${counts.today} · Upcoming: ${counts.upcoming} · Past: ${counts.past}`
                    : `Filtered: ${filter === "all" ? "All" : filter}`}
                </span>
                {canManage && <button className="text-action" onClick={() => setTypeManager(true)}><Plus />Manage Event Types</button>}
              </div>
            </div>
            <div className="category-chips">
              <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}><Sparkles />All</button>
              {sheetCalendar ? (
                CALENDAR_TYPES.map(({ key, label }) => {
                  const Icon = CAL_TYPE_META[key].icon;
                  return (
                    <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
                      <Icon />{label}
                      <span className="chip-count">{sheetCalendar.counts[key]}</span>
                    </button>
                  );
                })
              ) : (
                typeOptions.map((type) => (
                  <button key={type} className={filter === type ? "active" : ""} onClick={() => setFilter(type)}><Tag />{type}
                    <span className="chip-count">{calendarEvents.filter((e) => typeOf(e) === type).length}</span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="panel calendar-shell">
            <header className="calendar-head">
              <div className="flex items-center gap-3">
                <h2>{cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2>
                <button className="today-pill" onClick={() => { const now = new Date(); setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(iso(now)); }}>TODAY</button>
              </div>
              <div className="flex items-center gap-2">
                {sheetCalendar && (
                  <div className="view-switch" role="tablist" aria-label="Calendar view">
                    <button role="tab" aria-selected={view === "month"} className={view === "month" ? "active" : ""} onClick={() => setView("month")}><LayoutGrid />Month</button>
                    <button role="tab" aria-selected={view === "agenda"} className={view === "agenda" ? "active" : ""} onClick={() => setView("agenda")}><ListOrdered />Agenda</button>
                  </div>
                )}
                <div className="pagination-buttons">
                  <button aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></button>
                  <button aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            </header>
            {view === "month" && (
              <>
                <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day.toUpperCase()}</span>)}</div>
                <div className="calendar-grid">
                  {cells.map((date, index) => {
                    if (!date) return <div key={`blank-${index}`} className="calendar-cell empty" aria-hidden />;
                    const isToday = date === iso(today);
                    const isPast = date < iso(today);
                    const sheetDay = entriesByDate.get(date) ?? [];
                    const localDay = byDate.get(date) ?? [];
                    const dayType = sheetDay.length ? CAL_TYPE_META[sheetDay[0].type].pill : "";
                    const count = sheetCalendar ? sheetDay.length : localDay.length;
                    return (
                      <button
                        key={date}
                        className={`calendar-cell ${selected === date ? "selected" : ""} ${sheetCalendar && isPast ? "past-day" : ""} ${isToday ? "today-day" : ""} ${dayType}`}
                        aria-label={`${fmtDate(date)}, ${count} ${count === 1 ? "entry" : "entries"}`}
                        aria-pressed={selected === date}
                        onClick={() => setSelected(date)}
                        onDoubleClick={() => canManage && setCreating(date)}
                      >
                        <span className={`calendar-daynum ${isToday ? "today" : ""}`}>{Number(date.slice(-2))}</span>
                        <span className="calendar-events">
                          {sheetCalendar
                            ? sheetDay.slice(0, 2).map((entry) => (
                              <span key={entry.id} className={`event-pill ${CAL_TYPE_META[entry.type].pill}`} title={`${entry.typeLabel}: ${entry.details}`}>
                                {entry.details}
                              </span>
                            ))
                            : localDay.slice(0, 3).map((event) => <span key={event.id} className="event-pill" title={event.title}>{timeLabel(event)} {event.title}</span>)}
                          {(sheetCalendar ? sheetDay.length : localDay.length) > (sheetCalendar ? 2 : 3) && (
                            <span className="event-more">+{(sheetCalendar ? sheetDay.length : localDay.length) - (sheetCalendar ? 2 : 3)} more</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {sheetCalendar ? (
            <section className="panel panel-pad mt-5">
              <div className="panel-heading">
                <div>
                  <h2><CalendarDays />{longDate(selected)}</h2>
                  <p>
                    {(() => {
                      const dayRows = entriesByDate.get(selected) ?? [];
                      return dayRows.length
                        ? `${dayRows.length} ${dayRows.length === 1 ? "entry" : "entries"} on the council calendar`
                        : "Nothing scheduled for this date.";
                    })()}
                  </p>
                </div>
              </div>
              {(() => {
                const dayRows = entriesByDate.get(selected) ?? [];
                if (!dayRows.length) {
                  return (
                    <div className="empty-content">
                      <CalendarDays />
                      <strong>Nothing scheduled</strong>
                      <p>Pick another date, or add a row to the Calendar sheet for this date.</p>
                    </div>
                  );
                }
                return (
                  <div className="day-event-list">
                    {dayRows.map((entry) => {
                      const meta = CAL_TYPE_META[entry.type];
                      const Icon = meta.icon;
                      return (
                        <button key={entry.id} className="day-event day-event-button" onClick={() => setDetail(entry)}>
                          <div className={`day-event-time ${meta.pill}`}><Icon />{entry.typeLabel}</div>
                          <div className="min-w-0 flex-1 text-left">
                            <h3>{entry.details}</h3>
                            <p className="day-event-meta"><CalendarDays />{longDate(entry.date)}<span className="mx-1">/</span><Tag />{entry.typeLabel}</p>
                          </div>
                          <span className="text-[10px] text-slate-400">View details</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </section>
          ) : (
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
                      <div className="day-event-time"><Clock />{timeLabel(event)}</div>
                      <div className="min-w-0 flex-1">
                        <h3>{event.title}</h3>
                        <p className="small-note mt-1">{event.description}</p>
                        <p className="day-event-meta">
                          <MapPin />{event.venue}
                          <span className="mx-1">/</span><Tag />{typeOf(event)}
                          {event.department && <><span className="mx-1">/</span><Building2 />{event.department}</>}
                          {event.status && <><span className="mx-1">/</span><span className={`status-label ${STATUS_TONE[event.status]}`}>{EVENT_STATUS_TEXT[event.status]}</span></>}
                          {event.sheetId && <><span className="mx-1">/</span>{event.sheetId}</>}
                        </p>
                        {!event.sheetId && <p className="day-event-meta"><Users />{event.attendees.length} of {event.capacity}</p>}
                      </div>
                      <div className="day-event-actions">
                        {event.sheetId ? (
                          <span className="text-[10px] text-slate-400">Managed in Google Sheets</span>
                        ) : (
                        <button className={`btn ${registered ? "btn-secondary" : "btn-primary"}`} disabled={!registered && full} onClick={() => dispatch({ type: "RSVP", eventId: event.id, userId: user.id })}>
                          {registered ? <><Check />Registered</> : full ? "Event full" : "Register"}
                        </button>
                        )}
                        {canManage && <><button className="icon-action" aria-label={`Edit ${event.title}`} onClick={() => setEditing(event)}><UserCheck /></button><button className="icon-action red" aria-label={`Delete ${event.title}`} onClick={() => { dispatch({ type: "DELETE_EVENT", eventId: event.id }); announce("Event removed from the calendar."); }}><Trash2 /></button></>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          )}

          {sheetCalendar && view === "agenda" && (
            <section className="panel panel-pad mt-5">
              <div className="panel-heading">
                <div>
                  <h2><ListOrdered />Agenda</h2>
                  <p>Every date still ahead of us, straight from the Calendar sheet.</p>
                </div>
              </div>
              {(() => {
                const ahead = sheetEntries.filter((entry) => entry.date >= iso(today));
                if (!ahead.length) {
                  return (
                    <div className="empty-content">
                      <CalendarDays />
                      <strong>No upcoming dates</strong>
                      <p>Add a row to the Calendar sheet and it will appear here and on the homepage.</p>
                    </div>
                  );
                }
                return (
                  <div className="agenda-list">
                    {ahead.map((entry) => {
                      const meta = CAL_TYPE_META[entry.type];
                      const Icon = meta.icon;
                      return (
                        <div key={entry.id} className="agenda-row">
                          <button className="agenda-main" onClick={() => setDetail(entry)}>
                            <span className="agenda-date">{shortDate(entry.date)}</span>
                            <span className="agenda-body">
                              <strong>{entry.details}</strong>
                              <span className={`type-chip ${meta.pill}`}><Icon />{entry.typeLabel}</span>
                            </span>
                            <span className="agenda-day">{dayLabel(entry.date, iso(today))}</span>
                          </button>
                          <button
                            className="icon-action"
                            aria-label={`Show ${entry.details} on the month grid`}
                            onClick={() => { setCursor(new Date(`${entry.date}T00:00:00`)); setSelected(entry.date); setView("month"); }}
                          >
                            <CalendarDays />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </section>
          )}

          {sheetCalendar && upcomingList.length > 0 && (
            <section className="panel panel-pad mt-5">
              <div className="panel-heading">
                <div><h2><CalendarDays />Upcoming</h2><p>The next {upcomingList.length} {upcomingList.length === 1 ? "date" : "dates"} from the council calendar spreadsheet.</p></div>
                <button className="btn btn-secondary" onClick={() => { const next = upcomingList[0]; setCursor(new Date(`${next.date}T00:00:00`)); setSelected(next.date); setView("month"); }}>Show on calendar</button>
              </div>
              <div className="day-event-list">
                {upcomingList.map((entry) => {
                  const meta = CAL_TYPE_META[entry.type];
                  const Icon = meta.icon;
                  return (
                    <button key={entry.id} className="day-event day-event-button" onClick={() => setDetail(entry)}>
                      <div className={`day-event-time ${meta.pill}`}><Icon />{dayLabel(entry.date, iso(today))}</div>
                      <div className="min-w-0 flex-1 text-left">
                        <h3>{entry.details}</h3>
                        <p className="day-event-meta"><Tag />{entry.typeLabel}<span className="mx-1">/</span><CalendarDays />{longDate(entry.date)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Detail card: the Calendar sheet only holds Date, Type and Details, so that is all we show. */}
          <Modal open={!!detail} onClose={() => setDetail(null)} title="Calendar entry">
            {detail && (
              <div className="space-y-4">
                <div className={`type-banner ${CAL_TYPE_META[detail.type].pill}`}>
                  {(() => { const Icon = CAL_TYPE_META[detail.type].icon; return <Icon />; })()}
                  <div>
                    <strong>{detail.typeLabel}</strong>
                    <span>{dayLabel(detail.date, iso(today))}</span>
                  </div>
                </div>
                <div className="detail-rows">
                  <div className="detail-row"><span>Details</span><p>{detail.details}</p></div>
                  <div className="detail-row"><span>Type</span><p>{detail.typeLabel}</p></div>
                  <div className="detail-row"><span>Date</span><p>{longDate(detail.date)}</p></div>
                </div>
                <div className="flex justify-end gap-2">
                  <Btn variant="secondary" onClick={() => { setCursor(new Date(`${detail.date}T00:00:00`)); setSelected(detail.date); setView("month"); setDetail(null); }}>
                    <CalendarDays className="h-4 w-4" /> Show on calendar
                  </Btn>
                  <Btn onClick={() => setDetail(null)}>Close</Btn>
                </div>
              </div>
            )}
          </Modal>
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
      </RevealBlocks>
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

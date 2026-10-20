import React, { useState } from "react";
import { Calendar, Clock, Download, FileText, MapPin, Pencil, Plus, Trash2, Upload, Eye } from "lucide-react";
import { Modal } from "./ui";
import { RevealBlocks } from "./Effects";
import { downloadMinutes, downloadResource, resourceText } from "../lib/resources";
import { RESOURCES } from "../lib/seed";
import type { ResourceDoc } from "../lib/types";
import { fmtDate, uid, useHub } from "../store/hub";

export default function MeetingsAndFiles() {
  const { state, user, dispatch, announce, notify, hasPermission } = useHub();
  const canManage = hasPermission("meetings");

  // Schedule Meeting Modal state
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("15:30");
  const [endTime, setEndTime] = useState("16:30");
  const [venue, setVenue] = useState("Council Room 204");
  const [agenda, setAgenda] = useState("");
  const [initialMinutes, setInitialMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Edit / Add Minutes Modal for a specific or selected meeting
  const [minutesModalOpen, setMinutesModalOpen] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [minutesDraft, setMinutesDraft] = useState("");
  const [minutesError, setMinutesError] = useState<string | null>(null);

  // Add File Resource Modal state
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [resTitle, setResTitle] = useState("");
  const [resCategory, setResCategory] = useState("Governance");
  const [resTag, setResTag] = useState("PDF");
  const [resContent, setResContent] = useState("");
  const [resFileUrl, setResFileUrl] = useState<string | undefined>(undefined);
  const [resFileName, setResFileName] = useState<string | undefined>(undefined);
  const [resSize, setResSize] = useState("");
  const [resError, setResError] = useState<string | null>(null);

  // Preview Resource Modal state
  const [previewResource, setPreviewResource] = useState<ResourceDoc | null>(null);

  const resourcesList = state.resources && state.resources.length > 0 ? state.resources : RESOURCES;

  const schedule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) {
      setError("Your account does not have meetings permission.");
      return;
    }
    const cleanTitle = title.trim();
    const cleanAgenda = agenda.trim();
    const cleanMinutes = initialMinutes.trim();
    if (cleanTitle.length < 2) {
      setError("Enter a meeting title.");
      return;
    }
    const agendaItems = cleanAgenda
      ? cleanAgenda.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean)
      : ["General council business and updates."];
    const meeting = {
      id: uid(),
      title: cleanTitle,
      date,
      startTime,
      endTime,
      venue: venue.trim() || "Council Room",
      agenda: agendaItems,
      minutes: cleanMinutes || "",
      attendeeIds: user ? [user.id] : [],
    };
    try {
      dispatch({ type: "ADD_MEETING", meeting });
      notify({
        title: cleanMinutes ? "Meeting minutes published" : "Council meeting scheduled",
        body: `${meeting.title} · ${fmtDate(meeting.date)} at ${meeting.startTime} (${meeting.venue}).`,
        urgent: false,
        senderName: user?.name ?? "Council Officer",
        senderRole: user?.role ?? "council",
        audience: { kind: "role", role: "council" },
        actionTab: "meetings",
      });
      announce(
        cleanMinutes
          ? `"${meeting.title}" scheduled and minutes recorded.`
          : `"${meeting.title}" scheduled and council notified.`
      );
      setTitle("");
      setAgenda("");
      setInitialMinutes("");
      setError(null);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to schedule meeting.");
    }
  };

  const openMinutesForMeeting = (meetingId?: string) => {
    const target = meetingId
      ? state.meetings.find((m) => m.id === meetingId)
      : state.meetings[0];
    if (!target) {
      // No meetings exist yet — open the schedule modal so they can create one with minutes
      setOpen(true);
      return;
    }
    setSelectedMeetingId(target.id);
    setMinutesDraft(target.minutes ?? "");
    setMinutesError(null);
    setMinutesModalOpen(true);
  };

  const handleSelectMeetingInModal = (id: string) => {
    setSelectedMeetingId(id);
    const found = state.meetings.find((m) => m.id === id);
    setMinutesDraft(found?.minutes ?? "");
    setMinutesError(null);
  };

  const saveMinutes = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedMeetingId) return;
    if (!canManage) {
      setMinutesError("Your account does not have meetings permission.");
      return;
    }
    const clean = minutesDraft.trim();
    if (!clean) {
      setMinutesError("Please enter the meeting minutes before saving.");
      return;
    }
    const targetMeeting = state.meetings.find((m) => m.id === selectedMeetingId);
    try {
      dispatch({ type: "SAVE_MINUTES", meetingId: selectedMeetingId, minutes: clean });
      announce(`Minutes saved for "${targetMeeting?.title ?? "meeting"}".`);
      setMinutesModalOpen(false);
      setMinutesDraft("");
      setMinutesError(null);
    } catch (err) {
      setMinutesError(err instanceof Error ? err.message : "Unable to save minutes.");
    }
  };

  const handleDeleteMeeting = (meetingId: string, meetingTitle: string) => {
    if (!canManage) return;
    try {
      dispatch({ type: "DELETE_MEETING", meetingId });
      announce(`Removed meeting "${meetingTitle}".`);
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to delete meeting.", "error");
    }
  };

  const handleResourceFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setResError("File must be under 4 MB.");
      return;
    }
    setResError(null);
    setResFileName(file.name);
    const kb = Math.max(1, Math.round(file.size / 1024));
    setResSize(kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);
    if (!resTitle.trim()) {
      setResTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
    const ext = file.name.split(".").pop()?.toUpperCase();
    if (ext && ["PDF", "DOCX", "DOC", "XLSX", "CSV", "TXT", "PNG", "JPG"].includes(ext)) {
      setResTag(ext);
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setResFileUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddResource = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) {
      setResError("Your account does not have permission to add file resources.");
      return;
    }
    const cleanTitle = resTitle.trim();
    if (cleanTitle.length < 2) {
      setResError("Enter a title for the file resource.");
      return;
    }
    const computedSize =
      resSize ||
      (resContent.trim()
        ? `${Math.max(1, Math.round(new Blob([resContent]).size / 1024))} KB`
        : "24 KB");
    const newDoc: ResourceDoc = {
      id: uid(),
      title: cleanTitle,
      category: resCategory.trim() || "General",
      tag: resTag.trim().toUpperCase() || "DOC",
      updated: new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      size: computedSize,
      content: resContent.trim() || undefined,
      fileUrl: resFileUrl,
      fileName: resFileName,
    };
    try {
      dispatch({ type: "ADD_RESOURCE", resource: newDoc });
      announce(`Added file resource "${newDoc.title}".`, "success");
      setResTitle("");
      setResContent("");
      setResFileUrl(undefined);
      setResFileName(undefined);
      setResSize("");
      setResError(null);
      setResourceModalOpen(false);
    } catch (err) {
      setResError(err instanceof Error ? err.message : "Unable to add file resource.");
    }
  };

  const handleDeleteResource = (res: ResourceDoc) => {
    if (!canManage) return;
    try {
      dispatch({ type: "DELETE_RESOURCE", resourceId: res.id });
      announce(`Removed file resource "${res.title}".`);
    } catch (err) {
      announce(err instanceof Error ? err.message : "Unable to remove file resource.", "error");
    }
  };

  return (
    <RevealBlocks>
      <div className="space-y-10">
        {/* Page Heading */}
        <div className="directory-heading flex flex-col sm:flex-row sm:items-start justify-between gap-5 pb-4 border-b border-[var(--border)]">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold font-display">
              Meetings, Minutes &amp; Files Folder{" "}
              <span className="outline-count">
                {state.meetings.length} {state.meetings.length === 1 ? "Meeting" : "Meetings"} · {resourcesList.length} {resourcesList.length === 1 ? "File" : "Files"}
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] mt-2 leading-relaxed max-w-2xl">
              Review official student council meeting schedules, published minutes, and downloadable governance documents and templates.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                className="btn btn-outline !min-h-10 !px-4 !text-xs"
                onClick={() => openMinutesForMeeting()}
              >
                <FileText className="h-4 w-4" /> Add / Edit Minutes
              </button>
              <button
                type="button"
                className="btn btn-primary !min-h-10 !px-4 !text-xs"
                onClick={() => setOpen(true)}
              >
                <Plus className="h-4 w-4" /> Schedule Meeting
              </button>
              <button
                type="button"
                className="btn btn-green !min-h-10 !px-4 !text-xs"
                onClick={() => {
                  setResError(null);
                  setResourceModalOpen(true);
                }}
              >
                <Upload className="h-4 w-4" /> Upload File Resource
              </button>
            </div>
          )}
        </div>

        {/* SECTION 1: MEETING MINUTES FOLDER (SPACIOUS CARDS) */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2.5">
                <Calendar className="h-5 w-5 text-[var(--purple)]" />
                <span>Official Meeting Minutes Folder</span>
              </h2>
              <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
                Agendas, attendance records, and official decisions from every council session.
              </p>
            </div>
            {canManage && (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  className="btn btn-outline !min-h-9 !px-3.5 !text-xs"
                  onClick={() => openMinutesForMeeting()}
                >
                  <FileText className="h-3.5 w-3.5" /> Record Minutes
                </button>
                <button
                  type="button"
                  className="btn btn-primary !min-h-9 !px-4 !text-xs"
                  onClick={() => setOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> New Meeting
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {state.meetings.map((meeting) => (
              <article
                key={meeting.id}
                className="panel p-6 sm:p-8 flex flex-col justify-between gap-5 shadow-md"
              >
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="font-display text-base sm:text-lg font-bold leading-snug">
                          {meeting.title}
                        </h3>
                        <span className={`pill ${meeting.minutes ? "pill-green" : "pill-amber"}`}>
                          {meeting.minutes ? "Minutes Recorded" : "Upcoming Session"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--muted)] pt-0.5">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-inset)] px-2.5 py-1 border border-[var(--border)]">
                          <Calendar className="h-3.5 w-3.5 text-[var(--purple)]" /> {fmtDate(meeting.date)}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-inset)] px-2.5 py-1 border border-[var(--border)]">
                          <Clock className="h-3.5 w-3.5 text-[var(--green)]" /> {meeting.startTime}{meeting.endTime ? `–${meeting.endTime}` : ""}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-inset)] px-2.5 py-1 border border-[var(--border)]">
                          <MapPin className="h-3.5 w-3.5 text-[var(--purple)]" /> {meeting.venue}
                        </span>
                      </div>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        className="icon-action red shrink-0 !h-9 !w-9"
                        title="Delete meeting"
                        onClick={() => handleDeleteMeeting(meeting.id, meeting.title)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-inset)] p-4 sm:p-5 text-xs sm:text-sm leading-relaxed">
                    <strong className="block text-[10px] font-bold uppercase tracking-wider text-[var(--faint)] mb-1.5">
                      Session Agenda
                    </strong>
                    <p className="text-[var(--text)] leading-relaxed">
                      {Array.isArray(meeting.agenda) ? meeting.agenda.join(" · ") : meeting.agenda}
                    </p>
                  </div>

                  {meeting.minutes ? (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5 text-xs sm:text-sm leading-relaxed">
                      <strong className="text-[var(--green)] block text-[11px] font-bold uppercase tracking-wider mb-2">
                        Official Meeting Minutes
                      </strong>
                      <p className="text-[var(--text)] whitespace-pre-wrap leading-relaxed">
                        {meeting.minutes}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-inset)] p-4 sm:p-5 text-xs italic text-[var(--faint)]">
                      No official minutes have been published for this session yet.
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-[var(--border)] flex flex-wrap items-center gap-3">
                  {canManage && (
                    <button
                      type="button"
                      className="btn btn-outline !min-h-9 !px-4 !text-xs"
                      onClick={() => openMinutesForMeeting(meeting.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> {meeting.minutes ? "Edit Minutes" : "Add Minutes"}
                    </button>
                  )}
                  {meeting.minutes && (
                    <button
                      type="button"
                      className="btn btn-secondary !min-h-9 !px-4 !text-xs"
                      onClick={() => {
                        downloadMinutes(meeting);
                        announce(`Downloaded minutes for ${meeting.title}.`);
                      }}
                    >
                      <Download className="h-3.5 w-3.5" /> Download Minutes (.txt)
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* SECTION 2: FILE RESOURCES FOLDER (SPACIOUS GRID) */}
        <section className="space-y-5 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2.5">
                <FileText className="h-5 w-5 text-[var(--green)]" />
                <span>Council File Resources &amp; Templates</span>
              </h2>
              <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
                Official constitution, budget templates, club handbooks, and downloadable council files.
              </p>
            </div>
            {canManage && (
              <button
                type="button"
                className="btn btn-primary !min-h-9 !px-4 !text-xs"
                onClick={() => {
                  setResError(null);
                  setResourceModalOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add File Resource
              </button>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {resourcesList.map((res) => (
              <div
                key={res.id}
                className="panel p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div className="resource-icon shrink-0">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold leading-snug">{res.title}</h3>
                      <span className="pill">{res.tag}</span>
                    </div>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      {res.category} · {res.size} · Updated {res.updated}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    className="btn btn-secondary !min-h-9 !px-3 !text-xs"
                    aria-label={`View ${res.title}`}
                    title="Preview resource"
                    onClick={() => setPreviewResource(res)}
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline !min-h-9 !px-3 !text-xs"
                    aria-label={`Download ${res.title}`}
                    title="Download file"
                    onClick={() => {
                      downloadResource(res);
                      announce(`Downloaded ${res.title}.`);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      className="icon-action red !h-9 !w-9"
                      aria-label={`Delete ${res.title}`}
                      title="Delete file resource"
                      onClick={() => handleDeleteResource(res)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

      {/* SCHEDULE MEETING MODAL */}
      <Modal
        open={open && canManage}
        onClose={() => setOpen(false)}
        title="Schedule Council Meeting"
        subtitle="Create an upcoming session or log a completed session with minutes."
      >
        <form onSubmit={schedule} className="form-stack">
          <label>
            <span className="field-label">Meeting Title *</span>
            <input
              className="control"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g., Term 2 Budget & Events Review"
            />
          </label>
          <div className="form-grid">
            <label>
              <span className="field-label">Date</span>
              <input
                type="date"
                className="control"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Start Time</span>
              <input
                type="time"
                className="control"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">End Time</span>
              <input
                type="time"
                className="control"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </label>
          </div>
          <label>
            <span className="field-label">Location</span>
            <input
              className="control"
              value={venue}
              onChange={(event) => setVenue(event.target.value)}
              placeholder="Council Room 204"
            />
          </label>
          <label>
            <span className="field-label">Agenda</span>
            <textarea
              className="control"
              rows={2}
              value={agenda}
              onChange={(event) => setAgenda(event.target.value)}
              placeholder="Topics to cover..."
            />
          </label>
          <label>
            <span className="field-label">Meeting Minutes (Optional — can also be added later)</span>
            <textarea
              className="control"
              rows={4}
              value={initialMinutes}
              onChange={(event) => setInitialMinutes(event.target.value)}
              placeholder="Record attendance, decisions, and action items now if the meeting has already occurred..."
            />
          </label>
          {error && <p className="field-error">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Meeting
            </button>
          </div>
        </form>
      </Modal>

      {/* ADD / EDIT MINUTES MODAL */}
      <Modal
        open={minutesModalOpen && canManage}
        onClose={() => setMinutesModalOpen(false)}
        title="Add / Edit Meeting Minutes"
        subtitle="Select a council meeting and record or update its official minutes."
      >
        <form onSubmit={saveMinutes} className="form-stack">
          <label>
            <span className="field-label">Select Meeting</span>
            <select
              className="control"
              value={selectedMeetingId}
              onChange={(e) => handleSelectMeetingInModal(e.target.value)}
            >
              {state.meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} ({fmtDate(m.date)}) {m.minutes ? "— Has Minutes" : "— No Minutes Yet"}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Minutes Summary & Action Items *</span>
            <textarea
              className="control"
              rows={6}
              required
              value={minutesDraft}
              onChange={(event) => setMinutesDraft(event.target.value)}
              placeholder="Summarize attendance, key decisions, votes, and next steps..."
            />
          </label>
          {minutesError && <p className="field-error">{minutesError}</p>}
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setMinutesModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Minutes
            </button>
          </div>
        </form>
      </Modal>

      {/* ADD FILE RESOURCE MODAL */}
      <Modal
        open={resourceModalOpen && canManage}
        onClose={() => setResourceModalOpen(false)}
        title="Add File Resource"
        subtitle="Upload a file or publish a template/document for students and council officers."
      >
        <form onSubmit={handleAddResource} className="form-stack">
          <label>
            <span className="field-label">Upload File from Device (Optional)</span>
            <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-inset)] px-4 py-3 text-xs font-semibold text-[var(--muted)] hover:border-[var(--purple)] hover:text-[var(--purple)] transition-colors">
              <Upload className="h-4 w-4" />
              <span>{resFileName ? `Attached: ${resFileName} (${resSize})` : "Choose PDF, DOCX, XLSX, TXT, or Image (max 4 MB)"}</span>
              <input
                type="file"
                className="hidden"
                onChange={handleResourceFileUpload}
              />
            </label>
          </label>

          <label>
            <span className="field-label">Document Title *</span>
            <input
              className="control"
              required
              value={resTitle}
              onChange={(e) => setResTitle(e.target.value)}
              placeholder="e.g., Student Council Event Proposal Form"
            />
          </label>

          <div className="form-grid">
            <label>
              <span className="field-label">Category</span>
              <select
                className="control"
                value={resCategory}
                onChange={(e) => setResCategory(e.target.value)}
              >
                <option value="Governance">Governance</option>
                <option value="Events">Events</option>
                <option value="Finance">Finance</option>
                <option value="Clubs">Clubs</option>
                <option value="Templates">Templates</option>
                <option value="General">General</option>
              </select>
            </label>
            <label>
              <span className="field-label">Format Tag</span>
              <select
                className="control"
                value={resTag}
                onChange={(e) => setResTag(e.target.value)}
              >
                <option value="PDF">PDF</option>
                <option value="DOCX">DOCX</option>
                <option value="XLSX">XLSX</option>
                <option value="TXT">TXT</option>
                <option value="GUIDE">GUIDE</option>
              </select>
            </label>
          </div>

          <label>
            <span className="field-label">Document Content / Notes (Optional)</span>
            <textarea
              className="control"
              rows={5}
              value={resContent}
              onChange={(e) => setResContent(e.target.value)}
              placeholder="Paste document text, template instructions, or resource notes here..."
            />
          </label>

          {resError && <p className="field-error">{resError}</p>}

          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setResourceModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Publish Resource
            </button>
          </div>
        </form>
      </Modal>

      {/* PREVIEW RESOURCE MODAL */}
      <Modal
        open={!!previewResource}
        onClose={() => setPreviewResource(null)}
        title={previewResource?.title ?? "Resource Preview"}
        subtitle={previewResource ? `${previewResource.category} · ${previewResource.tag} · ${previewResource.size}` : ""}
      >
        {previewResource && (
          <div className="form-stack">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-4 text-xs whitespace-pre-wrap leading-relaxed text-[var(--muted)] max-h-80 overflow-y-auto">
              {resourceText(previewResource)}
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPreviewResource(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  downloadResource(previewResource);
                  announce(`Downloaded ${previewResource.title}.`);
                }}
              >
                <Download className="h-3.5 w-3.5" /> Download Resource
              </button>
            </div>
          </div>
        )}
      </Modal>
      </div>
    </RevealBlocks>
  );
}

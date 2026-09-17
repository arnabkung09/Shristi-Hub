import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, CirclePlus, Download, Eye, EyeOff, KeyRound, LockKeyhole, MailPlus, Pencil, RotateCcw, Search, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useHub } from "../../store/hub";
import type { Student } from "../../lib/types";
import { GRADES, HOUSES } from "../../lib/seed";
import { buildStudentRecord, houseFullName, houseLogo, PRIMARY_ADMIN_ID, publicRoster, downloadJson } from "../../lib/admin";
import type { House } from "../../lib/types";
import { assertInstitutionalEmail } from "../../lib/ssot-auth";
import { ROSTER_SOURCE_ISSUES, ROSTER_SOURCE_URL } from "../../lib/whitelist-seed";
import { Modal } from "../ui";

type RowAction = { kind: "edit" | "password" | "activation" | "remove" | "emails"; student: Student };

export default function RosterTable() {
  const { state } = useHub();
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("all");
  const [house, setHouse] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<RowAction | null>(null);
  const [add, setAdd] = useState(false);
  const pageSize = 12;
  const rows = useMemo(() => state.users.filter((s) => `${s.name} ${s.email} ${(s.aliases ?? []).join(" ")} ${s.id}`.toLowerCase().includes(query.toLowerCase().trim()) && (grade === "all" || s.grade === Number(grade)) && (house === "all" || s.house === house) && (status === "all" || s.status === status)).sort((a, b) => HOUSES.indexOf(a.house ?? "Green") - HOUSES.indexOf(b.house ?? "Green") || (a.grade ?? 99) - (b.grade ?? 99) || a.id.localeCompare(b.id)), [state.users, query, grade, house, status]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const reset = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };
  return (
    <>
      <div className="roster-toolbar">
        <div className="search-control"><Search /><input className="control" aria-label="Search student name or any login email" placeholder="Search student name, school email, or personal email..." value={query} onChange={(e) => reset(setQuery, e.target.value)} /></div>
        <select className="control" aria-label="Filter by grade" value={grade} onChange={(e) => reset(setGrade, e.target.value)}><option value="all">All Grades</option>{GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select>
        <select className="control" aria-label="Filter by house" value={house} onChange={(e) => reset(setHouse, e.target.value)}><option value="all">All Houses</option>{HOUSES.map((h) => <option key={h} value={h}>{houseFullName(state.houses, h)}</option>)}</select>
        <button className="btn btn-primary" onClick={() => setAdd(true)}><CirclePlus />Add Student</button>
      </div>

      <section className="panel overflow-hidden" aria-label="Approved student database">
        <div className="panel-caption"><h2 className="eyebrow">Student Database ({state.users.length} students)</h2><select className="eyebrow cursor-pointer border-0 bg-transparent text-right focus:outline-none" aria-label="Filter account status" value={status} onChange={(e) => reset(setStatus, e.target.value)}><option value="all">All Account Statuses</option><option value="active">Active Accounts</option><option value="pending">Pending Sign Up</option></select></div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th className="w-[23%]">Full Name</th><th className="w-[28%]">School Email</th><th>Grade</th><th>House</th><th>Account Created</th><th className="actions-heading">Admin Actions</th></tr></thead>
            <tbody>{visible.map((s) => <tr key={s.id}>
              <td className="student-name">{s.name}{s.id === PRIMARY_ADMIN_ID && <ShieldCheck className="ml-1.5 inline h-3 w-3 text-emerald-400" />}</td>
              <td className="student-email">
                <span>{s.email}</span>
                {s.aliases && s.aliases.length > 0 && (
                  <span className="ml-1 text-[9px] font-semibold text-[var(--purple)]" title={`Additional login emails:\n${s.aliases.join("\n")}`}>
                    +{s.aliases.length} more
                  </span>
                )}
              </td>
              <td className="text-[10px]">{s.gradeLabel ?? "Staff"}</td>
              <td>{s.house ? <span className={`table-house ${s.house.toLowerCase()}`}>{houseLogo(state.houses, s.house) && <img src={houseLogo(state.houses, s.house)} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />}{houseFullName(state.houses, s.house)}</span> : <span className="text-[10px] text-[var(--faint)]">No House</span>}</td>
              <td><span className={`status-label ${s.status === "active" ? "active" : ""}`}>{s.status === "active" ? "Yes (Active Account)" : "No (Pending Sign Up)"}</span></td>
              <td><div className="row-actions">
                <button className="icon-action" title="Edit student profile" aria-label={`Edit ${s.name}`} onClick={() => setAction({ kind: "edit", student: s })}><Pencil /></button>
                <button className="icon-action orange" title="Reset account activation" aria-label={`Reset activation for ${s.name}`} onClick={() => setAction({ kind: "activation", student: s })}><RotateCcw /></button>
                <button className="icon-action purple" title="Reset student password" aria-label={`Reset password for ${s.name}`} onClick={() => setAction({ kind: "password", student: s })}><KeyRound /></button>
                <button className="icon-action" style={{ color: "var(--purple)" }} title="Manage login emails (multiple sign-in emails)" aria-label={`Manage login emails for ${s.name}`} onClick={() => setAction({ kind: "emails", student: s })}><MailPlus /></button>
                <button className="icon-action red" title="Remove student from roster" aria-label={`Remove ${s.name}`} onClick={() => setAction({ kind: "remove", student: s })}><Trash2 /></button>
              </div></td>
            </tr>)}</tbody>
          </table>
          {!rows.length && <div className="empty-content m-5"><Search /><strong>No students match your filters</strong><p>Try another name, grade, house, or account status.</p><button className="btn btn-secondary" onClick={() => { setQuery(""); setGrade("all"); setHouse("all"); setStatus("all"); }}>Clear filters</button></div>}
        </div>
        <div className="table-pagination"><span>Showing {rows.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, rows.length)} of {rows.length} students</span><div className="pagination-buttons"><button aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-3.5 w-3.5" /></button>{Array.from({ length: Math.min(5, pages) }, (_, i) => Math.max(1, Math.min(currentPage - 2, pages - 4)) + i).map((p) => <button key={p} className={currentPage === p ? "active" : ""} aria-label={`Page ${p}`} aria-current={currentPage === p ? "page" : undefined} onClick={() => setPage(p)}>{p}</button>)}{pages > 5 && currentPage < pages - 2 && <span className="px-1">...</span>}<button aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-3.5 w-3.5" /></button></div></div>
      </section>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[9px] text-[var(--faint)]"><span className="flex items-center gap-1.5"><LockKeyhole className="h-3 w-3" />Source: school-provided Google Sheet snapshot · Grades 1-10.</span><span className="flex gap-3"><a className="text-action !text-[9px]" href={ROSTER_SOURCE_URL} target="_blank" rel="noreferrer">Open source sheet</a><button className="text-action !text-[9px]" onClick={() => downloadJson("shristi-student-roster.json", { school: "Shristi Academy", source: ROSTER_SOURCE_URL, total: state.users.length, students: publicRoster(state.users), sourceIssues: ROSTER_SOURCE_ISSUES })}><Download />Export roster</button></span></div>

      {ROSTER_SOURCE_ISSUES.some((issue) => issue.requiresVerification) && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
          <p className="flex items-center gap-2 text-[11px] font-bold text-amber-400"><AlertTriangle className="h-4 w-4" />Source records requiring school verification</p>
          <div className="mt-2 space-y-2">{ROSTER_SOURCE_ISSUES.filter((issue) => issue.requiresVerification).map((issue) => <div key={issue.studentName} className="text-[10px] leading-relaxed text-[var(--muted)]"><strong className="text-[var(--text)]">{issue.studentName}:</strong> {issue.reason} <span className="font-mono text-[9px]">{issue.resolvedValue}</span></div>)}</div>
        </div>
      )}

      {action && <StudentDialog key={`${action.kind}-${action.student.id}`} action={action} onClose={() => setAction(null)} />}
      {add && <AddStudentDialog onClose={() => setAdd(false)} />}
    </>
  );
}

function AddStudentDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch, announce } = useHub();
  const [form, setForm] = useState({ name: "", email: "", grade: 6, house: "Blue" as House, accountKind: "student" as "student" | "teacher" });
  const [error, setError] = useState("");
  const isTeacher = form.accountKind === "teacher";
  return (
    <Modal open onClose={onClose} title="Add Roster Account" subtitle="New accounts start as Pending Sign Up and activate on first sign-in." icon={<UserPlus />}>
      <form onSubmit={(e) => {
        e.preventDefault();
        try {
          const email = assertInstitutionalEmail(form.email);
          const slug = email.split("@")[0].replace(/[^a-z0-9]/g, "").slice(0, 20);
          dispatch({
            type: "ADD_STUDENT",
            student: buildStudentRecord({
              id: `${isTeacher ? "tch" : "shr"}-${slug || Math.random().toString(36).slice(2, 10)}`,
              name: form.name, email,
              grade: isTeacher ? form.grade : form.grade,
              house: isTeacher ? form.house : form.house,
              role: form.accountKind,
            }),
          });
          announce(`${form.name.trim()} added as ${isTeacher ? "a teacher" : "a student"}.`);
          onClose();
        } catch (err) { setError(err instanceof Error ? err.message : "Unable to add this account."); }
      }}>
        <div className="form-stack">
          <label className="form-field"><span>Account type</span><select className="control" value={form.accountKind} onChange={(e) => setForm({ ...form, accountKind: e.target.value as "student" | "teacher" })}><option value="student">Student</option><option value="teacher">Teacher</option></select></label>
          <label className="form-field"><span>Full name</span><input required minLength={2} maxLength={100} className="control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isTeacher ? "e.g. Anita Sharma" : "e.g. Sneha Karki"} /></label>
          <label className="form-field"><span>School email</span><input required type="email" className="control" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@shristiacademy.edu.np" /><small>Must use the @shristiacademy.edu.np institutional domain.</small></label>
          <div className="form-grid">
            <label className="form-field"><span>{isTeacher ? "Class (optional)" : "Grade"}</span><select className="control" value={form.grade} onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}>{isTeacher && <option value="">No class</option>}{GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select></label>
            <label className="form-field"><span>{isTeacher ? "House (optional)" : "House"}</span><select className="control" value={form.house} onChange={(e) => setForm({ ...form, house: e.target.value as House })}>{isTeacher && <option value="">No house</option>}{HOUSES.map((h) => <option key={h} value={h}>{houseFullName(state.houses, h)}</option>)}</select></label>
          </div>
          <p className="inline-message">The account receives the default demo password <strong>{isTeacher ? "teacher123" : "student123"}</strong>. Reset it from the roster actions before sharing.</p>
          {error && <p role="alert" className="inline-message error">{error}</p>}
        </div>
        <div className="dialog-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary"><UserPlus />Add {isTeacher ? "teacher" : "student"}</button></div>
      </form>
    </Modal>
  );
}

function StudentDialog({ action, onClose }: { action: RowAction; onClose: () => void }) {
  const { state, user, dispatch, announce } = useHub();
  const { student, kind } = action;
  const [name, setName] = useState(student.name);
  const [grade, setGrade] = useState<number | null>(student.grade);
  const [house, setHouse] = useState<House | null>(student.house);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const primary = student.id === PRIMARY_ADMIN_ID;
  const [newEmail, setNewEmail] = useState("");
  const titles = { edit: "Edit Student Profile", password: "Reset Student Credentials", activation: "Reset Account Activation", remove: "Remove Student from Roster", emails: "Login Emails & Aliases" };
  const currentStudent = state.users.find((u) => u.id === student.id) ?? student;
  const allEmails = [currentStudent.email, ...(currentStudent.aliases ?? [])];

  const submit = () => {
    try {
      if (kind === "edit") dispatch({ type: "EDIT_STUDENT", userId: student.id, name: name.trim(), grade, house });
      if (kind === "password" && user) dispatch({ type: "RESET_PASSWORD", actorId: user.id, userId: student.id, password });
      if (kind === "activation") dispatch({ type: "RESET_ACTIVATION", userId: student.id });
      if (kind === "remove") dispatch({ type: "DELETE_STUDENT", userId: student.id });
      announce(kind === "password" ? `Credentials updated for ${student.name} only.` : kind === "activation" ? `${student.name}'s account is now pending.` : kind === "remove" ? `${student.name} removed from the roster.` : "Student profile saved.");
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save."); }
  };

  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      dispatch({ type: "ADD_STUDENT_EMAIL", userId: student.id, email: newEmail.trim() });
      announce(`Added ${newEmail.trim().toLowerCase()} to ${student.name}'s sign-in emails.`);
      setNewEmail("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add email.");
    }
  };

  const handleRemoveEmail = (em: string) => {
    try {
      dispatch({ type: "REMOVE_STUDENT_EMAIL", userId: student.id, email: em });
      announce(`Removed ${em} from ${student.name}'s sign-in emails.`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove email.");
    }
  };

  return <Modal open onClose={onClose} title={titles[kind]} icon={kind === "password" ? <KeyRound /> : kind === "emails" ? <MailPlus /> : <ShieldCheck />} subtitle={`${student.name} / ${allEmails.join(", ")}`}>
    {kind === "emails" ? (
      <div className="form-stack">
        <p className="inline-message">
          <strong>{currentStudent.email}</strong> remains the required school email. Add optional personal emails from providers such as Gmail or Outlook so the student can use any linked address to sign into this same account with the same password.
        </p>

        <div>
          <span className="mb-2 block text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Authorized sign-in emails ({allEmails.length})
          </span>
          <div className="space-y-2">
            {allEmails.map((em, idx) => (
              <div key={em} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--text)]">{em}</span>
                  {idx === 0 ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400">
                      School primary · required
                    </span>
                  ) : (
                    <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-indigo-300">
                      Alias
                    </span>
                  )}
                </div>
                {idx > 0 && (
                  <button
                    type="button"
                    className="icon-action red"
                    title={`Remove ${em}`}
                    aria-label={`Remove email ${em}`}
                    onClick={() => handleRemoveEmail(em)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleAddEmail} className="mt-2">
          <label className="form-field">
            <span>Add an authorized email</span>
            <div className="flex gap-2">
              <input
                required
                type="email"
                className="control flex-1"
                placeholder="student.personal@gmail.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <button type="submit" className="btn btn-primary whitespace-nowrap">
                <MailPlus className="h-3.5 w-3.5" /> Add Email
              </button>
            </div>
            <small>Personal or school email accepted. It must be valid and cannot already belong to another student account.</small>
          </label>
        </form>

        {error && <p role="alert" className="inline-message error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    ) : (
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="form-stack">
          {kind === "edit" && <><label className="form-field"><span>Full name</span><input className="control" required minLength={2} maxLength={100} value={name} disabled={primary} onChange={(e) => setName(e.target.value)} /></label><div className="form-grid"><label className="form-field"><span>{student.role === "teacher" ? "Class" : "Grade"}</span><select className="control" value={grade ?? ""} disabled={primary} onChange={(e) => setGrade(e.target.value === "" ? null : Number(e.target.value))}>{student.role === "teacher" && <option value="">No class</option>}{GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select></label><label className="form-field"><span>{student.role === "teacher" ? "House" : "House"}</span><select className="control" value={house ?? ""} disabled={primary} onChange={(e) => setHouse(e.target.value === "" ? null : e.target.value as House)}>{student.role === "teacher" && <option value="">No house</option>}{HOUSES.map((h) => <option key={h} value={h}>{houseFullName(state.houses, h)}</option>)}</select></label></div><p className="inline-message">{primary ? "The primary administrator's identity is protected." : "Account ID and school email are immutable. Teachers may have no class or house."}</p></>}
          {kind === "password" && <><p className="inline-message">Set a new demo credential directly, without email delivery. Share it privately with the student. Never reuse a real password in this preview.</p><label className="form-field"><span>New password</span><div className="relative"><input className="control !pr-11" type={reveal ? "text" : "password"} value={password} minLength={8} required autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /><button type="button" className="icon-action absolute right-1 top-1" aria-label={reveal ? "Hide password" : "Show password"} onClick={() => setReveal(!reveal)}>{reveal ? <EyeOff /> : <Eye />}</button></div></label><button type="button" className="btn btn-outline self-start" onClick={() => { const bytes = crypto.getRandomValues(new Uint8Array(10)); setPassword(`SA-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`); setReveal(true); }}><KeyRound />Generate temporary password</button></>}
          {kind === "activation" && <p className="inline-message">{primary ? "The primary administrator must remain active to prevent lockout." : "Return this account to Pending Sign Up? The approved roster record and current credential will be retained. The student's next authenticated sign-in will activate it again."}</p>}
          {kind === "remove" && <p className="inline-message">{primary ? "The primary administrator cannot be removed, to prevent an administrator lockout." : <>Remove <strong>{student.name}</strong> from the roster? Their account, council role, event registrations, and poll votes are deleted. House points and published records stay intact.</>}</p>}
          {error && <p role="alert" className="inline-message error">{error}</p>}
        </div>
        <div className="dialog-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Close view</button>{!(primary && kind !== "password") && <button type="submit" className={`btn ${kind === "activation" || kind === "remove" ? "btn-danger" : "btn-primary"}`}>{kind === "password" ? "Set new password" : kind === "activation" ? "Reset activation" : kind === "remove" ? "Remove student" : "Save changes"}</button>}</div>
      </form>
    )}
  </Modal>;
}

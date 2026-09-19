import { useMemo, useState } from "react";
import {
  AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, CirclePlus,
  Clock, Download, Eye, EyeOff, GraduationCap, KeyRound, LockKeyhole, MailPlus,
  Pencil, RotateCcw, School, Search, ShieldCheck, Trash2, UserCheck, UserPlus,
} from "lucide-react";
import { useHub } from "../../store/hub";
import type { House, Role, Student } from "../../lib/types";
import { GRADES, HOUSES } from "../../lib/seed";
import {
  buildStudentRecord, houseFullName, houseLogo, PRIMARY_ADMIN_ID,
  publicRoster, downloadJson,
} from "../../lib/admin";
import { assertInstitutionalEmail } from "../../lib/ssot-auth";
import { ROSTER_SOURCE_ISSUES, ROSTER_SOURCE_URL } from "../../lib/whitelist-seed";
import { Modal } from "../ui";
import {
  clearConfirmationCode, getPendingConfirmation, issueConfirmationCode,
} from "../../lib/verification";

type DatabaseTab = "students" | "teachers" | "classes";
type RowAction = { kind: "edit" | "password" | "activation" | "remove" | "emails"; student: Student };

export default function RosterTable() {
  const { state } = useHub();
  const [dbTab, setDbTab] = useState<DatabaseTab>("students");
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("all");
  const [house, setHouse] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<RowAction | null>(null);
  const [addModal, setAddModal] = useState<DatabaseTab | null>(null);

  const studentCount = useMemo(
    () => state.users.filter((u) => u.role === "student" || u.role === "council" || u.role === "admin").length,
    [state.users]
  );
  const teacherCount = useMemo(
    () => state.users.filter((u) => u.role === "teacher").length,
    [state.users]
  );
  const classCount = useMemo(
    () => state.users.filter((u) => u.role === "grade").length,
    [state.users]
  );

  const rows = useMemo(() => {
    return state.users
      .filter((u) => {
        if (dbTab === "students") return u.role === "student" || u.role === "council" || u.role === "admin";
        if (dbTab === "teachers") return u.role === "teacher";
        if (dbTab === "classes") return u.role === "grade";
        return true;
      })
      .filter((s) => {
        const text = `${s.name} ${s.email} ${(s.aliases ?? []).join(" ")} ${s.id}`.toLowerCase();
        const matchesQuery = text.includes(query.toLowerCase().trim());
        const matchesGrade = grade === "all" || s.grade === Number(grade);
        const matchesHouse = house === "all" || s.house === house;
        const matchesStatus = status === "all" || s.status === status;
        return matchesQuery && matchesGrade && matchesHouse && matchesStatus;
      })
      .sort((a, b) => {
        if (dbTab === "classes") return (a.grade ?? 99) - (b.grade ?? 99) || a.name.localeCompare(b.name);
        return (
          HOUSES.indexOf(a.house ?? "Green") - HOUSES.indexOf(b.house ?? "Green") ||
          (a.grade ?? 99) - (b.grade ?? 99) ||
          a.id.localeCompare(b.id)
        );
      });
  }, [state.users, dbTab, query, grade, house, status]);

  const pageSize = 12;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const reset = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const switchTab = (tab: DatabaseTab) => {
    setDbTab(tab);
    setQuery("");
    setGrade("all");
    setHouse("all");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      {/* Three Database Toggles */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-sm">
        <button
          type="button"
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            dbTab === "students"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-[var(--muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text)]"
          }`}
          onClick={() => switchTab("students")}
        >
          <GraduationCap className="h-4 w-4" />
          <span>Student Database</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
              dbTab === "students" ? "bg-white/20 text-white" : "bg-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {studentCount}
          </span>
        </button>

        <button
          type="button"
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            dbTab === "teachers"
              ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
              : "text-[var(--muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text)]"
          }`}
          onClick={() => switchTab("teachers")}
        >
          <UserCheck className="h-4 w-4" />
          <span>Teacher Database</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
              dbTab === "teachers" ? "bg-white/20 text-white" : "bg-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {teacherCount}
          </span>
        </button>

        <button
          type="button"
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            dbTab === "classes"
              ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
              : "text-[var(--muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text)]"
          }`}
          onClick={() => switchTab("classes")}
        >
          <School className="h-4 w-4" />
          <span>Class Database</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
              dbTab === "classes" ? "bg-white/20 text-white" : "bg-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {classCount}
          </span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="roster-toolbar">
        <div className="search-control">
          <Search />
          <input
            className="control"
            aria-label={`Search ${dbTab}`}
            placeholder={
              dbTab === "students"
                ? "Search student name, school email, or personal email..."
                : dbTab === "teachers"
                ? "Search teacher name, house, or login email..."
                : "Search class name or class login email..."
            }
            value={query}
            onChange={(e) => reset(setQuery, e.target.value)}
          />
        </div>

        {dbTab !== "teachers" && (
          <select
            className="control"
            aria-label="Filter by grade"
            value={grade}
            onChange={(e) => reset(setGrade, e.target.value)}
          >
            <option value="all">All Grades</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        )}

        {dbTab !== "classes" && (
          <select
            className="control"
            aria-label="Filter by house"
            value={house}
            onChange={(e) => reset(setHouse, e.target.value)}
          >
            <option value="all">All Houses</option>
            {HOUSES.map((h) => (
              <option key={h} value={h}>
                {houseFullName(state.houses, h)}
              </option>
            ))}
          </select>
        )}

        <button
          className="btn btn-primary whitespace-nowrap"
          onClick={() => setAddModal(dbTab)}
        >
          <CirclePlus />
          {dbTab === "students"
            ? "Add Student"
            : dbTab === "teachers"
            ? "Add Teacher"
            : "Add Class Account"}
        </button>
      </div>

      {/* Main Database Table Panel */}
      <section className="panel overflow-hidden" aria-label={`${dbTab} database`}>
        <div className="panel-caption">
          <h2 className="eyebrow">
            {dbTab === "students"
              ? `Student Database (${rows.length} of ${studentCount})`
              : dbTab === "teachers"
              ? `Teacher Database (${rows.length} of ${teacherCount})`
              : `Class Database (${rows.length} of ${classCount})`}
          </h2>
          <select
            className="eyebrow cursor-pointer border-0 bg-transparent text-right focus:outline-none"
            aria-label="Filter account status"
            value={status}
            onChange={(e) => reset(setStatus, e.target.value)}
          >
            <option value="all">All Account Statuses</option>
            <option value="active">Active Accounts</option>
            <option value="pending">Pending Sign Up</option>
          </select>
        </div>

        {/* Database context banner */}
        <div className="border-b border-[var(--border)] bg-[var(--surface-inset)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
          {dbTab === "students" ? (
            <span>
              <strong>Student Accounts:</strong> Full participation across House Championship, council appointments, surveys, voting, and general site activities.
            </span>
          ) : dbTab === "teachers" ? (
            <span>
              <strong>Teacher Accounts:</strong> Teachers have individual house assignments (Blue, Red, or Green), participate in the House Hub, vote in polls, submit suggestions, and can be appointed to the Council Hub.
            </span>
          ) : (
            <span>
              <strong>Class Accounts:</strong> Class-level accounts representing grades. A class account cannot participate in surveys or polls and is not part of houses, but can view all other pages.
            </span>
          )}
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-[23%]">
                  {dbTab === "classes" ? "Class Name" : "Full Name"}
                </th>
                <th className="w-[26%]">Official School Email</th>
                <th>{dbTab === "teachers" ? "Class" : "Grade"}</th>
                <th>House</th>
                <th>Status</th>
                <th className="actions-heading">Account Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id}>
                  <td className="student-name">
                    <span className="font-semibold">{s.name}</span>
                    {s.id === PRIMARY_ADMIN_ID && (
                      <span className="ml-1.5 inline-flex" title="Primary Administrator" aria-label="Primary Administrator">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      </span>
                    )}
                    {state.councilHubMembers.includes(s.id) && s.id !== PRIMARY_ADMIN_ID && (
                      <span className="ml-1.5 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-indigo-400" title="Council Hub Member">
                        Council
                      </span>
                    )}
                  </td>
                  <td className="student-email">
                    <span className="font-mono text-xs">{s.email}</span>
                    {s.aliases && s.aliases.length > 0 && (
                      <span
                        className="ml-1.5 rounded-full bg-indigo-500/10 px-1.5 py-0.2 text-[9px] font-semibold text-[var(--purple)]"
                        title={`Authorized sign-in emails:\n${s.aliases.join("\n")}`}
                      >
                        +{s.aliases.length} alias{s.aliases.length > 1 ? "es" : ""}
                      </span>
                    )}
                  </td>
                  <td className="text-[10px]">
                    {s.gradeLabel ?? (s.role === "teacher" ? "General Staff" : "—")}
                  </td>
                  <td>
                    {s.house ? (
                      <span className={`table-house ${s.house.toLowerCase()}`}>
                        {houseLogo(state.houses, s.house) && (
                          <img
                            src={houseLogo(state.houses, s.house)}
                            alt=""
                            className="h-3.5 w-3.5 rounded-full object-cover"
                          />
                        )}
                        {houseFullName(state.houses, s.house)}
                      </span>
                    ) : (
                      <span className="text-[10px] italic text-[var(--faint)]">
                        {s.role === "grade" ? "Neutral (No House)" : "No House"}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`status-label ${s.status === "active" ? "active" : ""}`}>
                      {s.status === "active" ? "Active Account" : "Pending Sign Up"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-action"
                        title="Edit profile"
                        aria-label={`Edit ${s.name}`}
                        onClick={() => setAction({ kind: "edit", student: s })}
                      >
                        <Pencil />
                      </button>
                      <button
                        className="icon-action orange"
                        title="Reset account activation status"
                        aria-label={`Reset activation for ${s.name}`}
                        onClick={() => setAction({ kind: "activation", student: s })}
                      >
                        <RotateCcw />
                      </button>
                      <button
                        className="icon-action purple"
                        title="Reset password"
                        aria-label={`Reset password for ${s.name}`}
                        onClick={() => setAction({ kind: "password", student: s })}
                      >
                        <KeyRound />
                      </button>
                      <button
                        className="icon-action"
                        style={{ color: "var(--purple)" }}
                        title="Manage login emails & aliases (add verified email)"
                        aria-label={`Manage login emails for ${s.name}`}
                        onClick={() => setAction({ kind: "emails", student: s })}
                      >
                        <MailPlus />
                      </button>
                      <button
                        className="icon-action red"
                        title="Remove account entirely"
                        aria-label={`Remove ${s.name}`}
                        onClick={() => setAction({ kind: "remove", student: s })}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!rows.length && (
            <div className="empty-content m-5">
              <Search />
              <strong>No accounts match your current filters</strong>
              <p>Try clearing your search query or adjusting grade/house filters.</p>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setQuery("");
                  setGrade("all");
                  setHouse("all");
                  setStatus("all");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        <div className="table-pagination">
          <span>
            Showing {rows.length ? (currentPage - 1) * pageSize + 1 : 0}-
            {Math.min(currentPage * pageSize, rows.length)} of {rows.length} accounts
          </span>
          <div className="pagination-buttons">
            <button
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {Array.from({ length: Math.min(5, pages) }, (_, i) =>
              Math.max(1, Math.min(currentPage - 2, pages - 4)) + i
            ).map((p) => (
              <button
                key={p}
                className={currentPage === p ? "active" : ""}
                aria-label={`Page ${p}`}
                aria-current={currentPage === p ? "page" : undefined}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            {pages > 5 && currentPage < pages - 2 && <span className="px-1">...</span>}
            <button
              aria-label="Next page"
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Export & source snapshot bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[9px] text-[var(--faint)]">
        <span className="flex items-center gap-1.5">
          <LockKeyhole className="h-3 w-3" />
          Official Roster Snapshot · {studentCount} Students · {teacherCount} Teachers · {classCount} Classes
        </span>
        <span className="flex gap-3">
          <a className="text-action !text-[9px]" href={ROSTER_SOURCE_URL} target="_blank" rel="noreferrer">
            Open source sheet
          </a>
          <button
            className="text-action !text-[9px]"
            onClick={() =>
              downloadJson("shristi-school-roster.json", {
                school: state.branding.schoolName,
                total: state.users.length,
                students: studentCount,
                teachers: teacherCount,
                classes: classCount,
                accounts: publicRoster(state.users),
              })
            }
          >
            <Download /> Export database ({dbTab})
          </button>
        </span>
      </div>

      {ROSTER_SOURCE_ISSUES.some((issue) => issue.requiresVerification) && dbTab === "students" && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
          <p className="flex items-center gap-2 text-[11px] font-bold text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Source records requiring school verification
          </p>
          <div className="mt-2 space-y-2">
            {ROSTER_SOURCE_ISSUES.filter((issue) => issue.requiresVerification).map((issue) => (
              <div key={issue.studentName} className="text-[10px] leading-relaxed text-[var(--muted)]">
                <strong className="text-[var(--text)]">{issue.studentName}:</strong> {issue.reason}{" "}
                <span className="font-mono text-[9px]">{issue.resolvedValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Dialogs */}
      {action && (
        <AccountDialog
          key={`${action.kind}-${action.student.id}`}
          action={action}
          onClose={() => setAction(null)}
        />
      )}

      {/* Add Modals for Student / Teacher / Class */}
      {addModal && (
        <AddAccountModal
          type={addModal}
          onClose={() => setAddModal(null)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------ Add Account Modal */

function AddAccountModal({
  type,
  onClose,
}: {
  type: DatabaseTab;
  onClose: () => void;
}) {
  const { state, dispatch, announce } = useHub();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [grade, setGrade] = useState<number | null>(type === "teachers" ? null : 10);
  const [house, setHouse] = useState<House | null>(type === "classes" ? null : "Blue");
  const [error, setError] = useState("");

  const defaultPassword =
    type === "teachers" ? "teacher123" : type === "classes" ? "grade123" : "student123";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const normalizedEmail = assertInstitutionalEmail(email);
      const slug = normalizedEmail.split("@")[0].replace(/[^a-z0-9]/g, "").slice(0, 20);
      const prefix = type === "teachers" ? "tch" : type === "classes" ? "cls" : "shr";
      const id = `${prefix}-${slug || Math.random().toString(36).slice(2, 8)}`;

      const role: Role = type === "teachers" ? "teacher" : type === "classes" ? "grade" : "student";

      const newAccount = buildStudentRecord({
        id,
        name: name.trim(),
        email: normalizedEmail,
        grade,
        house,
        role,
      });

      dispatch({ type: "ADD_STUDENT", student: newAccount });
      announce(`${newAccount.name} was added to the ${type} database.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add account.");
    }
  };

  const title =
    type === "teachers"
      ? "Add Teacher Account"
      : type === "classes"
      ? "Add Class Account"
      : "Add Student Account";

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle="New accounts start as Pending Sign Up and activate on first sign-in."
      icon={<UserPlus />}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-stack">
          <label className="form-field">
            <span>{type === "classes" ? "Class Name" : "Full Name"}</span>
            <input
              required
              minLength={2}
              maxLength={100}
              className="control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                type === "teachers"
                  ? "e.g. Anita Sharma"
                  : type === "classes"
                  ? "e.g. Grade 10 Class"
                  : "e.g. Sneha Karki"
              }
            />
          </label>

          <label className="form-field">
            <span>School Email</span>
            <input
              required
              type="email"
              className="control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                type === "teachers"
                  ? "anita.sharma@shristiacademy.edu.np"
                  : type === "classes"
                  ? "grade10@shristiacademy.edu.np"
                  : "72019sneha@shristiacademy.edu.np"
              }
            />
            <small>Must end with @shristiacademy.edu.np</small>
          </label>

          <div className="form-grid">
            {type !== "teachers" ? (
              <label className="form-field">
                <span>Grade Level</span>
                <select
                  className="control"
                  value={grade ?? 10}
                  onChange={(e) => setGrade(Number(e.target.value))}
                  required
                >
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="form-field">
                <span>Class Assignment (Optional)</span>
                <select
                  className="control"
                  value={grade ?? ""}
                  onChange={(e) => setGrade(e.target.value === "" ? null : Number(e.target.value))}
                >
                  <option value="">No Class / General Staff</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {type !== "classes" ? (
              <label className="form-field">
                <span>Individual House</span>
                <select
                  className="control"
                  value={house ?? "Blue"}
                  onChange={(e) => setHouse(e.target.value as House)}
                  required
                >
                  {HOUSES.map((h) => (
                    <option key={h} value={h}>
                      {houseFullName(state.houses, h)}
                    </option>
                  ))}
                </select>
                {type === "teachers" && (
                  <small>Teachers belong to their individual house and participate in House Hub.</small>
                )}
              </label>
            ) : (
              <label className="form-field">
                <span>House Assignment</span>
                <input
                  className="control cursor-not-allowed opacity-75"
                  value="Neutral · Not in houses"
                  disabled
                />
                <small>Class accounts are neutral and not assigned to houses.</small>
              </label>
            )}
          </div>

          <p className="inline-message">
            The account receives default password <strong>{defaultPassword}</strong>. You can reset it anytime from database actions.
          </p>

          {error && <p role="alert" className="inline-message error">{error}</p>}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            <UserPlus /> Add Account
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------ Account Action Dialog */

function AccountDialog({
  action,
  onClose,
}: {
  action: RowAction;
  onClose: () => void;
}) {
  const { state, user, dispatch, announce } = useHub();
  const { student, kind } = action;

  const [name, setName] = useState(student.name);
  const [grade, setGrade] = useState<number | null>(student.grade);
  const [house, setHouse] = useState<House | null>(student.house);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [sentCodeNotice, setSentCodeNotice] = useState<string | null>(null);

  const primary = student.id === PRIMARY_ADMIN_ID;
  const currentStudent = state.users.find((u) => u.id === student.id) ?? student;
  const allEmails = [currentStudent.email, ...(currentStudent.aliases ?? [])];

  const titles = {
    edit: `Edit ${student.role === "teacher" ? "Teacher" : student.role === "grade" ? "Class" : "Student"} Profile`,
    password: "Reset Account Password",
    activation: "Reset Account Activation",
    remove: "Remove Account Entirely",
    emails: "Login Emails & Verified Aliases",
  };

  const submit = () => {
    try {
      if (kind === "edit") {
        dispatch({
          type: "EDIT_STUDENT",
          userId: student.id,
          name: name.trim(),
          grade,
          house,
        });
      }
      if (kind === "password" && user) {
        dispatch({
          type: "RESET_PASSWORD",
          actorId: user.id,
          userId: student.id,
          password,
        });
      }
      if (kind === "activation") {
        dispatch({ type: "RESET_ACTIVATION", userId: student.id });
      }
      if (kind === "remove") {
        dispatch({ type: "DELETE_STUDENT", userId: student.id });
      }

      announce(
        kind === "password"
          ? `Credentials updated for ${student.name}.`
          : kind === "activation"
          ? `${student.name}'s account is now pending activation.`
          : kind === "remove"
          ? `${student.name} was removed from the database.`
          : "Account profile saved successfully."
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    }
  };

  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const trimmed = newEmail.trim().toLowerCase();
      dispatch({ type: "ADD_STUDENT_EMAIL", userId: student.id, email: trimmed });
      // Issue confirmation code
      const code = issueConfirmationCode(student.id, trimmed, currentStudent.email);
      setSentCodeNotice(
        `Added ${trimmed} (Pending Verification). A 6-digit confirmation code [ ${code} ] was dispatched to primary school account ${currentStudent.email}.`
      );
      announce(`Added ${trimmed}. Confirmation code required on login.`);
      setNewEmail("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add email.");
    }
  };

  const handleVerifyEmail = (em: string) => {
    try {
      dispatch({ type: "VERIFY_STUDENT_EMAIL", userId: student.id, email: em });
      clearConfirmationCode(student.id, em);
      announce(`Verified ${em} for ${student.name}.`);
      setSentCodeNotice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify email.");
    }
  };

  const handleSendCode = (em: string) => {
    const code = issueConfirmationCode(student.id, em, currentStudent.email);
    setSentCodeNotice(
      `Dispatched 6-digit confirmation code [ ${code} ] to official school account ${currentStudent.email}.`
    );
    announce(`Confirmation code ${code} sent to ${currentStudent.email}.`);
  };

  const handleRemoveEmail = (em: string) => {
    try {
      dispatch({ type: "REMOVE_STUDENT_EMAIL", userId: student.id, email: em });
      clearConfirmationCode(student.id, em);
      announce(`Removed ${em} from ${student.name}'s authorized emails.`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove email.");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={titles[kind]}
      icon={
        kind === "password" ? (
          <KeyRound />
        ) : kind === "emails" ? (
          <MailPlus />
        ) : (
          <ShieldCheck />
        )
      }
      subtitle={`${student.name} · ${student.email}`}
    >
      {kind === "emails" ? (
        <div className="form-stack">
          <p className="inline-message">
            <strong>{currentStudent.email}</strong> is the base school account. You can link additional personal or alternate sign-in emails. When the user logs in with an added email, a 6-digit confirmation code is sent to their base school account to verify it.
          </p>

          {sentCodeNotice && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-300">
              <p className="font-semibold flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Code Sent to School Email</p>
              <p className="mt-1 font-mono text-[11px]">{sentCodeNotice}</p>
            </div>
          )}

          <div>
            <span className="mb-2 block text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Authorized sign-in emails ({allEmails.length})
            </span>
            <div className="space-y-2">
              {allEmails.map((em, idx) => {
                const isPrimary = idx === 0;
                const isVerified = isPrimary || (currentStudent.verifiedAliases ?? []).includes(em);
                const pending = !isPrimary && !isVerified ? getPendingConfirmation(student.id, em) : null;

                return (
                  <div
                    key={em}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] px-3.5 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-[var(--text)]">{em}</span>

                      {isPrimary ? (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> School primary · Verified
                        </span>
                      ) : isVerified ? (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Verified
                        </span>
                      ) : (
                        <span
                          className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-400"
                          title={pending ? `A confirmation code was issued ${new Date(pending.createdAt).toLocaleString()}` : "Send a 6-digit code, then verify this email."}
                        >
                          <Clock className="h-3 w-3" /> Pending Verification · Code Required
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isPrimary && !isVerified && (
                        <>
                          <button
                            type="button"
                            className="btn btn-outline !min-h-[26px] !px-2.5 !py-0.5 !text-[9px]"
                            title="Send 6-digit confirmation code to base school email"
                            onClick={() => handleSendCode(em)}
                          >
                            Send Code
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary !min-h-[26px] !px-2.5 !py-0.5 !text-[9px]"
                            title="Mark email as verified directly"
                            onClick={() => handleVerifyEmail(em)}
                          >
                            <Check className="h-3 w-3" /> Verify Now
                          </button>
                        </>
                      )}
                      {!isPrimary && (
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
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleAddEmail} className="mt-3">
            <label className="form-field">
              <span>Add another sign-in email</span>
              <div className="flex gap-2">
                <input
                  required
                  type="email"
                  className="control flex-1"
                  placeholder="personal.email@gmail.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <button type="submit" className="btn btn-primary whitespace-nowrap">
                  <MailPlus className="h-3.5 w-3.5" /> Add Email
                </button>
              </div>
              <small>
                A 6-digit confirmation code will be dispatched to their base school account ({currentStudent.email}) to verify access upon login.
              </small>
            </label>
          </form>

          {error && <p role="alert" className="inline-message error">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="form-stack">
            {kind === "edit" && (
              <>
                <label className="form-field">
                  <span>{student.role === "grade" ? "Class Name" : "Full name"}</span>
                  <input
                    className="control"
                    required
                    minLength={2}
                    maxLength={100}
                    value={name}
                    disabled={primary}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>

                <div className="form-grid">
                  <label className="form-field">
                    <span>{student.role === "teacher" ? "Class Assignment" : "Grade"}</span>
                    <select
                      className="control"
                      value={grade ?? ""}
                      disabled={primary}
                      onChange={(e) =>
                        setGrade(e.target.value === "" ? null : Number(e.target.value))
                      }
                    >
                      {student.role === "teacher" && <option value="">No Class / Staff</option>}
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          Grade {g}
                        </option>
                      ))}
                    </select>
                  </label>

                  {student.role !== "grade" ? (
                    <label className="form-field">
                      <span>House</span>
                      <select
                        className="control"
                        value={house ?? ""}
                        disabled={primary}
                        onChange={(e) =>
                          setHouse(e.target.value === "" ? null : (e.target.value as House))
                        }
                      >
                        {HOUSES.map((h) => (
                          <option key={h} value={h}>
                            {houseFullName(state.houses, h)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="form-field">
                      <span>House</span>
                      <input
                        className="control opacity-70"
                        value="Neutral · Not part of houses"
                        disabled
                      />
                    </label>
                  )}
                </div>

                <p className="inline-message">
                  {primary
                    ? "The primary administrator's identity is protected."
                    : "School email and ID are immutable. Updates sync across rosters, directories, and live sessions."}
                </p>
              </>
            )}

            {kind === "password" && (
              <>
                <p className="inline-message">
                  Set a new password for <strong>{student.name}</strong>. Share it with them securely.
                </p>
                <label className="form-field">
                  <span>New password</span>
                  <div className="relative">
                    <input
                      className="control !pr-11"
                      type={reveal ? "text" : "password"}
                      value={password}
                      minLength={8}
                      required
                      autoComplete="new-password"
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      className="icon-action absolute right-1 top-1"
                      aria-label={reveal ? "Hide password" : "Show password"}
                      onClick={() => setReveal(!reveal)}
                    >
                      {reveal ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      const def =
                        student.role === "teacher"
                          ? "teacher123"
                          : student.role === "grade"
                          ? "grade123"
                          : "student123";
                      setPassword(def);
                      setReveal(true);
                    }}
                  >
                    Use default ({student.role === "teacher" ? "teacher123" : student.role === "grade" ? "grade123" : "student123"})
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      const bytes = crypto.getRandomValues(new Uint8Array(8));
                      setPassword(
                        `SA-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
                      );
                      setReveal(true);
                    }}
                  >
                    <KeyRound /> Generate Random
                  </button>
                </div>
              </>
            )}

            {kind === "activation" && (
              <p className="inline-message">
                {primary
                  ? "The primary administrator must remain active to prevent lockout."
                  : `Return ${student.name}'s account to Pending Sign Up? The record and password are preserved. The account will reactivate upon next sign-in.`}
              </p>
            )}

            {kind === "remove" && (
              <p className="inline-message">
                {primary ? (
                  "The primary administrator cannot be removed, to prevent administrator lockout."
                ) : (
                  <>
                    Permanently delete <strong>{student.name}</strong> ({student.email}) from the database? Their account, permissions, and directory listings will be removed.
                  </>
                )}
              </p>
            )}

            {error && <p role="alert" className="inline-message error">{error}</p>}
          </div>

          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            {!(primary && kind !== "password") && (
              <button
                type="submit"
                className={`btn ${kind === "activation" || kind === "remove" ? "btn-danger" : "btn-primary"}`}
              >
                {kind === "password"
                  ? "Set Password"
                  : kind === "activation"
                  ? "Reset Activation"
                  : kind === "remove"
                  ? "Remove Account"
                  : "Save Changes"}
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

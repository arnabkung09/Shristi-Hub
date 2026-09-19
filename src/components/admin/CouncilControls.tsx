import { useMemo, useState } from "react";
import { Camera, CheckSquare, Shield, SlidersHorizontal, UserPlus } from "lucide-react";
import { useHub } from "../../store/hub";
import { departmentFor, FEATURE_PERMISSIONS, PRIMARY_ADMIN_ID } from "../../lib/admin";
import { Modal } from "../ui";

export type CouncilAction = { kind: "appoint" | "permissions" | "delegate" | "remove" | "photo"; userId?: string; source?: "directory" | "admin" };

export default function CouncilControls({ action, onClose }: { action: CouncilAction; onClose: () => void }) {
  const { state, user, dispatch, announce, notify, setActiveTab } = useHub();
  const target = state.users.find((u) => u.id === action.userId);
  const [studentId, setStudentId] = useState(action.userId ?? "");
  const [title, setTitle] = useState(target?.councilTitle ?? "");
  const [department, setDepartment] = useState(target ? departmentFor(target, state.departments) : (state.departments[0] ?? "General"));
  const [permissions, setPermissions] = useState(state.permissions[action.userId ?? ""] ?? []);
  const [taskId, setTaskId] = useState("");
  const [photoUrl, setPhotoUrl] = useState(target?.avatarUrl ?? "");
  const [error, setError] = useState("");
  const primary = target?.id === PRIMARY_ADMIN_ID;
  const readOnly = user?.role !== "admin";

  const councilMembersAddedViaAdmin = useMemo(() => {
    // Members who were added to the council via the admin panel (councilHubMembers)
    // and are eligible for the directory
    return state.users.filter(
      (u) => u.id !== PRIMARY_ADMIN_ID && state.councilHubMembers.includes(u.id) && (u.role === "student" || u.role === "teacher")
    );
  }, [state.users, state.councilHubMembers]);

  const titles = {
    appoint: action.source === "directory" ? "Add Council Member to Directory" : "Add Student to Council",
    permissions: "Council Permissions & Clearances",
    delegate: "Delegate Council Task",
    remove: primary ? "Protected Council Appointment" : (action.source === "directory" ? "Remove from Directory" : "Remove from Council"),
    photo: "Update Profile Picture",
  };
  const icons = { appoint: <UserPlus />, permissions: <SlidersHorizontal />, delegate: <CheckSquare />, remove: <Shield />, photo: <Camera /> };

  const save = () => {
    try {
      if (action.kind === "appoint") {
        if (!studentId || !title.trim()) throw new Error("Select an approved student and enter a council title.");
        if (action.source === "directory" && !state.councilHubMembers.includes(studentId)) {
          throw new Error("Only members added to the council via the admin panel can be added in the directory.");
        }
        dispatch({ type: "APPOINT_COUNCIL", userId: studentId, post: title.trim(), department });
        if (!state.councilHubMembers.includes(studentId)) {
          dispatch({ type: "ADD_COUNCIL_HUB_MEMBER", userId: studentId });
        }
        announce(action.source === "directory" ? "Council member added to directory." : "Council appointment saved. Student account activation is unchanged.");
      } else if (action.kind === "permissions" && target) {
        if (!primary && !readOnly) dispatch({ type: "SET_PERMISSIONS", userId: target.id, permissions });
        announce(primary ? "The president retains full administrator clearance." : "Council permissions updated.");
      } else if (action.kind === "delegate" && target) {
        if (!taskId || !studentId) throw new Error("Select a task and an officer.");
        dispatch({ type: "DELEGATE_TASK", taskId, assigneeId: studentId, department });
        if (user) notify({ title: "A task has been delegated to you", body: state.tasks.find((t) => t.id === taskId)?.title ?? "View the council task board.", urgent: false, senderName: user.name, senderRole: user.role, audience: { kind: "user", userId: studentId }, actionTab: "tasks" });
        announce("Task delegated and the assignee notified.");
      } else if (action.kind === "remove" && target && !primary) {
        dispatch({ type: "REMOVE_COUNCIL", userId: target.id });
        announce(action.source === "directory" ? "Removed from directory. The student remains on the roster." : "Council appointment removed. The student remains on the roster.");
      } else if (action.kind === "photo" && target) {
        dispatch({ type: "SET_AVATAR", userId: target.id, url: photoUrl });
        announce("Profile picture updated.");
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save this change."); }
  };
  return (
    <Modal open onClose={onClose} title={titles[action.kind]} subtitle={target ? `${target.name} / ${target.gradeLabel} / ${target.houseLabel}` : (action.source === "directory" ? "Select a member added to the council via the admin panel." : "Appoint an existing member of the approved student roster.")} icon={icons[action.kind]}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="form-stack">
          {action.kind === "appoint" && <>
            {action.source === "directory" ? (
              <label className="form-field">
                <span>Council member (added via admin panel)</span>
                {councilMembersAddedViaAdmin.length > 0 ? (
                  <select className="control" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
                    <option value="">Select a council member added via Admin Panel</option>
                    {councilMembersAddedViaAdmin.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} / {u.gradeLabel} / {u.houseLabel}</option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-600 dark:text-amber-400">
                    <p className="font-semibold">No council members available to add</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                      Only students who have been added to the Council via the Admin Panel (Council Hub) can be added to the directory.
                    </p>
                    <button
                      type="button"
                      className="btn btn-outline mt-3 !min-h-8 !px-3 !text-[10px]"
                      onClick={() => {
                        onClose();
                        setActiveTab("admin?section=hub");
                      }}
                    >
                      Go to Admin Panel → Council Hub
                    </button>
                  </div>
                )}
              </label>
            ) : (
              <label className="form-field">
                <span>Account</span>
                <select className="control" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
                  <option value="">Select a student or teacher from the roster</option>
                  {state.users.filter((u) => u.id !== PRIMARY_ADMIN_ID && (u.role === "student" || u.role === "teacher")).map((u) => (
                    <option key={u.id} value={u.id}>{u.name} / {u.gradeLabel ?? "Staff"}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-field"><span>Council title</span><input required className="control" placeholder="e.g. Sports Captain" value={title} maxLength={70} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="form-field"><span>Department</span><select className="control" value={department} onChange={(e) => setDepartment(e.target.value)}>{state.departments.map((d) => <option key={d}>{d}</option>)}</select></label>
            <p className="inline-message">
              {action.source === "directory"
                ? "This adds the council member to the public directory with their department and title. Only members added to the council via the admin panel are eligible."
                : "This assigns council permissions to an existing student record. Council Hub chat access is managed in Admin Panel → Council Hub."}
            </p>
          </>}
          {action.kind === "permissions" && <>
            <p className="inline-message">{primary ? "The primary administrator has full clearance. These permissions cannot be revoked." : "Select the features this officer can manage. Other sections remain available for viewing."}</p>
            <div className="grid gap-2 sm:grid-cols-2">{FEATURE_PERMISSIONS.map((p) => <label key={p.id} className="permission-row"><input type="checkbox" checked={primary || permissions.includes(p.id)} disabled={primary || readOnly} onChange={(e) => setPermissions(e.target.checked ? [...permissions, p.id] : permissions.filter((v) => v !== p.id))} /><span><strong>{p.name}</strong><small>{p.description}</small></span></label>)}</div>
          </>}
          {action.kind === "delegate" && <>
            <label className="form-field"><span>Open council task</span><select required className="control" value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">Choose a task to delegate</option>{state.tasks.filter((t) => t.status !== "done").map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
            <div className="form-grid"><label className="form-field"><span>Assign to officer</span><select required className="control" value={studentId} onChange={(e) => setStudentId(e.target.value)}>{state.users.filter((u) => u.role !== "student").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label className="form-field"><span>Department</span><select className="control" value={department} onChange={(e) => setDepartment(e.target.value)}>{state.departments.map((d) => <option key={d}>{d}</option>)}</select></label></div>
            <p className="inline-message">The assignment appears on the task board and in the selected department's milestones.</p>
          </>}
          {action.kind === "remove" && <p className="inline-message">{primary ? "Arnab Shrestha is the primary administrator and Council President. This appointment is protected to prevent administrator lockout." : `Remove ${target?.name}'s council role and directory listing? Their student account and approved roster record will be retained.`}</p>}
          {action.kind === "photo" && <>
            <label className="file-drop"><Camera /><strong>Choose a profile photo</strong><span>JPG, PNG, or WebP. Maximum 500 KB.</span><input aria-label="Upload profile photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 500 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPG, PNG, or WebP smaller than 500 KB."); return; }
              const reader = new FileReader();
              reader.onload = () => { setPhotoUrl(String(reader.result)); setError(""); };
              reader.onerror = () => setError("Unable to read this file.");
              reader.readAsDataURL(file);
            }} /></label>
            <label className="form-field"><span>Or use an HTTPS image URL</span><input className="control" placeholder="https://..." value={photoUrl.startsWith("data:") ? "" : photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} /></label>
            {photoUrl && <img src={photoUrl} alt="New profile preview" className="mx-auto h-28 w-24 rounded-xl object-cover" onError={() => setError("This image could not be loaded. Try a different photo.")} />}
          </>}
          {error && <p role="alert" className="inline-message error">{error}</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close view</button>
          {!(action.kind === "remove" && primary) && (!readOnly || action.kind === "photo") && (
            <button
              type="submit"
              disabled={action.kind === "appoint" && action.source === "directory" && councilMembersAddedViaAdmin.length === 0}
              className={`btn ${action.kind === "remove" ? "btn-danger" : "btn-primary"}`}
            >
              {action.kind === "appoint" ? (action.source === "directory" ? "Add to directory" : "Save appointment") : action.kind === "delegate" ? "Delegate task" : action.kind === "remove" ? "Remove appointment" : "Save changes"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
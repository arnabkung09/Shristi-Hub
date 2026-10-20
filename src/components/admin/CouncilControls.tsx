import { useState, type ChangeEvent } from "react";
import { Award, Camera, CheckCheck, CheckSquare, Plus, Shield, SlidersHorizontal, Trash2, Upload, UserCheck, UserMinus } from "lucide-react";
import { initials, uid, useHub } from "../../store/hub";
import { COUNCIL_TITLES, DEFAULT_PERMISSIONS, departmentFor, FEATURE_PERMISSIONS, PRIMARY_ADMIN_ID, visiblePermissions } from "../../lib/admin";
import { canonicalGradeFromNumber } from "../../lib/ssot-auth";
import { GRADES, HOUSES } from "../../lib/seed";
import type { FeaturePermission, House, Student, TaskPriority } from "../../lib/types";
import { HouseMark, Modal } from "../ui";

export type CouncilAction =
  | { kind: "permissions"; userId: string }
  | { kind: "appoint"; userId?: string; source?: "admin" | "directory" }
  | { kind: "remove"; userId: string; source?: "admin" | "directory" }
  | { kind: "photo"; userId: string }
  | { kind: "delegate"; userId?: string };

function compressAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected image file."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        reject(new Error("Empty image data."));
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        try {
          const maxDim = 320;
          let width = img.width || 320;
          let height = img.height || 320;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.85);
          resolve(compressed);
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export default function CouncilControls({ action, onClose }: { action: CouncilAction; onClose: () => void }) {
  const { state, user, dispatch, announce, notify, setActiveTab } = useHub();
  const target = action.userId ? state.users.find((u) => u.id === action.userId) : undefined;
  const [selectedUserId, setSelectedUserId] = useState(
    action.userId ?? state.users.find((u) => u.role === "student")?.id ?? state.users[0]?.id ?? ""
  );
  const [delegateUserId, setDelegateUserId] = useState(
    action.userId ?? state.users.find((u) => u.role === "council" || u.role === "admin")?.id ?? ""
  );
  const subject = target ?? state.users.find((u) => u.id === selectedUserId);
  const delegateTarget = target ?? state.users.find((u) => u.id === delegateUserId);

  const [perms, setPerms] = useState<FeaturePermission[]>(() => {
    if (!target) return DEFAULT_PERMISSIONS;
    if (target.role === "admin") return FEATURE_PERMISSIONS.map((f) => f.id);
    return state.permissions[target.id] ?? DEFAULT_PERMISSIONS;
  });
  const [title, setTitle] = useState(subject?.councilTitle ?? "Council Representative");
  const [department, setDepartment] = useState(
    subject?.department && state.departments.includes(subject.department)
      ? subject.department
      : state.departments[0] ?? "General"
  );
  const [appointMode, setAppointMode] = useState<"roster" | "new">("roster");
  const [rosterFilter, setRosterFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newGrade, setNewGrade] = useState<number>(10);
  const [newHouse, setNewHouse] = useState<House>("Blue");
  const [avatarUrl, setAvatarUrl] = useState(target?.avatarUrl ?? "");
  const [photoError, setPhotoError] = useState("");

  // Delegation state (supports both existing tasks and creating a new task on the spot)
  const [delegateMode, setDelegateMode] = useState<"existing" | "create">(
    state.tasks.filter((t) => t.status !== "done").length > 0 ? "existing" : "create"
  );
  const [selectedTaskId, setSelectedTaskId] = useState(
    state.tasks.find((t) => t.status !== "done" && (!delegateTarget || t.assigneeId !== delegateTarget.id))?.id ??
      state.tasks[0]?.id ??
      ""
  );
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDetails, setNewTaskDetails] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("Medium");
  const [newTaskStatus, setNewTaskStatus] = useState<"todo" | "progress" | "done">("todo");
  const [newTaskDue, setNewTaskDue] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [newTaskDept, setNewTaskDept] = useState(
    delegateTarget ? departmentFor(delegateTarget, state.departments) : (state.departments[0] ?? "General")
  );

  const togglePerm = (id: FeaturePermission) =>
    setPerms((current) => (current.includes(id) ? current.filter((p) => p !== id) : [...current, id]));

  const savePermissions = () => {
    if (!target) return;
    try {
      dispatch({ type: "SET_PERMISSIONS", userId: target.id, permissions: perms });
      notify({
        title: "Council Permissions Updated",
        body: `Your student council clearances now include ${perms.length} active ${perms.length === 1 ? "module" : "modules"}.`,
        urgent: false,
        senderName: user?.name ?? "Council Admin",
        senderRole: user?.role ?? "admin",
        audience: { kind: "user", userId: target.id, name: target.name },
        actionTab: "members",
      });
      announce(`Updated permissions for ${target.name}.`);
      onClose();
    } catch (e) {
      announce(e instanceof Error ? e.message : "Unable to update permissions.", "error");
    }
  };

  const appoint = () => {
    const cleanTitle = title.trim() || "Council Representative";
    try {
      if (appointMode === "new") {
        if (!newName.trim() || !newEmail.trim()) {
          announce("Enter the student's full name and school email.", "error");
          return;
        }
        const student: Student = {
          id: uid(),
          name: newName.trim(),
          email: newEmail.trim().toLowerCase(),
          password: "",
          grade: newGrade,
          gradeLabel: canonicalGradeFromNumber(newGrade),
          house: newHouse,
          houseLabel: `${newHouse} House`,
          role: "council",
          status: "active",
          councilTitle: cleanTitle,
          councilPost: cleanTitle,
          department,
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: "ADD_STUDENT", student });
        dispatch({ type: "APPOINT_COUNCIL", userId: student.id, post: cleanTitle, department });
        if (perms.length) {
          dispatch({ type: "SET_PERMISSIONS", userId: student.id, permissions: perms });
        }
        announce(`${student.name} added to the roster and appointed as ${cleanTitle} (${department}).`);
        onClose();
        return;
      }
      if (!subject) return;
      dispatch({ type: "APPOINT_COUNCIL", userId: subject.id, post: cleanTitle, department });
      if (perms.length) {
        dispatch({ type: "SET_PERMISSIONS", userId: subject.id, permissions: perms });
      }
      notify({
        title: `Appointed: ${cleanTitle}`,
        body: `You are now listed in the Council Directory under ${department} Department.`,
        urgent: false,
        senderName: user?.name ?? "Council Admin",
        senderRole: user?.role ?? "admin",
        audience: { kind: "user", userId: subject.id, name: subject.name },
        actionTab: "members",
      });
      announce(`${subject.name} appointed as ${cleanTitle} (${department}).`);
      onClose();
    } catch (e) {
      announce(e instanceof Error ? e.message : "Unable to appoint council member.", "error");
    }
  };

  const removeFromCouncil = () => {
    if (!target) return;
    try {
      dispatch({ type: "REMOVE_COUNCIL", userId: target.id });
      notify({
        title: "Council Appointment Ended",
        body: "Your council appointment and feature clearances have been removed. Your student account remains active.",
        urgent: false,
        senderName: user?.name ?? "Council Admin",
        senderRole: user?.role ?? "admin",
        audience: { kind: "user", userId: target.id, name: target.name },
        actionTab: "dashboard",
      });
      announce(`${target.name} removed from council. Their student account remains active.`);
      onClose();
    } catch (e) {
      announce(e instanceof Error ? e.message : "Unable to remove council member.", "error");
    }
  };

  const onPhotoFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
      setPhotoError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 8_000_000) {
      setPhotoError("Choose an image smaller than 8 MB.");
      return;
    }
    try {
      const compressed = await compressAvatarImage(file);
      setPhotoError("");
      setAvatarUrl(compressed);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not process image.");
    }
  };

  const savePhoto = () => {
    if (!target) return;
    const cleanUrl = avatarUrl.trim();
    if (cleanUrl && !/^(https:\/\/|data:image\/(jpeg|jpg|png|webp|gif|svg\+xml);base64,)/i.test(cleanUrl)) {
      setPhotoError("Upload a photo or enter a valid https:// image URL.");
      return;
    }
    try {
      dispatch({ type: "SET_AVATAR", userId: target.id, url: cleanUrl });
      announce(cleanUrl ? `Profile picture updated for ${target.name} and synced.` : `Profile picture cleared for ${target.name}.`);
      onClose();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Unable to update profile picture.");
    }
  };

  const delegateTask = () => {
    if (!delegateTarget) {
      announce("Choose a council member to delegate to.", "error");
      return;
    }
    try {
      if (delegateMode === "create") {
        if (!newTaskTitle.trim()) {
          announce("Enter a title for the task.", "error");
          return;
        }
        const resolvedDept = newTaskDept || departmentFor(delegateTarget, state.departments);
        const createdTask = {
          id: uid(),
          title: newTaskTitle.trim(),
          details: newTaskDetails.trim() || `Delegated to ${delegateTarget.name} (${resolvedDept} Department).`,
          due: newTaskDue || new Date().toISOString().slice(0, 10),
          priority: newTaskPriority,
          assigneeId: delegateTarget.id,
          status: newTaskStatus,
          createdBy: user?.name ?? "Council Admin",
          createdAt: Date.now(),
          completedAt: newTaskStatus === "done" ? Date.now() : undefined,
          department: resolvedDept,
        };
        dispatch({ type: "ADD_TASK", task: createdTask });
        notify({
          title: `New Task Delegated: ${createdTask.title}`,
          body: `${createdTask.details} · Due ${createdTask.due} (${createdTask.priority} priority).`,
          urgent: createdTask.priority === "Urgent" || createdTask.priority === "High",
          senderName: user?.name ?? "Council Admin",
          senderRole: user?.role ?? "admin",
          audience: { kind: "user", userId: delegateTarget.id, name: delegateTarget.name },
          actionTab: "tasks",
        });
        announce(
          newTaskStatus === "done"
            ? `"${createdTask.title}" logged as completed for ${delegateTarget.name} (${resolvedDept}).`
            : `"${createdTask.title}" created and delegated to ${delegateTarget.name} (${resolvedDept}).`
        );
        onClose();
        return;
      }

      const task = state.tasks.find((t) => t.id === selectedTaskId);
      if (!task) {
        announce("Select an existing task or switch to Create & Delegate New Task.", "error");
        return;
      }
      const targetDept = departmentFor(delegateTarget, state.departments);
      const chosenDept = task.department && state.departments.includes(task.department) ? task.department : targetDept;
      dispatch({ type: "DELEGATE_TASK", taskId: task.id, assigneeId: delegateTarget.id, department: chosenDept });
      notify({
        title: `Task Delegated: ${task.title}`,
        body: `${task.details || "Open Task Management to view details."} · Due ${task.due}.`,
        urgent: task.priority === "Urgent" || task.priority === "High",
        senderName: user?.name ?? "Council Admin",
        senderRole: user?.role ?? "admin",
        audience: { kind: "user", userId: delegateTarget.id, name: delegateTarget.name },
        actionTab: "tasks",
      });
      announce(`"${task.title}" delegated to ${delegateTarget.name}.`);
      onClose();
    } catch (e) {
      announce(e instanceof Error ? e.message : "Unable to delegate task.", "error");
    }
  };

  if (action.kind === "permissions" && target) {
    const protectedAdmin = target.id === PRIMARY_ADMIN_ID || target.role === "admin";
    return (
      <Modal open onClose={onClose} title={`Manage Permissions — ${target.name}`} icon={<SlidersHorizontal />} subtitle={`${target.councilTitle ?? "Council Officer"} / ${departmentFor(target, state.departments)} Department`}>
        {protectedAdmin ? <p className="inline-message">Administrator accounts always hold every feature clearance.</p> : (
          <div className="permission-checklist">
            {FEATURE_PERMISSIONS.map((feature) => (
              <label key={feature.id} className={perms.includes(feature.id) ? "checked" : ""}>
                <input type="checkbox" checked={perms.includes(feature.id)} onChange={() => togglePerm(feature.id)} />
                <span><strong>{feature.label}</strong><small>{feature.detail}</small></span>
              </label>
            ))}
          </div>
        )}
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {!protectedAdmin && <button className="btn btn-primary" onClick={savePermissions}><CheckCheck />Save Clearances</button>}
        </div>
      </Modal>
    );
  }

  if (action.kind === "appoint") {
    const candidates = state.users.filter((u) => u.id !== PRIMARY_ADMIN_ID && u.role !== "grade" && `${u.name} ${u.email} ${u.gradeLabel} ${u.houseLabel} ${u.councilTitle ?? ""}`.toLowerCase().includes(rosterFilter.toLowerCase()));
    return (
      <Modal open onClose={onClose} title={action.source === "directory" ? "Add Member to Council Directory" : "Appoint Council Officer"} icon={<Award />} subtitle="Promote an existing roster account or add a new student directly to the council.">
        <div className="form-stack">
          {!target && (
            <div className="pill-tabs">
              <button type="button" className={appointMode === "roster" ? "active" : ""} onClick={() => setAppointMode("roster")}>From School Roster ({state.users.length})</button>
              <button type="button" className={appointMode === "new" ? "active" : ""} onClick={() => setAppointMode("new")}>New Student Account</button>
            </div>
          )}
          {!target && appointMode === "roster" && (
            <>
              <label className="form-field"><span>Filter Roster</span><input className="control" placeholder="Type a name, class, house, or email..." value={rosterFilter} onChange={(e) => setRosterFilter(e.target.value)} /></label>
              <label className="form-field"><span>Student or Teacher ({candidates.length} matches)</span>
                <select className="control" value={selectedUserId} onChange={(e) => {
                  const chosen = state.users.find((u) => u.id === e.target.value);
                  setSelectedUserId(e.target.value);
                  if (chosen?.councilTitle) setTitle(chosen.councilTitle);
                  if (chosen?.department && state.departments.includes(chosen.department)) setDepartment(chosen.department);
                }}>
                  {candidates.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.gradeLabel ?? "Staff"} · {u.houseLabel ?? "No house"} ({u.role})</option>)}
                </select>
              </label>
            </>
          )}
          {!target && appointMode === "new" && (
            <div className="form-grid-2">
              <label className="form-field"><span>Full Name</span><input className="control" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., Suman Adhikari" /></label>
              <label className="form-field"><span>School Email</span><input className="control" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="student@shristi.edu.np" /></label>
              <label className="form-field"><span>Grade</span><select className="control" value={newGrade} onChange={(e) => setNewGrade(Number(e.target.value))}>{GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select></label>
              <label className="form-field"><span>House</span><select className="control" value={newHouse} onChange={(e) => setNewHouse(e.target.value as House)}>{HOUSES.map((h) => <option key={h} value={h}>{h} House</option>)}</select></label>
            </div>
          )}
          <div className="form-grid-2">
            <label className="form-field"><span>Council Position</span>
              <input className="control" list="council-position-list" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Cultural Secretary" />
              <datalist id="council-position-list">{COUNCIL_TITLES.map((item) => <option key={item} value={item} />)}</datalist>
            </label>
            <label className="form-field"><span>Department</span>
              <select className="control" value={department} onChange={(e) => setDepartment(e.target.value)}>
                {state.departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>
          <div>
            <span className="eyebrow">Initial Feature Clearances</span>
            <div className="permission-checklist mt-2">
              {FEATURE_PERMISSIONS.map((feature) => (
                <label key={feature.id} className={perms.includes(feature.id) ? "checked" : ""}>
                  <input type="checkbox" checked={perms.includes(feature.id)} onChange={() => togglePerm(feature.id)} />
                  <span><strong>{feature.label}</strong><small>{feature.detail}</small></span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={appoint}><UserCheck />{action.source === "directory" ? "Add to Directory" : "Confirm Appointment"}</button>
        </div>
      </Modal>
    );
  }

  if (action.kind === "remove" && target) {
    return (
      <Modal open onClose={onClose} title={action.source === "directory" ? "Remove from Council Directory" : "Remove from Student Council"} icon={<UserMinus />}>
        <p className="inline-message">Remove <strong>{target.name}</strong> ({target.councilTitle ?? "Council Officer"}) from the Student Council? Their feature permissions will be cleared, tasks will be unassigned, and their account will remain active as a normal student.</p>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>Keep Officer</button>
          <button className="btn btn-danger" onClick={removeFromCouncil}><UserMinus />Remove from Council</button>
        </div>
      </Modal>
    );
  }

  if (action.kind === "photo" && target) {
    return (
      <Modal open onClose={onClose} title={`Profile Picture — ${target.name}`} icon={<Camera />} subtitle="Upload a portrait from your device (auto-optimized for database sync) or paste an https:// image link.">
        <div className="photo-uploader">
          <div className="photo-preview">
            {avatarUrl ? <img src={avatarUrl} alt={target.name} /> : <span>{initials(target.name)}</span>}
          </div>
          <div className="form-stack flex-1">
            <label className="upload-button">
              <Upload />Choose Image File (JPG, PNG, WebP)
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onPhotoFile} />
            </label>
            <label className="form-field">
              <span>Or Direct HTTPS Image URL</span>
              <input
                className="control"
                value={avatarUrl.startsWith("data:") ? "" : avatarUrl}
                onChange={(e) => {
                  setPhotoError("");
                  setAvatarUrl(e.target.value);
                }}
                placeholder="https://images.unsplash.com/..."
              />
            </label>
            {avatarUrl && (
              <button
                type="button"
                className="btn btn-outline !min-h-7 !w-fit !px-3 !text-[10px]"
                onClick={() => {
                  setPhotoError("");
                  setAvatarUrl("");
                }}
              >
                <Trash2 className="h-3 w-3" /> Clear Current Photo
              </button>
            )}
            {photoError && <p className="inline-message error">{photoError}</p>}
          </div>
        </div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={savePhoto}><Camera />Save Picture</button>
        </div>
      </Modal>
    );
  }

  if (action.kind === "delegate") {
    const councilOfficers = state.users.filter((u) => u.role === "council" || u.role === "admin");
    return (
      <Modal
        open
        onClose={onClose}
        title={delegateTarget ? `Delegate Task to ${delegateTarget.name}` : "Delegate Council Task"}
        icon={<CheckSquare />}
        subtitle={
          delegateTarget
            ? `${delegateTarget.councilTitle ?? "Council Officer"} · ${departmentFor(delegateTarget, state.departments)} Department`
            : "Assign an existing council task or create a new task directly for a department officer."
        }
      >
        <div className="form-stack">
          {!target && (
            <label className="form-field">
              <span>Delegate To Officer</span>
              <select
                className="control"
                value={delegateUserId}
                onChange={(e) => {
                  setDelegateUserId(e.target.value);
                  const chosen = state.users.find((u) => u.id === e.target.value);
                  if (chosen) setNewTaskDept(departmentFor(chosen, state.departments));
                }}
              >
                {councilOfficers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} — {o.councilTitle ?? o.role} ({departmentFor(o, state.departments)})
                  </option>
                ))}
              </select>
            </label>
          )}

          {delegateTarget && (
            <div className="integration-row">
              <span className="member-inline">
                <span className="mini-avatar">
                  {delegateTarget.avatarUrl ? <img src={delegateTarget.avatarUrl} alt="" /> : initials(delegateTarget.name)}
                </span>
                <span>
                  <strong>{delegateTarget.name}</strong>
                  <small>
                    {delegateTarget.councilTitle ?? delegateTarget.role} · {departmentFor(delegateTarget, state.departments)} Department ·{" "}
                    {visiblePermissions(delegateTarget, state.permissions).length} clearances
                  </small>
                </span>
              </span>
              {delegateTarget.house && <HouseMark house={delegateTarget.house} className="h-6 w-6 text-[9px]" />}
            </div>
          )}

          <div className="pill-tabs">
            <button
              type="button"
              className={delegateMode === "create" ? "active" : ""}
              onClick={() => setDelegateMode("create")}
            >
              <Plus className="h-3.5 w-3.5" /> Create &amp; Delegate New Task
            </button>
            <button
              type="button"
              className={delegateMode === "existing" ? "active" : ""}
              onClick={() => setDelegateMode("existing")}
            >
              <CheckSquare className="h-3.5 w-3.5" /> Assign Existing Task ({state.tasks.length})
            </button>
          </div>

          {delegateMode === "create" ? (
            <div className="space-y-3">
              <label className="form-field">
                <span>Task / Milestone Title</span>
                <input
                  className="control"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="e.g., Coordinate Stage Audio & Lighting Check"
                />
              </label>
              <label className="form-field">
                <span>Deliverables &amp; Instructions</span>
                <textarea
                  className="control"
                  rows={2}
                  value={newTaskDetails}
                  onChange={(e) => setNewTaskDetails(e.target.value)}
                  placeholder="Specific requirements, resources, or completion notes..."
                />
              </label>
              <div className="form-grid-2">
                <label className="form-field">
                  <span>Council Department</span>
                  <select
                    className="control"
                    value={newTaskDept}
                    onChange={(e) => setNewTaskDept(e.target.value)}
                  >
                    {state.departments.map((d) => (
                      <option key={d} value={d}>
                        {d} Department
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Due Date</span>
                  <input
                    className="control"
                    type="date"
                    value={newTaskDue}
                    onChange={(e) => setNewTaskDue(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Priority</span>
                  <select
                    className="control"
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Initial Status</span>
                  <select
                    className="control"
                    value={newTaskStatus}
                    onChange={(e) => setNewTaskStatus(e.target.value as "todo" | "progress" | "done")}
                  >
                    <option value="todo">To Do (Assigned)</option>
                    <option value="progress">In Progress</option>
                    <option value="done">Completed (Log to Department Done)</option>
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <label className="form-field">
              <span>Select Existing Task</span>
              <select className="control" value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)}>
                <option value="">Choose a task to delegate</option>
                {state.tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title} ({task.status === "done" ? "Completed" : task.priority} · Due {task.due})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="dialog-actions">
          <button className="btn btn-outline" onClick={() => { onClose(); setActiveTab("tasks"); }}>
            <Shield />Open Task Board
          </button>
          <button className="btn btn-primary" onClick={delegateTask}>
            <CheckSquare />{delegateMode === "create" ? "Create & Delegate" : "Delegate Task"}
          </button>
        </div>
      </Modal>
    );
  }

  return null;
}
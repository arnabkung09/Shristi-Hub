import {
  createContext, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type ReactNode,
} from "react";
import type {
  Audience, FinanceEntry, GalleryItem, HubState, Meeting, CouncilTask,
  AppNotification, PointEntry, Poll, PollBallot, SchoolEvent, Student, Suggestion,
  Announcement, Role, House, BroadcastRecord, HouseMessage, CouncilChatMessage, ResourceDoc,
} from "../lib/types";
import { buildSeedState, HOUSES, HOUSE_LABELS, RESOURCES } from "../lib/seed";
import { connectBus, postBus, chime } from "../lib/realtime";
import {
  adminResetStudentCredentials,
  adminUpdateRosterRecord,
  canonicalGradeFromNumber,
} from "../lib/ssot-auth";
import { DEFAULT_DEPARTMENTS, departmentFor, FEATURE_PERMISSIONS, PRIMARY_ADMIN_ID, taskDepartment } from "../lib/admin";
import { belongsToHouse } from "../lib/accounts";
import {
  addCouncilMember,
  addCouncilMessage,
  removeCouncilMember,
  removeCouncilMessage,
} from "../lib/council";
import { useLocalPresence, getOrGenerateDeviceId, type ConnectedDevice } from "../lib/presence";
import { useSheets, type SheetsContextValue } from "../lib/sheets/context";
import type { SheetSection } from "../lib/sheets/types";
import {
  firebaseAuth,
  PRIMARY_ADMIN_EMAIL,
  isPrimaryAdmin,
  cloudStateFingerprint,
  createFirebasePassword,
  observeFirebaseAuth,
  provisionFirebaseProfile,
  signInFirebasePassword,
  signInWithGoogle,
  signOutFirebase,
  flushServiceWorkerNotificationQueue,
  listenToServiceWorkerNotifications,
  subscribeCloudBroadcasts,
  subscribeFirebaseInbox,
  subscribeCloudState,
  subscribeForegroundMessages,
  syncCloudRoster,
  syncFirebaseUserActivity,
  writeCloudState,
  triggerOSNotification,
  getNotifiedIds,
  hasBeenNotified,
} from "../lib/firebase-client";
import {
  fetchRemoteState,
  mongoStateFingerprint,
  preloadRemoteState,
  saveRemoteState,
  syncRemoteUserActivity,
} from "../lib/mongodb-client";
import type { NotificationTemplate } from "../lib/types";
import { DEFAULT_NOTIFICATION_TEMPLATES } from "../lib/content";
export { DEFAULT_NOTIFICATION_TEMPLATES };

// Canonical, permanent storage keys that persist across ALL builds, releases, and versions
export const CANONICAL_STORAGE_KEY = "shristi_hub_canonical_state_v1";
export const CANONICAL_BRANDING_KEY = "shristi_hub_canonical_branding_v1";

// Active versioned keys for backwards-compatibility with existing sessions
const STORAGE_KEY = "shristi-council-school-roster-v5";
const SESSION_KEY = "shristi-preview-session-v3";
const TAB_KEY = "shristi-council-tab-v3";

export const BRANDING_STORAGE_KEY = "shristi-council-branding-v6";

// Known legacy and versioned keys across previous and current releases
const KNOWN_LEGACY_STATE_KEYS = [
  CANONICAL_STORAGE_KEY,
  STORAGE_KEY,
  "shristi-council-school-roster-v4",
  "shristi-council-school-roster-v3",
  "shristi-council-school-roster-v2",
  "shristi-council-school-roster-v1",
  "shristi-council-state-v5",
  "shristi-council-state-v4",
  "shristi-council-state-v3",
  "shristi-council-state-v2",
  "shristi-council-state-v1",
];

const KNOWN_LEGACY_BRANDING_KEYS = [
  CANONICAL_BRANDING_KEY,
  BRANDING_STORAGE_KEY,
  "shristi-council-branding-v5",
  "shristi-council-branding-v4",
  "shristi-council-branding-v3",
  "shristi-council-branding-v2",
  "shristi-council-branding-v1",
];

export interface CachedBrandingData {
  branding: HubState["branding"];
  houses: HubState["houses"];
  legal: HubState["legal"];
  savedAt: number;
}

export function loadCachedBranding(): CachedBrandingData | null {
  const tryParse = (raw: string | null): CachedBrandingData | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.branding && typeof parsed.branding.schoolName === "string" && parsed.branding.schoolName.trim()) {
        return parsed;
      }
      if (parsed && parsed.state && parsed.state.branding && typeof parsed.state.branding.schoolName === "string" && parsed.state.branding.schoolName.trim()) {
        return {
          branding: parsed.state.branding,
          houses: parsed.state.houses || buildSeedState().houses,
          legal: parsed.state.legal || buildSeedState().legal,
          savedAt: parsed.state.lastModified || Date.now(),
        };
      }
      if (parsed && typeof parsed.schoolName === "string" && parsed.schoolName.trim()) {
        return {
          branding: parsed,
          houses: buildSeedState().houses,
          legal: buildSeedState().legal,
          savedAt: Date.now(),
        };
      }
    } catch {}
    return null;
  };

  for (const key of KNOWN_LEGACY_BRANDING_KEYS) {
    try {
      const found = tryParse(localStorage.getItem(key));
      if (found) return found;
    } catch {}
  }

  // Fallback: scan any localStorage keys containing "shristi" and "branding"
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes("shristi") && key.includes("branding")) {
        const found = tryParse(localStorage.getItem(key));
        if (found) return found;
      }
    }
  } catch {}

  return null;
}

export function persistBrandingToCache(state: { branding?: HubState["branding"]; houses?: HubState["houses"]; legal?: HubState["legal"]; lastModified?: number }) {
  try {
    if (state.branding && typeof state.branding.schoolName === "string" && state.branding.schoolName.trim()) {
      const existing = loadCachedBranding();
      const payload: CachedBrandingData = {
        branding: state.branding,
        houses: state.houses || buildSeedState().houses,
        legal: state.legal || buildSeedState().legal,
        savedAt: state.lastModified || existing?.savedAt || 0,
      };
      const json = JSON.stringify(payload);
      // Remove legacy duplicate keys so base64 logos never overflow localStorage 5MB quota
      for (const key of KNOWN_LEGACY_BRANDING_KEYS) {
        if (key !== CANONICAL_BRANDING_KEY && key !== BRANDING_STORAGE_KEY) {
          try { localStorage.removeItem(key); } catch {}
        }
      }
      localStorage.setItem(CANONICAL_BRANDING_KEY, json);
      try { localStorage.setItem(BRANDING_STORAGE_KEY, json); } catch {}
      const cleanLogo = (state.branding.logoUrl || "").trim();
      if (cleanLogo) {
        try { localStorage.setItem("shristi_branding_logo_v1", cleanLogo); } catch {}
      } else {
        try { localStorage.removeItem("shristi_branding_logo_v1"); } catch {}
      }
    }
  } catch {}
}

export function findStoredStateInAnyVersion(): HubState | null {
  const tryParseState = (raw: string | null): HubState | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const candidate = parsed.state && typeof parsed.state === "object" ? parsed.state : parsed;
        if (candidate && (candidate.users || candidate.branding || candidate.departments || candidate.tasks)) {
          return candidate as HubState;
        }
      }
    } catch {}
    return null;
  };

  // 1. Try known versioned keys in order
  for (const key of KNOWN_LEGACY_STATE_KEYS) {
    try {
      const found = tryParseState(localStorage.getItem(key));
      if (found) return found;
    } catch {}
  }

  // 2. Scan localStorage for any shristi state / roster key
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes("shristi") && (key.includes("roster") || key.includes("state") || key.includes("hub"))) {
        const found = tryParseState(localStorage.getItem(key));
        if (found) return found;
      }
    }
  } catch {}

  return null;
}

export function persistStateLocally(state: HubState) {
  try {
    const sanitized = withoutStoredCredentials(state);
    const json = JSON.stringify(sanitized);
    // Clean up legacy state keys so 11 duplicate copies don't exhaust the 5MB localStorage quota
    for (const key of KNOWN_LEGACY_STATE_KEYS) {
      if (key !== CANONICAL_STORAGE_KEY && key !== STORAGE_KEY) {
        try { localStorage.removeItem(key); } catch {}
      }
    }
    try {
      localStorage.setItem(CANONICAL_STORAGE_KEY, json);
    } catch {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      localStorage.setItem(CANONICAL_STORAGE_KEY, json);
    }
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch {}
  } catch {}
}

/**
 * Local (non-Firebase) sign-in is a development convenience: it powers the preview sign-in
 * panel on the login screen and the offline preview. Production builds authenticate
 * exclusively through Firebase Authentication, so no shared password can ever open an
 * administrator session on the live site.
 */
export const DEVELOPMENT_BUILD = false;

/** Passwords never reach browser storage in a production build. */
function withoutStoredCredentials(state: HubState): HubState {
  if (DEVELOPMENT_BUILD) return { ...state, session: null };
  return {
    ...state,
    session: null,
    users: state.users.map((student) => ({ ...student, password: "", passwordHash: "" })),
  };
}

export const uid = () => `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function audienceLabel(a: Audience): string {
  switch (a.kind) {
    case "all": return "All Students";
    case "role": return a.role === "council" ? "Council Only" : a.role === "admin" ? "Admins Only" : a.role === "teacher" ? "Teachers & Staff Only" : "Students Only";
    case "user": return a.name ? a.name : "One student";
    case "house": return `${a.house} House`;
    case "grade": return `Grade ${a.grade}`;
  }
}

export function targetsUser(a: Audience, user: Student): boolean {
  switch (a.kind) {
    case "all": return true;
    case "role": return user.role === a.role || (a.role === "council" && user.role === "admin") || (a.role === "teacher" && user.role === "admin");
    case "user": {
      const target = String(a.userId || "").toLowerCase();
      if (!target || target === "cloud" || target === "all") return true;
      const id = String(user.id || "").toLowerCase();
      const email = String(user.email || "").toLowerCase();
      const name = String(user.name || "").toLowerCase();
      const targetName = a.name ? String(a.name).toLowerCase() : "";
      return (
        id === target ||
        email === target ||
        name === target ||
        (targetName && (name.includes(targetName) || targetName.includes(name))) ||
        (user.aliases ?? []).some((alias) => alias.toLowerCase() === target)
      );
    }
    case "house": return user.house === a.house;
    case "grade": return user.grade === a.grade;
  }
}

export function formatTemplate(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, String(value ?? ""));
  }
  return result;
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}

/** Today in the viewer's timezone as `yyyy-mm-dd` (the hub's day key everywhere). */
export const isoDay = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const avatarHue = (house: House) =>
  house === "Blue" ? "bg-blue-500" : house === "Red" ? "bg-red-500" : "bg-green-500";

export const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

type Action =
  | { type: "REPLACE"; state: HubState }
  | { type: "LOGIN"; userId: string }
  | { type: "LOGOUT" }
  | { type: "SET_THEME"; theme: "dark" | "light" }
  | { type: "MARK_READ"; notifId: string; userId: string }
  | { type: "MARK_ALL_READ"; userId: string }
  | { type: "PUSH_NOTIFICATION"; notification: AppNotification }
  | { type: "AWARD_POINTS"; entry: PointEntry; notification: AppNotification }
  | { type: "RSVP"; eventId: string; userId: string }
  | { type: "TOGGLE_ATTENDANCE"; eventId: string; userId: string }
  | { type: "ADD_EVENT"; event: SchoolEvent; notification?: AppNotification }
  | { type: "ADD_ANNOUNCEMENT"; announcement: Announcement; notification: AppNotification }
  | { type: "ADD_TASK"; task: CouncilTask; notification?: AppNotification }
  | { type: "MOVE_TASK"; taskId: string; status: CouncilTask["status"] }
  | { type: "EDIT_TASK"; task: Partial<CouncilTask> & { id: string } }
  | { type: "DELETE_TASK"; taskId: string }
  | { type: "ADD_SUGGESTION"; suggestion: Suggestion }
  | { type: "REVIEW_SUGGESTION"; suggestionId: string; status: Suggestion["status"]; response: string; responderName: string }
  | { type: "VOTE"; pollId: string; optionIndex: number; userId: string }
  | { type: "ADD_POLL"; poll: Poll; notification?: AppNotification }
  | { type: "ADD_MEETING"; meeting: Meeting }
  | { type: "SAVE_MINUTES"; meetingId: string; minutes: string }
  | { type: "DELETE_MEETING"; meetingId: string }
  | { type: "ADD_RESOURCE"; resource: ResourceDoc }
  | { type: "DELETE_RESOURCE"; resourceId: string }
  | { type: "ADD_TRANSACTION"; entry: FinanceEntry }
  | { type: "ADD_PHOTO"; item: GalleryItem }
  | { type: "APPOINT_COUNCIL"; userId: string; post: string; department: string }
  | { type: "REMOVE_COUNCIL"; userId: string }
  | { type: "EDIT_STUDENT"; userId: string; name: string; house: House | null; grade: number | null }
  | { type: "RESET_PASSWORD"; actorId: string; userId: string; password: string }
  | { type: "RESET_ACTIVATION"; userId: string }
  | { type: "ADD_STUDENT"; student: Student }
  | { type: "DELETE_STUDENT"; userId: string }
  | { type: "ADD_STUDENT_EMAIL"; userId: string; email: string }
  | { type: "REMOVE_STUDENT_EMAIL"; userId: string; email: string }
  | { type: "VERIFY_STUDENT_EMAIL"; userId: string; email: string }
  | { type: "SET_BRANDING"; branding: HubState["branding"] }
  | { type: "SET_LEGAL"; legal: HubState["legal"] }
  | { type: "SET_HOUSE_BRANDING"; house: House; name: string; logoUrl: string }
  | { type: "SUBMIT_RATING"; userId: string; userName: string; house: House; value: number; comment: string }
  | { type: "SET_HOUSE_CAPTAIN"; house: House; userId: string }
  | { type: "SET_HOUSE_MEMBERSHIP"; house: House; accountId: string; include: boolean }
  | { type: "POST_HOUSE_MESSAGE"; message: HouseMessage }
  | { type: "DELETE_HOUSE_MESSAGE"; messageId: string }
  | { type: "POST_COUNCIL_MESSAGE"; message: CouncilChatMessage }
  | { type: "DELETE_COUNCIL_MESSAGE"; messageId: string }
  | { type: "ADD_COUNCIL_HUB_MEMBER"; userId: string }
  | { type: "REMOVE_COUNCIL_HUB_MEMBER"; userId: string }
  | { type: "ADD_EVENT_TYPE"; name: string }
  | { type: "DELETE_EVENT_TYPE"; name: string }
  | { type: "UPDATE_EVENT"; event: SchoolEvent }
  | { type: "DELETE_EVENT"; eventId: string }
  | { type: "ADD_DEPARTMENT"; name: string }
  | { type: "DELETE_DEPARTMENT"; name: string }
  | { type: "SET_PERMISSIONS"; userId: string; permissions: string[] }
  | { type: "SET_DEPARTMENT"; userId: string; department: string }
  | { type: "SET_DIRECTORY_ORDER"; order: string[] }
  | { type: "PIN_DIRECTORY_OFFICER"; userId: string; pinned: boolean }
  | { type: "MOVE_DIRECTORY_OFFICER"; userId: string; direction: "up" | "down" | "top" }
  | { type: "SET_AVATAR"; userId: string; url: string }
  | { type: "SET_ACTIVE_IMAGE"; imageId: string; active: boolean }
  | { type: "DELEGATE_TASK"; taskId: string; assigneeId: string; department: string }
  | { type: "UPDATE_NOTIFICATION_TEMPLATES"; templates: Record<string, NotificationTemplate> }
  | { type: "RECORD_ACTIVITY"; userId: string; timestamp?: number }
  | { type: "BROADCAST"; record: BroadcastRecord; notification: AppNotification };

const ADMIN_ACTIONS = new Set(["APPOINT_COUNCIL", "REMOVE_COUNCIL", "EDIT_STUDENT", "RESET_PASSWORD", "RESET_ACTIVATION", "ADD_DEPARTMENT", "DELETE_DEPARTMENT", "SET_PERMISSIONS", "SET_DEPARTMENT", "SET_DIRECTORY_ORDER", "PIN_DIRECTORY_OFFICER", "MOVE_DIRECTORY_OFFICER", "ADD_STUDENT", "DELETE_STUDENT", "ADD_STUDENT_EMAIL", "REMOVE_STUDENT_EMAIL", "SET_BRANDING", "SET_LEGAL", "SET_HOUSE_CAPTAIN", "SET_HOUSE_MEMBERSHIP", "ADD_EVENT_TYPE", "DELETE_EVENT_TYPE", "SET_HOUSE_BRANDING", "ADD_COUNCIL_HUB_MEMBER", "REMOVE_COUNCIL_HUB_MEMBER", "UPDATE_NOTIFICATION_TEMPLATES"]);
/**
 * Actions whose data lives in a Google Sheet. The spreadsheet is the single source of
 * truth for House Points, while Calendar and Finances are managed directly within the hub.
 */
const SHEET_OWNED_ACTIONS: Record<string, { section: SheetSection; label: string }> = {
  AWARD_POINTS: { section: "housePoints", label: "House points" },
};
const ACTION_FEATURES: Record<string, string> = {
  AWARD_POINTS: "houses", ADD_EVENT: "events", TOGGLE_ATTENDANCE: "events", ADD_ANNOUNCEMENT: "events",
  UPDATE_EVENT: "events", DELETE_EVENT: "events",
  ADD_TASK: "tasks", MOVE_TASK: "tasks", EDIT_TASK: "tasks", DELETE_TASK: "tasks", DELEGATE_TASK: "tasks",
  REVIEW_SUGGESTION: "voice", ADD_POLL: "voice",
  ADD_MEETING: "meetings", SAVE_MINUTES: "meetings", DELETE_MEETING: "meetings",
  ADD_RESOURCE: "meetings", DELETE_RESOURCE: "meetings",
  ADD_TRANSACTION: "finances",
  ADD_PHOTO: "gallery", SET_ACTIVE_IMAGE: "gallery", BROADCAST: "broadcast",
};

function toSsotUser(student: Student) {
  return {
    id: student.id,
    email: student.email,
    name: student.name,
    grade: student.gradeLabel,
    house: student.houseLabel,
    role: student.role,
    councilTitle: student.councilTitle,
    status: student.status,
    createdAt: student.createdAt,
    passwordHash: student.passwordHash ?? student.password,
    aliases: student.aliases ?? [],
    verifiedAliases: student.verifiedAliases ?? [],
  };
}

export function reducer(state: HubState, action: Action): HubState {
  const next = applyAction(state, action);
  if (
    next === state ||
    action.type === "REPLACE" ||
    action.type === "LOGIN" ||
    action.type === "LOGOUT" ||
    action.type === "SET_THEME"
  ) {
    return next;
  }
  return { ...next, lastModified: Date.now() };
}

function applyAction(state: HubState, action: Action): HubState {
  const actor = state.users.find((u) => u.id === state.session?.userId);
  if (ADMIN_ACTIONS.has(action.type) && actor?.role !== "admin") throw new Error("Only an administrator can make this change.");
  const feature = ACTION_FEATURES[action.type];
  const isAssignedTaskAction =
    (action.type === "MOVE_TASK" && state.tasks.some((t) => t.id === action.taskId && t.assigneeId === actor?.id)) ||
    (action.type === "EDIT_TASK" && state.tasks.some((t) => t.id === action.task.id && t.assigneeId === actor?.id));
  if (
    feature &&
    !isAssignedTaskAction &&
    actor?.role !== "admin" &&
    !(actor?.role === "council" && state.permissions[actor.id]?.includes(feature))
  ) {
    throw new Error("Your council account does not have permission for this action.");
  }
  if (action.type === "POST_HOUSE_MESSAGE") {
    const targetHouse = action.message.house;
    const isHouseCaptainOrAdmin = actor?.role === "admin" || state.houseCaptains[targetHouse] === actor?.id;
    const isHouseOfficerOrTeacher =
      (actor?.role === "council" || actor?.role === "teacher") &&
      belongsToHouse(actor, targetHouse, state.houseMemberships);
    const isHouseMember = belongsToHouse(actor, targetHouse, state.houseMemberships);
    if (action.message.kind === "instruction" && !isHouseCaptainOrAdmin && !isHouseOfficerOrTeacher) {
      throw new Error("Only the house captain, a house council officer, or an administrator can post official instructions.");
    }
    if (!isHouseCaptainOrAdmin && !isHouseMember) {
      throw new Error("Only members of this house or an administrator can post to this house hub.");
    }
  }
  if (action.type === "DELETE_HOUSE_MESSAGE") {
    const message = state.houseMessages.find((m) => m.id === action.messageId);
    if (actor?.role !== "admin" && message?.authorId !== actor?.id) throw new Error("You can only remove your own house posts.");
  }
  switch (action.type) {
    case "REPLACE":
      return action.state;
    case "LOGIN": {
      const account = state.users.find((u) => u.id === action.userId);
      if (!account) throw new Error("This account is not on the student roster.");
      const users = state.users.some((u) => u.id === account.id) ? state.users : [...state.users, account];
      return {
        ...state,
        permissions: account.role === "council" && !state.permissions[account.id] ? { ...state.permissions, [account.id]: FEATURE_PERMISSIONS.map((p) => p.id) } : state.permissions,
        users: users.map((u) => u.id === account.id ? { ...u, status: "active" } : u),
        session: { userId: account.id, token: `local-preview-${uid()}` }
      };
    }
    case "LOGOUT":
      return { ...state, session: null };
    case "SET_THEME":
      return { ...state, theme: action.theme };
    case "MARK_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.notifId && !n.readBy.includes(action.userId)
            ? { ...n, readBy: [...n.readBy, action.userId] }
            : n
        ),
      };
    case "MARK_ALL_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.readBy.includes(action.userId) ? n : { ...n, readBy: [...n.readBy, action.userId] }
        ),
      };
    case "PUSH_NOTIFICATION":
      if (state.notifications.some((n) => n.id === action.notification.id)) return state;
      return { ...state, notifications: [action.notification, ...state.notifications].slice(0, 60) };
    case "AWARD_POINTS":
      return {
        ...state,
        pointsLedger: [action.entry, ...state.pointsLedger],
        notifications: [action.notification, ...state.notifications].slice(0, 60),
      };
    case "RSVP":
      return {
        ...state,
        events: state.events.map((e) => {
          if (e.id !== action.eventId) return e;
          const has = e.attendees.includes(action.userId);
          if (has) {
            return { ...e, attendees: e.attendees.filter((id) => id !== action.userId), attended: e.attended.filter((id) => id !== action.userId) };
          }
          if (e.attendees.length >= e.capacity) return e;
          return { ...e, attendees: [...e.attendees, action.userId] };
        }),
      };
    case "TOGGLE_ATTENDANCE":
      return {
        ...state,
        events: state.events.map((e) =>
          e.id === action.eventId
            ? { ...e, attended: e.attended.includes(action.userId) ? e.attended.filter((id) => id !== action.userId) : [...e.attended, action.userId] }
            : e
        ),
      };
    case "ADD_EVENT":
      return {
        ...state,
        events: [action.event, ...state.events],
        notifications: action.notification ? [action.notification, ...state.notifications].slice(0, 60) : state.notifications,
      };
    case "ADD_ANNOUNCEMENT":
      return {
        ...state,
        announcements: [action.announcement, ...state.announcements],
        notifications: [action.notification, ...state.notifications].slice(0, 60),
      };
    case "ADD_TASK":
      return {
        ...state,
        tasks: [
          {
            ...action.task,
            completedAt: action.task.status === "done" ? (action.task.completedAt ?? Date.now()) : undefined,
          },
          ...state.tasks,
        ],
        notifications: action.notification ? [action.notification, ...state.notifications].slice(0, 60) : state.notifications,
      };
    case "MOVE_TASK":
      if (
        actor?.role !== "admin" &&
        !state.permissions[actor?.id ?? ""]?.includes("tasks") &&
        !state.tasks.some((task) => task.id === action.taskId && task.assigneeId === actor?.id)
      ) {
        throw new Error("Only the assigned officer, a task manager, or an administrator can update this task.");
      }
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.taskId
            ? {
                ...t,
                status: action.status,
                completedAt: action.status === "done" ? (t.completedAt ?? Date.now()) : undefined,
              }
            : t
        ),
      };
    case "EDIT_TASK":
      if (
        actor?.role !== "admin" &&
        !state.permissions[actor?.id ?? ""]?.includes("tasks") &&
        !state.tasks.some((task) => task.id === action.task.id && task.assigneeId === actor?.id)
      ) {
        throw new Error("Only the assigned officer, a task manager, or an administrator can edit this task.");
      }
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.task.id
            ? {
                ...t,
                ...action.task,
                completedAt:
                  // The else branch below has no "done" left, so any explicit status
                  // here reopens the task and clears the completion timestamp.
                  action.task.status === "done"
                    ? (action.task.completedAt ?? t.completedAt ?? Date.now())
                    : action.task.status !== undefined
                    ? undefined
                    : t.completedAt,
              }
            : t
        ),
      };
    case "DELETE_TASK":
      if (
        actor?.role !== "admin" &&
        !state.permissions[actor?.id ?? ""]?.includes("tasks") &&
        !state.tasks.some((task) => task.id === action.taskId && task.assigneeId === actor?.id)
      ) {
        throw new Error("Only the assigned officer, a task manager, or an administrator can remove this task.");
      }
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.taskId),
      };
    case "ADD_SUGGESTION": {
      const author = actor ?? state.users.find((u) => u.id === action.suggestion.authorId);
      if (author?.role === "grade") return state;
      const authorLabel = author
        ? `${author.name}${author.role === "teacher" ? " · Staff / Teacher" : ` · Grade ${author.grade ?? "—"}`}${author.house ? ` · ${author.house} House` : ""}`
        : action.suggestion.authorLabel;

      return {
        ...state,
        suggestions: [
          {
            ...action.suggestion,
            anonymous: false,
            authorId: author?.id ?? action.suggestion.authorId,
            authorLabel,
            authorEmail: author?.email ?? action.suggestion.authorEmail,
            authorRole: author?.role ?? action.suggestion.authorRole,
            authorGrade: author?.grade ?? action.suggestion.authorGrade,
            authorHouse: author?.house ?? action.suggestion.authorHouse,
          },
          ...state.suggestions,
        ],
      };
    }
    case "REVIEW_SUGGESTION":
      return {
        ...state,
        suggestions: state.suggestions.map((s) =>
          s.id === action.suggestionId ? { ...s, status: action.status, response: action.response, responderName: action.responderName } : s
        ),
      };
    case "VOTE":
      return {
        ...state,
        polls: state.polls.map((p) => {
          if (p.id !== action.pollId || p.voters.includes(action.userId) || p.expires < new Date().toISOString().slice(0, 10) || action.optionIndex < 0 || action.optionIndex >= p.options.length) return p;
          const voter = state.users.find((u) => u.id === action.userId);
          if (!voter || voter.role === "grade") return p;
          if (actor && actor.id !== action.userId && actor.role !== "admin") return p;
          if (!targetsUser(p.audience, voter)) return p;

          const ballot: PollBallot = {
            userId: voter.id,
            userName: voter.name,
            userEmail: voter.email,
            userRole: voter.role,
            userGrade: voter.grade,
            userHouse: voter.house,
            optionIndex: action.optionIndex,
            optionLabel: p.options[action.optionIndex],
            timestamp: Date.now(),
          };
          return {
            ...p,
            votes: p.votes.map((v, i) => (i === action.optionIndex ? v + 1 : v)),
            voters: [...p.voters, action.userId],
            ballots: [...(p.ballots ?? []), ballot],
          };
        }),
      };
    case "ADD_POLL":
      return {
        ...state,
        polls: [action.poll, ...state.polls],
        notifications: action.notification ? [action.notification, ...state.notifications].slice(0, 60) : state.notifications,
      };
    case "UPDATE_NOTIFICATION_TEMPLATES":
      return {
        ...state,
        notificationTemplates: {
          ...(state.notificationTemplates ?? {}),
          ...action.templates,
        },
      };
    case "RECORD_ACTIVITY":
      return {
        ...state,
        users: state.users.map((u) => (u.id === action.userId ? { ...u, lastActive: action.timestamp || Date.now() } : u)),
      };
    case "ADD_MEETING":
      return { ...state, meetings: [action.meeting, ...state.meetings] };
    case "SAVE_MINUTES":
      return { ...state, meetings: state.meetings.map((m) => (m.id === action.meetingId ? { ...m, minutes: action.minutes } : m)) };
    case "DELETE_MEETING":
      return { ...state, meetings: state.meetings.filter((m) => m.id !== action.meetingId) };
    case "ADD_RESOURCE":
      return { ...state, resources: [action.resource, ...(state.resources ?? RESOURCES)] };
    case "DELETE_RESOURCE":
      return { ...state, resources: (state.resources ?? RESOURCES).filter((r) => r.id !== action.resourceId) };
    case "ADD_TRANSACTION":
      return { ...state, finances: [action.entry, ...state.finances] };
    case "ADD_PHOTO":
      return { ...state, gallery: [action.item, ...state.gallery] };
    case "APPOINT_COUNCIL": {
      if (action.userId === PRIMARY_ADMIN_ID) throw new Error("The primary administrator's appointment is protected.");
      const targetUser = state.users.find((u) => u.id === action.userId);
      if (targetUser && (targetUser.role === "teacher" || targetUser.role === "grade" || targetUser.isStaff)) {
        throw new Error("Only student accounts can be appointed as Student Council Officers. Add teachers to the Council Hub chat instead.");
      }
      if (!state.departments.includes(action.department)) throw new Error("Select a current council department.");
      return {
        ...state,
        permissions: { ...state.permissions, [action.userId]: state.permissions[action.userId] ?? FEATURE_PERMISSIONS.map((p) => p.id) },
        users: state.users.map((u) =>
          u.id === action.userId ? { ...u, role: "council" as Role, status: "active", councilPost: action.post, councilTitle: action.post, department: action.department } : u
        ),
      };
    }
    case "REMOVE_COUNCIL":
      if (action.userId === PRIMARY_ADMIN_ID) throw new Error("The primary administrator cannot be removed.");
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === action.userId
            ? {
                ...u,
                role: (u.isStaff || u.id.startsWith("tch-") ? "teacher" : "student") as Role,
                councilPost: undefined,
                councilTitle: undefined,
                department: undefined,
              }
            : u
        ),
      };
    case "EDIT_STUDENT": {
      const actor = state.session ? state.users.find((u) => u.id === state.session!.userId) : null;
      const target = state.users.find((u) => u.id === action.userId);
      if (!actor || !target) return state;
      if (target.id === PRIMARY_ADMIN_ID && (action.name !== target.name || action.grade !== 9 || action.house !== "Red")) throw new Error("The primary administrator's identity is protected.");
      if (action.house === null && target.role !== "teacher" && target.role !== "grade") throw new Error("Only teacher or class accounts may have no house.");
      const gradeLabel = action.grade === null ? null : canonicalGradeFromNumber(action.grade);
      const houseLabel = action.house === null ? null : HOUSE_LABELS[HOUSES.indexOf(action.house)];
      const result = adminUpdateRosterRecord({
        actor: toSsotUser(actor),
        targetEmail: target.email,
        roster: state.users.map(toSsotUser),
        patch: { name: action.name, grade: gradeLabel, house: houseLabel },
      });
      return {
        ...state,
        users: state.users.map((u) => {
          const updated = result.updatedRoster.find((entry) => entry.id === u.id);
          return updated
            ? {
                ...u,
                name: updated.name,
                grade: u.id === action.userId ? action.grade : u.grade,
                gradeLabel: updated.grade,
                house: u.id === action.userId ? action.house : u.house,
                houseLabel: updated.house,
                role: updated.role,
                status: updated.status,
                councilTitle: updated.councilTitle,
                councilPost: updated.councilTitle,
                createdAt: updated.createdAt,
              }
            : u;
        }),
      };
    }
    case "RESET_PASSWORD": {
      const actor = state.users.find((u) => u.id === state.session?.userId);
      const target = state.users.find((u) => u.id === action.userId);
      if (!actor || !target) return state;
      if (actor.id !== action.actorId) throw new Error("The current administrator must authorize this reset.");
      if (action.password.length < 8) throw new Error("Use a password with at least 8 characters.");
      const result = adminResetStudentCredentials({
        actor: toSsotUser(actor),
        targetEmail: target.email,
        nextPasswordHash: action.password,
        roster: state.users.map(toSsotUser),
      });
      return {
        ...state,
        users: state.users.map((u) => {
          const updated = result.updatedRoster.find((entry) => entry.id === u.id);
          return updated && u.id === action.userId ? { ...u, password: action.password, passwordHash: updated.passwordHash } : u;
        }),
      };
    }
    case "RESET_ACTIVATION":
      if (action.userId === PRIMARY_ADMIN_ID) throw new Error("The primary administrator must remain active.");
      return { ...state, users: state.users.map((u) => u.id === action.userId ? { ...u, status: "pending" } : u) };
    case "ADD_STUDENT": {
      const email = action.student.email.trim().toLowerCase();
      if (state.users.some((u) => u.email.toLowerCase() === email || u.aliases?.some((a) => a.toLowerCase() === email))) {
        throw new Error("An account is already using this email address.");
      }
      if (state.users.some((u) => u.id === action.student.id)) throw new Error("This account ID is already in use.");
      if (!action.student.name.trim()) throw new Error("Enter the account's full name.");
      return {
        ...state,
        users: [
          ...state.users,
          {
            ...action.student,
            email,
            aliases: action.student.aliases ?? [],
            verifiedAliases: action.student.verifiedAliases ?? [],
          },
        ],
      };
    }
    case "ADD_STUDENT_EMAIL": {
      const target = state.users.find((u) => u.id === action.userId);
      if (!target) throw new Error("Account not found.");
      const email = action.email.trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
        throw new Error("Enter a valid personal or school email address.");
      }
      const isTaken = state.users.some((u) => u.email.toLowerCase() === email || u.aliases?.some((a) => a.toLowerCase() === email));
      if (isTaken) throw new Error(`The email ${email} is already associated with an account.`);
      const currentAliases = target.aliases ?? [];
      if (currentAliases.some((a) => a.toLowerCase() === email)) return state;
      return {
        ...state,
        users: state.users.map((u) => (u.id === action.userId ? { ...u, aliases: [...currentAliases, email] } : u)),
      };
    }
    case "VERIFY_STUDENT_EMAIL": {
      const target = state.users.find((u) => u.id === action.userId);
      if (!target) throw new Error("Account not found.");
      const email = action.email.trim().toLowerCase();
      const verified = target.verifiedAliases ?? [];
      if (verified.includes(email)) return state;
      return {
        ...state,
        users: state.users.map((u) => (u.id === action.userId ? { ...u, verifiedAliases: [...verified, email] } : u)),
      };
    }
    case "REMOVE_STUDENT_EMAIL": {
      const target = state.users.find((u) => u.id === action.userId);
      if (!target) throw new Error("Account not found.");
      const email = action.email.trim().toLowerCase();
      const currentAliases = target.aliases ?? [];
      const isPrimary = target.email.toLowerCase() === email;
      if (isPrimary) {
        throw new Error("The primary school email cannot be removed. Personal emails are optional sign-in aliases only.");
      }
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === action.userId
            ? {
                ...u,
                aliases: currentAliases.filter((a) => a.toLowerCase() !== email),
                verifiedAliases: (u.verifiedAliases ?? []).filter((a) => a.toLowerCase() !== email),
              }
            : u
        ),
      };
    }
    case "DELETE_STUDENT": {
      if (action.userId === PRIMARY_ADMIN_ID) throw new Error("The primary administrator cannot be removed.");
      if (action.userId === state.session?.userId) throw new Error("You cannot remove the account you are signed in with.");
      if (!state.users.some((u) => u.id === action.userId)) throw new Error("This student is no longer on the roster.");
      const { [action.userId]: _removed, ...permissions } = state.permissions;
      const captains = { ...state.houseCaptains };
      (Object.keys(captains) as House[]).forEach((house) => { if (captains[house] === action.userId) delete captains[house]; });
      return {
        ...state,
        users: state.users.filter((u) => u.id !== action.userId),
        permissions,
        houseCaptains: captains,
        events: state.events.map((e) => ({ ...e, attendees: e.attendees.filter((id) => id !== action.userId), attended: e.attended.filter((id) => id !== action.userId) })),
        polls: state.polls.map((p) => ({
          ...p,
          voters: p.voters.filter((id) => id !== action.userId),
          ballots: p.ballots?.filter((b) => b.userId !== action.userId),
        })),
      };
    }
    case "SET_BRANDING": {
      const branding = action.branding;
      const schoolName = branding.schoolName?.trim() || "Student Council";
      const boardName = branding.boardName?.trim() || "Shristi Academy Board";
      const logoUrl = (branding.logoUrl ?? "").trim();
      if (logoUrl && !/^(https?:\/\/|\/|data:image\/)/i.test(logoUrl)) {
        throw new Error("Use an image URL (https://...) or upload an image file.");
      }
      return {
        ...state,
        branding: {
          ...branding,
          schoolName,
          boardName,
          session: (branding.session ?? "").trim() || state.branding.session,
          logoUrl,
        },
      };
    }
    case "SET_LEGAL":
      if (!action.legal.terms.trim() || !action.legal.credits.trim()) throw new Error("Both the terms and credits pages need content.");
      return { ...state, legal: { terms: action.legal.terms, credits: action.legal.credits } };
    case "SET_HOUSE_BRANDING": {
      const name = action.name.trim() || action.house;
      if (name.length > 30) throw new Error("House names must be 30 characters or fewer.");
      if (!HOUSES.includes(action.house)) throw new Error("Choose an official school house.");
      const logoUrl = (action.logoUrl ?? "").trim();
      if (logoUrl && !/^(https?:\/\/|\/|data:image\/)/i.test(logoUrl)) {
        throw new Error("Use an image URL (https://...) or upload an image file.");
      }
      return { ...state, houses: { ...state.houses, [action.house]: { name, logoUrl } } };
    }
    case "SUBMIT_RATING": {
      const value = Math.round(action.value);
      if (value < 1 || value > 5) throw new Error("Choose a rating between 1 and 5 stars.");
      const entry = { userId: action.userId, userName: action.userName, house: action.house, value, comment: action.comment.trim().slice(0, 300), timestamp: Date.now() };
      const existing = state.siteRatings.some((r) => r.userId === action.userId);
      return {
        ...state,
        siteRatings: existing
          ? state.siteRatings.map((r) => (r.userId === action.userId ? entry : r))
          : [entry, ...state.siteRatings].slice(0, 500),
      };
    }
    case "SET_HOUSE_CAPTAIN": {
      if (action.userId) {
        const candidate = state.users.find((u) => u.id === action.userId);
        if (!candidate) throw new Error("Select a student from the roster.");
        if (candidate.house !== action.house) throw new Error(`${candidate.name} is not a member of ${action.house} House.`);
      }
      const captains = { ...state.houseCaptains };
      if (action.userId) captains[action.house] = action.userId; else delete captains[action.house];
      return { ...state, houseCaptains: captains };
    }
    case "SET_HOUSE_MEMBERSHIP": {
      const memberships = {
        Blue: [...(state.houseMemberships.Blue ?? [])],
        Red: [...(state.houseMemberships.Red ?? [])],
        Green: [...(state.houseMemberships.Green ?? [])],
      };
      const list = memberships[action.house];
      if (action.include) {
        if (!list.includes(action.accountId)) memberships[action.house] = [...list, action.accountId];
      } else {
        memberships[action.house] = list.filter((id) => id !== action.accountId);
        // Removing a captain from their own house hub also clears the appointment.
        if (state.houseCaptains[action.house] === action.accountId) {
          const captains = { ...state.houseCaptains };
          delete captains[action.house];
          return { ...state, houseMemberships: memberships, houseCaptains: captains };
        }
      }
      return { ...state, houseMemberships: memberships };
    }
    case "POST_HOUSE_MESSAGE":
      if (!action.message.title.trim() || !action.message.body.trim()) throw new Error("A title and message are required.");
      return { ...state, houseMessages: [action.message, ...state.houseMessages].slice(0, 200) };
    case "DELETE_HOUSE_MESSAGE":
      return { ...state, houseMessages: state.houseMessages.filter((m) => m.id !== action.messageId) };
    case "POST_COUNCIL_MESSAGE":
      // Membership is the only way in: role alone never grants Council Hub access.
      return { ...state, councilMessages: addCouncilMessage(state, actor, action.message) };
    case "DELETE_COUNCIL_MESSAGE":
      return { ...state, councilMessages: removeCouncilMessage(state, actor, action.messageId) };
    case "ADD_COUNCIL_HUB_MEMBER":
      return { ...state, councilHubMembers: addCouncilMember(state, action.userId) };
    case "REMOVE_COUNCIL_HUB_MEMBER":
      return { ...state, councilHubMembers: removeCouncilMember(state, action.userId, PRIMARY_ADMIN_ID) };
    case "ADD_EVENT_TYPE": {
      const name = action.name.trim();
      if (name.length < 2 || name.length > 40) throw new Error("Event type names must be 2 to 40 characters.");
      if (state.eventTypes.some((t) => t.toLowerCase() === name.toLowerCase())) throw new Error("This event type already exists.");
      return { ...state, eventTypes: [...state.eventTypes, name] };
    }
    case "DELETE_EVENT_TYPE":
      if (state.eventTypes.length <= 1) throw new Error("Keep at least one event type.");
      return { ...state, eventTypes: state.eventTypes.filter((t) => t !== action.name) };
    case "UPDATE_EVENT":
      return { ...state, events: state.events.map((e) => e.id === action.event.id ? { ...action.event, attendees: e.attendees, attended: e.attended } : e) };
    case "DELETE_EVENT":
      return { ...state, events: state.events.filter((e) => e.id !== action.eventId) };
    case "ADD_DEPARTMENT": {
      const name = action.name.trim();
      if (name.length < 2 || name.length > 60) throw new Error("Department names must be 2 to 60 characters.");
      if (state.departments.some((d) => d.toLowerCase() === name.toLowerCase())) throw new Error("This department already exists.");
      return { ...state, departments: [...state.departments, name] };
    }
    case "DELETE_DEPARTMENT": {
      if (action.name === "General") throw new Error("General is the default department and cannot be removed.");
      const fallback = state.departments.includes("General") ? "General" : (state.departments.find((d) => d !== action.name) ?? "General");
      return {
        ...state,
        departments: state.departments.filter((d) => d !== action.name),
        users: state.users.map((u) => u.department === action.name ? { ...u, department: fallback } : u),
        tasks: state.tasks.map((t) => t.department === action.name ? { ...t, department: fallback } : t),
      };
    }
    case "SET_PERMISSIONS":
      if (action.userId === PRIMARY_ADMIN_ID) throw new Error("The primary administrator always has full clearance.");
      return { ...state, permissions: { ...state.permissions, [action.userId]: action.permissions.filter((p) => FEATURE_PERMISSIONS.some((f) => f.id === p)) } };
    case "SET_DEPARTMENT": {
      if (!state.departments.includes(action.department)) throw new Error("Select an existing department.");
      const previous = state.users.find((u) => u.id === action.userId)?.department;
      return {
        ...state,
        users: state.users.map((u) => u.id === action.userId ? { ...u, department: action.department } : u),
        tasks: state.tasks.map((t) => t.assigneeId === action.userId && (!t.department || t.department === previous) ? { ...t, department: action.department } : t),
      };
    }
    case "SET_DIRECTORY_ORDER": {
      const order = Array.isArray(action.order) ? action.order : [];
      const isReset = order.length === 0;
      const users = state.users.map((u) => {
        if (isReset) {
          return { ...u, directoryOrder: undefined, directoryPinned: false };
        }
        const idx = order.indexOf(u.id);
        return idx >= 0 ? { ...u, directoryOrder: idx, directoryPinned: idx === 0 ? u.directoryPinned : false } : u;
      });
      try {
        if (isReset) {
          localStorage.removeItem("shristi_council_directory_order");
        } else {
          localStorage.setItem("shristi_council_directory_order", JSON.stringify(order));
        }
      } catch {}
      return {
        ...state,
        directoryOrder: order,
        users,
      };
    }
    case "PIN_DIRECTORY_OFFICER": {
      const { userId, pinned } = action;
      const officers = state.users.filter((u) => u.role === "council" || u.role === "admin");
      const currentOrder = sortDirectoryOfficers(officers, state.directoryOrder).map((u) => u.id);
      let nextOrder = currentOrder.filter((id) => id !== userId);
      if (pinned) {
        nextOrder = [userId, ...nextOrder];
      } else {
        nextOrder = [...nextOrder, userId];
      }
      const users = state.users.map((u) => {
        const orderIdx = nextOrder.indexOf(u.id);
        if (u.id === userId) {
          return { ...u, directoryPinned: pinned, directoryOrder: orderIdx >= 0 ? orderIdx : 999 };
        }
        return orderIdx >= 0 ? { ...u, directoryOrder: orderIdx } : u;
      });
      try {
        localStorage.setItem("shristi_council_directory_order", JSON.stringify(nextOrder));
      } catch {}
      return {
        ...state,
        directoryOrder: nextOrder,
        users,
      };
    }
    case "MOVE_DIRECTORY_OFFICER": {
      const { userId, direction } = action;
      const officers = state.users.filter((u) => u.role === "council" || u.role === "admin");
      const currentOrder = sortDirectoryOfficers(officers, state.directoryOrder).map((u) => u.id);

      const idx = currentOrder.indexOf(userId);
      if (idx === -1) return state;

      let nextOrder = [...currentOrder];
      if (direction === "top") {
        nextOrder = [userId, ...nextOrder.filter((id) => id !== userId)];
      } else if (direction === "up" && idx > 0) {
        const temp = nextOrder[idx - 1];
        nextOrder[idx - 1] = nextOrder[idx];
        nextOrder[idx] = temp;
      } else if (direction === "down" && idx < nextOrder.length - 1) {
        const temp = nextOrder[idx + 1];
        nextOrder[idx + 1] = nextOrder[idx];
        nextOrder[idx] = temp;
      }

      const users = state.users.map((u) => {
        const orderIdx = nextOrder.indexOf(u.id);
        const isTarget = u.id === userId;
        return orderIdx >= 0
          ? {
              ...u,
              directoryOrder: orderIdx,
              directoryPinned:
                direction === "top" && isTarget
                  ? true
                  : orderIdx === 0 && u.directoryPinned
                  ? true
                  : false,
            }
          : u;
      });

      try {
        localStorage.setItem("shristi_council_directory_order", JSON.stringify(nextOrder));
      } catch {}
      return {
        ...state,
        directoryOrder: nextOrder,
        users,
      };
    }
    case "SET_AVATAR":
      if (actor?.role !== "admin" && actor?.id !== action.userId) throw new Error("You can only change your own profile picture.");
      if (action.url !== "" && !/^(https:\/\/|data:image\/(jpeg|jpg|png|webp|gif|svg\+xml);base64,)/.test(action.url)) throw new Error("Use a valid HTTPS image or uploaded photo.");
      return { ...state, users: state.users.map((u) => u.id === action.userId ? { ...u, avatarUrl: action.url || undefined } : u) };
    case "SET_ACTIVE_IMAGE":
      if (action.active && !state.activeImageIds.includes(action.imageId) && state.activeImageIds.length >= 5) throw new Error("At most five images can be active. Disable one first.");
      return { ...state, activeImageIds: action.active ? Array.from(new Set([...state.activeImageIds, action.imageId])) : state.activeImageIds.filter((id) => id !== action.imageId) };
    case "DELEGATE_TASK":
      if (!state.users.some((u) => u.id === action.assigneeId && u.role !== "student")) throw new Error("Choose a council officer.");
      if (!state.departments.includes(action.department)) throw new Error("Choose a council department.");
      return { ...state, tasks: state.tasks.map((t) => t.id === action.taskId ? { ...t, assigneeId: action.assigneeId, department: action.department } : t) };
    case "BROADCAST":
      return {
        ...state,
        broadcastHistory: [action.record, ...state.broadcastHistory].slice(0, 40),
        notifications: state.notifications.some((n) => n.id === action.notification.id)
          ? state.notifications
          : [action.notification, ...state.notifications].slice(0, 60),
      };
    default:
      return state;
  }
}

interface HubContextValue {
  state: HubState;
  dispatch: React.Dispatch<Action>;
  user: Student | null;
  canManage: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  houseTotals: Record<House, number>;
  /** Points ledger in use: live Google Sheets rows, or the local ledger when unconfigured. */
  pointsLedger: PointEntry[];
  /** Calendar events in use: live Google Sheets rows, or local events when unconfigured. */
  calendarEvents: SchoolEvent[];
  /** Finance ledger in use: live Google Sheets rows, or local entries when unconfigured. */
  financeEntries: FinanceEntry[];
  /** Google Sheets connection state for the three spreadsheet-owned sections. */
  sheets: SheetsContextValue;
  unreadCount: number;
  notify: (n: Omit<AppNotification, "id" | "timestamp" | "readBy" | "kind">) => void;
  feedback: { id: number; text: string; tone: "success" | "error" } | null;
  announce: (text: string, tone?: "success" | "error") => void;
  hasPermission: (feature: string) => boolean;
  devices: ConnectedDevice[];
  firebaseStatus: "signed-out" | "connecting" | "connected" | "error";
  firebaseEmail: string | null;
  /** True when the signed-in Google account still needs a hub password set. */
  needsPasswordSetup: boolean;
  createAccountPassword: (password: string) => Promise<void>;
  /** Grant or revoke an account's access to a house hub without touching its primary house. */
  setHouseMembership: (house: House, accountId: string, include: boolean) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInPassword: (email: string, password: string) => Promise<void>;
  signInDirect: (userId: string) => void;
  saveStateToDatabase: () => Promise<void>;
  loadStateFromDatabase: () => Promise<void>;
  uploadAllToFirestore: () => Promise<void>;
  loadAllFromFirestore: () => Promise<void>;
  signOutSession: () => Promise<void>;
}

const HubContext = createContext<HubContextValue | null>(null);

let tabSetter: ((t: string) => void) | null = null;
export function navigateTab(tab: string) {
  tabSetter?.(tab);
}

export function sortDirectoryOfficers(officers: Student[], directoryOrder?: string[]): Student[] {
  return [...officers].sort((a, b) => {
    if (directoryOrder && directoryOrder.length > 0) {
      const idxA = directoryOrder.indexOf(a.id);
      const idxB = directoryOrder.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
    }

    if (a.directoryPinned && !b.directoryPinned) return -1;
    if (!a.directoryPinned && b.directoryPinned) return 1;

    if (a.directoryOrder !== undefined && a.directoryOrder !== null && b.directoryOrder !== undefined && b.directoryOrder !== null) {
      return a.directoryOrder - b.directoryOrder;
    }
    if (a.directoryOrder !== undefined && a.directoryOrder !== null) return -1;
    if (b.directoryOrder !== undefined && b.directoryOrder !== null) return 1;

    const priority = (u: Student) => {
      if (u.role === "admin") return 0;
      const title = (u.councilTitle ?? "").toLowerCase();
      if (title.includes("president") && !title.includes("vice")) return 1;
      if (title.includes("vice")) return 2;
      if (title.includes("secretary")) return 3;
      return 10;
    };
    const pA = priority(a);
    const pB = priority(b);
    if (pA !== pB) return pA - pB;
    return a.name.localeCompare(b.name);
  });
}

function validRoster(users: Student[]): boolean {
  if (!Array.isArray(users) || !users.length) return false;
  if (new Set(users.map((u) => u.id)).size !== users.length) return false;
  if (!users.some((u) => u.id === PRIMARY_ADMIN_ID && u.role === "admin")) return false;
  return true;
}

const LEGACY_DEPARTMENT_ALIASES = new Set(["cultural", "sports", "academic", "outreach", "events", "finance", "finances"]);

function normalizeDepartmentsList(candidates: string[] | undefined | null, seedDepts: string[]): string[] {
  const base = Array.isArray(candidates) && candidates.length > 0 ? candidates : seedDepts;
  const result = new Set<string>(DEFAULT_DEPARTMENTS);
  for (const d of base) {
    const trimmed = typeof d === "string" ? d.trim() : "";
    if (!trimmed) continue;
    if (!LEGACY_DEPARTMENT_ALIASES.has(trimmed.toLowerCase())) {
      result.add(trimmed);
    }
  }
  const arr = Array.from(result);
  if (!arr.includes("General")) return ["General", ...arr];
  return ["General", ...arr.filter((d) => d !== "General")];
}

function normalizeUserRecord(u: Student, seedUser: Student | undefined, departments: string[]): Student {
  const isPrimary = u.id === PRIMARY_ADMIN_ID || u.email?.toLowerCase() === "72019arnab@shristiacademy.edu.np";
  const resolvedRole: Role = isPrimary
    ? "admin"
    : u.id?.startsWith("cls-") || u.role === "grade"
    ? "grade"
    : u.id?.startsWith("tch-") || u.role === "teacher" || u.isStaff
    ? "teacher"
    : u.role === "admin" || u.role === "council" || u.role === "student"
    ? u.role
    : (seedUser?.role ?? "student");
  const isOfficer = resolvedRole === "council" || resolvedRole === "admin";
  const isTeacherRole = resolvedRole === "teacher";
  const isClassRole = resolvedRole === "grade";
  const resolvedTitle = isOfficer
    ? (u.councilTitle || u.councilPost || seedUser?.councilTitle || "Council Representative")
    : undefined;
  const resolvedDept = isOfficer
    ? (u.department || departmentFor({ ...seedUser, ...u, role: resolvedRole, councilTitle: resolvedTitle, councilPost: resolvedTitle }, departments))
    : undefined;
  return {
    ...(seedUser || {}),
    ...u,
    role: resolvedRole,
    isStaff: isTeacherRole,
    house: isClassRole ? null : (u.house !== undefined ? u.house : (seedUser?.house ?? null)),
    houseLabel: isClassRole ? null : (u.houseLabel !== undefined ? u.houseLabel : (seedUser?.houseLabel ?? null)),
    status: isOfficer || isTeacherRole || isClassRole ? "active" : (u.status || seedUser?.status || "pending"),
    councilTitle: resolvedTitle,
    councilPost: resolvedTitle,
    department: resolvedDept,
    avatarUrl: u.avatarUrl || seedUser?.avatarUrl || undefined,
    directoryOrder: u.directoryOrder !== undefined ? u.directoryOrder : seedUser?.directoryOrder,
    directoryPinned: u.directoryPinned !== undefined ? u.directoryPinned : seedUser?.directoryPinned,
  };
}

function normalizeTasksList(
  tasks: CouncilTask[] | undefined | null,
  seedTasks: CouncilTask[],
  users: Student[],
  departments: string[]
): CouncilTask[] {
  const base = Array.isArray(tasks) && tasks.length > 0 ? [...tasks] : [...seedTasks];
  const existingIds = new Set(base.map((t) => t.id));
  // If state still has the original 4-task seed (tk-1 present, tk-5 missing), backfill tk-5..tk-12
  if (existingIds.has("tk-1") && !existingIds.has("tk-5")) {
    for (const st of seedTasks) {
      if (!existingIds.has(st.id)) {
        base.push(st);
        existingIds.add(st.id);
      }
    }
  }
  return base.map((t) => {
    const dept = taskDepartment(t, users, departments);
    return {
      ...t,
      department: dept,
      completedAt: t.status === "done" ? (t.completedAt ?? 1735689600000) : undefined,
    };
  });
}

function withFallbackSlices(parsed: HubState, seed: HubState): HubState {
  const departments = normalizeDepartmentsList(parsed.departments, seed.departments);
  const parsedUsers = Array.isArray(parsed.users) ? parsed.users : seed.users;
  const parsedIds = new Set(parsedUsers.map((u) => u.id));
  const missingFromSeed = seed.users.filter((su) => !parsedIds.has(su.id));
  const seedById = new Map(seed.users.map((su) => [su.id, su]));
  const rawMergedUsers = [...parsedUsers, ...missingFromSeed];
  const officerCount = rawMergedUsers.filter((u) => u.role === "council" || u.role === "admin").length;
  const mergedUsers = rawMergedUsers.map((u) => {
    const seedUser = seedById.get(u.id);
    const baseUser =
      officerCount < 5 && seedUser && (seedUser.role === "council" || seedUser.role === "admin")
        ? { ...u, role: seedUser.role, councilTitle: seedUser.councilTitle, councilPost: seedUser.councilPost, department: seedUser.department, status: "active" as const }
        : u;
    return normalizeUserRecord(baseUser, seedUser, departments);
  });

  const parsedHubMembers = Array.isArray(parsed.councilHubMembers) ? parsed.councilHubMembers : [];
  const councilHubMembers =
    parsedHubMembers.length <= 1
      ? Array.from(new Set([...parsedHubMembers, ...seed.councilHubMembers]))
      : parsedHubMembers;

  const parsedCaptains = parsed.houseCaptains ?? {};
  const hasAnyCaptain = Boolean(parsedCaptains.Blue || parsedCaptains.Red || parsedCaptains.Green);
  const houseCaptains = hasAnyCaptain ? { ...seed.houseCaptains, ...parsedCaptains } : seed.houseCaptains;

  const houseMessages =
    Array.isArray(parsed.houseMessages) && parsed.houseMessages.length > 0
      ? parsed.houseMessages
      : seed.houseMessages;

  const tasks = normalizeTasksList(parsed.tasks, seed.tasks, mergedUsers, departments);

  return {
    ...seed,
    ...parsed,
    users: mergedUsers,
    tasks,
    meetings: Array.isArray(parsed.meetings) && parsed.meetings.length > 0 ? parsed.meetings : seed.meetings,
    resources: Array.isArray(parsed.resources) && parsed.resources.length > 0 ? parsed.resources : (seed.resources ?? RESOURCES),
    pointsLedger: Array.isArray(parsed.pointsLedger) ? parsed.pointsLedger : seed.pointsLedger,
    councilHubMembers,
    councilMessages: parsed.councilMessages ?? seed.councilMessages,
    departments,
    permissions: { ...seed.permissions, ...(parsed.permissions ?? {}) },
    activeImageIds: parsed.activeImageIds ?? seed.activeImageIds,
    audit: parsed.audit ?? [],
    branding: parsed.branding
      ? {
          ...seed.branding,
          ...parsed.branding,
          logoUrl: parsed.branding.logoUrl !== undefined ? parsed.branding.logoUrl : seed.branding.logoUrl,
        }
      : seed.branding,
    legal: parsed.legal
      ? {
          terms: parsed.legal.terms || seed.legal.terms,
          credits: parsed.legal.credits || seed.legal.credits,
        }
      : seed.legal,
    eventTypes: parsed.eventTypes?.length ? parsed.eventTypes : seed.eventTypes,
    houseCaptains,
    houseMemberships: parsed.houseMemberships
      ? {
          Blue: [...(parsed.houseMemberships.Blue ?? [])],
          Red: [...(parsed.houseMemberships.Red ?? [])],
          Green: [...(parsed.houseMemberships.Green ?? [])],
        }
      : seed.houseMemberships,
    houseMessages,
    houses: parsed.houses
      ? {
          Blue: { ...seed.houses.Blue, ...parsed.houses.Blue, logoUrl: parsed.houses.Blue?.logoUrl !== undefined ? parsed.houses.Blue.logoUrl : seed.houses.Blue.logoUrl },
          Red: { ...seed.houses.Red, ...parsed.houses.Red, logoUrl: parsed.houses.Red?.logoUrl !== undefined ? parsed.houses.Red.logoUrl : seed.houses.Red.logoUrl },
          Green: { ...seed.houses.Green, ...parsed.houses.Green, logoUrl: parsed.houses.Green?.logoUrl !== undefined ? parsed.houses.Green.logoUrl : seed.houses.Green.logoUrl },
        }
      : seed.houses,
    siteRatings: Array.isArray(parsed.siteRatings) ? parsed.siteRatings : seed.siteRatings,
    notificationTemplates: parsed.notificationTemplates ?? seed.notificationTemplates ?? DEFAULT_NOTIFICATION_TEMPLATES,
    directoryOrder: Array.isArray(parsed.directoryOrder) && parsed.directoryOrder.length > 0
      ? parsed.directoryOrder
      : (() => {
          try {
            const stored = localStorage.getItem("shristi_council_directory_order");
            if (stored) {
              const parsedStored = JSON.parse(stored);
              if (Array.isArray(parsedStored) && parsedStored.length > 0) return parsedStored;
            }
          } catch {}
          return seed.directoryOrder ?? [];
        })(),
    lastModified: Number(parsed.lastModified || 0),
  };
}

function mergeCloudState(local: HubState, remote: Partial<HubState>): HubState {
  const seed = buildSeedState();
  const cachedBranding = loadCachedBranding();
  const remoteTime = Number((remote as any).lastModified || (remote as any).version || 0);
  const localTime = Math.max(Number(local.lastModified || 0), Number(cachedBranding?.savedAt || 0));
  const isLocalNewer = localTime >= remoteTime && localTime > 0;

  // Departments:
  const remoteDepts = Array.isArray(remote.departments) && remote.departments.length > 0 ? remote.departments : null;
  const localDepts = Array.isArray(local.departments) && local.departments.length > 0 ? local.departments : null;
  const candidateDepts = remoteDepts && localDepts
    ? (isLocalNewer ? [...remoteDepts, ...localDepts] : [...localDepts, ...remoteDepts])
    : (remoteDepts || localDepts || seed.departments);
  const departments = normalizeDepartmentsList(candidateDepts, seed.departments);

  // Branding:
  const remoteBranding = remote.branding && typeof remote.branding.schoolName === "string" && remote.branding.schoolName.trim() ? remote.branding : null;
  const localBranding = local.branding && typeof local.branding.schoolName === "string" && local.branding.schoolName.trim() ? local.branding : null;
  const branding = isLocalNewer
    ? { ...seed.branding, ...(remoteBranding || {}), ...(localBranding || {}) }
    : { ...seed.branding, ...(localBranding || {}), ...(remoteBranding || {}) };

  // Houses & Legal:
  const houses: Record<House, HubState["houses"][House]> = isLocalNewer
    ? {
        Blue: { ...seed.houses.Blue, ...(remote.houses?.Blue || {}), ...(local.houses?.Blue || {}) },
        Red: { ...seed.houses.Red, ...(remote.houses?.Red || {}), ...(local.houses?.Red || {}) },
        Green: { ...seed.houses.Green, ...(remote.houses?.Green || {}), ...(local.houses?.Green || {}) },
      }
    : {
        Blue: { ...seed.houses.Blue, ...(local.houses?.Blue || {}), ...(remote.houses?.Blue || {}) },
        Red: { ...seed.houses.Red, ...(local.houses?.Red || {}), ...(remote.houses?.Red || {}) },
        Green: { ...seed.houses.Green, ...(local.houses?.Green || {}), ...(remote.houses?.Green || {}) },
      };

  const legal = isLocalNewer
    ? { ...seed.legal, ...(remote.legal || {}), ...(local.legal || {}) }
    : { ...seed.legal, ...(local.legal || {}), ...(remote.legal || {}) };

  // Users:
  const remoteUsers = Array.isArray(remote.users) ? remote.users : [];
  const seedUsers = seed.users;
  const seedById = new Map(seedUsers.map((su) => [su.id, su]));
  let users: Student[];
  if (remoteUsers.length) {
    const remoteMapped = remoteUsers.map((cloudUser) => {
      const seedUser = seedById.get(cloudUser.id);
      const localUser = local.users.find((student) => student.id === cloudUser.id) ?? seedUser;
      const mergedAliases = Array.from(
        new Set([...(isLocalNewer ? (localUser?.aliases ?? []) : (cloudUser.aliases ?? [])), ...(cloudUser.aliases ?? []), ...(localUser?.aliases ?? [])])
      );
      const mergedVerifiedAliases = Array.from(
        new Set([...(localUser?.verifiedAliases ?? []), ...(cloudUser.verifiedAliases ?? [])])
      ).filter((alias) => mergedAliases.some((a) => a.toLowerCase() === alias.toLowerCase()));
      const mergedRaw = (isLocalNewer
        ? {
            ...seedUser,
            ...cloudUser,
            ...localUser,
            password: localUser?.password ?? "",
            passwordHash: localUser?.passwordHash ?? "firebase-auth",
            aliases: localUser?.aliases ?? cloudUser.aliases ?? [],
            verifiedAliases: localUser?.verifiedAliases ?? mergedVerifiedAliases,
            avatarUrl: localUser?.avatarUrl || cloudUser.avatarUrl || undefined,
          }
        : {
            ...seedUser,
            ...localUser,
            ...cloudUser,
            password: localUser?.password ?? "",
            passwordHash: localUser?.passwordHash ?? "firebase-auth",
            aliases: cloudUser.aliases ?? localUser?.aliases ?? [],
            verifiedAliases: cloudUser.verifiedAliases ?? mergedVerifiedAliases,
            avatarUrl: cloudUser.avatarUrl || localUser?.avatarUrl || undefined,
          }) as Student;
      return normalizeUserRecord(mergedRaw, seedUser, departments);
    });
    const remoteIdSet = new Set(remoteMapped.map((u) => u.id));
    const localRemaining = local.users
      .filter((u) => !remoteIdSet.has(u.id))
      .map((u) => normalizeUserRecord(u, seedById.get(u.id), departments));
    const mergedIdSet = new Set([...remoteIdSet, ...localRemaining.map((u) => u.id)]);
    const seedRemaining = seedUsers
      .filter((u) => !mergedIdSet.has(u.id))
      .map((u) => normalizeUserRecord(u, u, departments));
    users = [...remoteMapped, ...localRemaining, ...seedRemaining];
  } else {
    const localIdSet = new Set(local.users.map((u) => u.id));
    const seedMissing = seedUsers.filter((u) => !localIdSet.has(u.id));
    users = [...local.users, ...seedMissing].map((u) => normalizeUserRecord(u, seedById.get(u.id), departments));
  }

  // Tasks: merge by ID and normalize departments
  const localTasks = Array.isArray(local.tasks) ? local.tasks : [];
  const remoteTasks = Array.isArray(remote.tasks) ? remote.tasks : [];
  const taskMap = new Map<string, CouncilTask>();
  const taskOrder = isLocalNewer ? [...remoteTasks, ...localTasks] : [...localTasks, ...remoteTasks];
  for (const t of taskOrder) {
    if (t && t.id) taskMap.set(t.id, t);
  }
  const rawTasks = taskMap.size ? Array.from(taskMap.values()) : (isLocalNewer ? localTasks : remoteTasks);
  const tasks = normalizeTasksList(rawTasks, seed.tasks, users, departments);

  // Polls: merge voters, ballots, and votes accurately
  const localPolls = Array.isArray(local.polls) ? local.polls : [];
  const remotePolls = Array.isArray(remote.polls) ? remote.polls : [];
  const pollMap = new Map<string, Poll>();
  for (const lp of localPolls) {
    pollMap.set(lp.id, { ...lp });
  }
  for (const rp of remotePolls) {
    const existing = pollMap.get(rp.id);
    if (!existing) {
      pollMap.set(rp.id, { ...rp });
    } else {
      const allVoters = Array.from(new Set([...(existing.voters || []), ...(rp.voters || [])]));
      const ballotMap = new Map<string, PollBallot>();
      (existing.ballots || []).forEach((b) => { if (b && b.userId) ballotMap.set(b.userId, b); });
      (rp.ballots || []).forEach((b) => { if (b && b.userId) ballotMap.set(b.userId, b); });
      const mergedBallots = Array.from(ballotMap.values());
      const optionsLen = (rp.options || existing.options || []).length;
      const talliedVotes = new Array(optionsLen).fill(0);
      mergedBallots.forEach((b) => {
        if (typeof b.optionIndex === "number" && b.optionIndex >= 0 && b.optionIndex < optionsLen) {
          talliedVotes[b.optionIndex] += 1;
        }
      });
      const mergedVotes = Array.from({ length: optionsLen }, (_, idx) =>
        Math.max(
          talliedVotes[idx] || 0,
          Number(existing.votes?.[idx]) || 0,
          Number(rp.votes?.[idx]) || 0
        )
      );
      pollMap.set(rp.id, {
        ...(isLocalNewer ? rp : existing),
        ...(isLocalNewer ? existing : rp),
        voters: allVoters,
        ballots: mergedBallots,
        votes: mergedVotes,
      });
    }
  }
  const polls = Array.from(pollMap.values());

  // Suggestions:
  const localSug = Array.isArray(local.suggestions) ? local.suggestions : [];
  const remoteSug = Array.isArray(remote.suggestions) ? remote.suggestions : [];
  const sugMap = new Map<string, Suggestion>();
  const sugOrder = isLocalNewer ? [...remoteSug, ...localSug] : [...localSug, ...remoteSug];
  for (const s of sugOrder) {
    if (s && s.id) sugMap.set(s.id, s);
  }
  const suggestions = Array.from(sugMap.values()).sort((a, b) => b.timestamp - a.timestamp);

  // Events:
  const localEvents = Array.isArray(local.events) ? local.events : [];
  const remoteEvents = Array.isArray(remote.events) ? remote.events : [];
  const eventMap = new Map<string, SchoolEvent>();
  const eventOrder = isLocalNewer ? [...remoteEvents, ...localEvents] : [...localEvents, ...remoteEvents];
  for (const ev of eventOrder) {
    if (ev && ev.id) eventMap.set(ev.id, ev);
  }
  const events = eventMap.size ? Array.from(eventMap.values()) : seed.events;

  // House Messages:
  const localHouseMsgs = Array.isArray(local.houseMessages) ? local.houseMessages : [];
  const remoteHouseMsgs = Array.isArray(remote.houseMessages) ? remote.houseMessages : [];
  const houseMsgMap = new Map<string, HouseMessage>();
  const houseMsgOrder = isLocalNewer ? [...remoteHouseMsgs, ...localHouseMsgs] : [...localHouseMsgs, ...remoteHouseMsgs];
  for (const hm of houseMsgOrder) {
    if (hm && hm.id) houseMsgMap.set(hm.id, hm);
  }
  const rawHouseMessages = Array.from(houseMsgMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 200);
  const houseMessages = rawHouseMessages.length > 0 ? rawHouseMessages : seed.houseMessages;

  // Council Messages (preserve local messages and soft-removals):
  const localCouncilMsgs = Array.isArray(local.councilMessages) ? local.councilMessages : [];
  const remoteCouncilMsgs = Array.isArray(remote.councilMessages) ? remote.councilMessages : [];
  const councilMsgMap = new Map<string, CouncilChatMessage>();
  for (const cm of [...localCouncilMsgs, ...remoteCouncilMsgs]) {
    if (!cm || !cm.id) continue;
    const prev = councilMsgMap.get(cm.id);
    if (prev && (prev.removed || cm.removed)) {
      councilMsgMap.set(cm.id, { ...prev, ...cm, removed: true, body: "" });
    } else {
      councilMsgMap.set(cm.id, cm);
    }
  }
  const councilMessages = Array.from(councilMsgMap.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-250);

  // Council Hub Members:
  const remoteHubMembers = Array.isArray(remote.councilHubMembers) ? remote.councilHubMembers : [];
  const localHubMembers = Array.isArray(local.councilHubMembers) ? local.councilHubMembers : [];
  const chosenHubMembers = isLocalNewer
    ? (localHubMembers.length ? localHubMembers : remoteHubMembers)
    : (remoteHubMembers.length ? remoteHubMembers : localHubMembers);
  const councilHubMembers =
    chosenHubMembers.length <= 1
      ? Array.from(new Set([...chosenHubMembers, ...seed.councilHubMembers]))
      : chosenHubMembers;

  // Gallery:
  const remoteGallery = Array.isArray(remote.gallery) ? remote.gallery : local.gallery;
  const gallery = remoteGallery.map((cloudItem) => {
    const localItem = local.gallery.find((item) => item.id === cloudItem.id);
    return { ...localItem, ...cloudItem, image: cloudItem.image || localItem?.image } as GalleryItem;
  });

  // Meetings & Resources:
  const localMeetings = Array.isArray(local.meetings) ? local.meetings : [];
  const remoteMeetings = Array.isArray(remote.meetings) ? remote.meetings : [];
  const meetingMap = new Map<string, Meeting>();
  const meetingOrder = isLocalNewer ? [...remoteMeetings, ...localMeetings] : [...localMeetings, ...remoteMeetings];
  for (const m of meetingOrder) {
    if (m && m.id) meetingMap.set(m.id, m);
  }
  const meetings = meetingMap.size ? Array.from(meetingMap.values()) : seed.meetings;

  const localResources = Array.isArray(local.resources) ? local.resources : [];
  const remoteResources = Array.isArray(remote.resources) ? remote.resources : [];
  const resourceMap = new Map<string, ResourceDoc>();
  const resourceOrder = isLocalNewer ? [...remoteResources, ...localResources] : [...localResources, ...remoteResources];
  for (const r of resourceOrder) {
    if (r && r.id) resourceMap.set(r.id, r);
  }
  const resources = resourceMap.size ? Array.from(resourceMap.values()) : (seed.resources ?? RESOURCES);

  const localDirOrder = Array.isArray(local.directoryOrder) && local.directoryOrder.length > 0 ? local.directoryOrder : null;
  const remoteDirOrder = Array.isArray(remote.directoryOrder) && remote.directoryOrder.length > 0 ? remote.directoryOrder : null;
  const directoryOrder = isLocalNewer
    ? (localDirOrder || remoteDirOrder || [])
    : (remoteDirOrder || localDirOrder || []);

  if (directoryOrder.length > 0) {
    try {
      localStorage.setItem("shristi_council_directory_order", JSON.stringify(directoryOrder));
    } catch {}
  }

  const lastModified = Math.max(localTime, remoteTime);

  return withFallbackSlices({
    ...local,
    ...remote,
    departments,
    directoryOrder,
    branding,
    houses,
    legal,
    users,
    tasks,
    meetings,
    resources,
    polls,
    suggestions,
    events,
    houseMessages,
    councilHubMembers,
    councilMessages,
    gallery,
    lastModified,
    session: local.session,
    theme: "dark",
  } as HubState, seed);
}

function loadState(): HubState {
  const seed = buildSeedState();
  const cachedBranding = loadCachedBranding();

  // Overlay custom branding directly onto seed state before any fallback,
  // ensuring the custom branding is active on the very first render (0ms)
  const baseSeed: HubState = cachedBranding
    ? {
        ...seed,
        branding: cachedBranding.branding ? { ...seed.branding, ...cachedBranding.branding } : seed.branding,
        houses: cachedBranding.houses ? { ...seed.houses, ...cachedBranding.houses } : seed.houses,
        legal: cachedBranding.legal ? { ...seed.legal, ...cachedBranding.legal } : seed.legal,
        lastModified: cachedBranding.savedAt || seed.lastModified,
      }
    : seed;

  try {
    const parsed = findStoredStateInAnyVersion();
    if (parsed && typeof parsed === "object") {
      const session = sessionStorage.getItem(SESSION_KEY);
      const parsedTime = Number(parsed.lastModified || 0);
      const cachedTime = Number(cachedBranding?.savedAt || 0);
      const preferCachedBranding = Boolean(cachedBranding && cachedTime >= parsedTime);
      const effectiveParsed = {
        ...parsed,
        users: validRoster(parsed.users) ? parsed.users : baseSeed.users,
        branding: preferCachedBranding && cachedBranding?.branding ? cachedBranding.branding : (parsed.branding || baseSeed.branding),
        houses: preferCachedBranding && cachedBranding?.houses ? cachedBranding.houses : (parsed.houses || baseSeed.houses),
        legal: preferCachedBranding && cachedBranding?.legal ? cachedBranding.legal : (parsed.legal || baseSeed.legal),
        departments: Array.isArray(parsed.departments) && parsed.departments.length > 0 ? parsed.departments : baseSeed.departments,
        lastModified: Math.max(parsedTime, cachedTime),
      };
      return { ...withFallbackSlices(effectiveParsed, baseSeed), session: session ? JSON.parse(session) : null };
    }
  } catch {}
  return { ...baseSeed, session: null };
}

export function HubProvider({ children, activeTab, setActiveTab }: {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (t: string) => void;
}) {
  const [state, baseDispatch] = useReducer(reducer, undefined, loadState);
  const sheets = useSheets();
  const [feedback, setFeedback] = useState<HubContextValue["feedback"]>(null);
  const [firebaseStatus, setFirebaseStatus] = useState<HubContextValue["firebaseStatus"]>(firebaseAuth.currentUser ? "connecting" : "signed-out");
  const [firebaseEmail, setFirebaseEmail] = useState<string | null>(firebaseAuth.currentUser?.email ?? null);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const stateRef = useRef(state);
  const seenBroadcastsRef = useRef(getNotifiedIds());
  const sessionStartTimeRef = useRef(Date.now());
  const cloudReadyRef = useRef(false);
  const cloudStateHashRef = useRef("");
  const applyingCloudRef = useRef(false);
  const cloudUnsubscribeRef = useRef<(() => void) | null>(null);
  const cloudBootstrappedRef = useRef(false);
  const lastLocalMutationAtRef = useRef(0);
  const rosterHashRef = useRef("");
  const activityHashRef = useRef("");
  const googleConnectionRef = useRef<Promise<void> | null>(null);
  useEffect(() => { stateRef.current = state; }, [state]);
  // Read inside the dispatch closure without re-creating it on every sheet refresh.
  const sheetOwnerRef = useRef(sheets.isEnabled);
  sheetOwnerRef.current = sheets.isEnabled;
  const announce = (text: string, tone: "success" | "error" = "success") => setFeedback({ id: Date.now(), text, tone });
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    tabSetter = setActiveTab;
    return () => { tabSetter = null; };
  }, [setActiveTab]);

  useEffect(() => {
    try {
      persistStateLocally(state);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
      persistBrandingToCache(state);
    } catch { announce("Storage is full or unavailable. Your latest changes are only saved in this tab.", "error"); }
  }, [state]);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    if (state.branding?.schoolName) {
      document.title = `${state.branding.schoolName} | ${state.branding.boardName || "Student Council"}`;
    }
    if (typeof document !== "undefined") {
      const logoUrl = (state.branding?.logoUrl || "").trim();
      try {
        if (logoUrl) {
          window.localStorage.setItem("shristi_branding_logo_v1", logoUrl);
        } else {
          window.localStorage.removeItem("shristi_branding_logo_v1");
        }
      } catch {}
      // Remove any multiple icon tags and only set the custom branding logo if provided
      const existingIcons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
      existingIcons.forEach((el) => el.parentNode?.removeChild(el));
      if (logoUrl) {
        const rels = ["icon", "shortcut icon", "apple-touch-icon"];
        rels.forEach((rel) => {
          const link = document.createElement("link");
          link.rel = rel;
          link.href = logoUrl;
          document.head.appendChild(link);
        });
      }
    }
  }, [state.branding?.schoolName, state.branding?.boardName, state.branding?.logoUrl]);

  useEffect(() => {
    const disconnect = connectBus((msg) => {
      if (msg.type === "state") {
        const incoming = msg.state as HubState;
        if (!incoming || !validRoster(incoming.users)) return;
        const next = { ...withFallbackSlices(incoming, buildSeedState()), session: stateRef.current.session, theme: stateRef.current.theme };
        stateRef.current = next;
        persistBrandingToCache(next);
        persistStateLocally(next);
        baseDispatch({ type: "REPLACE", state: next });
      }
      else if (msg.type === "ping") {
        if (!msg.targetDeviceId || msg.targetDeviceId === getOrGenerateDeviceId()) {
          chime(msg.urgent); 
          announce(`Diagnostic ping received from ${msg.senderName}.`); 
        }
      }
    });
    return disconnect;
  }, []);

  // Bootstrap site state from MongoDB immediately on load and sync on tab focus
  useEffect(() => {
    let active = true;

    const pullRemoteState = async (fresh = false) => {
      if (!active || applyingCloudRef.current) return;
      // Never let a background poll or file-picker focus event overwrite recent local edits/saves
      if (Date.now() - lastLocalMutationAtRef.current < 20000) return;
      try {
        const remote = await preloadRemoteState(fresh);
        if (!active || applyingCloudRef.current || Date.now() - lastLocalMutationAtRef.current < 20000) return;
        if (remote.exists && remote.state) {
          const next = mergeCloudState(stateRef.current, remote.state);
          const currentHash = mongoStateFingerprint(stateRef.current);
          const nextHash = mongoStateFingerprint(next);
          if (currentHash !== nextHash) {
            applyingCloudRef.current = true;
            stateRef.current = next;
            persistBrandingToCache(next);
            try {
              persistStateLocally(next);
            } catch {}
            cloudStateHashRef.current = nextHash;
            baseDispatch({ type: "REPLACE", state: next });
            queueMicrotask(() => { applyingCloudRef.current = false; });
            if (!cloudBootstrappedRef.current) {
              cloudBootstrappedRef.current = true;
              announce("Loaded site configuration from integrated MongoDB database.", "success");
            }
          }
        }
        if (active && (!remote.exists || !remote.state)) {
          const currentUser = stateRef.current.users.find((s) => s.id === stateRef.current.session?.userId);
          if (currentUser?.role === "admin" || isPrimaryAdmin(firebaseAuth.currentUser?.email ?? "")) {
            void saveRemoteState(stateRef.current, currentUser).catch(() => {});
          }
        }
        if (active && !cloudReadyRef.current) {
          cloudReadyRef.current = true;
        }
      } catch (err) {
        console.warn("MongoDB state sync notice:", err);
        if (active && !cloudReadyRef.current) {
          cloudReadyRef.current = true;
        }
      }
    };

    void pullRemoteState(false);

    // Background interval to pull changes across devices every 8 seconds (always fresh to avoid stale cache)
    const pollInterval = setInterval(() => { void pullRemoteState(true); }, 8000);

    // Immediate fresh sync when user switches back to tab (guarded by 20s local mutation lock)
    const handleVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        void pullRemoteState(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const dispatch = useMemo<React.Dispatch<Action>>(() => {
    const selfId = `device-${Math.random().toString(36).slice(2, 8)}`;
    const NON_CONTENT_ACTIONS = new Set([
      "REPLACE",
      "LOGIN",
      "LOGOUT",
      "SET_THEME",
      "RECORD_ACTIVITY",
      "PUSH_NOTIFICATION",
      "MARK_READ",
      "MARK_ALL_READ",
    ]);
    return (action: Action) => {
      const owned = SHEET_OWNED_ACTIONS[action.type];
      if (owned && sheetOwnerRef.current(owned.section)) {
        throw new Error(`${owned.label} are managed in Google Sheets. Add or edit the row in the spreadsheet and the hub will pick it up automatically.`);
      }
      const previous = stateRef.current;
      let next = reducer(previous, action);
      if (next !== previous && !NON_CONTENT_ACTIONS.has(action.type)) {
        const nowTs = Date.now();
        next = { ...next, lastModified: nowTs };
        lastLocalMutationAtRef.current = nowTs;
      }
      if (ADMIN_ACTIONS.has(action.type) && next !== previous) {
        const actor = previous.users.find((u) => u.id === previous.session?.userId);
        next = { ...next, audit: [{ id: uid(), action: action.type.toLowerCase().replace(/_/g, " "), actor: actor?.name ?? "Administrator", timestamp: Date.now() }, ...next.audit].slice(0, 100) };
      }
      stateRef.current = next;
      try {
        persistStateLocally(next);
        persistBrandingToCache(next);
      } catch {}
      baseDispatch({ type: "REPLACE", state: next });
      if (next !== previous && !NON_CONTENT_ACTIONS.has(action.type)) {
        queueMicrotask(() => postBus({ type: "state", state: { ...next, session: null }, senderId: selfId }));
      }
    };
  }, []);

  const resolveGoogleStudent = (email: string) => {
    const normalized = email.trim().toLowerCase();
    const direct = stateRef.current.users.find(
      (student) => student.email.toLowerCase() === normalized || student.aliases?.some((alias) => alias.toLowerCase() === normalized)
    );
    if (direct) return direct;
    if (isPrimaryAdmin(normalized)) {
      return stateRef.current.users.find((u) => u.id === PRIMARY_ADMIN_ID || u.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase());
    }
    // Match @gmail.com accounts whose username prefix matches student's institutional email username
    if (normalized.endsWith("@gmail.com")) {
      const username = normalized.replace("@gmail.com", "");
      const match = stateRef.current.users.find((student) => student.email.toLowerCase().replace(/@.*$/, "") === username);
      if (match) return match;
    }
    return undefined;
  };

  const connectAuthenticatedUser = async (googleEmail: string) => {
    const normalized = googleEmail.trim().toLowerCase();
    let student = resolveGoogleStudent(normalized);

    const checkAliasStatus = (candidate: Student | undefined) => {
      if (!candidate) return { isAlias: false, isVerified: false };
      const isAlias =
        candidate.email.toLowerCase() !== normalized &&
        (candidate.aliases ?? []).some((a) => a.toLowerCase() === normalized);
      const isVerified = !isAlias || (candidate.verifiedAliases ?? []).some((a) => a.toLowerCase() === normalized);
      return { isAlias, isVerified };
    };

    let aliasState = checkAliasStatus(student);
    if (!student || (aliasState.isAlias && !aliasState.isVerified)) {
      try {
        const freshRemote = await fetchRemoteState({ fresh: true });
        if (freshRemote.exists && freshRemote.state) {
          const next = mergeCloudState(stateRef.current, freshRemote.state);
          stateRef.current = next;
          baseDispatch({ type: "REPLACE", state: next });
          student = resolveGoogleStudent(normalized);
          aliasState = checkAliasStatus(student);
        }
      } catch {}
    }

    if (!student) {
      await signOutFirebase();
      throw new Error("This Google email is not linked to a student account. Ask an administrator to add it as a school or personal login email.");
    }

    if (aliasState.isAlias && !aliasState.isVerified) {
      await signOutFirebase();
      // Aliases are administrator-controlled identities. There is no self-service code
      // (the old 6-digit step was generated on the client, so it protected nothing);
      // an administrator confirms the alias on the roster instead.
      throw new Error(`ALIAS_NOT_CONFIRMED:${encodeURIComponent(normalized)}:${encodeURIComponent(student.email)}`);
    }

    // Instant UI dispatch: Log user in with zero delay
    dispatch({ type: "LOGIN", userId: student.id });
    setFirebaseEmail(normalized);
    setNeedsPasswordSetup(false);
    setFirebaseStatus("connected");

    // Profile provisioning is non-blocking and executes in the background
    void provisionFirebaseProfile(student, stateRef.current.users).catch((error) => {
      console.warn("Firestore profile provision notice:", error);
    });

    cloudUnsubscribeRef.current?.();
    cloudReadyRef.current = false;
    cloudUnsubscribeRef.current = subscribeCloudState(
      (remote) => {
        if (remote) {
          if (Date.now() - lastLocalMutationAtRef.current < 20000) return;
          applyingCloudRef.current = true;
          const next = mergeCloudState(stateRef.current, remote);
          stateRef.current = next;
          cloudStateHashRef.current = cloudStateFingerprint(next);
          baseDispatch({ type: "REPLACE", state: next });
          queueMicrotask(() => { applyingCloudRef.current = false; });
          // Self-heal hubState documents written before the Council Hub member list
          // existed: without the field the Firestore rules deny every hubChat read and
          // hubState write, so an administrator publishes the merged (complete) state.
          if (student.role === "admin" && remote.councilHubMembers === undefined) {
            void writeCloudState(stateRef.current).catch((error) => console.warn(`Council Hub member list auto-publish notice:`, error));
          }
          // First time this session pulls the saved cloud document: surface it so the
          // administrator can see that a freshly deployed version automatically adopted
          // the stored Firestore state instead of the default seed data.
          if (!cloudBootstrappedRef.current) {
            cloudBootstrappedRef.current = true;
            announce("Loaded your saved site data from Firestore. This version is now running on the stored cloud state.");
          }
        }
        cloudReadyRef.current = true;
        if (!remote && (student.role === "admin" || isPrimaryAdmin(normalized))) {
          rosterHashRef.current = JSON.stringify(stateRef.current.users.map((entry) => [entry.id, entry.email, entry.aliases, entry.name, entry.grade, entry.house, entry.role, entry.status, entry.councilTitle, entry.department]));
          cloudStateHashRef.current = cloudStateFingerprint(stateRef.current);
          void writeCloudState(stateRef.current).catch((error) => console.warn("Initial Firebase sync notice:", error));
        }
      },
      (error) => {
        console.warn("Firestore sync subscription notice:", error);
      },
    );
  };

  const ensureGoogleConnection = (email: string) => {
    if (googleConnectionRef.current) return googleConnectionRef.current;
    const connection = connectAuthenticatedUser(email).finally(() => {
      if (googleConnectionRef.current === connection) googleConnectionRef.current = null;
    });
    googleConnectionRef.current = connection;
    return connection;
  };

  const signInGoogle = async () => {
    setFirebaseStatus("connecting");
    try {
      const googleUser = await signInWithGoogle();
      if (!googleUser.email) throw new Error("Google did not provide an email address.");
      await ensureGoogleConnection(googleUser.email);
      setActiveTab(stateRef.current.users.find((student) => student.email === googleUser.email || student.aliases?.includes(googleUser.email!))?.role === "admin" ? "admin" : "dashboard");
      announce(`Signed in securely with Google as ${googleUser.email}.`);
    } catch (error) {
      setFirebaseStatus("error");
      throw error;
    }
  };

  const signInPassword = async (email: string, password: string) => {
    setFirebaseStatus("connecting");
    const normalized = email.trim().toLowerCase();
    const localStudent = stateRef.current.users.find(
      (s) =>
        s.name.toLowerCase() === normalized ||
        s.email.toLowerCase() === normalized ||
        s.aliases?.some((a) => a.toLowerCase() === normalized) ||
        s.id.toLowerCase() === normalized
    );

    try {
      const signedIn = await signInFirebasePassword(email, password);
      if (!signedIn.email) throw new Error("Firebase did not provide an email address.");
      await ensureGoogleConnection(signedIn.email);
      setNeedsPasswordSetup(false);
      const student = resolveGoogleStudent(signedIn.email.toLowerCase());
      setActiveTab(student?.role === "admin" ? "admin" : "dashboard");
      announce(`Signed in securely as ${signedIn.email}.`);
    } catch (error) {
      // Development-only offline fallback: the account's own password, never a shared
      // role password. Production sign-in is Firebase Authentication only, so no account
      // — least of all an administrator — can be opened by guessing a default.
      if (DEVELOPMENT_BUILD && localStudent?.password && localStudent.password === password) {
        dispatch({ type: "LOGIN", userId: localStudent.id });
        setFirebaseStatus("signed-out");
        setFirebaseEmail(null);
        setActiveTab(localStudent.role === "admin" ? "admin" : "dashboard");
        announce(`Signed in as ${localStudent.name} (development build).`);
        return;
      }
      setFirebaseStatus("error");
      if (!DEVELOPMENT_BUILD && error instanceof Error && "code" in error) {
        const code = String((error as { code?: string }).code ?? "");
        if (code.includes("operation-not-allowed")) {
          throw new Error("Password sign-in is not enabled for this Firebase project yet. Use “Sign in with Google”, or ask the administrator to enable Email/Password in Firebase Authentication.");
        }
        if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found") || code.includes("invalid-login-credentials")) {
          throw new Error("Email or password is incorrect. If you have never created a password, sign in with Google first and set one from Admin Panel → account security.");
        }
      }
      throw error;
    }
  };

  /**
   * Preview sign-in without a Firebase session. Development builds only: production code
   * refuses outright, so no shipped bundle can open an account this way. The login screen
   * renders a matching development-only panel.
   */
  const signInDirect = (userId: string) => {
    if (!DEVELOPMENT_BUILD) throw new Error("Preview sign-in is disabled on the live platform.");
    const student = stateRef.current.users.find((u) => u.id === userId);
    if (!student) throw new Error("Account not found.");
    dispatch({ type: "LOGIN", userId: student.id });
    setFirebaseStatus("signed-out");
    setFirebaseEmail(null);
    setActiveTab(student.role === "admin" ? "admin" : "dashboard");
    announce(`Signed in as ${student.name} (development build).`);
  };

  const createAccountPassword = async (password: string) => {
    const currentEmail = firebaseAuth.currentUser?.email?.toLowerCase();
    if (!currentEmail) throw new Error("Verify your school Google account first.");
    const student = resolveGoogleStudent(currentEmail);
    if (!student) throw new Error("This Google email is not linked to the roster.");
    await createFirebasePassword(student, password);
    setNeedsPasswordSetup(false);
    announce("Your password was created. You can now sign in with your school email and password.");
  };

  const setHouseMembership = async (house: House, accountId: string, include: boolean) => {
    const current = stateRef.current.users.find((student) => student.id === stateRef.current.session?.userId);
    if (current?.role !== "admin") throw new Error("Only an administrator can manage house hub members.");
    const account = stateRef.current.users.find((student) => student.id === accountId);
    if (!account) throw new Error("That account no longer exists in the roster.");
    if (account.role === "grade") throw new Error("Class accounts cannot be added to a house hub.");
    dispatch({ type: "SET_HOUSE_MEMBERSHIP", house, accountId, include });
  };

  const saveStateToDatabase = async () => {
    const current = stateRef.current.users.find((student) => student.id === stateRef.current.session?.userId);
    const isAdminOrCouncil =
      current?.role === "admin" ||
      current?.role === "council" ||
      isPrimaryAdmin(firebaseAuth.currentUser?.email ?? "");
    if (!isAdminOrCouncil) throw new Error("Administrator access is required to save site data.");

    const nowTs = Date.now();
    lastLocalMutationAtRef.current = nowTs;
    const updatedState: HubState = { ...stateRef.current, lastModified: nowTs };
    stateRef.current = updatedState;
    persistBrandingToCache(updatedState);
    persistStateLocally(updatedState);

    const saved = await saveRemoteState(updatedState, current);
    const finalTs = Number(saved.version || nowTs);
    lastLocalMutationAtRef.current = Date.now();
    stateRef.current = { ...stateRef.current, lastModified: finalTs };
    persistBrandingToCache(stateRef.current);
    persistStateLocally(stateRef.current);
    cloudStateHashRef.current = mongoStateFingerprint(stateRef.current);

    // Optional Firestore best-effort sync if signed in with Google
    if (firebaseAuth.currentUser && (current?.role === "admin" || isPrimaryAdmin(firebaseAuth.currentUser.email ?? ""))) {
      void writeCloudState(stateRef.current).catch(() => {});
      void syncCloudRoster(stateRef.current.users).catch(() => {});
    }

    announce("All site data including branding, houses, roster, tasks, and settings saved to MongoDB.", "success");
  };

  const loadStateFromDatabase = async () => {
    const current = stateRef.current.users.find((student) => student.id === stateRef.current.session?.userId);
    const isAdmin = current?.role === "admin" || isPrimaryAdmin(firebaseAuth.currentUser?.email ?? "");
    if (!isAdmin) throw new Error("Administrator access is required to load site data.");

    const remote = await fetchRemoteState({ fresh: true });
    if (!remote.exists || !remote.state) {
      throw new Error("No saved site state document was found in MongoDB database.");
    }

    applyingCloudRef.current = true;
    const next = mergeCloudState(stateRef.current, remote.state);
    stateRef.current = next;
    persistBrandingToCache(next);
    try {
      persistStateLocally(next);
    } catch {}
    cloudStateHashRef.current = mongoStateFingerprint(next);
    baseDispatch({ type: "REPLACE", state: next });
    queueMicrotask(() => { applyingCloudRef.current = false; });
    announce("Site data was successfully loaded from MongoDB database.", "success");
  };

  const uploadAllToFirestore = saveStateToDatabase;
  const loadAllFromFirestore = loadStateFromDatabase;

  const signOutSession = async () => {
    cloudUnsubscribeRef.current?.();
    cloudUnsubscribeRef.current = null;
    cloudReadyRef.current = false;
    cloudBootstrappedRef.current = false;
    if (firebaseAuth.currentUser) await signOutFirebase();
    dispatch({ type: "LOGOUT" });
    setFirebaseStatus("signed-out");
    setFirebaseEmail(null);
    setNeedsPasswordSetup(false);
  };

  useEffect(() => observeFirebaseAuth((googleUser) => {
    setFirebaseEmail(googleUser?.email ?? null);
    if (!googleUser?.email) {
      setFirebaseStatus("signed-out");
      cloudUnsubscribeRef.current?.();
      cloudUnsubscribeRef.current = null;
      setNeedsPasswordSetup(false);
      return;
    }
    setFirebaseStatus("connected");
    // Only connect if user is already in an active session, NEVER automatically
    // log the user in on opening the webapp without clicking a button.
    if (stateRef.current.session) {
      void ensureGoogleConnection(googleUser.email).catch((error) => {
        setFirebaseStatus("error");
        announce(error instanceof Error ? error.message : "Google authentication sync notice.", "error");
      });
    }
  }), []);

  useEffect(() => {
    if (state.session?.userId) {
      const currentStudent = state.users.find((u) => u.id === state.session?.userId);
      const now = Date.now();
      if (currentStudent && (!currentStudent.lastActive || now - currentStudent.lastActive > 120000)) {
        baseDispatch({ type: "RECORD_ACTIVITY", userId: currentStudent.id, timestamp: now });
      }
    }
  }, [state.session?.userId, state.users]);

  useEffect(() => {
    let active = true;
    let lastPollTime = Date.now() - 30000;

    const pollServerBroadcasts = async () => {
      try {
        const res = await fetch(`/api/notifications/recent?since=${lastPollTime}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.broadcasts && Array.isArray(data.broadcasts)) {
          data.broadcasts.forEach((b: { id: string; title: string; body: string; urgent?: boolean; actionTab?: string; audience?: Audience; senderName?: string; timestamp?: number; targetDeviceId?: string }) => {
            if (!seenBroadcastsRef.current.has(b.id)) {
              seenBroadcastsRef.current.add(b.id);
              dispatch({
                type: "PUSH_NOTIFICATION",
                notification: {
                  id: b.id,
                  title: b.title,
                  body: b.body,
                  urgent: Boolean(b.urgent),
                  actionTab: b.actionTab || "dashboard",
                  audience: b.audience || { kind: "all" },
                  senderName: b.senderName || "Council",
                  senderRole: "admin",
                  timestamp: Number(b.timestamp) || Date.now(),
                  readBy: [],
                  kind: "broadcast",
                },
              });
              const isFresh = !hasBeenNotified(b.id) && Number(b.timestamp || 0) >= sessionStartTimeRef.current - 1500;
              if (isFresh && (!b.targetDeviceId || b.targetDeviceId === getOrGenerateDeviceId())) {
                void triggerOSNotification({
                  title: b.title,
                  body: b.body,
                  urgent: Boolean(b.urgent),
                  actionTab: b.actionTab || "dashboard",
                  tag: b.id
                });
              }
            }
          });
        }
        lastPollTime = Date.now() - 5000;
      } catch {}
    };

    const interval = setInterval(() => {
      if (active) void pollServerBroadcasts();
    }, 2500);
    void pollServerBroadcasts();

    let unsubBroadcasts = () => {};
    let unsubInbox = () => {};

    if (firebaseStatus === "connected" && firebaseAuth.currentUser) {
      unsubBroadcasts = subscribeCloudBroadcasts(
        (notification) => {
          if (!seenBroadcastsRef.current.has(notification.id)) {
            seenBroadcastsRef.current.add(notification.id);
            dispatch({ type: "PUSH_NOTIFICATION", notification });
            const isFresh = !notification.isHistorical && !hasBeenNotified(notification.id) && Number(notification.timestamp || 0) >= sessionStartTimeRef.current - 1500;
            if (isFresh && (!notification.targetDeviceId || notification.targetDeviceId === getOrGenerateDeviceId())) {
              void triggerOSNotification({
                title: notification.title,
                body: notification.body,
                urgent: notification.urgent,
                actionTab: notification.actionTab || "dashboard",
                tag: notification.id
              });
            }
          }
        },
        () => undefined
      );
      unsubInbox = subscribeFirebaseInbox(
        (notification) => {
          if (!seenBroadcastsRef.current.has(notification.id)) {
            seenBroadcastsRef.current.add(notification.id);
            dispatch({ type: "PUSH_NOTIFICATION", notification });
            const isFresh = !notification.isHistorical && !hasBeenNotified(notification.id) && Number(notification.timestamp || 0) >= sessionStartTimeRef.current - 1500;
            if (isFresh && (!notification.targetDeviceId || notification.targetDeviceId === getOrGenerateDeviceId())) {
              void triggerOSNotification({
                title: notification.title,
                body: notification.body,
                urgent: notification.urgent,
                actionTab: notification.actionTab || "dashboard",
                tag: notification.id
              });
            }
          }
        },
        // A denied listener must not break the session; the local inbox keeps working.
        () => undefined
      );
    }

    return () => {
      active = false;
      clearInterval(interval);
      unsubBroadcasts();
      unsubInbox();
    };
  }, [firebaseStatus, dispatch]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void subscribeForegroundMessages((payload) => {
      const title = payload.notification?.title ?? payload.data?.title ?? "New council notification";
      announce(title);
      chime(payload.data?.urgent === "true");
    }).then((stop) => { unsubscribe = stop; });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    // Flush any offline queued notifications held in Service Worker IndexedDB
    void flushServiceWorkerNotificationQueue();

    // Listen to background sync / persistent SW channel messages
    const unsubscribeSW = listenToServiceWorkerNotifications((notification) => {
      dispatch({ type: "PUSH_NOTIFICATION", notification });
      chime(notification.urgent);
    });

    return () => {
      unsubscribeSW();
    };
  }, [dispatch]);

  useEffect(() => {
    if (applyingCloudRef.current) return;
    const currentUser = state.users.find((student) => student.id === state.session?.userId);
    const isAdmin = currentUser?.role === "admin" || isPrimaryAdmin(firebaseAuth.currentUser?.email ?? "");
    const isCouncil = currentUser?.role === "council";

    if (isAdmin || isCouncil) {
      const stateHash = mongoStateFingerprint(state);
      if (stateHash === cloudStateHashRef.current) return;
      const timer = setTimeout(() => {
        cloudStateHashRef.current = stateHash;
        void saveRemoteState(state, currentUser).catch((error) => {
          cloudStateHashRef.current = "";
          console.warn("MongoDB auto-sync write notice:", error);
        });
        // Optional best-effort sync to Firestore if administrator has Google session
        if (isAdmin && firebaseAuth.currentUser && isPrimaryAdmin(firebaseAuth.currentUser.email ?? "")) {
          void writeCloudState(state).catch(() => {});
          void syncCloudRoster(state.users).catch(() => {});
        }
      }, 350);
      return () => clearTimeout(timer);
    } else if (currentUser) {
      const activityHash = JSON.stringify({
        events: state.events.map((event) => [event.id, event.attendees.includes(currentUser.id)]),
        polls: state.polls.map((poll) => [poll.id, poll.voters.includes(currentUser.id), poll.votes]),
        rating: state.siteRatings.find((rating) => rating.userId === currentUser.id),
        suggestions: state.suggestions.filter((suggestion) => suggestion.authorId === currentUser.id || suggestion.authorLabel === `${currentUser.name} · Grade ${currentUser.grade}`),
        read: state.notifications.filter((notification) => notification.readBy.includes(currentUser.id)).map((notification) => notification.id),
        tasks: state.tasks.filter((task) => task.assigneeId === currentUser.id).map((task) => [task.id, task.status]),
        houseMessages: state.houseMessages.filter((m) => m.authorId === currentUser.id).map((m) => [m.id, m.body]),
        councilMessages: state.councilMessages.filter((m) => m.authorId === currentUser.id).map((m) => [m.id, m.body, m.removed]),
        avatarUrl: currentUser.avatarUrl ?? null,
      });
      if (activityHash === activityHashRef.current) return;
      activityHashRef.current = activityHash;
      const timer = setTimeout(() => {
        void syncRemoteUserActivity(currentUser, state).catch((error) => {
          console.warn("MongoDB student activity sync notice:", error);
        });
        if (firebaseAuth.currentUser) {
          void syncFirebaseUserActivity(state).catch(() => {});
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const sessionUserId = state.session?.userId;
  const user = sessionUserId
    ? state.users.find((u) => u.id === sessionUserId && u.status === "active") ?? null
    : null;
  const canManage = !!user && (user.role === "admin" || user.role === "council");
  const hasPermission = (feature: string) => !!user && (user.role === "admin" || (user.role === "council" && (state.permissions[user.id] ?? []).includes(feature)));
  const devices = useLocalPresence(user);

  // House points, calendar, and finance come from Google Sheets when it is configured;
  // otherwise the hub keeps using its own stored data exactly as before.
  const houseTotals = useMemo(() => {
    if (sheets.housePoints) return { ...sheets.housePoints.totals };
    const totals: Record<House, number> = { Blue: 0, Red: 0, Green: 0 };
    state.pointsLedger.forEach((e) => { totals[e.house] += e.delta; });
    return totals;
  }, [sheets.housePoints, state.pointsLedger]);
  // House Points is spreadsheet-owned (the single source of truth); Calendar and
  // Finances are managed directly within the hub.
  const pointsLedger = sheets.housePoints ? [] : state.pointsLedger;
  const calendarEvents = sheets.calendar ? sheets.calendar.events : state.events;
  const financeEntries = sheets.finances ? sheets.finances.entries : state.finances;

  const unreadCount = useMemo(() => {
    if (!user) return 0;
    return state.notifications.filter((n) => targetsUser(n.audience, user) && !n.readBy.includes(user.id)).length;
  }, [state.notifications, user]);

  const notify = (n: Omit<AppNotification, "id" | "timestamp" | "readBy" | "kind">) => {
    dispatch({ type: "PUSH_NOTIFICATION", notification: { ...n, id: uid(), timestamp: Date.now(), readBy: [], kind: "system" } });
  };

  return (
    <HubContext.Provider value={{ state, dispatch, user, canManage, activeTab, setActiveTab, houseTotals, pointsLedger, calendarEvents, financeEntries, sheets, unreadCount, notify, feedback, announce, hasPermission, devices, firebaseStatus, firebaseEmail, needsPasswordSetup, createAccountPassword, setHouseMembership, signInGoogle, signInPassword, signInDirect, saveStateToDatabase, loadStateFromDatabase, uploadAllToFirestore, loadAllFromFirestore, signOutSession }}>
      {children}
    </HubContext.Provider>
  );
}

export function useHub() {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error("useHub must be used within HubProvider");
  return ctx;
}

export { TAB_KEY };

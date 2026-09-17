import {
  createContext, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type ReactNode,
} from "react";
import type {
  Audience, FinanceEntry, GalleryItem, HubState, Meeting, CouncilTask,
  AppNotification, PointEntry, Poll, SchoolEvent, Student, Suggestion,
  Announcement, Role, House, BroadcastRecord, HouseMessage, CouncilChatMessage,
} from "../lib/types";
import { buildSeedState, HOUSES, HOUSE_LABELS } from "../lib/seed";
import { connectBus, postBus, chime } from "../lib/realtime";
import {
  adminResetStudentCredentials,
  adminUpdateRosterRecord,
  canonicalGradeFromNumber,
} from "../lib/ssot-auth";
import { FEATURE_PERMISSIONS, PRIMARY_ADMIN_ID } from "../lib/admin";
import {
  addCouncilMember,
  addCouncilMessage,
  removeCouncilMember,
  removeCouncilMessage,
} from "../lib/council";
import { useLocalPresence, type ConnectedDevice } from "../lib/presence";
import {
  firebaseAuth,
  cloudStateFingerprint,
  createFirebasePassword,
  observeFirebaseAuth,
  provisionFirebaseProfile,
  readCloudState,
  firebaseUserHasPassword,
  signInFirebasePassword,
  signInWithGoogle,
  signOutFirebase,
  subscribeFirebaseInbox,
  subscribeCloudState,
  subscribeForegroundMessages,
  syncCloudRoster,
  syncFirebaseUserActivity,
  writeCloudState,
} from "../lib/firebase-client";

// Bumped when the school-provided roster replaced the earlier sample dataset.
const STORAGE_KEY = "shristi-council-school-roster-v5";
const SESSION_KEY = "shristi-preview-session-v3";
const TAB_KEY = "shristi-council-tab-v3";

export const uid = () => `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function audienceLabel(a: Audience): string {
  switch (a.kind) {
    case "all": return "All Students";
    case "role": return a.role === "council" ? "Council Only" : a.role === "admin" ? "Admins Only" : "Students Only";
    case "user": return a.name ? a.name : "One student";
    case "house": return `${a.house} House`;
    case "grade": return `Grade ${a.grade}`;
  }
}

export function targetsUser(a: Audience, user: Student): boolean {
  switch (a.kind) {
    case "all": return true;
    case "role": return user.role === a.role || (a.role === "council" && user.role === "admin");
    case "user": return user.id === a.userId;
    case "house": return user.house === a.house;
    case "grade": return user.grade === a.grade;
  }
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
  | { type: "ADD_SUGGESTION"; suggestion: Suggestion }
  | { type: "REVIEW_SUGGESTION"; suggestionId: string; status: Suggestion["status"]; response: string; responderName: string }
  | { type: "VOTE"; pollId: string; optionIndex: number; userId: string }
  | { type: "ADD_POLL"; poll: Poll; notification: AppNotification }
  | { type: "ADD_MEETING"; meeting: Meeting }
  | { type: "SAVE_MINUTES"; meetingId: string; minutes: string }
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
  | { type: "SET_BRANDING"; branding: HubState["branding"] }
  | { type: "SET_LEGAL"; legal: HubState["legal"] }
  | { type: "SET_HOUSE_BRANDING"; house: House; name: string; logoUrl: string }
  | { type: "SUBMIT_RATING"; userId: string; userName: string; house: House; value: number; comment: string }
  | { type: "SET_HOUSE_CAPTAIN"; house: House; userId: string }
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
  | { type: "SET_AVATAR"; userId: string; url: string }
  | { type: "SET_ACTIVE_IMAGE"; imageId: string; active: boolean }
  | { type: "DELEGATE_TASK"; taskId: string; assigneeId: string; department: string }
  | { type: "BROADCAST"; record: BroadcastRecord; notification: AppNotification };

const ADMIN_ACTIONS = new Set(["APPOINT_COUNCIL", "REMOVE_COUNCIL", "EDIT_STUDENT", "RESET_PASSWORD", "RESET_ACTIVATION", "ADD_DEPARTMENT", "DELETE_DEPARTMENT", "SET_PERMISSIONS", "SET_DEPARTMENT", "DELEGATE_TASK", "ADD_STUDENT", "DELETE_STUDENT", "ADD_STUDENT_EMAIL", "REMOVE_STUDENT_EMAIL", "SET_BRANDING", "SET_LEGAL", "SET_HOUSE_CAPTAIN", "ADD_EVENT_TYPE", "DELETE_EVENT_TYPE", "SET_HOUSE_BRANDING", "ADD_COUNCIL_HUB_MEMBER", "REMOVE_COUNCIL_HUB_MEMBER"]);
const ACTION_FEATURES: Record<string, string> = {
  AWARD_POINTS: "houses", ADD_EVENT: "events", TOGGLE_ATTENDANCE: "events", ADD_ANNOUNCEMENT: "events",
  UPDATE_EVENT: "events", DELETE_EVENT: "events",
  ADD_TASK: "tasks", MOVE_TASK: "tasks", REVIEW_SUGGESTION: "voice", ADD_POLL: "voice",
  ADD_MEETING: "meetings", SAVE_MINUTES: "meetings", ADD_TRANSACTION: "finances",
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
  };
}

function reducer(state: HubState, action: Action): HubState {
  const actor = state.users.find((u) => u.id === state.session?.userId);
  if (ADMIN_ACTIONS.has(action.type) && actor?.role !== "admin") throw new Error("Only an administrator can make this change.");
  const feature = ACTION_FEATURES[action.type];
  if (feature && actor?.role !== "admin" && !(actor?.role === "council" && state.permissions[actor.id]?.includes(feature))) {
    throw new Error("Your council account does not have permission for this action.");
  }
  if (action.type === "POST_HOUSE_MESSAGE" && actor?.role !== "admin" && state.houseCaptains[action.message.house] !== actor?.id) {
    throw new Error("Only the house captain or an administrator can post to this house hub.");
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
      return { ...state, permissions: account.role === "council" && !state.permissions[account.id] ? { ...state.permissions, [account.id]: FEATURE_PERMISSIONS.map((p) => p.id) } : state.permissions, users: state.users.map((u) => u.id === account.id ? { ...u, status: "active" } : u), session: { userId: account.id, token: `local-preview-${uid()}` } };
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
        tasks: [action.task, ...state.tasks],
        notifications: action.notification ? [action.notification, ...state.notifications].slice(0, 60) : state.notifications,
      };
    case "MOVE_TASK":
      if (actor?.role !== "admin" && !state.tasks.some((task) => task.id === action.taskId && task.assigneeId === actor?.id)) throw new Error("Only the assigned officer or an administrator can update this task.");
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.taskId ? { ...t, status: action.status } : t)),
      };
    case "ADD_SUGGESTION":
      return { ...state, suggestions: [action.suggestion, ...state.suggestions] };
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
          if (p.id !== action.pollId || p.voters.includes(action.userId) || p.expires < new Date().toISOString().slice(0, 10) || action.optionIndex < 0 || action.optionIndex >= p.options.length || actor?.id !== action.userId || !targetsUser(p.audience, actor)) return p;
          return { ...p, votes: p.votes.map((v, i) => (i === action.optionIndex ? v + 1 : v)), voters: [...p.voters, action.userId] };
        }),
      };
    case "ADD_POLL":
      return {
        ...state,
        polls: [action.poll, ...state.polls],
        notifications: [action.notification, ...state.notifications].slice(0, 60),
      };
    case "ADD_MEETING":
      return { ...state, meetings: [action.meeting, ...state.meetings] };
    case "SAVE_MINUTES":
      return { ...state, meetings: state.meetings.map((m) => (m.id === action.meetingId ? { ...m, minutes: action.minutes } : m)) };
    case "ADD_TRANSACTION":
      return { ...state, finances: [action.entry, ...state.finances] };
    case "ADD_PHOTO":
      return { ...state, gallery: [action.item, ...state.gallery] };
    case "APPOINT_COUNCIL":
      if (action.userId === PRIMARY_ADMIN_ID) throw new Error("The primary administrator's appointment is protected.");
      if (!state.departments.includes(action.department)) throw new Error("Select a current council department.");
      return {
        ...state,
        permissions: { ...state.permissions, [action.userId]: state.permissions[action.userId] ?? FEATURE_PERMISSIONS.map((p) => p.id) },
        users: state.users.map((u) =>
          u.id === action.userId ? { ...u, role: "council" as Role, councilPost: action.post, councilTitle: action.post, department: action.department } : u
        ),
      };
    case "REMOVE_COUNCIL":
      if (action.userId === PRIMARY_ADMIN_ID) throw new Error("The primary administrator cannot be removed.");
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === action.userId ? { ...u, role: "student" as Role, councilPost: undefined, councilTitle: undefined, department: undefined } : u
        ),
      };
    case "EDIT_STUDENT": {
      const actor = state.session ? state.users.find((u) => u.id === state.session!.userId) : null;
      const target = state.users.find((u) => u.id === action.userId);
      if (!actor || !target) return state;
      if (target.id === PRIMARY_ADMIN_ID && (action.name !== target.name || action.grade !== 9 || action.house !== "Red")) throw new Error("The primary administrator's identity is protected.");
      if (action.house === null && target.role !== "teacher") throw new Error("Only teacher accounts may have no house.");
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
        throw new Error("A student account is already using this email address.");
      }
      if (state.users.some((u) => u.id === action.student.id)) throw new Error("This student ID is already in use.");
      if (!action.student.name.trim()) throw new Error("Enter the student's full name.");
      return { ...state, users: [...state.users, { ...action.student, email, aliases: action.student.aliases ?? [] }] };
    }
    case "ADD_STUDENT_EMAIL": {
      const target = state.users.find((u) => u.id === action.userId);
      if (!target) throw new Error("Student account not found.");
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
    case "REMOVE_STUDENT_EMAIL": {
      const target = state.users.find((u) => u.id === action.userId);
      if (!target) throw new Error("Student account not found.");
      const email = action.email.trim().toLowerCase();
      const currentAliases = target.aliases ?? [];
      const isPrimary = target.email.toLowerCase() === email;
      if (isPrimary) {
        throw new Error("The primary school email cannot be removed. Personal emails are optional sign-in aliases only.");
      }
      return {
        ...state,
        users: state.users.map((u) => (u.id === action.userId ? { ...u, aliases: currentAliases.filter((a) => a.toLowerCase() !== email) } : u)),
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
        polls: state.polls.map((p) => ({ ...p, voters: p.voters.filter((id) => id !== action.userId) })),
      };
    }
    case "SET_BRANDING": {
      const branding = action.branding;
      if (!branding.schoolName.trim() || !branding.boardName.trim()) throw new Error("A council name and board line are required.");
      if (branding.logoUrl && !/^(https:\/\/|data:image\/(jpeg|png|webp|svg\+xml);)/.test(branding.logoUrl)) throw new Error("Use an HTTPS image link or an uploaded logo file.");
      return { ...state, branding: { ...branding, schoolName: branding.schoolName.trim(), boardName: branding.boardName.trim() } };
    }
    case "SET_LEGAL":
      if (!action.legal.terms.trim() || !action.legal.credits.trim()) throw new Error("Both the terms and credits pages need content.");
      return { ...state, legal: { terms: action.legal.terms, credits: action.legal.credits } };
    case "SET_HOUSE_BRANDING": {
      const name = action.name.trim();
      if (name.length < 2 || name.length > 30) throw new Error("House names must be 2 to 30 characters.");
      if (!HOUSES.includes(action.house)) throw new Error("Choose an official school house.");
      if (action.logoUrl && !/^(https:\/\/|data:image\/(jpeg|png|webp|svg\+xml);)/.test(action.logoUrl)) throw new Error("Use an HTTPS image link or an uploaded logo file.");
      return { ...state, houses: { ...state.houses, [action.house]: { name, logoUrl: action.logoUrl } } };
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
    case "SET_AVATAR":
      if (actor?.role !== "admin" && actor?.id !== action.userId) throw new Error("You can only change your own profile picture.");
      if (!/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/.test(action.url)) throw new Error("Use a valid HTTPS image or uploaded photo.");
      return { ...state, users: state.users.map((u) => u.id === action.userId ? { ...u, avatarUrl: action.url } : u) };
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
        notifications: [action.notification, ...state.notifications].slice(0, 60),
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
  unreadCount: number;
  notify: (n: Omit<AppNotification, "id" | "timestamp" | "readBy" | "kind">) => void;
  feedback: { id: number; text: string; tone: "success" | "error" } | null;
  announce: (text: string, tone?: "success" | "error") => void;
  switchDemoRole: (role: Role) => void;
  hasPermission: (feature: string) => boolean;
  devices: ConnectedDevice[];
  firebaseStatus: "signed-out" | "connecting" | "connected" | "error";
  firebaseEmail: string | null;
  signInGoogle: () => Promise<void>;
  uploadAllToFirestore: () => Promise<void>;
  loadAllFromFirestore: () => Promise<void>;
  signOutSession: () => Promise<void>;
}

const HubContext = createContext<HubContextValue | null>(null);

let tabSetter: ((t: string) => void) | null = null;
export function navigateTab(tab: string) {
  tabSetter?.(tab);
}

function validRoster(users: Student[]): boolean {
  if (!Array.isArray(users) || !users.length) return false;
  if (new Set(users.map((u) => u.id)).size !== users.length) return false;
  if (!users.some((u) => u.id === PRIMARY_ADMIN_ID && u.role === "admin" && u.name === "Arnab Shrestha")) return false;
  const everyEmail = users.flatMap((u) => [u.email, ...(u.aliases ?? [])]).map((email) => email.toLowerCase());
  if (new Set(everyEmail).size !== everyEmail.length) return false;
  return users.every((u) => {
    if (typeof u.name !== "string" || !u.name.trim().length) return false;
    if (typeof u.email !== "string" || !u.email.toLowerCase().endsWith("@shristiacademy.edu.np")) return false;
    if (!(u.aliases ?? []).every((email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email))) return false;
    if (!["admin", "council", "student", "teacher"].includes(u.role)) return false;
    if (!["active", "pending"].includes(u.status)) return false;
    if (u.role === "teacher") {
      // Teachers may optionally belong to a class and a house.
      const validGrade = u.grade === null || (Number.isInteger(u.grade) && u.grade >= 1 && u.grade <= 10);
      const validHouse = u.house === null || HOUSES.includes(u.house);
      return validGrade && validHouse && u.gradeLabel === (u.grade === null ? null : `Grade ${u.grade}`) && u.houseLabel === (u.house === null ? null : `${u.house} House`);
    }
    if (!Number.isInteger(u.grade) || u.grade === null || u.grade < 1 || u.grade > 10) return false;
    if (u.house === null) return false;
    return HOUSES.includes(u.house) && u.gradeLabel === `Grade ${u.grade}` && u.houseLabel === `${u.house} House`;
  });
}

function withFallbackSlices(parsed: HubState, seed: HubState): HubState {
  return {
    ...seed,
    ...parsed,
    councilHubMembers: parsed.councilHubMembers ?? seed.councilHubMembers,
    councilMessages: parsed.councilMessages ?? seed.councilMessages,
    departments: parsed.departments?.length ? parsed.departments : seed.departments,
    permissions: parsed.permissions ?? seed.permissions,
    activeImageIds: parsed.activeImageIds ?? seed.activeImageIds,
    audit: parsed.audit ?? [],
    branding: parsed.branding ?? seed.branding,
    legal: parsed.legal ?? seed.legal,
    eventTypes: parsed.eventTypes?.length ? parsed.eventTypes : seed.eventTypes,
    houseCaptains: parsed.houseCaptains ?? seed.houseCaptains,
    houseMessages: parsed.houseMessages ?? seed.houseMessages,
    houses: parsed.houses ?? seed.houses,
    siteRatings: parsed.siteRatings ?? seed.siteRatings,
  };
}

function mergeCloudState(local: HubState, remote: Partial<HubState>): HubState {
  const remoteUsers = Array.isArray(remote.users) ? remote.users : [];
  const users = remoteUsers.length ? remoteUsers.map((cloudUser) => {
    const localUser = local.users.find((student) => student.id === cloudUser.id);
    return {
      ...localUser,
      ...cloudUser,
      password: localUser?.password ?? "student123",
      passwordHash: localUser?.passwordHash ?? "firebase-auth",
      aliases: cloudUser.aliases ?? localUser?.aliases ?? [],
    } as Student;
  }) : local.users;
  const remoteGallery = Array.isArray(remote.gallery) ? remote.gallery : local.gallery;
  const gallery = remoteGallery.map((cloudItem) => {
    const localItem = local.gallery.find((item) => item.id === cloudItem.id);
    return { ...localItem, ...cloudItem, image: cloudItem.image || localItem?.image } as GalleryItem;
  });
  return withFallbackSlices({ ...local, ...remote, users, gallery, session: local.session, theme: local.theme } as HubState, buildSeedState());
}

function loadState(): HubState {
  const seed = buildSeedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HubState;
      if (parsed && validRoster(parsed.users)) {
        const session = sessionStorage.getItem(SESSION_KEY);
        return { ...withFallbackSlices(parsed, seed), session: session ? JSON.parse(session) : null };
      }
    }
  } catch {}
  return { ...seed, session: null };
}

export function HubProvider({ children, activeTab, setActiveTab }: {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (t: string) => void;
}) {
  const [state, baseDispatch] = useReducer(reducer, undefined, loadState);
  const [feedback, setFeedback] = useState<HubContextValue["feedback"]>(null);
  const [firebaseStatus, setFirebaseStatus] = useState<HubContextValue["firebaseStatus"]>(firebaseAuth.currentUser ? "connecting" : "signed-out");
  const [firebaseEmail, setFirebaseEmail] = useState<string | null>(firebaseAuth.currentUser?.email ?? null);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const stateRef = useRef(state);
  const cloudReadyRef = useRef(false);
  const cloudStateHashRef = useRef("");
  const applyingCloudRef = useRef(false);
  const cloudUnsubscribeRef = useRef<(() => void) | null>(null);
  const rosterHashRef = useRef("");
  const activityHashRef = useRef("");
  const googleConnectionRef = useRef<Promise<void> | null>(null);
  useEffect(() => { stateRef.current = state; }, [state]);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, session: null }));
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
    } catch { announce("Storage is full or unavailable. Your latest changes are only saved in this tab.", "error"); }
  }, [state]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
  }, [state.theme]);

  useEffect(() => {
    const disconnect = connectBus((msg) => {
      if (msg.type === "state") {
        const incoming = msg.state as HubState;
        if (!incoming || !validRoster(incoming.users)) return;
        const next = { ...withFallbackSlices(incoming, buildSeedState()), session: stateRef.current.session, theme: stateRef.current.theme };
        stateRef.current = next;
        baseDispatch({ type: "REPLACE", state: next });
      }
      else if (msg.type === "ping") { chime(msg.urgent); announce(`Diagnostic ping received from ${msg.senderName}.`); }
    });
    return disconnect;
  }, []);

  const dispatch = useMemo<React.Dispatch<Action>>(() => {
    const selfId = `device-${Math.random().toString(36).slice(2, 8)}`;
    return (action: Action) => {
      const previous = stateRef.current;
      let next = reducer(previous, action);
      if (ADMIN_ACTIONS.has(action.type) && next !== previous) {
        const actor = previous.users.find((u) => u.id === previous.session?.userId);
        next = { ...next, audit: [{ id: uid(), action: action.type.toLowerCase().replace(/_/g, " "), actor: actor?.name ?? "Administrator", timestamp: Date.now() }, ...next.audit].slice(0, 100) };
      }
      stateRef.current = next;
      baseDispatch({ type: "REPLACE", state: next });
      if (next !== previous && !["REPLACE", "LOGOUT", "SET_THEME"].includes(action.type)) {
        queueMicrotask(() => postBus({ type: "state", state: { ...next, session: null }, senderId: selfId }));
      }
    };
  }, []);

  const resolveGoogleStudent = (email: string) => stateRef.current.users.find(
    (student) => student.email.toLowerCase() === email || student.aliases?.some((alias) => alias.toLowerCase() === email)
  );

  const connectAuthenticatedUser = async (googleEmail: string) => {
    const normalized = googleEmail.toLowerCase();
    const student = resolveGoogleStudent(normalized);
    if (!student) {
      await signOutFirebase();
      throw new Error("This Google email is not linked to a student account. Ask an administrator to add it as a school or personal login email.");
    }
    await provisionFirebaseProfile(student, stateRef.current.users);
    dispatch({ type: "LOGIN", userId: student.id });
    setFirebaseStatus("connected");
    setFirebaseEmail(normalized);
    setNeedsPasswordSetup(!firebaseUserHasPassword());

    cloudUnsubscribeRef.current?.();
    cloudReadyRef.current = false;
    cloudUnsubscribeRef.current = subscribeCloudState(
      (remote) => {
        if (remote) {
          applyingCloudRef.current = true;
          const next = mergeCloudState(stateRef.current, remote);
          stateRef.current = next;
          cloudStateHashRef.current = cloudStateFingerprint(next);
          baseDispatch({ type: "REPLACE", state: next });
          queueMicrotask(() => { applyingCloudRef.current = false; });
        }
        cloudReadyRef.current = true;
        if (!remote && student.role === "admin") {
          rosterHashRef.current = JSON.stringify(stateRef.current.users.map((entry) => [entry.id, entry.email, entry.aliases, entry.name, entry.grade, entry.house, entry.role, entry.status, entry.councilTitle, entry.department]));
          cloudStateHashRef.current = cloudStateFingerprint(stateRef.current);
          void writeCloudState(stateRef.current).catch((error) => announce(`Initial Firebase sync failed: ${error instanceof Error ? error.message : "unknown error"}`, "error"));
        }
      },
      (error) => {
        setFirebaseStatus("error");
        announce(`Firestore sync error: ${error.message}`, "error");
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
    try {
      const signedIn = await signInFirebasePassword(email, password);
      if (!signedIn.email) throw new Error("Firebase did not provide an email address.");
      await ensureGoogleConnection(signedIn.email);
      setNeedsPasswordSetup(false);
      const student = resolveGoogleStudent(signedIn.email.toLowerCase());
      setActiveTab(student?.role === "admin" ? "admin" : "dashboard");
      announce(`Signed in securely as ${signedIn.email}.`);
    } catch (error) {
      setFirebaseStatus("error");
      throw error;
    }
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

  const uploadAllToFirestore = async () => {
    const current = stateRef.current.users.find((student) => student.id === stateRef.current.session?.userId);
    if (current?.role !== "admin") throw new Error("Administrator access is required.");
    if (!firebaseAuth.currentUser) throw new Error("Sign in with Google before uploading site data.");
    await syncCloudRoster(stateRef.current.users);
    await writeCloudState(stateRef.current);
    cloudStateHashRef.current = cloudStateFingerprint(stateRef.current);
    rosterHashRef.current = JSON.stringify(stateRef.current.users.map((student) => [student.id, student.email, student.aliases, student.name, student.grade, student.house, student.role, student.status, student.councilTitle, student.department]));
    announce("All site data and roster records were uploaded to Firestore.");
  };

  const loadAllFromFirestore = async () => {
    const current = stateRef.current.users.find((student) => student.id === stateRef.current.session?.userId);
    if (current?.role !== "admin") throw new Error("Administrator access is required.");
    const remote = await readCloudState();
    if (!remote) throw new Error("No existing hubState/main document was found in Firestore.");
    applyingCloudRef.current = true;
    const next = mergeCloudState(stateRef.current, remote);
    stateRef.current = next;
    cloudStateHashRef.current = cloudStateFingerprint(next);
    baseDispatch({ type: "REPLACE", state: next });
    queueMicrotask(() => { applyingCloudRef.current = false; });
    announce("The site was updated with the existing Firestore data.");
  };

  const signOutSession = async () => {
    cloudUnsubscribeRef.current?.();
    cloudUnsubscribeRef.current = null;
    cloudReadyRef.current = false;
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
    setFirebaseStatus("connecting");
    void ensureGoogleConnection(googleUser.email).catch((error) => {
      setFirebaseStatus("error");
      announce(error instanceof Error ? error.message : "Google authentication failed.", "error");
    });
  }), []);

  useEffect(() => {
    if (firebaseStatus !== "connected" || !firebaseAuth.currentUser) return;
    return subscribeFirebaseInbox((notification) => {
      dispatch({ type: "PUSH_NOTIFICATION", notification });
    });
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
    if (!cloudReadyRef.current || applyingCloudRef.current || firebaseStatus !== "connected" || !firebaseAuth.currentUser) return;
    const currentUser = state.users.find((student) => student.id === state.session?.userId);
    if (currentUser?.role !== "admin") return;
    const stateHash = cloudStateFingerprint(state);
    if (stateHash === cloudStateHashRef.current) return;
    const timer = setTimeout(() => {
      cloudStateHashRef.current = stateHash;
      void writeCloudState(state).catch((error) => {
        cloudStateHashRef.current = "";
        announce(`Auto-sync failed: ${error instanceof Error ? error.message : "unknown error"}`, "error");
      });
      const rosterHash = JSON.stringify(state.users.map((student) => [student.id, student.email, student.aliases, student.name, student.grade, student.house, student.role, student.status, student.councilTitle, student.department]));
      if (rosterHash !== rosterHashRef.current) {
        rosterHashRef.current = rosterHash;
        void syncCloudRoster(state.users).catch((error) => announce(`Roster sync failed: ${error instanceof Error ? error.message : "unknown error"}`, "error"));
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [state, firebaseStatus]);

  useEffect(() => {
    if (!cloudReadyRef.current || applyingCloudRef.current || firebaseStatus !== "connected" || !firebaseAuth.currentUser) return;
    const currentUser = state.users.find((student) => student.id === state.session?.userId);
    if (!currentUser || currentUser.role === "admin") return;
    const activityHash = JSON.stringify({
      events: state.events.map((event) => [event.id, event.attendees.includes(currentUser.id)]),
      polls: state.polls.map((poll) => [poll.id, poll.voters.includes(currentUser.id), poll.votes]),
      rating: state.siteRatings.find((rating) => rating.userId === currentUser.id),
      suggestions: state.suggestions.filter((suggestion) => suggestion.authorId === currentUser.id || suggestion.authorLabel === `${currentUser.name} · Grade ${currentUser.grade}`),
      read: state.notifications.filter((notification) => notification.readBy.includes(currentUser.id)).map((notification) => notification.id),
      tasks: state.tasks.filter((task) => task.assigneeId === currentUser.id).map((task) => [task.id, task.status]),
    });
    if (activityHash === activityHashRef.current) return;
    activityHashRef.current = activityHash;
    const timer = setTimeout(() => {
      void syncFirebaseUserActivity(state).catch((error) => announce(`Your activity could not sync: ${error instanceof Error ? error.message : "unknown error"}`, "error"));
    }, 700);
    return () => clearTimeout(timer);
  }, [state, firebaseStatus]);

  const switchDemoRole = (role: Role) => {
    const activateDemo = () => {
      const current = stateRef.current;
      const demo = current.users.find((u) => role === "admin" ? u.id === PRIMARY_ADMIN_ID : u.role === role);
      if (!demo) return;
      cloudUnsubscribeRef.current?.();
      cloudUnsubscribeRef.current = null;
      cloudReadyRef.current = false;
      dispatch({ type: "LOGIN", userId: demo.id });
      setFirebaseStatus("signed-out");
      setFirebaseEmail(null);
      setActiveTab(role === "admin" ? "admin" : "dashboard");
      announce(`Now previewing ${role} permissions as ${demo.name}. Firebase sync is off in demo mode.`);
    };
    if (firebaseAuth.currentUser) void signOutFirebase().finally(activateDemo);
    else activateDemo();
  };

  const sessionUserId = state.session?.userId;
  const user = sessionUserId ? state.users.find((u) => u.id === sessionUserId && u.status === "active") ?? null : null;
  const canManage = !!user && (user.role === "admin" || user.role === "council");
  const hasPermission = (feature: string) => !!user && (user.role === "admin" || (user.role === "council" && (state.permissions[user.id] ?? []).includes(feature)));
  const devices = useLocalPresence(user);

  const houseTotals = useMemo(() => {
    const totals: Record<House, number> = { Blue: 0, Red: 0, Green: 0 };
    state.pointsLedger.forEach((e) => { totals[e.house] += e.delta; });
    return totals;
  }, [state.pointsLedger]);

  const unreadCount = useMemo(() => {
    if (!user) return 0;
    return state.notifications.filter((n) => targetsUser(n.audience, user) && !n.readBy.includes(user.id)).length;
  }, [state.notifications, user]);

  const notify = (n: Omit<AppNotification, "id" | "timestamp" | "readBy" | "kind">) => {
    dispatch({ type: "PUSH_NOTIFICATION", notification: { ...n, id: uid(), timestamp: Date.now(), readBy: [], kind: "system" } });
  };

  return (
    <HubContext.Provider value={{ state, dispatch, user, canManage, activeTab, setActiveTab, houseTotals, unreadCount, notify, feedback, announce, switchDemoRole, hasPermission, devices, firebaseStatus, firebaseEmail, signInGoogle, uploadAllToFirestore, loadAllFromFirestore, signOutSession }}>
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

import type { CouncilChatMessage, HubState, HubRoom, Student } from "./types";

/**
 * Council Hub membership rules.
 *
 * The Council Hub chat is a closed room: an account can only read or post there
 * after an administrator has explicitly added it to `hubState.councilHubMembers`.
 * Roles never grant access on their own — a student, teacher, council officer,
 * or secondary administrator who was never added sees a locked hub, and the
 * Firestore rules enforce the same list for cloud sessions (`hubChat/council/messages`).
 */

export const COUNCIL_HUB_TAB = "council-hub";
export const COUNCIL_HUB_ROOM: HubRoom = "council";
export const COUNCIL_MESSAGE_LIMIT = 1500;
export const COUNCIL_MESSAGE_HISTORY_LIMIT = 500;

/** Slices of application state that carry Council Hub access. */
export type CouncilState = Pick<HubState, "councilHubMembers" | "councilMessages" | "users">;

function rank(member: Pick<Student, "role">): number {
  return member.role === "admin" ? 0 : member.role === "council" ? 1 : member.role === "teacher" ? 2 : 3;
}

/** Membership list with stale ids removed, officers first, then alphabetical. */
export function councilMembers(state: Pick<CouncilState, "councilHubMembers" | "users">): Student[] {
  const byId = new Map(state.users.map((user) => [user.id, user]));
  return state.councilHubMembers
    .map((id) => byId.get(id))
    .filter((member): member is Student => Boolean(member))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** True only when the account was explicitly added to the hub. */
export function isCouncilHubMember(state: Pick<CouncilState, "councilHubMembers">, userId: string | null | undefined): boolean {
  return Boolean(userId) && state.councilHubMembers.includes(userId as string);
}

/** Reading the chat — membership only, administrators included. */
export function canReadCouncilHub(state: Pick<CouncilState, "councilHubMembers">, user: Student | null | undefined): boolean {
  return Boolean(user) && isCouncilHubMember(state, user?.id);
}

/** Administrators alone may add or remove Council Hub members. */
export function canManageCouncilHubMembers(user: Student | null | undefined): boolean {
  return user?.role === "admin";
}

/** The hub page is reachable by members and by administrators (who manage the list). */
export function canOpenCouncilHub(
  state: Pick<CouncilState, "councilHubMembers">,
  user: Student | null | undefined,
): boolean {
  return canReadCouncilHub(state, user) || canManageCouncilHubMembers(user);
}

export function canPostToCouncilHub(
  state: Pick<CouncilState, "councilHubMembers">,
  user: Student | null | undefined,
  authorId?: string,
): boolean {
  if (!canReadCouncilHub(state, user)) return false;
  return authorId === undefined || authorId === user?.id;
}

export function canRemoveCouncilMessage(
  user: Student | null | undefined,
  message: Pick<CouncilChatMessage, "authorId"> | undefined,
): boolean {
  if (!user || !message) return false;
  return user.role === "admin" || message.authorId === user.id;
}

/** Trims and validates a council message body, throwing a readable error. */
export function normalizeCouncilMessage(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Write a message first.");
  if (trimmed.length > COUNCIL_MESSAGE_LIMIT) {
    throw new Error(`Council messages are limited to ${COUNCIL_MESSAGE_LIMIT} characters.`);
  }
  return trimmed;
}

/**
 * Appends a message to the device-local council thread.
 * Only explicitly added members may post, and only as themselves.
 */
export function addCouncilMessage(
  state: CouncilState,
  actor: Student | null | undefined,
  message: CouncilChatMessage,
): CouncilChatMessage[] {
  if (!actor || message.authorId !== actor.id) {
    throw new Error("Sign in with the account that is posting this message.");
  }
  if (!isCouncilHubMember(state, actor.id)) {
    throw new Error("Only Council Hub members can post here. Ask an administrator to add your account.");
  }
  const body = normalizeCouncilMessage(message.body);
  const next: CouncilChatMessage = { ...message, body, removed: false };
  return [next, ...state.councilMessages].slice(0, COUNCIL_MESSAGE_HISTORY_LIMIT);
}

/** Soft-deletes a message. Authors may remove their own; administrators may remove any. */
export function removeCouncilMessage(
  state: CouncilState,
  actor: Student | null | undefined,
  messageId: string,
): CouncilChatMessage[] {
  const target = state.councilMessages.find((message) => message.id === messageId);
  if (!canRemoveCouncilMessage(actor, target)) {
    throw new Error("You can only remove your own council messages.");
  }
  return state.councilMessages.map((message) =>
    message.id === messageId ? { ...message, removed: true, body: "" } : message,
  );
}

/**
 * Explicitly adds one roster account to the hub. Accounts that have not activated
 * their roster login yet may be added too — they simply reach the hub once they do.
 */
export function addCouncilMember(
  state: Pick<CouncilState, "councilHubMembers" | "users">,
  userId: string,
): string[] {
  const candidate = state.users.find((user) => user.id === userId);
  if (!candidate) throw new Error("Select a roster account.");
  if (state.councilHubMembers.includes(candidate.id)) {
    throw new Error("This account is already a Council Hub member.");
  }
  return [...state.councilHubMembers, candidate.id];
}

/** Removes one account from the hub. The primary administrator is protected. */
export function removeCouncilMember(
  state: Pick<CouncilState, "councilHubMembers">,
  userId: string,
  protectedUserId: string,
): string[] {
  if (userId === protectedUserId) throw new Error("The primary administrator always has Council Hub access.");
  if (!state.councilHubMembers.includes(userId)) return state.councilHubMembers;
  return state.councilHubMembers.filter((id) => id !== userId);
}

export function sortCouncilMessages(messages: CouncilChatMessage[]): CouncilChatMessage[] {
  return [...messages].sort((a, b) => b.timestamp - a.timestamp);
}

/** Roster accounts that can still be added to the hub, officers first. Class accounts are excluded. */
export function councilCandidates(
  state: Pick<CouncilState, "councilHubMembers" | "users">,
  query = "",
): Student[] {
  const needle = query.trim().toLowerCase();
  return state.users
    .filter((user) => !state.councilHubMembers.includes(user.id))
    .filter((user) => user.role !== "grade")
    .filter((user) => !needle || `${user.name} ${user.email} ${user.id} ${user.role} ${user.gradeLabel ?? ""} ${user.houseLabel ?? ""} ${user.councilTitle ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function councilMemberSummary(state: Pick<CouncilState, "councilHubMembers" | "users">): string {
  const count = councilMembers(state).length;
  return `${count} ${count === 1 ? "member" : "members"}`;
}

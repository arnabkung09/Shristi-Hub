import type { HubState, Student } from "./types";
import { firebaseAuth } from "./firebase-client";

export interface MongoStatusResult {
  connected: boolean;
  message: string;
  database?: string;
  lastSynced?: string | null;
  hasExistingState?: boolean;
}

export interface RemoteStateResult {
  exists: boolean;
  state: Partial<HubState> | null;
  updatedAt?: string;
  version?: number;
  lastModified?: number;
}

export function mongoStateFingerprint(state: Partial<HubState>): string {
  const safeUsers = Array.isArray(state.users)
    ? state.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        aliases: u.aliases ?? [],
        verifiedAliases: u.verifiedAliases ?? [],
        grade: u.grade,
        gradeLabel: u.gradeLabel,
        house: u.house,
        houseLabel: u.houseLabel,
        role: u.role,
        status: u.status,
        councilTitle: u.councilTitle ?? null,
        councilPost: u.councilPost ?? u.councilTitle ?? null,
        department: u.department ?? null,
        avatarUrl: u.avatarUrl ?? null,
      }))
    : [];

  return JSON.stringify({
    branding: state.branding ?? null,
    houses: state.houses ?? null,
    legal: state.legal ?? null,
    departments: state.departments ?? [],
    eventTypes: state.eventTypes ?? [],
    councilHubMembers: state.councilHubMembers ?? [],
    houseCaptains: state.houseCaptains ?? {},
    houseMemberships: state.houseMemberships ?? {},
    activeImageIds: state.activeImageIds ?? [],
    permissions: state.permissions ?? {},
    notificationTemplates: state.notificationTemplates ?? {},
    users: safeUsers,
    tasks: state.tasks ?? [],
    events: state.events ?? [],
    announcements: state.announcements ?? [],
    polls: state.polls ?? [],
    suggestions: state.suggestions ?? [],
    siteRatings: state.siteRatings ?? [],
    pointsLedger: state.pointsLedger ?? [],
    meetings: state.meetings ?? [],
    finances: state.finances ?? [],
    gallery: state.gallery ?? [],
    houseMessages: state.houseMessages ?? [],
    councilMessages: state.councilMessages ?? [],
    broadcastHistory: state.broadcastHistory ?? [],
  });
}

async function getAuthHeader(user?: Student | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (user) {
    if (user.role) headers["x-user-role"] = user.role;
    if (user.email) headers["x-user-email"] = user.email;
    if (user.id) headers["x-user-id"] = user.id;
  }

  const current = firebaseAuth.currentUser;
  if (current) {
    try {
      const idToken = await current.getIdToken();
      if (idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
        return headers;
      }
    } catch {}
  }

  // Preview / Development fallback
  try {
    const payload = btoa(
      JSON.stringify({
        sub: user?.id || "admin-preview",
        email: user?.email || "72019arnab@shristiacademy.edu.np",
        role: user?.role || "admin",
        name: user?.name || "Arnab Shrestha",
        iat: Math.floor(Date.now() / 1000),
      })
    );
    headers["Authorization"] = `Bearer dev.${payload}.sig`;
  } catch {}

  return headers;
}

export async function testMongoConnection(): Promise<MongoStatusResult> {
  try {
    const res = await fetch("/api/state?health=1");
    if (!res.ok) {
      const text = await res.text();
      let errJson: any = {};
      try { errJson = JSON.parse(text); } catch {}
      return {
        connected: false,
        message: errJson.error || `Server responded with status ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      connected: Boolean(data.connected),
      database: data.database || "mongodb",
      lastSynced: data.lastSynced || null,
      hasExistingState: Boolean(data.hasExistingState),
      message: data.message || "Integrated MongoDB database connection is active and healthy.",
    };
  } catch (error) {
    return {
      connected: false,
      message: error instanceof Error ? error.message : "Failed to reach MongoDB API endpoint.",
    };
  }
}

export interface RemoteBrandingResult {
  exists: boolean;
  branding: HubState["branding"] | null;
  houses: HubState["houses"] | null;
  legal: HubState["legal"] | null;
  updatedAt?: string;
  version?: number;
  lastModified?: number;
}

let preloadedStatePromise: Promise<RemoteStateResult> | null = null;

export function preloadRemoteState(fresh = false): Promise<RemoteStateResult> {
  if (fresh || !preloadedStatePromise) {
    preloadedStatePromise = fetchRemoteState({ fresh });
  }
  return preloadedStatePromise;
}

// Eagerly initiate network fetch immediately upon script evaluation
if (typeof window !== "undefined") {
  void preloadRemoteState();
}

export async function fetchRemoteBranding(options?: { fresh?: boolean }): Promise<RemoteBrandingResult> {
  try {
    const url = options?.fresh ? `/api/state?section=branding&fresh=1&t=${Date.now()}` : "/api/state?section=branding";
    const res = await fetch(url, {
      cache: options?.fresh ? "no-store" : "default",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to load branding: ${res.status} ${text}`);
    }

    const data = await res.json();
    return {
      exists: Boolean(data.exists),
      branding: data.branding || null,
      houses: data.houses || null,
      legal: data.legal || null,
      updatedAt: data.updatedAt,
      version: data.version,
      lastModified: data.lastModified || data.version,
    };
  } catch (error) {
    console.warn("MongoDB fetchRemoteBranding notice:", error);
    return { exists: false, branding: null, houses: null, legal: null };
  }
}

export async function fetchRemoteState(options?: { fresh?: boolean }): Promise<RemoteStateResult> {
  try {
    const url = options?.fresh ? `/api/state?fresh=1&t=${Date.now()}` : "/api/state";
    const res = await fetch(url, {
      cache: options?.fresh ? "no-store" : "default",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to load state: ${res.status} ${text}`);
    }

    const data = await res.json();
    return {
      exists: Boolean(data.exists),
      state: (data.state as Partial<HubState>) || null,
      updatedAt: data.updatedAt,
      version: data.version,
      lastModified: data.lastModified || data.version || data.state?.lastModified,
    };
  } catch (error) {
    console.warn("MongoDB fetchRemoteState notice:", error);
    return { exists: false, state: null };
  }
}

export async function saveRemoteState(
  state: HubState,
  user?: Student | null
): Promise<{ success: boolean; message: string; updatedAt?: string; version?: number }> {
  const headers = await getAuthHeader(user);

  const res = await fetch("/api/state", {
    method: "POST",
    headers,
    body: JSON.stringify({ state }),
  });

  if (!res.ok) {
    const text = await res.text();
    let errJson: any = {};
    try { errJson = JSON.parse(text); } catch {}
    throw new Error(errJson.error || `Failed to save to database: status ${res.status}`);
  }

  const data = await res.json();
  return {
    success: true,
    message: data.message || "Site state successfully saved to MongoDB database.",
    updatedAt: data.updatedAt,
    version: data.version,
  };
}

export async function syncRemoteUserActivity(
  student: Student,
  state: HubState
): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeader(student);

  const activityPayload = {
    rsvpEventIds: state.events
      .filter((e) => e.attendees.includes(student.id))
      .map((e) => e.id),
    events: state.events
      .filter((e) => e.attendees.includes(student.id))
      .map((e) => ({ id: e.id, attendees: e.attendees })),
    polls: state.polls
      .filter((p) => p.voters.includes(student.id))
      .map((p) => ({ id: p.id, votes: p.votes, voters: p.voters, ballots: p.ballots })),
    rating: state.siteRatings.find((r) => r.userId === student.id) || null,
    suggestions: state.suggestions.filter((s) => s.authorId === student.id),
    readNotificationIds: state.notifications
      .filter((n) => n.readBy.includes(student.id))
      .map((n) => n.id),
    taskStatuses: Object.fromEntries(
      state.tasks.filter((t) => t.assigneeId === student.id).map((t) => [t.id, t.status])
    ),
    houseMessages: state.houseMessages.filter((m) => m.authorId === student.id),
    councilMessages: state.councilMessages.filter((m) => m.authorId === student.id),
  };

  const res = await fetch("/api/state", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "syncActivity",
      studentId: student.id,
      studentName: student.name,
      studentHouse: student.house,
      studentGrade: student.grade,
      activity: activityPayload,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    let errJson: any = {};
    try { errJson = JSON.parse(text); } catch {}
    throw new Error(errJson.error || `Activity sync failed with status ${res.status}`);
  }

  return await res.json();
}

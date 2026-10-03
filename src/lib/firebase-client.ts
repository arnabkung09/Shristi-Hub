import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, EmailAuthProvider, getAuth, GoogleAuthProvider, linkWithCredential, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signInWithPopup, signOut, type User as FirebaseUser } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from "firebase/messaging";
import type { AppNotification, Audience, HubChatMessage, HubRoom, HubState, Role, Student } from "./types";
import { COUNCIL_HUB_ROOM, COUNCIL_MESSAGE_HISTORY_LIMIT, normalizeCouncilMessage } from "./council";
import type { SheetsConfig } from "./sheets/config";

export const firebaseConfig = {
  apiKey: "AIzaSyB6l7lOrIBypZn4EMgUz6K7jV__UPyK2Nw",
  authDomain: "shristi-hub.firebaseapp.com",
  projectId: "shristi-hub",
  messagingSenderId: "312483296972",
  appId: "1:312483296972:web:b0f109554bfe830581b469",
  measurementId: "G-NN29SVW1V7",
} as const;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
export const firebaseDb = getFirestore(app);
const VAPID_STORAGE_KEY = "shristi-fcm-vapid-public-key-v1";
export const PRIMARY_ADMIN_EMAILS = [
  "72019arnab@shristiacademy.edu.np",
  "arnabkung@gmail.com",
];
export const PRIMARY_ADMIN_EMAIL = "72019arnab@shristiacademy.edu.np";
export const isPrimaryAdmin = (email?: string | null) =>
  Boolean(email && PRIMARY_ADMIN_EMAILS.some((adm) => adm.toLowerCase() === email.trim().toLowerCase()));

export const getVapidKey = () => localStorage.getItem(VAPID_STORAGE_KEY) ?? "";
export async function saveVapidKey(value: string) {
  const key = value.trim();
  if (key && key.length < 40) throw new Error("The Firebase Web Push public VAPID key appears incomplete.");
  if (key) localStorage.setItem(VAPID_STORAGE_KEY, key); else localStorage.removeItem(VAPID_STORAGE_KEY);
  if (firebaseAuth.currentUser) {
    try {
      await setDoc(doc(firebaseDb, "publicConfig", "messaging"), { vapidKey: key, updatedAt: serverTimestamp() });
    } catch (err) {
      console.warn("Could not save VAPID key to Firestore (stored locally instead):", err);
    }
  }
}

async function resolveVapidKey() {
  const local = getVapidKey();
  if (local) return local;
  try {
    const snapshot = await getDoc(doc(firebaseDb, "publicConfig", "messaging"));
    const shared = snapshot.exists() ? String(snapshot.data().vapidKey || "") : "";
    if (shared) localStorage.setItem(VAPID_STORAGE_KEY, shared);
    return shared;
  } catch {
    return "";
  }
}

export async function signInWithGoogle() {
  await setPersistence(firebaseAuth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return (await signInWithPopup(firebaseAuth, provider)).user;
}
export const observeFirebaseAuth = (callback: (user: FirebaseUser | null) => void) => onAuthStateChanged(firebaseAuth, callback);
export const signOutFirebase = () => signOut(firebaseAuth);

export function firebaseUserHasPassword(user: FirebaseUser | null = firebaseAuth.currentUser) {
  return Boolean(user?.providerData.some((provider) => provider.providerId === "password"));
}

export async function createFirebasePassword(student: Student, password: string) {
  const current = firebaseAuth.currentUser;
  if (!current?.email) throw new Error("Verify your school Google account first.");
  if (current.email.toLowerCase() !== student.email.toLowerCase()) {
    throw new Error(`Account creation must use the primary school Google email: ${student.email}`);
  }
  if (firebaseUserHasPassword(current)) throw new Error("This account already has a password. Use the password sign-in form.");
  if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
  await linkWithCredential(current, EmailAuthProvider.credential(student.email, password));
  return current;
}

export async function signInFirebasePassword(email: string, password: string) {
  await setPersistence(firebaseAuth, browserLocalPersistence);
  return (await signInWithEmailAndPassword(firebaseAuth, email.trim().toLowerCase(), password)).user;
}

export async function testFirebaseConnection() {
  try {
    await getDocs(query(collection(firebaseDb, "__connection_test__"), limit(1)));
    return { state: "connected" as const, message: "Firebase and Firestore responded successfully on the Spark-compatible client path." };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code.includes("permission-denied") || code.includes("unauthenticated")) return { state: "secured" as const, message: "Firebase is reachable. Firestore rules require Google authentication." };
    throw error;
  }
}

const emailDocId = (email: string) => email.trim().toLowerCase();

function cloudStudent(student: Student) {
  return {
    id: student.id, name: student.name, email: student.email, aliases: student.aliases ?? [],
    emails: [student.email, ...(student.aliases ?? [])].map((email) => email.toLowerCase()),
    grade: student.grade, gradeLabel: student.gradeLabel, house: student.house, houseLabel: student.houseLabel,
    role: student.role, status: student.status, councilTitle: student.councilTitle ?? null,
    department: student.department ?? null, avatarUrl: student.avatarUrl?.startsWith("data:") ? null : student.avatarUrl ?? null,
    createdAt: student.createdAt,
  };
}

async function commitInChunks(operations: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  for (let start = 0; start < operations.length; start += 400) {
    const batch = writeBatch(firebaseDb);
    operations.slice(start, start + 400).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

export async function syncCloudRoster(students: Student[]) {
  const current = firebaseAuth.currentUser;
  if (!current?.email || !isPrimaryAdmin(current.email)) {
    throw new Error(`The primary administrator (${PRIMARY_ADMIN_EMAIL} or ${PRIMARY_ADMIN_EMAILS[1]}) must sign in with Google to synchronize the roster.`);
  }
  const records = students.map(cloudStudent);
  const validStudentIds = new Set(records.map((student) => student.id));
  const validEmails = new Set(records.flatMap((student) => student.emails));
  const [existingRoster, existingIndexes] = await Promise.all([
    getDocs(collection(firebaseDb, "roster")),
    getDocs(collection(firebaseDb, "emailIndex")),
  ]);
  const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  existingRoster.docs.filter((snapshot) => !validStudentIds.has(snapshot.id)).forEach((snapshot) => operations.push((batch) => batch.delete(snapshot.ref)));
  existingIndexes.docs.filter((snapshot) => !validEmails.has(snapshot.id)).forEach((snapshot) => operations.push((batch) => batch.delete(snapshot.ref)));
  records.forEach((student) => {
    operations.push((batch) => batch.set(doc(firebaseDb, "roster", student.id), student));
    student.emails.forEach((email) => operations.push((batch) => batch.set(doc(firebaseDb, "emailIndex", emailDocId(email)), { studentId: student.id, email, role: student.role, status: student.status })));
  });
  await commitInChunks(operations);
}

export async function provisionFirebaseProfile(_student: Student, roster: Student[]) {
  const current = firebaseAuth.currentUser;
  if (!current?.email) throw new Error("Sign in with Google before provisioning a Firebase profile.");
  if (isPrimaryAdmin(current.email)) {
    try {
      await syncCloudRoster(roster);
    } catch (e) {
      console.warn("Roster sync during provisioning:", e);
    }
  }
  let emailIndex = await getDoc(doc(firebaseDb, "emailIndex", emailDocId(current.email))).catch(() => null);
  if (!emailIndex?.exists() && isPrimaryAdmin(current.email)) {
    try {
      await syncCloudRoster(roster);
      emailIndex = await getDoc(doc(firebaseDb, "emailIndex", emailDocId(current.email))).catch(() => null);
    } catch {}
  }
  if (!emailIndex?.exists()) throw new Error("This Google email is not linked to the Firestore roster. Ask the primary administrator to sign in once and synchronize the roster.");
  const rosterDoc = await getDoc(doc(firebaseDb, "roster", String(emailIndex.data()?.studentId)));
  if (!rosterDoc.exists()) throw new Error("The linked roster record is missing in Firestore.");
  const profile = rosterDoc.data();
  const profileRef = doc(firebaseDb, "users", current.uid);
  const existingProfile = await getDoc(profileRef);
  if (!existingProfile.exists()) {
    await setDoc(profileRef, { ...profile, status: "active", firebaseUid: current.uid, googleEmail: current.email.toLowerCase(), updatedAt: serverTimestamp() });
  } else {
    await setDoc(profileRef, { updatedAt: serverTimestamp() }, { merge: true });
  }
  return profile;
}

function cloudSafeState(state: HubState) {
  const safe = {
    ...state,
    session: null,
    users: state.users.map(cloudStudent),
    gallery: state.gallery.map((item) => ({ ...item, image: item.image ?? null })),
    branding: {
      schoolName: state.branding?.schoolName ?? "",
      boardName: state.branding?.boardName ?? "",
      session: state.branding?.session ?? "",
      logoUrl: state.branding?.logoUrl ?? "",
      footerNote: state.branding?.footerNote ?? "",
      tagline: state.branding?.tagline ?? "",
    },
    houses: Object.fromEntries(
      Object.entries(state.houses ?? {}).map(([key, value]) => [
        key,
        {
          name: value?.name ?? key,
          logoUrl: value?.logoUrl ?? "",
        },
      ])
    ),
    legal: {
      terms: state.legal?.terms ?? "",
      credits: state.legal?.credits ?? "",
    },
    // Council Hub chat never travels in the shared document: any active member can read
    // `hubState/main`, so messages live in the membership-gated `hubChat` collection.
    councilMessages: [],
  };
  return JSON.parse(JSON.stringify(safe)) as Record<string, unknown>;
}
export const cloudStateFingerprint = (state: HubState) => JSON.stringify(cloudSafeState(state));
export async function writeCloudState(state: HubState) {
  if (!firebaseAuth.currentUser) return;
  await setDoc(doc(firebaseDb, "hubState", "main"), cloudSafeState(state), { merge: false });
}
export async function readCloudState() {
  if (!firebaseAuth.currentUser) throw new Error("Sign in with Google before loading Firestore data.");
  const snapshot = await getDoc(doc(firebaseDb, "hubState", "main"));
  return snapshot.exists() ? snapshot.data() as Partial<HubState> : null;
}
export function subscribeCloudState(callback: (state: Partial<HubState> | null) => void, onError: (error: Error) => void) {
  return onSnapshot(doc(firebaseDb, "hubState", "main"), (snapshot) => callback(snapshot.exists() ? snapshot.data() as Partial<HubState> : null), onError);
}

export async function syncFirebaseUserActivity(state: HubState) {
  const current = firebaseAuth.currentUser;
  if (!current) return;
  const profile = await getDoc(doc(firebaseDb, "users", current.uid));
  if (!profile.exists()) return;
  const studentId = String(profile.data().id);
  await setDoc(doc(firebaseDb, "userActivity", current.uid), {
    uid: current.uid, studentId,
    eventIds: state.events.filter((event) => event.attendees.includes(studentId)).map((event) => event.id),
    pollIds: state.polls.filter((poll) => poll.voters.includes(studentId)).map((poll) => poll.id),
    rating: state.siteRatings.find((rating) => rating.userId === studentId) ?? null,
    readNotificationIds: state.notifications.filter((notification) => notification.readBy.includes(studentId)).map((notification) => notification.id),
    taskStatuses: Object.fromEntries(state.tasks.filter((task) => task.assigneeId === studentId).map((task) => [task.id, task.status])),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function tokenId(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function enableFirebasePush(student: Student) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) {
    throw new Error("Web push requires a modern browser running on HTTPS or localhost.");
  }
  if (typeof Notification === "undefined") {
    throw new Error("Push notifications are not supported in this browser environment.");
  }
  const messagingSupported = await isSupported().catch(() => false);
  if (!messagingSupported) {
    throw new Error("Firebase Cloud Messaging is not supported by your current browser context.");
  }
  const vapidKey = await resolveVapidKey();
  if (!vapidKey) {
    throw new Error("Add the public VAPID key in Admin Panel → Firestore Sync first.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted by your browser.");
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  } catch (swErr) {
    console.warn("Service worker registration warning:", swErr);
    try {
      registration = await navigator.serviceWorker.ready;
    } catch {
      throw new Error("Service worker could not be registered. Ensure service workers are enabled in your browser.");
    }
  }

  const messaging = getMessaging(app);
  let token = "";
  try {
    token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (tokenErr) {
    console.warn("FCM getToken failed with registration, trying default registration:", tokenErr);
    try {
      token = await getToken(messaging, { vapidKey });
    } catch (fallbackErr) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(`Push token request failed: ${msg}. Check your VAPID key in Firebase Console.`);
    }
  }

  if (!token) throw new Error("Firebase did not return a valid push token.");

  const current = firebaseAuth.currentUser;
  const userIdentifier = current?.uid || student.id;
  const tokenHash = await tokenId(token);
  const docRef = doc(firebaseDb, "deviceTokens", `${userIdentifier}_${tokenHash}`);

  try {
    await setDoc(docRef, {
      token,
      uid: userIdentifier,
      studentId: student.id,
      name: student.name,
      role: student.role,
      house: student.house,
      grade: student.grade,
      enabled: true,
      updatedAt: serverTimestamp(),
      userAgent: navigator.userAgent.slice(0, 300),
    });
  } catch (dbErr) {
    console.warn("Could not save device token to Firestore (token active locally):", dbErr);
  }
  return token;
}

export interface NotificationPreferences {
  osNotifications: boolean;
  inAppNotifications: boolean;
}

const NOTIFICATION_PREFS_KEY = "shristi_notification_preferences";

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") {
    return { osNotifications: true, inAppNotifications: true };
  }
  try {
    const raw = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (!raw) return { osNotifications: true, inAppNotifications: true };
    const parsed = JSON.parse(raw);
    return {
      osNotifications: parsed.osNotifications !== false,
      inAppNotifications: parsed.inAppNotifications !== false,
    };
  } catch {
    return { osNotifications: true, inAppNotifications: true };
  }
}

export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent("shristi-notification-prefs-changed", { detail: prefs }));
  } catch {}
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  try {
    return await Notification.requestPermission();
  } catch (err) {
    console.warn("Notification request permission warning:", err);
    return Notification.permission;
  }
}

/**
 * Triggers a real OS-level Web Push / Desktop Notification.
 * Calls service worker registration showNotification or new Notification(...)
 * so desktop alerts fire even when the browser tab is focused.
 */
export async function triggerOSNotification(input: {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  actionTab?: string;
  urgent?: boolean;
}): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }

  // Respect user preference toggle for OS notifications
  const prefs = getNotificationPreferences();
  if (!prefs.osNotifications) {
    return;
  }

  // Request permission if not determined yet
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }

  if (Notification.permission !== "granted") {
    return;
  }

  const title = input.title || "Shristi Student Council";
  const body = input.body || "New council notification";
  const icon = input.icon || "/favicon.ico";
  const tag = input.tag || `shristi-${Date.now()}`;
  const actionTab = input.actionTab || "dashboard";
  const urgent = Boolean(input.urgent);

  const options: NotificationOptions & { renotify?: boolean; requireInteraction?: boolean } = {
    body,
    icon,
    badge: icon,
    tag,
    renotify: urgent,
    requireInteraction: urgent,
    data: { actionTab, url: `${window.location.origin}/#${actionTab}` },
  };

  // 1. Prefer Service Worker registration showNotification for genuine OS-level push presentation
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, options);
        return;
      }
    } catch (swErr) {
      console.warn("Service worker showNotification fallback:", swErr);
    }
  }

  // 2. Fallback to native window Notification constructor
  try {
    const desktopNotification = new Notification(title, options);
    desktopNotification.onclick = () => {
      window.focus();
      if (actionTab && window.location.hash.slice(1) !== actionTab) {
        window.location.hash = `#${actionTab}`;
      }
      desktopNotification.close();
    };
  } catch (err) {
    console.warn("Desktop notification trigger failed:", err);
  }
}

export async function subscribeForegroundMessages(callback?: (payload: MessagePayload) => void) {
  if (typeof window === "undefined") return () => undefined;

  // Request permission via Notification.requestPermission()
  if ("Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) return () => undefined;

  const messaging = getMessaging(app);
  return onMessage(messaging, async (payload) => {
    // Explicitly trigger a native OS notification so desktop alerts fire even when the tab is focused
    const title = payload.notification?.title || payload.data?.title || "Shristi Student Council";
    const body = payload.notification?.body || payload.data?.body || "You have a new update.";
    const actionTab = payload.data?.actionTab || "dashboard";
    const urgent = payload.data?.urgent === "true";
    const tag = payload.data?.notificationId || `os-alert-${Date.now()}`;

    await triggerOSNotification({
      title,
      body,
      tag,
      actionTab,
      urgent,
    });

    callback?.(payload);
  });
}

function matchesAudience(student: Record<string, unknown>, audience: Audience) {
  if (audience.kind === "all") return true;
  if (audience.kind === "user") return student.id === audience.userId;
  if (audience.kind === "role") return student.role === audience.role || (audience.role === "council" && student.role === "admin");
  if (audience.kind === "house") return student.house === audience.house;
  return student.grade === audience.grade;
}

export async function sendFirebaseNotification(input: {
  title: string;
  body: string;
  urgent: boolean;
  audience: Audience;
  actionTab: string;
  senderName: string;
}) {
  const notificationId = `cloud-${Date.now()}`;
  let targetedUsers = 0;
  let multicastSuccess = 0;
  let multicastFailure = 0;

  // 1. Deliver via Cloud Function if callable is available
  try {
    const { getFunctions, httpsCallable } = await import("firebase/functions");
    const functions = getFunctions(app, "asia-south1");
    const sendPushCallable = httpsCallable(functions, "sendPush");
    const result = await sendPushCallable(input);
    const data = result.data as { targetedDevices?: number; successCount?: number; failureCount?: number };
    if (data?.successCount !== undefined) {
      multicastSuccess = data.successCount;
      multicastFailure = data.failureCount ?? 0;
      targetedUsers = data.targetedDevices ?? 0;
    }
  } catch {
    // Cloud Functions might not be deployed or on Spark free plan
  }

  // 2. Real-time Firestore delivery (works immediately on all connected devices)
  try {
    const profiles = await getDocs(collection(firebaseDb, "users"));
    const targets = profiles.docs.filter((snapshot) => matchesAudience(snapshot.data(), input.audience));
    if (targets.length) {
      await commitInChunks(targets.map((snapshot) => (batch) => batch.set(doc(firebaseDb, "inbox", snapshot.id, "items", notificationId), { ...input, id: notificationId, timestamp: Date.now(), read: false })));
      targetedUsers = Math.max(targetedUsers, targets.length);
    }
  } catch {
    // Falls back to in-app dispatch
  }

  // 3. Log to pushHistory in Firestore for administrator history
  try {
    await addDoc(collection(firebaseDb, "pushHistory"), {
      ...input,
      notificationId,
      targetedDevices: targetedUsers,
      multicastSuccess,
      multicastFailure,
      createdAt: serverTimestamp(),
    });
  } catch {}

  return { targetedUsers, multicastSuccess, multicastFailure };
}

export function subscribeFirebaseInbox(
  callback: (notification: AppNotification) => void,
  onError?: (error: Error) => void,
) {
  const current = firebaseAuth.currentUser;
  if (!current) return () => undefined;
  const seen = new Set<string>();
  return onSnapshot(collection(firebaseDb, "inbox", current.uid, "items"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type !== "added" || seen.has(change.doc.id)) return;
      seen.add(change.doc.id);
      const data = change.doc.data();
      callback({ id: change.doc.id, title: String(data.title), body: String(data.body), urgent: Boolean(data.urgent), timestamp: Number(data.timestamp) || Date.now(), senderName: String(data.senderName || "Council"), senderRole: "admin", audience: { kind: "user", userId: "cloud" }, actionTab: String(data.actionTab || "dashboard"), readBy: [], kind: "broadcast" });
    });
  }, (error) => {
    // Never let a denied/offline inbox read surface as an unhandled rejection: in-app
    // notifications stay local-only until the listener can attach again.
    onError?.(error);
  });
}

export async function removeCurrentPushToken(tokenDocumentId: string) {
  await deleteDoc(doc(firebaseDb, "deviceTokens", tokenDocumentId));
}

/* ---------------- membership-gated hub chat ---------------- */

export const HUB_CHAT_ROOMS: HubRoom[] = [COUNCIL_HUB_ROOM];

/** Firestore rejects any room that is not gated by an explicit membership list. */
export function isHubRoom(value: string): value is HubRoom {
  return (HUB_CHAT_ROOMS as string[]).includes(value);
}

const hubChatMessage = (room: HubRoom, messageId: string) => doc(firebaseDb, "hubChat", room, "messages", messageId);

const hubChatId = (uid: string) =>
  `${Date.now().toString(36)}-${uid.slice(0, 6)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Posts to a shared hub room. Firestore rules require the writer to be on the
 * room's explicit membership list, so a signed-in account that was never added
 * is rejected with `permission-denied` — the client cannot bypass it.
 */
export async function postHubChat(
  room: HubRoom,
  draft: { body: string; author: Pick<Student, "name" | "role" | "councilTitle"> },
): Promise<HubChatMessage> {
  const current = firebaseAuth.currentUser;
  if (!current) throw new Error("Sign in with Google to post to the Council Hub.");
  if (!isHubRoom(room)) throw new Error("Unknown hub room.");
  const body = normalizeCouncilMessage(draft.body);
  const profile = await getDoc(doc(firebaseDb, "users", current.uid));
  if (!profile.exists()) throw new Error("Your Firebase profile is missing. Sign out and sign in again to continue.");
  const message: HubChatMessage = {
    id: hubChatId(current.uid),
    authorId: String(profile.data().id ?? ""),
    authorName: draft.author.name,
    authorRole: draft.author.role,
    authorTitle: draft.author.councilTitle,
    body,
    timestamp: Date.now(),
    removed: false,
  };
  await setDoc(hubChatMessage(room, message.id), { ...message, room, authorTitle: message.authorTitle ?? null, authorUid: current.uid });
  return message;
}

export function subscribeHubChat(
  room: HubRoom,
  onNext: (messages: HubChatMessage[]) => void,
  onError: (error: Error) => void,
): () => void {
  if (!firebaseAuth.currentUser) {
    onNext([]);
    return () => undefined;
  }
  const messages = query(
    collection(firebaseDb, "hubChat", room, "messages"),
    orderBy("timestamp", "desc"),
    limit(COUNCIL_MESSAGE_HISTORY_LIMIT),
  );
  return onSnapshot(messages, (snapshot) => {
    onNext(snapshot.docs.map((entry) => {
      const data = entry.data();
      return {
        id: entry.id,
        authorId: String(data.authorId ?? ""),
        authorName: String(data.authorName ?? "Council member"),
        authorRole: String(data.authorRole ?? "student") as Role,
        authorTitle: data.authorTitle ? String(data.authorTitle) : undefined,
        body: String(data.body ?? ""),
        timestamp: Number(data.timestamp) || Date.now(),
        removed: Boolean(data.removed),
      };
    }));
  }, onError);
}

/** Soft-deletes a shared room message. Rules allow authors and administrators. */
export async function removeHubChat(room: HubRoom, messageId: string) {
  if (!firebaseAuth.currentUser) throw new Error("Sign in with Google to remove a Council Hub message.");
  await updateDoc(hubChatMessage(room, messageId), { removed: true, body: "" });
}

/* ---------------- Google Sheets endpoint configuration ---------------- */

/**
 * The read-only Apps Script URL for the House Points, Calendar, and Monetary Fund
 * sheets. Stored in `publicConfig/sheets` (readable by signed-in members, writable by
 * administrators) so it can be changed without rebuilding the site. It holds a public
 * `/exec` URL only — never a Google API key, service account, or OAuth secret.
 */
export async function readCloudSheetsConfig(): Promise<Partial<SheetsConfig> | null> {
  // The document is public read-only configuration, so it is read before sign-in as well:
  // that is what makes the endpoint reach a visitor who has not authenticated yet.
  try {
    const snapshot = await getDoc(doc(firebaseDb, "publicConfig", "sheets"));
    return snapshot.exists() ? snapshot.data() as Partial<SheetsConfig> : null;
  } catch {
    return null;
  }
}

/**
 * Publishes (or clears) the shared spreadsheet endpoint. Throws when the write is not
 * allowed, so the administrator is told the change is only saved in their browser instead
 * of believing the whole school received it.
 */
export async function writeCloudSheetsConfig(config: SheetsConfig | null): Promise<void> {
  if (!firebaseAuth.currentUser) {
    throw new Error("Sign in with Google to publish this connection to every device. It is saved in this browser for now.");
  }
  const reference = doc(firebaseDb, "publicConfig", "sheets");
  if (!config) {
    await deleteDoc(reference);
    return;
  }
  await setDoc(reference, {
    apiUrl: config.apiUrl,
    token: config.token ?? "",
    houseMap: config.houseMap ?? {},
    sections: config.sections ?? {},
    pollSeconds: config.pollSeconds ?? null,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeCloudSheetsConfig(
  callback: (config: Partial<SheetsConfig>) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(doc(firebaseDb, "publicConfig", "sheets"), (snapshot) => {
    if (snapshot.exists()) callback(snapshot.data() as Partial<SheetsConfig>);
  }, (error) => {
    // A denied or offline read must never break the page: the built-in endpoint and the
    // browser-saved configuration keep working.
    onError?.(error);
  });
}

export { app as firebaseApp };
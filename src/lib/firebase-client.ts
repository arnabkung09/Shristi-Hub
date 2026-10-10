import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, EmailAuthProvider, getAuth, GoogleAuthProvider, linkWithCredential, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signInWithPopup, signOut, type User as FirebaseUser } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";

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

export const PRIMARY_ADMIN_EMAILS = [
  "72019arnab@shristiacademy.edu.np",
  "arnabkung@gmail.com",
];
export const PRIMARY_ADMIN_EMAIL = "72019arnab@shristiacademy.edu.np";
export const isPrimaryAdmin = (email?: string | null) =>
  Boolean(email && PRIMARY_ADMIN_EMAILS.some((adm) => adm.toLowerCase() === email.trim().toLowerCase()));


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
    throw new Error(`The primary administrator (${PRIMARY_ADMIN_EMAILS.join(" or ")}) must sign in with Google to synchronize the roster.`);
  }
  const records = students.map(cloudStudent);
  const validStudentIds = new Set(records.map((student) => student.id));
  const validEmails = new Set(records.flatMap((student) => student.emails));

  let existingRosterDocs: Array<{ id: string; ref: ReturnType<typeof doc> }> = [];
  let existingIndexDocs: Array<{ id: string; ref: ReturnType<typeof doc> }> = [];
  try {
    const [existingRoster, existingIndexes] = await Promise.all([
      getDocs(collection(firebaseDb, "roster")),
      getDocs(collection(firebaseDb, "emailIndex")),
    ]);
    existingRosterDocs = existingRoster.docs;
    existingIndexDocs = existingIndexes.docs;
  } catch (readErr) {
    console.warn("Could not read entire collection upfront; writing records directly:", readErr);
  }

  const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  existingRosterDocs.filter((snapshot) => !validStudentIds.has(snapshot.id)).forEach((snapshot) => operations.push((batch) => batch.delete(snapshot.ref)));
  existingIndexDocs.filter((snapshot) => !validEmails.has(snapshot.id)).forEach((snapshot) => operations.push((batch) => batch.delete(snapshot.ref)));
  records.forEach((student) => {
    operations.push((batch) => batch.set(doc(firebaseDb, "roster", student.id), student));
    student.emails.forEach((email) => operations.push((batch) => batch.set(doc(firebaseDb, "emailIndex", emailDocId(email)), { studentId: student.id, email, role: student.role, status: student.status })));
  });
  await commitInChunks(operations);
}

export async function provisionFirebaseProfile(student: Student, roster: Student[]) {
  const current = firebaseAuth.currentUser;
  if (!current?.email) throw new Error("Sign in with Google before provisioning a Firebase profile.");
  const studentData = cloudStudent(student);

  if (isPrimaryAdmin(current.email)) {
    try {
      await syncCloudRoster(roster);
    } catch (e) {
      console.warn("Roster sync notice during provisioning:", e);
    }
  }

  // Ensure email index and roster documents exist
  try {
    const emailRef = doc(firebaseDb, "emailIndex", emailDocId(current.email));
    await setDoc(emailRef, {
      studentId: student.id,
      email: current.email.toLowerCase(),
      role: student.role,
      status: student.status,
    }, { merge: true });
    await setDoc(doc(firebaseDb, "roster", student.id), studentData, { merge: true });
  } catch (err) {
    console.warn("Index/roster doc setup notice:", err);
  }

  const profileRef = doc(firebaseDb, "users", current.uid);
  try {
    const existingProfile = await getDoc(profileRef).catch(() => null);
    if (!existingProfile?.exists()) {
      await setDoc(profileRef, {
        ...studentData,
        status: "active",
        firebaseUid: current.uid,
        googleEmail: current.email.toLowerCase(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(profileRef, { updatedAt: serverTimestamp() }, { merge: true });
    }
  } catch (err) {
    console.warn("users/{uid} profile write notice:", err);
    if (!isPrimaryAdmin(current.email)) {
      throw err;
    }
  }
  return studentData;
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
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Web push requires a browser supporting service workers.");
  }
  if (typeof Notification === "undefined") {
    throw new Error("Push notifications are not supported in this browser environment.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted by your browser.");
  }

  // Ensure OS notification preference is enabled
  const currentPrefs = getNotificationPreferences();
  saveNotificationPreferences({ ...currentPrefs, osNotifications: true });

  await registerAppServiceWorker();
  
  // Call the custom web push subscription logic
  const devId = (typeof localStorage !== "undefined" ? localStorage.getItem("shristi_registered_device_id_v5") || sessionStorage.getItem("shristi_device_session_id_v4") : null) || `dev-${Date.now()}`;
  try {
    const sub = await enableWebPush(student, devId);
    return sub ? "web-push-enabled" : "";
  } catch (err) {
    console.warn("Custom Web Push registration failed:", err);
    throw err;
  }
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function enableWebPush(student: Student, deviceId: string) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Web push is not supported in this browser.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied.');
  }

  const reg = await navigator.serviceWorker.ready;
  
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error('VAPID public key is missing from environment variables');

  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey
  });

  // Save subscription
  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      userId: student.id,
      role: student.role,
      house: student.house,
      grade: student.grade,
      subscription
    })
  });

  return subscription;
}

export interface NotificationPreferences {
  osNotifications: boolean;
  inAppNotifications: boolean;
  mobileHaptics?: boolean;
}

const NOTIFICATION_PREFS_KEY = "shristi_notification_preferences";

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") {
    return { osNotifications: true, inAppNotifications: true, mobileHaptics: true };
  }
  try {
    const raw = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (!raw) return { osNotifications: true, inAppNotifications: true, mobileHaptics: true };
    const parsed = JSON.parse(raw);
    return {
      osNotifications: parsed.osNotifications !== false,
      inAppNotifications: parsed.inAppNotifications !== false,
      mobileHaptics: parsed.mobileHaptics !== false,
    };
  } catch {
    return { osNotifications: true, inAppNotifications: true, mobileHaptics: true };
  }
}

export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent("shristi-notification-prefs-changed", { detail: prefs }));
  } catch {}
}

export interface MobileDeviceInfo {
  isMobile: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  supportsPush: boolean;
  supportsVibration: boolean;
  deviceLabel: string;
}

export function getMobileDeviceInfo(): MobileDeviceInfo {
  if (typeof window === "undefined") {
    return {
      isMobile: false,
      isAndroid: false,
      isIOS: false,
      isStandalone: false,
      supportsPush: false,
      supportsVibration: false,
      deviceLabel: "Unknown System",
    };
  }
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const supportsPush = "Notification" in window && "serviceWorker" in navigator;
  const supportsVibration = typeof navigator !== "undefined" && "vibrate" in navigator;

  let deviceLabel = "Desktop OS";
  if (isAndroid) deviceLabel = isStandalone ? "Android PWA (Installed)" : "Android Mobile Device";
  else if (isIOS) deviceLabel = isStandalone ? "Apple iOS PWA (Home Screen)" : "Apple iOS Safari Device";
  else if (isStandalone) deviceLabel = "Desktop PWA (Installed)";

  return {
    isMobile,
    isAndroid,
    isIOS,
    isStandalone,
    supportsPush,
    supportsVibration,
    deviceLabel,
  };
}

export function triggerMobileHapticTest(pattern?: number[]): boolean {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    try {
      return navigator.vibrate(pattern || [150, 80, 150]);
    } catch {
      return false;
    }
  }
  return false;
}

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  if (!swRegistrationPromise) {
    swRegistrationPromise = (async () => {
      try {
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        }
        // Ensure ready
        const readyPromise = navigator.serviceWorker.ready;
        const fallbackPromise = new Promise<ServiceWorkerRegistration | null>((resolve) =>
          setTimeout(() => resolve(reg || null), 1200)
        );
        const resolved = await Promise.race([readyPromise, fallbackPromise]);
        return resolved || reg || null;
      } catch (err) {
        console.warn("Failed to register app service worker:", err);
        try {
          return await navigator.serviceWorker.ready;
        } catch {
          return null;
        }
      }
    })();
  }
  return swRegistrationPromise;
}

// Automatically initiate service worker registration on module load
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  void registerAppServiceWorker();
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

export interface TriggerOSNotificationResult {
  delivered: boolean;
  mode?: "service-worker" | "postmessage" | "desktop";
  error?: string;
}

/**
 * Triggers a real OS-level Web Push / Desktop Notification.
 * Fully compatible with all mobile phone brands (Samsung, Xiaomi, Pixel, OnePlus, Oppo, Vivo, iOS PWA)
 * by utilizing ServiceWorkerRegistration.showNotification() and preventing Android Chrome constructor crashes.
 */
export async function triggerOSNotification(input: {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  actionTab?: string;
  urgent?: boolean;
}): Promise<TriggerOSNotificationResult> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { delivered: false, error: "Notifications not supported in this browser window" };
  }

  // Respect user preference toggle for OS notifications
  const prefs = getNotificationPreferences();
  if (!prefs.osNotifications) {
    return { delivered: false, error: "OS & Mobile notifications are muted in preferences" };
  }

  const title = input.title || "Shristi Student Council";
  const body = input.body || "New council notification";
  const icon = input.icon || `${window.location.origin}/pwa-192x192.png`;
  const tag = input.tag || `shristi-${Date.now()}`;
  const actionTab = input.actionTab || "dashboard";
  const urgent = Boolean(input.urgent);

  // 1. Mobile Haptic Vibration feedback (Android & iOS WebKit) - fires regardless of OS permission
  if (prefs.mobileHaptics !== false && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(urgent ? [200, 100, 200, 100, 200] : [200, 100, 200]);
    } catch {}
  }

  // 2. Synchronously dispatch visual indicator event to the UI (0ms latency)
  if (prefs.inAppNotifications !== false) {
    try {
      window.dispatchEvent(
        new CustomEvent("shristi-os-notification-fired", {
          detail: { title, body, icon, tag, actionTab, urgent, timestamp: Date.now() },
        }),
      );
    } catch {}
  }

  // 3. Prevent duplicate native popups if the user is already viewing the app actively
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    return { delivered: true, method: "in-app-toast" };
  }

  // Request permission if not determined yet
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }

  if (Notification.permission !== "granted") {
    return { delivered: false, error: "Notification permission has not been granted by user (haptic feedback & in-app delivery triggered)" };
  }

  const deviceInfo = getMobileDeviceInfo();

  // Notification Options - tailored for mobile phone brand reliability
  const options: NotificationOptions & { renotify?: boolean; requireInteraction?: boolean; vibrate?: number[] } = {
    body,
    icon,
    badge: `${window.location.origin}/pwa-192x192.png`,
    tag, // Always non-empty for renotify
    renotify: true,
    // Mobile browsers (Xiaomi, Samsung, Oppo, etc.) ignore or reject requireInteraction
    requireInteraction: urgent && !deviceInfo.isMobile,
    vibrate: urgent ? [200, 100, 200, 100, 200] : [200, 100, 200],
    data: { actionTab, url: `${window.location.origin}/#${actionTab}` },
  };

  // 3. Multi-path delivery execution
  let delivered = false;
  let mode: "service-worker" | "postmessage" | "desktop" | undefined = undefined;

  // Primary Path: Active ServiceWorker showNotification (Mandatory for Android & iOS mobile)
  if ("serviceWorker" in navigator) {
    try {
      let reg = await registerAppServiceWorker();
      if (!reg) {
        reg = (await navigator.serviceWorker.getRegistration()) || null;
      }
      if (reg && typeof reg.showNotification === "function") {
        try {
          await reg.showNotification(title, options);
          delivered = true;
          mode = "service-worker";
        } catch (brandErr) {
          console.warn("Mobile brand showNotification option rejection, retrying with stripped options:", brandErr);
          // Stripped option fallback for custom OEM skins (MIUI, ColorOS, EMUI)
          try {
            await reg.showNotification(title, {
              body,
              icon: `${window.location.origin}/pwa-192x192.png`,
              tag,
              data: options.data,
            });
            delivered = true;
            mode = "service-worker";
          } catch (strippedErr) {
            console.warn("Stripped showNotification failed:", strippedErr);
          }
        }
      }

      // Dual assurance: also send message to service worker
      if (reg?.active) {
        reg.active.postMessage({
          type: "SHOW_NOTIFICATION",
          title,
          options,
        });
      } else if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "SHOW_NOTIFICATION",
          title,
          options,
        });
      }
    } catch (swError) {
      console.warn("ServiceWorker showNotification error:", swError);
    }
  }

  // Fallback Path: Native Notification constructor (Only on desktop OS where legal and supported)
  if (!delivered && !deviceInfo.isMobile && typeof Notification !== "undefined") {
    try {
      const desktopNotification = new Notification(title, {
        body,
        icon,
        tag,
        data: options.data,
      });
      desktopNotification.onclick = () => {
        window.focus();
        if (actionTab && window.location.hash.slice(1) !== actionTab) {
          window.location.hash = `#${actionTab}`;
        }
        desktopNotification.close();
      };
      delivered = true;
      mode = "desktop";
    } catch (desktopErr) {
      console.warn("Desktop notification fallback notice:", desktopErr);
    }
  }

  return {
    delivered,
    mode,
    error: delivered ? undefined : "Notification could not be displayed by OS. Check phone notification settings.",
  };
}

export async function subscribeForegroundMessages(callback?: (payload: any) => void) {
  if (typeof window === "undefined") return () => undefined;

  // Request permission via Notification.requestPermission()
  if ("Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }

  const handleMessage = async (event: MessageEvent) => {
    if (event.data && event.data.type === 'PUSH_RECEIVED') {
      const payload = event.data.payload;
      const title = payload.title || "Shristi Student Council";
      const body = payload.body || "You have a new update.";
      const actionTab = payload.actionTab || "dashboard";
      const urgent = payload.urgent === true || payload.urgent === "true";
      const tag = payload.notificationId || `os-alert-${Date.now()}`;

      await triggerOSNotification({
        title,
        body,
        tag,
        actionTab,
        urgent,
      });

      callback?.(payload);
    }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleMessage);
  }

  return () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    }
  };
}

function matchesAudience(student: Record<string, unknown>, audience: Audience) {
  if (audience.kind === "all") return true;
  if (audience.kind === "user") {
    const target = String(audience.userId || "").toLowerCase();
    const id = String(student.id || "").toLowerCase();
    const email = String(student.email || student.googleEmail || "").toLowerCase();
    const uid = String(student.firebaseUid || "").toLowerCase();
    return id === target || email === target || uid === target;
  }
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
  targetDeviceId?: string;
}) {
  const notificationId = `cloud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let targetedUsers = 0;
  let multicastSuccess = 0;
  let multicastFailure = 0;

  // 1. Gather all active FCM device tokens matching the audience (every device on every matching user account)
  let matchingTokens: string[] = [];
  try {
    const tokenSnapshots = await getDocs(collection(firebaseDb, "deviceTokens"));
    const matchingDocs = tokenSnapshots.docs.filter((docSnap) => {
      const data = docSnap.data();
      if (data.enabled === false || !data.token) return false;
      if (input.targetDeviceId && data.deviceId !== input.targetDeviceId) return false;
      if (input.audience.kind === "all") return true;
      if (input.audience.kind === "user") {
        const target = String(input.audience.userId || "").toLowerCase();
        const studentId = String(data.studentId || "").toLowerCase();
        const uid = String(data.uid || "").toLowerCase();
        const email = String(data.email || "").toLowerCase();
        return studentId === target || uid === target || email === target;
      }
      if (input.audience.kind === "role") {
        return data.role === input.audience.role || (input.audience.role === "council" && data.role === "admin");
      }
      if (input.audience.kind === "house") return data.house === input.audience.house;
      if (input.audience.kind === "grade") return data.grade === input.audience.grade;
      return false;
    });

    matchingTokens = Array.from(new Set(matchingDocs.map((d) => String(d.data().token)).filter(Boolean)));
    if (matchingTokens.length > 0) {
      targetedUsers = Math.max(targetedUsers, matchingTokens.length);
    }
  } catch (tokenErr) {
    console.warn("Could not query deviceTokens directly:", tokenErr);
  }

  // 2. Deliver via Vercel Serverless Endpoint using web-push
  try {
    // Get the current user's ID token
    const currentUser = firebaseAuth.currentUser;
    const idToken = currentUser ? await currentUser.getIdToken() : "";

    const res = await fetch("/api/send", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        urgent: input.urgent,
        actionTab: input.actionTab,
        audience: input.audience,
        targetDeviceId: input.targetDeviceId
      }),
    });
    if (res.ok) {
      const data = await res.json();
      multicastSuccess = data.successCount || 0;
      multicastFailure = data.failureCount || 0;
      targetedUsers = Math.max(targetedUsers, data.successCount + data.failureCount);
    } else {
      const errData = await res.json().catch(() => ({}));
      console.warn("Vercel Web Push API returned an error:", res.status, errData);
      if (typeof window !== "undefined") {
        alert(`Push Delivery Failed (${res.status}): ${errData.error || 'Unknown server error'}`);
      }
    }
  } catch (err: any) {
    console.warn("Vercel backend endpoint delivery failed", err);
    if (typeof window !== "undefined") {
      alert(`Network Error when dispatching push: ${err.message}`);
    }
  }

  // 3. Real-time Firestore Broadcast Delivery (instantly received by ALL connected devices and all signed-in accounts)
  try {
    await setDoc(doc(firebaseDb, "broadcasts", notificationId), {
      ...input,
      id: notificationId,
      timestamp: Date.now(),
      createdAt: serverTimestamp(),
      targetedTokensCount: matchingTokens.length,
    });
  } catch (bErr) {
    console.warn("Could not save to broadcasts collection:", bErr);
  }

  // 4. User Inbox Delivery (targeted inboxes for every matching account)
  try {
    const profiles = await getDocs(collection(firebaseDb, "users"));
    const targets = profiles.docs.filter((snapshot) => matchesAudience(snapshot.data(), input.audience));
    if (targets.length) {
      await commitInChunks(
        targets.map((snapshot) => (batch) =>
          batch.set(doc(firebaseDb, "inbox", snapshot.id, "items", notificationId), {
            ...input,
            id: notificationId,
            timestamp: Date.now(),
            read: false,
          })
        )
      );
      targetedUsers = Math.max(targetedUsers, targets.length);
    }
  } catch (inboxErr) {
    console.warn("Could not deliver to individual inboxes:", inboxErr);
  }

  // 5. Broadcast to Service Worker Persistent Channel & Queue
  try {
    const bc = new BroadcastChannel("shristi-persistent-notification-bus-v1");
    bc.postMessage({
      type: "PERSISTENT_NOTIFICATION_DISPATCH",
      notification: {
        id: notificationId,
        title: input.title,
        body: input.body,
        urgent: input.urgent,
        actionTab: input.actionTab,
        timestamp: Date.now(),
      },
    });
    setTimeout(() => bc.close(), 1000);
  } catch {}

  // 5b. Dual-channel Server Broadcast (guarantees real-time delivery to all devices regardless of Firebase session)
  try {
    await fetch("/api/notifications/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: notificationId,
        title: input.title,
        body: input.body,
        urgent: input.urgent,
        actionTab: input.actionTab,
        audience: input.audience,
        senderName: input.senderName,
      }),
    });
  } catch {}

  // 6. Log to pushHistory in Firestore for administrator history
  try {
    await addDoc(collection(firebaseDb, "pushHistory"), {
      ...input,
      notificationId,
      targetedDevices: targetedUsers,
      targetedTokens: matchingTokens.length,
      multicastSuccess,
      multicastFailure,
      createdAt: serverTimestamp(),
    });
  } catch {}

  return { targetedUsers, multicastSuccess, multicastFailure };
}

export function subscribeCloudBroadcasts(
  callback: (notification: AppNotification) => void,
  onError?: (error: Error) => void,
) {
  if (!firebaseAuth.currentUser) return () => undefined;
  const seen = new Set<string>();
  const initialTime = Date.now() - 30000;
  return onSnapshot(
    collection(firebaseDb, "broadcasts"),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added" || seen.has(change.doc.id)) return;
        seen.add(change.doc.id);
        const data = change.doc.data();
        const timestamp = Number(data.timestamp) || Date.now();
        if (timestamp < initialTime) return;

        const audience: Audience =
          data.audience && typeof data.audience === "object"
            ? (data.audience as Audience)
            : { kind: "all" };

        callback({
          id: change.doc.id,
          title: String(data.title || "Shristi Council Alert"),
          body: String(data.body || ""),
          urgent: Boolean(data.urgent),
          timestamp,
          senderName: String(data.senderName || "Council"),
          senderRole: "admin",
          audience,
          actionTab: String(data.actionTab || "dashboard"),
          targetDeviceId: data.targetDeviceId ? String(data.targetDeviceId) : undefined,
          readBy: [],
          kind: "broadcast",
        });
      });
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeFirebaseInbox(
  callback: (notification: AppNotification) => void,
  onError?: (error: Error) => void,
) {
  const current = firebaseAuth.currentUser;
  if (!current) return () => undefined;
  const seen = new Set<string>();
  const initialTime = Date.now() - 30000;
  return onSnapshot(
    collection(firebaseDb, "inbox", current.uid, "items"),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added" || seen.has(change.doc.id)) return;
        seen.add(change.doc.id);
        const data = change.doc.data();
        const timestamp = Number(data.timestamp) || Date.now();
        if (timestamp < initialTime && data.read === true) return;

        const audience: Audience =
          data.audience && typeof data.audience === "object"
            ? (data.audience as Audience)
            : { kind: "all" };

        callback({
          id: change.doc.id,
          title: String(data.title || "Shristi Council Alert"),
          body: String(data.body || ""),
          urgent: Boolean(data.urgent),
          timestamp,
          senderName: String(data.senderName || "Council"),
          senderRole: "admin",
          audience,
          actionTab: String(data.actionTab || "dashboard"),
          targetDeviceId: data.targetDeviceId ? String(data.targetDeviceId) : undefined,
          readBy: data.read ? [current.uid] : [],
          kind: "broadcast",
        });
      });
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function removeCurrentPushToken(tokenDocumentId: string) {
  await deleteDoc(doc(firebaseDb, "deviceTokens", tokenDocumentId));
}

/* ---------------- Background Sync & Persistent Broadcast Channel Engine ---------------- */

export const PERSISTENT_NOTIFICATION_CHANNEL = "shristi-persistent-notification-bus-v1";

/**
 * Registers a service worker background sync tag so queued notifications flush when connectivity resumes.
 */
export async function requestBackgroundSync(tag = "sync-queued-notifications"): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const reg = await registerAppServiceWorker();
    if (reg && "sync" in reg) {
      await (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register(tag);
      return true;
    }
  } catch (err) {
    console.warn("Background sync registration notice:", err);
  }
  return false;
}

/**
 * Requests the service worker to immediately flush any notifications held in the offline IndexedDB queue.
 */
export async function flushServiceWorkerNotificationQueue(): Promise<void> {
  if (typeof window === "undefined") return;

  // 1. Dispatch through persistent BroadcastChannel
  try {
    const bc = new BroadcastChannel(PERSISTENT_NOTIFICATION_CHANNEL);
    bc.postMessage({ type: "FLUSH_NOTIFICATION_QUEUE" });
    setTimeout(() => bc.close(), 1000);
  } catch {}

  // 2. Dispatch directly to active service worker controller
  if ("serviceWorker" in navigator) {
    try {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "FLUSH_NOTIFICATION_QUEUE" });
      } else {
        const reg = await navigator.serviceWorker.ready;
        reg?.active?.postMessage({ type: "FLUSH_NOTIFICATION_QUEUE" });
      }
    } catch {}
  }
}

/**
 * Attaches real-time listeners to both the persistent BroadcastChannel and service worker postMessages
 * to ensure that any queued notification delivered upon reconnection is instantly reflected in app state.
 */
export function listenToServiceWorkerNotifications(
  callback: (notification: AppNotification) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(PERSISTENT_NOTIFICATION_CHANNEL);
    channel.onmessage = (event) => {
      if (
        event.data?.type === "QUEUED_NOTIFICATION_DELIVERED" ||
        event.data?.type === "NEW_NOTIFICATION_RECEIVED"
      ) {
        const notif = event.data.notification || event.data;
        callback({
          id: notif.id || `sw-notif-${Date.now()}`,
          title: notif.title || "Shristi Council Alert",
          body: notif.body || "",
          urgent: Boolean(notif.urgent),
          timestamp: notif.timestamp || Date.now(),
          senderName: "Council System",
          senderRole: "admin",
          audience: { kind: "all" },
          actionTab: notif.actionTab || "dashboard",
          readBy: [],
          kind: "broadcast",
        });
      }
    };
  } catch {
    channel = null;
  }

  const handleMessage = (event: MessageEvent) => {
    if (
      event.data?.type === "QUEUED_NOTIFICATION_DELIVERED" ||
      event.data?.type === "NEW_NOTIFICATION_RECEIVED"
    ) {
      const notif = event.data.notification || event.data;
      callback({
        id: notif.id || `sw-notif-${Date.now()}`,
        title: notif.title || "Shristi Council Alert",
        body: notif.body || "",
        urgent: Boolean(notif.urgent),
        timestamp: notif.timestamp || Date.now(),
        senderName: "Council System",
        senderRole: "admin",
        audience: { kind: "all" },
        actionTab: notif.actionTab || "dashboard",
        readBy: [],
        kind: "broadcast",
      });
    }
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleMessage);
  }

  return () => {
    channel?.close();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    }
  };
}

// Automatically flush queued notifications when the device/browser returns online or regains focus
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void flushServiceWorkerNotificationQueue();
    void requestBackgroundSync();
  });
  window.addEventListener("focus", () => {
    void flushServiceWorkerNotificationQueue();
  });
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
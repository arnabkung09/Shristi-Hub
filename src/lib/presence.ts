import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseAuth, firebaseDb, triggerOSNotification } from "./firebase-client";
import { chime, postBus } from "./realtime";
import type { House, Role, Student } from "./types";

export interface ConnectedDevice {
  id: string;
  userId: string;
  name: string;
  email?: string;
  role: Role;
  house?: House | null;
  grade?: number | null;
  kind: "mobile" | "tablet" | "desktop";
  model: string;
  browser: string;
  isStandalone: boolean;
  pushStatus: "enabled" | "denied" | "prompt" | "unsupported";
  online: boolean;
  connectedAt: number;
  lastPing: number;
  isCurrent?: boolean;
  isGuest?: boolean;
}

const REGISTRY_KEY = "shristi_connected_devices_v5";
const DEVICE_ID_STORAGE_KEY = "shristi_registered_device_id_v6";
const LEGACY_DEVICE_ID_KEY = "shristi_registered_device_id_v5";
const SESSION_DEVICE_ID_KEY = "shristi_device_session_id_v4";
const ACTIVE_THRESHOLD_MS = 90_000;

let cachedDeviceId: string | null = null;

/**
 * Returns a stable device ID persisted in localStorage so reloads or multiple tabs
 * on the same browser reuse a single device record instead of spawning duplicates.
 */
export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  if (typeof window === "undefined") return "server-device";

  try {
    let existing =
      localStorage.getItem(DEVICE_ID_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_DEVICE_ID_KEY) ||
      sessionStorage.getItem(SESSION_DEVICE_ID_KEY);

    if (!existing) {
      const rand =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID().slice(0, 8)
          : Math.random().toString(36).slice(2, 10);
      existing = `dev-${rand}`;
    }

    localStorage.setItem(DEVICE_ID_STORAGE_KEY, existing);
    localStorage.setItem(LEGACY_DEVICE_ID_KEY, existing);
    sessionStorage.setItem(SESSION_DEVICE_ID_KEY, existing);
    cachedDeviceId = existing;
    return existing;
  } catch {
    cachedDeviceId = `dev-${Math.random().toString(36).slice(2, 10)}`;
    return cachedDeviceId;
  }
}

export const getOrGenerateDeviceId = getDeviceId;

export function useLocalPresence(user?: Student | null): ConnectedDevice[] {
  const [devices, setDevices] = useState<ConnectedDevice[]>(() => readConnectedDevices());

  useEffect(() => {
    void syncCurrentDeviceToRegistry(user ?? null);
    const unsub = subscribeConnectedDevices(setDevices);
    return () => {
      unsub();
    };
  }, [user]);

  return devices;
}

export function detectDeviceDetails(): {
  kind: "mobile" | "tablet" | "desktop";
  model: string;
  browser: string;
  isStandalone: boolean;
  pushStatus: "enabled" | "denied" | "prompt" | "unsupported";
} {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      kind: "desktop",
      model: "Desktop Browser",
      browser: "Browser",
      isStandalone: false,
      pushStatus: "unsupported",
    };
  }

  const ua = navigator.userAgent || "";
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";

  let kind: "mobile" | "tablet" | "desktop" = "desktop";
  let model = "Desktop Browser";

  if (/iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    kind = "tablet";
    model = "Apple iPad";
  } else if (/iPhone/i.test(ua)) {
    kind = "mobile";
    model = "Apple iPhone";
  } else if (/Android/i.test(ua)) {
    kind = /Mobile/i.test(ua) ? "mobile" : "tablet";
    const match = ua.match(/Android\s+[\d.]+;\s*([^;)]+)/i);
    if (match && match[1]) {
      const raw = match[1].replace(/Build\/.*$/i, "").trim();
      if (/SM-[A-Z0-9]+/i.test(raw)) model = `Samsung (${raw})`;
      else if (/Pixel/i.test(raw)) model = `Google ${raw}`;
      else if (raw.length > 2 && raw.length < 28) model = raw;
      else model = kind === "tablet" ? "Android Tablet" : "Android Phone";
    } else {
      model = kind === "tablet" ? "Android Tablet" : "Android Phone";
    }
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    kind = "desktop";
    model = "Mac Desktop";
  } else if (/Windows NT/i.test(ua)) {
    kind = "desktop";
    model = "Windows PC";
  } else if (/CrOS/i.test(ua)) {
    kind = "desktop";
    model = "Chromebook";
  } else if (/Linux/i.test(ua)) {
    kind = "desktop";
    model = "Desktop Browser";
  }

  let pushStatus: "enabled" | "denied" | "prompt" | "unsupported" = "unsupported";
  if ("Notification" in window) {
    if (Notification.permission === "granted") pushStatus = "enabled";
    else if (Notification.permission === "denied") pushStatus = "denied";
    else pushStatus = "prompt";
  }

  return { kind, model, browser, isStandalone, pushStatus };
}

/**
 * Deduplicates a list of devices so the same user or same browser session never shows
 * up as dozens of identical workstation cards.
 */
function deduplicateDevices(devices: ConnectedDevice[], currentDeviceId: string): ConnectedDevice[] {
  const now = Date.now();
  const valid = devices
    .filter((d) => d && d.id && d.online !== false && now - Number(d.lastPing || 0) <= ACTIVE_THRESHOLD_MS)
    .map((d) => ({
      ...d,
      model: d.model === "Linux Workstation" ? "Desktop Browser" : d.model,
      isCurrent: d.id === currentDeviceId,
    }))
    .sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      return Number(b.lastPing || 0) - Number(a.lastPing || 0);
    });

  const seenKeys = new Set<string>();
  const result: ConnectedDevice[] = [];

  for (const dev of valid) {
    const idKey = `id:${dev.id}`;
    if (seenKeys.has(idKey)) continue;

    // Collapse multiple sessions from the same user on the same device kind + browser,
    // and collapse duplicate anonymous guest sessions.
    const isGuest = Boolean(dev.isGuest || !dev.userId || dev.userId.startsWith("guest"));
    const identityKey = !isGuest
      ? `user:${dev.userId}:${dev.kind}:${dev.browser}`
      : `guest:${dev.kind}:${dev.model}:${dev.browser}`;

    if (seenKeys.has(identityKey)) continue;
    seenKeys.add(idKey);
    seenKeys.add(identityKey);
    result.push(dev);
  }

  return result;
}

export function readConnectedDevices(): ConnectedDevice[] {
  if (typeof window === "undefined") return [];
  const currentId = getDeviceId();
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConnectedDevice[];
    if (!Array.isArray(parsed)) return [];
    return deduplicateDevices(parsed, currentId);
  } catch {
    return [];
  }
}

function writeLocalRegistry(devices: ConnectedDevice[]) {
  if (typeof window === "undefined") return;
  try {
    const deduped = deduplicateDevices(devices, getDeviceId());
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(deduped));
  } catch {}
}

export async function syncCurrentDeviceToRegistry(user: Student | null): Promise<ConnectedDevice> {
  const deviceId = getDeviceId();
  const details = detectDeviceDetails();
  const now = Date.now();
  const existing = readConnectedDevices();
  const prev = existing.find((d) => d.id === deviceId);

  const entry: ConnectedDevice = {
    id: deviceId,
    userId: user?.id ?? `guest-${deviceId}`,
    name: user?.name ?? "Guest Visitor",
    email: user?.email ?? undefined,
    role: user?.role ?? "student",
    house: user?.house ?? null,
    grade: user?.grade ?? null,
    kind: details.kind,
    model: details.model,
    browser: details.browser,
    isStandalone: details.isStandalone,
    pushStatus: details.pushStatus,
    online: true,
    connectedAt: prev?.connectedAt ?? now,
    lastPing: now,
    isCurrent: true,
    isGuest: !user,
  };

  const updated = [entry, ...existing.filter((d) => d.id !== deviceId)];
  writeLocalRegistry(updated);

  // Sync to MongoDB API
  try {
    await fetch("/api/devices/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  } catch {}

  // Sync to Firestore if signed in with Firebase Auth
  if (firebaseAuth.currentUser) {
    try {
      await setDoc(
        doc(firebaseDb, "connectedDevices", deviceId),
        {
          ...entry,
          uid: firebaseAuth.currentUser.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {}
  }

  return entry;
}

export async function removeCurrentDeviceFromRegistry(): Promise<void> {
  const deviceId = getDeviceId();
  const existing = readConnectedDevices().filter((d) => d.id !== deviceId);
  writeLocalRegistry(existing);

  try {
    await fetch("/api/devices/heartbeat", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deviceId, online: false }),
    });
  } catch {}

  if (firebaseAuth.currentUser) {
    try {
      await deleteDoc(doc(firebaseDb, "connectedDevices", deviceId));
    } catch {}
  }
}

export function subscribeConnectedDevices(
  onUpdate: (devices: ConnectedDevice[]) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const currentId = getDeviceId();
  let firestoreDevices: ConnectedDevice[] = [];
  let mongoDevices: ConnectedDevice[] = [];

  const emitMerged = () => {
    const localDevices = readConnectedDevices();
    const combined = [...localDevices, ...mongoDevices, ...firestoreDevices];
    const deduped = deduplicateDevices(combined, currentId);
    onUpdate(deduped);
  };

  const pollMongoDevices = async () => {
    try {
      const localCurrent = readConnectedDevices().find((d) => d.id === currentId);
      if (localCurrent) {
        const res = await fetch("/api/devices/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(localCurrent),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.devices)) {
            mongoDevices = data.devices;
            emitMerged();
          }
        }
      }
    } catch {}
  };

  void pollMongoDevices();
  const pollInterval = window.setInterval(pollMongoDevices, 15_000);

  let unsubFirestore = () => {};
  try {
    unsubFirestore = onSnapshot(
      collection(firebaseDb, "connectedDevices"),
      (snapshot) => {
        const now = Date.now();
        const freshDocs: ConnectedDevice[] = [];
        const staleDocIds: string[] = [];

        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const lastPing = Number(data.lastPing) || 0;
          if (data.online === false || now - lastPing > ACTIVE_THRESHOLD_MS) {
            staleDocIds.push(docSnap.id);
            return;
          }
          freshDocs.push({
            id: docSnap.id,
            userId: String(data.userId || "guest"),
            name: String(data.name || "Connected Device"),
            email: data.email ? String(data.email) : undefined,
            role: (data.role as Role) || "student",
            house: (data.house as House) || null,
            grade: typeof data.grade === "number" ? data.grade : null,
            kind: (data.kind as "mobile" | "tablet" | "desktop") || "desktop",
            model: String(data.model || "Desktop Browser"),
            browser: String(data.browser || "Browser"),
            isStandalone: Boolean(data.isStandalone),
            pushStatus: (data.pushStatus as ConnectedDevice["pushStatus"]) || "prompt",
            online: true,
            connectedAt: Number(data.connectedAt) || lastPing,
            lastPing,
            isCurrent: docSnap.id === currentId,
            isGuest: Boolean(data.isGuest),
          });
        });

        // Proactively delete stale or duplicate Firestore docs if authenticated
        if (firebaseAuth.currentUser && staleDocIds.length > 0) {
          staleDocIds.slice(0, 20).forEach((staleId) => {
            deleteDoc(doc(firebaseDb, "connectedDevices", staleId)).catch(() => {});
          });
        }

        firestoreDevices = deduplicateDevices(freshDocs, currentId);
        emitMerged();
      },
      () => {
        emitMerged();
      }
    );
  } catch {
    emitMerged();
  }

  const onRefreshEvent = () => {
    emitMerged();
  };
  window.addEventListener("shristi-refresh-devices", onRefreshEvent);
  window.addEventListener("storage", onRefreshEvent);

  emitMerged();

  return () => {
    window.clearInterval(pollInterval);
    unsubFirestore();
    window.removeEventListener("shristi-refresh-devices", onRefreshEvent);
    window.removeEventListener("storage", onRefreshEvent);
  };
}

export async function pingSingleDevice(targetDeviceId: string, senderName: string): Promise<void> {
  const currentId = getDeviceId();
  if (targetDeviceId === currentId) {
    chime(true);
    await triggerOSNotification({
      title: "Device Diagnostic Ping",
      body: `Direct ping from ${senderName} received on this device.`,
      urgent: true,
      actionTab: "broadcast",
    });
  }
  postBus({ type: "ping", senderName, urgent: true });
}

export async function pingAllDevices(senderName: string, urgent = true): Promise<void> {
  chime(urgent);
  postBus({ type: "ping", senderName, urgent });
  await triggerOSNotification({
    title: "System-Wide Diagnostic Ping",
    body: `Broadcast ping initiated by ${senderName}.`,
    urgent,
    actionTab: "broadcast",
  });
}

export async function cleanupStaleDevices(): Promise<number> {
  let removed = 0;
  const currentId = getDeviceId();

  // 1. Clean local storage
  const currentLocal = readConnectedDevices();
  writeLocalRegistry(currentLocal);

  // 2. Clean MongoDB
  try {
    const res = await fetch("/api/devices/clean", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      removed += Number(data.removedCount || 0);
    }
  } catch {}

  // 3. Clean Firestore stale and duplicate records
  if (firebaseAuth.currentUser) {
    try {
      const snapshot = await getDocs(collection(firebaseDb, "connectedDevices"));
      const now = Date.now();
      const seenIdentity = new Set<string>();
      const sortedDocs = [...snapshot.docs].sort(
        (a, b) => Number(b.data().lastPing || 0) - Number(a.data().lastPing || 0)
      );

      for (const docSnap of sortedDocs) {
        const data = docSnap.data();
        const lastPing = Number(data.lastPing) || 0;
        const isStale = data.online === false || now - lastPing > ACTIVE_THRESHOLD_MS;
        const isGuest = Boolean(data.isGuest || !data.userId || String(data.userId).startsWith("guest"));
        const identityKey = !isGuest
          ? `user:${data.userId}:${data.kind || "desktop"}:${data.browser || "Browser"}`
          : `guest:${data.kind || "desktop"}:${data.model || "Desktop"}:${data.browser || "Browser"}`;

        if (isStale || (seenIdentity.has(identityKey) && docSnap.id !== currentId)) {
          await deleteDoc(doc(firebaseDb, "connectedDevices", docSnap.id)).catch(() => {});
          removed += 1;
        } else {
          seenIdentity.add(identityKey);
        }
      }
    } catch {}
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("shristi-refresh-devices"));
  }
  return removed;
}

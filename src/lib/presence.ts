import { useEffect, useRef, useState } from "react";
import type { House, Role, Student } from "./types";
import { firebaseDb } from "./firebase-client";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { chime, postBus } from "./realtime";

export interface ConnectedDevice {
  id: string;
  userId: string;
  name: string;
  email?: string;
  house: House | null;
  grade: number | null;
  role: Role;
  kind: "mobile" | "desktop" | "tablet";
  model: string;
  browser: string;
  isStandalone: boolean;
  pushStatus: "enabled" | "blocked" | "unsupported" | "not-enabled";
  online: boolean;
  connectedAt?: number;
  lastPing: number;
  isCurrent?: boolean;
  isGuest?: boolean;
}

export function detectDeviceMetadata() {
  if (typeof window === "undefined") {
    return { kind: "desktop" as const, model: "Desktop Device", browser: "Unknown", isStandalone: false };
  }
  const ua = navigator.userAgent || "";
  const isTouch = "maxTouchPoints" in navigator && navigator.maxTouchPoints > 0;
  const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/i.test(ua);
  const isMobile = !isTablet && (/mobile|iphone|ipod|android|blackberry|opera mini|windows phone/i.test(ua) || (matchMedia("(pointer: coarse)").matches && window.innerWidth < 768));
  const kind: "mobile" | "desktop" | "tablet" = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  let model = "Desktop Workstation";
  if (/iPad/i.test(ua)) model = "Apple iPad";
  else if (/iPhone/i.test(ua)) model = "Apple iPhone";
  else if (/Macintosh|Mac OS X/i.test(ua)) model = isTouch ? "Apple iPad Pro" : "Apple Mac";
  else if (/Samsung|SM-[A-Z0-9]+/i.test(ua)) model = "Samsung Galaxy Smartphone";
  else if (/Redmi|POCO|Xiaomi|MI\s|Miui/i.test(ua)) model = "Xiaomi / Redmi Smartphone";
  else if (/Pixel/i.test(ua)) model = "Google Pixel Smartphone";
  else if (/OnePlus/i.test(ua)) model = "OnePlus Smartphone";
  else if (/OPPO|CPH[0-9]+/i.test(ua)) model = "Oppo Smartphone";
  else if (/vivo|V[0-9]{4}/i.test(ua)) model = "Vivo Smartphone";
  else if (/Android/i.test(ua)) model = isTablet ? "Android Tablet" : "Android Smartphone";
  else if (/Windows/i.test(ua)) model = "Windows PC";
  else if (/Linux/i.test(ua)) model = "Linux Workstation";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Microsoft Edge";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = isMobile ? "Chrome Mobile" : "Google Chrome";
  else if (/CriOS/i.test(ua)) browser = "Chrome iOS";
  else if (/FxiOS/i.test(ua)) browser = "Firefox iOS";
  else if (/Version\/.*Safari/i.test(ua)) browser = isMobile ? "Mobile Safari" : "Safari";
  else if (/Firefox/i.test(ua)) browser = "Firefox";

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  return { kind, model, browser, isStandalone };
}

export function getPushStatus(): "enabled" | "blocked" | "unsupported" | "not-enabled" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "enabled";
  if (Notification.permission === "denied") return "blocked";
  return "not-enabled";
}

export function getOrGenerateDeviceId(): string {
  if (typeof window === "undefined") return `dev-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const PERSISTENT_KEY = "shristi_registered_device_id_v5";
    const SESSION_KEY = "shristi_device_session_id_v4";
    let stored = localStorage.getItem(PERSISTENT_KEY);
    if (!stored) {
      stored = sessionStorage.getItem(SESSION_KEY);
    }
    if (!stored) {
      stored = `dev-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        localStorage.setItem(PERSISTENT_KEY, stored);
      } catch {}
      try {
        sessionStorage.setItem(SESSION_KEY, stored);
      } catch {}
    }
    return stored;
  } catch {
    return `dev-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function getDeviceConnectedTimestamp(): number {
  if (typeof window === "undefined") return Date.now();
  try {
    const KEY = "shristi_device_connected_at_v5";
    const existing = localStorage.getItem(KEY);
    if (existing) {
      const num = Number(existing);
      if (!Number.isNaN(num) && num > 0) return num;
    }
    const now = Date.now();
    localStorage.setItem(KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

/**
 * Builds the ConnectedDevice object for the current host device.
 */
export function buildCurrentDevice(user: Student | null): ConnectedDevice {
  const devId = getOrGenerateDeviceId();
  const meta = detectDeviceMetadata();
  const pushStatus = getPushStatus();
  const connectedAt = getDeviceConnectedTimestamp();
  const isGuest = !user;

  return {
    id: devId,
    userId: user ? user.id : "guest",
    name: user ? user.name : `${meta.model} (Visitor)`,
    email: user?.email,
    house: user ? user.house : null,
    grade: user ? user.grade : null,
    role: user ? user.role : "student",
    kind: meta.kind,
    model: meta.model,
    browser: meta.browser,
    isStandalone: meta.isStandalone,
    pushStatus,
    online: true,
    connectedAt,
    lastPing: Date.now(),
    isCurrent: true,
    isGuest,
  };
}

/**
 * Immediately synchronizes the current connected device to both the server live registry
 * and Cloud Firestore `/onlineDevices/{deviceId}`.
 */
export async function syncCurrentDeviceToRegistry(user: Student | null): Promise<ConnectedDevice[]> {
  if (typeof window === "undefined") return [];
  const dev = buildCurrentDevice(user);
  let livePeers: ConnectedDevice[] = [];

  // 1. Dual-channel server heartbeat (guaranteed cross-device sync)
  try {
    const res = await fetch("/api/devices/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dev),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.devices)) {
        livePeers = data.devices as ConnectedDevice[];
      }
    }
  } catch {}

  // 2. Cloud Firestore synchronization (when reachable)
  try {
    const docRef = doc(firebaseDb, "onlineDevices", dev.id);
    await setDoc(
      docRef,
      {
        id: dev.id,
        userId: dev.userId,
        name: dev.name,
        email: dev.email || "",
        house: dev.house || "",
        grade: dev.grade ?? null,
        role: dev.role,
        kind: dev.kind,
        model: dev.model,
        browser: dev.browser,
        isStandalone: dev.isStandalone,
        pushStatus: dev.pushStatus,
        online: true,
        isGuest: Boolean(dev.isGuest),
        connectedAt: dev.connectedAt || Date.now(),
        lastPing: Date.now(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch {}

  return livePeers;
}

/**
 * React hook that connects the current device to the registry upon visiting the site,
 * maintaining local BroadcastChannel sync, live API server sync, and Firestore cloud synchronization.
 */
export function useLocalPresence(user: Student | null) {
  const deviceIdRef = useRef<string>(getOrGenerateDeviceId());
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);

  useEffect(() => {
    const devId = deviceIdRef.current;
    const ownDevice = buildCurrentDevice(user);
    const peers = new Map<string, ConnectedDevice>([[devId, ownDevice]]);

    const updateDevicesState = () => {
      const now = Date.now();
      const list = Array.from(peers.values())
        .filter((d) => d.online !== false && (d.id === devId || now - d.lastPing < 300000))
        .map((d) => ({ ...d, isCurrent: d.id === devId }))
        .sort((a, b) => {
          if (a.isCurrent) return -1;
          if (b.isCurrent) return 1;
          return a.name.localeCompare(b.name);
        });
      setDevices(list);
    };

    // 1. BroadcastChannel (Same-device / multi-tab synchronization)
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("shristi-device-presence-v4");
      channel.onmessage = (event) => {
        const message = event.data as {
          type: string;
          device?: ConnectedDevice;
          id?: string;
          senderName?: string;
          urgent?: boolean;
          targetDeviceId?: string;
        };
        if (message.type === "leave" && message.id) {
          peers.delete(message.id);
          updateDevicesState();
        } else if (message.type === "ping") {
          if (!message.targetDeviceId || message.targetDeviceId === devId) {
            chime(Boolean(message.urgent));
          }
        } else if (message.device?.id) {
          peers.set(message.device.id, {
            ...message.device,
            lastPing: Date.now(),
            isCurrent: message.device.id === devId,
          });
          if (message.type === "hello") {
            channel?.postMessage({ type: "heartbeat", device: buildCurrentDevice(user) });
          }
          updateDevicesState();
        }
      };
      channel.postMessage({ type: "hello", device: ownDevice });
    } catch {
      channel = null;
    }

    // 2. Poll & Heartbeat with Server Live Registry
    const pollServerDevices = async () => {
      const serverDevices = await syncCurrentDeviceToRegistry(user);
      if (serverDevices && serverDevices.length) {
        serverDevices.forEach((d) => {
          if (d.id !== devId) {
            peers.set(d.id, {
              ...d,
              lastPing: Date.now(),
              isCurrent: false,
            });
          }
        });
        updateDevicesState();
      }
    };
    void pollServerDevices();

    // 3. Listen to Firestore onlineDevices collection when accessible
    let unsubscribeFirestore: (() => void) | null = null;
    try {
      unsubscribeFirestore = onSnapshot(
        collection(firebaseDb, "onlineDevices"),
        (snapshot) => {
          const now = Date.now();
          snapshot.docs.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            const id = docSnapshot.id;
            if (id === devId) return; // Keep our own local instance authoritative
            const lastPing = Number(data.lastPing) || 0;
            const isOnline = data.online !== false && (now - lastPing < 300000 || lastPing > now - 300000);
            if (isOnline && (data.id || data.model)) {
              peers.set(id, {
                id,
                userId: String(data.userId || "guest"),
                name: String(data.name || data.model || "Connected Device"),
                email: data.email ? String(data.email) : undefined,
                house: (data.house as House) || null,
                grade: data.grade !== undefined && data.grade !== null ? Number(data.grade) : null,
                role: (data.role as Role) || "student",
                kind: (data.kind as "mobile" | "desktop" | "tablet") || "desktop",
                model: String(data.model || "Connected Device"),
                browser: String(data.browser || "Web Browser"),
                isStandalone: Boolean(data.isStandalone),
                pushStatus: (data.pushStatus as ConnectedDevice["pushStatus"]) || "not-enabled",
                online: true,
                connectedAt: Number(data.connectedAt) || lastPing,
                lastPing: Date.now(),
                isCurrent: false,
                isGuest: Boolean(data.isGuest),
              });
            } else {
              peers.delete(id);
            }
          });
          updateDevicesState();
        },
        () => undefined
      );
    } catch {}

    updateDevicesState();

    // 4. Heartbeat loop (every 25 seconds when visible, 60 seconds in background)
    let tick: ReturnType<typeof setTimeout>;
    const runTick = () => {
      const own = buildCurrentDevice(user);
      peers.set(devId, own);
      const now = Date.now();
      for (const [peerId, peer] of peers) {
        if (peerId !== devId && now - peer.lastPing > 300000) {
          peers.delete(peerId);
        }
      }
      channel?.postMessage({ type: "heartbeat", device: own });
      void pollServerDevices();
      updateDevicesState();

      const isVisible = document.visibilityState === "visible" || document.hasFocus();
      const tickDelay = isVisible ? 25000 : 60000;
      tick = setTimeout(runTick, tickDelay);
    };
    tick = setTimeout(runTick, document.visibilityState === "visible" ? 25000 : 60000);

    // 5. Active triggers on window focus, visibility change, and custom event
    const handleActivity = () => {
      void pollServerDevices();
    };
    window.addEventListener("focus", handleActivity);
    document.addEventListener("visibilitychange", handleActivity);
    window.addEventListener("shristi-refresh-devices", handleActivity);

    // 6. Graceful offline cleanup on unload/pagehide ONLY (never on React effect re-renders)
    const handleLeave = () => {
      channel?.postMessage({ type: "leave", id: devId });
      try {
        deleteDoc(doc(firebaseDb, "onlineDevices", devId)).catch(() => {
          setDoc(doc(firebaseDb, "onlineDevices", devId), { online: false, lastPing: Date.now() }, { merge: true }).catch(() => undefined);
        });
      } catch {}
    };

    window.addEventListener("pagehide", handleLeave);
    window.addEventListener("beforeunload", handleLeave);

    return () => {
      clearTimeout(tick);
      window.removeEventListener("focus", handleActivity);
      document.removeEventListener("visibilitychange", handleActivity);
      window.removeEventListener("shristi-refresh-devices", handleActivity);
      window.removeEventListener("pagehide", handleLeave);
      window.removeEventListener("beforeunload", handleLeave);
      channel?.close();
      unsubscribeFirestore?.();
    };
  }, [user?.id, user?.name, user?.role, user?.grade, user?.house, user?.email]);

  return devices;
}

/**
 * Triggers a real-time diagnostic chime and visual pulse to all online devices.
 */
export async function pingAllDevices(senderName: string, urgent = true): Promise<void> {
  chime(urgent);
  postBus({ type: "ping", senderName, urgent });
  const devId = getOrGenerateDeviceId();
  try {
    const channel = new BroadcastChannel("shristi-device-presence-v4");
    channel.postMessage({ type: "ping", senderName, urgent, fromDeviceId: devId });
    setTimeout(() => channel.close(), 1000);
  } catch {}

  // Broadcast to server API
  try {
    await fetch("/api/notifications/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Diagnostic Ping from ${senderName}`,
        body: `Test signal delivered across connected devices at ${new Date().toLocaleTimeString()}.`,
        urgent,
        senderName,
        actionTab: "dashboard",
        audience: { kind: "all" },
      }),
    });
  } catch {}

  // Also post to Firestore so devices across separate networks / physical phones chime
  try {
    const pingDocId = `ping-${Date.now()}`;
    await setDoc(doc(firebaseDb, "broadcasts", pingDocId), {
      id: pingDocId,
      title: `Diagnostic Ping from ${senderName}`,
      body: `Test signal delivered across connected devices at ${new Date().toLocaleTimeString()}.`,
      urgent,
      senderName,
      actionTab: "dashboard",
      audience: { kind: "all" },
      timestamp: Date.now(),
      isPing: true,
    });
  } catch {}
}

/**
 * Sends a targeted ping to a single device.
 */
export async function pingSingleDevice(targetDeviceId: string, senderName: string, urgent = true): Promise<void> {
  postBus({ type: "ping", senderName, urgent, targetDeviceId });
  try {
    const channel = new BroadcastChannel("shristi-device-presence-v4");
    channel.postMessage({ type: "ping", senderName, urgent, targetDeviceId });
    setTimeout(() => channel.close(), 1000);
  } catch {}

  try {
    await fetch("/api/notifications/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Direct Ping from ${senderName}`,
        body: `Direct ping signal received for your device.`,
        urgent,
        senderName,
        actionTab: "dashboard",
        audience: { kind: "all" },
        targetDeviceId,
      }),
    });
  } catch {}

  try {
    const pingDocId = `ping-${Date.now()}`;
    await setDoc(doc(firebaseDb, "broadcasts", pingDocId), {
      id: pingDocId,
      title: `Direct Ping from ${senderName}`,
      body: `Direct ping signal received for your device.`,
      urgent,
      senderName,
      actionTab: "dashboard",
      audience: { kind: "all" },
      timestamp: Date.now(),
      targetDeviceId,
      isPing: true,
    });
  } catch {}
}

/**
 * Removes stale device documents from Server registry and Firestore.
 */
export async function cleanupStaleDevices(): Promise<number> {
  let removed = 0;
  try {
    const res = await fetch("/api/devices/clean", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      removed += Number(data.removed || 0);
    }
  } catch {}

  try {
    const { getDocs } = await import("firebase/firestore");
    const cutoff = Date.now() - 60000;
    const snapshot = await getDocs(collection(firebaseDb, "onlineDevices"));
    const promises = snapshot.docs
      .filter((d) => {
        const lastPing = Number(d.data().lastPing) || 0;
        return lastPing < cutoff || d.data().online === false;
      })
      .map((d) => {
        removed++;
        return deleteDoc(d.ref);
      });
    await Promise.all(promises);
  } catch {}

  return removed;
}

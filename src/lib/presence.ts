import { useEffect, useRef, useState } from "react";
import type { House, Role, Student } from "./types";

export interface ConnectedDevice {
  id: string;
  userId: string;
  name: string;
  house: House | null;
  grade: number | null;
  role: Role;
  kind: "mobile" | "desktop";
  lastPing: number;
}

export function useLocalPresence(user: Student | null) {
  const id = useRef(`tab-${Math.random().toString(36).slice(2)}`);
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  useEffect(() => {
    if (!user) { setDevices([]); return; }
    let channel: BroadcastChannel | null = null;
    const own = (): ConnectedDevice => ({ id: id.current, userId: user.id, name: user.name, house: user.house, grade: user.grade, role: user.role, kind: matchMedia("(pointer: coarse)").matches ? "mobile" : "desktop", lastPing: Date.now() });
    const peers = new Map<string, ConnectedDevice>([[id.current, own()]]);
    const update = () => setDevices([...peers.values()].sort((a, b) => a.name.localeCompare(b.name)));
    try {
      channel = new BroadcastChannel("shristi-device-presence-v3");
      channel.onmessage = (event) => {
        const message = event.data as { type: string; device?: ConnectedDevice; id?: string };
        if (message.type === "leave" && message.id) peers.delete(message.id);
        if (message.device?.id && message.device.userId && message.device.id !== id.current) {
          peers.set(message.device.id, { ...message.device, lastPing: Date.now() });
          if (message.type === "hello") channel?.postMessage({ type: "heartbeat", device: own() });
        }
        update();
      };
      channel.postMessage({ type: "hello", device: own() });
    } catch { channel = null; }
    update();
    const tick = setInterval(() => {
      peers.set(id.current, own());
      for (const [peerId, device] of peers) if (Date.now() - device.lastPing > 16000) peers.delete(peerId);
      channel?.postMessage({ type: "heartbeat", device: own() });
      update();
    }, 5000);
    const leave = () => channel?.postMessage({ type: "leave", id: id.current });
    window.addEventListener("pagehide", leave);
    return () => { clearInterval(tick); window.removeEventListener("pagehide", leave); leave(); channel?.close(); };
  }, [user?.id, user?.name, user?.role, user?.grade, user?.house]);
  return devices;
}
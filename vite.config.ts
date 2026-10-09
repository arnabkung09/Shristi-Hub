import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type Connect } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

import admin from "firebase-admin";

let serviceAccount;
try {
  const serviceAccountPath = path.join(__dirname, 'backend/serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  }
} catch (err) {
  console.warn("Could not load serviceAccountKey.json, checking environment variables.");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: serviceAccount 
      ? admin.credential.cert(serviceAccount) 
      : admin.credential.applicationDefault()
  });
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DeviceRecord {
  id: string;
  userId: string;
  name: string;
  email?: string;
  house?: string | null;
  grade?: number | null;
  role: string;
  kind: "mobile" | "desktop" | "tablet";
  model: string;
  browser: string;
  isStandalone: boolean;
  pushStatus: "enabled" | "blocked" | "unsupported" | "not-enabled";
  online: boolean;
  connectedAt: number;
  lastPing: number;
  isGuest: boolean;
}

interface NotificationBroadcast {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
  actionTab?: string;
  audience: Record<string, unknown>;
  senderName: string;
  timestamp: number;
  targetDeviceId?: string;
}

const DEVICE_REGISTRY_FILE = "/tmp/shristi_device_registry.json";

function loadPersistedDevices(map: Map<string, DeviceRecord>) {
  try {
    if (fs.existsSync(DEVICE_REGISTRY_FILE)) {
      const raw = fs.readFileSync(DEVICE_REGISTRY_FILE, "utf-8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const now = Date.now();
        list.forEach((d: DeviceRecord) => {
          if (d && d.id && now - (d.lastPing || 0) < 600000) {
            map.set(d.id, d);
          }
        });
      }
    }
  } catch {}
}

function savePersistedDevices(map: Map<string, DeviceRecord>) {
  try {
    const list = Array.from(map.values());
    fs.writeFileSync(DEVICE_REGISTRY_FILE, JSON.stringify(list), "utf-8");
  } catch {}
}

import webPush from "web-push";

const VAPID_KEYS_FILE = "/tmp/shristi_vapid_keys.json";
const SUBSCRIPTIONS_FILE = "/tmp/shristi_push_subscriptions.json";

function loadOrGenerateVapidKeys() {
  try {
    if (fs.existsSync(VAPID_KEYS_FILE)) {
      return JSON.parse(fs.readFileSync(VAPID_KEYS_FILE, "utf-8"));
    }
  } catch {}
  const keys = webPush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_KEYS_FILE, JSON.stringify(keys), "utf-8");
  } catch {}
  return keys;
}

const vapidKeys = loadOrGenerateVapidKeys();
webPush.setVapidDetails(
  "mailto:admin@shristiacademy.edu.np",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

interface PushSubscriptionRecord {
  deviceId: string;
  userId: string;
  subscription: webPush.PushSubscription;
}

function loadPersistedSubscriptions(map: Map<string, PushSubscriptionRecord>) {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const raw = fs.readFileSync(SUBSCRIPTIONS_FILE, "utf-8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach((sub: PushSubscriptionRecord) => {
          if (sub && sub.deviceId) map.set(sub.deviceId, sub);
        });
      }
    }
  } catch {}
}

function savePersistedSubscriptions(map: Map<string, PushSubscriptionRecord>) {
  try {
    const list = Array.from(map.values());
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(list), "utf-8");
  } catch {}
}

function liveDeviceRegistryPlugin(): Plugin {
  const devices = new Map<string, DeviceRecord>();
  loadPersistedDevices(devices);
  const pushSubscriptions = new Map<string, PushSubscriptionRecord>();
  loadPersistedSubscriptions(pushSubscriptions);
  const broadcasts: NotificationBroadcast[] = [];

  const handleMiddleware: Connect.NextHandleFunction = (req, res, next) => {
    const rawUrl = req.url || "";
    const cleanUrl = rawUrl.split("?")[0];

    // Enable cross-origin headers for multi-instance / iframe environments
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    // 1. Device Heartbeat & Registration
    if (cleanUrl === "/api/devices/heartbeat" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          loadPersistedDevices(devices);
          const data = JSON.parse(body || "{}") as Partial<DeviceRecord>;
          const deviceId = data.id || `dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const userName = data.name || "Connected Device";
          const userRole = data.role || "student";
          const userId = data.userId || "guest";
          const deviceModel = data.model || "Workstation";
          const deviceKind = data.kind || "desktop";
          const isNonAdmin = userRole !== "admin" || userName.toLowerCase().includes("alex") || userId.toLowerCase().includes("alex");

          console.log(`[DEVICE REGISTRY DEBUG] 📥 Heartbeat received: deviceId=${deviceId}, userId=${userId}, user="${userName}", role=${userRole}, kind=${deviceKind}, model="${deviceModel}"`);

          if (isNonAdmin) {
            console.log(`[DEVICE REGISTRY DEBUG] 👤 Non-admin / student heartbeat: "${userName}" (ID: ${userId}, role: ${userRole}) on ${deviceModel} [${deviceId}]`);
          }

          devices.set(deviceId, {
            id: deviceId,
            userId,
            name: userName,
            email: data.email,
            house: data.house ?? null,
            grade: data.grade ?? null,
            role: userRole,
            kind: deviceKind,
            model: deviceModel,
            browser: data.browser || "Browser",
            isStandalone: Boolean(data.isStandalone),
            pushStatus: data.pushStatus || "not-enabled",
            online: true,
            connectedAt: Number(data.connectedAt) || Date.now(),
            lastPing: Date.now(),
            isGuest: Boolean(data.isGuest),
          });

          const now = Date.now();
          for (const [id, d] of devices.entries()) {
            if (now - d.lastPing > 600000) { // Retain active status for 10 minutes for mobile apps
              console.log(`[DEVICE REGISTRY DEBUG] ⏱️ Pruned stale device: ${id} ("${d.name}", last active ${Math.round((now - d.lastPing) / 1000)}s ago)`);
              devices.delete(id);
            }
          }

          savePersistedDevices(devices);
          console.log(`[DEVICE REGISTRY DEBUG] 💾 Saved to ${DEVICE_REGISTRY_FILE}. Total registered devices: ${devices.size}. Active devices: [${Array.from(devices.values()).map(d => `${d.name} (${d.model}, ${d.id})`).join(", ")}]`);

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, devices: Array.from(devices.values()) }));
        } catch (err) {
          console.error("[DEVICE REGISTRY DEBUG] ❌ Failed to process heartbeat request:", err);
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      });
      return;
    }

    // 2. Query Live Devices
    if (cleanUrl === "/api/devices" && req.method === "GET") {
      loadPersistedDevices(devices);
      const now = Date.now();
      for (const [id, d] of devices.entries()) {
        if (now - d.lastPing > 600000) {
          devices.delete(id);
        }
      }
      console.log(`[DEVICE REGISTRY DEBUG] 📋 GET /api/devices: returning ${devices.size} devices [${Array.from(devices.values()).map(d => `${d.name} (${d.model}, role: ${d.role})`).join(", ")}]`);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, devices: Array.from(devices.values()) }));
      return;
    }

    // 3. Clear Stale Devices
    if (cleanUrl === "/api/devices/clean" && req.method === "POST") {
      loadPersistedDevices(devices);
      const now = Date.now();
      let removed = 0;
      for (const [id, d] of devices.entries()) {
        if (now - d.lastPing > 300000 || !d.online) {
          devices.delete(id);
          removed++;
        }
      }
      savePersistedDevices(devices);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, removed, devices: Array.from(devices.values()) }));
      return;
    }

    // 4. Post Push Notification Broadcast
    if (cleanUrl === "/api/notifications/broadcast" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const data = JSON.parse(body || "{}") as Partial<NotificationBroadcast>;
          const record: NotificationBroadcast = {
            id: data.id || `bc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: data.title || "Council Notification",
            body: data.body || "",
            urgent: Boolean(data.urgent),
            actionTab: data.actionTab || "dashboard",
            audience: data.audience || { kind: "all" },
            senderName: data.senderName || "Council Officer",
            timestamp: Date.now(),
            targetDeviceId: data.targetDeviceId,
          };
          broadcasts.push(record);
          if (broadcasts.length > 60) broadcasts.shift();

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, broadcast: record }));
        } catch {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      });
      return;
    }

    // 5. Query Recent Broadcasts
    if (cleanUrl === "/api/notifications/recent" && req.method === "GET") {
      const urlParams = new URL(rawUrl, "http://localhost").searchParams;
      const since = Number(urlParams.get("since")) || (Date.now() - 60000);
      const filtered = broadcasts.filter((b) => b.timestamp > since);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, broadcasts: filtered }));
      return;
    }

    // 6. Web Push VAPID Key
    if (cleanUrl === "/api/push/public-key" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, publicKey: vapidKeys.publicKey }));
      return;
    }

    // 7. Subscribe to Web Push
    if (cleanUrl === "/api/push/subscribe" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const data = JSON.parse(body || "{}");
          if (!data.subscription || !data.deviceId || !data.userId) {
            throw new Error("Missing required fields");
          }
          pushSubscriptions.set(data.deviceId, {
            deviceId: data.deviceId,
            userId: data.userId,
            subscription: data.subscription,
          });
          savePersistedSubscriptions(pushSubscriptions);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid subscription payload" }));
        }
      });
      return;
    }

    // 8. Broadcast Web Push
    if (cleanUrl === "/api/push/broadcast" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const data = JSON.parse(body || "{}");
          const payload = JSON.stringify({
            title: data.title || "Shristi Academy",
            body: data.body || "",
            url: data.url || "/",
            urgent: Boolean(data.urgent),
          });
          
          let successCount = 0;
          let pruneCount = 0;
          const subs = Array.from(pushSubscriptions.values());
          
          for (const sub of subs) {
            try {
              await webPush.sendNotification(sub.subscription, payload);
              successCount++;
            } catch (err: any) {
              if (err.statusCode === 404 || err.statusCode === 410) {
                pushSubscriptions.delete(sub.deviceId);
                pruneCount++;
              }
            }
          }
          savePersistedSubscriptions(pushSubscriptions);
          
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, reached: subs.length, success: successCount, pruned: pruneCount }));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      });
      return;
    }

    // 9. Send Targeted Web Push
    if (cleanUrl === "/api/push/send-targeted" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const data = JSON.parse(body || "{}");
          const payload = JSON.stringify({
            title: data.title || "Shristi Academy",
            body: data.body || "",
            url: data.url || "/",
            urgent: Boolean(data.urgent),
          });
          
          const targetRole = data.role;
          const targetUserId = data.userId;
          const targetDeviceId = data.deviceId;
          
          let successCount = 0;
          let pruneCount = 0;
          let matched = 0;
          
          const subs = Array.from(pushSubscriptions.values());
          for (const sub of subs) {
            // Check if matches
            let match = false;
            if (targetDeviceId) {
              match = sub.deviceId === targetDeviceId;
            } else if (targetUserId) {
              match = sub.userId === targetUserId;
            } else if (targetRole) {
              const dev = devices.get(sub.deviceId);
              if (dev && dev.role === targetRole) match = true;
            }
            
            if (match) {
              matched++;
              try {
                await webPush.sendNotification(sub.subscription, payload);
                successCount++;
              } catch (err: any) {
                if (err.statusCode === 404 || err.statusCode === 410) {
                  pushSubscriptions.delete(sub.deviceId);
                  pruneCount++;
                }
              }
            }
          }
          savePersistedSubscriptions(pushSubscriptions);
          
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, matched, success: successCount, pruned: pruneCount }));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      });
      return;
    }

    
    

    
    // FCM HTTP v1 Secure Endpoint
    if (cleanUrl === "/api/fcm/send" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const data = JSON.parse(body || "{}");
          const tokens = data.tokens;
          const notification = data.notification;
          
          if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: "No valid tokens provided." }));
          }

          const message = {
            notification: {
              title: notification.title,
              body: notification.body
            },
            data: data.data || {},
            tokens: tokens,
          };

          const response = await admin.messaging().sendEachForMulticast(message);
          
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ 
            success: true, 
            successCount: response.successCount, 
            failureCount: response.failureCount 
          }));
        } catch (err) {
          console.error("FCM Error:", err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    next();
  };

  return {
    name: "live-device-registry",
    configureServer(server) {
      server.middlewares.use(handleMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleMiddleware);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), liveDeviceRegistryPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
});

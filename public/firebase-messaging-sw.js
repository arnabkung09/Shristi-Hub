/* Background FCM handler & OS-level Web Push Service Worker for Shristi Hub */
/* Features: Background Sync, Persistent BroadcastChannel, Offline Notification Queue via IndexedDB */

const DB_NAME = "shristi_sw_offline_queue_v1";
const STORE_NAME = "queued_notifications";
const PERSISTENT_CHANNEL_NAME = "shristi-persistent-notification-bus-v1";

let persistentChannel = null;
try {
  persistentChannel = new BroadcastChannel(PERSISTENT_CHANNEL_NAME);
  persistentChannel.onmessage = (event) => {
    if (event.data?.type === "FLUSH_NOTIFICATION_QUEUE") {
      void flushQueuedNotifications("broadcast-channel");
    }
  };
} catch {
  persistentChannel = null;
}

function broadcastToClients(message) {
  try {
    persistentChannel?.postMessage(message);
  } catch {}
  self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      try {
        client.postMessage(message);
      } catch {}
    });
  }).catch(() => undefined);
}

// ---------------- IndexedDB Offline Queue Engine ----------------
function openQueueDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function enqueueNotification(item) {
  try {
    const db = await openQueueDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({
        id: item.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: item.title,
        options: item.options || {},
        status: "pending",
        timestamp: item.timestamp || Date.now(),
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Could not enqueue notification in IndexedDB:", err);
    return false;
  }
}

async function getPendingNotifications() {
  try {
    const db = await openQueueDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        resolve(list.filter((x) => x.status === "pending"));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function markNotificationDelivered(id) {
  try {
    const db = await openQueueDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) {
          req.result.status = "delivered";
          req.result.deliveredAt = Date.now();
          store.put(req.result);
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function flushQueuedNotifications(triggerSource = "sync") {
  const pending = await getPendingNotifications();
  if (!pending.length) return;

  for (const item of pending) {
    try {
      await safeShowNotification(item.title, item.options);
      await markNotificationDelivered(item.id);
      broadcastToClients({
        type: "QUEUED_NOTIFICATION_DELIVERED",
        source: triggerSource,
        notification: {
          id: item.id,
          title: item.title,
          body: item.options?.body || "",
          actionTab: item.options?.data?.actionTab || "dashboard",
          urgent: Boolean(item.options?.requireInteraction || (item.options?.vibrate && item.options.vibrate.length > 3)),
          timestamp: item.timestamp,
        },
      });
    } catch (err) {
      console.warn("Failed to deliver queued notification:", err);
    }
  }
}

// ---------------- Service Worker Lifecycle ----------------
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(() => {
      return flushQueuedNotifications("sw-activate");
    })
  );
});

// ---------------- Background Sync Event ----------------
self.addEventListener("sync", (event) => {
  if (
    event.tag === "sync-queued-notifications" ||
    event.tag === "shristi-background-sync" ||
    event.tag === "notification-sync"
  ) {
    event.waitUntil(flushQueuedNotifications("background-sync"));
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "shristi-periodic-notification-sync") {
    event.waitUntil(flushQueuedNotifications("periodic-sync"));
  }
});

// Resilient showNotification with multi-brand mobile fallback (Samsung, Xiaomi, Oppo, Pixel, iOS)
function safeShowNotification(title, options) {
  return self.registration.showNotification(title, options).catch((err) => {
    console.warn("Primary showNotification rejected by mobile OS, retrying with core options:", err);
    return self.registration.showNotification(title, {
      body: options?.body || "New update received.",
      icon: options?.icon || "/pwa-192x192.png",
      tag: options?.tag || `shristi-${Date.now()}`,
      data: options?.data || {},
    });
  });
}

// ---------------- Message Handler from App Window ----------------
self.addEventListener("message", (event) => {
  if (!event.data) return;

  if (event.data.type === "FLUSH_NOTIFICATION_QUEUE") {
    event.waitUntil(flushQueuedNotifications("client-postMessage"));
    return;
  }

  if (event.data.type === "SHOW_NOTIFICATION" || event.data.type === "TEST_NOTIFICATION") {
    const title = event.data.title || "Shristi Student Council";
    const customOptions = event.data.options || {};
    const tag = customOptions.tag || `shristi-${Date.now()}`;
    const urgent = Boolean(customOptions.urgent);
    const actionTab = customOptions.data?.actionTab || "dashboard";

    const options = {
      body: customOptions.body || "New council notification received.",
      icon: customOptions.icon || "/pwa-192x192.png",
      badge: customOptions.badge || "/pwa-192x192.png",
      tag,
      renotify: true,
      vibrate: urgent ? [200, 100, 200, 100, 200] : [200, 100, 200],
      actions: [{ action: "open", title: "Open Council Hub" }],
      data: {
        actionTab,
        url: `${self.location.origin}/#${actionTab}`,
      },
    };

    // Store in offline queue as insurance, then display
    const storeTask = enqueueNotification({ id: tag, title, options, timestamp: Date.now() });
    const showTask = safeShowNotification(title, options).then(() => {
      return markNotificationDelivered(tag);
    });

    event.waitUntil(Promise.all([storeTask, showTask]));
  }
});

// ---------------- Initialize Firebase Messaging Compat ----------------
try {
  importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

  if (typeof firebase !== "undefined" && firebase.initializeApp) {
    firebase.initializeApp({
      apiKey: "AIzaSyB6l7lOrIBypZn4EMgUz6K7jV__UPyK2Nw",
      authDomain: "shristi-hub.firebaseapp.com",
      projectId: "shristi-hub",
      messagingSenderId: "312483296972",
      appId: "1:312483296972:web:b0f109554bfe830581b469",
    });

    if (
      firebase.messaging &&
      typeof firebase.messaging.isSupported === "function" &&
      firebase.messaging.isSupported()
    ) {
      const messaging = firebase.messaging();
      messaging.onBackgroundMessage((payload) => {
        const title =
          payload.notification?.title || payload.data?.title || "Shristi Student Council";
        const body = payload.notification?.body || payload.data?.body || "You have a new update.";
        const tag = payload.data?.notificationId || `shristi-bg-${Date.now()}`;
        const urgent = payload.data?.urgent === "true";
        const actionTab = payload.data?.actionTab || "dashboard";

        const options = {
          body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          tag,
          renotify: true,
          requireInteraction: urgent,
          vibrate: urgent ? [200, 100, 200, 100, 200] : [200, 100, 200],
          actions: [{ action: "open", title: "Open Council Hub" }],
          data: {
            actionTab,
            url: `${self.location.origin}/#${actionTab}`,
          },
        };

        // Queue in IndexedDB first so it survives device power cycling or network drops
        return enqueueNotification({ id: tag, title, options, timestamp: Date.now() })
          .then(() => safeShowNotification(title, options))
          .then(() => markNotificationDelivered(tag))
          .then(() => {
            broadcastToClients({
              type: "NEW_NOTIFICATION_RECEIVED",
              title,
              options,
              tag,
            });
          });
      });
    }
  }
} catch (error) {
  console.warn("FCM background initialization warning:", error);
}

// ---------------- Push Event Listener (Native Web Push) ----------------
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const notification = data.notification || {};
  const customData = data.data || {};
  const title =
    notification.title || customData.title || data.title || "Shristi Student Council";
  const body =
    notification.body || customData.body || data.body || "New council notification received.";
  const actionTab = customData.actionTab || data.actionTab || "dashboard";
  const urgent = customData.urgent === "true" || data.urgent === true;
  const tag = customData.notificationId || data.tag || `shristi-push-${Date.now()}`;

  const options = {
    body,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag,
    renotify: true,
    requireInteraction: urgent,
    vibrate: urgent ? [200, 100, 200, 100, 200] : [200, 100, 200],
    actions: [{ action: "open", title: "Open Council Hub" }],
    data: {
      actionTab,
      url: `${self.location.origin}/#${actionTab}`,
    },
  };

  const deliverTask = enqueueNotification({ id: tag, title, options, timestamp: Date.now() })
    .then(() => safeShowNotification(title, options))
    .then(() => markNotificationDelivered(tag))
    .then(() => {
      broadcastToClients({
        type: "NEW_NOTIFICATION_RECEIVED",
        title,
        options,
        tag,
      });
    });

  event.waitUntil(deliverTask);
});

// ---------------- Notification Click Handler ----------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const actionTab = event.notification.data?.actionTab || "dashboard";
  const targetUrl = event.notification.data?.url || `${self.location.origin}/#${actionTab}`;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Also flush any pending queued notifications when user clicks
        void flushQueuedNotifications("notificationclick");

        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            if ("navigate" in client) {
              return client
                .navigate(targetUrl)
                .then((focusedClient) => focusedClient?.focus?.() || client.focus());
            }
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

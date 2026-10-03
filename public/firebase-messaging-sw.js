/* Background FCM handler & OS-level Web Push Service Worker for Shristi Hub */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Initialize Firebase Messaging Compat in background Service Worker
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

    if (firebase.messaging && typeof firebase.messaging.isSupported === "function" && firebase.messaging.isSupported()) {
      const messaging = firebase.messaging();
      messaging.onBackgroundMessage((payload) => {
        const title = payload.notification?.title || payload.data?.title || "Shristi Student Council";
        const body = payload.notification?.body || payload.data?.body || "You have a new update.";
        const tag = payload.data?.notificationId || "shristi-bg-notification";
        const urgent = payload.data?.urgent === "true";
        const actionTab = payload.data?.actionTab || "dashboard";

        const options = {
          body,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag,
          renotify: urgent,
          requireInteraction: urgent,
          data: {
            actionTab,
            url: `${self.location.origin}/#${actionTab}`,
          },
        };

        return self.registration.showNotification(title, options);
      });
    }
  }
} catch (error) {
  console.warn("FCM background initialization warning:", error);
}

// Background Push event listener (native Web Push fallback)
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
  const title = notification.title || customData.title || data.title || "Shristi Student Council";
  const body = notification.body || customData.body || data.body || "New council notification received.";
  const actionTab = customData.actionTab || data.actionTab || "dashboard";
  const urgent = customData.urgent === "true" || data.urgent === true;

  const options = {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: customData.notificationId || data.tag || "shristi-os-push",
    renotify: urgent,
    requireInteraction: urgent,
    data: {
      actionTab,
      url: `${self.location.origin}/#${actionTab}`,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler: focus open app window or launch target URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const actionTab = event.notification.data?.actionTab || "dashboard";
  const targetUrl = event.notification.data?.url || `${self.location.origin}/#${actionTab}`;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, navigate it to target and focus
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          if ("navigate" in client) {
            return client.navigate(targetUrl).then((focusedClient) => focusedClient?.focus?.() || client.focus());
          }
          return client.focus();
        }
      }
      // If no window is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

/* Background FCM handler & Web Push Service Worker for Shristi Hub */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Try initializing Firebase Messaging Compat safely
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
        const options = {
          body: payload.notification?.body || payload.data?.body || "You have a new update.",
          icon: "/favicon.ico",
          tag: payload.data?.notificationId || "shristi-update",
          renotify: payload.data?.urgent === "true",
          data: { actionTab: payload.data?.actionTab || "dashboard" },
        };
        return self.registration.showNotification(title, options);
      });
    }
  }
} catch (error) {
  console.warn("FCM background script setup warning:", error);
}

// Fallback native push event listener (ensures background delivery works seamlessly)
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }
  const title = data.notification?.title || data.title || "Shristi Student Council";
  const options = {
    body: data.notification?.body || data.body || "New council notification received.",
    icon: "/favicon.ico",
    tag: data.tag || data.data?.notificationId || "shristi-push",
    renotify: data.urgent === true || data.data?.urgent === "true",
    data: data.data || { actionTab: data.actionTab || "dashboard" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = event.notification.data?.actionTab || "dashboard";
  const target = `${self.location.origin}/#${route}`;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) return existing.navigate(target).then(() => existing.focus());
      return clients.openWindow(target);
    })
  );
});

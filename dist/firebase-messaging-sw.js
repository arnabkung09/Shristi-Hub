/* Background FCM handler for the Shristi Hub Firebase project. */
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyB6l7lOrIBypZn4EMgUz6K7jV__UPyK2Nw",
  authDomain: "shristi-hub.firebaseapp.com",
  projectId: "shristi-hub",
  messagingSenderId: "312483296972",
  appId: "1:312483296972:web:b0f109554bfe830581b469",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "Shristi Student Council";
  const options = {
    body: payload.notification?.body || payload.data?.body || "You have a new update.",
    tag: payload.data?.notificationId || "shristi-update",
    renotify: payload.data?.urgent === "true",
    data: { actionTab: payload.data?.actionTab || "dashboard" },
  };
  return self.registration.showNotification(title, options);
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
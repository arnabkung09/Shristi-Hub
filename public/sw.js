self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const payload = event.data.json();
      let title = 'Shristi Academy';
      let body = 'New Notification';
      let url = '/';
      
      title = payload.title || title;
      body = payload.body || body;
      url = payload.url || (payload.data && payload.data.url) || url;

      const options = {
        body: body,
        icon: payload.icon || '/pwa-192x192.png',
        badge: payload.badge || '/pwa-192x192.png',
        tag: payload.tag || 'default-tag',
        renotify: payload.renotify !== false,
        actions: payload.actions || [],
        data: { url: url },
        vibrate: payload.urgent ? [200, 100, 200, 100, 200, 100, 400] : undefined
      };
      
      event.waitUntil(
        Promise.all([
          self.registration.showNotification(title, options),
          clients.matchAll({ type: 'window' }).then((windowClients) => {
            windowClients.forEach((client) => {
              client.postMessage({ type: 'PUSH_RECEIVED', payload });
            });
          })
        ])
      );
    } catch (e) {
      console.error('Error parsing push data', e);
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      let matchingClient = null;
      for (let i = 0; i < windowClients.length; i++) {
        const windowClient = windowClients[i];
        if (windowClient.url.includes(urlToOpen)) {
          matchingClient = windowClient;
          break;
        }
      }
      if (matchingClient) {
        return matchingClient.focus();
      } else {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

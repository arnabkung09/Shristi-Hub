self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

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

      const customIcon = (payload.icon || '').trim();
      const options = {
        body: body,
        ...(customIcon ? { icon: customIcon, badge: payload.badge || customIcon } : {}),
        tag: payload.tag || payload.notificationId || 'default-tag',
        renotify: payload.renotify !== false,
        actions: payload.actions || [],
        data: { url: url, actionTab: payload.actionTab || 'dashboard' },
        vibrate: payload.urgent ? [200, 100, 200, 100, 200, 100, 400] : [200, 100, 200]
      };

      event.waitUntil(
        Promise.all([
          self.registration.showNotification(title, options),
          self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
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

self.addEventListener('message', function(event) {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SHOW_NOTIFICATION' && data.title) {
    const opts = data.options || {};
    const customIcon = (opts.icon || '').trim();
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: opts.body || '',
        ...(customIcon ? { icon: customIcon, badge: opts.badge || customIcon } : {}),
        tag: opts.tag || 'shristi-sw-tag',
        data: opts.data || { url: '/' },
      }).catch(function() {})
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
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
      } else if (windowClients.length > 0) {
        return windowClients[0].focus();
      } else {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

/* Service Worker Web Push & notification interaction handlers for LEADERS XAUUSD PWA */

function parsePushPayload(event) {
  const fallback = {
    title: 'LEADERS XAUUSD · SURE Signal Update',
    body: 'Open app to view latest SURE XAU/USD trade status.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'leaders-sure-push',
    url: '/?tab=SURE',
    requireInteraction: true,
    renotify: true,
    vibrate: [200, 100, 200],
  };

  if (!event.data) return fallback;

  try {
    const parsed = event.data.json();
    if (parsed && typeof parsed === 'object') {
      return {
        ...fallback,
        ...parsed,
        url: typeof parsed.url === 'string' && parsed.url ? parsed.url : '/?tab=SURE',
      };
    }
  } catch {
    try {
      const txt = event.data.text();
      if (txt) {
        return { ...fallback, body: txt };
      }
    } catch {
      // Ignore unreadable push payload
    }
  }

  return fallback;
}

self.addEventListener('push', function (event) {
  const data = parsePushPayload(event);

  const notificationOptions = {
    body: data.body,
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/pwa-192x192.png',
    tag: data.tag || 'leaders-sure-push',
    renotify: data.renotify !== false,
    requireInteraction: Boolean(data.requireInteraction),
    vibrate: Array.isArray(data.vibrate) ? data.vibrate : [200, 100, 200],
    data: {
      url: data.url || '/?tab=SURE',
      kind: data.kind || null,
      signalId: data.signalId || null,
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOptions)
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) || '/?tab=SURE';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ('focus' in client) {
            return client.focus().then(function (focused) {
              if (focused && 'navigate' in focused && targetUrl && !focused.url.includes('tab=SURE')) {
                return focused.navigate(targetUrl).catch(function () {
                  return focused;
                });
              }
              return focused;
            });
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});

self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    fetch('/api/push/vapid-public-key')
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        if (!json || !json.publicKey) return null;
        var padding = '='.repeat((4 - (json.publicKey.length % 4)) % 4);
        var base64 = (json.publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
        var rawData = atob(base64);
        var keyBytes = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; i++) {
          keyBytes[i] = rawData.charCodeAt(i);
        }
        return self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes,
        });
      })
      .then(function (newSub) {
        if (!newSub) return null;
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: newSub.toJSON() }),
        });
      })
      .catch(function () {
        return undefined;
      })
  );
});

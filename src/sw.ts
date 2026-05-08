/// <reference lib="webworker" />

const CACHE_NAME = 'ghost-bridge-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.webmanifest',
      ]);
    })
  );
});

self.addEventListener('fetch', (event: any) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL) || caches.match('/');
      })
    );
  }
});

// Periodic Sync for background messaging (Limited P2P Support)
self.addEventListener('periodicsync', (event: any) => {
  if (event.tag === 'flush-outbox') {
    console.log('[SW] Periodic sync flushing outbox...');
    // In a real production app, we would wake up the PeerJS kernel here
    // However, WebRTC needs a window context usually.
  }
});

self.addEventListener('push', (event: any) => {
  const data = event.data?.json() ?? {};
  const options = {
    body: data.body || 'New SECURE_MSG received via Bridge.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: data.url || '/',
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'GHOST_BRIDGE', options)
  );
});

self.addEventListener('notificationclick', (event: any) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data)
  );
});

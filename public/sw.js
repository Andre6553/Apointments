// This is the "Offline copy of pages" service worker with Background Sync and Push Notifications

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

const CACHE = "pwabuilder-offline";
const offlineFallbackPage = "offline.html";

// Precache manifest from Vite
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

// Explicit Sync Listener for PWABuilder Detection
self.addEventListener('sync', (event) => {
  if (event.tag === 'supabase-sync') {
    console.log('Background Sync triggered for Supabase');
  }
});

// Background Sync Logic
const bgSyncPlugin = new workbox.backgroundSync.BackgroundSyncPlugin('supabase-sync', {
  maxRetentionTime: 24 * 60 // Retry for max of 24 Hours
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener('install', async (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add(offlineFallbackPage))
  );
});

if (workbox.navigationPreload.isSupported()) {
  workbox.navigationPreload.enable();
}

// Push Notification Listener
self.addEventListener('push', (event) => {
  let data = { title: 'New Appointment', body: 'You have a new update!' };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});

// Register Background Sync for Supabase API requests (POST, PUT, DELETE)
workbox.routing.registerRoute(
  ({ url }) => url.origin === 'https://wxwparezjiourhlvyalw.supabase.co',
  new workbox.strategies.NetworkOnly({
    plugins: [bgSyncPlugin]
  }),
  'POST'
);

workbox.routing.registerRoute(
  ({ url }) => url.origin === 'https://wxwparezjiourhlvyalw.supabase.co',
  new workbox.strategies.NetworkOnly({
    plugins: [bgSyncPlugin]
  }),
  'PUT'
);

workbox.routing.registerRoute(
  ({ url }) => url.origin === 'https://wxwparezjiourhlvyalw.supabase.co',
  new workbox.strategies.NetworkOnly({
    plugins: [bgSyncPlugin]
  }),
  'DELETE'
);

// --- NAVIGATION HANDLING ---
// Use Workbox NavigationRoute for robust handling of SPA navigations
// This automatically handles the "Navigation Preload" response correctly.
const navigationRoute = new workbox.routing.NavigationRoute(
  new workbox.strategies.NetworkFirst({
    cacheName: 'pages',
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [200],
      }),
    ],
  }),
  {
    // Fallback to offline.html if the network is completely down
    handler: async (params) => {
      try {
        return await new workbox.strategies.NetworkFirst({
          cacheName: 'pages'
        }).handle(params);
      } catch (error) {
        return caches.match(offlineFallbackPage);
      }
    }
  }
);

workbox.routing.registerRoute(navigationRoute);

// Use StaleWhileRevalidate for CSS, JS, and Images
workbox.routing.registerRoute(
  ({ request }) => ['style', 'script', 'worker', 'image'].includes(request.destination),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'assets',
  })
);

// Fallback catch-all (be careful with this, it can cache API errors)
// Removed the aggressive regex '/*' to prevent caching API calls intended for the network


const CACHE_NAME = 'securemsg-v1';
const STATIC_ASSETS = [
  '/',
  '/css/style.css',
  '/js/collector.js',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate — clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch — network first for API, cache first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls — always network
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets — cache first, then network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // Cache new responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for HTML
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
      });
    })
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'SecureMsg', body: 'New notification' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'SecureMsg', {
      body: data.body || 'You have a new update.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    })
  );
});

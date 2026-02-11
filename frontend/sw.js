/**
 * Service Worker for Offline Support
 * Caches static assets and API responses
 */

const CACHE_NAME = 'optical-calc-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone the response
        const responseToCache = response.clone();

        // Cache successful responses
        if (response.status === 200) {
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
        }

        return response;
      })
      .catch(() => {
        // If fetch fails, try to serve from cache
        return caches.match(event.request)
          .then(response => {
            if (response) {
              return response;
            }

            // For API requests, return a custom offline response
            if (event.request.url.includes('/api/')) {
              return new Response(
                JSON.stringify({
                  error: 'Offline',
                  message: 'No internet connection. Please try again when online.'
                }),
                {
                  status: 503,
                  statusText: 'Service Unavailable',
                  headers: new Headers({
                    'Content-Type': 'application/json'
                  })
                }
              );
            }

            // For other requests, return 404
            return new Response('Not found', {
              status: 404,
              statusText: 'Not Found'
            });
          });
      })
  );
});

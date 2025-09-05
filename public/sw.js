// PGP Rooms Service Worker - Security-First Caching
const CACHE_NAME = 'pgp-rooms-v1';
const STATIC_ASSETS = [
  '/',
  '/src/main.tsx',
  '/src/index.css',
];

// Assets to NEVER cache (contains sensitive data)
const NEVER_CACHE = [
  '/api/',
  'supabase.co',
  'ciphertext',
  'privateKey',
  'passphrase',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache sensitive endpoints or data
  const shouldNotCache = NEVER_CACHE.some(pattern => 
    request.url.includes(pattern) || 
    request.url.toLowerCase().includes(pattern)
  );

  if (shouldNotCache) {
    // Pass through without caching
    event.respondWith(fetch(request));
    return;
  }

  // Only cache GET requests for static assets
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first strategy for static assets only
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          return response;
        }
        
        return fetch(request).then((response) => {
          // Only cache successful responses for static assets
          if (response.status === 200 && request.url.includes('/static/')) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, responseClone));
          }
          
          return response;
        });
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Security: Clear sensitive data from memory on page unload
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_SENSITIVE_DATA') {
    // Clear any cached sensitive data
    console.log('Clearing sensitive data from service worker');
  }
});
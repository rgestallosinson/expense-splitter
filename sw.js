const CACHE_NAME = 'expense-splitter-v1.9';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: Cache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: Take control immediately, and clean out old cache versions so
// stale files (old JS/HTML) can never be served after an update.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Serve from Cache when offline
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never intercept non-GET requests. This matters a lot for the Vision
  // API call (POST /.netlify/functions/vision-ocr) — the Cache API can't
  // match POSTs anyway, so leaving this in would only risk masking a real
  // network failure behind a cached HTML fallback. Let POSTs go straight
  // to the network so the app can tell honestly whether it succeeded.
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);

  // Never intercept cross-origin requests (Tesseract.js CDN, Google Vision,
  // etc.) or our own serverless function — those should behave like normal
  // network requests, not be cached or redirected to the app shell.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/.netlify/')) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(req).catch(() => {
        // Only fall back to the cached app shell for page navigations.
        // Failing an asset request (image, script, etc.) should just fail
        // normally rather than silently return the wrong content.
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
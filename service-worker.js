const CACHE_PREFIX = 'health-public-';
const CACHE_NAME = 'health-public-v4';
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=health-public-v4",
  "./src/app.js?v=health-public-v4",
  "./src/health-model.js?v=health-public-v4",
  "./src/health-coach.js?v=health-public-v4",
  "./manifest.webmanifest?v=health-public-v4",
  "./icons/icon-192.png?v=health-public-v4",
  "./icons/icon-512.png?v=health-public-v4"
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    requestUrl.origin !== self.location.origin ||
    !event.request.url.startsWith(self.registration.scope)
  ) return;

  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      throw error;
    }
  }));
});

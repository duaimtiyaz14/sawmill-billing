/* Simple service worker for offline + Add to Home Screen */
const CACHE_VERSION = 'v6-2';
const STATIC_CACHE = `sawmill-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `sawmill-runtime-${CACHE_VERSION}`;

const APP_SHELL = [
  './index.html',
  './manifest.json',
  './sw.js',
  // Icons (create these files under /icons/)
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

// Try to pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => {
        if (k !== STATIC_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
      }));
      await self.clients.claim();
    })()
  );
});

// Network helpers
function isNavigationRequest(req) {
  return req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}
function sameOrigin(url) {
  try { return new URL(url, self.location.href).origin === self.location.origin; } catch(_) { return false; }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) HTML navigations: network-first, fallback to cached shell
  if (isNavigationRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(STATIC_CACHE);
          return cache.match('./index.html') || Response.error();
        })
    );
    return;
  }

  // 2) pdfmake CDN scripts: cache-first
  if (url.href.includes('pdfmake')) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => caches.match(req));
      })
    );
    return;
  }

  // 3) Same-origin static assets: cache-first
  if (sameOrigin(url.href)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => caches.match(req));
      })
    );
    return;
  }

  // 4) Other requests: network, fallback to cache
  event.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );

});


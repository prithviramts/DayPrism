// Daywise service worker: makes the installed app open even without a connection.
//
// What a service worker is: a script the browser runs in the background for this site. It sits
// between the page and the network, so it can answer requests from a local cache.
//
// Strategy, per kind of request:
//   Pages (Today, History, ...)   network first, so you always see fresh data when online.
//                                 Offline: the last copy of that page, else offline.html.
//   CSS / JS / icons / fonts      stale-while-revalidate: served instantly from the cache,
//                                 refreshed in the background for next time.
//   API, exports, backup,         never cached: saving and downloading must hit the real server
//   ?handler=Content refreshes    (the page shows its own "couldn't reach Daywise" message).
//
// Bump VERSION when this file's strategy changes; old caches are deleted on activation.
// v3: Daywise redesign (self-hosted font, icon sprite); bumping clears the old caches.
const VERSION = 'daywise-v3';
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(ASSETS)
      .then(cache => cache.addAll([OFFLINE_URL, '/icons/icon-192.png', '/manifest.json']))
      .then(() => self.skipWaiting()), // take over without waiting for old tabs to close
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Only plain GETs to our own site. Everything else goes straight to the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/^\/(api|export|backup)\b/.test(url.pathname) || url.searchParams.has('handler')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else if (/^\/(css|js|lib|icons|fonts)\//.test(url.pathname) || url.pathname === '/manifest.json') {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? (await caches.match(OFFLINE_URL));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached ?? refresh;
}

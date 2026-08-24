const VERSION = '0.16.0';
const CACHE = `nl-offline-${VERSION}`;
const ASSETS = ['index.html', 'core.js', 'routing.js', 'roadmeta-part-00.js', 'roadmeta-part-01.js', 'roadmeta-part-02.js', 'roadmeta-part-03.js', 'roadmeta-part-04.js', 'roadmeta-part-05.js', 'roadmeta-part-06.js', 'roadmeta-part-07.js', 'roadmeta-part-08.js', 'roadmeta-part-09.js', 'roadmeta-part-10.js', 'roadmeta-part-11.js', 'roadmeta-part-12.js', 'roadmeta.js', 'addressmeta-part-00.js', 'addressmeta-part-01.js', 'addressmeta-part-02.js', 'addressmeta-part-03.js', 'addressmeta-part-04.js', 'addressmeta-part-05.js', 'addressmeta-part-06.js', 'addressmeta-part-07.js', 'addressmeta-part-08.js', 'addressmeta-part-09.js', 'addressmeta-part-10.js', 'addressmeta-part-11.js', 'addressmeta-part-12.js', 'addressmeta-part-13.js', 'addressmeta-part-14.js', 'addressmeta-part-15.js', 'addressmeta-part-16.js', 'addressmeta-part-17.js', 'addressmeta-part-18.js', 'addressmeta-part-19.js', 'addressmeta-part-20.js', 'addressmeta-part-21.js', 'addressmeta-part-22.js', 'addressmeta-part-23.js', 'addressmeta-part-24.js', 'addressmeta-part-25.js', 'addressmeta-part-26.js', 'addressmeta-part-27.js', 'addressmeta-part-28.js', 'addressmeta-part-29.js', 'addressmeta-part-30.js', 'addressmeta-part-31.js', 'addressmeta-part-32.js', 'addressmeta-part-33.js', 'addressmeta.js', 'addresses.js', 'map.js', 'route-path.js', 'route-progress.js', 'route-trip.js', 'pwa.js', 'gps.js', 'data.js', 'ferry.js', 'manifest.webmanifest', 'ATTRIBUTION.txt', 'icon-192.png', 'icon-512.png'];
const scopeUrl = self.registration.scope;
const urlFor = p => new URL(p, scopeUrl).href;

async function cacheAssets(force = false) {
  const cache = await caches.open(CACHE);
  for (const path of ASSETS) {
    const url = urlFor(path);
    if (!force && await cache.match(url)) continue;
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    await cache.put(url, response.clone());
  }
  const status = await cacheStatus();
  if (!status.ready) throw new Error(`Incomplete cache: ${status.missing.join(', ')}`);
  return status;
}
async function cacheStatus() {
  const cache = await caches.open(CACHE);
  const missing = [];
  for (const path of ASSETS) if (!(await cache.match(urlFor(path)))) missing.push(path);
  return { type: 'CACHE_STATUS', version: VERSION, ready: missing.length === 0, missing, total: ASSETS.length };
}

// A new worker activates only after every required road-test file has cached successfully.
// If the connection fails, installation fails and the previous complete worker/cache stays active.
self.addEventListener('install', event => {
  event.waitUntil(cacheAssets(true).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const status = await cacheStatus();
    if (!status.ready) throw new Error('Refusing to activate an incomplete offline package.');
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('nl-offline-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const reply = data => { if (event.ports?.[0]) event.ports[0].postMessage(data); };
  if (event.data?.type === 'CACHE_STATUS') event.waitUntil(cacheStatus().then(reply));
  if (event.data?.type === 'PREPARE_OFFLINE') {
    event.waitUntil(cacheAssets(true).then(reply).catch(async e => {
      const status = await cacheStatus().catch(() => ({ ready: false, missing: ASSETS }));
      reply({ ...status, type: 'CACHE_STATUS', ready: false, error: e.message });
    }));
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(urlFor('index.html'));
      // A completed versioned cache is immutable. Never refresh index.html by itself,
      // because that could pair a new HTML shell with old cached JS/data while offline.
      if (hit) return hit;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(urlFor('index.html'), response.clone());
        return response;
      } catch (_) {
        return new Response('NL Offline has not finished preparing its offline package. Reconnect once and press Prepare for road.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  const pathname = url.pathname.split('/').pop();
  if (ASSETS.includes(pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(urlFor(pathname));
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(urlFor(pathname), response.clone());
      return response;
    })());
  }
});

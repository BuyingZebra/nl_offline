const VERSION = '0.11.0';
const CACHE = `nl-offline-${VERSION}`;
const ASSETS = ['index.html', 'app.js', 'data.js', 'ferry.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
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
      if (hit) {
        // Refresh in the background, but never make launch depend on a network connection.
        event.waitUntil(fetch(event.request, { cache: 'no-store' }).then(async response => {
          if (response.ok) await cache.put(urlFor('index.html'), response.clone());
        }).catch(() => {}));
        return hit;
      }
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

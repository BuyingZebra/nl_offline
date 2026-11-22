/* Vector LCD offline worker. Owns only the /vector-lcd/ scope and its own caches.
 * Bump VERSION with every release (a test checks it matches the app), and list
 * every shipped file in ASSETS (a test checks that too). */
'use strict';

const VERSION = '0.20.2';
const CACHE_PREFIX = 'vector-lcd-';
const CACHE_NAME = CACHE_PREFIX + VERSION;

const ASSETS = Object.freeze([
 // ---- Page
 './',
 './index.html',
 './manifest.webmanifest',
 './icon.svg',
 './icon-192.png',
 './icon-512.png',
 './apple-touch-icon.png',
 // ---- App
 './app/main.js',
 './app/screens.js',
 './app/stage.js',
 './app/controls.js',
 './app/info.js',
 './app/view.js',
 // ---- Engine
 './gpu/webgl.js',
 './gpu/glsl.js',
 './optics/room.js',
 './screens/contract.js',
 './screens/tn/index.js',
 './screens/tn/model.js',
 './screens/tn/shaders.js',
 './screens/tn/renderer.js',
 './screens/tn/definition.js',
 './screens/dmg/index.js',
 './screens/dmg/model.js',
 './screens/dmg/shaders.js',
 './screens/dmg/renderer.js',
 './screens/dmg/definition.js',
 './screens/cgb/index.js',
 './screens/cgb/model.js',
 './screens/cgb/shaders.js',
 './screens/cgb/renderer.js',
 './screens/cgb/definition.js',
 './screens/crt/index.js',
 './screens/crt/model.js',
 './screens/crt/shaders.js',
 './screens/crt/renderer.js',
 './screens/crt/definition.js',
 // ---- Screen profiles
 './profiles/reflective-tn.json',
 './profiles/reflective-tn-mux4.json',
 './profiles/dmg-01-stn.json',
 './profiles/cgb-001-tft.json',
 './profiles/crt-5151-p39.json',
 './profiles/crt-5151-p3.json',
 './third_party/retro-display-lab/NOTICE',
 // ---- Content
 './content/tetris.js',
 './content/tiles.js',
 './content/four-tone.js',
 './content/colour.js',
 // ---- The earlier hand-tuned concept model
 './concept/concept.html',
 './concept/demo.js',
 './concept/vector-lcd.js',
 // ---- The real NOMAD Tetris game logic and tile art, used as content
 '../tetris/game.js',
 '../tetris/assets/tiles/smooth-geometry.mjs',
 '../tetris/assets/tiles/gravel-layout.mjs',
 '../tetris/assets/tiles/vector/J.svg',
 '../tetris/assets/tiles/vector/L.svg',
 '../tetris/assets/tiles/vector/O.svg',
 '../tetris/assets/tiles/vector/S.svg',
 '../tetris/assets/tiles/vector/T.svg',
 '../tetris/assets/tiles/vector/Z.svg'
]);

const SCOPE = new URL(self.registration.scope);
const SHARED_PATHS = new Set(ASSETS.filter(a => a.startsWith('../')).map(a => new URL(a, SCOPE).pathname));


// ---- Install: cache one complete release ----
self.addEventListener('install', event => {
 event.waitUntil((async () => {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(ASSETS.map(asset => new Request(new URL(asset, SCOPE), {cache: 'reload'})));
  await self.skipWaiting();
 })());
});

// ---- Activate: drop older releases ----
self.addEventListener('activate', event => {
 event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
  await self.clients.claim();
 })());
});

// ---- Fetch: cache first, then the network; offline navigation gets the app ----
self.addEventListener('fetch', event => {
 const request = event.request;
 if (request.method !== 'GET') return;
 const url = new URL(request.url);
 if (url.origin !== SCOPE.origin) return;
 if (!url.pathname.startsWith(SCOPE.pathname) && !SHARED_PATHS.has(url.pathname)) return;
 event.respondWith((async () => {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request, {ignoreSearch: true});
  if (hit) return hit;
  try {
   return await fetch(request);
  } catch (error) {
   if (request.mode === 'navigate') return (await cache.match(new URL('./', SCOPE))) || Response.error();
   return Response.error();
  }
 })());
});

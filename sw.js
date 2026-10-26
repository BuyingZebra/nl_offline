/* Retire the original NL Offline MVP service worker.
 *
 * Historic /nl_offline/sw.js was installed with scope /nl_offline/ and
 * intercepted EVERY navigation, returning the archived map index.html even
 * for /nl_offline/tetris/three-v027.html. Removing sw.js from Git did not
 * unregister those copies already installed on phones.
 *
 * Keep this URL published permanently so those browsers can update the old
 * worker, abandon its obsolete offline cache and reach the real requested URL.
 * This script deliberately has NO fetch handler or navigation fallback.
 */
self.addEventListener('install', event => {
 event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
 event.waitUntil((async () => {
  // The former MVP used only nl-offline-<version> caches. Leave FIELD ATLAS,
  // arcade/Tetris caches, stored high scores and all other site data intact.
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('nl-offline-'))
   .map(key=>caches.delete(key)));
  // Claim existing pages with the pass-through worker, then unregister so
  // future navigations load their actual URL instead of the old cached map.
  await self.clients.claim();
  await self.registration.unregister();
 })());
});

/* Retired PixiJS arcade worker. This tombstone is intentionally kept at
 * sw.js to let existing installations upgrade before unregistering.
 * There is no fetch handler and no caching of Three.js navigation.
 */
self.addEventListener('install',event=>{
 event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  // Delete ONLY caches belonging to the former Tetris/PixiJS arcade.
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('field-atlas-arcade-'))
   .map(key=>caches.delete(key)));
  await self.registration.unregister();
 })());
});

/* FIELD ATLAS Tetris — optional offline app-shell cache (no map data). */
const CACHE='field-atlas-arcade-v022';
const APP_SHELL=['./','./index.html','./core.js?arcade=v022',
 './scores.js?arcade=v022','./experimental-fx.js?arcade=v022',
 './ui.js?arcade=v022'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL))
    .then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('field-atlas-arcade-')&&k!==CACHE)
      .map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  const url=new URL(request.url);
  if(!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  // Network-first prevents an earlier cached game from hiding a newly
  // published version. Cached files still launch when the phone is offline.
  event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
    if(response.ok){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}));
    }
    return response;
  }).catch(async()=>{
    const cached=await caches.match(request,{ignoreSearch:true});
    if(cached)return cached;
    throw Error('FIELD ATLAS arcade not available offline yet');
  }));
});

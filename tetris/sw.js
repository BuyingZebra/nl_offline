/* FIELD ATLAS Tetris — version-locked offline app shell (no map data).
 * Network-first online; offline reads the exact version of each script.
 * Navigations with arbitrary URL parameters fall back to the canonical HTML.
 * Never cache unbounded user-generated URLs or obsolete script revisions.
 */
const CACHE='field-atlas-arcade-v025';
const APP_SHELL=['./','./index.html','./core.js?arcade=v025',
 './scores.js?arcade=v025','./experimental-fx.js?arcade=v025',
 './ui.js?arcade=v025'];
const SCOPE_URL=new URL(self.registration.scope);
const PAGE_URL=new URL('./index.html',SCOPE_URL).href;
const SHELL_URLS=new Set(APP_SHELL.map(path=>new URL(path,SCOPE_URL).href));

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
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==SCOPE_URL.origin||!url.pathname.startsWith(SCOPE_URL.pathname))return;
  const navigation=request.mode==='navigate';
  // For assets, only the exact current shell URLs are managed offline.
  if(!navigation&&!SHELL_URLS.has(url.href))return;
  const cacheKey=navigation?PAGE_URL:request;
  event.respondWith((async()=>{
    try{
      const response=await fetch(request,{cache:'no-store'});
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(cacheKey,copy)).catch(()=>{}));
      }
      return response;
    }catch(e){
      const cached=await caches.open(CACHE).then(cache=>cache.match(cacheKey));
      if(cached)return cached;
      throw Error('FIELD ATLAS arcade not available offline yet');
    }
  })());
});

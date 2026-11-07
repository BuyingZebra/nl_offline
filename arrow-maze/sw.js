// Scope-safe, offline-capable cache. Navigations are network-first to prevent
// a previously installed app from showing outdated versions after a release.
const CACHE='arrow-maze-pwa-v5';
const ASSETS=['./','./index.html','./app.js?v=5','./generator.js?v=5','./style.css?v=5','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
const ROOT=new URL('./',self.registration.scope).pathname;
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('arrow-maze-pwa-')&&k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(ROOT))return;
  const updateCache=response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  };
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(updateCache).catch(()=>caches.match(event.request).then(old=>old||caches.match('./index.html'))));
  }else{
    event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(updateCache)));
  }
});
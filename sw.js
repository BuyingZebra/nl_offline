const VERSION='0.10.0';
const CACHE=`nl-offline-${VERSION}`;
const ASSETS=['index.html','app.js','data.js','manifest.webmanifest','icon-192.png','icon-512.png'];
const scopeUrl=self.registration.scope;
const urlFor=p=>new URL(p,scopeUrl).href;

async function cacheAssets(force=false){
  const cache=await caches.open(CACHE);
  const failures=[];
  for(const path of ASSETS){
    const url=urlFor(path);
    if(!force && await cache.match(url)) continue;
    try{
      const response=await fetch(url,{cache:'reload'});
      if(!response.ok) throw new Error(String(response.status));
      await cache.put(url,response.clone());
    }catch(e){failures.push(path)}
  }
  if(failures.length) throw new Error(`Could not cache: ${failures.join(', ')}`);
  return cacheStatus();
}
async function cacheStatus(){
  const cache=await caches.open(CACHE);
  const missing=[];
  for(const path of ASSETS){if(!(await cache.match(urlFor(path))))missing.push(path)}
  return {type:'CACHE_STATUS',version:VERSION,ready:missing.length===0,missing,total:ASSETS.length};
}
self.addEventListener('install',event=>event.waitUntil(cacheAssets(true).catch(()=>null).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('nl-offline-')&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  const reply=data=>{if(event.ports&&event.ports[0])event.ports[0].postMessage(data)};
  if(event.data?.type==='CACHE_STATUS')event.waitUntil(cacheStatus().then(reply));
  if(event.data?.type==='PREPARE_OFFLINE')event.waitUntil(cacheAssets(true).then(reply).catch(e=>reply({type:'CACHE_STATUS',ready:false,error:e.message,missing:ASSETS})));
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const hit=await cache.match(urlFor('index.html'));
      if(hit){
        event.waitUntil(fetch(event.request,{cache:'no-store'}).then(async response=>{if(response.ok)await cache.put(urlFor('index.html'),response.clone())}).catch(()=>{}));
        return hit;
      }
      try{const response=await fetch(event.request);if(response.ok)await cache.put(urlFor('index.html'),response.clone());return response}catch(e){return new Response('NL Offline has not finished preparing its offline package. Reconnect once and press Prepare for road.',{status:503,headers:{'Content-Type':'text/plain'}})}
    })());
    return;
  }
  const pathname=url.pathname.split('/').pop();
  if(ASSETS.includes(pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const hit=await cache.match(urlFor(pathname));
      if(hit)return hit;
      const response=await fetch(event.request);
      if(response.ok)await cache.put(urlFor(pathname),response.clone());
      return response;
    })());
  }
});
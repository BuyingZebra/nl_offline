/* Vector LCD offline worker. Owns only the /vector-lcd/ scope and its own
 * caches. Bump VERSION with every release (a test checks it matches the app). */
'use strict';
const VERSION='0.1.0';
const CACHE_PREFIX='vector-lcd-';
const CACHE_NAME=CACHE_PREFIX+VERSION;
const ASSETS=Object.freeze([
 './',
 './index.html',
 './demo.js',
 './vector-lcd.js',
 './manifest.webmanifest',
 './icon.svg',
 './icon-192.png',
 './icon-512.png',
 './apple-touch-icon.png'
]);
const SCOPE=new URL(self.registration.scope);

self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await cache.addAll(ASSETS.map(asset=>new Request(new URL(asset,SCOPE),{cache:'reload'})));
  await self.skipWaiting();
 })());
});

self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});

self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME);
  const hit=await cache.match(request,{ignoreSearch:true});
  if(hit)return hit;
  try{return await fetch(request);}
  catch(error){
   if(request.mode==='navigate')return (await cache.match(new URL('./',SCOPE)))||Response.error();
   return Response.error();
  }
 })());
});

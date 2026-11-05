/* NOMAD Tetris V092 — self-contained, scoped offline application cache.
 * Ownership: ONLY the /tetris/ scope and optional existing Google font requests.
 * Do not touch map caches, user settings, scores or unrelated service workers.
 *
 * Upgrade rule: bump CACHE_VERSION and review CORE_ASSETS with each release.
 * Never skipWaiting: an existing live game must finish on its current build.
 */
'use strict';
const CACHE_VERSION='v092';
const CACHE_NAME='nomad-tetris-offline-'+CACHE_VERSION;
const CACHE_PREFIX='nomad-tetris-offline-';
const LEGACY_PIXI_PREFIX='field-atlas-arcade-';
const SCOPE=new URL(self.registration.scope);
const FONT_STYLESHEET='https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@700&family=Share+Tech+Mono&display=swap';
const FONT_HOSTS=new Set(['fonts.googleapis.com','fonts.gstatic.com']);

// Explicit allowlist; no runtime network crawling, broad caches or map assets.
const CORE_ASSETS=Object.freeze([
 './','./index.html','./three-v027.html','./manifest.webmanifest',
 './icon.svg','./icon-192.png','./icon-512.png',
 './core.js','./scores.js','./layout.js','./three-v027.js',
 './compositor.js','./tile-face.js','./canvas-ui.js','./build-version.js',
 './platform-manager.js','./app-lifecycle.js','./input-controller.js',
 './perf-monitor.js','./texture-upload-profiler.js',
 './cropped-ui-layers.js','./game-visual-state.js',
 './debug-report.js','./debug-clipboard.js','./modal-ui.js',
 './render-invalidation.js','./hud-drawing.js',
 './display-settings-catalog.js','./settings-manager.js',
 './screen-manager.js','./action-controller.js','./graphics-health.js',
 './compositor-pass-profiler.js','./ui-controls.js',
 './vendor/three/three.module.js','./vendor/three/three.core.js',
 './vendor/three/addons/postprocessing/EffectComposer.js',
 './vendor/three/addons/postprocessing/RenderPass.js',
 './vendor/three/addons/postprocessing/UnrealBloomPass.js',
 './vendor/three/addons/postprocessing/ShaderPass.js',
 './vendor/three/addons/postprocessing/OutputPass.js',
 './vendor/three/addons/postprocessing/MaskPass.js',
 './vendor/three/addons/postprocessing/Pass.js',
 './vendor/three/addons/shaders/CopyShader.js',
 './vendor/three/addons/shaders/LuminosityHighPassShader.js',
 './vendor/three/addons/shaders/OutputShader.js'
]);
const ALLOWED_PATHS=new Set(CORE_ASSETS.map(asset=>new URL(asset,SCOPE).pathname));

async function warmOptionalFonts(cache){
 // Font assets affect visual fidelity but never gate installation/offline play.
 const controller=new AbortController();
 const deadline=setTimeout(()=>controller.abort(),4500);
 try{
  const response=await fetch(FONT_STYLESHEET,{signal:controller.signal,mode:'cors',cache:'reload'});
  if(!response.ok)return;
  const css=await response.clone().text();
  const urls=[...new Set([...css.matchAll(/url\(['"]?(https:\/\/fonts\.gstatic\.com\/[^)'"]+)/g)].map(m=>m[1]))];
  await cache.put(FONT_STYLESHEET,response);
  await Promise.allSettled(urls.map(async url=>{
   const font=await fetch(url,{signal:controller.signal,mode:'cors',cache:'reload'});
   if(font.ok)await cache.put(url,font);
  }));
 }catch(error){/* Use fallback fonts offline if the optional host is unavailable. */}
 finally{clearTimeout(deadline);}
}

self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  // addAll must succeed before activating: an incomplete core cache is not offline ready.
  const sources=CORE_ASSETS.map(asset=>new Request(new URL(asset,SCOPE),{cache:'reload'}));
  await cache.addAll(sources);
  await warmOptionalFonts(cache);
  // Intentionally no skipWaiting: do not replace a running build.
 })());
});

self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>
   (key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME)||
   key.startsWith(LEGACY_PIXI_PREFIX)
  ).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});

function canonicalAsset(url){
 // Cache identity ignores ephemeral ?live= and ?update-check= parameters.
 // Normalizing prevents an unbounded cache entry per app launch.
 return new Request(url.origin+url.pathname,{credentials:'same-origin'});
}
async function networkFirst(request,key,event){
 const cache=await caches.open(CACHE_NAME);
 try{
  const response=await fetch(request);
  if(response.ok){
   event.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
  }
  return response;
 }catch(error){
  return await cache.match(key)||Response.error();
 }
}
async function fontsCacheFirst(request,event){
 const cache=await caches.open(CACHE_NAME);
 const hit=await cache.match(request,{ignoreVary:true});
 if(hit)return hit;
 try{
  const response=await fetch(request);
  if(response.ok||response.type==='opaque')
   event.waitUntil(cache.put(request,response.clone()).catch(()=>{}));
  return response;
 }catch(error){return Response.error();}
}

self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 // Only the two font hosts already used by the game's CSS are optional extras.
 if(FONT_HOSTS.has(url.hostname)&&url.protocol==='https:'){
  event.respondWith(fontsCacheFirst(request,event));return;
 }
 if(url.origin!==SCOPE.origin||!ALLOWED_PATHS.has(url.pathname))return;
 event.respondWith(networkFirst(request,canonicalAsset(url),event));
});

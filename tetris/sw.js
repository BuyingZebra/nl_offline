/* NOMAD Tetris V164 — immutable, version-coherent offline application shell.
 * Ownership: ONLY the /tetris/ scope and optional existing Google font requests.
 * Do not touch map caches, user settings, scores or unrelated service workers.
 *
 * Upgrade rule: bump CACHE_VERSION and review CORE_ASSETS with each release.
 * V145 migrates legacy pinned V142–V144 workers after the complete new cache
 * is installed. Later updates activate only when the app explicitly requests
 * it while idle; never promote a partially cached shell.
 */
'use strict';
const CACHE_VERSION='v164';
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
 './nomad-mark.svg',
 './assets/frames/brick-pattern.mjs',
 './assets/frames/pixel/brick.svg','./assets/frames/vector/brick.svg',
 './core.js','./scores.js','./layout.js','./three-v027.js','./i-piece-fragments.js',
 './piece-luminance.js',
 './button-feedback.js','./phosphor-model.js','./phosphor-persistence.js',
 './compositor.js','./tile-face.js','./vector-tile-renderer.js',
 './piece-drop-shadow.js',
 './assets/tiles/gravel-layout.mjs','./assets/tiles/smooth-geometry.mjs',
 './assets/tiles/vector/I.svg','./assets/tiles/vector/J.svg',
 './assets/tiles/vector/L.svg','./assets/tiles/vector/O.svg',
 './assets/tiles/vector/S.svg','./assets/tiles/vector/T.svg',
 './assets/tiles/vector/Z.svg','./canvas-ui.js','./build-version.js',
 './platform-manager.js','./app-lifecycle.js','./input-controller.js',
 './perf-monitor.js','./texture-upload-profiler.js',
 './cropped-ui-layers.js','./game-visual-state.js',
 './debug-report.js','./debug-clipboard.js','./modal-ui.js',
 './render-invalidation.js','./hud-drawing.js','./terminal-engine.js','./terminal-log.js',
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
  // A previously installed V142–V144 worker can remain waiting forever on
  // iOS because an installed PWA keeps a live hidden client. Bootstrap this
  // one migration only; future releases wait for the app's idle approval.
  const oldNames=await caches.keys();
  const legacyPinned=oldNames.some(name=>{
   if(!name.startsWith(CACHE_PREFIX))return false;
   const version=Number(name.slice(CACHE_PREFIX.length).replace(/^v/,''));
   return Number.isInteger(version)&&version>0&&version<145;
  });
  const cache=await caches.open(CACHE_NAME);
  try{
   // All essential resources must arrive together, before this worker is usable.
   const sources=CORE_ASSETS.map(asset=>new Request(new URL(asset,SCOPE),{cache:'reload'}));
   await cache.addAll(sources);
   // Reject a partial deployment: the cached shell MUST be from this release.
   const shell=await cache.match(new URL('./three-v027.html',SCOPE));
   const html=shell?.ok?await shell.text():'';
   const build=html.match(/<meta\s+name=["']tetris-build["']\s+content=["']([0-9]{3})["']/i)?.[1];
   if(build!==CACHE_VERSION.slice(1))throw Error('NOMAD offline shell version mismatch');
   await warmOptionalFonts(cache);
  }catch(error){
   await caches.delete(CACHE_NAME);
   throw error;
  }
  // Only after all required modules and exact build metadata were verified.
  if(legacyPinned)await self.skipWaiting();
 })());
});

// Newer workers can be promoted only from the app's idle update path.
self.addEventListener('message',event=>{
 if(event.data?.type!=='NOMAD_ACTIVATE_UPDATE')return;
 event.waitUntil(self.skipWaiting());
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
async function fromPinnedCache(url){
 // Never refresh individual runtime assets from the network: doing so could
 // combine V093 HTML with another build's renderer or Three.js shaders.
 const cache=await caches.open(CACHE_NAME);
 return await cache.match(canonicalAsset(url))||Response.error();
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
 // A build check must see the published HTML even while a pinned older
 // worker controls the page. It never mutates the active shell cache.
 if(url.pathname===new URL('./three-v027.html',SCOPE).pathname&&
    url.searchParams.has('update-check')){
  event.respondWith(fetch(request));return;
 }
 event.respondWith(fromPinnedCache(url));
});

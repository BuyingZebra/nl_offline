/* NOMAD Tetris V177 — immutable, version-coherent offline application shell.
 * Ownership: ONLY the /tetris/ scope and optional existing Google font requests.
 * Do not touch map caches, user settings, scores or unrelated service workers.
 *
 * Regenerate the build marker and precache list with tools/build-tetris-release.mjs.
 * Updates wait until the old worker's clients close, after the complete
 * new bundle has been cached and validated.
 */
'use strict';
const CACHE_VERSION='v177';
const CACHE_NAME='nomad-tetris-offline-'+CACHE_VERSION;
const CACHE_PREFIX='nomad-tetris-offline-';
const LEGACY_PIXI_PREFIX='field-atlas-arcade-';
const SCOPE=new URL(self.registration.scope);
const SHELL_URL=new URL('./three-v027.html',SCOPE);
const CLEAN_SHELL_PATH=SHELL_URL.pathname.slice(0,-'.html'.length);
const FONT_STYLESHEET='https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@700&family=Share+Tech+Mono&display=swap';
const FONT_HOSTS=new Set(['fonts.googleapis.com','fonts.gstatic.com']);

// Explicit allowlist; no runtime network crawling, broad caches or map assets.
const CORE_ASSETS=Object.freeze([
 './',
 './action-controller.js',
 './app-lifecycle.js',
 './assets/frames/brick-pattern.mjs',
 './assets/frames/pixel/brick.svg',
 './assets/frames/vector/brick.svg',
 './assets/tiles/gravel-layout.mjs',
 './assets/tiles/smooth-geometry.mjs',
 './assets/tiles/vector/I.svg',
 './assets/tiles/vector/J.svg',
 './assets/tiles/vector/L.svg',
 './assets/tiles/vector/O.svg',
 './assets/tiles/vector/S.svg',
 './assets/tiles/vector/T.svg',
 './assets/tiles/vector/Z.svg',
 './build-version.js',
 './button-feedback.js',
 './button-layer-invalidation.js',
 './canvas-ui.js',
 './compositor-pass-profiler.js',
 './compositor.js',
 './core.js',
 './cropped-ui-layers.js',
 './debug-clipboard.js',
 './debug-report.js',
 './display-settings-catalog.js',
 './game-visual-state.js',
 './gpu-button-lighting.js',
 './graphics-health.js',
 './hud-drawing.js',
 './i-piece-fragments.js',
 './icon-192.png',
 './icon-512.png',
 './icon.svg',
 './index.html',
 './input-controller.js',
 './layout.js',
 './manifest.webmanifest',
 './modal-ui.js',
 './nomad-mark.svg',
 './perf-monitor.js',
 './phosphor-model.js',
 './phosphor-persistence.js',
 './piece-drop-shadow.js',
 './piece-luminance.js',
 './platform-manager.js',
 './render-invalidation.js',
 './scores.js',
 './screen-manager.js',
 './settings-manager.js',
 './terminal-engine.js',
 './terminal-log.js',
 './texture-upload-profiler.js',
 './three-v027.html',
 './three-v027.js',
 './tile-face.js',
 './ui-controls.js',
 './vector-tile-renderer.js',
 './vendor/three/addons/postprocessing/EffectComposer.js',
 './vendor/three/addons/postprocessing/MaskPass.js',
 './vendor/three/addons/postprocessing/OutputPass.js',
 './vendor/three/addons/postprocessing/Pass.js',
 './vendor/three/addons/postprocessing/RenderPass.js',
 './vendor/three/addons/postprocessing/ShaderPass.js',
 './vendor/three/addons/postprocessing/UnrealBloomPass.js',
 './vendor/three/addons/shaders/CopyShader.js',
 './vendor/three/addons/shaders/LuminosityHighPassShader.js',
 './vendor/three/addons/shaders/OutputShader.js',
 './vendor/three/three.core.js',
 './vendor/three/three.module.js',
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
  // Let the browser wait for all clients of the old worker to close.
  const cache=await caches.open(CACHE_NAME);
  try{
   // All essential resources must arrive together, before this worker is usable.
   const sources=CORE_ASSETS.map(asset=>new Request(new URL(asset,SCOPE),{cache:'reload'}));
   await cache.addAll(sources);
   // Reject a partial deployment: the cached shell MUST be from this release.
   const shell=await cache.match(SHELL_URL);
   const html=shell?.ok?await shell.text():'';
   const build=html.match(/<meta\s+name=["']tetris-build["']\s+content=["']([0-9]{3})["']/i)?.[1];
   if(build!==CACHE_VERSION.slice(1))throw Error('NOMAD offline shell version mismatch');
   // Clean-URL hosts redirect the .html request during precache. Store
   // the validated body as a direct response for offline navigation.
   if(shell.redirected){
    const headers=new Headers(shell.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    await cache.put(SHELL_URL,new Response(html,{status:shell.status,headers}));
   }
   await warmOptionalFonts(cache);
  }catch(error){
   await caches.delete(CACHE_NAME);
   throw error;
  }
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

function assetPath(url){
 return url.pathname===CLEAN_SHELL_PATH?SHELL_URL.pathname:url.pathname;
}
function canonicalAsset(url){
 // Cache identity ignores ephemeral ?live= and ?update-check= parameters.
 // Normalizing prevents an unbounded cache entry per app launch.
 return new Request(url.origin+assetPath(url),{credentials:'same-origin'});
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
 const path=assetPath(url);
 if(url.origin!==SCOPE.origin||!ALLOWED_PATHS.has(path))return;
 // A build check must see the published HTML even while a pinned older
 // worker controls the page. It never mutates the active shell cache.
 if(path===SHELL_URL.pathname&&
    url.searchParams.has('update-check')){
  event.respondWith(fetch(request));return;
 }
 event.respondWith(fromPinnedCache(url));
});

/* NOMAD V107 — release-coherent offline cache and installability tests. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const dir=path.resolve(__dirname,'..');
const swCode=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'three-v027.html'),'utf8');
const scope='https://buyingzebra.github.io/nl_offline/tetris/';

function workerHarness(){
 const events=new Map(),storage=new Map(),deleted=[],claims=[];
 let online=true,failPath=null,version='old',shellBuild='107';
 const asURL=item=>typeof item==='string'?new URL(item,scope).href:
  item instanceof URL?item.href:item.url;
 async function fetchMock(item){
  const url=new URL(asURL(item));
  if(!online||url.pathname===failPath)throw Error('Network unavailable');
  if(url.origin!==new URL(scope).origin)throw Error('Optional fonts unavailable');
  const html=url.pathname.endsWith('/three-v027.html')?
   '<meta name="tetris-build" content="'+shellBuild+'">':'';
  return new Response(version+' '+url.pathname+' '+html,{status:200});
 }
 class TestCache{
  entries=new Map();
  async match(req){const response=this.entries.get(asURL(req));return response?.clone();}
  async put(req,response){this.entries.set(asURL(req),response.clone());}
  async addAll(requests){
   const staged=[];
   for(const request of requests){
    const response=await fetchMock(request);
    if(!response.ok)throw Error('Incomplete bundle');
    staged.push([request,response.clone()]);
   }
   for(const [request,response] of staged)await this.put(request,response);
  }
 }
 const caches={
  open:async name=>{
   if(!storage.has(name))storage.set(name,new TestCache());
   return storage.get(name);
  },
  keys:async()=>[...storage.keys()],
  delete:async name=>{deleted.push(name);return storage.delete(name)}
 };
 const self={
  registration:{scope},
  clients:{claim:async()=>claims.push('claim')},
  addEventListener:(name,callback)=>events.set(name,callback)
 };
 const ctx={self,caches,fetch:fetchMock,URL,Request,Response,AbortController,
  setTimeout,clearTimeout,console};
 const assets=vm.runInNewContext(swCode+'\nCORE_ASSETS;',ctx);
 async function emit(name,options={}){
  const work=[],responses=[];
  const event={...options,waitUntil:p=>work.push(Promise.resolve(p)),
   respondWith:p=>responses.push(Promise.resolve(p))};
  events.get(name)?.(event);
  const response=responses.length?await responses[0]:null;
  if(work.length)await Promise.all(work);
  return {response,handled:responses.length>0};
 }
 return {emit,assets,storage,caches,claims,deleted,
  setOnline:x=>online=x,setVersion:x=>version=x,setFailPath:x=>failPath=x,
  setShellBuild:x=>shellBuild=x,
  get cache(){return storage.get('nomad-tetris-offline-v107');}
 };
}

test('the bundle lists only existing Tetris assets',()=>{
 const h=workerHarness();
 assert.ok(h.assets.length>35);
 assert.equal(new Set(h.assets).size,h.assets.length);
 for(const item of h.assets){
  assert.ok(item.startsWith('./'),item);
  const full=new URL(item,scope);
  assert.ok(full.pathname.startsWith('/nl_offline/tetris/'),item);
  if(item!=='./')assert.ok(fs.existsSync(path.join(dir,item.slice(2))),item);
 }
 assert.ok(!h.assets.some(x=>x.includes('/map/')));
});
test('every runtime import is in the offline bundle',()=>{
 const assets=new Set(workerHarness().assets.map(a=>a.slice(2)));
 const modules=['three-v027.js','button-feedback.js','phosphor-model.js',
  'phosphor-persistence.js','compositor.js','tile-face.js','canvas-ui.js',
  'build-version.js','platform-manager.js','app-lifecycle.js',
  'input-controller.js','perf-monitor.js','texture-upload-profiler.js',
  'cropped-ui-layers.js','game-visual-state.js','debug-report.js',
  'debug-clipboard.js','modal-ui.js','render-invalidation.js',
  'hud-drawing.js','display-settings-catalog.js','settings-manager.js',
  'screen-manager.js','action-controller.js','graphics-health.js',
  'compositor-pass-profiler.js','ui-controls.js',
  'vendor/three/three.module.js',
  'vendor/three/addons/postprocessing/EffectComposer.js',
  'vendor/three/addons/postprocessing/RenderPass.js',
  'vendor/three/addons/postprocessing/UnrealBloomPass.js',
  'vendor/three/addons/postprocessing/ShaderPass.js',
  'vendor/three/addons/postprocessing/OutputPass.js',
  'vendor/three/addons/postprocessing/MaskPass.js',
  'vendor/three/addons/postprocessing/Pass.js',
  'vendor/three/addons/shaders/CopyShader.js',
  'vendor/three/addons/shaders/LuminosityHighPassShader.js',
  'vendor/three/addons/shaders/OutputShader.js'];
 for(const moduleFile of modules){
  const source=fs.readFileSync(path.join(dir,moduleFile),'utf8');
  for(const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)){
   const spec=match[1];
   let dep=null;
   if(spec.startsWith('.'))
    dep=path.posix.normalize(path.posix.join(path.posix.dirname(moduleFile),spec.split('?')[0]));
   else if(spec==='three')dep='vendor/three/three.module.js';
   else if(spec.startsWith('three/addons/'))dep='vendor/three/addons/'+spec.slice('three/addons/'.length);
   if(dep)assert.ok(assets.has(dep),moduleFile+' imports missing '+dep);
  }
 }
});
test('the import map, manifest, and icons are local',()=>{
 const match=html.match(/<script type="importmap">\s*(\{.*\})\s*<\/script>/);
 assert.ok(match);
 const map=JSON.parse(match[1]).imports;
 assert.equal(map.three,'./vendor/three/three.module.js');
 assert.equal(map['three/addons/'],'./vendor/three/addons/');
 assert.ok(!html.includes('cdn.jsdelivr.net'));
 assert.ok(html.includes('rel="manifest" href="./manifest.webmanifest"'));
 assert.ok(html.includes("navigator.serviceWorker.register('./sw.js'"));
 assert.ok(!html.includes('reg.unregister()'));
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.webmanifest'),'utf8'));
 assert.equal(manifest.start_url,'./three-v027.html');
 assert.equal(manifest.scope,'./');
 assert.equal(manifest.display,'standalone');
 for(const size of ['192x192','512x512'])
  assert.ok(manifest.icons.some(i=>i.sizes===size));
 for(const icon of manifest.icons)
  assert.ok(fs.existsSync(path.join(dir,icon.src)));
});
test('online installation fully precaches before activation',async()=>{
 const h=workerHarness();
 await h.emit('install');
 assert.equal(h.cache.entries.size,h.assets.length);
 for(const asset of h.assets)
  assert.ok(await h.cache.match(new URL(asset,scope)),asset);
 assert.equal(h.claims.length,0);
});
test('offline HTML and cache-busted scripts load with no unbounded cache growth',async()=>{
 const h=workerHarness();await h.emit('install');h.setOnline(false);
 for(const asset of ['three-v027.html','three-v027.js',
  'vendor/three/three.module.js',
  'vendor/three/addons/postprocessing/EffectComposer.js']){
  const url=new URL(asset+'?live=9999',scope);
  const item=await h.emit('fetch',{request:new Request(url)});
  assert.equal(item.handled,true,asset);
  assert.equal(item.response.status,200,asset);
  assert.ok((await item.response.text()).startsWith('old '),asset);
 }
 assert.equal(h.cache.entries.size,h.assets.length);
});
test('published updates bypass the old pinned shell but cannot mutate it',async()=>{
 const h=workerHarness();await h.emit('install');h.setVersion('new');
 h.setShellBuild('097');
 const published=await h.emit('fetch',{
  request:new Request(new URL('./three-v027.html?update-check=10',scope))
 });
 assert.ok((await published.response.text()).startsWith('new '));
 const active=await h.emit('fetch',{
  request:new Request(new URL('./three-v027.html?live=42',scope))
 });
 assert.ok((await active.response.text()).startsWith('old '));
 for(const script of ['three-v027.js','core.js','vendor/three/three.module.js']){
  const request=new Request(new URL('./'+script+'?live=43',scope));
  const response=await h.emit('fetch',{request});
  assert.ok((await response.response.text()).startsWith('old '),script);
 }
 h.setOnline(false);
 const cached=await h.emit('fetch',{
  request:new Request(new URL('./three-v027.html?live=44',scope))
 });
 assert.ok((await cached.response.text()).startsWith('old '));
 await assert.rejects(h.emit('fetch',{
  request:new Request(new URL('./three-v027.html?update-check=45',scope))
 }));
 assert.equal(h.cache.entries.size,h.assets.length);
});
test('a mismatched shell build rejects install and deletes the staged cache',async()=>{
 const h=workerHarness();h.setShellBuild('097');
 await assert.rejects(h.emit('install'),/version mismatch/);
 assert.equal(h.cache,undefined);
});
test('a missing pinned runtime file fails closed instead of fetching another version',async()=>{
 const h=workerHarness();await h.emit('install');h.setVersion('new');
 h.cache.entries.delete(new URL('./three-v027.js',scope).href);
 const response=await h.emit('fetch',{request:new Request(new URL('./three-v027.js?live=123',scope))});
 assert.equal(response.handled,true);
 assert.equal(response.response.status,0);
 assert.equal(h.cache.entries.size,h.assets.length-1);
});
test('new staging does not delete the previous release before activation',async()=>{
 const h=workerHarness();
 const previous=await h.caches.open('nomad-tetris-offline-v096');
 await previous.put(new URL('./core.js',scope),new Response('V092 core'));
 await h.emit('install');
 assert.ok((await h.caches.keys()).includes('nomad-tetris-offline-v096'));
 assert.equal((await (await previous.match(new URL('./core.js',scope))).text()),'V092 core');
 await h.emit('activate');
 assert.ok(!(await h.caches.keys()).includes('nomad-tetris-offline-v096'));
});
test('requests outside the allowlist and repository sub-app are left alone',async()=>{
 const h=workerHarness();await h.emit('install');h.setOnline(false);
 for(const url of [
  'https://buyingzebra.github.io/nl_offline/mobile/map.json',
  'https://buyingzebra.github.io/nl_offline/tetris/unlisted.js',
  'https://another.example/anything.js'
 ]){
  const result=await h.emit('fetch',{request:new Request(url)});
  assert.equal(result.handled,false,url);
 }
});
test('activation cleans only older Tetris/Pixi caches',async()=>{
 const h=workerHarness();await h.emit('install');
 await h.caches.open('nomad-tetris-offline-v096');
 await h.caches.open('field-atlas-arcade-old');
 await h.caches.open('nomad-map-offline-v2');
 await h.emit('activate');
 assert.deepEqual(h.deleted.sort(),['field-atlas-arcade-old','nomad-tetris-offline-v096']);
 assert.ok((await h.caches.keys()).includes('nomad-map-offline-v2'));
 assert.equal(h.claims.length,1);
});
test('a missing critical asset fails installation instead of leaving a partial cache',async()=>{
 const h=workerHarness();h.setFailPath('/nl_offline/tetris/scores.js');
 await assert.rejects(h.emit('install'));
 assert.equal(h.cache,undefined);
});
test('the worker never unregisters itself or force-activates during a game',()=>{
 assert.ok(!swCode.includes('skipWaiting('));
 assert.ok(!swCode.includes('registration.unregister('));
 assert.ok(!swCode.includes('localStorage.clear'));
});

test('release marker, pinned cache name, and no-mixing policy stay in lockstep',()=>{
 const current=html.match(/name="tetris-build" content="([0-9]{3})"/)?.[1];
 const worker=swCode.match(/const CACHE_VERSION='v([0-9]{3})'/)?.[1];
 assert.equal(current,'107');
 assert.equal(worker,current);
 assert.ok(swCode.includes('fromPinnedCache(url)'));
 assert.ok(!swCode.includes('networkFirst('));
 assert.ok(!swCode.includes('skipWaiting('));
});

import {describe,test} from 'node:test';
import {BUILD_META_NAME,getBuildVersion,parsePublishedBuild,shouldReloadBuild,createPlatformManager,measureDisplayViewport,createAppLifecycle,runCleanupTasks,needsContinuousFrame} from '../tetris/platform.js';
import {createGraphicsCleanup,createGraphicsHealth} from '../tetris/render.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const appDir=fileURLToPath(new URL('../tetris',import.meta.url));

describe('Build markers and reload safety',()=>{
 const read=n=>fs.readFileSync(path.join(appDir,n),'utf8');
 const html=read('three-v027.html'),main=read('platform.js'),platform=read('platform.js');
 const documentWithVersion=v=>({querySelector:s=>s==='meta[name="tetris-build"]'&&v!==null?
  {getAttribute:attr=>attr==='content'?v:null}:null});
 test('single metadata marker determines build number without a hard-coded JS constant',()=>{
  const markers=html.match(/<meta name="tetris-build" content="[0-9]{3}">/g)||[];
  assert.equal(markers.length,1);
  const version=markers[0].match(/content="([0-9]{3})"/)[1];
  assert.equal(getBuildVersion(documentWithVersion(version)),version);
  assert.equal(parsePublishedBuild(html),version);
  assert.equal(BUILD_META_NAME,'tetris-build');
  assert.ok(main.includes('const THREE_BUILD_VERSION=getBuildVersion(document);'));
  assert.ok(!/const THREE_BUILD_VERSION=['"][0-9]{3}['"]/.test(main));
 });
 test('terminal, browser title, accessible title and debug use same runtime value',()=>{
  assert.match(main,/terminalLog\.enqueue\('BUILD: VERSION V'\+THREE_BUILD_VERSION,\s*'VER: V'\+THREE_BUILD_VERSION\)/);
  assert.ok(main.includes("document.title='NOMAD — Tetris System | version: '+THREE_BUILD_VERSION"));
  assert.ok(main.includes("'Tetris System — Three.js version: '+THREE_BUILD_VERSION"));
  assert.ok(main.includes('version:THREE_BUILD_VERSION,createdAt:'));
  assert.ok(!/<title>[^<]*V[0-9]{3}<\/title>/.test(html));
  assert.ok(!/aria-label="Tetris System — Three.js V[0-9]{3}"/.test(html));
 });
 test('HTML parser is tolerant of a valid XML-style meta tag and safe on malformed input',()=>{
  assert.equal(parsePublishedBuild('<meta name="tetris-build" content="072" />'),'072');
  assert.equal(parsePublishedBuild('<META name=\'tetris-build\' content=\'070\'>'),'070');
  for(const invalid of [null,'',42,'<meta name="theme-color" content="066">',
   '<meta name="tetris-build" content="banana">',
   '<meta name="tetris-build" content="9999">']){
   assert.equal(parsePublishedBuild(invalid),null);
  }
 });
 test('invalid or missing initial metadata is explicit, not a silent wrong version',()=>{
  for(const value of [null,'','66','0999','v066',' 066 ']){
   assert.throws(()=>getBuildVersion(documentWithVersion(value)),/invalid Tetris build metadata/);
  }
 });
 test('a strictly newer release reloads only while the game is ready and uncovered',()=>{
  assert.equal(shouldReloadBuild('065','066'),true);
  assert.equal(shouldReloadBuild('066','067',{gameStatus:'ready'}),true);
  for(const status of ['playing','paused','over'])
   assert.equal(shouldReloadBuild('066','067',{gameStatus:status}),false);
  assert.equal(shouldReloadBuild('066','067',{modalOpen:true}),false);
  assert.equal(shouldReloadBuild('066','067',{hidden:true}),false);
 });
 test('stale, equal, offline or invalid published versions never reload',()=>{
  for(const v of ['066','065','001',null,undefined,'', 'x66','9999'])
   assert.equal(shouldReloadBuild('066',v),false);
  assert.equal(shouldReloadBuild('', '067'),false);
  assert.equal(shouldReloadBuild('065','064'),false);
 });
 test('live update polling belongs to Platform Manager and fetches only uncached HTML',()=>{
  assert.ok(main.includes('createPlatformManager({'));
  assert.ok(main.includes('void platform.checkForNewBuild();'));
  assert.ok(platform.includes("new URL('./three-v027.html?update-check='+time,baseModuleURL)"));
  assert.ok(platform.includes("fetchPage(url,{cache:'no-store'})"));
  assert.ok(platform.includes('parsePublishedBuild(await reply.text())'));
  assert.ok(platform.includes('shouldReloadBuild(buildVersion,published,'));
  assert.ok(platform.includes("getGameStatus()!=='ready')return false;"));
  assert.ok(!platform.includes("new URL('./three-v027.js?update-check="));
 });
 test('release keeps permanent link and uses a renderer URL keyed to the shell build',()=>{
  const index=read('index.html');
  assert.ok(index.includes("location.replace(new URL('./three-v027.html'"));
  assert.ok(html.includes("const freshModule='./three-v027.js?build='+build"));
  assert.match(read('three-v027.js'),/from '\.\/platform\.js(?:\?[^']*)?'/);
 });
});

describe('Local module resolution',()=>{
 const modulePaths=fs.readdirSync(appDir).filter(file=>file.endsWith('.js'));
 const source=filename=>fs.readFileSync(path.join(appDir,filename),'utf8');
 const dependencies=filename=>[...source(filename).matchAll(
  /^import\s+[^\n]+?\s+from\s+['"]([^'"]+)['"];?\s*$/gm
  )].map(match=>match[1]).filter(spec=>spec.startsWith('.'));
 test('every relative ESM import resolves to an existing source file',()=>{
  let count=0;
  for(const filename of modulePaths){
   for(const spec of dependencies(filename)){
    const dep=spec.split('?')[0].split('#')[0];
    const resolved=path.resolve(appDir,path.dirname(filename),dep);
    assert.ok(fs.existsSync(resolved),filename+' imports missing '+spec);
    assert.ok(resolved.startsWith(path.resolve(appDir)+path.sep));
    count++;
   }
  }
  assert.ok(count>0);
 });
});

describe('Viewport and update checks',()=>{
 function createHarness(){
  let bounds={width:393,height:852};
  const events={window:new Map(),document:new Map()};
  const metrics={observed:0,disconnected:0,intervals:[],cleared:[],fetches:[],reloads:0,viewports:[],visibility:[],pageEvents:[]};
  let observer;
  let currentTime=20000,gameStatus='ready',screenOpen=false,reloadAllowed=true;
  let response={ok:true,text:async()=>'<meta name="tetris-build" content="086">'};
  let fetchImpl=async()=>response;
  const display={getBoundingClientRect:()=>({...bounds})};
  const safeProbe={};
  const document={hidden:false,addEventListener:(k,fn)=>events.document.set(k,fn),
   removeEventListener:(k)=>events.document.delete(k)};
  const window={devicePixelRatio:3,getComputedStyle:()=>({
   paddingTop:'59px',paddingBottom:'34px',paddingLeft:'0px',paddingRight:'0px'
  }),addEventListener:(k,fn)=>events.window.set(k,fn),
  removeEventListener:(k)=>events.window.delete(k),
  ResizeObserver:class {
   constructor(fn){this.fn=fn;observer=this;}
   observe(el){assert.equal(el,display);metrics.observed++;}
   disconnect(){metrics.disconnected++;}
  },
  setInterval:(fn,delay)=>{metrics.intervals.push({fn,delay});return 7;},
  clearInterval:id=>metrics.cleared.push(id),
  fetch:async(url,options)=>{
   metrics.fetches.push({url:String(url),options});return fetchImpl(url,options);
  },
  location:{reload:()=>metrics.reloads++}
  };
  const platform=createPlatformManager({
   window,document,display,safeProbe,
   baseModuleURL:'https://buyingzebra.github.io/nl_offline/tetris/three-v027.js',
   buildVersion:'086',getGameStatus:()=>gameStatus,isScreenOpen:()=>screenOpen,
   onViewport:(metrics,forced)=>{h.metrics.viewports.push({metrics,forced});},
   onVisibility:hidden=>h.metrics.visibility.push(hidden),
   onPageHide:persisted=>h.metrics.pageEvents.push(['hide',persisted]),
   onPageShow:persisted=>h.metrics.pageEvents.push(['show',persisted]),
   canReloadNewBuild:()=>reloadAllowed,
   now:()=>currentTime
  });
  const h={platform,window,document,display,safeProbe,metrics,
   emit:(where,name,event={})=>events[where].get(name)?.({type:name,...event}),
   get events(){return events;},
   get observer(){return observer;},
   setBounds:b=>{bounds=b;},
   setTime:n=>{currentTime=n;},
   setStatus:s=>{gameStatus=s;},
   setScreenOpen:v=>{screenOpen=v;},
   setReloadAllowed:v=>{reloadAllowed=v;},
   setResponse:r=>{response=r;},
   setFetch:fn=>{fetchImpl=fn;}
  };
  return h;
 }

 test('viewport preserves the 2x render DPR cap and CSS pixel rounding',()=>{
  const el={getBoundingClientRect:()=>({width:393.3,height:851.7})};
  assert.deepEqual(measureDisplayViewport(el,3),{width:393,height:852,dpr:2});
  assert.deepEqual(measureDisplayViewport(el,1.5),{width:393,height:852,dpr:1.5});
  assert.deepEqual(measureDisplayViewport({getBoundingClientRect:()=>({width:0,height:0})},0),
   {width:1,height:1,dpr:1});
 });

 test('start observes viewport; unchanged resizes do not trigger extra work',()=>{
  const h=createHarness();
  assert.equal(h.platform.start(),true);
  assert.equal(h.platform.start(),false);
  assert.equal(h.metrics.observed,1);
  assert.deepEqual(h.metrics.viewports.map(v=>v.metrics),[{width:393,height:852,dpr:2}]);
  assert.equal(h.metrics.intervals[0].delay,60000);
  h.observer.fn();
  assert.equal(h.metrics.viewports.length,1);
  h.emit('window','orientationchange');
  assert.equal(h.metrics.viewports.length,2);
  assert.equal(h.metrics.viewports[1].forced,true);
  assert.equal(h.metrics.viewports[1].metrics.height,852);
 });

 test('size and DPR changes propagate, while safe-area measurements cache until resize',()=>{
  const h=createHarness();
  let reads=0,top='59px';
  h.window.getComputedStyle=()=>{reads++;return {paddingTop:top,paddingBottom:'34px',paddingLeft:'0px',paddingRight:'0px'};};
  h.platform.start();
  assert.equal(h.platform.safeInsets().top,59);
  top='66px';
  assert.equal(h.platform.safeInsets().top,59);
  assert.equal(reads,1);
  h.setBounds({width:430,height:900});
  h.observer.fn();
  assert.equal(h.platform.viewport.width,430);
  assert.equal(h.platform.safeInsets().top,66);
  assert.equal(reads,2);
  h.window.devicePixelRatio=1.5;
  h.observer.fn();
  assert.equal(h.platform.viewport.dpr,1.5);
  assert.equal(h.metrics.viewports.length,3);
 });

 test('visibility, page show, focus and orientation each have separate lifecycle hooks',()=>{
  const h=createHarness();h.platform.start();
  h.document.hidden=true;h.emit('document','visibilitychange');
  h.document.hidden=false;h.emit('document','visibilitychange');
  assert.deepEqual(h.metrics.visibility,[true,false]);
  assert.equal(h.events.window.has('pageshow'),true);
  assert.equal(h.events.window.has('focus'),true);
  assert.equal(h.events.window.has('orientationchange'),true);
 });

 test('a newer build reloads only after an uncached HTML fetch while idle',async()=>{
  const h=createHarness();h.platform.start();
  h.setResponse({ok:true,text:async()=>'<meta name="tetris-build" content="087">'});
  assert.equal(await h.platform.checkForNewBuild(),true);
  assert.equal(h.metrics.reloads,1);
  assert.equal(h.metrics.fetches.length,1);
  assert.equal(h.metrics.fetches[0].options.cache,'no-store');
  assert.match(h.metrics.fetches[0].url,/\/tetris\/three-v027\.html\?update-check=20000$/);
  assert.equal(await h.platform.checkForNewBuild(),false);
  assert.equal(h.metrics.fetches.length,1);
 });

 test('active play, pause, game over, open screen and background all block update checks',async()=>{
  const h=createHarness();h.platform.start();
  for(const status of ['playing','paused','over']){
   h.setStatus(status);
   assert.equal(await h.platform.checkForNewBuild(),false);
  }
  h.setStatus('ready');h.setScreenOpen(true);
  assert.equal(await h.platform.checkForNewBuild(),false);
  h.setScreenOpen(false);h.document.hidden=true;
  assert.equal(await h.platform.checkForNewBuild(),false);
  assert.equal(h.metrics.fetches.length,0);
 });

 test('a running game or open menu during network response prevents a late reload',async()=>{
  const h=createHarness();h.platform.start();
  h.setResponse({ok:true,text:async()=>{
   h.setStatus('playing');
   return '<meta name="tetris-build" content="087">';
  }});
  assert.equal(await h.platform.checkForNewBuild(),false);
  assert.equal(h.metrics.reloads,0);
  h.setStatus('ready');h.setTime(36000);
  h.setResponse({ok:true,text:async()=>{
   h.setScreenOpen(true);
   return '<meta name="tetris-build" content="088">';
  }});
  assert.equal(await h.platform.checkForNewBuild(),false);
  assert.equal(h.metrics.reloads,0);
 });

 test('unavailable, malformed, stale or offline updates cannot interrupt a game',async()=>{
  const h=createHarness();h.platform.start();
  for(const response of [
   {ok:false},
   {ok:true,text:async()=>'<html>missing build</html>'},
   {ok:true,text:async()=>'<meta name="tetris-build" content="085">'},
   {ok:true,text:async()=>'<meta name="tetris-build" content="086">'}
  ]){
   h.setResponse(response);
   assert.equal(await h.platform.checkForNewBuild(),false);
   h.setTime(h.metrics.fetches.length*16000+20000);
  }
  h.setFetch(async()=>{throw Error('offline');});
  assert.equal(await h.platform.checkForNewBuild(),false);
  assert.equal(h.metrics.reloads,0);
 });

 test('only one pending network check is active at a time',async()=>{
  const h=createHarness();h.platform.start();
  let finish;
  h.setFetch(()=>new Promise(resolve=>{finish=resolve;}));
  const first=h.platform.checkForNewBuild();
  assert.equal(await h.platform.checkForNewBuild(),false);
  assert.equal(h.metrics.fetches.length,1);
  finish({ok:true,text:async()=>'<meta name="tetris-build" content="086">'});
  await first;
  assert.equal(h.metrics.reloads,0);
 });

 test('stop unregisters listeners, disconnects observer and prevents late reloads',async()=>{
  const h=createHarness();h.platform.start();
  let finish;
  h.setFetch(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=h.platform.checkForNewBuild();
  assert.equal(h.platform.stop(),true);
  assert.equal(h.platform.stop(),false);
  assert.equal(h.metrics.disconnected,1);
  assert.deepEqual(h.metrics.cleared,[7]);
  assert.equal(h.events.document.size,0);
  assert.equal(h.events.window.size,0);
  finish({ok:true,text:async()=>'<meta name="tetris-build" content="087">'});
  assert.equal(await pending,false);
  assert.equal(h.metrics.reloads,0);
 });

 test('pagehide and pageshow report bfcache state distinctly from visibility',()=>{
  const h=createHarness();h.platform.start();
  h.emit('window','pagehide',{persisted:true});
  h.emit('window','pageshow',{persisted:true});
  h.emit('window','pagehide',{persisted:false});
  h.emit('window','pageshow',{persisted:false});
  h.emit('window','focus');
  assert.deepEqual(h.metrics.pageEvents,[
   ['hide',true],['show',true],['hide',false],['show',false]
  ]);
  assert.deepEqual(h.metrics.visibility,[]);
 });
 test('stop unregisters pagehide callbacks as well as other listeners',()=>{
  const h=createHarness();h.platform.start();
  assert.equal(h.events.window.has('pagehide'),true);
  assert.equal(h.platform.stop(),true);
  assert.equal(h.events.window.has('pagehide'),false);
  h.emit('window','pagehide',{persisted:false});
  assert.deepEqual(h.metrics.pageEvents,[]);
 });

 test('pinned service-worker generations cannot trigger stale-shell reload loops',async()=>{
  const h=createHarness();h.platform.start();
  h.setReloadAllowed(false);
  h.setResponse({ok:true,text:async()=>'<meta name="tetris-build" content="093">'});
  assert.equal(await h.platform.checkForNewBuild(),false);
  assert.equal(h.metrics.fetches.length,1,'network check remains visible');
  assert.equal(h.metrics.reloads,0,'controlled game must not reload old cached shell');
  h.setReloadAllowed(true);
  h.setTime(40000);
  assert.equal(await h.platform.checkForNewBuild(),true);
  assert.equal(h.metrics.reloads,1,'uncontrolled page may update when idle');
 });

 test('an idle pinned page stages a newer worker without reloading',async()=>{
  const h=createHarness();h.platform.start();
  // Existing test harness has no special worker handler; add one to a second
  // manager for exercising the explicit update-request callback.
  const calls=[];let nextTime=40000;
  const manager=createPlatformManager({
   window:h.window,document:h.document,display:h.display,safeProbe:h.safeProbe,
   baseModuleURL:'https://buyingzebra.github.io/nl_offline/tetris/three-v027.js',
   buildVersion:'145',getGameStatus:()=> 'ready',isScreenOpen:()=>false,
   onViewport:()=>{},onVisibility:()=>{},
   canReloadNewBuild:()=>false,stageWorkerUpdate:async()=>{calls.push('stage');},
   reloadPage:()=>{calls.push('reload');},
   now:()=>nextTime,
   fetchPage:async()=>({ok:true,text:async()=>'<meta name="tetris-build" content="146">'})
  });
  manager.start();
  assert.equal(await manager.checkForNewBuild(),false);
  assert.deepEqual(calls,['stage']);
  manager.stop();
 });
});

describe('Suspension and cleanup',()=>{
 test('visibility suspension preserves the session and can be resumed once',()=>{
  const events=[];
  const app=createAppLifecycle({
   onSuspend:reason=>events.push(['pause',reason]),
   onResume:reason=>events.push(['redraw',reason]),
   onDispose:reason=>events.push(['teardown',reason]),
   now:()=>1000
  });
  assert.equal(app.canWork,true);
  assert.equal(app.suspend('background'),true);
  assert.equal(app.suspend('background'),false);
  assert.equal(app.status,'suspended');
  assert.equal(app.canWork,false);
  assert.equal(app.resume('foreground'),true);
  assert.equal(app.resume('foreground'),false);
  assert.equal(app.status,'active');
  assert.deepEqual(events,[['pause','background'],['redraw','foreground']]);
  assert.deepEqual([app.snapshot().suspends,app.snapshot().resumes,app.snapshot().disposals],[1,1,0]);
 });
 test('bfcache round-trip never disposes WebGL and never resumes gameplay directly',()=>{
  const events=[];
  const app=createAppLifecycle({
   onSuspend:()=>events.push('pause'),
   onResume:()=>events.push('redraw'),
   onDispose:()=>events.push('destroy')
  });
  assert.equal(app.pageHide(true),true);
  assert.equal(app.pageHide(true),false);
  assert.equal(app.canWork,false);
  assert.equal(app.pageShow(true),true);
  assert.equal(app.pageShow(true),false);
  assert.equal(app.canWork,true);
  assert.deepEqual(events,['pause','redraw']);
  assert.equal(app.snapshot().disposals,0);
 });
 test('pagehide without bfcache releases everything exactly once',()=>{
  const events=[];
  const app=createAppLifecycle({
   onSuspend:()=>events.push('pause'),
   onDispose:()=>events.push('destroy'),
   onResume:()=>events.push('resume')
  });
  assert.equal(app.pageHide(false),true);
  assert.equal(app.dispose(),false);
  assert.equal(app.pageShow(true),false);
  assert.equal(app.suspend(),false);
  assert.equal(app.resume(),false);
  assert.equal(app.status,'disposed');
  assert.deepEqual(events,['pause','destroy']);
  assert.equal(app.snapshot().disposals,1);
 });
 test('disposal works after a previously suspended page without a double pause',()=>{
  const events=[];
  const app=createAppLifecycle({onSuspend:()=>events.push('pause'),onDispose:()=>events.push('dispose')});
  app.pageHide(true);
  app.pageHide(false);
  assert.deepEqual(events,['pause','dispose']);
  assert.equal(app.snapshot().suspends,1);
 });
 test('lifecycle callback failure cannot break state changes',()=>{
  const app=createAppLifecycle({onSuspend:()=>{throw Error('unsafe pause')},onDispose:()=>{throw Error('dispose rejected')}});
  app.suspend();
  assert.match(app.snapshot().lastError,/unsafe pause/);
  app.dispose();
  assert.match(app.snapshot().lastError,/dispose rejected/);
  assert.equal(app.status,'disposed');
 });
 test('lifecycle history stays bounded and returns independent snapshots',()=>{
  let time=1000;
  const app=createAppLifecycle({now:()=>time});
  for(let i=0;i<8;i++){
   time+=1000;app.suspend();app.resume();
  }
  const snapshot=app.snapshot();
  assert.equal(snapshot.events.length,8);
  snapshot.events[0].type='altered';snapshot.events.push({type:'fake'});
  assert.equal(app.snapshot().events.length,8);
  assert.notEqual(app.snapshot().events[0].type,'altered');
  assert.equal(app.snapshot().lastReason,'foreground');
 });
 test('all owned graphics resources are released exactly once in proper order',()=>{
  const order=[];
  const d=(label)=>({dispose:()=>order.push(label)});
  const g=d('geometry'),m=d('material'),t=d('texture'),r=d('renderer'),c=d('compositor');
  const canvas={width:800,height:900};
  const audio={close:()=>{order.push('audio');return Promise.resolve()}};
  const scene={traverse:fn=>{fn({geometry:g,material:m});fn({geometry:g,material:[m]});}};
  const cleanup=createGraphicsCleanup({
   renderer:r,compositor:c,scene,textures:[t,t],canvases:[canvas,canvas],
   getAudioContext:()=>audio
  });
  assert.equal(cleanup.dispose(),true);
  assert.equal(cleanup.dispose(),false);
  assert.equal(cleanup.disposed,true);
  assert.deepEqual(order,['compositor','geometry','material','texture','renderer','audio']);
  assert.deepEqual([canvas.width,canvas.height],[1,1]);
  assert.deepEqual(cleanup.errors,[]);
 });
 test('a failed resource disposal does not skip later resources or retry failures',()=>{
  const calls=[];
  const broken={dispose:()=>{calls.push('broken');throw Error('texture failure')}};
  const good={dispose:()=>calls.push('good')};
  const renderer={dispose:()=>calls.push('renderer')};
  const cleanup=createGraphicsCleanup({renderer,compositor:{dispose:()=>{}},
   scene:{traverse:()=>{}},textures:[broken,good]});
  assert.equal(cleanup.dispose(),true);
  assert.deepEqual(calls,['broken','good','renderer']);
  assert.equal(cleanup.errors.length,1);
  assert.match(cleanup.errors[0].error,/texture failure/);
  cleanup.errors[0].name='changed';
  assert.equal(cleanup.errors[0].name,'texture');
  assert.equal(cleanup.dispose(),false);
  assert.equal(calls.length,3);
 });

 test('real platform hooks keep a cached page alive and release only on final hide',()=>{
  const windowListeners=new Map(),documentListeners=new Map();
  const calls=[];
  const win={
   devicePixelRatio:2,
   getComputedStyle:()=>({paddingTop:'0px',paddingBottom:'0px',paddingLeft:'0px',paddingRight:'0px'}),
   ResizeObserver:class {observe(){}disconnect(){calls.push('observer-stop')}},
   addEventListener:(name,cb)=>windowListeners.set(name,cb),
   removeEventListener:name=>windowListeners.delete(name),
   setInterval:()=>3,clearInterval:()=>calls.push('timer-stop')
  };
  const document={
   hidden:false,
   addEventListener:(name,cb)=>documentListeners.set(name,cb),
   removeEventListener:name=>documentListeners.delete(name)
  };
  const life=createAppLifecycle({
   onSuspend:()=>calls.push('pause'),
   onResume:()=>calls.push('redraw'),
   onDispose:()=>{
    calls.push('destroy');
    platform.stop();
   }
  });
  const platform=createPlatformManager({
   window:win,document,display:{getBoundingClientRect:()=>({width:393,height:852})},
   safeProbe:{},baseModuleURL:'https://example.test/tetris/three-v027.js',
   buildVersion:'090',getGameStatus:()=>'paused',isScreenOpen:()=>false,
   onViewport:()=>{},onVisibility:hidden=>
    hidden?life.suspend('visibility'):life.resume('visibility'),
   onPageHide:persisted=>life.pageHide(persisted),
   onPageShow:persisted=>life.pageShow(persisted)
  });
  platform.start();
  document.hidden=true;
  documentListeners.get('visibilitychange')();
  windowListeners.get('pagehide')({persisted:true});
  assert.equal(life.status,'suspended');
  assert.deepEqual(calls,['pause']);
  document.hidden=false;
  documentListeners.get('visibilitychange')();
  windowListeners.get('pageshow')({type:'pageshow',persisted:true});
  assert.equal(life.status,'active');
  assert.deepEqual(calls,['pause','redraw']);
  windowListeners.get('pagehide')({persisted:false});
  assert.equal(life.status,'disposed');
  assert.deepEqual(calls,['pause','redraw','pause','destroy','observer-stop','timer-stop']);
  assert.equal(platform.running,false);
  assert.equal(windowListeners.size,0);
  assert.equal(documentListeners.size,0);
 });

 test('individual teardown failures do not skip listener, scene or audio cleanup',()=>{
  const calls=[];
  const app=createAppLifecycle({
   onDispose:()=>runCleanupTasks([
    ['input',()=>{calls.push('input');throw Error('pointer release failed');}],
    ['graphics-health',()=>calls.push('graphics-health')],
    ['platform',()=>calls.push('platform')],
    ['graphics',()=>calls.push('graphics')],
    ['audio',()=>calls.push('audio')]
   ])
  });
  assert.equal(app.dispose(),true);
  assert.equal(app.dispose(),false);
  assert.deepEqual(calls,['input','graphics-health','platform','graphics','audio']);
  assert.match(app.snapshot().lastError,/input: pointer release failed/);
  assert.equal(app.status,'disposed');
 });
 test('successful cleanup sequence reports every completed step',()=>{
  const calls=[];
  const count=runCleanupTasks([
   ['first',()=>calls.push(1)],
   ['second',()=>calls.push(2)]
  ]);
  assert.equal(count,2);
  assert.deepEqual(calls,[1,2]);
 });
});

describe('WebGL recovery',()=>{
 function harness(){
  const handlers=new Map(),events=[];
  const canvas={
   addEventListener:(name,fn)=>{handlers.set(name,fn);events.push(['attach',name]);},
   removeEventListener:(name,fn)=>{assert.equal(handlers.get(name),fn);handlers.delete(name);events.push(['detach',name]);}
  };
  let time=1000,lost=0,restored=0,failLost=false,failRestore=false;
  const health=createGraphicsHealth({
   canvas,now:()=>time,historyLimit:4,
   onLost:()=>{lost++;if(failLost)throw Error('pause failed');},
   onRestored:()=>{restored++;if(failRestore)throw Error('texture upload failed');}
  });
  const emit=name=>{
   let prevented=false;
   handlers.get(name)?.({preventDefault(){prevented=true;}});
   return prevented;
  };
  return {health,canvas,events,handlers,emit,
   setTime:n=>{time=n;},failLost:()=>{failLost=true;},failRestore:()=>{failRestore=true;},
   get lost(){return lost;},get restored(){return restored;}
  };
 }
 test('starts healthy with inert, bounded diagnostic state',()=>{
  const h=harness();
  assert.equal(h.health.canRender,true);
  assert.equal(h.health.status,'ready');
  assert.deepEqual(h.health.snapshot(),{
   status:'ready',losses:0,restores:0,renderFailures:0,
   lastError:null,lossDurationMs:null,history:[]
  });
 });
 test('lifecycle listeners are attached and detached once',()=>{
  const h=harness();
  assert.equal(h.health.attach(),true);
  assert.equal(h.health.attach(),false);
  assert.equal(h.handlers.size,2);
  assert.equal(h.health.detach(),true);
  assert.equal(h.health.detach(),false);
  assert.equal(h.handlers.size,0);
 });
 test('lost event permits WebGL restoration, records loss, and suspends rendering',()=>{
  const h=harness();h.health.attach();
  assert.equal(h.emit('webglcontextlost'),true);
  assert.equal(h.health.status,'lost');
  assert.equal(h.health.canRender,false);
  assert.equal(h.lost,1);
  h.setTime(1325);
  assert.equal(h.health.snapshot().lossDurationMs,325);
  assert.equal(h.emit('webglcontextlost'),true);
  assert.equal(h.lost,1);
  assert.equal(h.health.snapshot().losses,1);
 });
 test('restoration requests reinitialization, then waits for one successful render',()=>{
  const h=harness();h.health.attach();
  h.emit('webglcontextlost');
  h.setTime(2200);h.emit('webglcontextrestored');
  assert.equal(h.restored,1);
  assert.equal(h.health.status,'recovering');
  assert.equal(h.health.canRender,true);
  assert.equal(h.health.snapshot().lossDurationMs,null);
  assert.equal(h.health.rendered(),true);
  assert.equal(h.health.status,'ready');
  assert.equal(h.health.rendered(),false);
  assert.deepEqual(h.health.snapshot().history.map(x=>x.type),
   ['context-lost','context-restored','frame-recovered']);
 });
 test('spurious restore does not report a recovery',()=>{
  const h=harness();h.health.attach();
  h.emit('webglcontextrestored');
  assert.equal(h.restored,0);
  assert.equal(h.health.snapshot().restores,0);
 });
 test('failed restoration blocks rendering and captures a bounded error',()=>{
  const h=harness();h.health.attach();h.failRestore();
  h.emit('webglcontextlost');h.emit('webglcontextrestored');
  assert.equal(h.health.status,'failed');
  assert.equal(h.health.canRender,false);
  assert.equal(h.health.snapshot().renderFailures,1);
  assert.match(h.health.snapshot().lastError,/texture upload failed/);
 });
 test('failed user callback does not break WebGL lost-event handling',()=>{
  const h=harness();h.health.attach();h.failLost();
  assert.equal(h.emit('webglcontextlost'),true);
  assert.equal(h.health.status,'lost');
  assert.equal(h.health.snapshot().renderFailures,1);
  assert.equal(h.health.canRender,false);
 });
 test('event history is bounded and snapshots cannot mutate live state',()=>{
  const h=harness();h.health.attach();
  for(let i=0;i<3;i++){
   h.setTime(1000+i*1000);
   h.emit('webglcontextlost');h.emit('webglcontextrestored');
   h.health.rendered();
  }
  const a=h.health.snapshot();
  assert.equal(a.losses,3);
  assert.equal(a.restores,3);
  assert.equal(a.history.length,4);
  a.history[0].type='tampered';a.history.push({type:'bogus'});
  assert.notEqual(h.health.snapshot().history[0].type,'tampered');
  assert.equal(h.health.snapshot().history.length,4);
 });
 test('render errors are recorded without changing normal state',()=>{
  const h=harness();
  h.health.recordFailure(Error('shader error'));
  assert.equal(h.health.status,'ready');
  assert.equal(h.health.snapshot().renderFailures,1);
  assert.match(h.health.snapshot().lastError,/shader error/);
 });
});

describe('Offline installation and release switching',()=>{
 const dir=appDir;
 const swCode=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
 const html=fs.readFileSync(path.join(dir,'three-v027.html'),'utf8');
 const scope='https://buyingzebra.github.io/nl_offline/tetris/';
 const currentBuild=html.match(/name="tetris-build" content="([0-9]{3})"/)?.[1];

 function workerHarness({redirectShell=false}={}){
  const events=new Map(),storage=new Map(),deleted=[],claims=[],promotions=[];
  let online=true,failPath=null,version='old',shellBuild=currentBuild,staleModule=null;
  const asURL=item=>typeof item==='string'?new URL(item,scope).href:
   item instanceof URL?item.href:item.url;
  async function fetchMock(item){
   const url=new URL(asURL(item));
   if(!online||url.pathname===failPath)throw Error('Network unavailable');
   if(url.origin!==new URL(scope).origin)throw Error('Optional fonts unavailable');
   const html=url.pathname.endsWith('/three-v027.html')?
    '<meta name="tetris-build" content="'+shellBuild+'">':'';
   const localPath=url.pathname.split('/tetris/')[1];
   let script=localPath&&/^[a-z0-9-]+\.js$/.test(localPath)?
    fs.readFileSync(path.join(dir,localPath),'utf8'):'';
   if(localPath===staleModule)
    script=script.replaceAll('?v'+currentBuild,'?v'+String(Number(currentBuild)-1).padStart(3,'0'));
   const response=new Response(version+' '+url.pathname+' '+html+'\n'+script,{status:200});
   if(redirectShell&&html){
    // Model the final response to the host's .html -> clean URL redirect.
    Object.defineProperty(response,'redirected',{value:true});
   }
   return response;
  }
  const clone=response=>{
   const copy=response.clone();
   if(response.redirected)Object.defineProperty(copy,'redirected',{value:true});
   return copy;
  };
  class TestCache{
   entries=new Map();
   async match(req){const response=this.entries.get(asURL(req));return response&&clone(response);}
   async put(req,response){this.entries.set(asURL(req),clone(response));}
   async addAll(requests){
    const staged=[];
    for(const request of requests){
     const response=await fetchMock(request);
     if(!response.ok)throw Error('Incomplete bundle');
     staged.push([request,response]);
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
   skipWaiting:async()=>promotions.push(storage.get('nomad-tetris-offline-v'+currentBuild)?.entries.size),
   addEventListener:(name,callback)=>events.set(name,callback)
  };
  const ctx={self,caches,fetch:fetchMock,URL,Request,Response,Headers,AbortController,
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
  return {emit,assets,storage,caches,claims,deleted,promotions,
   setOnline:x=>online=x,setVersion:x=>version=x,setFailPath:x=>failPath=x,
   setShellBuild:x=>shellBuild=x,setStaleModule:x=>staleModule=x,
   get cache(){return storage.get('nomad-tetris-offline-v'+currentBuild);}
  };
 }

 test('the bundle lists only existing Tetris assets',()=>{
  const h=workerHarness();
  assert.ok(h.assets.length>0);
  assert.equal(new Set(h.assets).size,h.assets.length);
  for(const item of h.assets){
   assert.ok(item.startsWith('./'),item);
   const full=new URL(item,scope);
   assert.ok(full.pathname.startsWith('/nl_offline/tetris/'),item);
   if(item!=='./')assert.ok(fs.existsSync(path.join(dir,item.slice(2))),item);
  }
  assert.ok(!h.assets.some(x=>x.includes('/pixel/')));
 });
 test('every runtime import is in the offline bundle',()=>{
  const assets=new Set(workerHarness().assets.map(a=>a.slice(2)));
  const modules=[...assets].filter(asset=>/\.[m]?js$/.test(asset)&&!asset.startsWith('vendor/'));
  for(const moduleFile of modules){
   const source=fs.readFileSync(path.join(dir,moduleFile),'utf8');
   for(const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)){
    const spec=match[1];
    let dep=null;
    if(spec.startsWith('.'))
     dep=path.posix.normalize(path.posix.join(path.posix.dirname(moduleFile),spec.split('?')[0]));
    if(dep)assert.ok(assets.has(dep),moduleFile+' imports missing '+dep);
   }
  }
 });
 test('the renderer, manifest, and icons are local',()=>{
  assert.ok(fs.existsSync(path.join(dir,'vendor/three/three.bundle.js')));
  assert.ok(!html.includes('cdn.jsdelivr.net'));
  assert.ok(html.includes('rel="manifest" href="./manifest.webmanifest"'));
  assert.ok(html.includes("navigator.serviceWorker.register('./sw.js'"));
  assert.ok(!html.includes('reg.unregister()'));
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.start_url,'./three-v027.html');
  assert.equal(manifest.scope,'./');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.orientation,'portrait');
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
   'vendor/three/three.bundle.js','render.js']){
   const url=new URL(asset+'?live=9999',scope);
   const item=await h.emit('fetch',{request:new Request(url)});
   assert.equal(item.handled,true,asset);
   assert.equal(item.response.status,200,asset);
   assert.ok((await item.response.text()).startsWith('old '),asset);
  }
  assert.equal(h.cache.entries.size,h.assets.length);
 });
 test('clean game URLs use the same release-pinned shell as .html on redirecting hosts',async()=>{
  const h=workerHarness({redirectShell:true});
  await h.emit('install');
  h.setVersion('new');
  const published=await h.emit('fetch',{
   request:new Request(new URL('./three-v027?update-check=10',scope))
  });
  assert.ok((await published.response.text()).startsWith('new '));
  h.setOnline(false);
  for(const url of ['./three-v027.html','./three-v027']){
   const {handled,response}=await h.emit('fetch',{request:new Request(new URL(url,scope))});
   assert.equal(handled,true);
   assert.equal(response.redirected,false);
   assert.match(await response.text(),/^old .*three-v027\.html/);
  }
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
  for(const script of ['three-v027.js','game.js','vendor/three/three.bundle.js']){
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
 test('a stale module import rejects installation without deleting the previous release',async()=>{
  for(const file of ['three-v027.js','platform.js','input.js','render.js']){
   const h=workerHarness();
   const old='nomad-tetris-offline-v'+String(Number(currentBuild)-1);
   const prior=await h.caches.open(old);
   await prior.put(new URL('./game.js',scope),new Response('previous game'));
   h.setStaleModule(file);
   await assert.rejects(h.emit('install'),/staged module version mismatch/);
   assert.equal(h.cache,undefined,'incomplete new release must be removed');
   assert.ok(await prior.match(new URL('./game.js',scope)),
    'previous fully installed version remains available');
  }
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
  const previousName='nomad-tetris-offline-v'+(Number(currentBuild)-1);
  const previous=await h.caches.open(previousName);
  await previous.put(new URL('./game.js',scope),new Response('previous core'));
  await h.emit('install');
  assert.ok((await h.caches.keys()).includes(previousName));
  assert.equal((await (await previous.match(new URL('./game.js',scope))).text()),'previous core');
  assert.deepEqual(h.promotions,[]);
  await h.emit('activate');
  assert.ok(!(await h.caches.keys()).includes(previousName));
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
  const h=workerHarness();h.setFailPath('/nl_offline/tetris/game.js');
  await assert.rejects(h.emit('install'));
  assert.equal(h.cache,undefined);
 });
 test('older pages and legacy caches cannot force a waiting worker to activate',async()=>{
  for(const oldBuild of ['144',String(Number(currentBuild)-1)]){
   const h=workerHarness();
   await h.caches.open('nomad-tetris-offline-v'+oldBuild);
   await h.emit('install');
   await h.emit('message',{data:{type:'NOMAD_ACTIVATE_UPDATE'}});
   assert.deepEqual(h.promotions,[]);
   assert.deepEqual(h.claims,[]);
   assert.ok((await h.caches.keys()).includes('nomad-tetris-offline-v'+oldBuild));
  }
 });

 test('release marker, pinned cache name, and no-mixing policy stay in lockstep',()=>{
  const current=html.match(/name="tetris-build" content="([0-9]{3})"/)?.[1];
  const worker=swCode.match(/const CACHE_VERSION='v([0-9]{3})'/)?.[1];
  assert.match(current,/^[0-9]{3}$/);
  assert.equal(worker,current);
  assert.ok(swCode.includes('fromPinnedCache(url)'));
  assert.ok(!swCode.includes('networkFirst('));
  execFileSync(process.execPath,[path.resolve(dir,'../tools/build-tetris-release.mjs'),'--check']);
 });
});


describe('PWA frame scheduling policy',()=>{
 test('running game and phosphor feedback retain continuous animation frames',()=>{
  assert.equal(needsContinuousFrame({gameStatus:'playing'}),true);
  assert.equal(needsContinuousFrame({persistence:true}),true);
  assert.equal(needsContinuousFrame({buttonsActive:true}),true);
  assert.equal(needsContinuousFrame({lineClearPending:true}),true);
  assert.equal(needsContinuousFrame({redrawPending:true}),true);
  assert.equal(needsContinuousFrame({scrolling:true}),true);
 });
 test('static idle state uses the scheduled terminal wake instead',()=>{
  assert.equal(needsContinuousFrame(),false);
  assert.equal(needsContinuousFrame({gameStatus:'paused'}),false);
  assert.equal(needsContinuousFrame({gameStatus:'over'}),false);
 });
 test('terminal timeout is armed only in the non-continuous branch',()=>{
  const source=fs.readFileSync(new URL('../tetris/platform.js',import.meta.url),'utf8');
  assert.match(source,/if\(keepAnimating\)requestFrame\(\);\n  else if\(game.status!=='playing'&&\!document.hidden\)/);
 });
});

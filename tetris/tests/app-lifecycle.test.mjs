import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppLifecycle,createGraphicsCleanup,runCleanupTasks} from '../platform.js';
import {createPlatformManager} from '../platform.js';

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

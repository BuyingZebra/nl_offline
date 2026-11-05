import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppLifecycle,createGraphicsCleanup} from '../app-lifecycle.js';

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

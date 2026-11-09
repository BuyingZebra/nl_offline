import test from 'node:test';
import assert from 'node:assert/strict';
import {createGraphicsHealth} from '../platform.js';

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

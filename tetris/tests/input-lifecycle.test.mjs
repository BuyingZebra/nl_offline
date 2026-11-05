import test from 'node:test';
import assert from 'node:assert/strict';
import {createInputController} from '../input-controller.js';

function target(){
 const listeners=new Map();
 return {
  listeners,
  addEventListener(name,handler,options){listeners.set(name,{handler,options});},
  removeEventListener(name,handler,options){
   assert.equal(listeners.get(name)?.handler,handler);
   assert.equal(listeners.get(name)?.options,options);
   listeners.delete(name);
  },
  emit(name,event){return listeners.get(name)?.handler(event);}
 };
}
function harness(repeating=false){
 const screen=target(),document=target(),window=target();
 let captured=null,released=0,actions=[],invalidations=0;
 screen.getBoundingClientRect=()=>({left:0,top:0,width:100,height:60});
 screen.setPointerCapture=id=>{captured=id};
 screen.hasPointerCapture=id=>captured===id;
 screen.releasePointerCapture=id=>{assert.equal(id,captured);captured=null;released++};
 const controller=createInputController({
  screen,document,window,initialsInput:{},
  getViewport:()=>({width:100,height:60}),
  getRegions:()=>[{x:0,y:0,w:100,h:60,act:'left',repeat:repeating}],
  getModal:()=>null,getModalView:()=>null,getOptionsScroll:()=>0,
  setOptionsScroll:()=>{},getOptionsMaxScroll:()=>0,setScrollVelocity:()=>{},
  setBaseDirty:()=>{},handleAction:a=>actions.push(a),perform:a=>actions.push(a),
  setSetting:()=>{},settingValue:()=>0,toggleScanlineMenu:()=>{},chooseScanline:()=>{},
  openModal:()=>{},invalidate:()=>{invalidations++},
  clamp:(n,a,b)=>Math.max(a,Math.min(b,n))
 });
 function down(id=3){
  screen.emit('pointerdown',{
   pointerType:'touch',button:0,pointerId:id,clientX:20,clientY:20,timeStamp:1,
   preventDefault(){}
  });
 }
 return {controller,screen,document,window,down,
  get captured(){return captured},get released(){return released},
  get actions(){return actions},get invalidations(){return invalidations}
 };
}
test('input ownership registers one matching listener for each event',()=>{
 const h=harness();
 assert.deepEqual([...h.screen.listeners.keys()],
  ['pointerdown','pointermove','pointerup','pointercancel','wheel']);
 assert.deepEqual([...h.window.listeners.keys()],['blur']);
 assert.deepEqual([...h.document.listeners.keys()],['keydown']);
 assert.deepEqual(h.screen.listeners.get('wheel').options,{passive:false});
});
test('final disposal releases capture, removes all listeners and is idempotent',()=>{
 const h=harness();h.down();
 assert.equal(h.controller.pressed.id,3);
 assert.equal(h.captured,3);
 assert.equal(h.controller.dispose(),true);
 assert.equal(h.released,1);
 assert.equal(h.controller.pressed,null);
 assert.equal(h.controller.disposed,true);
 assert.equal(h.screen.listeners.size,0);
 assert.equal(h.window.listeners.size,0);
 assert.equal(h.document.listeners.size,0);
 assert.equal(h.controller.dispose(),false);
 assert.equal(h.released,1);
});
test('disposal cancels delayed button repeats and ignores subsequent input',async()=>{
 const h=harness(true);
 h.down();assert.deepEqual(h.actions,['left']);
 h.controller.dispose();
 await new Promise(resolve=>setTimeout(resolve,255));
 h.screen.emit('pointerdown',{pointerId:4,clientX:20,clientY:20,preventDefault(){}});
 h.document.emit('keydown',{code:'ArrowLeft',preventDefault(){}});
 assert.deepEqual(h.actions,['left']);
});
test('temporary cancel retains listeners for browser restoration',()=>{
 const h=harness();
 h.down();h.controller.cancel();
 assert.equal(h.controller.pressed,null);
 assert.equal(h.screen.listeners.size,5);
 h.down(4);
 assert.equal(h.controller.pressed.id,4);
 assert.deepEqual(h.actions,['left','left']);
 h.controller.dispose();
});

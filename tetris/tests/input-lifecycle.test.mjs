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
function harness(repeating=false,canInteract=()=>true,regions=null){
 const screen=target(),document=target(),window=target();
 let captured=null,released=0,actions=[],invalidations=0,buttonPresses=[],buttonReleases=[];
 screen.getBoundingClientRect=()=>({left:0,top:0,width:100,height:60});
 screen.setPointerCapture=id=>{captured=id};
 screen.hasPointerCapture=id=>captured===id;
 screen.releasePointerCapture=id=>{assert.equal(id,captured);captured=null;released++};
 const controller=createInputController({
  screen,document,window,initialsInput:{},
  getViewport:()=>({width:100,height:60}),
  getRegions:()=>regions||[{x:0,y:0,w:100,h:60,act:'left',repeat:repeating}],
  getModal:()=>null,getModalView:()=>null,getOptionsScroll:()=>0,
  setOptionsScroll:()=>{},getOptionsMaxScroll:()=>0,setScrollVelocity:()=>{},
  setBaseDirty:()=>{},handleAction:a=>actions.push(a),perform:a=>actions.push(a),
  setSetting:()=>{},settingValue:()=>0,toggleScanlineMenu:()=>{},chooseScanline:()=>{},
  openModal:()=>{},invalidate:()=>{invalidations++},
  clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),canInteract,
  onButtonPress:(hit,now,held)=>buttonPresses.push({hit,held}),
  onButtonRelease:hit=>buttonReleases.push(hit)
 });
 function down(id=3){
  screen.emit('pointerdown',{
   pointerType:'touch',button:0,pointerId:id,clientX:20,clientY:20,timeStamp:1,
   preventDefault(){}
  });
 }
 return {controller,screen,document,window,down,
  get captured(){return captured},get released(){return released},
  get actions(){return actions},get invalidations(){return invalidations},
  get buttonPresses(){return buttonPresses},get buttonReleases(){return buttonReleases}
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

test('suspended and recovering pages cannot receive hidden pointer or keyboard actions',()=>{
 let active=false;
 const h=harness(false,()=>active);
 h.down();h.document.emit('keydown',{code:'ArrowLeft',preventDefault(){}});
 assert.deepEqual(h.actions,[]);
 assert.equal(h.controller.pressed,null);
 active=true;
 h.down(5);
 assert.deepEqual(h.actions,['left']);
 active=false;
 h.screen.emit('pointerup',{pointerId:5,clientX:20,clientY:20,timeStamp:3});
 assert.equal(h.controller.pressed,null);
 assert.deepEqual(h.actions,['left']);
 h.controller.dispose();
});

test('pointer holds and keyboard taps share button luminance model',()=>{
 const hit={x:0,y:0,w:100,h:60,act:'left',kind:'button',repeat:false};
 const h=harness(false,()=>true,[hit]);
 h.down();
 assert.equal(h.buttonPresses.length,1);
 assert.equal(h.buttonPresses[0].hit,hit);
 assert.equal(h.buttonPresses[0].held,true);
 h.controller.cancel();
 assert.equal(h.buttonReleases[0],hit);
 h.document.emit('keydown',{code:'ArrowLeft',repeat:false,preventDefault(){}});
 assert.equal(h.buttonPresses.length,2);
 assert.equal(h.buttonPresses[1].hit,hit);
 assert.equal(h.buttonPresses[1].held,false);
 h.controller.dispose();
});
test('non-button gameplay gestures do not trigger button luminance',()=>{
 const hit={x:0,y:0,w:100,h:60,act:'board',board:true};
 const h=harness(false,()=>true,[hit]);
 h.down();
 assert.deepEqual(h.buttonPresses,[]);
 h.controller.dispose();
});
test('inactive and recovering sessions cannot trigger afterglow events',()=>{
 const hit={x:0,y:0,w:100,h:60,act:'left',kind:'button'};
 const h=harness(false,()=>false,[hit]);
 h.down();
 h.document.emit('keydown',{code:'ArrowLeft',preventDefault(){}});
 assert.deepEqual(h.buttonPresses,[]);
 h.controller.dispose();
});

/* V077: deterministic terminal tap gate, physics-inspired startup and poweroff. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'boot-sequence.js'),'utf8');
function harness(){
 const jobs=[],classes=new Set(),rootClasses=new Set(),events=new Map(),painted=[];
 let now=0;
 const ctx={setTransform(){}};
 const canvas={width:0,height:0,getContext:()=>ctx};
 const veil={hidden:false,
  getBoundingClientRect:()=>({width:393,height:852}),
  classList:{add:c=>classes.add(c),contains:c=>classes.has(c)}};
 const document={
  getElementById:n=>n==='boot-overlay'?veil:n==='boot-canvas'?canvas:null,
  documentElement:{classList:{
   add:c=>rootClasses.add(c),remove:c=>rootClasses.delete(c),contains:c=>rootClasses.has(c)}},
  addEventListener:(name,fn)=>events.set(name,fn)
 };
 const window={document,PointerEvent:class PointerEvent{},
  innerWidth:393,innerHeight:852,devicePixelRatio:2,
  performance:{now:()=>now},
  FieldAtlasTerminal:{paint:(...args)=>painted.push(args)},
  setTimeout(fn,ms){jobs.push({at:now+ms,fn});return jobs.length}
 };
 new Function('window',source)(window);
 function advance(time){
  let loops=0;
  while(jobs.some(j=>j.at<=time)){
   if(++loops>1500)throw Error('unbounded timers');
   jobs.sort((a,b)=>a.at-b.at);
   const next=jobs.shift();now=next.at;next.fn();
  }
  now=time;
 }
 function tap(){
  let blocked=false,stopped=false;
  events.get('pointerdown')?.({
   cancelable:true,preventDefault(){blocked=true;},
   stopImmediatePropagation(){stopped=true;}
  });
  return {blocked,stopped};
 }
 return {boot:window.FieldAtlasTetrisBoot,veil,canvas,classes,rootClasses,
  painted,advance,tap,get now(){return now}};
}
test('grayscale loading canvas paints immediately, with full version: prefix',()=>{
 const x=harness();
 assert.equal(x.boot.canvas,x.canvas);
 assert.equal(x.canvas.width,786);
 assert.equal(x.canvas.height,1704);
 assert.equal(x.painted[0][4],'077');
 x.advance(2750);
 assert.equal(x.boot.waitingForTap,false);
 assert.equal(x.boot.isRolling(),false);
});
test('no auto-advance: diagnostic terminal holds indefinitely until touch',()=>{
 const x=harness();
 let rolls=0;
 x.boot.firstFrame(()=>rolls++);
 x.boot.gpuFrame();
 x.advance(2800);
 assert.equal(x.boot.waitingForTap,true);
 assert.equal(x.veil.hidden,true);
 x.advance(25000);
 assert.equal(x.boot.waitingForTap,true);
 assert.equal(x.boot.isRolling(),false);
 assert.equal(rolls,0);
 assert.equal(x.painted.at(-1)[5],true,'tap instruction is drawn');
});
test('early tap does not interrupt diagnostics or touch hidden gameplay',()=>{
 const x=harness();let rolls=0;
 x.boot.firstFrame(()=>rolls++);
 x.boot.gpuFrame();
 x.advance(2000);
 assert.deepEqual(x.tap(),{blocked:true,stopped:true});
 assert.equal(x.boot.isRolling(),false);
 x.advance(3000);
 assert.equal(x.boot.waitingForTap,true);
 assert.equal(rolls,0);
});
test('one touch collapses real GPU terminal, then one full second of black',()=>{
 const x=harness();let rolls=0;
 x.boot.firstFrame(()=>rolls++);
 x.boot.gpuFrame();
 x.advance(3000);
 x.tap();
 assert.equal(x.boot.waitingForTap,false);
 assert.equal(x.rootClasses.has('boot-poweroff'),true);
 assert.equal(x.classes.has('boot-black'),false);
 assert.equal(x.boot.isRolling(),false,'game source must stay terminal during collapse');
 x.advance(3144);
 assert.equal(x.veil.hidden,true,'CRT remains visible through snap-off');
 x.advance(3145);
 assert.equal(x.veil.hidden,false,'black cover is visible');
 assert.equal(x.classes.has('boot-black'),true);
 assert.equal(x.rootClasses.has('boot-poweroff'),false);
 assert.equal(x.boot.isRolling(),false);
 x.advance(4144);
 assert.equal(rolls,0,'1-second black interval has not ended');
 x.advance(4145);
 assert.equal(rolls,1,'new game roll begins under black cover');
 assert.equal(x.boot.isRolling(),true);
 assert.equal(x.boot.revealed,false);
 x.boot.rollFrame();
 assert.equal(x.veil.hidden,true);
 assert.equal(x.boot.revealed,true);
});
test('slow GPU readiness cannot reveal the game or enable tap prematurely',()=>{
 const x=harness();let rolls=0;
 x.advance(9000);
 x.tap();
 assert.equal(x.boot.isRolling(),false);
 x.boot.firstFrame(()=>rolls++);
 x.tap();
 assert.equal(x.boot.isRolling(),false);
 x.boot.gpuFrame();
 assert.equal(x.boot.waitingForTap,true);
 x.tap();
 x.advance(10145);
 assert.equal(rolls,1);
});
test('phosphor intensity never exceeds 100%; brief voltage spike only changes luminance',()=>{
 const x=harness();
 x.boot.firstFrame(()=>{});
 assert.deepEqual(x.boot.effects(),{phosphor:0,voltage:1});
 x.advance(500);
 x.boot.gpuFrame();
 x.advance(510);
 assert.ok(x.boot.effects().phosphor>0&&x.boot.effects().phosphor<1);
 assert.equal(x.boot.effects().voltage,1);
 x.advance(585);
 assert.equal(x.boot.effects().voltage,1.16);
 x.advance(616);
 assert.equal(x.boot.effects().voltage,1);
 x.advance(670);
 assert.equal(x.boot.effects().phosphor,1);
 x.advance(25000);
 assert.equal(x.boot.effects().phosphor,1);
 assert.equal(x.boot.effects().voltage,1);
});
test('four-turn roll retains constant initial speed and smooth final rest',()=>{
 const f=harness().boot.rollTurns;
 assert.equal(f(0),0);assert.equal(f(1),4);assert.equal(f(3),4);
 for(let i=1;i<=1000;i++)assert.ok(f(i/1000)>=f((i-1)/1000));
 assert.ok(Math.abs((f(.1)-f(.05))-(f(.2)-f(.15)))<1e-9);
 assert.ok(f(1)-f(.99)<f(.2)-f(.19));
});
test('V077 source never uses a hue-rotation filter or abbreviated version label',()=>{
 const html=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');
 const terminal=fs.readFileSync(path.join(__dirname,'terminal-screen.js'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 assert.ok(html.includes('name="tetris-build" content="077"'));
 assert.ok(!html.includes('hue-rotate'));
 assert.ok(html.includes('boot-poweroff #display'));
 assert.ok(terminal.includes("'version: '+version"));
 assert.ok(terminal.includes('TOUCH SCREEN TO CONTINUE'));
 assert.ok(app.includes("'version: '+THREE_BUILD_VERSION"));
 assert.ok(app.includes('phosphorStrength:electrical?.phosphor??1'));
});

/* V082: deterministic terminal tap gate, physics-inspired startup and poweroff. */
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
 assert.equal(x.painted[0][4],'082');
 x.advance(2750);
 assert.equal(x.boot.waitingForTap,false);
 assert.equal(x.boot.isRolling(),false);
});
test('no auto-advance: diagnostic terminal holds indefinitely until touch',()=>{
 const x=harness();
 let rolls=0;
 x.boot.firstFrame(()=>rolls++);
 x.boot.gpuFrame();
 x.boot.gpuFrame();
 x.advance(6200);
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
 x.boot.gpuFrame();
 x.advance(2000);
 assert.deepEqual(x.tap(),{blocked:true,stopped:true});
 assert.equal(x.boot.isRolling(),false);
 x.advance(6300);
 assert.equal(x.boot.waitingForTap,true);
 assert.equal(rolls,0);
});
test('one touch fades terminal to near-black, holds one second, then reveals game',()=>{
 const x=harness();let rolls=0;
 x.boot.firstFrame(()=>rolls++);
 x.boot.gpuFrame();
 x.boot.gpuFrame();
 x.advance(6400);
 x.tap();
 assert.equal(x.boot.waitingForTap,false);
 assert.equal(x.rootClasses.has('boot-poweroff'),false,'never scale the composited screen');
 assert.equal(x.classes.has('boot-black'),false,'never cover the CRT mask');
 assert.equal(x.boot.isRolling(),false,'game source stays terminal until handoff');
 assert.equal(x.boot.powerOffProgress(),0);
 x.advance(6625);
 assert.ok(x.boot.powerOffProgress()>.4&&x.boot.powerOffProgress()<.6);
 assert.equal(x.veil.hidden,true,'CRT stays visible during a content-only fade');
 x.advance(6850);
 assert.equal(x.boot.powerOffProgress(),1);
 assert.equal(x.veil.hidden,true,'near-black is composited without an extra cover');
 assert.equal(x.boot.isRolling(),false);
 x.advance(7849);
 assert.equal(rolls,0,'one-second near-black hold has not finished');
 x.advance(7850);
 assert.equal(rolls,1,'game begins its fade-in only after the hold');
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
 x.boot.gpuFrame();
 assert.equal(x.boot.waitingForTap,false,'the timeline starts at first GPU frame');
 x.advance(15100);
 assert.equal(x.boot.waitingForTap,true);
 x.tap();
 x.advance(16550);
 assert.equal(rolls,1);
});
test('phosphor intensity never exceeds 100%; brief voltage spike only changes luminance',()=>{
 const x=harness();
 x.boot.firstFrame(()=>{});
 assert.deepEqual(x.boot.effects(),{phosphor:0,voltage:1,glitch:0,clock:0});
 x.advance(500);
 x.boot.gpuFrame();
 x.boot.gpuFrame();
 x.advance(510);
 assert.ok(x.boot.effects().phosphor>0&&x.boot.effects().phosphor<1);
 assert.equal(x.boot.effects().voltage,1);
 x.advance(666);
 assert.equal(x.boot.effects().voltage,1.15);
 x.advance(686);
 assert.equal(x.boot.effects().voltage,1);
 x.advance(700);
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
test('V082 screen uses original compositor and long-form version labels',()=>{
 const html=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');
 const terminal=fs.readFileSync(path.join(__dirname,'terminal-screen.js'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 assert.ok(html.includes('name="tetris-build" content="082"'));
 assert.ok(!html.includes('hue-rotate'));
 assert.ok(!html.includes('boot-poweroff #display'));
 assert.ok(!html.includes('@keyframes boot-collapse'));
 assert.ok(source.includes('powerOffProgress(){return powerOffProgress();}'));
 assert.ok(terminal.includes("'version: '+version"));
 assert.ok(terminal.includes('TOUCH SCREEN TO CONTINUE'));
 assert.ok(app.includes("'version: '+THREE_BUILD_VERSION"));
 assert.ok(app.includes('phosphorStrength:electrical?.phosphor??1'));
});

test('V082 retains glitch code but disables synchronization tearing',()=>{
 const x=harness();let launches=0;
 x.boot.firstFrame(()=>launches++);
 x.advance(6000);
 assert.equal(x.boot.waitingForTap,false);
 x.boot.gpuFrame();
 assert.equal(x.veil.hidden,false,'first GPU frame remains safely covered');
 x.boot.gpuFrame();
 assert.equal(x.veil.hidden,true,'second GPU frame exposes terminal');
 assert.equal(x.boot.elapsed,0,'GPU readiness anchors timeline');
 x.advance(6275);
 assert.equal(x.boot.effects().glitch,0,'first former glitch window is disabled');
 x.advance(8110);
 assert.equal(x.boot.effects().glitch,0,'second former glitch window is disabled');
 x.advance(12200);
 assert.equal(x.boot.waitingForTap,true);
 assert.equal(launches,0,'tap gate is unchanged');
 x.advance(20000);
 assert.equal(launches,0,'no automatic transition');
 assert.ok(source.includes('const SIGNAL_GLITCH_ENABLED=false;'));
 assert.ok(source.includes('const faults=[[265,322,.35]'));
 assert.ok(source.includes('if(SIGNAL_GLITCH_ENABLED)for('),
  'original timings are preserved behind a feature flag');
});
test('V082 removes competing redirect and preserves continuous initial blackout',()=>{
 const html=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');
 const entry=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 assert.ok(!entry.includes('http-equiv="refresh"'));
 assert.ok(entry.includes('location.replace('));
 assert.ok(html.includes('z-index:20;background:#000;'));
 assert.ok(html.includes('name="tetris-build" content="082"'));
});

test('V082 uses a smooth 450ms fade before the original one-second pause',()=>{
 const x=harness();
 x.boot.firstFrame(()=>{});
 x.boot.gpuFrame();x.boot.gpuFrame();
 x.advance(6500);x.tap();
 x.advance(6500+225);
 assert.ok(Math.abs(x.boot.powerOffProgress()-.5)<1e-9);
 x.advance(6950);
 assert.equal(x.boot.powerOffProgress(),1);
 assert.ok(source.includes('FADE_OUT_MS=450,BLACK_MS=1000'));
 assert.ok(!source.includes('SNAP_OFF_MS'));
});

test('V082 fade-out leaves grayscale source intact while GPU luminance reaches zero',()=>{
 const x=harness();
 let invalidations=0;
 x.boot.firstFrame(()=>{},()=>{invalidations++;});
 x.boot.gpuFrame();x.boot.gpuFrame();
 x.advance(6500);
 const painted=x.painted.length;
 x.tap();
 x.advance(6725); // exactly 50% across the global fade
 assert.equal(x.boot.powerOffProgress(),.5);
 assert.equal(x.painted.length,painted,'no independent canvas faded overlay is painted');
 assert.ok(invalidations>0,'GPU redraws for each luminance update');
 x.advance(6950);
 assert.equal(x.boot.powerOffProgress(),1);
 x.advance(7949);
 assert.equal(x.boot.isRolling(),false,'source is unchanged before the one-second hold ends');
 x.advance(7950);
 assert.equal(x.boot.isRolling(),true,'source switches at zero brightness after the hold');
});

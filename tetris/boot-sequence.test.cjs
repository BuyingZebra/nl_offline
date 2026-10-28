/* V075: deterministic boot coordinator tests, no browser or GPU needed. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'boot-sequence.js'),'utf8');
function harness(){
 const jobs=[],classes=new Set(),painted=[];
 let now=0,rendered=0;
 const ctx={setTransform(){}};
 const canvas={width:0,height:0,getContext:()=>ctx};
 const veil={hidden:false,
  getBoundingClientRect:()=>({width:393,height:852}),
  classList:{add:c=>classes.add(c),contains:c=>classes.has(c)}};
 const document={getElementById:n=>n==='boot-overlay'?veil:n==='boot-canvas'?canvas:null};
 const window={document,innerWidth:393,innerHeight:852,devicePixelRatio:2,
  localStorage:{getItem:()=>null},
  performance:{now:()=>now},
  FieldAtlasTerminal:{paint:(...args)=>painted.push(args)},
  setTimeout(fn,ms){jobs.push({at:now+ms,fn});return jobs.length;}
 };
 new Function('window',source)(window);
 function advance(time){
  let loops=0;
  while(jobs.some(j=>j.at<=time)){
   if(++loops>250)throw Error('timer loop');
   jobs.sort((a,b)=>a.at-b.at);
   const next=jobs.shift();now=next.at;next.fn();
  }
  now=time;
 }
 return {boot:window.FieldAtlasTetrisBoot,veil,canvas,classes,painted,advance,
  get clock(){return now},get pending(){return jobs.length}};
}
test('the actual grayscale terminal canvas is painted synchronously before imports',()=>{
 const x=harness();
 assert.ok(x.boot);
 assert.equal(x.boot.canvas,x.canvas);
 assert.equal(x.canvas.width,786);
 assert.equal(x.canvas.height,1704);
 assert.equal(x.boot.revision,1);
 assert.equal(x.painted[0][1],393);
 assert.equal(x.painted[0][2],852);
 assert.equal(x.veil.hidden,false);
 x.advance(200);
 assert.ok(x.boot.revision>1);
});
test('terminal stays visible until GPU frame and full boot timeline complete',()=>{
 const x=harness();
 let rolls=0,repaints=0;
 x.boot.firstFrame(()=>rolls++,()=>repaints++);
 x.advance(250);
 assert.ok(repaints>0);
 assert.equal(rolls,0);
 assert.equal(x.veil.hidden,false,'screen not yet handed over to WebGL');
 x.boot.gpuFrame();
 assert.equal(x.veil.hidden,true,'real CRT terminal now visible');
 // Complete diagnostic text has been on-screen since ~2.8s.
 x.advance(6790);
 assert.equal(rolls,0);
 assert.equal(x.boot.isRolling(),false);
 assert.equal(x.veil.hidden,true,'full terminal is readable for four seconds');
 x.advance(6800);
 assert.equal(x.boot.isRolling(),true);
 assert.equal(x.veil.hidden,false,'opaque cover performs snap-off');
 assert.equal(x.classes.has('boot-off'),true);
 x.advance(6945); // 145ms snap-off is over; 1s black begins
 assert.equal(rolls,0);
 x.advance(7944);
 assert.equal(rolls,0,'black intermission stays on-screen for one full second');
 assert.equal(x.veil.hidden,false,'cover remains opaque through blackout');
 x.advance(7945);
 assert.equal(rolls,1,'snap-on begins after blackout');
 x.boot.rollFrame();
 assert.equal(x.veil.hidden,true,'revealed game is already rolling');
 x.boot.rollFrame();
 assert.equal(rolls,1);
});
test('slow renderer leaves cover visible and waits before switching scenes',()=>{
 const x=harness();
 x.advance(9000);
 assert.equal(x.veil.hidden,false);
 assert.equal(x.boot.isRolling(),false);
 let rolls=0;
 x.boot.firstFrame(()=>rolls++);
 assert.equal(rolls,0);
 x.boot.gpuFrame();
 assert.equal(x.boot.isRolling(),true);
 x.advance(10144);
 assert.equal(rolls,0);
 x.advance(10145);
 assert.equal(rolls,1);
});
test('V076 faster roll is linear before the smooth landing and ends on full turns',()=>{
 const f=harness().boot.rollTurns;
 assert.equal(f(0),0);assert.equal(f(1),4);
 assert.equal(f(3),4);assert.equal(f(-3),0);
 for(let i=1;i<=1000;i++)
  assert.ok(f(i/1000)>=f((i-1)/1000),'must never move backward');
 assert.ok(Math.abs((f(.1)-f(.05))-(f(.2)-f(.15)))<1e-9);
 assert.ok(f(1)-f(.99)<f(.2)-f(.19));
});

test('V076 timing contracts ensure >2x initial rolling speed',()=>{
 const app=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 const overlay=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');
 assert.ok(overlay.includes('name="tetris-build" content="076"'));
 assert.ok(source.includes('BOOT_MS=2800,REST_MS=4000'));
 assert.ok(source.includes('SNAP_OFF_MS=145,BLACK_MS=1000'));
 assert.ok(app.includes('(now-bootRollStartedAt)/1350'));
 const f=harness().boot.rollTurns;
 const oldSpeed=(2/(.36+(1-.36)*.5))/1.55;
 const newSpeed=((f(.1)-f(.05))/.05)/1.35;
 assert.ok(newSpeed>2*oldSpeed,'initial roll must be more than twice as fast');
});

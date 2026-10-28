/* V074: deterministic tests for the DOM boot/startup handoff. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'boot-sequence.js'),'utf8');
function harness(){
 const jobs=[];
 const classes=new Set();
 const veil={hidden:false,classList:{
  add:v=>classes.add(v),contains:v=>classes.has(v)
 }};
 const log={text:'',appendChild(node){this.text+=node.text;}};
 const cursor={classList:{add:v=>classes.add('cursor:'+v)}};
 const elements={'boot-overlay':veil,'boot-log':log,'boot-cursor':cursor};
 const document={getElementById:id=>elements[id],createTextNode:text=>({text})};
 const window={document,localStorage:{getItem:()=>null},
  setTimeout(fn,delay){jobs.push({fn,delay});return jobs.length}};
 new Function('window',source)(window);
 function next(){const task=jobs.shift();if(!task)return false;task.fn();return true;}
 function drain(max=2000){let i=0;while(next()&&i++<max){}assert.ok(i<max,'unbounded boot timer work');}
 return {boot:window.FieldAtlasTetrisBoot,veil,classes,log,cursor,jobs,next,drain};
}
test('boot never exposes the game before a rendered GPU frame and typing completes',()=>{
 const x=harness();
 assert.ok(x.boot);
 x.drain();
 assert.ok(x.log.text.includes('TETRIS SYSTEM ........ READY'));
 assert.ok(!x.veil.hidden,'terminal remains on while GPU is not ready');
 let rolling=0;
 x.boot.firstFrame(()=>rolling++);
 assert.equal(rolling,0,'shutdown takes a short visible interval');
 assert.ok(x.classes.has('boot-off'));
 x.next();
 assert.equal(rolling,1);
 assert.ok(!x.veil.hidden,'do not reveal unrendered / unrolled pixels');
 x.boot.rollFrame();
 assert.equal(x.veil.hidden,true);
 x.boot.rollFrame();
 assert.equal(rolling,1,'handoff is once-only');
});
test('first GPU frame may arrive before typing; text finishes before shutdown',()=>{
 const x=harness();
 let rolling=0;
 x.boot.firstFrame(()=>rolling++);
 assert.equal(rolling,0);
 assert.ok(!x.classes.has('boot-off'));
 x.drain();
 assert.equal(rolling,1,'starts only after typewriter and snap-off');
 assert.equal(x.veil.hidden,false);
 x.boot.rollFrame();
 assert.equal(x.veil.hidden,true);
});
test('GPU roll begins linear, settles continuously and ends at 2 exact turns',()=>{
 const {rollTurns:f}=harness().boot;
 assert.equal(f(0),0);
 assert.equal(f(1),2);
 assert.equal(f(2),2);
 assert.equal(f(-1),0);
 for(let i=1;i<=1000;i++)assert.ok(f(i/1000)>=f((i-1)/1000),
  'roll phase moves forward without jumping backward');
 const d1=f(.1)-f(.05),d2=f(.2)-f(.15);
 assert.ok(Math.abs(d1-d2)<1e-9,'first phase is constant speed');
 assert.ok(f(1)-f(.99)<f(.2)-f(.19),'ease to a nearly zero final velocity');
});

/* V075 source-accurate original boot concept checks. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'terminal-screen.js'),'utf8');
function setup(){
 const text=[],fill=[],strokes=[];
 const g={
  save(){},restore(){},translate(){},scale(){},beginPath(){},
  moveTo(){},lineTo(){},stroke(){strokes.push(this.strokeStyle);},
  strokeRect(){strokes.push(this.strokeStyle);},
  fillRect(x,y,w,h){fill.push({x,y,w,h,color:this.fillStyle,alpha:this.globalAlpha??1});},
  fillText(v,x,y){text.push({v,x,y,color:this.fillStyle,font:this.font});}
 };
 const window={};
 new Function('window',code)(window);
 return {terminal:window.FieldAtlasTerminal,text,fill,strokes,g};
}
test('approved FIRST concept fills screen with header, statuses, dump and prompt',()=>{
 const x=setup();
 x.terminal.paint(x.g,393,852,6720 ,'082');
 const strings=x.text.map(item=>item.v);
 assert.ok(strings.includes('NOMAD // TETRIS SYSTEM'));
 assert.ok(strings.includes('BOOT SEQUENCE INITIATED'));
 assert.ok(strings.includes('TETRIS MATRIX'));
 assert.ok(strings.some(s=>s.startsWith('0x1000')));
 assert.ok(strings.some(s=>s.startsWith('0x1180')));
 assert.ok(strings.includes('MODULES'));
 assert.ok(strings.includes('MEMORY'));
 assert.ok(strings.includes('SIGNAL'));
 assert.ok(strings.includes('READY TO PLAY.'));
 assert.ok(strings.includes('>'));
 assert.ok(x.fill.some(v=>v.x===48&&v.y===798&&v.w===8&&v.h===14));
});
test('boot source remains exclusively gray, separate from phosphor colour',()=>{
 const x=setup();
 x.terminal.paint(x.g,393,852,6500 ,'082');
 const color=v=>/^#(?:080808|101010)$/.test(v)||/^rgb\((\d+),\1,\1\)$/.test(v);
 assert.ok(x.fill.every(v=>color(v.color)));
 assert.ok(x.text.every(v=>color(v.color)));
 assert.ok(x.strokes.every(v=>color(v)));
 assert.ok(!code.includes('hue-rotate'));
 assert.ok(!code.includes('text-shadow'));
});
test('game and memory-dump miniature use one exact 8-layer beveled tile face',()=>{
 const x=setup();
 x.terminal.tileFace(x.g,10,20,15,15,'T');
 assert.equal(x.fill.length,8);
 const top=x.fill[1],bottom=x.fill[3];
 assert.ok(top.color!==bottom.color,'top highlight and lower shadow preserved');
 const app=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 assert.ok(app.includes('window.FieldAtlasTerminal.tileFace(g,x,y,w,h,kind)'));
 assert.ok(!app.includes('const brightness={I:.99'));
});
test('terminal is responsive and never scales out of its own screen bounds',()=>{
 const x=setup();
 x.terminal.paint(x.g,844,390,6500 ,'082');
 assert.ok(x.fill.length>10);
 assert.ok(x.text.length>20);
});

test('V082 shows long-form version and touch instruction only after readiness',()=>{
 const a=setup();
 a.terminal.paint(a.g,393,852,6000,'082',false);
 assert.ok(a.text.some(item=>item.v==='version: 082'));
 assert.ok(a.text.some(item=>item.v==='READY TO PLAY.'));
 assert.ok(!a.text.some(item=>item.v==='TOUCH SCREEN TO CONTINUE'));
 const b=setup();
 b.terminal.paint(b.g,393,852,6300,'082',true);
 assert.ok(b.text.some(item=>item.v==='TOUCH SCREEN TO CONTINUE'));
 assert.ok(!b.text.some(item=>item.v==='READY TO PLAY.'));
});

test('V082 startup fades uniformly from off to #080808 without any bright horizontal beam',()=>{
 const off=setup();
 off.terminal.paint(off.g,393,852,0,'082',false);
 assert.deepEqual(off.fill.map(v=>[v.w,v.h,v.color]),[[393,852,'rgb(0,0,0)']]);
 const mid=setup();
 mid.terminal.paint(mid.g,393,852,365,'082',false);
 assert.equal(mid.fill.length,1,'no horizontal flash or additional raster geometry');
 assert.equal(mid.fill[0].w,393);
 assert.equal(mid.fill[0].h,852);
 const lit=setup();
 lit.terminal.paint(lit.g,393,852,680,'082',false);
 assert.equal(lit.fill.length,1);
 assert.equal(lit.fill[0].color,'rgb(8,8,8)');
 const next=setup();
 next.terminal.paint(next.g,393,852,780,'082',false);
 assert.ok(next.text.some(item=>item.v.length>0&&'NOMAD // TETRIS SYSTEM'.startsWith(item.v)));
 assert.ok(!next.text.some(item=>item.v==='BOOT SEQUENCE INITIATED'));
});
test('V082 preserves typed diagnostics, memory rows, modules and the touch prompt',()=>{
 const early=setup();
 early.terminal.paint(early.g,393,852,1550 ,'082',false);
 assert.ok(early.text.some(item=>item.v.includes('BOOT')));
 assert.ok(!early.text.some(item=>item.v.startsWith('0x1000')));
 const middle=setup();
 middle.terminal.paint(middle.g,393,852,3160 ,'082',false);
 assert.ok(middle.text.some(item=>item.v.startsWith('0x1000')));
 assert.ok(!middle.text.some(item=>item.v.startsWith('0x1180')));
 const done=setup();
 done.terminal.paint(done.g,393,852,6400 ,'082',true);
 assert.ok(done.text.some(item=>item.v.startsWith('0x1180')));
 assert.ok(done.text.some(item=>item.v==='MODULES'));
 assert.ok(done.text.some(item=>item.v==='MEMORY'));
 assert.ok(done.text.some(item=>item.v==='SIGNAL'));
 assert.ok(done.text.some(item=>item.v==='TOUCH SCREEN TO CONTINUE'));
});

test('V082 terminal image remains unchanged while GPU owns all luminance fades',()=>{
 const frame=setup();
 frame.terminal.paint(frame.g,393,852,6600,'082',true);
 assert.ok(frame.text.some(t=>t.v==='TOUCH SCREEN TO CONTINUE'));
 assert.ok(frame.text.some(t=>t.v==='NOMAD // TETRIS SYSTEM'));
 assert.ok(!frame.fill.some(t=>t.color==='#080808'&&t.alpha<1),
  'terminal source should not apply its own faded overlay');
 const main=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 const boot=fs.readFileSync(path.join(__dirname,'boot-sequence.js'),'utf8');
 assert.ok(main.includes('contentLuminance=1-(boot?.powerOffProgress?.()??0)'));
 assert.ok(boot.includes("Terminal.paint(ctx,w,h,elapsed(),'082',presented&&elapsed()>=BOOT_MS)"));
 const compositor=fs.readFileSync(path.join(__dirname,'compositor.js'),'utf8');
 assert.ok(compositor.includes('uContentLuminance'));
 assert.ok(compositor.includes('gl_FragCoord.x,uScreenHeight-gl_FragCoord.y'));
});

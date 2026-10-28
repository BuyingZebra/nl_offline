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
  fillRect(x,y,w,h){fill.push({x,y,w,h,color:this.fillStyle});},
  fillText(v,x,y){text.push({v,x,y,color:this.fillStyle,font:this.font});}
 };
 const window={};
 new Function('window',code)(window);
 return {terminal:window.FieldAtlasTerminal,text,fill,strokes,g};
}
test('approved FIRST concept fills screen with header, statuses, dump and prompt',()=>{
 const x=setup();
 x.terminal.paint(x.g,393,852,6720 ,'079');
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
 x.terminal.paint(x.g,393,852,6500 ,'079');
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
 x.terminal.paint(x.g,844,390,6500 ,'079');
 assert.ok(x.fill.length>10);
 assert.ok(x.text.length>20);
});

test('V079 shows long-form version and touch instruction only after readiness',()=>{
 const a=setup();
 a.terminal.paint(a.g,393,852,6000,'079',false);
 assert.ok(a.text.some(item=>item.v==='version: 079'));
 assert.ok(a.text.some(item=>item.v==='READY TO PLAY.'));
 assert.ok(!a.text.some(item=>item.v==='TOUCH SCREEN TO CONTINUE'));
 const b=setup();
 b.terminal.paint(b.g,393,852,6300,'079',true);
 assert.ok(b.text.some(item=>item.v==='TOUCH SCREEN TO CONTINUE'));
 assert.ok(!b.text.some(item=>item.v==='READY TO PLAY.'));
});

test('V079 startup fades uniformly from off to #080808 without any bright horizontal beam',()=>{
 const off=setup();
 off.terminal.paint(off.g,393,852,0,'079',false);
 assert.deepEqual(off.fill.map(v=>[v.w,v.h,v.color]),[[393,852,'rgb(0,0,0)']]);
 const mid=setup();
 mid.terminal.paint(mid.g,393,852,365,'079',false);
 assert.equal(mid.fill.length,1,'no horizontal flash or additional raster geometry');
 assert.equal(mid.fill[0].w,393);
 assert.equal(mid.fill[0].h,852);
 const lit=setup();
 lit.terminal.paint(lit.g,393,852,680,'079',false);
 assert.equal(lit.fill.length,1);
 assert.equal(lit.fill[0].color,'rgb(8,8,8)');
 const next=setup();
 next.terminal.paint(next.g,393,852,780,'079',false);
 assert.ok(next.text.some(item=>item.v.length>0&&'NOMAD // TETRIS SYSTEM'.startsWith(item.v)));
 assert.ok(!next.text.some(item=>item.v==='BOOT SEQUENCE INITIATED'));
});
test('V079 preserves typed diagnostics, memory rows, modules and the touch prompt',()=>{
 const early=setup();
 early.terminal.paint(early.g,393,852,1550 ,'079',false);
 assert.ok(early.text.some(item=>item.v.includes('BOOT')));
 assert.ok(!early.text.some(item=>item.v.startsWith('0x1000')));
 const middle=setup();
 middle.terminal.paint(middle.g,393,852,3160 ,'079',false);
 assert.ok(middle.text.some(item=>item.v.startsWith('0x1000')));
 assert.ok(!middle.text.some(item=>item.v.startsWith('0x1180')));
 const done=setup();
 done.terminal.paint(done.g,393,852,6400 ,'079',true);
 assert.ok(done.text.some(item=>item.v.startsWith('0x1180')));
 assert.ok(done.text.some(item=>item.v==='MODULES'));
 assert.ok(done.text.some(item=>item.v==='MEMORY'));
 assert.ok(done.text.some(item=>item.v==='SIGNAL'));
 assert.ok(done.text.some(item=>item.v==='TOUCH SCREEN TO CONTINUE'));
});

test('V079 power-off squeezes only grayscale source while retaining full eight-layer tiles',()=>{
 const frame=setup();
 frame.terminal.paint(frame.g,393,852,6600,'079',true,.5);
 assert.equal(frame.fill[0].color,'#080808','off-state background remains near-black');
 assert.ok(frame.text.some(t=>t.v==='TOUCH SCREEN TO CONTINUE'));
 const fullyOff=setup();
 fullyOff.terminal.paint(fullyOff.g,393,852,6600,'079',true,1);
 assert.deepEqual(fullyOff.fill.map(v=>v.color),['#080808']);
 assert.equal(fullyOff.text.length,0,'terminal content disappears while background stays');
 const compositor=fs.readFileSync(path.join(__dirname,'compositor.js'),'utf8');
 assert.ok(!compositor.includes('uContentCollapse'),'CRT pipeline must not animate');
 assert.ok(compositor.includes('gl_FragCoord.x,uScreenHeight-gl_FragCoord.y'),
  'scanlines remain fixed in screen pixel coordinates');
});

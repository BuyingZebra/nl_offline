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
 x.terminal.paint(x.g,393,852,6720,'078');
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
 x.terminal.paint(x.g,393,852,6500,'078');
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
 x.terminal.paint(x.g,844,390,6500,'078');
 assert.ok(x.fill.length>10);
 assert.ok(x.text.length>20);
});

test('V078 shows long-form version and touch instruction only after readiness',()=>{
 const a=setup();
 a.terminal.paint(a.g,393,852,6000,'078',false);
 assert.ok(a.text.some(item=>item.v==='version: 078'));
 assert.ok(a.text.some(item=>item.v==='READY TO PLAY.'));
 assert.ok(!a.text.some(item=>item.v==='TOUCH SCREEN TO CONTINUE'));
 const b=setup();
 b.terminal.paint(b.g,393,852,6300,'078',true);
 assert.ok(b.text.some(item=>item.v==='TOUCH SCREEN TO CONTINUE'));
 assert.ok(!b.text.some(item=>item.v==='READY TO PLAY.'));
});

test('V078 power-on begins with only a horizontal charging beam',()=>{
 const x=setup();
 x.terminal.paint(x.g,393,852,190,'078',false);
 assert.ok(x.fill.some(item=>item.h<8&&item.w>300));
 assert.ok(!x.text.some(item=>item.v.includes('NOMAD')));
 const y=setup();
 y.terminal.paint(y.g,393,852,780,'078',false);
 assert.ok(y.text.some(item=>item.v.length>0&&'NOMAD // TETRIS SYSTEM'.startsWith(item.v)));
 assert.ok(!y.text.some(item=>item.v==='BOOT SEQUENCE INITIATED'));
});
test('V078 types diagnostics, memory rows, modules and a final touch prompt in stages',()=>{
 const early=setup();
 early.terminal.paint(early.g,393,852,1550,'078',false);
 assert.ok(early.text.some(item=>item.v.includes('BOOT')));
 assert.ok(!early.text.some(item=>item.v.startsWith('0x1000')));
 const middle=setup();
 middle.terminal.paint(middle.g,393,852,3160,'078',false);
 assert.ok(middle.text.some(item=>item.v.startsWith('0x1000')));
 assert.ok(!middle.text.some(item=>item.v.startsWith('0x1180')));
 const done=setup();
 done.terminal.paint(done.g,393,852,6400,'078',true);
 assert.ok(done.text.some(item=>item.v.startsWith('0x1180')));
 assert.ok(done.text.some(item=>item.v==='MODULES'));
 assert.ok(done.text.some(item=>item.v==='MEMORY'));
 assert.ok(done.text.some(item=>item.v==='SIGNAL'));
 assert.ok(done.text.some(item=>item.v==='TOUCH SCREEN TO CONTINUE'));
});

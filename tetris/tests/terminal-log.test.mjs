import test from 'node:test';
import assert from 'node:assert/strict';
import {composeTerminalMessage,createTerminalLog,drawTerminalLog} from '../terminal-log.js';

const at=new Date(2026,10,8,9,32,45);
test('dot leaders fill each character cell and flush-align the status',()=>{
 const entry={at,full:'GAME: SESSION STARTED',short:'GM: START'};
 for(const width of [17,20,24,28,32,38]){
  const line=composeTerminalMessage(entry,width);
  assert.equal(line.length,width-3);
  assert.match(line,/\.{2,}/,'leaders have at least two dots');
  assert.match(line,/START(?:ED)?$/,'status remains at the right edge');
  assert.equal(line,line.toUpperCase(),'all terminal messages are uppercase');
 }
 const expanded=composeTerminalMessage({at,full:'SYSTEM: READY',short:'SYS: READY'},38);
 assert.match(expanded,/^\[09:32:45\] SYSTEM/);
 const compact=composeTerminalMessage(entry,24);
 assert.match(compact,/^\[09:32\] GM /);
});
test('cursor advances one cell at a time and deletes with BS SP BS',()=>{
 const log=createTerminalLog({clock:()=>at});
 log.setColumns(30);
 assert.equal(log.advance(0),true);
 assert.equal(log.snapshot().cursor,2,'prompt occupies first two columns');
 assert.equal(log.advance(40),true);
 assert.equal(log.snapshot().cursor,3,'one character per keystroke');
 for(let now=80;now<=1600;now+=20)log.advance(now);
 const initial=log.snapshot();
 assert.equal(initial.cursor,29,'cursor occupies the cell after right-aligned status');
 assert.match(initial.cells.join(''),/READY/);
 log.enqueue('GAME: PAUSED','GM: PAUSED');
 let sawErase=false,sawNew=false;
 for(let now=1620;now<=7200;now+=20){
  log.advance(now);
  if(log.snapshot().phase==='erase')sawErase=true;
  if(log.snapshot().cells.join('').includes('PAUSED'))sawNew=true;
 }
 assert.ok(sawErase,'previous line is erased before replacement');
 assert.ok(sawNew,'queued message is typed into the same row');
});
test('resizing and late font loads recompose the active line to fit',()=>{
 const log=createTerminalLog({clock:()=>at});
 log.advance(0);
 log.setColumns(23);
 for(let now=40;now<=1500;now+=20)log.advance(now);
 const line=log.snapshot().cells.join('').trimEnd();
 assert.match(line,/READY$/,'status cannot be clipped by initial width');
 assert.equal(log.snapshot().cursor,22);
});
test('title font remains visible in a fixed-width, full-height cursor grid',()=>{
 const log=createTerminalLog({clock:()=>at});
 const drawn=[];
 const ctx={
  save(){},restore(){},beginPath(){},rect(){},clip(){},
  measureText(ch){return {width:ch==='M'||ch==='W'?10:ch===' '?4:8,
   actualBoundingBoxAscent:12,actualBoundingBoxDescent:0}},
  fillText(ch,x,y){drawn.push({type:'glyph',ch,x,y});},
  fillRect(x,y,w,h){drawn.push({type:'cursor',x,y,w,h});}
 };
 const r={dx:11,dw:371,footerY:800};
 drawTerminalLog(ctx,log,r,0);
 assert.match(ctx.font,/700 17px "Roboto Condensed"/);
 const cursor=drawn.find(x=>x.type==='cursor');
 assert.ok(cursor);
 assert.equal(cursor.w,11,'cursor is a full measured character cell');
 assert.equal(cursor.h,16,'cursor extends two pixels above and below capitals');
 assert.equal(cursor.y+cursor.h/2,800,'cursor is vertically centered on text row');
});

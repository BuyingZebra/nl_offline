import test from 'node:test';
import assert from 'node:assert/strict';
import {composeTerminalMessage,createTerminalLog,drawTerminalLog,terminalLineBounds} from '../terminal-log.js';
const at=new Date(2026,10,8,9,32,45);

test('statuses remain flush-right after typed dot leaders',()=>{
 const entry={at,full:'GAME: SESSION STARTED',short:'GM: START'};
 for(const columns of [17,20,24,28,32,38]){
  const line=composeTerminalMessage(entry,columns);
  assert.equal(line.length,columns-3);
  assert.match(line,/\.{2,}/);
  assert.match(line,/START(?:ED)?$/);
  assert.equal(line,line.toUpperCase());
 }
});
test('next prompt scrolls the old message into history without backspacing',()=>{
 const log=createTerminalLog({clock:()=>at});
 log.setColumns(30);
 log.advance(0);
 assert.equal(log.snapshot().cursor,2);
 log.advance(40);
 assert.equal(log.snapshot().cursor,3);
 for(let t=80;t<2100;t+=20)log.advance(t);
 assert.match(log.snapshot().cells.join(''),/READY/);
 log.enqueue('GAME: SESSION STARTED','GM: START');
 let sawScroll=false;
 for(let t=2100;t<8000;t+=20){
  const changed=log.advance(t),s=log.snapshot(t);
  if(s.phase==='scroll'){
   sawScroll=true;
   assert.equal(changed,true);
   assert.ok(s.scrollProgress>=0&&s.scrollProgress<=1);
  }
 }
 assert.ok(sawScroll);
 assert.match(log.snapshot().history,/READY/);
 assert.match(log.snapshot().cells.join(''),/START/);
});
test('a narrower viewport retains the end of the active message',()=>{
 const log=createTerminalLog({clock:()=>at});
 log.advance(0);
 log.setColumns(23);
 for(let t=40;t<1500;t+=20)log.advance(t);
 assert.match(log.snapshot().cells.join('').trimEnd(),/READY$/);
 assert.equal(log.snapshot().cursor,22);
});
test('the fading top history does not move the bottom cursor',()=>{
 const log=createTerminalLog({clock:()=>at});
 const glyphs=[],gradients=[];
 const ctx={
  save(){},restore(){},beginPath(){},rect(){},clip(){},
  measureText(ch){return {width:ch==='M'||ch==='W'?10:ch===' '?4:8,
   actualBoundingBoxAscent:12,actualBoundingBoxDescent:0}},
  fillText(ch,x,y){glyphs.push({ch,x,y});},
  fillRect(x,y,w,h){glyphs.push({x,y,w,h});},
  createLinearGradient(){const obj={stops:[],addColorStop(at,color){this.stops.push([at,color]);}};
   gradients.push(obj);return obj;}
 };
 const r={dx:11,dw:371,dy:660,dh:110,footerY:800};
 drawTerminalLog(ctx,log,r,0);
 assert.match(ctx.font,/700 10px "Roboto Condensed"/);
 const cursor=glyphs.find(x=>x.w===11);
 assert.ok(cursor);
 assert.equal(cursor.h,16,'block cursor retains a 2px top/bottom overhang');
 assert.equal(cursor.y+cursor.h/2,terminalLineBounds(r).y+29);
 assert.equal(gradients.length,1);
 assert.equal(gradients[0].stops[0][1],'#080808');
 assert.equal(gradients[0].stops.at(-1)[1],'rgba(8,8,8,0)');
 assert.ok(terminalLineBounds(r).y>=r.dy+r.dh);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {composeTerminalMessage,createTerminalLog,drawTerminalLog,terminalLineBounds} from '../ui.js';
const at=new Date(2026,10,8,10,43,0);

test('dot leaders remain right-aligned on small and large screens',()=>{
 const event={at,full:'GAME: SESSION STARTED',short:'GM: START'};
 for(const width of [17,20,24,28,32,38]){
  const line=composeTerminalMessage(event,width);
  assert.equal(line.length,width-3);
  assert.match(line,/\.{2,}/);
  assert.match(line,/START(?:ED)?$/);
 }
});
test('37 characters per second controls terminal typing cadence',()=>{
 const log=createTerminalLog({clock:()=>at});
 log.setColumns(30);
 log.advance(0);
 assert.equal(log.snapshot().cursor,2);
 log.advance(10);
 assert.equal(log.snapshot().cursor,3);
 assert.equal(log.advance(37),false);
 assert.equal(log.snapshot().cursor,3);
 assert.equal(log.advance(38),true);
 assert.equal(log.snapshot().cursor,4);
});
test('snap-off 250ms, snap-down 250ms, then new top-row typing',()=>{
 const log=createTerminalLog({clock:()=>at,typeMs:10,holdMs:0});
 log.setColumns(30);log.advance(0);
 for(let t=10;t<=290;t+=10)log.advance(t);
 assert.match(log.snapshot().cells.join(''),/READY/);
 log.enqueue('GAME: PAUSED','GM: PAUSED');
 assert.equal(log.advance(300),true);
 assert.equal(log.snapshot().phase,'snap-off');
 assert.equal(log.snapshot().activeVisible,false);
 assert.equal(log.snapshot().history,'');
 assert.equal(log.advance(549),false);
 assert.equal(log.advance(550),true);
 assert.equal(log.snapshot().phase,'pretype');
 assert.match(log.snapshot().history,/READY$/);
 assert.equal(log.snapshot().cursor,2);
 assert.equal(log.advance(799),false);
 assert.equal(log.snapshot().cursor,2);
 assert.equal(log.advance(800),true);
 for(let t=810;t<=1150;t+=10)log.advance(t);
 assert.match(log.snapshot().cells.join(''),/PAUSED/);
 assert.match(log.snapshot().history,/READY/);
});
test('reflow preserves both rows after screen size change',()=>{
 const log=createTerminalLog({clock:()=>at,typeMs:10,holdMs:0});
 log.advance(0);log.setColumns(23);
 for(let t=10;t<=250;t+=10)log.advance(t);
 assert.match(log.snapshot().cells.join('').trimEnd(),/READY$/);
 log.enqueue('GAME: PAUSED','GM: PAUSED');
 for(let t=260;t<=850;t+=10)log.advance(t);
 log.setColumns(34);
 assert.match(log.snapshot().history,/READY$/);
 assert.equal(log.snapshot().columns,34);
});
test('static prompts, top cursor and bottom-only gradient in the existing crop',()=>{
 const log=createTerminalLog({clock:()=>at});
 const drawn=[],gradients=[];
 const ctx={
  save(){},restore(){},beginPath(){},rect(){},clip(){},
  measureText(ch){return {width:ch==='M'||ch==='W'?10:ch===' '?4:8,
   actualBoundingBoxAscent:12,actualBoundingBoxDescent:0}},
  fillText(ch,x,y){drawn.push({type:'glyph',ch,x,y});},
  fillRect(x,y,w,h){drawn.push({type:'rect',x,y,w,h});},
  createLinearGradient(){const grad={stops:[],addColorStop(at,color){this.stops.push([at,color]);}};
   gradients.push(grad);return grad;}
 };
 const r={dx:11,dw:371,dy:660,dh:110,footerY:800};
 drawTerminalLog(ctx,log,r,0);
 assert.match(ctx.font,/700 10px "Roboto Condensed"/);
 const prompts=drawn.filter(x=>x.type==='glyph'&&x.ch==='>');
 assert.equal(prompts.length,2);
 assert.equal(prompts[0].x,prompts[1].x);
 assert.ok(prompts[0].y<prompts[1].y);
 const cursor=drawn.find(x=>x.type==='rect'&&x.w===11);
 assert.ok(cursor);
 assert.equal(cursor.h,16);
 assert.equal(cursor.y+cursor.h/2,terminalLineBounds(r).y+16);
 assert.equal(terminalLineBounds(r).h,37,'only the terminal drawing area grows');
 assert.equal(gradients.length,1);
 assert.equal(gradients[0].stops[0][1],'rgba(8,8,8,0)');
 assert.equal(gradients[0].stops.at(-1)[1],'#080808');
 assert.ok(terminalLineBounds(r).y>=r.dy+r.dh);
});

/* V115: restored controls container; soft drop replaces hard drop. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createHudDrawing,fitPreviewCells} from '../hud-drawing.js';
const require=createRequire(import.meta.url);
const {computeLayout}=require('../layout.js');

const ui={
 unit:6,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,
 padX:11,stackGap:6,side:93,sideGap:6,headHeight:80,headIcons:46,
 headIconGap:6,headRightPad:6,headTitleInset:17,deckBottom:30,
 deckPad:6,scoreHeight:45,deckGap:6,padGap:6,padHeight:53,
 extrasHeight:44,extrasGap:6,holdHeight:88,nextHeight:162,statsHeight:92
};
function makeHUD(){
 const painted={panels:[],text:[],pieces:[],keys:[],rects:[]};
 const game={hold:'S',queue:['T','O','J'],score:684,level:3,lines:12,pieces:33};
 const hud=createHudDrawing({
  panel:(...v)=>painted.panels.push(v),text:(...v)=>painted.text.push(v),
  rect:(...v)=>painted.rects.push(v),key:(...v)=>painted.keys.push(v),
  smallPiece:(...v)=>painted.pieces.push(v),
  getGame:()=>game,getHighs:()=>[{score:9000}],
  C:{panel:'#1d1d1d',bg:'#080808',border:'#777',subtleBorder:'#2e2e2e',
    weak:'#aeaeae',ink:'#e3e3e3'},
  UI_SPACE:ui,fmt:(n,k=6)=>String(n).padStart(k,'0')
 });
 return {hud,painted,game};
}
test('NEXT, score and HOLD are compact right-aligned single panels',()=>{
 const r=computeLayout(393,852,{top:59,bottom:34},ui);
 const {hud,painted}=makeHUD();
 hud.drawSidebar(r);
 assert.deepEqual(painted.text.map(t=>t[0]),
  ['NEXT','SCORE','000684','LEVEL','03','LINES','12','HOLD']);
 assert.deepEqual(painted.pieces.map(p=>[p[0],p[5]]),[['T','next'],['S','hold']]);
 assert.equal(painted.panels.length,5,'NEXT, three flat readouts, HOLD');
 assert.deepEqual(painted.panels.map(p=>p[4]),[0,0,0,0,0],
  'score modules, like the previews, have square corners and no bevel');
 const [next,scoreBox,levelBox,linesBox,hold]=painted.panels;
 const panels=painted.panels;
 for(const [x,y,w,h] of panels){
  assert.ok(Math.abs(w-r.nextPanel.w)<.00001,'ALL five boxes have equal width');
  assert.ok(Math.abs(x+w-r.sideX-r.sideW)<.00001,
   'all five boxes share the header/footer right alignment');
  assert.ok(Math.abs(x+w-r.hx-r.hw)<.00001,
   'portrait boxes end at header right edge');
 }
 assert.deepEqual(next.slice(0,4),[
  r.nextPanel.x,r.nextPanel.y,r.nextPanel.w,r.nextPanel.h]);
 assert.deepEqual(hold.slice(0,4),[
  r.holdPanel.x,r.holdPanel.y,r.holdPanel.w,r.holdPanel.h]);
 assert.equal(next[3],hold[3],'NEXT/HOLD same preview height');
 assert.equal(next[2],hold[2],'NEXT/HOLD same preview width');
 assert.ok(Math.abs(scoreBox[3]-levelBox[3])<.00001,
  'SCORE and LEVEL readouts have equal heights');
 assert.ok(Math.abs(scoreBox[3]-linesBox[3])<.00001,
  'SCORE and LINES readouts have equal heights');
 assert.ok(scoreBox[1]>=r.statsPanel.y);
 assert.ok(linesBox[1]+linesBox[3]<=r.statsPanel.y+r.statsPanel.h+.00001);
 assert.ok(scoreBox[1]+scoreBox[3]<levelBox[1]);
 assert.ok(levelBox[1]+levelBox[3]<linesBox[1]);
 assert.equal(painted.text[0][5],'left','NEXT outside label left aligned');
 assert.equal(painted.text.at(-1)[5],'left','HOLD outside label left aligned');
 assert.ok(Math.abs(painted.text[0][1]-(next[0]+Math.max(3,Math.min(6,r.statsPanel.w*.06))+1))<.00001);
 assert.ok(Math.abs(painted.text.at(-1)[1]-painted.text[0][1])<.00001);
 for(const [index,boxIndex] of [[1,1],[3,2],[5,3]]){
  const label=painted.text[index],number=painted.text[index+1],box=panels[boxIndex];
  assert.equal(label[5],'left','readout label remains left-aligned');
  assert.ok(label[2]<box[1],'readout label sits OUTSIDE the box');
  assert.equal(number[5],'center','terminal number centered inside its box');
  assert.equal(number[7],'terminal','retain approved terminal font');
  assert.ok(Math.abs(number[1]-(box[0]+box[2]/2))<.00001);
 }
 assert.ok(Math.abs(r.nextPanel.y-r.previewLabelSpace-r.boardY)<.01);
 assert.ok(Math.abs(r.holdPanel.y+r.holdPanel.h-r.boardY-r.boardH)<.01);
 assert.ok(Math.abs(r.statsPanel.y+r.statsPanel.h/2-r.boardY-r.boardH/2)<.01);
 assert.ok(r.statsPanel.h<=150.01,'three readouts remain compact');
 assert.equal(painted.rects.length,0,'no separator lines or bevel details');
 assert.ok(panels.slice(1,4).every(p=>p[5]==='#080808'&&p[6]==='#777'),
  'flat, dark recessed readouts retain the approved palette');
 for(const piece of painted.pieces){
  assert.ok(piece[3]>0&&piece[4]>0);
  assert.ok(piece[3]<=r.nextPanel.w-10+.001);
  assert.ok(piece[4]<=r.nextPanel.h-10+.001);
  assert.ok(Math.abs(piece[6]-((r.boardW-4)/10)*.75)<1e-8,
   'preview targets exactly 75% game tile size');
 }
});
test('all seven tetrominoes fit without distortion in NEXT and HOLD',()=>{
 const shapes=[
  [[1,1,1,1]],[[1,1],[1,1]],
  [[0,1,0],[1,1,1]],[[1,0],[1,0],[1,1]],
  [[0,1],[0,1],[1,1]],[[1,1,0],[0,1,1]],[[0,1,1],[1,1,0]]
 ];
 for(const role of ['next','hold']){
  for(const frame of [
   {x:10,y:20,w:80,h:80},{x:3,y:8,w:36,h:36},
   {x:20,y:30,w:120,h:48},{x:10,y:0,w:38,h:95}
  ]){
   for(const shape of shapes){
    const cells=fitPreviewCells(shape,frame.x,frame.y,frame.w,frame.h,role);
    assert.equal(cells.length,4,'each tetromino has four square cells');
    for(const tile of cells){
     assert.ok(tile.size>0);
     assert.ok(tile.x>=frame.x-.001&&tile.y>=frame.y-.001);
     assert.ok(tile.x+tile.size<=frame.x+frame.w+.001);
     assert.ok(tile.y+tile.size<=frame.y+frame.h+.001);
    }
   }
  }
 }
});
test('all seven tetrominoes use exactly 75% of game tile on normal panels',()=>{
 const shapes=[
  [[1,1,1,1]],[[1,1],[1,1]],
  [[0,1,0],[1,1,1]],[[1,0],[1,0],[1,1]],
  [[0,1],[0,1],[1,1]],[[1,1,0],[0,1,1]],[[0,1,1],[1,1,0]]
 ];
 const r=computeLayout(393,852,{top:59,bottom:34},ui);
 for(const role of ['next','hold']){
  const frame=role==='next'?r.nextPanel:r.holdPanel;
  const inset=5,inner=frame.w-2*inset;
  for(const shape of shapes){
   const cells=fitPreviewCells(shape,frame.x+inset,frame.y+inset,
    inner,frame.h-2*inset,role,r.previewCell);
   assert.equal(cells.length,4);
   for(const tile of cells){
    assert.ok(Math.abs(tile.size-r.previewCell)<.000001,
     'each block is 0.75 × board tile size');
    assert.ok(tile.x>=frame.x+inset-.001&&tile.y>=frame.y+inset-.001);
    assert.ok(tile.x+tile.size<=frame.x+frame.w-inset+.001);
    assert.ok(tile.y+tile.size<=frame.y+frame.h-inset+.001);
   }
  }
 }
});
test('approved 6 game controls retain button arrangement and positions',()=>{
 const r=computeLayout(393,852,{top:59,bottom:34},ui);
 const {hud,painted}=makeHUD();
 hud.drawControls(r);
 assert.equal(painted.panels.length,1,'enclosing controls container is visible');
 assert.deepEqual(painted.keys.map(k=>k[0]),['◀','DROP','▶','↻','HOLD','PAUSE']);
 assert.deepEqual(painted.keys.map(k=>k[5]),['left','soft','right','cw','hold','pause']);
 assert.deepEqual(painted.keys.map(k=>k[2]),[677,677,677,677,736,736]);
 assert.deepEqual(painted.text,[],'level score lines no longer drawn above game buttons');
});
test('the existing fonts, game-board renderer and footer wording are retained',()=>{
 const source=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 assert.match(source,/text\('NOMAD'/);
 assert.match(source,/text\('TETRIS SYSTEM'/);
 assert.match(source,/Program: Three\.JS/);
 assert.match(source,/version: '\+THREE_BUILD_VERSION/);
 assert.match(source,/ruleStart,r\.footerY-\.5/);
 assert.match(source,/function stage\(r,drawPieces=true,recordRegion=true\)/);
 assert.match(source,/const FONT='"Roboto Condensed"/);
 assert.match(source,/const TERMINAL_FONT='"Share Tech Mono"/);
});
test('official logo is an editable, rounded-cap SVG bundled locally',()=>{
 const svg=fs.readFileSync(new URL('../nomad-mark.svg',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../three-v027.html',import.meta.url),'utf8');
 const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(svg,/<svg [^>]*viewBox="0 0 160 64"/);
 assert.match(svg,/stroke-linecap="round"/);
 assert.match(svg,/<circle cx="80" cy="32" r="24"/);
 assert.equal((svg.match(/ M\d+/g)||[]).length,5);
 assert.match(svg,/M18 18 H56 M104 18 H142 M8 32 H51 M109 32 H152 M18 46 H56 M104 46 H142/);
 assert.ok(56-18<51-8&&142-104<152-109,'middle strokes are longest');
 assert.match(sw,/\.\/nomad-mark\.svg/);
 assert.match(html,/family=Roboto\+Condensed/);
});

test('recessed SCORE LEVEL LINES modules keep equal widths across viewports',()=>{
 for(const [w,h,safe] of [
  [393,852,{top:59,bottom:34}],[430,932,{top:62,bottom:34}],
  [375,812,{top:50,bottom:34}],[320,568,{top:20}],
  [280,600,{top:20,bottom:20}],[844,390,{left:59,right:59,bottom:21}],
  [667,375,{left:44,right:44}],[568,320,{left:44,right:44}]
 ]){
  const r=computeLayout(w,h,safe,ui),{hud,painted}=makeHUD();
  hud.drawSidebar(r);
  assert.equal(painted.panels.length,5);
  const boxes=painted.panels;
  assert.ok(boxes.every(box=>Math.abs(box[2]-r.nextPanel.w)<1e-7),
   'NEXT/HOLD and all score modules keep identical widths');
  assert.ok(boxes.every(box=>Math.abs(box[0]+box[2]-r.nextPanel.x-r.nextPanel.w)<1e-7),
   'all readouts align with the same sidebar right edge');
  assert.ok(boxes.slice(1,4).every(box=>box[4]===0&&box[3]>0),
   'flat score frames have no bevel');
  for(let i=1;i<4;i++){
   const p=painted.text[2*i-1],value=painted.text[2*i];
   assert.ok(p[2]<boxes[i][1],'label above its numbered panel');
   assert.ok(Math.abs(value[1]-(boxes[i][0]+boxes[i][2]/2))<1e-7,
    'number remains centered in its readout');
  }
 }
});

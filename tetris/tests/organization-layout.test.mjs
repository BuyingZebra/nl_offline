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
test('right column is NEXT / SCORE LEVEL LINES / HOLD, without BEST or PIECES',()=>{
 const r=computeLayout(393,852,{top:59,bottom:34},ui);
 const {hud,painted}=makeHUD();
 hud.drawSidebar(r);
 assert.deepEqual(painted.text.map(t=>t[0]),
  ['NEXT','SCORE','000684','LEVEL','03','LINES','12','HOLD']);
 assert.deepEqual(painted.pieces.map(p=>[p[0],p[5]]),[['T','next'],['S','hold']]);
 assert.equal(painted.panels.length,5,'outer and nested preview containers plus stats');
 assert.deepEqual(painted.panels.map(x=>x[4]),[0,0,0,0,0],'no beveled corners');
 assert.equal(painted.panels[1][5], '#080808','NEXT interior stays near-black');
 assert.equal(painted.panels[4][5], '#080808','HOLD interior stays near-black');
 for(const [outerIdx,innerIdx] of [[0,1],[3,4]]){
  const [ox,oy,ow,oh]=painted.panels[outerIdx];
  const [ix,iy,iw,ih]=painted.panels[innerIdx];
  assert.ok(Math.abs(iw-ih)<.00001,'nested preview frame is square');
  assert.ok(Math.abs(ow-oh)>.01,'outer labeled panel remains rectangular');
  assert.ok(ix>=ox&&ix+iw<=ox+ow+.001,'frame fits parent width');
  assert.ok(iy>=oy&&iy+ih<=oy+oh+.001,'frame fits parent height');
 }
 for(const piece of painted.pieces){
  assert.ok(Math.abs(piece[3]-piece[4])<.00001,'preview area is square');
 }
 assert.equal(painted.panels[0][3],painted.panels[3][3],
  'NEXT and HOLD parent heights match exactly');
 assert.equal(painted.panels[1][2],painted.panels[4][2],
  'NEXT and HOLD inner square widths match exactly');
 assert.equal(painted.panels[1][3],painted.panels[4][3],
  'NEXT and HOLD inner square heights match exactly');
 assert.ok(Math.abs(painted.panels[1][1]-painted.panels[0][1]
  -(painted.panels[4][1]-painted.panels[3][1]))<.001,
  'same top padding inside preview parents');
 assert.ok(Math.abs(painted.panels[0][1]+painted.panels[0][3]
  -(painted.panels[1][1]+painted.panels[1][3])
  -(painted.panels[3][1]+painted.panels[3][3]
  -(painted.panels[4][1]+painted.panels[4][3])))<.001,
  'same bottom padding inside preview parents');
 assert.ok(Math.abs(r.nextPanel.y-r.boardY)<.01,
  'NEXT outer panel top matches game board');
 assert.ok(Math.abs(r.holdPanel.y+r.holdPanel.h-r.boardY-r.boardH)<.01,
  'HOLD outer panel bottom matches game board');
 assert.ok(Math.abs(r.statsPanel.y+r.statsPanel.h/2-r.boardY-r.boardH/2)<.01,
  'statistics centered between anchors');
 assert.ok(r.statsPanel.h<=132.01,'no oversized score container');
 assert.equal(painted.rects.length,2,'separators between three compact data rows');
 assert.ok(painted.rects.every(line=>line[4]==='#777'),
  'score dividers use the exact border brightness');
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

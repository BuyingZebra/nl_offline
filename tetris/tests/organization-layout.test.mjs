/* V109: reference concept #1 organization, with existing game buttons intact. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createHudDrawing} from '../hud-drawing.js';
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
 assert.equal(painted.rects.length,2,'quiet separators between three data rows');
});
test('approved 6 game controls retain button arrangement and positions',()=>{
 const r=computeLayout(393,852,{top:59,bottom:34},ui);
 const {hud,painted}=makeHUD();
 hud.drawControls(r);
 assert.deepEqual(painted.keys.map(k=>k[0]),['◀','DROP','▶','↻','HOLD','PAUSE']);
 assert.deepEqual(painted.keys.map(k=>k[5]),['left','hard','right','cw','hold','pause']);
 assert.deepEqual(painted.keys.map(k=>k[2]),[677,677,677,677,736,736]);
 assert.deepEqual(painted.text,[],'level score lines no longer drawn above game buttons');
});
test('the existing fonts, game-board renderer and footer wording are retained',()=>{
 const source=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 assert.match(source,/text\('NOMAD'/);
 assert.match(source,/text\('Tetris System'/);
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
 assert.match(sw,/\.\/nomad-mark\.svg/);
 assert.match(html,/family=Roboto\+Condensed/);
});

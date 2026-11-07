/* NOMAD V129 — square pixel/vector brick texture and non-overlapping rails. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {renderBrickSVG,brickShapes,brickRailGeometry,createBrickFrame,BRICK_UNIT}
 from '../assets/frames/brick-pattern.mjs';

const require=createRequire(import.meta.url);
const {computeLayout}=require('../layout.js');
const ui={
 unit:6,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,
 padX:11,stackGap:6,side:93,sideGap:6,headHeight:80,headIcons:46,
 headIconGap:6,headRightPad:6,headTitleInset:17,deckBottom:30,
 deckPad:6,scoreHeight:45,deckGap:6,padGap:6,padHeight:53,
 extrasHeight:44,extrasGap:6,holdHeight:88,nextHeight:162,statsHeight:92
};
const imagePath=style=>fileURLToPath(
 new URL('../assets/frames/'+style+'/brick.svg',import.meta.url));
const sample=computeLayout(393,852,{top:59,bottom:34},ui);
const near=(a,b)=>Math.abs(a-b)<1e-7;

test('pixel and vector assets share one SQUARE cell-size texture, not two cells',()=>{
 assert.deepEqual(BRICK_UNIT,{width:12,height:12,courses:2});
 for(const style of ['pixel','vector']){
  const svg=renderBrickSVG(style);
  assert.equal(fs.readFileSync(imagePath(style),'utf8'),svg);
  assert.match(svg,/viewBox="0 0 12 12"/);
  assert.match(svg,/width="12" height="12"/);
  assert.match(svg,new RegExp('data-style="'+style+'"'));
  assert.equal((svg.match(/<rect /g)||[]).length,15);
  assert.doesNotMatch(svg,/<image|<filter|<path| rx=| ry=|<linearGradient|<radialGradient/);
  for(const m of svg.matchAll(/fill="rgb\((\d+),(\d+),(\d+)\)"/g)){
   assert.equal(m[1],m[2]);assert.equal(m[2],m[3]);
  }
 }
 assert.match(renderBrickSVG('pixel'),/shape-rendering="crispEdges"/);
 assert.match(renderBrickSVG('vector'),/shape-rendering="geometricPrecision"/);
 assert.throws(()=>renderBrickSVG('marble'),RangeError);
});
test('both half-height brick courses fit inside ONE game-cell tile',()=>{
 for(const style of ['pixel','vector']){
  const faces=brickShapes(style).filter((_,i)=>i%5===0);
  assert.deepEqual(faces.map(s=>s.x),[1,-4,6]);
  assert.deepEqual(faces.map(s=>s.y),[1,7,7]);
  assert.ok(faces.every(s=>s.h===4));
  assert.ok(brickShapes(style).every(s=>s.y>=1&&s.y+s.h<=11));
 }
 assert.equal(BRICK_UNIT.height/BRICK_UNIT.courses,6);
});
test('pixel bevels stay on integer coordinates and vector bevels are subpixel',()=>{
 const p=brickShapes('pixel'),v=brickShapes('vector');
 assert.equal(p.length,v.length);
 assert.ok(p.every(s=>[s.x,s.y,s.w,s.h].every(Number.isInteger)));
 assert.ok(v.some(s=>![s.x,s.y,s.w,s.h].every(Number.isInteger)));
 for(let i=0;i<p.length;i+=5)
  assert.deepEqual([p[i].x,p[i].y,p[i].w,p[i].h],
   [v[i].x,v[i].y,v[i].w,v[i].h]);
});
test('iPhone portrait retains the 5% smaller square-cell playfield and buttons',()=>{
 const r=sample,g=brickRailGeometry(r);
 const tile=(r.boardW-4)/10;
 assert.ok(near(r.boardX,35.6125));
 assert.ok(near(r.boardY,182.225));
 assert.ok(near(r.boardW,234.5*.95));
 assert.ok(near(r.boardH,469*.95));
 assert.ok(near(r.dx,11),'controls remain at original x');
 assert.ok(near(r.sideX,281.265),'sidebar stays aligned outside reduced board');
 assert.ok(near(g.width,tile)&&near(g.height,tile));
 assert.ok(near(g.leftVisible.w,tile));
 assert.ok(near(g.rightVisible.w,tile));
 assert.ok(g.left.x+g.left.w<r.boardX);
 assert.ok(g.right.x>r.boardX+r.boardW);
 assert.ok(g.right.x+g.right.w<r.sideX);
 assert.ok(g.left.x>=r.off+Math.max(3,r.pad-6)+1);
 assert.ok(near(g.left.y,r.boardY+2));
 assert.ok(near(g.left.h,20*tile));
});
test('all viewport sizes clip rails to padding, never into playfield or sidebar',()=>{
 for(const [W,H,safe] of [
  [393,852,{top:59,bottom:34}],
  [393,900,{top:59,bottom:34}],
  [375,812,{top:50,bottom:34}],
  [430,932,{top:62,bottom:34}],
  [768,1024,{top:20,bottom:20}],
  [844,390,{top:0,bottom:0}]
 ]){
  const r=computeLayout(W,H,safe,ui),before={...r};
  const g=brickRailGeometry(r);
  assert.ok(g);
  assert.ok(near(g.width,(r.boardW-4)/10));
  assert.ok(near(g.width,g.height),'pattern repeats once per game cell');
  assert.ok(g.left.x+g.width<=r.boardX);
  assert.ok(g.right.x>=r.boardX+r.boardW);
  assert.ok(g.rightVisible.x+g.rightVisible.w<=r.sideX);
  assert.ok(g.leftVisible.x>=r.off+Math.max(3,r.pad-6)+1-1e-7);
  assert.ok(g.rightVisible.w<=g.width&&g.leftVisible.w<=g.width);
  assert.deepEqual(r,before);
  assert.ok(r.sideX+r.sideW<=r.sx+r.sw+1e-7);
  assert.ok(r.nextPanel.x===r.sideX&&r.holdPanel.x===r.sideX&&r.statsPanel.x===r.sideX);
 }
 assert.equal(brickRailGeometry({...sample,boardW:0}),null);
});
test('a complete brick stamp caches at one cell square and uses stable row pitch',()=>{
 const stamps=[],draws=[],clips=[];
 const f=createBrickFrame({
  pixelRatio:()=>2,
  createCanvas:()=>{
   const context={fillStyle:'',fillRect(){}};
   const canvas={width:0,height:0,getContext:()=>context};
   stamps.push(canvas);return canvas;
  }
 });
 const ctx={
  save(){},restore(){},beginPath(){},rect(...v){clips.push(v);},
  clip(){},drawImage(...v){draws.push(v);}
 };
 f.draw(ctx,sample);
 assert.equal(stamps.length,1);
 assert.equal(stamps[0].height,stamps[0].width);
 assert.equal(f.cachedStamps,1);
 assert.equal(clips.length,2,'left and right rails have their own outside-grid clips');
 assert.equal(draws.length,40,'exactly 20 square texture tiles per side');
 const pitch=brickRailGeometry(sample).height;
 for(const draw of draws){
  assert.ok(near(draw[3],pitch),'rendered tile is square');
  assert.ok(near(draw[4],pitch));
 }
 f.draw(ctx,sample);
 assert.equal(f.cachedStamps,1,'no repeated rasterization');
 f.draw(ctx,sample,'pixel');
 assert.equal(f.cachedStamps,2,'pixel and vector masters use independent caches');
 f.dispose();assert.equal(f.cachedStamps,0);
});
test('rails render on the static base only; board always owns all playable cells',()=>{
 const source=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 const stage=source.slice(source.indexOf('function stage('),source.indexOf('function paintBoardPopup('));
 assert.doesNotMatch(stage,/brickFrame\.draw/);
 assert.equal((source.match(/brickFrame\.draw\(g,r\)/g)||[]).length,1);
 const base=source.slice(source.indexOf('function paintBaseGame()'),source.indexOf('function paintGame()'));
 assert.match(base,/stage\(r,false,true\);[\s\S]*brickFrame\.draw\(g,r\);/);
 assert.match(stage,/tile=\(w-4\)\/10/,'authoritative tetromino tile size stays untouched');
});

/* NOMAD V136 — textured squares, full-tile rows between both board borders. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {
 BRICK_UNIT,brickShapes,renderBrickSVG,brickRailGeometry,createBrickFrame
} from '../assets/frames/brick-pattern.mjs';
const require=createRequire(import.meta.url);
const {computeLayout}=require('../layout.js');
const ui={
 unit:6,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,
 padX:11,stackGap:6,side:93,sideGap:6,headHeight:80,headIcons:46,
 headIconGap:6,headRightPad:6,headTitleInset:17,deckBottom:30,
 deckPad:6,scoreHeight:45,deckGap:6,padGap:6,padHeight:53,
 extrasHeight:44,extrasGap:6,holdHeight:88,nextHeight:162,statsHeight:92
};
const near=(a,b)=>Math.abs(a-b)<1e-7;
const imagePath=style=>fileURLToPath(
 new URL('../assets/frames/'+style+'/brick.svg',import.meta.url));
const get=(w,h,safe={})=>computeLayout(w,h,safe,ui);

test('pixel and vector SVGs share a single aligned square tile with no stagger',()=>{
 assert.deepEqual(BRICK_UNIT,{width:12,height:12,courses:1});
 for(const style of ['pixel','vector']){
  const svg=renderBrickSVG(style);
  assert.equal(svg,fs.readFileSync(imagePath(style),'utf8'));
  assert.match(svg,/viewBox="0 0 12 12"/);
  assert.match(svg,/width="12" height="12"/);
  assert.match(svg,new RegExp('data-style="'+style+'"'));
  assert.equal((svg.match(/<rect /g)||[]).length,16);
  assert.doesNotMatch(svg,/<image|<filter|<linearGradient|<radialGradient/);
  for(const match of svg.matchAll(/rgb\((\d+),(\d+),(\d+)\)/g)){
   assert.equal(match[1],match[2]);assert.equal(match[2],match[3]);
  }
  const faces=brickShapes(style);
  assert.deepEqual([faces[0].x,faces[0].y,faces[0].w,faces[0].h],[1,1,10,10],
   'one full inset square per repeat, no staggered joints');
  assert.deepEqual([faces[6].x,faces[6].y,faces[6].w,faces[6].h],[3,3,6,6],
   'distinct recessed textured square face');
  assert.ok(new Set(faces.map(x=>x.shade)).size>=12,
   'multiple bevel and chisel luminance levels, not a flat solid bar');
  assert.ok(faces.every(x=>x.x>=1&&x.y>=1&&x.x+x.w<=11&&x.y+x.h<=11),
   'bevel and chisel marks remain inside a square tile');
 }
 assert.throws(()=>renderBrickSVG('invalid'),RangeError);
});
test('iPhone portrait rails repeat at 75% preview size and have exact 6px gap',()=>{
 const r=get(393,852,{top:59,bottom:34});
 const g=brickRailGeometry(r);
 assert.ok(g);
 assert.ok(near(r.boardW,234.5),'V133 board width stays unchanged');
 assert.ok(near(r.boardX,34.2875),'playfield shifts slightly to align outer rail with header');
 assert.ok(near(r.boardX-g.width-g.gap,r.hx),'outer left brick edge aligns with header');
 assert.ok(near(r.boardX-g.width-g.gap,r.off+r.pad),'and footer left edge');
 assert.ok(near(g.width,(r.boardW-4)/10*.75));
 assert.ok(near(g.width,r.previewCell));
 assert.ok(near(g.height,g.width),'whole brick motif is square');
 assert.ok(near(g.gap,ui.padGap));
 assert.ok(near(g.left.x+g.left.w+ui.padGap,r.boardX));
 assert.ok(near(g.right.x,r.boardX+r.boardW+ui.padGap));
 assert.ok(near(g.leftVisible.w,g.width),'full left rail fits iPhone');
 assert.ok(near(g.rightVisible.w,g.width),'full right rail fits iPhone');
 assert.ok(near(g.left.y,r.boardY)&&near(g.right.y,r.boardY),
  'both brick rails begin at the outer board border');
 assert.ok(near(g.left.y+g.left.h,r.boardY+r.boardH));
 assert.ok(near(g.right.y+g.right.h,r.boardY+r.boardH));
});
test('all viewport sizes clip to available space, never over the board or sidebar',()=>{
 for(const [W,H,safe] of [
  [393,852,{top:59,bottom:34}],[430,932,{top:62,bottom:34}],
  [375,812,{top:50,bottom:34}],[320,568,{top:20}],
  [360,480,{top:20}],[280,600,{top:20,bottom:20}],
  [844,390,{left:59,right:59,bottom:21}],
  [667,375,{left:44,right:44}],[568,320,{left:44,right:44}],
  [915,412,{}]
 ]){
  const r=get(W,H,safe),before={...r},g=brickRailGeometry(r);
  assert.ok(g);
  assert.ok(near(g.width,r.previewCell));
  assert.ok(near(g.gap,ui.padGap));
  assert.ok(g.left.x+g.width<=r.boardX-ui.padGap+1e-7);
  assert.ok(g.right.x>=r.boardX+r.boardW+ui.padGap-1e-7);
  assert.ok(g.leftVisible.x>=Math.max(r.safe.left,r.off)-1e-7);
  assert.ok(g.leftVisible.w>=0&&g.leftVisible.w<=g.width+1e-7);
  assert.ok(g.rightVisible.w>=0&&g.rightVisible.w<=g.width+1e-7);
  assert.ok(g.rightVisible.x+g.rightVisible.w<=r.nextPanel.x-2+1e-7);
  assert.ok(near(g.left.y,r.boardY)&&near(g.left.y+g.left.h,r.boardY+r.boardH));
  assert.ok(near(g.right.y,r.boardY)&&near(g.right.y+g.right.h,r.boardY+r.boardH));
  if(!r.landscape){
   assert.ok(near(g.left.x,r.hx),'portrait frame aligns left with header/footer');
   assert.ok(near(g.leftVisible.w,g.width),'full left rail on portrait');
   assert.ok(near(g.rightVisible.w,g.width),'full right rail on portrait');
  }
  assert.deepEqual(r,before,'brick drawing never mutates the layout');
 }
 assert.equal(brickRailGeometry({...get(393,852),boardW:0}),null);
});
test('raster stamp stays square, static rails cover full height and reuse cache',()=>{
 const r=get(393,852,{top:59,bottom:34});
 const stamps=[],clips=[],draws=[];
 const frame=createBrickFrame({
  pixelRatio:()=>2,
  createCanvas:()=>{
   const canvas={width:0,height:0,getContext:()=>({fillStyle:'',fillRect(){}})};
   stamps.push(canvas);return canvas;
  }
 });
 const ctx={save(){},restore(){},beginPath(){},
  rect(...v){clips.push(v);},clip(){},drawImage(...v){draws.push(v);}};
 frame.draw(ctx,r);
 const g=brickRailGeometry(r);
 const repeats=Math.max(1,Math.round(g.left.h/g.height));
 assert.equal(stamps.length,1);
 assert.equal(stamps[0].width,stamps[0].height);
 assert.equal(clips.length,2,'one clip per board-side rail');
 assert.equal(draws.length,repeats*2,'no clipped/extra tile at the rail bottom');
 assert.ok(repeats>20,'smaller bricks do not stop at twenty repeats');
 for(const [image,x,y,w,h] of draws){
  assert.ok(near(w,g.width)&&near(h,g.height),
   'each drawn brick stays exactly square at 75% of a game block');
 }
 for(const side of [0,1]){
  const series=draws.slice(side*repeats,(side+1)*repeats);
  assert.ok(near(series[0][2],r.boardY),'first complete tile starts at board top');
  assert.ok(near(series.at(-1)[2]+series.at(-1)[4],r.boardY+r.boardH),
   'last complete tile ends flush with board bottom');
  const pitch=(r.boardH-g.height)/(repeats-1);
  for(let i=1;i<series.length;i++)
   assert.ok(near(series[i][2]-series[i-1][2],pitch),
    'even spacing across the board without a truncated last block');
 }
 frame.draw(ctx,r);
 assert.equal(frame.cachedStamps,1,'no redundant rasterization');
 frame.draw(ctx,r,'pixel');
 assert.equal(frame.cachedStamps,2,'pixel and vector stamps independent');
 frame.dispose();assert.equal(frame.cachedStamps,0);
});
test('bricks are painted on the static base, never on the playfield texture',()=>{
 const renderer=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 const stage=renderer.slice(renderer.indexOf('function stage('),
  renderer.indexOf('function paintBoardPopup('));
 assert.doesNotMatch(stage,/brickFrame\.draw/);
 assert.equal((renderer.match(/brickFrame\.draw\(g,r\)/g)||[]).length,1);
 assert.match(renderer,/stage\(r,false,true\);[\s\S]*brickFrame\.draw\(g,r\);/);
 assert.match(renderer,/const offX=x\+2,offY=y\+2,tile=\(w-4\)\/10/);
 const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 for(const item of [
  './assets/frames/brick-pattern.mjs',
  './assets/frames/pixel/brick.svg',
  './assets/frames/vector/brick.svg'
 ])assert.ok(sw.includes(item),'offline asset: '+item);
});

test('all tested viewport rails have complete undistorted first and last tiles',()=>{
 for(const [W,H,safe] of [
  [393,852,{top:59,bottom:34}],[430,932,{top:62,bottom:34}],
  [375,812,{top:50,bottom:34}],[320,568,{top:20}],
  [280,600,{top:20,bottom:20}],[844,390,{left:59,right:59,bottom:21}]
 ]){
  const r=get(W,H,safe),geom=brickRailGeometry(r);
  const drawCalls=[];
  const frame=createBrickFrame({
   pixelRatio:()=>2,
   createCanvas:()=>({width:0,height:0,getContext:()=>({fillRect(){}})})
  });
  frame.draw({
   save(){},restore(){},beginPath(){},rect(){},clip(){},
   drawImage(...args){drawCalls.push(args);}
  },r);
  const n=Math.max(1,Math.round(r.boardH/geom.height));
  // Some constrained landscape viewports intentionally clip one rail entirely.
  const visibleRails=[geom.leftVisible,geom.rightVisible].filter(g=>g.w>0);
  assert.equal(drawCalls.length,n*visibleRails.length);
  for(let i=0;i<visibleRails.length;i++){
   const tiles=drawCalls.slice(i*n,(i+1)*n);
   assert.ok(near(tiles[0][2],r.boardY));
   assert.ok(near(tiles.at(-1)[2]+tiles.at(-1)[4],r.boardY+r.boardH));
   assert.ok(tiles.every(t=>near(t[3],geom.width)&&near(t[4],geom.height)));
  }
  frame.dispose();
 }
});

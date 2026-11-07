/* NOMAD V128 — authored pixel/vector running-bond brick frame tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderBrickSVG,brickShapes,brickRailGeometry,createBrickFrame,BRICK_UNIT}
 from '../assets/frames/brick-pattern.mjs';

const imagePath=style=>fileURLToPath(
 new URL('../assets/frames/'+style+'/brick.svg',import.meta.url));
const r={off:0,pad:11,boardX:29.5,boardY:152,boardW:234,boardH:468,sideX:269.5};

test('both editable grayscale brick masters are generated from one geometry system',()=>{
 assert.deepEqual(BRICK_UNIT,{width:12,height:24,courses:2});
 for(const style of ['pixel','vector']){
  const svg=renderBrickSVG(style);
  assert.equal(fs.readFileSync(imagePath(style),'utf8'),svg);
  assert.match(svg,/viewBox="0 0 12 24"/);
  assert.match(svg,new RegExp('data-style="'+style+'"'));
  assert.equal((svg.match(/<rect /g)||[]).length,15);
  assert.doesNotMatch(svg,/<image|<filter|<path| rx=| ry=|<linearGradient|<radialGradient/);
  for(const m of svg.matchAll(/fill="rgb\((\d+),(\d+),(\d+)\)"/g)){
   assert.equal(m[1],m[2]);assert.equal(m[2],m[3]);
  }
  assert.ok(!svg.includes('random'));
 }
 assert.match(renderBrickSVG('pixel'),/shape-rendering="crispEdges"/);
 assert.match(renderBrickSVG('vector'),/shape-rendering="geometricPrecision"/);
 assert.throws(()=>renderBrickSVG('marble'),RangeError);
});
test('each 12x12 game cell has one brick course and alternating staggered joints',()=>{
 for(const style of ['pixel','vector']){
  const faces=brickShapes(style).filter((_,i)=>i%5===0);
  assert.deepEqual(faces.map(s=>s.x),[1,-4,6]);
  assert.deepEqual(faces.map(s=>s.y),[1,13,13]);
  assert.ok(faces.every(s=>s.h===10));
  assert.ok(brickShapes(style).every(s=>s.y>=1&&s.y+s.h<=23));
 }
});
test('pixel texture uses an integer grid while vector texture adds subpixel bevels',()=>{
 const p=brickShapes('pixel'),v=brickShapes('vector');
 assert.equal(p.length,v.length);
 assert.ok(p.every(s=>[s.x,s.y,s.w,s.h].every(Number.isInteger)));
 assert.ok(v.some(s=>![s.x,s.y,s.w,s.h].every(Number.isInteger)));
 for(let i=0;i<p.length;i+=5)
  assert.deepEqual([p[i].x,p[i].y,p[i].w,p[i].h],
   [v[i].x,v[i].y,v[i].w,v[i].h]);
});
test('brick rails stay within the existing board/sidebar bounds without resizing them',()=>{
 for(const layout of [
  r,
  {...r,boardX:11,boardW:225,boardH:450,sideX:242},
  {...r,boardX:11,boardW:150,boardH:300,sideX:161},
  {...r,boardX:64,boardW:110,boardH:220,sideX:181,off:0,pad:8}
 ]){
  const saved={...layout};
  const b=brickRailGeometry(layout);
  assert.ok(Math.abs(b.width-(layout.boardW-4)/10)<1e-10,
   'brick width must match tetromino tile width exactly');
  assert.ok(b.width>0);
  assert.ok(b.inside>=0&&b.outside>=0);
  assert.ok(Math.abs(b.width-b.inside-b.outside)<1e-8);
  assert.ok(Math.abs(b.left.x+b.outside-layout.boardX)<1e-8);
  assert.ok(Math.abs(b.right.x+b.inside-layout.boardX-layout.boardW)<1e-8);
  assert.ok(b.right.x+b.width<=layout.sideX+.00001);
  assert.ok(b.left.x>=layout.off+Math.max(3,layout.pad-6)+1.999);
  assert.deepEqual(layout,saved,'brick decoration never mutates layout');
 }
 assert.equal(brickRailGeometry({...r,boardW:0}),null);
 // Every one-cell course is rendered with the same pitch as the ten-column grid.
 const cell=(r.boardW-4)/10;
 assert.equal(brickRailGeometry(r).width*2,cell*2);
 assert.equal(BRICK_UNIT.height/BRICK_UNIT.courses,BRICK_UNIT.width);
});
test('pixel/vector stamps are cached; drawing preserves the canvas clip stack',()=>{
 const stamps=[],rects=[],images=[];
 const f=createBrickFrame({
  pixelRatio:()=>2,
  createCanvas:()=>{
   const context={fillStyle:'',fillRect(...v){rects.push(v);}};
   const canvas={width:0,height:0,getContext:()=>context};
   stamps.push(canvas);return canvas;
  }
 });
 const ctx={
  save(){},restore(){},beginPath(){},rect(...v){rects.push(['clip',...v]);},
  clip(){},drawImage(...v){images.push(v);}
 };
 f.draw(ctx,r,'outside');
 assert.equal(f.cachedStamps,1);
 assert.equal(stamps[0].height,stamps[0].width*2);
 const outsideDraws=images.length;
 assert.ok(outsideDraws>20);
 f.draw(ctx,r,'inside');
 assert.equal(f.cachedStamps,1,'both sides and both layers reuse the same stamp');
 assert.equal(images.length,outsideDraws*2,'inside and outside paint matching courses');
 f.draw(ctx,r,'inside','pixel');
 assert.equal(f.cachedStamps,2,'pixel and vector variants remain independent');
 assert.throws(()=>f.draw(ctx,r,'above'),RangeError);
 f.dispose();assert.equal(f.cachedStamps,0);
});

test('the larger border renders behind tetrominoes instead of covering playable cells',()=>{
 const source=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 const position=source.indexOf("brickFrame.draw(g,r,'inside')");
 assert.ok(position>0);
 assert.ok(position<source.indexOf('if(drawPieces){'),
  'the frame must be behind blocks touching either side of the grid');
 assert.equal((source.match(/brickFrame.draw\(g,r,'inside'\)/g)||[]).length,1);
 assert.match(source,/tile=\(w-4\)\/10/,'the game keeps the authoritative tile size');
});

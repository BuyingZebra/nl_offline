import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {drawTileFace,drawIBar,PIECE_PATTERNS} from '../tile-face.js';
import {
 renderSmoothTileSVG,renderIFragmentSVG,renderIStateSVG,IFragmentRuns,
 originalIDotCenters,originalJDotCenters
} from '../assets/tiles/smooth-geometry.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../assets/tiles');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
function signature(m){
 let v=2166136261>>>0;
 for(const c of m.flat()){
  const n=c+1;v=Math.imul(v^(n&255),16777619)>>>0;
  v=Math.imul(v^((n>>>8)&255),16777619)>>>0;
 }
 return v.toString(16).padStart(8,'0');
}
function actualTiles(kind){
 const width=kind==='I'?48:12,height=12;
 const grid=Array.from({length:height},()=>Array(width).fill(-1));
 const canvas={
  fillStyle:'',fillRect(x,y,w,h){
   const match=/^rgb\((\d+),(\d+),(\d+)\)$/.exec(this.fillStyle);
   assert.ok(match);assert.equal(match[1],match[2]);assert.equal(match[2],match[3]);
   for(let ry=0;ry<height;ry++)for(let rx=0;rx<width;rx++)
    if(rx+.5>=x&&rx+.5<x+w&&ry+.5>=y&&ry+.5<y+h)
     grid[ry][rx]=Number(match[1]);
  }
 };
 if(kind==='I')drawIBar(canvas,0,0,width,height);
 else drawTileFace(canvas,0,0,width,height,kind);
 return grid;
}
function pixelSVGData(svg,w,h){
 const grid=Array.from({length:h},()=>Array(w).fill(-1));
 const rx=/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="rgb\((\d+),(\d+),(\d+)\)"\/>/g;
 let count=0;
 for(const match of svg.matchAll(rx)){
  const [x,y,width,height,r,g,b]=match.slice(1).map(Number);
  assert.equal(r,g);assert.equal(g,b);
  for(let yy=y;yy<y+height;yy++)for(let xx=x;xx<x+width;xx++)grid[yy][xx]=r;
  count++;
 }
 assert.ok(count>0,'pixel SVG has real shapes');
 return grid;
}
test('seven pixel masters and seven smooth SVGs exist independently',()=>{
 assert.deepEqual(manifest.order,['I','O','T','S','Z','J','L']);
 assert.deepEqual(PIECE_PATTERNS,{
  I:'continuous-gravel',J:'dotted-field',L:'recessed-square',
  O:'corner-highlight',S:'small-center',T:'solid-fill',Z:'centered-square'
 });
 assert.equal(manifest.vectorGenerator,'smooth-geometry.mjs');
 assert.equal(manifest.version,'2.0');
 for(const kind of manifest.order)for(const style of ['pixel','vector']){
  const f=path.join(root,manifest.pieces[kind][style]);
  assert.ok(fs.existsSync(f),kind+' '+style);
  const xml=fs.readFileSync(f,'utf8');
  assert.match(xml,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(xml.endsWith('</svg>\n'));
  assert.ok(xml.includes('data-kind="'+kind+'"'));
  assert.ok(xml.includes('data-style="'+style+'"'));
  assert.ok(!xml.includes('<image'),'no hidden raster images');
 }
});
test('approved pixel masters are bit-for-bit faithful to the V118 renderer',()=>{
 for(const kind of manifest.order){
  const expected=actualTiles(kind),w=expected[0].length,h=expected.length;
  const svg=fs.readFileSync(path.join(root,manifest.pieces[kind].pixel),'utf8');
  assert.deepEqual(pixelSVGData(svg,w,h),expected,'master drift: '+kind);
  assert.equal(signature(expected),manifest.pieces[kind].sourceSignature);
  assert.ok(svg.includes('data-signature="'+signature(expected)+'"'));
 }
});
test('smooth SVGs regenerate exactly from layered source, without micro-rounded paths',()=>{
 for(const kind of manifest.order){
  const vector=fs.readFileSync(path.join(root,manifest.pieces[kind].vector),'utf8');
  assert.equal(vector,renderSmoothTileSVG(kind),'generated source changed: '+kind);
  assert.ok(vector.includes('data-signature="'+manifest.pieces[kind].sourceSignature+'"'));
  assert.match(vector,/shape-rendering="geometricPrecision"/);
  assert.match(vector,/<rect /);
  assert.doesNotMatch(vector,/<path|<image|<filter| rx=| ry=|checker|stripe|diagonal/);
  const circles=(vector.match(/<circle /g)||[]).length;
  assert.equal(circles,kind==='I'?29:kind==='J'?8:0);
 }
});
test('O corner is a genuine straight-edged triangle and the art has no separated bevel strokes',()=>{
 const o=renderSmoothTileSVG('O');
 assert.match(o,/<polygon points="3,3 8,3 3,8" fill="rgb\(242,242,242\)"\/>/);
 assert.doesNotMatch(o,/<path|<line|stroke=|stroke-width|<circle/);
 const t=renderSmoothTileSVG('T');
 assert.equal((t.match(/<rect /g)||[]).length,1);
});
test('dot scatter is stable, bounded, and visually organic',()=>{
 const i=originalIDotCenters(),j=originalJDotCenters();
 assert.equal(i.length,29);assert.equal(j.length,8);
 assert.deepEqual(i,originalIDotCenters());assert.deepEqual(j,originalJDotCenters());
 assert.ok(i.every(p=>p.x>=2&&p.x<=46&&p.y>=2&&p.y<=10));
 assert.ok(j.every(p=>p.x>=2&&p.x<=10&&p.y>=2&&p.y<=10));
 assert.ok(i.some(p=>!Number.isInteger(p.x*2)),'jitter not aligned to pixel grid');
});
test('I original coordinates survive any contiguous fragment at any original offset',()=>{
 const original=originalIDotCenters();
 for(let offset=0;offset<4;offset++)for(let length=1;length<=4-offset;length++){
  const expected=original.filter(p=>
   p.x>=offset*12+1.45&&p.x<=offset*12+length*12-1.45);
  const out=renderIFragmentSVG({sourceOffset:offset,length});
  const centers=[...out.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="0.39"/g)]
   .map(m=>({x:Number((Number(m[1])+offset*12).toFixed(3)),y:Number(m[2])}));
  const roundedExpected=expected.map(p=>({x:Number(p.x.toFixed(3)),y:Number(p.y.toFixed(3))}));
  assert.deepEqual(centers,roundedExpected,'phase moved at '+offset+'+'+length);
  assert.match(out,new RegExp('viewBox="0 0 '+(12*length)+' 12"'));
  const vertical=renderIFragmentSVG({sourceOffset:offset,length,orientation:'vertical'});
  assert.match(vertical,new RegExp('viewBox="0 0 12 '+(12*length)+'"'));
  assert.match(vertical,/rotate\(90\)/);
 }
});
test('all sixteen I deletion masks are supported in either orientation',()=>{
 for(let mask=0;mask<16;mask++){
  const runs=IFragmentRuns(mask);
  assert.equal(runs.reduce((n,r)=>n+r.length,0),mask.toString(2).replace(/0/g,'').length);
  for(const orientation of ['horizontal','vertical']){
   const svg=renderIStateSVG(mask,orientation);
   assert.ok(svg.includes('data-source-mask="'+mask+'"'));
   assert.ok(svg.includes('data-orientation="'+orientation+'"'));
   assert.equal((svg.match(/<rect /g)||[]).length,runs.length*5);
  }
 }
 assert.throws(()=>IFragmentRuns(16),RangeError);
 assert.throws(()=>renderIFragmentSVG({sourceOffset:3,length:2}),RangeError);
});
test('the comparison page contains a functional original-cell masking control',()=>{
 const html=fs.readFileSync(path.join(root,'compare.html'),'utf8');
 assert.match(html,/import \{renderIStateSVG,IFragmentRuns\} from '\.\/smooth-geometry\.mjs'/);
 assert.match(html,/checks\.reduce\(\(n,ch,i\)=>n\|\(ch\.checked\?1<<i:0\),0\)/);
 assert.match(html,/const xml=renderIStateSVG\(mask,o\)/);
 assert.doesNotMatch(html,/core\.js|three-v027\.js|localStorage|serviceWorker/);
});

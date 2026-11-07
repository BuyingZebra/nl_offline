import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {drawTileFace,drawIBar,PIECE_PATTERNS} from '../tile-face.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../assets/tiles');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
function signature(m){
 let v=2166136261>>>0;
 for(const c of m.flat()){
  const n=c+1;
  v=Math.imul(v^(n&255),16777619)>>>0;
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
test('the asset library contains exactly fourteen independently usable SVGs',()=>{
 assert.deepEqual(manifest.order,['I','O','T','S','Z','J','L']);
 assert.equal(Object.keys(manifest.pieces).length,7);
 assert.deepEqual(PIECE_PATTERNS,{
  I:'continuous-gravel',J:'dotted-field',L:'recessed-square',
  O:'corner-highlight',S:'small-center',T:'solid-fill',Z:'centered-square'
 });
 for(const kind of manifest.order)for(const style of ['pixel','vector']){
  const file=path.join(root,manifest.pieces[kind][style]);
  assert.ok(fs.existsSync(file),kind+' '+style);
  const xml=fs.readFileSync(file,'utf8');
  assert.match(xml,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(xml.endsWith('</svg>\n'));
  assert.ok(xml.includes('data-kind="'+kind+'"'));
  assert.ok(xml.includes('data-style="'+style+'"'));
  assert.ok(!xml.includes('<image'),'assets must not embed a generated bitmap');
 }
});
test('all seven pixel masters are pixel-for-pixel identical to the V118 game renderer',()=>{
 for(const kind of manifest.order){
  const expected=actualTiles(kind),w=expected[0].length,h=expected.length;
  const svg=fs.readFileSync(path.join(root,manifest.pieces[kind].pixel),'utf8');
  assert.deepEqual(pixelSVGData(svg,w,h),expected,'V118 master drift: '+kind);
  assert.equal(signature(expected),manifest.pieces[kind].sourceSignature);
  assert.ok(svg.includes('data-signature="'+signature(expected)+'"'));
 }
});
test('vector drawings preserve the source signatures and introduce no new motifs',()=>{
 for(const kind of manifest.order){
  const vector=fs.readFileSync(path.join(root,manifest.pieces[kind].vector),'utf8');
  assert.ok(vector.includes('data-signature="'+manifest.pieces[kind].sourceSignature+'"'));
  assert.match(vector,/shape-rendering="geometricPrecision"/);
  assert.ok(vector.includes('<path '),'smooth geometry must be real paths');
  assert.equal((vector.match(/<circle /g)||[]).length,kind==='I'?29:kind==='J'?8:0,
   'only original gravel/dotted pixels become circles');
  assert.doesNotMatch(vector,/checker|stripe|diagonal|<image|<filter/);
 }
});
test('continuous I bars remain a single 4:1 illustration in both styles',()=>{
 for(const style of ['pixel','vector']){
  const xml=fs.readFileSync(path.join(root,manifest.pieces.I[style]),'utf8');
  assert.match(xml,/viewBox="0 0 48 12"/);
  assert.equal(manifest.pieces.I.grid[0],4);
  assert.equal(manifest.pieces.I.grid[1],1);
 }
});
test('visual comparison is independent of gameplay and lists both master sets',()=>{
 const html=fs.readFileSync(path.join(root,'compare.html'),'utf8');
 assert.match(html,/fetch\('\.\/manifest\.json'\)/);
 assert.match(html,/for\(const style of \['pixel','vector'\]\)/);
 assert.match(html,/kind==='I'/);
 assert.doesNotMatch(html,/core\.js|three-v027\.js|localStorage|serviceWorker/);
});

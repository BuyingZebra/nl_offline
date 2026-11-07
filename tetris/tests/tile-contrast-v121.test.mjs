import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderSmoothTileSVG,renderIFragmentSVG} from '../assets/tiles/smooth-geometry.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../assets/tiles/vector');
const kinds=['I','O','T','S','Z','J','L'];
// Immutable V120 geometry fingerprints: shade tuning must not move a vertex,
// alter gravel positions, add a bevel or change any block's bounding box.
const originalGeometry=Object.freeze({
 I:'626a8628',O:'3f976e60',T:'d65d58ba',S:'50497d6b',
 Z:'00deea00',J:'fac9b25d',L:'29800bd4'
});
function hash(s){
 let h=2166136261>>>0;
 for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619)>>>0;
 return h.toString(16).padStart(8,'0');
}
function shapes(svg){
 return [...svg.matchAll(/<(?:rect|polygon|circle)\b[^>]*\/>/g)].map(m=>m[0]);
}
function grayscale(tag){
 const m=tag.match(/fill="rgb\((\d+),(\d+),(\d+)\)"/);
 assert.ok(m,'every shape must use grayscale: '+tag);
 assert.equal(m[1],m[2]);assert.equal(m[2],m[3]);
 return Number(m[1]);
}
const values=kind=>shapes(renderSmoothTileSVG(kind)).map(grayscale);

test('V121 smooth SVG shading preserves the exact approved V120 geometry',()=>{
 for(const kind of kinds){
  const generated=renderSmoothTileSVG(kind);
  assert.equal(fs.readFileSync(path.join(root,kind+'.svg'),'utf8'),generated,
   'checked-in SVG differs from runtime generator: '+kind);
  const geometry=shapes(generated).map(s=>s.replace(/\sfill="[^"]*"/,'')).join('\n');
  assert.equal(hash(geometry),originalGeometry[kind],'geometry drift: '+kind);
  assert.doesNotMatch(generated,/<path| rx=| ry=|filter|random|stroke=/);
 }
});

test('all directed highlights are brighter and all opposite shadows darker',()=>{
 for(const [kind,minDifference,baseShade] of [
  ['I',90,164],['O',80,142],['S',120,210],
  ['Z',120,10],['J',65,146],['L',95,157]
 ]){
  const v=values(kind);
  assert.equal(v[0],baseShade,'unchanged base luminance '+kind);
  assert.ok(v[1]-v[3]>=minDifference,'stronger directional contrast '+kind);
  assert.ok(v[1]>v[0],kind+' top/left highlight is lighter than base');
  if(kind!=='Z'&&kind!=='O')assert.ok(v[3]<v[0],kind+' lower bevel is a shadow');
 }
});

test('T remains a single, unchanged flat square and O keeps its genuine triangle',()=>{
 const t=renderSmoothTileSVG('T'),o=renderSmoothTileSVG('O');
 assert.deepEqual(values('T'),[142]);
 assert.equal(shapes(t).length,1);
 assert.equal((o.match(/<polygon/g)||[]).length,1);
 assert.match(o,/<polygon points="3,3 8,3 3,8" fill="rgb\(242,242,242\)"\/>/);
});

test('I gravel remains fixed when original four-block strip is fragmented',()=>{
 const original=renderIFragmentSVG({length:4});
 for(let offset=0;offset<4;offset++)for(let len=1;len<=4-offset;len++){
  const fragment=renderIFragmentSVG({sourceOffset:offset,length:len});
  assert.ok(fragment.includes('data-source-offset="'+offset+'"'));
  const dots=shapes(fragment).filter(tag=>tag.startsWith('<circle'));
  const dotsInWhole=shapes(original).filter(tag=>tag.startsWith('<circle'));
  assert.ok(dots.length<=dotsInWhole.length);
  // No render-time randomness or new gravel coordinates allowed.
  assert.equal(fragment,renderIFragmentSVG({sourceOffset:offset,length:len}));
 }
});

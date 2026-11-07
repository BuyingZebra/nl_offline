import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PIECE_LUMINANCE,PIECE_PATTERNS,drawTileFace} from '../tile-face.js';

const shapes=['I','J','L','O','S','T','Z'];
function draw(kind,size){
 const calls=[],g={fillStyle:'',fillRect(x,y,w,h){calls.push({x,y,w,h,color:this.fillStyle});}};
 drawTileFace(g,12,18,size,size,kind);
 return calls;
}

test('the seven original monochrome luminance identities remain unchanged',()=>{
 assert.deepEqual(PIECE_LUMINANCE,{I:219,J:129,L:183,O:237,S:201,T:147,Z:165});
 assert.equal(Object.isFrozen(PIECE_LUMINANCE),true);
 const values=Object.values(PIECE_LUMINANCE).sort((a,b)=>a-b);
 assert.deepEqual(values.slice(1).map((v,i)=>v-values[i]),Array(6).fill(18));
});

test('all seven approved retro tile motifs are present and unique',()=>{
 assert.deepEqual(Object.keys(PIECE_PATTERNS),shapes);
 assert.equal(Object.isFrozen(PIECE_PATTERNS),true);
 assert.equal(new Set(Object.values(PIECE_PATTERNS)).size,7);
 for(const size of [8,11,22,28]){
  const signatures=shapes.map(k=>JSON.stringify(draw(k,size).slice(5).map(({x,y,w,h})=>[x,y,w,h])));
  assert.equal(new Set(signatures).size,7,'independent patterns at '+size+'px');
 }
});

test('each face is monochrome, fits its exact tile area and is deterministic',()=>{
 for(const size of [8,11,22,28])for(const kind of shapes){
  const calls=draw(kind,size);
  assert.ok(calls.length>=8&&calls.length<=36,kind+'/'+size+' practical fill count');
  assert.deepEqual(calls,draw(kind,size),kind+'/'+size+' has no speckle flicker');
  for(const call of calls){
   const match=/^rgb\((\d+),(\d+),(\d+)\)$/.exec(call.color);
   assert.ok(match,'invalid colour: '+call.color);
   assert.equal(match[1],match[2],'red = green '+kind);
   assert.equal(match[2],match[3],'green = blue '+kind);
   assert.ok(Number(match[1])>=0&&Number(match[1])<=255);
   assert.ok([call.x,call.y,call.w,call.h].every(Number.isFinite));
   assert.ok(call.w>0&&call.h>0);
   assert.ok(call.x>=12-.001&&call.y>=18-.001);
   assert.ok(call.x+call.w<=12+size+.001,'overruns width '+kind);
   assert.ok(call.y+call.h<=18+size+.001,'overruns height '+kind);
  }
 }
});

test('small NEXT/HOLD cells retain the original spacing and outlines',()=>{
 for(const kind of shapes){
  const tiny=draw(kind,8),large=draw(kind,24);
  assert.ok(tiny.length>=8);
  assert.ok(large.length>=tiny.length);
  assert.ok(tiny[0].x>12&&tiny[0].y>18,'retains tile gap');
 }
});

test('gameboard, NEXT and HOLD share the same artwork renderer',()=>{
 const source=readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 assert.match(source,/function tileFace\(x,y,w,h,kind\)\{\s*drawTileFace\(g,x,y,w,h,kind\);/);
 assert.match(source,/tileFace\(tile\.x,tile\.y,tile\.size,tile\.size,kind\)/);
 assert.match(source,/tileFace\(px,py,size,size,kind\)/);
});

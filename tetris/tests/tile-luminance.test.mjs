import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PIECE_LUMINANCE,PIECE_PATTERNS,drawTileFace,drawIBar,drawPieceTiles} from '../art.js';

const kinds=['I','J','L','O','S','T','Z'];
function capture(draw){
 const calls=[];
 const g={fillStyle:'',fillRect(x,y,w,h){calls.push({x,y,w,h,color:this.fillStyle});}};
 draw(g);
 return calls;
}
function shade(calls,x,y){
 let result=null;
 for(const r of calls){
  if(x>=r.x&&x<r.x+r.w-.0005&&y>=r.y&&y<r.y+r.h-.0005)
   result=Number(/^rgb\((\d+),/.exec(r.color)?.[1]);
 }
 return result;
}
test('seven approved patterns are mapped to their original Game Boy shapes',()=>{
 assert.deepEqual(PIECE_PATTERNS,{
  I:'continuous-gravel',J:'dotted-field',L:'recessed-square',
  O:'corner-highlight',S:'small-center',T:'solid-fill',Z:'centered-square'
 });
 assert.equal(Object.isFrozen(PIECE_PATTERNS),true);
 assert.ok(!Object.values(PIECE_PATTERNS).some(s=>/checker|stripe|diagonal/.test(s)));
 assert.deepEqual(PIECE_LUMINANCE,{I:219,J:129,L:183,O:237,S:201,T:147,Z:165});
});
test('every approved motif retains its distinctive light/dark pixel arrangement',()=>{
 const tile=k=>capture(g=>drawTileFace(g,0,0,12,12,k));
 const o=tile('O'),t=tile('T'),s=tile('S'),z=tile('Z'),j=tile('J'),l=tile('L');
 assert.ok(shade(o,3.5,3.5)>shade(o,7.5,7.5),'O corner is brighter');
 assert.equal(shade(t,2.5,2.5),shade(t,9.5,9.5),'T is flat solid fill');
 assert.ok(shade(s,5.5,5.5)<shade(s,3.5,3.5),'S has tiny dark center');
 assert.ok(shade(z,5.5,5.5)<shade(z,4.5,4.5),'Z has nested bright ring');
 assert.ok(shade(j,3.5,3.5)<shade(j,4.5,3.5),'J has sparse dark dots');
 assert.ok(shade(l,5.5,5.5)<shade(l,2.5,2.5),'L has a recessed square');
});
test('all source pixels are monochrome, deterministic and inside their tile',()=>{
 for(const kind of kinds)for(const size of [8,11,20,28]){
  const draw=()=>capture(g=>drawTileFace(g,12,18,size,size,kind));
  const calls=draw();
  assert.deepEqual(calls,draw(),kind+' is deterministic at '+size);
  assert.ok(calls.length>0&&calls.length<100,kind+' keeps drawing affordable');
  for(const r of calls){
   const match=/^rgb\((\d+),(\d+),(\d+)\)$/.exec(r.color);
   assert.ok(match,'valid grayscale');
   assert.equal(match[1],match[2]);assert.equal(match[2],match[3]);
   assert.ok(r.w>0&&r.h>0);
   assert.ok(r.x>=12&&r.y>=18);
   assert.ok(r.x+r.w<=12+size+.005&&r.y+r.h<=18+size+.005);
  }
 }
});
test('the four-block I is a single uninterrupted gravel bar, not four framed tiles',()=>{
 const tiles=[0,1,2,3].map(i=>({x:i*20,y:0,size:20}));
 const one=capture(g=>drawPieceTiles(g,tiles,'I'));
 const direct=capture(g=>drawIBar(g,0,0,80,20));
 assert.deepEqual(one,direct);
 const border=capture(g=>drawIBar(g,0,0,48,12));
 assert.equal(shade(border,2.5,1.5),shade(border,12.5,1.5),
  'top border does not restart between cells');
 const vertical=capture(g=>drawIBar(g,0,0,12,48));
 assert.equal(shade(vertical,1.5,2.5),shade(vertical,1.5,12.5),
  'vertical bar has no internal borders');
});
test('gameboard, falling piece and NEXT/HOLD use the same approved renderer',()=>{
 const code=readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 assert.match(code,/vectorTiles\.drawPiece\(g,fitPreviewCells\(/);
 assert.match(code,/if\(p.kind==='I'\)vectorTiles\.drawPiece\(g,activeTiles,'I',\{rotation:p.rotation\}\)/);
 assert.match(code,/vectorTiles\.drawIFragment\(g,offX\+run\.x\*tile,offY\+run\.y\*tile,/);
 assert.match(code,/tileFace\(px,py,size,size,kind\)/);
 assert.match(code,/g.globalAlpha=\.751355748;g.strokeStyle=C.grid/);
});

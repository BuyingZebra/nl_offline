import test from 'node:test';
import assert from 'node:assert/strict';
import {PIECE_LUMINANCE,drawTileFace} from '../tile-face.js';

test('pieces use distinct balanced grayscale values rather than colour equivalents',()=>{
 assert.deepEqual(PIECE_LUMINANCE,{
  I:219,J:129,L:183,O:237,S:201,T:147,Z:165
 });
 assert.deepEqual(Object.keys(PIECE_LUMINANCE),['I','J','L','O','S','T','Z']);
 assert.equal(Object.isFrozen(PIECE_LUMINANCE),true);
});
test('former piece brightness order preserved, within a controlled readable range',()=>{
 const x=PIECE_LUMINANCE;
 assert.ok(x.O>x.I&&x.I>x.S&&x.S>x.L&&x.L>x.Z&&x.Z>x.T&&x.T>x.J);
 const levels=Object.values(x);
 assert.ok(levels.every(v=>Number.isInteger(v)&&v>=129&&v<=237));
 assert.equal(Math.min(...levels),129);
 assert.equal(Math.max(...levels),237);
 const sorted=[...levels].sort((a,b)=>a-b);
 assert.deepEqual(sorted.slice(1).map((v,i)=>v-sorted[i]),Array(6).fill(18));
});
test('all gameplay and preview tiles use identical monochrome bevel geometry',()=>{
 for(const kind of Object.keys(PIECE_LUMINANCE)){
  const calls=[];
  const g={
   fillStyle:'',
   fillRect(x,y,w,h){calls.push({x,y,w,h,colour:this.fillStyle});}
  };
  drawTileFace(g,12,18,25,25,kind);
  assert.equal(calls.length,8,kind);
  for(const call of calls){
   const match=/^rgb\((\d+),(\d+),(\d+)\)$/.exec(call.colour);
   assert.ok(match,'must not emit coloured CSS '+call.colour);
   assert.equal(match[1],match[2]);
   assert.equal(match[2],match[3]);
   assert.ok(call.w>0&&call.h>0);
  }
  // Center cap/face remain balanced; only the numeric luminance changes.
  assert.ok(calls[0].x>12&&calls[0].y>18);
 }
});
test('each piece retains distinct face brightness and bevel headroom',()=>{
 const levels=Object.keys(PIECE_LUMINANCE).map(k=>{
  const colors=[];
  drawTileFace({set fillStyle(v){colors.push(v);},fillRect(){}},0,0,20,20,k);
  return colors[0];
 });
 assert.equal(new Set(levels).size,7);
});
test('all eight tile-face levels preserve the intended detail range',()=>{
 for(const kind of Object.keys(PIECE_LUMINANCE)){
  const colours=[];
  drawTileFace({set fillStyle(v){colours.push(Number(v.match(/rgb\((\d+)/)[1]));},fillRect(){}},
   0,0,25,25,kind);
  assert.equal(colours.length,8);
  assert.ok(colours.every(value=>value>=91&&value<=255),
   kind+' bevel is clipped or too dark');
  assert.ok(Math.max(...colours)-Math.min(...colours)>=56,
   kind+' bevel contrast collapsed');
  assert.ok(colours[6]>colours[1],
   kind+' two distinct upper highlights must survive clipping');
  if(kind==='O')assert.deepEqual([colours[1],colours[6]],[253,255]);
 }
});

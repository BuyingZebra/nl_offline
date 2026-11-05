import test from 'node:test';
import assert from 'node:assert/strict';
import {PIECE_LUMINANCE,drawTileFace} from '../tile-face.js';

test('pieces have their familiar colour-equivalent grayscale luminance',()=>{
 assert.deepEqual(PIECE_LUMINANCE,{
  I:229,J:76,L:177,O:247,S:220,T:107,Z:127
 });
 assert.deepEqual(Object.keys(PIECE_LUMINANCE),['I','J','L','O','S','T','Z']);
 assert.equal(Object.isFrozen(PIECE_LUMINANCE),true);
});
test('yellow is brightest, blue darkest, with hue-free grayscale values',()=>{
 const x=PIECE_LUMINANCE;
 assert.ok(x.O>x.I&&x.I>x.S&&x.S>x.L&&x.L>x.Z&&x.Z>x.T&&x.T>x.J);
 assert.ok(Object.values(x).every(v=>Number.isInteger(v)&&v>=0&&v<=255));
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
test('each piece has a distinct face brightness, not arbitrary rank levels',()=>{
 const levels=Object.keys(PIECE_LUMINANCE).map(k=>{
  const colors=[];
  drawTileFace({set fillStyle(v){colors.push(v);},fillRect(){}},0,0,20,20,k);
  return colors[0];
 });
 assert.equal(new Set(levels).size,7);
});

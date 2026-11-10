import {test} from 'node:test';
import assert from 'node:assert/strict';
import {directionalShadowAlpha,directionalShadowProfile} from '../tetris/shadows.js';

function impulse(size=33,x=16,y=16){
 const alpha=new Float32Array(size*size);
 alpha[y*size+x]=1;
 return alpha;
}
const at=(a,x,y,n=33)=>a[y*n+x];

test('v06 unbiased blur is symmetric when the offset is zero',()=>{
 const output=directionalShadowAlpha(impulse(),33,33,{
  angle:0,distance:0,blur:3,bias:0
 });
 assert.ok(at(output,18,16)>0);
 assert.ok(at(output,14,16)>0);
 assert.ok(Math.abs(at(output,18,16)-at(output,14,16))<1e-6);
});
test('v06 full bias does not blur backwards toward the light',()=>{
 const output=directionalShadowAlpha(impulse(),33,33,{
  angle:0,distance:0,blur:3,bias:1
 });
 assert.ok(at(output,18,16)>0,'shadow extends away from the light');
 assert.equal(at(output,14,16),0,'light-facing side has no upstream Gaussian');
 assert.equal(at(output,16,13),at(output,16,19),'cross-axis blur stays symmetric');
});
test('shadow offset and rotation-independent angle are reproducible',()=>{
 const source=impulse();
 const output=directionalShadowAlpha(source,33,33,{
  angle:90,distance:4,blur:0,bias:1
 });
 assert.ok(at(output,16,20)>.999);
 assert.equal(at(output,16,16),0);
 assert.deepEqual(Array.from(directionalShadowAlpha(source,33,33,{blur:0,distance:0})),Array.from(source));
});
test('shadow input validation and profile bounds remain explicit',()=>{
 assert.throws(()=>directionalShadowAlpha(new Float32Array(8),4,4),RangeError);
 const settings=directionalShadowProfile(35);
 assert.equal(settings.blur,14);
 assert.equal(settings.bias,1);
 assert.equal(settings.resolution,.5);
});

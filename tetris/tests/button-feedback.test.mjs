import test from 'node:test';
import assert from 'node:assert/strict';
import {createButtonFeedback,MAX_BUTTON_FLASHES,BUTTON_FLASH_PEAK_MS,
 BUTTON_AFTERGLOW_MS,BUTTON_FLASH_TOTAL_MS,BUTTON_FEEDBACK_VERTEX,BUTTON_FEEDBACK_FRAGMENT}
 from '../button-feedback.js';

const solid={x:20,y:40,w:83,h:44,kind:'button',light:true};
const outline={x:150,y:40,w:83,h:44,kind:'button',light:false};
test('held buttons stay at full luminance until release, then fade',()=>{
 const f=createButtonFeedback();
 assert.equal(f.press(solid,1000),true);
 assert.deepEqual(f.sample(1000),[{x:20,y:40,w:83,h:44,mode:0,power:1}]);
 assert.equal(f.sample(9000)[0].power,1);
 assert.equal(f.release(solid,9000),true);
 assert.equal(f.sample(9000)[0].power,1);
 assert.ok(f.sample(9205)[0].power>0&&f.sample(9205)[0].power<1);
 assert.deepEqual(f.sample(9000+BUTTON_AFTERGLOW_MS),[]);
 assert.equal(f.count,0);
});
test('outlined and settings controls have distinct presentation modes',()=>{
 const f=createButtonFeedback();
 f.press(outline,0);
 f.press({x:0,y:0,w:15,h:15,kind:'toggle'},10);
 assert.deepEqual(f.sample(10).map(h=>h.mode),[1,2]);
});
test('keyboard taps remain bounded without keyup',()=>{
 const f=createButtonFeedback();
 f.press(solid,1000,false);
 assert.equal(f.sample(1000+BUTTON_FLASH_PEAK_MS)[0].power,1);
 assert.ok(f.sample(1000+BUTTON_FLASH_PEAK_MS+100)[0].power<1);
 assert.deepEqual(f.sample(1000+BUTTON_FLASH_TOTAL_MS),[]);
});
test('repeated presses restart same hit without affecting independent controls',()=>{
 const f=createButtonFeedback();
 f.press(solid,0);f.press(outline,10);
 f.release(solid,20);
 f.press(solid,150);
 assert.equal(f.count,2);
 assert.deepEqual(f.sample(150).map(h=>h.power),[1,1]);
 assert.equal(f.release(outline,200),true);
 assert.equal(f.release(solid,300),true);
 assert.deepEqual(f.sample(800),[]);
});
test('feedback remains bounded, validates geometry, and clears on navigation',()=>{
 const f=createButtonFeedback();
 assert.equal(f.press(null,0),false);
 assert.equal(f.press({x:NaN,y:0,w:10,h:20},0),false);
 assert.equal(f.press({x:0,y:0,w:10,h:0},0),false);
 assert.equal(f.release(solid,Infinity),false);
 for(let i=0;i<100;i++)f.press({x:i*12,y:0,w:10,h:10},i);
 assert.equal(f.count,MAX_BUTTON_FLASHES);
 assert.equal(f.clear(),true);
 assert.deepEqual(f.sample(100),[]);
 assert.equal(f.clear(),false);
});
test('shader brightens source face, protects dark glyphs, and creates no local halo',()=>{
 assert.match(BUTTON_FEEDBACK_VERTEX,/gl_Position/);
 assert.match(BUTTON_FEEDBACK_FRAGMENT,/uniform vec2 uViewport/);
 assert.match(BUTTON_FEEDBACK_FRAGMENT,/uniform vec4 uRects\[8\]/);
 assert.match(BUTTON_FEEDBACK_FRAGMENT,/uniform float uPower\[8\]/);
 assert.match(BUTTON_FEEDBACK_FRAGMENT,/uniform float uMode\[8\]/);
 assert.match(BUTTON_FEEDBACK_FRAGMENT,/float inside=step\(lo\.x,p\.x\)/);
 assert.match(BUTTON_FEEDBACK_FRAGMENT,/pressedColor=mix\(original,vec3\(1\.0\),face\)/);
 assert.match(BUTTON_FEEDBACK_FRAGMENT,/pressedColor=vec3\(mix\(1\.0,\.018,ink\)\)/);
 assert.doesNotMatch(BUTTON_FEEDBACK_FRAGMENT,/float halo|float rim|float distance|exp\(/);
 assert.ok(BUTTON_FLASH_TOTAL_MS<700);
});

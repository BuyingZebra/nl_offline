import test from 'node:test';
import assert from 'node:assert/strict';
import {createButtonFeedback,MAX_BUTTON_FLASHES,BUTTON_FLASH_PEAK_MS,
 BUTTON_AFTERGLOW_MS,BUTTON_FLASH_TOTAL_MS,BUTTON_BASE_LEVEL,BUTTON_PEAK_LEVEL,
 buttonLevel,buttonInkLevel}
 from '../button-feedback.js';

const solid={x:20,y:40,w:83,h:44,kind:'button',light:true};
const outline={x:150,y:40,w:83,h:44,kind:'button',light:false};
test('held buttons stay at full luminance until release, then fade',()=>{
 const f=createButtonFeedback();
 assert.equal(f.press(solid,1000),true);
 assert.deepEqual(f.sample(1000),[{x:20,y:40,w:83,h:44,power:1}]);
 assert.equal(f.sample(9000)[0].power,1);
 assert.equal(f.release(solid,9000),true);
 assert.equal(f.sample(9000)[0].power,1);
 assert.ok(f.sample(9205)[0].power>0&&f.sample(9205)[0].power<1);
 assert.deepEqual(f.sample(9000+BUTTON_AFTERGLOW_MS),[]);
 assert.equal(f.count,0);
});
test('filled, outlined and icon controls all share the same source peak',()=>{
 const f=createButtonFeedback();
 f.press(solid,0);
 f.press(outline,0);
 f.press({x:0,y:0,w:15,h:15,kind:'toggle'},0);
 assert.deepEqual(f.sample(20).map(hit=>buttonLevel(hit.power)),[255,255,255]);
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
test('all active button geometry is 206 at rest and reaches 255 on press',()=>{
 assert.equal(BUTTON_BASE_LEVEL,206);
 assert.equal(BUTTON_PEAK_LEVEL,255);
 assert.equal(buttonLevel(0),206);
 assert.equal(buttonLevel(.5),231);
 assert.equal(buttonLevel(1),255);
 assert.equal(buttonLevel(-5),206);
 assert.equal(buttonLevel(9),255);
 assert.equal(buttonInkLevel(0),6);
 assert.equal(buttonInkLevel(1),30);
 assert.ok(buttonInkLevel(1)<buttonLevel(1),'solid dark text stays legible');
 assert.ok(BUTTON_FLASH_TOTAL_MS<700);
});
test('physical phosphor mode stops excitation on release instead of double-fading',()=>{
 const f=createButtonFeedback();
 const hit={x:12,y:22,w:40,h:40,kind:'button',light:true};
 f.press(hit,0,true);
 assert.equal(f.sample(100,true)[0].power,1);
 f.release(hit,200);
 assert.deepEqual(f.sample(200,true),[]);
 assert.equal(f.count,0);
 // A keyboard pulse has a minimum peak hold, then yields to GPU history.
 f.press(hit,1000,false);
 assert.equal(f.sample(1070,true)[0].power,1);
 assert.deepEqual(f.sample(1100,true),[]);
 // Unmodified V096 baseline still has its quadratic fade.
 f.press(hit,2000,true);f.release(hit,2010);
 assert.ok(f.sample(2100,false)[0].power>0);
});

test('fast touch is latched for one frame but never given the cosmetic fade in physical mode',()=>{
 const f=createButtonFeedback();
 const hit={x:12,y:22,w:40,h:40,kind:'button',light:true};
 f.press(hit,1000,true);f.release(hit,1000);
 assert.equal(f.sample(1016,true)[0].power,1);
 assert.deepEqual(f.sample(1035,true),[]);
});

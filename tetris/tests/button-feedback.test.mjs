import test from 'node:test';
import assert from 'node:assert/strict';
import {createButtonFeedback,MAX_BUTTON_FLASHES,BUTTON_FLASH_PEAK_MS,
 BUTTON_FLASH_TOTAL_MS,BUTTON_FEEDBACK_VERTEX,BUTTON_FEEDBACK_FRAGMENT}
 from '../button-feedback.js';

test('all button shapes begin at peak brightness and leave a short afterglow',()=>{
 const f=createButtonFeedback();
 const hit={x:20,y:40,w:83,h:44};
 assert.equal(f.press(hit,1000),true);
 assert.equal(f.count,1);
 assert.deepEqual(f.sample(1000),[{...hit,power:1}]);
 assert.equal(f.sample(1000+BUTTON_FLASH_PEAK_MS)[0].power,1);
 const shortly=f.sample(1150)[0].power;
 const fading=f.sample(1330)[0].power;
 assert.ok(shortly>fading&&fading>0);
 assert.equal(f.sample(1000+BUTTON_FLASH_TOTAL_MS).length,0);
 assert.equal(f.count,0);
});
test('presses are separate for different buttons and repeat presses restart',()=>{
 const f=createButtonFeedback();
 const one={x:7,y:2,w:50,h:40},two={x:60,y:2,w:50,h:40};
 f.press(one,0);f.press(two,10);
 assert.equal(f.sample(40).length,2);
 f.press(one,150);
 assert.equal(f.count,2);
 assert.equal(f.sample(150).at(-1).power,1);
 assert.ok(f.sample(150)[0].power<1);
 assert.deepEqual(f.sample(10000),[]);
});
test('rapid input never leaks more than the configured maximum',()=>{
 const f=createButtonFeedback();
 for(let i=0;i<100;i++)f.press({x:i*12,y:0,w:10,h:10},i);
 assert.equal(f.count,MAX_BUTTON_FLASHES);
 assert.equal(f.sample(100).length,MAX_BUTTON_FLASHES);
 assert.equal(f.sample(9999).length,0);
});
test('invalid coordinates and zero-area regions never create a glow',()=>{
 const f=createButtonFeedback();
 assert.equal(f.press(null,0),false);
 assert.equal(f.press({x:NaN,y:0,w:10,h:20},0),false);
 assert.equal(f.press({x:0,y:0,w:10,h:0},0),false);
 assert.equal(f.press({x:0,y:0,w:10,h:20},Infinity),false);
 assert.equal(f.count,0);
});
test('suspension cancels afterglow immediately and cannot preserve stale state',()=>{
 const f=createButtonFeedback();
 f.press({x:1,y:2,w:3,h:4},100);
 assert.equal(f.clear(),true);
 assert.equal(f.clear(),false);
 assert.equal(f.sample(200).length,0);
});
test('button shader reaches full luminance only inside its hitbox, leaving bloom to the compositor',()=>{
 assert.match(BUTTON_FEEDBACK_VERTEX,/gl_Position/);
 assert.match(BUTTON_FEEDBACK_FRAGMENT,/uniform vec2 uViewport/);
 assert.match(BUTTON_FEEDBACK_FRAGMENT,/uniform vec4 uRects\[8\]/);
 assert.match(BUTTON_FEEDBACK_FRAGMENT,/uniform float uPower\[8\]/);
 assert.match(BUTTON_FEEDBACK_FRAGMENT,/float inside=step\(lo\.x,p\.x\)/);
    assert.match(BUTTON_FEEDBACK_FRAGMENT,/flash=max\(flash,power\*inside\)/);
    assert.match(BUTTON_FEEDBACK_FRAGMENT,/mix\(original,vec3\(1\.0\),clamp\(flash,0\.0,1\.0\)\)/);
    assert.doesNotMatch(BUTTON_FEEDBACK_FRAGMENT,/float halo|float rim|float distance|exp\(/);
 assert.doesNotMatch(BUTTON_FEEDBACK_FRAGMENT,/\bvec3\s*\(\s*\d+\.\d+\s*,\s*\d+\.\d+\s*,\s*\d+\.\d+/);
 assert.ok(BUTTON_FLASH_TOTAL_MS<700,'glow must fade promptly');
});

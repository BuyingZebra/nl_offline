/* V082: one global post-composite luminance curve, no canvas overlay. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'game-reveal.js'),'utf8');
const {GAME_REVEAL_DURATION_MS,gameRevealProgress}=new Function(
 code.replace(/export const /g,'const ').replace(/export function /g,'function ')+
 '\nreturn {GAME_REVEAL_DURATION_MS,gameRevealProgress};')();
test('V082 starts the entire finished image at zero and reaches 100% at 850ms',()=>{
 assert.equal(GAME_REVEAL_DURATION_MS,850);
 assert.equal(gameRevealProgress(0),0);
 assert.equal(gameRevealProgress(425),.5);
 assert.equal(gameRevealProgress(850),1);
 assert.equal(gameRevealProgress(-9),0);
 assert.equal(gameRevealProgress(2000),1);
 for(let t=1;t<=850;t++)
  assert.ok(gameRevealProgress(t)>=gameRevealProgress(t-1));
});
test('V082 no independent scene mask, overlay texture or masked UI surfaces remain',()=>{
 const main=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 assert.ok(main.includes("gameRevealProgress(now-gameRevealStartedAt)"));
 assert.ok(main.includes("if(!gameRevealFirstFrame)gameRevealStartedAt=now"));
 assert.ok(main.includes("contentLuminance=1-(boot?.powerOffProgress?.()??0)"));
 assert.ok(main.includes("contentLuminance,"));
 assert.ok(main.includes("screen.style.pointerEvents='auto'"));
 for(const obsolete of ['revealPlane','revealCanvas','revealTexture',
  'paintGameRevealMask','textureUploads.upload(revealTexture'])
  assert.ok(!main.includes(obsolete),obsolete+' must be absent');
 assert.ok(!main.includes('boot.rollTurns(elapsed)'));
 assert.ok(main.includes('compositor.setStartupRoll(0)'));
});
test('V082 both source images pass through same luminance after glow, before scanlines',()=>{
 const compositor=fs.readFileSync(path.join(__dirname,'compositor.js'),'utf8');
 const glow=compositor.indexOf('composer.addPass(glow)');
 const vignette=compositor.indexOf('composer.addPass(edgeVignette)');
 const crt=compositor.indexOf('composer.addPass(scanlineOverlay)');
 assert.ok(glow<vignette&&vignette<crt,'luminance control is downstream of glow but upstream of CRT');
 assert.ok(compositor.includes('uContentLuminance'));
 assert.ok(compositor.includes('mix(vec3(8.0/255.0),finished,clamp(uContentLuminance,0.0,1.0))'));
 assert.ok(compositor.includes('gl_FragCoord.x,uScreenHeight-gl_FragCoord.y'));
 assert.ok(!compositor.includes('uContentCollapse'));
 const boot=fs.readFileSync(path.join(__dirname,'boot-sequence.js'),'utf8');
 assert.ok(boot.includes("Terminal.paint(ctx,w,h,elapsed(),'082',presented&&elapsed()>=BOOT_MS)"));
});

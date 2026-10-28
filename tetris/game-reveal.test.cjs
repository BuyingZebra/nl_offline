/* V081: source-only full-screen fade, no staged board assembly. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'game-reveal.js'),'utf8');
const {GAME_REVEAL_DURATION_MS,gameRevealProgress,paintGameRevealMask}=new Function(
 code.replace(/export const /g,'const ').replace(/export function /g,'function ')+
 '\nreturn {GAME_REVEAL_DURATION_MS,gameRevealProgress,paintGameRevealMask};'
)();
function canvas(){
 const painted=[],calls=[];
 const ctx={
  globalAlpha:1,fillStyle:null,
  setTransform(...v){calls.push(['transform',...v]);},
  clearRect(...v){calls.push(['clear',...v]);},
  fillRect(...v){painted.push({rect:v,alpha:this.globalAlpha,color:this.fillStyle});}
 };
 return {ctx,painted,calls};
}
test('V081 complete game fades uniformly over 850ms',()=>{
 assert.equal(GAME_REVEAL_DURATION_MS,850);
 assert.equal(gameRevealProgress(0),0);
 assert.equal(gameRevealProgress(425),.5);
 assert.equal(gameRevealProgress(850),1);
 assert.equal(gameRevealProgress(-12),0);
 assert.equal(gameRevealProgress(2000),1);
 for(let i=1;i<=850;i++)
  assert.ok(gameRevealProgress(i)>=gameRevealProgress(i-1));
});
test('near-black mask covers the entire game screen without modifying layout',()=>{
 const x=canvas();
 const state=paintGameRevealMask(x.ctx,null,393,852,0);
 assert.equal(state.complete,false);
 assert.deepEqual(x.painted[0],{rect:[0,0,393,852],alpha:1,color:'#080808'});
 assert.equal(x.ctx.globalAlpha,1);
 const middle=canvas();
 paintGameRevealMask(middle.ctx,{},393,852,425);
 assert.deepEqual(middle.painted[0],{rect:[0,0,393,852],alpha:.5,color:'#080808'});
 assert.equal(middle.ctx.globalAlpha,1);
 const done=canvas();
 assert.equal(paintGameRevealMask(done.ctx,{},393,852,850).complete,true);
 assert.equal(done.painted.length,0,'finished fade no longer covers game');
 assert.ok(done.calls.some(c=>c[0]==='clear'));
});
test('old roll remains unused, while phosphor and CRT effects remain downstream',()=>{
 const main=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 assert.ok(main.includes('function beginGameReveal()'));
 assert.ok(main.includes('compositor.setStartupRoll(0)'));
 assert.ok(!main.includes('boot.rollTurns(elapsed)'));
 assert.ok(main.includes("paintGameRevealMask(revealContext,layoutInfo||layout(),w,h,elapsed)"));
 assert.ok(main.includes("if(gameRevealActive&&!gameRevealFirstFrame)"));
 assert.ok(main.includes("screen.style.pointerEvents='auto'"));
 assert.ok(!code.includes('clearRect(x,y,bw,bh*p)'));
 const shaders=fs.readFileSync(path.join(__dirname,'compositor.js'),'utf8');
 assert.ok(shaders.includes('gl_FragCoord.x,uScreenHeight-gl_FragCoord.y'));
});

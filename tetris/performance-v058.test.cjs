/* V058 — observable Tetris state gates GPU uploads, not elapsed time.
 * node --test tetris/performance-v058.test.cjs
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const visual=new Function(read('game-visual-state.js').replace(/export function /g,'function ')+
 '\nreturn {captureGameVisualState,gameVisualStateChanged,flashPhase};')();
const perf=new Function(read('perf-monitor.js').replace(/export function /g,'function ')+
 '\nreturn createPerfMonitor;')();
function newGame(){
 const w={};new Function('window',read('core.js'))(w);
 const game=new w.FieldAtlasBlocks.Game(()=>.42);game.start();return game;
}

test('gravity time accumulation never changes the visible state before the next fall',()=>{
 const game=newGame(),originalY=game.current.y;
 let renders=0,advances=0;
 for(let t=0;t<25;t++){
  const before=visual.captureGameVisualState(game);
  const advanced=game.tick(16.67);
  if(advanced)advances++;
  if(visual.gameVisualStateChanged(before,game))renders++;
 }
 assert.equal(game.current.y,originalY);
 assert.equal(advances,0);assert.equal(renders,0);
});
test('one gravity step redraws exactly once, not every tick',()=>{
 const game=newGame();
 let renders=0,advances=0;
 for(let t=0;t<100;t++){
  const previous=visual.captureGameVisualState(game);
  const advance=game.tick(16.67);
  if(advance)advances++;
  if(visual.gameVisualStateChanged(previous,game))renders++;
 }
 assert.equal(advances,1);
 assert.equal(renders,1);
});
test('piece movement and rotation are visible even with an unchanged piece reference',()=>{
 const game=newGame();
 const before=visual.captureGameVisualState(game);
 game.move(-1);
 assert.equal(before.piece,game.current);
 assert.equal(visual.gameVisualStateChanged(before,game),true);
 const mid=visual.captureGameVisualState(game);
 game.rotate(1);
 assert.equal(visual.gameVisualStateChanged(mid,game),true);
});
test('score, status, and piece replacement each force an update',()=>{
 const game=newGame();
 const before=visual.captureGameVisualState(game);
 game.score++;
 assert.equal(visual.gameVisualStateChanged(before,game),true);
 const afterScore=visual.captureGameVisualState(game);
 game.pause();
 assert.equal(visual.gameVisualStateChanged(afterScore,game),true);
 game.start();
 const beforeDrop=visual.captureGameVisualState(game);
 game.hardDrop();
 assert.equal(visual.gameVisualStateChanged(beforeDrop,game),true);
});
test('unchanged game is ignored across consecutive checks',()=>{
 const game=newGame();
 const before=visual.captureGameVisualState(game);
 assert.equal(visual.gameVisualStateChanged(before,game),false);
 assert.equal(visual.gameVisualStateChanged(before,game),false);
});
test('flash animation changes only at phase boundaries',()=>{
 const {flashPhase}=visual;
 assert.equal(flashPhase(0),flashPhase(50));
 assert.notEqual(flashPhase(71),flashPhase(72));
 assert.equal(flashPhase(72),flashPhase(143));
 assert.notEqual(flashPhase(143),flashPhase(144));
 assert.ok(430/72<7);
});
test('instrumentation distinguishes raw tick result and real visual change',()=>{
 let t=0,last=null;
 const m=perf({enabled:true,now:()=>t,intervalMs:5,log:s=>last=s});
 m.recordGameChanges({advanced:false,visualChanged:false});
 m.recordGameChanges({advanced:true,visualChanged:false});
 m.recordGameChanges({advanced:true,visualChanged:true});
 const stamp=m.startFrame();t=6;m.endFrame(stamp);
 assert.equal(last.gravityTickAdvances,2);
 assert.equal(last.visualStateChanges,1);
});
test('V058 preserves the user controls and only guarded gravity drives a redraw',()=>{
 const js=read('three-v027.js');
 assert.ok(js.includes("const THREE_BUILD_VERSION='063'"));
 assert.ok(js.includes("from './game-visual-state.js?v058'"));
 assert.ok(js.includes('const visualChanged=gameVisualStateChanged(prior,game);'));
 assert.ok(js.includes('if(visualChanged){'));
 assert.ok(js.includes("layers.reason('gravity')"));
 assert.ok(js.includes('if(finished||flashPhase('));
 assert.ok(js.includes("key('',debugX,headerButtonY,q.buttonH,q.buttonH,'copyDebug')"));
 assert.ok(read('three-v027.html').includes('Tetris System V063'));
});

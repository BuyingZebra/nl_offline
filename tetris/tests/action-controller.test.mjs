/* NOMAD Tetris V088: application action/side-effect regression tests.
 * Run with Node 22+: node --test tetris/tests/action-controller.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionController,GAME_ACTIONS} from '../action-controller.js';

function harness(initialStatus='ready'){
 const events=[],storage={getItem:()=>null,setItem:()=>{}};
 const game={
  status:initialStatus,pieces:0,lines:0,score:0,level:1,hold:null,
  move:dx=>{if(game.status!=='playing')return false;events.push(['move',dx]);return true;},
  rotate:dir=>{if(game.status!=='playing')return false;events.push(['rotate',dir]);return true;},
  hardDrop:()=>{if(game.status!=='playing')return false;game.score+=8;game.pieces++;events.push(['drop']);return true;},
  holdPiece:()=>{if(game.status!=='playing')return false;game.hold='T';events.push(['hold']);return true;},
  pause:()=>{if(game.status==='playing'){game.status='paused';return true;}
   if(game.status==='paused'){game.status='playing';return true;}return false;},
  start:()=>{if(['ready','paused','over'].includes(game.status)){
   if(game.status==='over')game.reset();
   game.status='playing';return true;}return false;},
  reset:()=>{game.status='ready';game.pieces=0;game.lines=0;game.score=0;game.level=1;game.hold=null;events.push(['reset']);}
 };
 const highs=[];
 const scores={
  read:()=>highs,
  qualifies:(entries,score)=>score>=100,
  initials:raw=>String(raw).toUpperCase().slice(0,3),
  add:(entries,entry)=>[...entries,entry],
  save:(unused,entries)=>{events.push(['persistScore',entries.at(-1)]);return entries;}
 };
 const settings={
  readInitials:()=>'AAA',
  saveInitials:v=>events.push(['persistInitials',v]),
  toggleTheme:()=>events.push(['theme']),
  restoreDefaults:()=>events.push(['restoreFX']),
  setSetting:(key,value)=>events.push(['setting',key,value])
 };
 const screens={
  close:()=>events.push(['close']),
  openOptions:()=>events.push(['options']),
  openScores:()=>events.push(['scores']),
  requestRestart:()=>events.push(['restartPrompt']),
  openHighScoreEntry:()=>events.push(['entry'])
 };
 const initials={value:'xyz',blur:()=>events.push(['blur']),focus:()=>events.push(['focus'])};
 let lineClear=false;
 const actions=createActionController({
  game,scores,storage,settings,screens,
  getLineClearActive:()=>lineClear,
  clearLineClear:()=>{lineClear=false;events.push(['clearLine']);},
  markLayers:(...names)=>events.push(['dirty',...names]),
  invalidate:()=>events.push(['invalidate']),
  tone:(freq,len)=>events.push(['tone',freq,len]),
  getInitialsInput:()=>initials,
  onCopyDebug:()=>events.push(['debug']),
  onResetSettingsUI:()=>events.push(['resetSettingsUI']),
  now:()=>123456
 });
 return {actions,events,game,initials,scores,settings,screens,
  setLineClear:value=>{lineClear=value;},
  get lineClear(){return lineClear;}
 };
}

test('the existing seven gameplay action names remain unchanged',()=>{
 assert.deepEqual(GAME_ACTIONS,['left','right','cw','hard','hold','pause','start']);
});
test('ready-state gameplay input fails without drawing or sound',()=>{
 const h=harness();
 assert.equal(h.actions.perform('left'),false);
 assert.equal(h.actions.perform('hard'),false);
 assert.equal(h.actions.perform('unknown'),false);
 assert.deepEqual(h.events,[]);
});
test('a successful start marks the board, controls and popup exactly as before',()=>{
 const h=harness();
 assert.equal(h.actions.perform('start'),true);
 assert.equal(h.game.status,'playing');
 assert.deepEqual(h.events,[['dirty','board','controls'],['dirty','base'],['invalidate']]);
});
test('movement, rotation, holding and hard drop keep existing visual/sound effects',()=>{
 const h=harness('playing');
 assert.equal(h.actions.perform('left'),true);
 assert.deepEqual(h.events,[['move',-1],['dirty','board','controls'],['invalidate']]);
 h.events.length=0;
 h.actions.perform('cw');
 assert.deepEqual(h.events,[['rotate',1],['dirty','board','controls'],['tone',305,undefined],['invalidate']]);
 h.events.length=0;
 h.actions.perform('hold');
 assert.deepEqual(h.events,[['hold'],['dirty','board','controls'],['dirty','sidebar'],['tone',265,undefined],['invalidate']]);
 h.events.length=0;
 h.actions.perform('hard');
 assert.deepEqual(h.events,[['drop'],['dirty','board','controls'],['dirty','sidebar'],
  ['dirty','controls'],['tone',175,undefined],['invalidate']]);
});
test('line-clear lock blocks movement but allows pause/resume',()=>{
 const h=harness('playing');h.setLineClear(true);
 for(const action of ['left','right','cw','hard','hold'])
  assert.equal(h.actions.perform(action),false,action);
 assert.deepEqual(h.events,[]);
 assert.equal(h.actions.perform('pause'),true);
 assert.equal(h.game.status,'paused');
 assert.equal(h.actions.perform('pause'),true);
 assert.equal(h.game.status,'playing');
});
test('qualifying game-over opens high-score entry only once until reset',()=>{
 const h=harness('over');h.game.score=300;
 h.actions.onGameOver();
 assert.equal(h.initials.value,'AAA');
 assert.deepEqual(h.events,[['entry']]);
 h.actions.onGameOver();
 assert.equal(h.events.length,1);
 h.actions.restart();
 assert.equal(h.game.status,'playing');
 assert.deepEqual(h.events.slice(1),[
  ['clearLine'],['reset'],['dirty','board','sidebar','controls','base'],['close'],['invalidate']
 ]);
 h.game.status='over';h.game.score=300;
 h.actions.onGameOver();
 assert.equal(h.events.at(-1)[0],'entry');
});
test('non-qualifying game-over does not open entry dialog',()=>{
 const h=harness('over');h.game.score=25;
 h.actions.onGameOver();
 assert.deepEqual(h.events,[]);
});
test('high-score save owns the new leaderboard and maintains score metadata and ordering',()=>{
 const h=harness('over');h.game.score=998;h.game.lines=20;h.game.level=3;
 h.actions.saveScore();
 assert.equal(h.actions.highs.length,1);
 assert.deepEqual(h.actions.highs[0],{name:'XYZ',score:998,lines:20,level:3,at:123456});
 assert.deepEqual(h.events,[
  ['persistScore',{name:'XYZ',score:998,lines:20,level:3,at:123456}],
  ['persistInitials','XYZ'],['blur'],['dirty','sidebar'],['scores']
 ]);
});
test('settings and appearance actions keep their original event order',()=>{
 const h=harness();
 h.actions.setSetting('pieceGhost',false);
 assert.deepEqual(h.events,[['setting','pieceGhost',false],['dirty','board'],['invalidate']]);
 h.events.length=0;
 h.actions.setSetting('bloomStrength',33);
 assert.deepEqual(h.events,[['setting','bloomStrength',33],['invalidate']]);
 h.events.length=0;
 h.actions.dispatch('theme');
 assert.deepEqual(h.events,[['theme'],['dirty','base'],['invalidate']]);
 h.events.length=0;
 h.actions.dispatch('resetFX');
 assert.deepEqual(h.events,[['restoreFX'],['resetSettingsUI'],['dirty','base'],['invalidate']]);
});
test('menu button actions are routed once without taking ownership of screens',()=>{
 const h=harness();
 for(const [action,event] of [
  ['close','close'],['copyDebug','debug'],['options','options'],
  ['scores','scores'],['restart','restartPrompt'],
  ['skipScore','close'],['typeInitials','focus']
 ]){
  h.events.length=0;
  h.actions.dispatch(action);
  assert.equal(h.events.at(-1)[0],event,action);
 }
 h.events.length=0;
 for(const action of ['block','scroll','board','unknown'])
  assert.equal(h.actions.dispatch(action),undefined);
 assert.deepEqual(h.events,[]);
});
test('UI restart confirmation resets the game and closes menu',()=>{
 const h=harness('paused');h.setLineClear(true);
 h.actions.dispatch('restartYes');
 assert.equal(h.lineClear,false);
 assert.equal(h.game.status,'playing');
 assert.deepEqual(h.events,[
  ['clearLine'],['reset'],['dirty','board','sidebar','controls','base'],['close'],['invalidate']
 ]);
});
test('game over caused by hard drop still offers high-score entry',()=>{
 const h=harness('playing');h.game.score=100;
 h.game.hardDrop=()=>{h.game.status='over';return true;};
 h.actions.perform('hard');
 assert.equal(h.initials.value,'AAA');
 assert.equal(h.events.some(e=>e[0]==='entry'),true);
});
test('controller is isolated from UI, renderer, and event listener ownership',()=>{
 const h=harness();
 assert.equal(Object.isFrozen(h.actions),true);
 for(const forbidden of ['renderer','context','screen','layout','canvas'])
  assert.equal(forbidden in h.actions,false,forbidden);
});

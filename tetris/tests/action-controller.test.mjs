/* NOMAD V123: personal-best actions and gameplay regressions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionController,GAME_ACTIONS} from '../action-controller.js';

function harness(initialStatus='ready',canInteract=()=>true){
 const events=[],storage=new Map();
 const game={
  status:initialStatus,pieces:0,lines:0,score:0,level:0,hold:null,
  move:dx=>{if(game.status!=='playing')return false;events.push(['move',dx]);return true;},
  rotate:dir=>{if(game.status!=='playing')return false;events.push(['rotate',dir]);return true;},
  softDrop:()=>{if(game.status!=='playing')return false;game.score++;events.push(['soft']);return true;},
  holdPiece:()=>{if(game.status!=='playing')return false;game.hold='T';events.push(['hold']);return true;},
  pause:()=>{if(game.status==='playing'){game.status='paused';return true;}
   if(game.status==='paused'){game.status='playing';return true;}return false;},
  start:()=>{if(['ready','paused','over'].includes(game.status)){
   if(game.status==='over')game.reset();
   game.status='playing';return true;}return false;},
  reset:()=>{game.status='ready';game.pieces=0;game.lines=0;game.score=0;game.level=0;game.hold=null;events.push(['reset']);}
 };
 const scores={
  read:()=>null,
  update:(unused,current,entry)=>{
   if(entry.score<=(current?.score||0))return current;
   const saved={...entry};events.push(['persistScore',saved]);return saved;
  }
 };
 const settings={
  toggleTheme:()=>events.push(['theme']),
  restoreDefaults:()=>events.push(['restoreFX']),
  setSetting:(key,value)=>events.push(['setting',key,value])
 };
 const screens={
  close:()=>events.push(['close']),
  openOptions:()=>events.push(['options']),
  openScores:()=>events.push(['scores']),
  requestRestart:()=>events.push(['restartPrompt'])
 };
 let lineClear=false;
 const actions=createActionController({
  game,scores,storage,settings,screens,
  getLineClearActive:()=>lineClear,
  clearLineClear:()=>{lineClear=false;events.push(['clearLine']);},
  markLayers:(...names)=>events.push(['dirty',...names]),
  invalidate:()=>events.push(['invalidate']),
  tone:(freq,len)=>events.push(['tone',freq,len]),
  onCopyDebug:()=>events.push(['debug']),
  onResetSettingsUI:()=>events.push(['resetSettingsUI']),
  canInteract,now:()=>123456
 });
 return {actions,events,game,storage,scores,settings,screens,
  setLineClear:value=>{lineClear=value;},
  get lineClear(){return lineClear;}
 };
}

test('all seven gameplay actions remain unchanged',()=>{
 assert.deepEqual(GAME_ACTIONS,['left','right','cw','soft','hold','pause','start']);
});
test('ready input fails without side effects',()=>{
 const h=harness();
 assert.equal(h.actions.perform('left'),false);
 assert.equal(h.actions.perform('soft'),false);
 assert.deepEqual(h.events,[]);
});
test('starting play preserves the approved redraw notifications',()=>{
 const h=harness();
 assert.equal(h.actions.perform('start'),true);
 assert.deepEqual(h.events,[['dirty','board','controls'],['dirty','base'],['invalidate']]);
});
test('move, rotate and hold keep their previous effects',()=>{
 const h=harness('playing');
 h.actions.perform('left');
 assert.deepEqual(h.events,[['move',-1],['dirty','board','controls'],['invalidate']]);
 h.events.length=0;
 h.actions.perform('cw');
 assert.deepEqual(h.events,[['rotate',1],['dirty','board','controls'],['tone',305,undefined],['invalidate']]);
 h.events.length=0;
 h.actions.perform('hold');
 assert.deepEqual(h.events,[['hold'],['dirty','board','controls'],['dirty','sidebar'],['tone',265,undefined],['invalidate']]);
});
test('soft drop saves the best immediately without any initials or leaderboard',()=>{
 const h=harness('playing');h.game.lines=6;h.game.level=2;
 h.actions.perform('soft');
 assert.deepEqual(h.actions.best,{score:1,lines:6,level:2,at:123456});
 assert.deepEqual(h.events,[
  ['soft'],['dirty','board','controls'],['dirty','controls'],
  ['persistScore',{score:1,lines:6,level:2,at:123456}],['invalidate']
 ]);
 h.events.length=0;h.actions.observeScore();
 assert.deepEqual(h.events,[],'record must not be written again for ties');
});
test('gravity/line-clear updates can store one better record independently',()=>{
 const h=harness('playing');
 h.game.score=125;h.game.lines=12;h.game.level=1;
 assert.equal(h.actions.observeScore(),true);
 assert.deepEqual(h.actions.best,{score:125,lines:12,level:1,at:123456});
 h.events.length=0;h.game.score=100;
 assert.equal(h.actions.observeScore(),false);
 assert.deepEqual(h.events,[]);
 h.game.score=200;h.game.lines=14;
 assert.equal(h.actions.observeScore(),true);
 assert.equal(h.actions.best.lines,14);
});
test('game over saves any outstanding best once, with no initials prompt',()=>{
 const h=harness('over');h.game.score=300;h.game.lines=20;h.game.level=4;
 h.actions.onGameOver();
 assert.deepEqual(h.events,[['persistScore',{score:300,lines:20,level:4,at:123456}]]);
 h.actions.onGameOver();
 assert.equal(h.events.length,1);
 assert.equal('openHighScoreEntry' in h.screens,false);
});
test('restarting saves an unfinished record before resetting gameplay',()=>{
 const h=harness('paused');h.game.score=430;
 h.actions.restart();
 assert.equal(h.actions.best.score,430);
 assert.equal(h.game.score,0);
 assert.equal(h.game.status,'playing');
 assert.deepEqual(h.events,[
  ['persistScore',{score:430,lines:0,level:0,at:123456}],
  ['clearLine'],['reset'],['dirty','board','sidebar','controls','base'],['close'],['invalidate']
 ]);
});
test('line-clear flash still blocks movement but allows pause',()=>{
 const h=harness('playing');h.setLineClear(true);
 for(const a of ['left','right','cw','soft','hold'])assert.equal(h.actions.perform(a),false);
 assert.equal(h.actions.perform('pause'),true);
 assert.equal(h.game.status,'paused');
 assert.equal(h.actions.perform('pause'),true);
 assert.equal(h.game.status,'playing');
});
test('settings and appearance retain the same callbacks',()=>{
 const h=harness();
 h.actions.setSetting('pieceGhost',false);
 assert.deepEqual(h.events,[['setting','pieceGhost',false],['dirty','board'],['invalidate']]);
 h.events.length=0;h.actions.dispatch('theme');
 assert.deepEqual(h.events,[['theme'],['dirty','base'],['invalidate']]);
 h.events.length=0;h.actions.dispatch('resetFX');
 assert.deepEqual(h.events,[['restoreFX'],['resetSettingsUI'],['dirty','base'],['invalidate']]);
});
test('menu actions retain navigation, but score entry and initials commands are gone',()=>{
 const h=harness();
 for(const [action,event] of [['close','close'],['copyDebug','debug'],
  ['options','options'],['scores','scores'],['restart','restartPrompt']]){
  h.events.length=0;h.actions.dispatch(action);
  assert.equal(h.events.at(-1)[0],event);
 }
 h.events.length=0;
 for(const action of ['skipScore','saveScore','typeInitials','block','scroll','board','unknown'])
  h.actions.dispatch(action);
 assert.deepEqual(h.events,[]);
});
test('context-loss protection still blocks invisible actions',()=>{
 const h=harness('paused',()=>false);
 assert.equal(h.actions.perform('pause'),false);
 assert.equal(h.actions.perform('soft'),false);
 h.actions.dispatch('restartYes');h.actions.dispatch('options');
 h.actions.dispatch('theme');h.actions.setSetting('bloomStrength',35);
 assert.deepEqual(h.events,[]);
});
test('context-loss safety pause is still allowed during interruption',()=>{
 const h=harness('playing',()=>false);
 assert.equal(h.actions.perform('pause'),true);
 assert.equal(h.game.status,'paused');
 assert.equal(h.actions.perform('pause'),false);
 assert.deepEqual(h.events,[['dirty','board','controls'],['dirty','base'],['invalidate']]);
});
test('controller remains isolated from visual and DOM ownership',()=>{
 const h=harness();assert.equal(Object.isFrozen(h.actions),true);
 for(const forbidden of ['renderer','context','screen','layout','canvas','initialsInput'])
  assert.equal(forbidden in h.actions,false);
});

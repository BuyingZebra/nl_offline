/* NOMAD V093 — real-subsystem integration, no renderer or mock game rules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createActionController} from '../session.js';
import {createScreenManager} from '../session.js';
import {createSettingsManager,STORAGE_KEYS} from '../session.js';
import {createAppLifecycle,runCleanupTasks} from '../platform.js';
import {createGraphicsHealth} from '../platform.js';
const require=createRequire(import.meta.url);
const Core=require('../core.js');
const Scores=require('../scores.js');

function session(){
 const saved=new Map(),transitions=[],tones=[],layers=[],events=[],cleaned=[];
 const storage={
  getItem:key=>saved.has(key)?saved.get(key):null,
  setItem:(key,value)=>saved.set(key,String(value))
 };
 const settings=createSettingsManager(storage);
 const game=new Core.Game(()=>.5);
 let clearActive=false,actions,lifecycle;
 const canvasListeners=new Map();
 const canvas={
  addEventListener:(type,fn)=>canvasListeners.set(type,fn),
  removeEventListener:(type,fn)=>{
   assert.equal(canvasListeners.get(type),fn);
   canvasListeners.delete(type);
  }
 };
 const graphics=createGraphicsHealth({
  canvas,
  onLost:()=>{
   if(game.status==='playing')actions.perform('pause');
   cleaned.push('input-cancelled-on-context-loss');
  },
  onRestored:()=>{layers.push('graphics-restored');}
 });
 graphics.attach();
 const emit=(type)=>{
  let prevented=false;
  canvasListeners.get(type)?.({preventDefault(){prevented=true;}});
  return prevented;
 };
 const screens=createScreenManager({
  getGameStatus:()=>game.status,
  pauseGame:()=>actions.perform('pause'),
  onChange:(from,to)=>transitions.push({from,to,status:game.status})
 });
 const unsubscribe=game.onEvent(event=>{
  events.push(event);
  if(event.type==='lines-cleared'&&event.status==='playing')
   clearActive=true;
 });
 actions=createActionController({
  game,scores:Scores,storage,settings,screens,
  getLineClearActive:()=>clearActive,
  clearLineClear:()=>{clearActive=false;},
  markLayers:(...names)=>layers.push(...names),
  invalidate:()=>layers.push('invalidated'),
  tone:(freq)=>tones.push(freq),
  onCopyDebug:()=>layers.push('debug'),
  onResetSettingsUI:()=>layers.push('settings-ui-reset'),
  canInteract:()=>graphics.status==='ready'&&lifecycle?.canWork!==false,
  now:()=>5000
 });
 lifecycle=createAppLifecycle({
  onSuspend:()=>{
   // Matches renderer: lifecycle sets suspended BEFORE calling the callback.
   if(game.status==='playing'){
    game.pause();
    layers.push('base','board','controls');
   }
   cleaned.push('input-cancelled-on-hide');
  },
  onResume:()=>{layers.push('resized','redrawn');},
  onDispose:()=>runCleanupTasks([
   ['game-events',()=>{unsubscribe();cleaned.push('game-events');}],
   ['graphics',()=>{graphics.detach();cleaned.push('graphics');}],
   ['input',()=>cleaned.push('input')],
   ['resources',()=>cleaned.push('resources')]
  ])
 });
 return {game,storage,saved,settings,actions,screens,lifecycle,graphics,
  emit,canvasListeners,events,tones,transitions,layers,cleaned,
  get clearActive(){return clearActive;},
  clearFlash(){clearActive=false;}
 };
}

test('real game, screen manager and settings preserve pause-before-options and audio',()=>{
 const s=session();
 assert.equal(s.actions.perform('start'),true);
 assert.equal(s.game.status,'playing');
 assert.equal(s.actions.perform('soft'),true);
 s.game.current.y=s.game.ghostY();s.game.lockPiece();
 assert.equal(s.game.pieces,1);
 assert.equal(s.events.filter(e=>e.type==='piece-locked').length,1);
 assert.equal(s.game.score,1,'manually soft-dropped row scores one point');
 s.actions.dispatch('options');
 assert.equal(s.game.status,'paused');
 assert.equal(s.screens.isOptions,true);
 assert.equal(s.transitions.at(-1).status,'paused');
 s.actions.setSetting('bloomStrength',33);
 s.actions.setSetting('sound',false);
 s.actions.setSetting('pieceGhost',false);
 assert.equal(s.settings.effects.bloomStrength,.33);
 assert.equal(s.saved.get(STORAGE_KEYS.sound),'no');
 assert.equal(s.saved.get(STORAGE_KEYS.pieceGhost),'no');
 s.actions.dispatch('close');
 assert.equal(s.screens.hasModal,false);
 assert.equal(s.game.status,'paused','menu closing must not silently resume gameplay');
 const reopened=createSettingsManager(s.storage);
 assert.equal(reopened.effects.bloomStrength,.33);
 assert.equal(reopened.soundOn,false);
 s.lifecycle.dispose();
});

test('line clear event drives input lock and score/level updates without engine overrides',()=>{
 const s=session();s.actions.perform('start');
 s.game.lines=9;s.game.level=0;
 s.game.board=Array.from({length:20},()=>Array(10).fill(0));
 for(let x=0;x<10;x++)s.game.board[19][x]=(x===4||x===5)?0:'Z';
 s.game.current=s.game.piece('O');s.game.current.y=18;
 s.game.current.y=s.game.ghostY();s.game.lockPiece();
 assert.equal(s.game.lines,10);
 assert.equal(s.game.level,1);
 const last=s.events.filter(e=>['piece-locked','lines-cleared','level-changed'].includes(e.type));
 assert.deepEqual(last.map(e=>e.type),['piece-locked','lines-cleared','level-changed']);
 assert.deepEqual(last[1].rows,[19]);
 assert.equal(last[1].board[19][4],'O');
 assert.equal(s.clearActive,true);
 assert.equal(s.actions.perform('left'),false,'flash blocks input');
 assert.equal(s.actions.perform('pause'),true,'flash must still permit pause');
 assert.equal(s.game.status,'paused');
 s.clearFlash();
 assert.equal(s.actions.perform('pause'),true);
 assert.equal(s.game.status,'playing');
 s.lifecycle.dispose();
});

test('background, bfcache and WebGL interruption never resume gameplay invisibly',()=>{
 const s=session();s.actions.perform('start');
 assert.equal(s.lifecycle.suspend('visibility'),true);
 assert.equal(s.game.status,'paused','background must pause even after input guard activates');
 assert.equal(s.actions.perform('soft'),false);
 assert.equal(s.actions.perform('start'),false);
 assert.equal(s.lifecycle.pageHide(true),false,'repeated hidden event is inert');
 assert.equal(s.lifecycle.pageShow(true),true);
 assert.equal(s.game.status,'paused');
 assert.ok(s.layers.includes('redrawn'));
 assert.equal(s.actions.perform('start'),true);
 assert.equal(s.game.status,'playing');
 assert.equal(s.emit('webglcontextlost'),true);
 assert.equal(s.game.status,'paused');
 assert.equal(s.actions.perform('soft'),false);
 s.emit('webglcontextrestored');
 assert.equal(s.graphics.status,'recovering');
 assert.equal(s.actions.perform('start'),false);
 assert.equal(s.graphics.rendered(),true);
 assert.equal(s.actions.perform('start'),true);
 assert.equal(s.game.status,'playing');
 assert.equal(s.lifecycle.pageHide(false),true);
 assert.equal(s.lifecycle.status,'disposed');
 assert.equal(s.actions.perform('soft'),false);
 assert.equal(s.canvasListeners.size,0);
 assert.deepEqual(s.cleaned.slice(-4),['game-events','graphics','input','resources']);
 assert.equal(s.lifecycle.dispose(),false);
});

test('one device-local personal record is saved on game over and survives restart',()=>{
 const s=session();s.actions.perform('start');
 s.game.score=1000;s.game.lines=18;s.game.level=2;
 s.game.board[0][4]='Z';
 s.game.spawn('O');
 assert.equal(s.game.status,'over');
 s.actions.onGameOver();
 assert.equal(s.screens.active,null,'no score-entry overlay');
 assert.deepEqual(Scores.read(s.storage),{score:1000,lines:18,level:2,at:5000});
 assert.equal(s.saved.has(Scores.OLD_TOP_FIVE),false);
 s.actions.restart();
 assert.equal(s.game.status,'playing');
 assert.equal(s.game.score,0);
 assert.equal(s.screens.hasModal,false);
 assert.equal(Scores.read(s.storage).score,1000);
 s.actions.dispatch('pause');
 s.actions.dispatch('scores');
 assert.equal(s.screens.isScores,true);
 s.lifecycle.dispose();
});

/* Screen transitions, settings and game actions. */
import {normalizePersistenceMs} from './crt.js?v180';

/* V073 — user-approved display defaults taken from the October 26 screenshot.
 * The settings schema and slider ranges are unchanged.
 * Saved preferences still override defaults; Restore Defaults reapplies these.
 */
export const DEFAULT_EFFECTS=Object.freeze({phosphor:true,bloom:true,bloomStrength:.22,
 ghost:false,ghostX:2,ghostY:0,ghostStrength:22,
 scanlines:true,scanlinePreset:'aperture',scanlineOpacity:49,
 softness:false,softnessStrength:.64,softnessRadius:3,
 vignette:true,vignetteAmount:.57,
 persistence:true,persistenceMs:120});
export const DISPLAY_EFFECTS=[
 {id:'phosphor',title:'PHOSPHOR COLOR',toggle:'phosphor'},
 {id:'persistence',title:'PHOSPHOR RESPONSE',toggle:'persistence',
  sliders:[['DECAY','persistenceMs',10,120,10,'ms']]},
 {id:'scanlines',title:'CRT SCANLINES',toggle:'scanlines',pattern:true,
  sliders:[['','scanlineOpacity',0,100,1,'%']]},
 {id:'vignette',title:'SCREEN VIGNETTE',toggle:'vignette',
  sliders:[['','vignetteAmount',0,100,1,'%']]},
 {id:'bloom',title:'PHOSPHOR BLOOM',toggle:'bloom',
  sliders:[['','bloomStrength',0,100,1,'%']]},
 {id:'ghost',title:'SIGNAL GHOSTING',toggle:'ghost',
  sliders:[['X','ghostX',-32,32,1,'px'],
   ['Y','ghostY',-32,32,1,'px'],
   ['','ghostStrength',0,100,1,'%']]},
 {id:'softness',title:'EDGE SOFTNESS',toggle:'softness',
  sliders:[['STRENGTH','softnessStrength',0,100,1,'%'],
   ['RADIUS','softnessRadius',0,10,.5,'px']]},
 {id:'piece',title:'GHOST PIECE',toggle:'pieceGhost'},
 {id:'sound',title:'SOUND',toggle:'sound'}
];
export function scanlineChoices(presets){
 return [{id:'off',name:'OFF'},...presets.map(p=>({id:p.id,name:p.name}))];
}
export function effectSettingValue(key,fx,{ghost,sound}){
 if(key==='pieceGhost')return ghost;
 if(key==='sound')return sound;
 if(['softnessStrength','vignetteAmount','bloomStrength'].includes(key))
  return Math.round(fx[key]*100);
 return fx[key];
}
export function effectSettingToStored(key,value,clamp=(v,a,b)=>Math.max(a,Math.min(b,v))){
 return ['softnessStrength','vignetteAmount','bloomStrength'].includes(key)?
  clamp(value/100,0,1):value;
}

/* NOMAD Tetris V085 — Settings Manager.
 * Owns the existing user preferences and persistence; no rendering or UI
 * dependencies. Historical storage keys and reset behaviour are preserved.
 */

export const STORAGE_KEYS=Object.freeze({
 effects:'fieldAtlasThreeV027FX01',
 pieceGhost:'fieldAtlasTetrisGhost',
 sound:'fieldAtlasTetrisSound',
 theme:'fieldAtlasThemeV06',
 initials:'fieldAtlasTetrisInitials'
});

export function createSettingsManager(storage){
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const read=(key,fallback)=>{
  try{return storage?.getItem(key)??fallback;}catch(e){return fallback;}
 };
 const write=(key,value)=>{
  try{storage?.setItem(key,String(value));}catch(e){}
 };
 let effects={...DEFAULT_EFFECTS};
 try{
  const saved=JSON.parse(read(STORAGE_KEYS.effects,'null'));
  if(saved&&typeof saved==='object'){
   for(const [key,value] of Object.entries(DEFAULT_EFFECTS)){
    if(typeof saved[key]===typeof value)effects[key]=saved[key];
   }
  }
 }catch(e){}
 // Match the existing V084 migration of out-of-range historical bloom values.
 effects.bloomStrength=clamp(Number(effects.bloomStrength)||0,0,1);
 effects.persistenceMs=normalizePersistenceMs(effects.persistenceMs);
 let pieceGhost=read(STORAGE_KEYS.pieceGhost,'yes')!=='no';
 let soundOn=read(STORAGE_KEYS.sound,'yes')!=='no';
 // Restore the original green/amber-only phosphor selection. A saved
 // blue preference from V160 gracefully falls back to green.
 let theme=read(STORAGE_KEYS.theme,'green')==='amber'?'amber':'green';

 function persistEffects(){
  write(STORAGE_KEYS.effects,JSON.stringify(effects));
 }
 function settingValue(key){
  return effectSettingValue(key,effects,{ghost:pieceGhost,sound:soundOn});
 }
 function setSetting(key,value){
  if(key==='pieceGhost'){
   pieceGhost=Boolean(value);
   write(STORAGE_KEYS.pieceGhost,pieceGhost?'yes':'no');
   return;
  }
  if(key==='sound'){
   soundOn=Boolean(value);
   write(STORAGE_KEYS.sound,soundOn?'yes':'no');
   return;
  }
  if(key==='persistenceMs')value=normalizePersistenceMs(value);
  if(Object.prototype.hasOwnProperty.call(DEFAULT_EFFECTS,key)){
   effects[key]=effectSettingToStored(key,value,clamp);
   persistEffects();
  }
 }
 function chooseScanline(id){
  effects.scanlines=id!=='off';
  if(id!=='off')effects.scanlinePreset=id;
  persistEffects();
 }
 function toggleTheme(){
  theme=theme==='green'?'amber':'green';
  write(STORAGE_KEYS.theme,theme);
  return theme;
 }
 function restoreDefaults(){
  effects={...DEFAULT_EFFECTS};
  persistEffects();
  pieceGhost=true;soundOn=true;
  write(STORAGE_KEYS.pieceGhost,'yes');
  write(STORAGE_KEYS.sound,'yes');
  // The phosphor theme is deliberately not reset in the historical behaviour.
 }
 return Object.freeze({
  get effects(){return effects;},
  get pieceGhost(){return pieceGhost;},
  get soundOn(){return soundOn;},
  get theme(){return theme;},
  settingValue,setSetting,chooseScanline,toggleTheme,restoreDefaults,
  readInitials:()=>read(STORAGE_KEYS.initials,'AAA'),
  saveInitials:value=>write(STORAGE_KEYS.initials,value)
 });
}

/* NOMAD Tetris V086 — screen/navigation state, no rendering dependencies.
 * The Game object continues to own ready/playing/paused/over. This controller
 * owns only which menu is visible and when navigation requests pause gameplay.
 */
export const SCREENS=Object.freeze({
 GAME:'game',
 OPTIONS:'options',
 SCORES:'scores'
});

const MODALS=new Set([
 null,SCREENS.OPTIONS,SCREENS.SCORES
]);

export function createScreenManager({getGameStatus,pauseGame,onChange}){
 if(typeof getGameStatus!=='function'||typeof pauseGame!=='function'||
    typeof onChange!=='function')throw new TypeError('Screen Manager requires lifecycle callbacks');
 let active=null;

 // Always announce valid transitions, even when opening the same screen again:
 // the existing UI resets menu scroll, picker state and pointer capture each time.
 function open(next){
  if(!MODALS.has(next))return false;
  const previous=active;
  active=next;
  onChange(previous,next);
  return true;
 }
 function openWithPause(next){
  // Preserve V085: entering either menu pauses an active game first.
  if(getGameStatus()==='playing')pauseGame();
  return open(next);
 }
 return Object.freeze({
  get active(){return active;},
  get screen(){return active??SCREENS.GAME;},
  get hasModal(){return active!==null;},
  get isScores(){return active===SCREENS.SCORES;},
  get isOptions(){return active===SCREENS.OPTIONS;},
  get paintsModalLayer(){return active!==null&&active!==SCREENS.SCORES;},
  close:()=>open(null),
  openOptions:()=>openWithPause(SCREENS.OPTIONS),
  openScores:()=>openWithPause(SCREENS.SCORES)
 });
}

/* NOMAD Tetris V123 — application actions and event coordination.
 * No Canvas, WebGL, browser events, input geometry, or layout ownership.
 * This module maps user/game actions to the existing game, screen, settings
 * and score services through explicit adapters. V087 behaviour is retained.
 */
export const GAME_ACTIONS=Object.freeze([
 'left','right','cw','soft','hold','pause','start'
]);

const BLOCKED_DURING_LINE_CLEAR=new Set([
 'left','right','cw','soft','hold'
]);

export function createActionController({
 game,scores,storage,persistScore,settings,screens,
 getLineClearActive,clearLineClear,markLayers,invalidate,tone,
 onCopyDebug,onResetSettingsUI,onTerminalEvent=()=>{},
 canInteract=()=>true,now=()=>Date.now()
}){
 if(!game||!scores||!settings||!screens||
    typeof getLineClearActive!=='function'||
    typeof clearLineClear!=='function'||typeof markLayers!=='function'||
    typeof invalidate!=='function'||typeof tone!=='function'||
    typeof onCopyDebug!=='function'||typeof onResetSettingsUI!=='function')
  throw new TypeError('Application Actions require game, screen and UI adapters');

 let best=scores.read(storage);
 function syncBest(){
  if(!persistScore)return;
  void persistScore(best).then(saved=>{
   if(!saved||(best&&saved.score<=best.score))return;
   best=saved;
   if(screens.isScores){
    markLayers('base');
    invalidate();
   }
  });
 }
 syncBest();

 // Save new personal records as soon as the score improves, rather than
 // requiring initials or waiting for GAME OVER. Ties keep prior metadata.
 function observeScore(){
  const previous=best;
  best=scores.update(persistScore?null:storage,best,{
   score:game.score,lines:game.lines,level:game.level,at:now()
  });
  if(best!==previous)syncBest();
  return best!==previous;
 }
 function onGameOver(){
  if(game.status==='over')observeScore();
 }

 function perform(type){
  // During GPU interruption permit only the transition from playing to paused.
  // Do not allow invisible controls to restart or resume the game.
  if(!canInteract()&&!(type==='pause'&&game.status==='playing'))return false;
  // Preserve line-clear input lock: PAUSE is still permitted during the flash.
  if(getLineClearActive()&&game.status==='playing'&&
     BLOCKED_DURING_LINE_CLEAR.has(type))return false;
  const was=game.status,pieces=game.pieces,lines=game.lines,
   score=game.score,held=game.hold;
  let ok=false;
  if(type==='left')ok=game.move(-1);
  else if(type==='right')ok=game.move(1);
  else if(type==='cw')ok=game.rotate(1);
  else if(type==='soft')ok=game.softDrop();
  else if(type==='hold')ok=game.holdPiece();
  else if(type==='pause')ok=game.pause();
  else if(type==='start')ok=game.start();
  if(ok){
   markLayers('board','controls');
   if(game.pieces!==pieces||game.hold!==held)markLayers('sidebar');
   // SCORE/LEVEL/LINES now live in the independent sidebar HUD.
   // Updating a numeric readout must never invalidate the button artwork.
   if(game.score!==score||game.lines!==lines)markLayers('sidebar');
   if(game.status!==was)markLayers('base');
   if(game.lines>lines)tone(610,.14);
   else if(game.pieces>pieces)tone(175);
   else if(type==='cw')tone(305);
   else if(type==='hold')tone(265);
   if(game.score!==score)observeScore();
   if(type==='start')onTerminalEvent(was==='paused'?'GAME: RESUMED':'GAME: SESSION STARTED',
    was==='paused'?'GM: RESUMED':'GM: START');
   if(type==='pause')onTerminalEvent(game.status==='paused'?'GAME: PAUSED':'GAME: RESUMED',
    game.status==='paused'?'GM: PAUSED':'GM: RESUMED');
   if(type==='hold')onTerminalEvent('INPUT: HOLD PIECE '+game.hold,'IN: HOLD '+game.hold);
   onGameOver();invalidate();
  }
  return ok;
 }

 function restart(){
  if(!canInteract())return;
  observeScore();
  clearLineClear();
  game.reset();game.start();
  onTerminalEvent('GAME: SESSION RESTARTED','GM: RESTART');
  markLayers('board','sidebar','controls','base');
  screens.close();invalidate();
 }

 function setSetting(key,value){
  if(!canInteract())return;
  settings.setSetting(key,value);
  if(key==='pieceGhost')markLayers('board');
  invalidate();
 }

 function dispatch(action){
  if(!canInteract())return;
  if(action==='block'||action==='scroll'||action==='board')return;
  if(action==='close'){screens.close();return;}
  if(action==='copyDebug'){onCopyDebug();return;}
  if(action==='options'){screens.openOptions();return;}
  if(action==='scores'){
   const saved=scores.read(storage);
   if(saved&&(!best||saved.score>best.score))best=saved;
   syncBest();
   screens.openScores();return;
  }
  if(action==='theme'){
   settings.toggleTheme();markLayers('base');invalidate();return;
  }
  if(action==='restart'){restart();return;}
  if(action==='resetFX'){
   settings.restoreDefaults();onResetSettingsUI();
   markLayers('base');invalidate();return;
  }
  if(GAME_ACTIONS.includes(action))perform(action);
 }

 return Object.freeze({
  perform,dispatch,restart,observeScore,onGameOver,setSetting,
  get best(){return best;}
 });
}

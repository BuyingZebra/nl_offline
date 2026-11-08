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
 game,scores,storage,settings,screens,
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

 // Save new personal records as soon as the score improves, rather than
 // requiring initials or waiting for GAME OVER. Ties keep prior metadata.
 function observeScore(){
  const previous=best;
  best=scores.update(storage,best,{
   score:game.score,lines:game.lines,level:game.level,at:now()
  });
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
   if(game.score!==score||game.lines!==lines)markLayers('controls');
   if(game.status!==was)markLayers('base');
   if(game.lines>lines)tone(610,.14);
   else if(game.pieces>pieces)tone(175);
   else if(type==='cw')tone(305);
   else if(type==='hold')tone(265);
   if(game.score!==score)observeScore();
   if(type==='start')onTerminalEvent(was==='paused'?'GAME: RESUMED':'GAME: SESSION STARTED',
    was==='paused'?'RESUMED':'SESSION STARTED');
   if(type==='pause')onTerminalEvent(game.status==='paused'?'GAME: PAUSED':'GAME: RESUMED',
    game.status==='paused'?'PAUSED':'RESUMED');
   if(type==='hold')onTerminalEvent('INPUT: HOLD PIECE '+game.hold,'HOLD: '+game.hold);
   onGameOver();invalidate();
  }
  return ok;
 }

 function restart(){
  if(!canInteract())return;
  observeScore();
  clearLineClear();
  game.reset();game.start();
  onTerminalEvent('GAME: SESSION RESTARTED','RESTARTED');
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
  if(action==='scores'){screens.openScores();return;}
  if(action==='theme'){
   settings.toggleTheme();markLayers('base');invalidate();return;
  }
  if(action==='restart'){screens.requestRestart();return;}
  if(action==='restartYes'){restart();return;}
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

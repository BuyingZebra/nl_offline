/* NOMAD Tetris V088 — application actions and event coordination.
 * No Canvas, WebGL, browser events, input geometry, or layout ownership.
 * This module maps user/game actions to the existing game, screen, settings
 * and score services through explicit adapters. V087 behaviour is retained.
 */
export const GAME_ACTIONS=Object.freeze([
 'left','right','cw','hard','hold','pause','start'
]);

const BLOCKED_DURING_LINE_CLEAR=new Set([
 'left','right','cw','hard','hold'
]);

export function createActionController({
 game,scores,storage,settings,screens,
 getLineClearActive,clearLineClear,markLayers,invalidate,tone,
 getInitialsInput,onCopyDebug,onResetSettingsUI,
 now=()=>Date.now()
}){
 if(!game||!scores||!settings||!screens||
    typeof getLineClearActive!=='function'||
    typeof clearLineClear!=='function'||typeof markLayers!=='function'||
    typeof invalidate!=='function'||typeof tone!=='function'||
    typeof getInitialsInput!=='function'||
    typeof onCopyDebug!=='function'||typeof onResetSettingsUI!=='function')
  throw new TypeError('Application Actions require game, screen and UI adapters');

 let highs=scores.read(storage),overOffered=false;

 function onGameOver(){
  if(game.status!=='over'||overOffered)return;
  overOffered=true;
  if(scores.qualifies(highs,game.score)){
   getInitialsInput().value=settings.readInitials();
   screens.openHighScoreEntry();
  }
 }

 function perform(type){
  // Preserve line-clear input lock: PAUSE is still permitted during the flash.
  if(getLineClearActive()&&game.status==='playing'&&
     BLOCKED_DURING_LINE_CLEAR.has(type))return false;
  const was=game.status,pieces=game.pieces,lines=game.lines,
   score=game.score,held=game.hold;
  let ok=false;
  if(type==='left')ok=game.move(-1);
  else if(type==='right')ok=game.move(1);
  else if(type==='cw')ok=game.rotate(1);
  else if(type==='hard')ok=game.hardDrop();
  else if(type==='hold')ok=game.holdPiece();
  else if(type==='pause')ok=game.pause();
  else if(type==='start')ok=game.start();
  if(ok){
   markLayers('board','controls');
   if(game.pieces!==pieces||game.hold!==held)markLayers('sidebar');
   if(game.score!==score||game.lines!==lines)markLayers('controls');
   if(game.status!==was)markLayers('base');
   if(was==='over'&&game.status==='playing')overOffered=false;
   if(game.lines>lines)tone(610,.14);
   else if(game.pieces>pieces)tone(175);
   else if(type==='cw')tone(305);
   else if(type==='hard')tone(185);
   else if(type==='hold')tone(265);
   onGameOver();invalidate();
  }
  return ok;
 }

 function restart(){
  clearLineClear();
  game.reset();game.start();
  markLayers('board','sidebar','controls','base');
  overOffered=false;
  screens.close();invalidate();
 }

 function saveScore(){
  const input=getInitialsInput(),tag=scores.initials(input.value);
  highs=scores.save(storage,scores.add(highs,{
   name:tag,score:game.score,lines:game.lines,level:game.level,at:now()
  }));
  settings.saveInitials(tag);
  input.blur();markLayers('sidebar');screens.openScores();
 }

 function setSetting(key,value){
  settings.setSetting(key,value);
  if(key==='pieceGhost')markLayers('board');
  invalidate();
 }

 function dispatch(action){
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
  if(action==='skipScore'){getInitialsInput().blur();screens.close();return;}
  if(action==='saveScore'){saveScore();return;}
  if(action==='typeInitials'){getInitialsInput().focus();return;}
  if(action==='resetFX'){
   settings.restoreDefaults();onResetSettingsUI();
   markLayers('base');invalidate();return;
  }
  if(GAME_ACTIONS.includes(action))perform(action);
 }

 return Object.freeze({
  perform,dispatch,restart,saveScore,onGameOver,setSetting,
  get highs(){return highs;}
 });
}

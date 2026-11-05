/* NOMAD Tetris V086 — screen/navigation state, no rendering dependencies.
 * The Game object continues to own ready/playing/paused/over. This controller
 * owns only which menu is visible and when navigation requests pause gameplay.
 */
export const SCREENS=Object.freeze({
 GAME:'game',
 OPTIONS:'options',
 SCORES:'scores',
 RESTART:'restart',
 ENTRY:'entry'
});

const MODALS=new Set([
 null,SCREENS.OPTIONS,SCREENS.SCORES,SCREENS.RESTART,SCREENS.ENTRY
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
  openScores:()=>openWithPause(SCREENS.SCORES),
  requestRestart:()=>getGameStatus()==='paused'&&open(SCREENS.RESTART),
  openHighScoreEntry:()=>open(SCREENS.ENTRY)
 });
}

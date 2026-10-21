/* Tetris V058 — visual state guard, independent of FPS and gravity timers.
 * A renderer should only upload Canvas2D pixels when displayed game data
 * actually changes. Capture before ticking; compare after ticking.
 */
export function captureGameVisualState(game){
 const p=game.current;
 return {piece:p,x:p?.x,y:p?.y,rotation:p?.rotation,kind:p?.kind,
  pieces:game.pieces,lines:game.lines,score:game.score,level:game.level,
  hold:game.hold,status:game.status};
}
export function gameVisualStateChanged(before,game){
 const p=game.current;
 return before.piece!==p||before.x!==p?.x||before.y!==p?.y||
  before.rotation!==p?.rotation||before.kind!==p?.kind||
  before.pieces!==game.pieces||before.lines!==game.lines||
  before.score!==game.score||before.level!==game.level||
  before.hold!==game.hold||before.status!==game.status;
}
export function flashPhase(elapsed,interval=72){
 return Math.floor(elapsed/interval)%2;
}

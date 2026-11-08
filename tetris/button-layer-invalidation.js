/* NOMAD V166 — isolate button source invalidation by visible HUD layer.
 * The fullscreen base canvas includes the header and the board-status popup.
 * Its duplicated deck artwork is hidden by the opaque cropped controls layer.
 * Game-deck button excitation therefore needs ONLY that cropped texture.
 * Both prior and current silhouettes are considered so the last afterglow
 * frame is always cleared when a released button disappears.
 * Pure CSS-pixel geometry; no Canvas2D, WebGL, or gameplay dependency.
 */
export function buttonFeedbackLayers(previous=[],current=[],layout=null){
 const deck=layout&&Number.isFinite(layout.dx)&&Number.isFinite(layout.dy)&&
  Number.isFinite(layout.dw)&&Number.isFinite(layout.dh)&&
  layout.dw>0&&layout.dh>0?layout:null;
 let base=false,controls=false;
 const inDeck=b=>deck&&[b.x,b.y,b.w,b.h].every(Number.isFinite)&&
  b.w>0&&b.h>0&&
  b.x>=deck.dx-.01&&b.y>=deck.dy-.01&&
  b.x+b.w<=deck.dx+deck.dw+.01&&
  b.y+b.h<=deck.dy+deck.dh+.01;
 for(const b of [...previous,...current]){
  if(inDeck(b))controls=true;
  else base=true; // header, board popup, or ambiguous geometry
  if(base&&controls)break;
 }
 return [...(base?['base']:[]),...(controls?['controls']:[])];
}

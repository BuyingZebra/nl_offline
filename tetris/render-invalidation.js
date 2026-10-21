/* V063 — the single owner of rendering dirtiness and attribution.
 * No canvas, DOM, game engine, or Three.js dependencies.
 * A mark schedules work; consume(layer) acknowledges one layer repaint.
 */
export function createRenderInvalidation(initial=['base','board','sidebar','controls']){
 const layers=new Set(['base','board','sidebar','controls']);
 const pending=new Set(initial.filter(x=>layers.has(x)));
 const reasons=new Set(['startup']);
 let renderNeeded=true;
 function mark(...names){
  for(const n of names){
   if(!layers.has(n))throw Error('Unknown render layer: '+n);
   pending.add(n);
  }
  renderNeeded=true;
 }
 function reason(name='input'){
  reasons.add(name);
  renderNeeded=true;
 }
 function needs(layer){return pending.has(layer);}
 function consume(layer){
  if(!pending.has(layer))return false;
  pending.delete(layer);
  // A paint can mark (then consume) a layer after beginRender(). A fully
  // serviced frame must not request a second no-op composition.
  if(pending.size===0&&reasons.size===0)renderNeeded=false;
  return true;
 }
 function needsRender(){return renderNeeded;}
 function beginRender(){
  const why=[...reasons];
  reasons.clear();renderNeeded=false;
  return why;
 }
 function snapshot(){return Object.freeze({pending:[...pending],reasons:[...reasons],renderNeeded});}
 return Object.freeze({mark,reason,needs,consume,needsRender,beginRender,snapshot});
}

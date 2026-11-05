/* NOMAD Tetris V089 — WebGL context lifecycle and bounded diagnostics.
 * Three.js still owns the WebGLRenderer and its internal context recreation.
 * This observer prevents game activity while the context is unavailable and
 * reports recovery outcomes without storage, network calls or visible UI.
 */
export function createGraphicsHealth({
 canvas,onLost,onRestored,now=()=>Date.now(),historyLimit=8
}){
 if(!canvas||typeof canvas.addEventListener!=='function'||
    typeof canvas.removeEventListener!=='function'||
    typeof onLost!=='function'||typeof onRestored!=='function')
  throw new TypeError('Graphics health requires a canvas and lifecycle callbacks');

 let state='ready',attached=false,losses=0,restores=0,failures=0;
 let lastError=null,lostSince=null;
 const history=[];
 function record(type,detail){
  const event={type,at:new Date(now()).toISOString()};
  if(detail)event.detail=String(detail).slice(0,240);
  history.push(event);
  if(history.length>historyLimit)history.shift();
 }
 function recordFailure(error){
  failures++;
  lastError=String(error?.message||error).slice(0,240);
  record('render-error',lastError);
  if(state==='recovering')state='failed';
 }
 function contextLost(event){
  // Calling preventDefault is required by WebGL to allow restoration.
  event?.preventDefault?.();
  if(state==='lost')return;
  losses++;state='lost';lostSince=now();
  record('context-lost');
  try{onLost();}catch(error){recordFailure(error);}
 }
 function contextRestored(){
  if(state!=='lost')return;
  restores++;state='recovering';lostSince=null;
  record('context-restored');
  try{onRestored();}catch(error){
   recordFailure(error);
  }
 }
 function rendered(){
  if(state!=='recovering')return false;
  state='ready';record('frame-recovered');
  return true;
 }
 function attach(){
  if(attached)return false;
  canvas.addEventListener('webglcontextlost',contextLost,false);
  canvas.addEventListener('webglcontextrestored',contextRestored,false);
  attached=true;return true;
 }
 function detach(){
  if(!attached)return false;
  canvas.removeEventListener('webglcontextlost',contextLost,false);
  canvas.removeEventListener('webglcontextrestored',contextRestored,false);
  attached=false;return true;
 }
 function snapshot(){
  return {
   status:state,losses,restores,renderFailures:failures,
   lastError,lossDurationMs:state==='lost'&&lostSince!==null?
    Math.max(0,now()-lostSince):null,
   history:history.map(event=>({...event}))
  };
 }
 return Object.freeze({
  attach,detach,rendered,recordFailure,snapshot,
  get canRender(){return state==='ready'||state==='recovering';},
  get status(){return state;}
 });
}

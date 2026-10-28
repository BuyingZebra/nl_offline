/* V075 boot coordination. The SAME grayscale canvas is shown during module
 * loading and used as a Three.js CanvasTexture after initialization.
 * The renderer owns phosphor, bloom, scanlines, vignette and the signal roll.
 */
(function(root){
 'use strict';
 const doc=root.document,veil=doc.getElementById('boot-overlay');
 const canvas=doc.getElementById('boot-canvas'),Terminal=root.FieldAtlasTerminal;
 if(!veil||!canvas||!Terminal)return;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)return;
 try{
  if(root.localStorage?.getItem('fieldAtlasThemeV06')==='amber')
   veil.classList.add('amber');
 }catch(e){}
 const clock=()=>root.performance?.now?.()??Date.now();
 const began=clock(),BOOT_MS=2800,REST_MS=250;
 let ready=false,presented=false,started=false,revealed=false;
 let startRoll=null,notifyPaint=null,revision=0,redrawTimer=false;
 function elapsed(){return Math.max(0,clock()-began);}
 function paint(){
  if(started)return;
  const bounds=veil.getBoundingClientRect?.();
  const w=Math.max(1,Math.round(bounds?.width||root.innerWidth||393));
  const h=Math.max(1,Math.round(bounds?.height||root.innerHeight||852));
  const dpr=Math.min(2,Math.max(1,root.devicePixelRatio||1));
  const cw=Math.round(w*dpr),ch=Math.round(h*dpr);
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  ctx.setTransform(dpr,0,0,dpr,0,0);
  Terminal.paint(ctx,w,h,elapsed(),'075');
  revision++;
  if(ready&&typeof notifyPaint==='function')notifyPaint();
 }
 function transition(){
  if(started||!ready||!presented||elapsed()<BOOT_MS+REST_MS)return;
  started=true;
  // The compositor stays on the boot source until we turn it off. Pop-off
  // briefly covers that exact frame, then starts the already-offset game.
  veil.hidden=false;
  veil.classList.add('boot-off');
  root.setTimeout(()=>{
   if(typeof startRoll==='function')startRoll();
  },145);
 }
 function tick(){
  if(started)return;
  paint();
  transition();
  if(!started)root.setTimeout(tick,50);
 }
 root.FieldAtlasTetrisBoot=Object.freeze({
  canvas,
  get revision(){return revision;},
  get elapsed(){return elapsed();},
  get ready(){return ready;},
  get revealed(){return revealed;},
  isRolling(){return started;},
  firstFrame(onStartRolling,onPaint){
   if(ready)return;
   ready=true;startRoll=onStartRolling;notifyPaint=onPaint;
   transition();
  },
  gpuFrame(){
   if(!ready||presented||started)return;
   presented=true;veil.hidden=true;
   transition();
  },
  rollFrame(){
   if(!started||revealed)return;
   revealed=true;veil.hidden=true;
  },
  // Initial motion is constant speed, then a C1-continuous ease to zero.
  rollTurns(t){
   t=Math.max(0,Math.min(1,Number(t)||0));
   const linear=.36,tail=(t-linear)/(1-linear);
   const distance=t<=linear?t:linear+(1-linear)*
    (tail-tail*tail*tail+.5*Math.pow(tail,4));
   return 2*distance/(linear+(1-linear)*.5);
  }
 });
 // Draw synchronously: the cover is useful before Three.js can even import.
 paint();
 root.setTimeout(tick,50);
})(window);

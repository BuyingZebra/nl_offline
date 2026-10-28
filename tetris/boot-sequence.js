/* V077: terminal startup state machine, grayscale source / CRT GPU handoff.
 * Only user touch advances the fully populated, successfully rendered screen.
 * Phosphor colour ramps 0..100%; electrical voltage may briefly spike
 * luminance, never the selected green/amber tint itself.
 */
(function(root){
 'use strict';
 const doc=root.document,veil=doc.getElementById('boot-overlay');
 const canvas=doc.getElementById('boot-canvas'),Terminal=root.FieldAtlasTerminal;
 if(!veil||!canvas||!Terminal)return;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)return;
 const clock=()=>root.performance?.now?.()??Date.now();
 const began=clock(),BOOT_MS=2800;
 const SNAP_OFF_MS=145,BLACK_MS=1000,PHOSPHOR_RAMP_MS=160;
 let ready=false,presented=false,started=false,revealed=false;
 let startRoll=null,notifyPaint=null,revision=0,gpuFirstSeenAt=null;
 function elapsed(){return Math.max(0,clock()-began);}
 function canContinue(){return presented&&elapsed()>=BOOT_MS&&!started;}
 function intensity(){
  if(gpuFirstSeenAt===null)return {phosphor:0,voltage:1};
  const ms=clock()-gpuFirstSeenAt;
  // Colour is strictly interpolation between 0 and 100 percent.
  const phosphor=Math.max(0,Math.min(1,ms/PHOSPHOR_RAMP_MS));
  // A brief single-frame-like electrical surge. No colour oversaturation.
  const voltage=ms>=75&&ms<115?1.16:1;
  return {phosphor,voltage};
 }
 function paint(){
  if(started)return;
  const bounds=veil.getBoundingClientRect?.();
  const w=Math.max(1,Math.round(bounds?.width||root.innerWidth||393));
  const h=Math.max(1,Math.round(bounds?.height||root.innerHeight||852));
  const dpr=Math.min(2,Math.max(1,root.devicePixelRatio||1));
  const cw=Math.round(w*dpr),ch=Math.round(h*dpr);
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  ctx.setTransform(dpr,0,0,dpr,0,0);
  Terminal.paint(ctx,w,h,elapsed(),'077',canContinue());
  revision++;
  if(ready&&typeof notifyPaint==='function')notifyPaint();
 }
 function transition(){
  if(!canContinue())return false;
  started=true;
  // Power down the ACTUAL GPU phosphor image, not the grayscale backup
  // canvas. Otherwise the terminal flashes to an unrelated CSS hue.
  doc.documentElement.classList.add('boot-poweroff');
  root.setTimeout(()=>{
   // After the 145ms collapse, cover the screen with true neutral black.
   veil.hidden=false;
   veil.classList.add('boot-black');
   doc.documentElement.classList.remove('boot-poweroff');
   root.setTimeout(()=>{
    if(typeof startRoll==='function')startRoll();
   },BLACK_MS);
  },SNAP_OFF_MS);
  return true;
 }
 function onTouch(event){
  // Capture-phase interception guarantees the same touch doesn't move
  // a game piece, press a hidden control, or scroll the viewport.
  if(started)return;
  if(event?.cancelable)event.preventDefault();
  event?.stopImmediatePropagation?.();
  transition();
 }
 doc.addEventListener?.('pointerdown',onTouch,{capture:true,passive:false});
 // Older iOS touch delivery may not support pointer events.
 if(!root.PointerEvent)
  doc.addEventListener?.('touchstart',onTouch,{capture:true,passive:false});
 function tick(){
  if(started)return;
  paint();
  // While phosphor first stabilizes, refresh fast enough to show one
  // snappy luminance pulse; after stabilization allow normal 50ms updates.
  const ms=gpuFirstSeenAt===null?999:clock()-gpuFirstSeenAt;
  root.setTimeout(tick,ms>=0&&ms<200?16:50);
 }
 root.FieldAtlasTetrisBoot=Object.freeze({
  canvas,
  get revision(){return revision;},
  get elapsed(){return elapsed();},
  get ready(){return ready;},
  get revealed(){return revealed;},
  get waitingForTap(){return canContinue();},
  isRolling(){return started;},
  effects(){return intensity();},
  firstFrame(onStartRolling,onPaint){
   if(ready)return;
   ready=true;startRoll=onStartRolling;notifyPaint=onPaint;
  },
  gpuFrame(){
   if(!ready||presented||started)return;
   presented=true;
   gpuFirstSeenAt=clock();
   veil.hidden=true;
  },
  rollFrame(){
   if(!started||revealed)return;
   revealed=true;
   veil.hidden=true;
  },
  rollTurns(t){
   t=Math.max(0,Math.min(1,Number(t)||0));
   const linear=.28,tail=(t-linear)/(1-linear);
   const distance=t<=linear?t:linear+(1-linear)*
    (tail-tail*tail*tail+.5*Math.pow(tail,4));
   return 4*distance/(linear+(1-linear)*.5);
  }
 });
 paint();
 root.setTimeout(tick,50);
})(window);

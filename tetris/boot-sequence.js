/* V079: terminal startup state machine, grayscale source / CRT GPU handoff.
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
 const BOOT_MS=Terminal.durationMs||6100;
 let began=null;
 const SNAP_OFF_MS=145,BLACK_MS=1000,PHOSPHOR_RAMP_MS=160;
 let ready=false,presented=false,started=false,gameHandoff=false,revealed=false;
 let startRoll=null,notifyPaint=null,revision=0,gpuFirstSeenAt=null,powerDownAt=null;
 function elapsed(){return began===null?0:Math.max(0,clock()-began);}
 function canContinue(){return presented&&elapsed()>=BOOT_MS&&!started;}
 function intensity(){
  if(gpuFirstSeenAt===null)return {phosphor:0,voltage:1,glitch:0,clock:0};
  const ms=clock()-gpuFirstSeenAt;
  // Colour is strictly interpolation between 0 and 100 percent.
  const phosphor=Math.max(0,Math.min(1,ms/PHOSPHOR_RAMP_MS));
  // Short voltage surges affect luminance only, not selected phosphor hue.
  const t=elapsed();
  const pulses=[[155,183,1.15],[397,432,1.10],[2060,2098,1.17],
   [3790,3830,1.12],[5145,5180,1.15]];
  let voltage=1;
  for(const [a,b,v] of pulses)if(t>=a&&t<b){voltage=v;break;}
  const faults=[[265,322,.35],[2090,2190,.65],[3710,3830,.55],
   [4915,5010,.72]];
  let glitch=0;
  for(const [a,b,v] of faults)if(t>=a&&t<b){
   const p=(t-a)/(b-a);glitch=v*Math.sin(Math.PI*p);break;
  }
  return {phosphor,voltage,glitch,clock:t};
 }
 function paint(){
  if(gameHandoff)return;
  const bounds=veil.getBoundingClientRect?.();
  const w=Math.max(1,Math.round(bounds?.width||root.innerWidth||393));
  const h=Math.max(1,Math.round(bounds?.height||root.innerHeight||852));
  const dpr=Math.min(2,Math.max(1,root.devicePixelRatio||1));
  const cw=Math.round(w*dpr),ch=Math.round(h*dpr);
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  ctx.setTransform(dpr,0,0,dpr,0,0);
  Terminal.paint(ctx,w,h,elapsed(),'079',presented&&elapsed()>=BOOT_MS,powerOffProgress());
  revision++;
  if(ready&&typeof notifyPaint==='function')notifyPaint();
 }
 function powerOffProgress(){
  if(!started||gameHandoff||powerDownAt===null)return 0;
  return Math.max(0,Math.min(1,(clock()-powerDownAt)/SNAP_OFF_MS));
 }
 function animatePowerOff(){
  // Only source-image content shrinks. The CRT compositor and its fixed
  // scanline coordinates remain mounted and active throughout shutdown.
  paint();
  if(powerOffProgress()<1)root.setTimeout(animatePowerOff,16);
 }
 function transition(){
  if(!canContinue())return false;
  started=true;
  powerDownAt=clock();
  animatePowerOff();
  root.setTimeout(()=>{
   // Render exactly #080808 in the source at the beginning of the
   // one-second blackout; leave the CRT renderer and mask untouched.
   paint();
   root.setTimeout(()=>{
    gameHandoff=true;
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
  // Redraw code at 30fps, faults at up to 60fps and idle cursor at ~11fps.
  const t=elapsed(),pulse=intensity();
  root.setTimeout(tick,gpuFirstSeenAt===null?50:
   (pulse.glitch>0||pulse.voltage>1?16:(t<BOOT_MS?33:90)));
 }
 root.FieldAtlasTetrisBoot=Object.freeze({
  canvas,
  get revision(){return revision;},
  get elapsed(){return elapsed();},
  get ready(){return ready;},
  get revealed(){return revealed;},
  get waitingForTap(){return canContinue();},
  isRolling(){return gameHandoff;},
  effects(){return intensity();},
  powerOffProgress(){return powerOffProgress();},
  firstFrame(onStartRolling,onPaint){
   if(ready)return;
   ready=true;startRoll=onStartRolling;notifyPaint=onPaint;
  },
  gpuFrame(){
   if(!ready||presented||started)return;
   presented=true;
   gpuFirstSeenAt=clock();
   began=gpuFirstSeenAt;
   veil.hidden=true;
  },
  rollFrame(){
   if(!gameHandoff||revealed)return;
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

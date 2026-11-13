/* NOMAD v209 — device pointer and keyboard input; UI supplies hitbox geometry. */
import {findRegionAt,sliderValueAt} from './render.js?v213';
export function createInputController({screen,document,window,
 getViewport,getRegions,getModal,getModalView,getOptionsScroll,
 setOptionsScroll,getOptionsMaxScroll,setScrollVelocity,setBaseDirty,
 handleAction,perform,setSetting,settingValue,toggleScanlineMenu,
 chooseScanline,openModal,invalidate,clamp,canInteract=()=>true,
 getLightBounds=()=>null,onLightPoint=()=>{},
 onButtonPress=()=>{},onButtonRelease=()=>{}}){
 let pressed=null,repeatDelay=null,repeatInterval=null,disposed=false;
 const listeners=[];
 function listen(target,name,handler,options){
  target.addEventListener(name,handler,options);
  listeners.push({target,name,handler,options});
 }
function stopRepeat(){
 if(repeatDelay!==null){clearTimeout(repeatDelay);repeatDelay=null;}
 if(repeatInterval!==null){clearInterval(repeatInterval);repeatInterval=null;}
}
function eventPoint(e){
 const rect=screen.getBoundingClientRect();
 return {x:(e.clientX-rect.left)*getViewport().width/rect.width,y:(e.clientY-rect.top)*getViewport().height/rect.height};
}
function regionAt(p){
 return findRegionAt(getRegions(),p,getModal(),getModalView());
}
function setSlider(r,x){
 setSetting(r.field,sliderValueAt(r,x));
}
// One pointer recognizer for the entire grayscale display. Menus defer activation
// until touch-up; axis-aware intent makes scroll work from sliders and switches.
const DRAG_DEADZONE=8;
const optionPoint=p=>getModal()==='options'&&getModalView()&&
 p.x>=getModalView().x&&p.x<=getModalView().x+getModalView().w&&
 p.y>=getModalView().y&&p.y<=getModalView().y+getModalView().h;
const eventStamp=e=>Number.isFinite(e.timeStamp)?e.timeStamp:performance.now();
const isVisualButton=r=>r?.kind==='button'||['toggle','patternSelect','scanlineChoice'].includes(r?.act);
// iOS Safari can invoke native text-selection/callout on a held canvas
// despite touch-action:none. Cancel only the browser's selection menu,
// never the pointerdown/up cycle that powers hold and auto-repeat.
listen(screen,'contextmenu',e=>e.preventDefault());
listen(screen,'selectstart',e=>e.preventDefault());
listen(screen,'pointerdown',e=>{
 if(disposed||!canInteract())return;
 if(e.pointerType==='mouse'&&e.button!==0)return;
 e.preventDefault();
 if(pressed)return; // One active touch: prevents accidental multi-touch changes.
 const p=eventPoint(e),r=regionAt(p),inOptions=optionPoint(p);
 if(getModal()==='light'){
  const b=getLightBounds();
  if(b&&p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h){
   pressed={id:e.pointerId,mode:'light',region:null,start:p,last:p};
   try{screen.setPointerCapture(e.pointerId);}catch(error){}
   onLightPoint(p);invalidate();return;
  }
 }
 if(!r&&!getModal())return;
 if(isVisualButton(r))onButtonPress(r,performance.now(),true);
 stopRepeat();setScrollVelocity(0);
 pressed={
  id:e.pointerId,region:r,start:p,last:p,action:r?.act,
  box:r,scroll:getOptionsScroll(),mode:getModal()?'pending':'game',
  inOptions,time:eventStamp(e),velocity:0
 };
 try{screen.setPointerCapture(e.pointerId)}catch(err){}
 // Game buttons stay immediate, including auto-repeat movement.
 if(!getModal()&&r){
  setBaseDirty(r.act);
  handleAction(r.act);
  if(r.repeat){
   // Holding soft drop accelerates continuously; lateral movement retains
   // its existing delayed auto-shift and cadence.
   if(r.act==='soft')repeatInterval=setInterval(()=>handleAction(r.act),50);
   else repeatDelay=setTimeout(()=>{
    repeatInterval=setInterval(()=>handleAction(r.act),82);
   },210);
  }
 }
 invalidate();
});
listen(screen,'pointermove',e=>{
 if(disposed||!canInteract())return;
 if(!pressed||pressed.id!==e.pointerId)return;
 const p=eventPoint(e),r=pressed.region,touch=pressed;
 if(touch.mode==='light'){
  onLightPoint(p);touch.last=p;invalidate();return;
 }
 if(!getModal())return;
 const dx=p.x-touch.start.x,dy=p.y-touch.start.y;
 const ax=Math.abs(dx),ay=Math.abs(dy);
 if(touch.mode==='pending'&&(ax>DRAG_DEADZONE||ay>DRAG_DEADZONE)){
  if(touch.inOptions&&ay>DRAG_DEADZONE&&ay>ax*.78)touch.mode='scroll';
  else if(r?.act==='slider'&&ax>DRAG_DEADZONE&&ax>=ay*.78)touch.mode='slider';
  else touch.mode='cancelled';
 }
 if(touch.mode==='scroll'){
  setOptionsScroll(clamp(touch.scroll-dy,0,getOptionsMaxScroll()));
  const dt=Math.max(1,eventStamp(e)-touch.time);
  const v=clamp((touch.last.y-p.y)/dt,-2.3,2.3);
  touch.velocity=touch.velocity*.5+v*.5;
  invalidate();
 }else if(touch.mode==='slider'){
  setSlider(r,p.x);
 }
 touch.last=p;touch.time=eventStamp(e);
});
function releaseTouch(e){
 if(disposed||!canInteract()){cancel();return;}
 if(!pressed||pressed.id!==e.pointerId)return;
 stopRepeat();
 const touch=pressed,p=eventPoint(e);pressed=null;
 if(touch.mode==='light'){
  if(e.type==='pointerup')onLightPoint(p);
  try{if(screen.hasPointerCapture(e.pointerId))screen.releasePointerCapture(e.pointerId);}catch(error){}
  invalidate();return;
 }
  if(isVisualButton(touch.region))onButtonRelease(touch.region,performance.now());
 // Redraw only the touched button's cropped HUD texture on release.
 if(!getModal())setBaseDirty(touch.action);
 try{if(screen.hasPointerCapture(e.pointerId))screen.releasePointerCapture(e.pointerId);}catch(err){}
 if(getModal()){
  if(e.type==='pointerup'){
   if(touch.mode==='scroll'){
    const elapsed=Math.max(0,eventStamp(e)-touch.time);
    if(elapsed<105&&getOptionsMaxScroll()>0)setScrollVelocity(touch.velocity);
   }else if(touch.mode==='pending'&&touch.region){
    const dy=p.y-touch.start.y,dx=p.x-touch.start.x;
    const same=Math.abs(dx)<=DRAG_DEADZONE&&Math.abs(dy)<=DRAG_DEADZONE;
    if(same){
     const r=touch.region;
     if(r.act==='slider')setSlider(r,p.x);
     else if(r.act==='toggle')setSetting(r.field,!settingValue(r.field));
     else if(r.act==='patternSelect'&&optionPoint(p))toggleScanlineMenu();
     else if(r.act==='scanlineChoice'&&optionPoint(p))chooseScanline(r.field);
     else if(!touch.inOptions||optionPoint(p))handleAction(r.act);
    }
   }else if(touch.mode==='slider'&&touch.region?.act==='slider'){
    setSlider(touch.region,p.x);
   }
  }
 }
 invalidate();
}
listen(screen,'pointerup',releaseTouch);
listen(screen,'pointercancel',releaseTouch);
listen(screen,'lostpointercapture',releaseTouch);
listen(window,'blur',cancel);
listen(screen,'wheel',e=>{
 if(disposed||!canInteract())return;
 if(getModal()==='options'){
  e.preventDefault();setOptionsScroll(clamp(getOptionsScroll()+e.deltaY,0,getOptionsMaxScroll()));invalidate();
 }
},{passive:false});
const KEYS={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'cw',KeyX:'cw',
 ArrowDown:'soft',Space:'soft',KeyC:'hold',ShiftLeft:'hold',
 KeyP:'pause',Escape:'pause',Enter:'start',NumpadEnter:'start'};
listen(document,'keydown',e=>{
 if(disposed||!canInteract())return;
 if(getModal()){
  if(e.code==='Escape'){e.preventDefault();openModal(null);}
  return;
 }
 const a=KEYS[e.code];
 if(!a)return;
 e.preventDefault();
 if(e.repeat&&['hold','pause','start'].includes(a))return;
 const keyRegion=getRegions().find(r=>r.kind==='button'&&r.act===a);
 if(keyRegion)onButtonPress(keyRegion,performance.now(),false);
 perform(a);
});

 function cancel(){
  stopRepeat();
  if(pressed){
   if(isVisualButton(pressed.region))onButtonRelease(pressed.region,performance.now());
   try{
    if(screen.hasPointerCapture?.(pressed.id))screen.releasePointerCapture(pressed.id);
   }catch(error){/* The pointer may have been released by the browser. */}
  }
  pressed=null;
 }
 function dispose(){
  if(disposed)return false;
  disposed=true;cancel();
  for(const {target,name,handler,options} of listeners)
   target.removeEventListener(name,handler,options);
  listeners.length=0;
  return true;
 }
 return Object.freeze({get pressed(){return pressed;},stopRepeat,cancel,dispose,
  get disposed(){return disposed;}
 });
}

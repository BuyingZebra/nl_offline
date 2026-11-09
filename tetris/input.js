/* Shared control geometry, hit testing and input dispatch. */


/* V065 — one geometry/interaction model for drawn Canvas2D controls.
 * No Canvas, Three.js, DOM, settings, or game state dependencies.
 * Values use the app's established CSS-pixel coordinates.
 */
export function makeRegion(x,y,w,h,act,options={}){
 return {x,y,w,h,act,...options};
}
export function makeButtonControl(label,x,y,w,h,act,
 {light=false,repeat=false,arrow=false,modalControl=false}={}){
 return {
  kind:'button',label,x,y,w,h,act,light,repeat,arrow,modalControl,
  hitbox:makeRegion(x,y,w,h,act,{kind:'button',light,repeat,modalControl})
 };
}
// Slider label/value geometry and pointer hitbox must always agree.
export function makeSliderControl(x,y,w,setting,value,size=15,gap=6){
 const [label,field,min,max,step,unit]=setting;
 const digits=step<.1?2:step<1?1:0;
 const valueText=Number(value).toFixed(digits)+unit;
 const labelW=label?(label==='X'||label==='Y'?12:label==='RADIUS'?51:65):0;
 const valueW=Math.max(30,Math.ceil(valueText.length*6.8));
 const trackX=x+labelW+(label?gap:0)+size/2;
 const trackEnd=x+w-valueW-gap-size/2;
 const trackW=Math.max(1,trackEnd-trackX);
 const fraction=Math.max(0,Math.min(1,(value-min)/(max-min)));
 const hitbox=makeRegion(trackX-size/2,y-14,trackW+size,28,'slider',
  {field,min,max,step,trackX,trackW,modalControl:true});
 return {kind:'slider',label,field,min,max,step,unit,value,
  x,y,w,size,gap,valueText,labelW,valueW,trackX,trackW,fraction,hitbox};
}
// Last-drawn region wins, matching the existing overlay z-order.
// A settings control must lie inside the scroll viewport vertically.
export function findRegionAt(regions,point,modal=null,modalView=null){
 for(let i=regions.length-1;i>=0;i--){
  const r=regions[i];
  if(!(point.x>=r.x&&point.x<=r.x+r.w&&point.y>=r.y&&point.y<=r.y+r.h))continue;
  if(modal==='options'&&r.modalControl&&modalView&&
   (point.y<modalView.y||point.y>modalView.y+modalView.h))continue;
  return r;
 }
 return undefined;
}
// The handle geometry exported by makeSliderControl is used without
// recomputing a potentially different track in the pointer controller.
export function sliderValueAt(region,x){
 const f=Math.max(0,Math.min(1,(x-region.trackX)/Math.max(1,region.trackW)));
 const v=region.min+f*(region.max-region.min);
 const stepped=Math.round(v/region.step)*region.step;
 return Number(stepped.toFixed(4));
}

/* Tetris System V052 — touch/mouse/keyboard input adapter.
 * Hit regions come from the rendering layer; gameplay and settings changes
 * go through injected callbacks. A controller owns the repeat timers and
 * active pointer so they can be cancelled safely on modal transitions.
 */
export function createInputController({screen,document,window,
 getViewport,getRegions,getModal,getModalView,getOptionsScroll,
 setOptionsScroll,getOptionsMaxScroll,setScrollVelocity,setBaseDirty,
 handleAction,perform,setSetting,settingValue,toggleScanlineMenu,
 chooseScanline,openModal,invalidate,clamp,canInteract=()=>true,
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

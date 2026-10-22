import {findRegionAt,sliderValueAt} from './ui-controls.js?v065';
/* Tetris System V052 — touch/mouse/keyboard input adapter.
 * Hit regions come from the rendering layer; gameplay and settings changes
 * go through injected callbacks. A controller owns the repeat timers and
 * active pointer so they can be cancelled safely on modal transitions.
 */
export function createInputController({screen,document,window,initialsInput,
 getViewport,getRegions,getModal,getModalView,getOptionsScroll,
 setOptionsScroll,getOptionsMaxScroll,setScrollVelocity,setBaseDirty,
 handleAction,perform,setSetting,settingValue,toggleScanlineMenu,
 chooseScanline,openModal,invalidate,clamp}){
 let pressed=null,repeatDelay=null,repeatInterval=null;
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
screen.addEventListener('pointerdown',e=>{
 if(e.pointerType==='mouse'&&e.button!==0)return;
 e.preventDefault();
 if(pressed)return; // One active touch: prevents accidental multi-touch changes.
 const p=eventPoint(e),r=regionAt(p),inOptions=optionPoint(p);
 stopRepeat();setScrollVelocity(0);
 pressed={
  id:e.pointerId,region:r,start:p,last:p,action:r?.act,
  box:r,scroll:getOptionsScroll(),mode:getModal()?'pending':'game',
  inOptions,time:eventStamp(e),velocity:0
 };
 try{screen.setPointerCapture(e.pointerId)}catch(err){}
 // Game buttons stay immediate, including auto-repeat movement.
 if(!getModal()&&r&&!r.board){
  setBaseDirty(r.act);
  handleAction(r.act);
  if(r.repeat)repeatDelay=setTimeout(()=>{
   repeatInterval=setInterval(()=>handleAction(r.act),82);
  },210);
 }
 invalidate();
});
screen.addEventListener('pointermove',e=>{
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
 if(!pressed||pressed.id!==e.pointerId)return;
 stopRepeat();
 const touch=pressed,p=eventPoint(e);pressed=null;
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
 }else if(touch.action==='board'&&e.type==='pointerup'){
  setBaseDirty('board');
  const dx=p.x-touch.start.x,dy=p.y-touch.start.y;
  if(Math.abs(dx)<16&&Math.abs(dy)<16)perform('cw');
  else if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>18){
   for(let i=0;i<clamp(Math.round(Math.abs(dx)/32),1,5);i++)
    perform(dx>0?'right':'left');
  }else if(dy>25)perform('hard');
 }
 invalidate();
}
screen.addEventListener('pointerup',releaseTouch);
screen.addEventListener('pointercancel',releaseTouch);
window.addEventListener('blur',stopRepeat);
screen.addEventListener('wheel',e=>{
 if(getModal()==='options'){
  e.preventDefault();setOptionsScroll(clamp(getOptionsScroll()+e.deltaY,0,getOptionsMaxScroll()));invalidate();
 }
},{passive:false});
const KEYS={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'cw',KeyX:'cw',
 ArrowDown:'hard',Space:'hard',KeyC:'hold',ShiftLeft:'hold',
 KeyP:'pause',Escape:'pause'};
document.addEventListener('keydown',e=>{
 if(document.activeElement===initialsInput)return;
 if(getModal()){
  if(e.code==='Escape'){e.preventDefault();openModal(null);}
  return;
 }
 const a=KEYS[e.code];
 if(!a)return;
 e.preventDefault();
 if(e.repeat&&['hard','hold','pause','start'].includes(a))return;
 perform(a);
});

 function cancel(){stopRepeat();pressed=null;}
 return Object.freeze({get pressed(){return pressed;},stopRepeat,cancel});
}

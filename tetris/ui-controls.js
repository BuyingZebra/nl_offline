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
  hitbox:makeRegion(x,y,w,h,act,{repeat,modalControl})
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

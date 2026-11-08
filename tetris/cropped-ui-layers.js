/* Tetris V062 — geometry and drawing helper for cropped, opaque HUD layers.
 * All bounds use CSS pixels and snap to the 2x canvas pixel grid.
 * Preserves the existing Canvas2D coordinate system and Three.js passes.
 */
export function croppedBounds(boxes,width,height,dpr=1,pad=2){
 const scale=Math.max(1,dpr||1);
 const valid=boxes.filter(b=>b&&b.w>0&&b.h>0);
 if(!valid.length)return {x:0,y:0,w:1/scale,h:1/scale};
 const x=Math.max(0,Math.floor((Math.min(...valid.map(b=>b.x))-pad)*scale)/scale);
 const y=Math.max(0,Math.floor((Math.min(...valid.map(b=>b.y))-pad)*scale)/scale);
 const right=Math.min(width,Math.ceil((Math.max(...valid.map(b=>b.x+b.w))+pad)*scale)/scale);
 const bottom=Math.min(height,Math.ceil((Math.max(...valid.map(b=>b.y+b.h))+pad)*scale)/scale);
 return {x,y,w:Math.max(1/scale,right-x),h:Math.max(1/scale,bottom-y)};
}
export function sidebarBounds(r,width,height,dpr){
 // NEXT and HOLD labels now sit above the compact preview frames.
 const headingSpace=r.previewLabelSpace??0;
 const headingBox=p=>({
  x:p.x,y:p.y-headingSpace,w:p.w,h:headingSpace
 });
 return croppedBounds([
  r.holdPanel,r.nextPanel,r.statsPanel,
  headingBox(r.holdPanel),headingBox(r.nextPanel)
 ],width,height,dpr);
}
export function controlsBounds(r,width,height,dpr){
 // The unframed two-line terminal is drawn inside this same small HUD crop.
 // Extend its bounds without expanding the button container itself.
 return croppedBounds([{x:r.dx,y:r.dy,w:r.dw,h:r.dh},
  {x:r.dx+5,y:r.footerY-25,w:Math.max(1,r.dw-10),h:36}],width,height,dpr);
}
export function drawCroppedCanvas({canvas,context,plane,texture,bounds,dpr,width,height,draw}){
 const {x,y,w,h}=bounds;
 const pxW=Math.max(1,Math.round(w*dpr)),pxH=Math.max(1,Math.round(h*dpr));
 if(canvas.width!==pxW||canvas.height!==pxH){canvas.width=pxW;canvas.height=pxH;}
 context.setTransform(dpr,0,0,dpr,-x*dpr,-y*dpr);
 draw(bounds);
 plane.scale.set(w/width,h/height,1);
 plane.position.set(-1+(2*x+w)/width,1-(2*y+h)/height,plane.position.z);
 texture.needsUpdate=true;
 return {pixels:pxW*pxH,width:pxW,height:pxH};
}

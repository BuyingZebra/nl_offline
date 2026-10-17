/* FIELD ATLAS / CRT glass: resolution-independent barrel displacement.
 * Genuine 2D warp through SVG feDisplacementMap, not a CSS scale trick.
 * Works on the composited #app, including dialogs and screen overlays.
 * Small, local grayscale RG field; no internet, libraries or map data.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FieldAtlasCRT=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null),function(){
  'use strict';
  const VERSION='0.10';
  const DEFAULT_CURVATURE=16; // 0..100 slider; gentle by default
  const STORAGE_KEY='fieldAtlasTetrisCurvatureV01';
  const MAP_WIDTH=96;
  const MAP_HEIGHT=192;
  const MAX_WARP_FACTOR=.125; // full intensity measured in screen height
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  // In2 RG: 127.5 = zero displacement. Barrel magnitude rises smoothly
  // towards the four corners and remains zero at the screen's centre.
  function displacementAt(x,y) {
    const nx=clamp(x,-1,1),ny=clamp(y,-1,1);
    const r2=(nx*nx+ny*ny)/2;
    const k=.72*r2;
    return {dx:nx*k,dy:ny*k};
  }
  function pixelAt(x,y) {
    const d=displacementAt(x,y);
    return [Math.round(127.5+127.5*d.dx),
            Math.round(127.5+127.5*d.dy),128,255];
  }
  function generateField(canvas,w=MAP_WIDTH,h=MAP_HEIGHT){
    canvas.width=w;canvas.height=h;
    const context=canvas.getContext('2d',{willReadFrequently:false});
    if(!context)throw Error('CRT curvature map requires 2D canvas');
    const frame=context.createImageData(w,h);
    for(let py=0;py<h;py++){
      const y=((py+.5)/h)*2-1;
      for(let px=0;px<w;px++){
        const x=((px+.5)/w)*2-1;
        frame.data.set(pixelAt(x,y),(py*w+px)*4);
      }
    }
    context.putImageData(frame,0,0);
    return canvas.toDataURL('image/png');
  }
  function apply(container,feImage,displacement,glass,level,screenWidth,screenHeight) {
    const amount=clamp(Math.round(Number(level)||0),0,100);
    const w=Math.max(1,Math.round(Number(screenWidth)||container.clientWidth||390));
    const h=Math.max(1,Math.round(Number(screenHeight)||container.clientHeight||844));
    if(amount===0){
      container.style.filter='none';
      container.style.setProperty('--crt-glass-opacity','0');
      container.style.setProperty('--crt-glass-radius','0px');
      displacement.setAttribute('scale','0');
      return {amount,scale:0,width:w,height:h};
    }
    // Scale is in userSpaceOnUse CSS pixels. The static RG texture encodes
    // max displacement in +/- .36 scale, with zero displacement at centre.
    const scale=+(h*MAX_WARP_FACTOR*(amount/100)).toFixed(3);
    feImage.setAttribute('width',String(w));
    feImage.setAttribute('height',String(h));
    displacement.setAttribute('scale',String(scale));
    container.style.filter='url("#fieldAtlasCRTBarrel")';
    container.style.setProperty('--crt-glass-opacity',(amount/100*.55).toFixed(3));
    container.style.setProperty('--crt-glass-radius',(amount/100*32).toFixed(2)+'px');
    return {amount,scale,width:w,height:h};
  }
  function createController(doc) {
    const app=doc.getElementById('app');
    const filter=doc.getElementById('fieldAtlasCRTBarrel');
    const map=doc.getElementById('crtDisplacementImage');
    const displacement=doc.getElementById('crtDisplacementMap');
    const glass=doc.getElementById('crtGlass');
    if(!app||!filter||!map||!displacement||!glass)
      throw Error('CRT distortion markup not installed');
    const canvas=doc.createElement('canvas');
    const imageUrl=generateField(canvas);
    map.setAttribute('href',imageUrl);
    let currentWidth=0,currentHeight=0;
    function update(level) {
      const width=Math.round(app.getBoundingClientRect().width);
      const height=Math.round(app.getBoundingClientRect().height);
      if(width!==currentWidth||height!==currentHeight){
        currentWidth=width;currentHeight=height;
        map.setAttribute('width',String(width));
        map.setAttribute('height',String(height));
        // The filter region is relative to #app, and its *primitives* use
        // local CSS pixels, matching the map and the real app hit targets.
      }
      return apply(app,map,displacement,glass,level,width,height);
    }
    return Object.freeze({update,dispose(){app.style.filter='none';map.removeAttribute('href');}});
  }
  return Object.freeze({
    VERSION,DEFAULT_CURVATURE,STORAGE_KEY,MAP_WIDTH,MAP_HEIGHT,
    MAX_WARP_FACTOR,displacementAt,pixelAt,generateField,apply,createController
  });
});
/* NOMAD V127 — one authored running-bond brick texture in pixel and vector form.
 * Grayscale geometry only; the existing CRT compositor supplies phosphor tint.
 * Rails decorate the current board edges without changing grid/layout geometry.
 */
export const BRICK_UNIT=Object.freeze({width:12,height:24,courses:4});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const fmt=n=>Number(n.toFixed(3)).toString();
const rgb=n=>'rgb('+n+','+n+','+n+')';
// Four horizontal brick courses repeat seamlessly. Each alternate course
// consists of two cut bricks, so the vertical joints are visibly staggered.
const COURSES=Object.freeze([
 Object.freeze({y:1,bricks:Object.freeze([{x:1,w:10}])}),
 Object.freeze({y:7,bricks:Object.freeze([{x:-4,w:9},{x:6,w:9}])}),
 Object.freeze({y:13,bricks:Object.freeze([{x:1,w:10}])}),
 Object.freeze({y:19,bricks:Object.freeze([{x:-4,w:9},{x:6,w:9}])})
]);
export function brickShapes(style='vector'){
 if(style!=='pixel'&&style!=='vector')throw new RangeError('Unknown brick style');
 const pixel=style==='pixel',layers=[];
 function add(x,y,w,h,shade){if(w>0&&h>0)layers.push(Object.freeze({x,y,w,h,shade}));}
 for(const course of COURSES)for(const {x,w} of course.bricks){
  const y=course.y,h=4;
  // Face coordinates are identical in both artworks; only the bevel is finer
  // in the vector version. No gradients, radius, texture noise or runtime RNG.
  add(x,y,w,h,pixel?173:178);
  const rim=pixel?1:.65;
  add(x,y,w,rim,pixel?218:230);
  add(x,y,rim,h,pixel?209:217);
  add(x,y+h-rim,w,rim,pixel?77:81);
  add(x+w-rim,y,rim,h,pixel?89:103);
 }
 return layers;
}
export function renderBrickSVG(style='vector'){
 const shapes=brickShapes(style).map(({x,y,w,h,shade})=>
  '<rect x="'+fmt(x)+'" y="'+fmt(y)+'" width="'+fmt(w)+
  '" height="'+fmt(h)+'" fill="'+rgb(shade)+'"/>');
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 24" '+
  'width="12" height="24" shape-rendering="'+
  (style==='pixel'?'crispEdges':'geometricPrecision')+'" '+
  'data-design="nomad-bricks-v127" data-style="'+style+'">\n'+
  '<title>NOMAD staggered '+style+' brick rail</title>\n'+
  shapes.join('\n')+'\n</svg>\n';
}
export function brickRailGeometry(r){
 const {boardX:x,boardY:y,boardW:w,boardH:h}=r;
 if(!(w>4&&h>0))return null;
 const width=clamp(w*.043,7,11);
 // Only use the established side gap; no layout position or gameplay cell
 // is resized. A few pixels of the decoration may overlap the outermost edge.
 const gap=Math.max(0,(r.sideX??x+w)-(x+w));
 const outerLeft=r.off+Math.max(3,(r.pad??11)-6);
 const leftSpace=Math.max(0,x-outerLeft-2);
 const outside=clamp(Math.min(gap-.5,leftSpace,width*.48),0,width);
 const inside=width-outside;
 return Object.freeze({
  width,inside,outside,
  left:Object.freeze({x:x-outside,y,w:width,h}),
  right:Object.freeze({x:x+w-inside,y,w:width,h}),
  boardLeft:x,boardRight:x+w
 });
}
// Device-DPR raster stamp, cached at physical size for fast cropped redraws.
// Both image assets and live stamps come from brickShapes(), not separate art.
export function createBrickFrame({
 createCanvas=()=>document.createElement('canvas'),
 pixelRatio=()=>1
}={}){
 const stamps=new Map();
 function stamp(width,style){
  const dpr=clamp(Number(pixelRatio())||1,1,4);
  const pixelW=Math.max(1,Math.round(width*dpr));
  const key=style+':'+pixelW;
  if(stamps.has(key))return stamps.get(key);
  const canvas=createCanvas();
  canvas.width=pixelW;canvas.height=pixelW*2;
  const c=canvas.getContext('2d');
  if(!c)return null;
  const sx=canvas.width/BRICK_UNIT.width,sy=canvas.height/BRICK_UNIT.height;
  for(const {x,y,w,h,shade} of brickShapes(style)){
   c.fillStyle=rgb(shade);c.fillRect(x*sx,y*sy,w*sx,h*sy);
  }
  if(stamps.size>=12)stamps.delete(stamps.keys().next().value);
  stamps.set(key,canvas);
  return canvas;
 }
 function draw(ctx,r,part='inside',style='vector'){
  if(part!=='inside'&&part!=='outside')throw new RangeError('Unknown rail segment');
  const g=brickRailGeometry(r);if(!g)return;
  const tile=stamp(g.width,style);if(!tile)return;
  const period=g.width*2;
  for(const rail of [g.left,g.right]){
   const split=rail===g.left?g.boardLeft:g.boardRight;
   const clipX=part==='inside'?
    (rail===g.left?g.boardLeft:rail.x):
    (rail===g.left?rail.x:g.boardRight);
   const clipW=part==='inside'?g.inside:g.outside;
   if(!(clipW>0))continue;
   ctx.save();
   ctx.beginPath();ctx.rect(clipX,rail.y,clipW,rail.h);ctx.clip();
   for(let yy=rail.y;yy<rail.y+rail.h;yy+=period)
    ctx.drawImage(tile,rail.x,yy,rail.w,period);
   ctx.restore();
  }
 }
 return Object.freeze({draw,dispose:()=>stamps.clear(),get cachedStamps(){return stamps.size;}});
}

/* NOMAD V136 — textured, beveled square brick tiles in pixel and vector form.
 * Grayscale geometry only; the existing CRT compositor supplies phosphor tint.
 * Rails sit 6px outside the board and use 75%-cell-sized square pattern tiles.
 */
export const BRICK_UNIT=Object.freeze({width:12,height:12,courses:1});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const fmt=n=>Number(n.toFixed(3)).toString();
const rgb=n=>'rgb('+n+','+n+','+n+')';
// One inset 10x10 square brick per authored 12x12 texture cell.
// Every repeat is aligned vertically: no half-bricks or running bond.
const COURSES=Object.freeze([
 Object.freeze({y:1,bricks:Object.freeze([{x:1,w:10}])})
]);
export function brickShapes(style='vector'){
 if(style!=='pixel'&&style!=='vector')throw new RangeError('Unknown brick style');
 const pixel=style==='pixel',layers=[];
 const rim=pixel?1:.7,hair=pixel?1:.55;
 const add=(x,y,w,h,shade)=>{
  if(w>0&&h>0)layers.push(Object.freeze({x,y,w,h,shade}));
 };
 // V136: a raised square masonry block, not a single solid bright strip.
 // Face/edge heights are restrained so CRT glow doesn't erase the detail.
 add(1,1,10,10,pixel?103:107);  // dark cut-stone outline
 add(2,2,8,8,pixel?159:163);    // beveled top surface
 add(2,2,8,rim,pixel?212:215);
 add(2,2,rim,8,pixel?189:196);
 add(2,10-rim,8,rim,pixel?67:74);
 add(10-rim,2,rim,8,pixel?81:88);
 add(3,3,6,6,pixel?134:140);   // recessed square stone face
 add(3,3,6,hair,pixel?174:180);
 add(3,3,hair,6,pixel?157:163);
 add(3,9-hair,6,hair,pixel?90:96);
 add(9-hair,3,hair,6,pixel?97:103);
 // Deterministic low-profile chisel marks, visible at 75% cell size.
 // Pixel coordinates stay integral in the pixel asset.
 add(4,4,3,1,pixel?158:161);
 add(5,6,2,1,pixel?92:98);
 add(4,7,1,1,pixel?104:110);
 add(7,5,1,2,pixel?107:113);
 add(6,8,2,1,pixel?155:159);
 return layers;
}
export function renderBrickSVG(style='vector'){
 const shapes=brickShapes(style).map(({x,y,w,h,shade})=>
  '<rect x="'+fmt(x)+'" y="'+fmt(y)+'" width="'+fmt(w)+
  '" height="'+fmt(h)+'" fill="'+rgb(shade)+'"/>');
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" '+
  'width="12" height="12" shape-rendering="'+
  (style==='pixel'?'crispEdges':'geometricPrecision')+'" '+
  'data-design="nomad-bricks-v136" data-style="'+style+'">\n'+
  '<title>NOMAD aligned square '+style+' brick rail</title>\n'+
  shapes.join('\n')+'\n</svg>\n';
}
// The entire authored 12x12 tile is 75% of a tetromino board cell.
// The two rails use the same 6px gutter as the on-screen controls.
// Geometry may be clipped by the outer viewport or sidebar ONLY; neither
// the board nor any game control moves, shrinks, or gets overpainted.
export function brickRailGeometry(r){
 const {boardX:x,boardY:y,boardW:w,boardH:h}=r;
 if(!(w>4&&h>4))return null;
 const cell=(w-4)/10;
 const tile=r.previewCell>0?r.previewCell:cell*.75;
 const gap=r.brickGap??r.gap??6;
 if(!(tile>0))return null;
 const left=Object.freeze({x:x-gap-tile,y,w:tile,h});
 const right=Object.freeze({x:x+w+gap,y,w:tile,h});
 const minX=Math.max(0,r.safe?.left??0,r.off??0);
 // Cropped sidebar layer has a 2px opaque margin. Stop before that layer,
 // so its refreshes never cover the stationary brick frame.
 const panelStart=Math.min(
  r.nextPanel?.x??Infinity,r.statsPanel?.x??Infinity,
  r.holdPanel?.x??Infinity);
 const sidebarStart=Number.isFinite(panelStart)?panelStart:(r.sideX??Infinity);
 const availableRight=sidebarStart-2;
 const leftVisible=Object.freeze({
  x:Math.max(left.x,minX),
  w:Math.max(0,Math.min(tile,x-gap-Math.max(left.x,minX)))
 });
 const rightVisible=Object.freeze({
  x:right.x,
  w:Math.max(0,Math.min(tile,availableRight-right.x))
 });
 return Object.freeze({width:tile,height:tile,gap,left,right,
  leftVisible,rightVisible,boardLeft:x,boardRight:x+w});
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
  canvas.width=pixelW;canvas.height=pixelW;
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
 function draw(ctx,r,style='vector'){
  const geometry=brickRailGeometry(r);
  if(!geometry)return;
  const tile=stamp(geometry.width,style);
  if(!tile)return;
  for(const [rail,visible] of [
   [geometry.left,geometry.leftVisible],
   [geometry.right,geometry.rightVisible]
  ]){
   if(!(visible.w>0))continue;
   ctx.save();
   ctx.beginPath();ctx.rect(visible.x,rail.y,visible.w,rail.h);ctx.clip();
   // Fit complete SQUARE 75%-cell bricks between BOTH board borders.
   // The board is not an integer number of 75%-scale tiles tall. Spacing
   // the whole tiles by a subpixel fraction prevents a chopped-off last tile
   // without distorting their width, height or the 6px board gutters.
   const count=Math.max(1,Math.round(rail.h/geometry.height));
   const step=count>1?(rail.h-geometry.height)/(count-1):0;
   for(let row=0;row<count;row++){
    const yy=row===count-1?rail.y+rail.h-geometry.height:rail.y+row*step;
    ctx.drawImage(tile,rail.x,yy,geometry.width,geometry.height);
   }
   ctx.restore();
  }
 }
 return Object.freeze({draw,dispose:()=>stamps.clear(),get cachedStamps(){return stamps.size;}});
}

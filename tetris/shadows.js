/* NOMAD directional drop-shadow engine — approved Shadow Laboratory v06.
 * Reusable alpha silhouette, directed Gaussian bias, fixed-offset blur, LRU stamps.
 * 2D Canvas sprite stamps are computed ONCE per silhouette and reused on movement.
 * Does not add any WebGL passes, CanvasTextures, or uploads to the game.
 */
const DEFAULTS=Object.freeze({angle:55,distance:13,blur:14,bias:1,opacity:.8});
const MASK_SCALE=.5;
const GAUSS_TRUNCATION=2.6;
const TAP_CACHE=new Map();

export function directionalShadowProfile(tile=35,fx={}){
 const factor=Math.max(.1,(Number(tile)||35)/35);
 const bounded=(key,defaultValue,min,max)=>{
  const value=fx[key];
  return Number.isFinite(value)?Math.min(max,Math.max(min,value)):defaultValue;
 };
 return Object.freeze({
  enabled:fx.shadows!==false,
  angle:bounded('shadowAngle',DEFAULTS.angle,0,360),
  distance:bounded('shadowDistance',DEFAULTS.distance,0,35)*factor,
  blur:bounded('shadowBlur',DEFAULTS.blur,0,30)*factor,
  bias:bounded('shadowBias',DEFAULTS.bias,0,1),
  opacity:bounded('shadowOpacity',DEFAULTS.opacity,0,1),
  resolution:MASK_SCALE
 });
}

/** Direction-aware inset shadow for the RECESSED playfield window.
 * Reuses exactly the same persisted shadow settings as the tetrominoes.
 * At the approved 55° / 13px / 14px / 100% bias / 80% opacity defaults,
 * the standard and sharp-over-blurred-board gradients equal the old values.
 *
 * Inset geometry stays clipped to the window. Unlike a piece shadow, this
 * represents light being obstructed by the four inner walls, not an offset
 * exterior silhouette. No extra texture, GPU pass, or per-frame convolution.
 */
export function boardInsetShadowProfile(tile=35,fx={},sharp=false){
 const p=directionalShadowProfile(tile,fx);
 const base=sharp?
  {ambient:.15,vertical:.21,horizontal:.12}:
  {ambient:.24,vertical:.34,horizontal:.18};
 if(!p.enabled||p.opacity<=0)return Object.freeze({
  enabled:false,depth:0,hard:false,top:0,left:0,bottom:0,right:0
 });
 const referenceScale=Math.max(.1,(Number(tile)||35)/35);
 const distance=p.distance/referenceScale/13;
 const blur=p.blur/referenceScale/14;
 const originalDepth=Math.min(20,Math.max(8,(Number(tile)||35)*.8));
 const depth=Math.min(40,Math.max(1,
  originalDepth*(blur*.75+distance*.25)));
 const radians=p.angle*Math.PI/180;
 const dx=Math.cos(radians),dy=Math.sin(radians);
 const defaultX=Math.cos(55*Math.PI/180),defaultY=Math.sin(55*Math.PI/180);
 // Bias of zero balances opposite walls; at 100% the cast is directional.
 const projection=(component,reference)=>
  p.bias*Math.max(0,component)/reference+(1-p.bias)*.5;
 const strength=p.opacity/.8;
 const alpha=(direction,delta)=>Math.min(1,Math.max(0,
  (base.ambient+delta*distance*direction)*strength));
 return Object.freeze({
  enabled:true,depth,hard:p.blur===0,
  top:alpha(projection(dy,defaultY),base.vertical),
  left:alpha(projection(dx,defaultX),base.horizontal),
  bottom:alpha(projection(-dy,defaultY),base.vertical),
  right:alpha(projection(-dx,defaultX),base.horizontal)
 });
}

/** Same lightweight Canvas painter for the live board and sharp popup.
 * The popup retains its existing deliberately weaker shadow intensities.
 */
export function paintBoardInsetShadow(g,{x,y,w,h,tile},fx={},sharp=false){
 if(!(w>0&&h>0))return false;
 const p=boardInsetShadowProfile(tile,fx,sharp);
 if(!p.enabled)return false;
 const depth=Math.min(p.depth,w,h);
 g.save();g.beginPath();g.rect(x,y,w,h);g.clip();
 const shade=(x0,y0,x1,y1,rx,ry,rw,rh,alpha)=>{
  if(alpha<=0)return;
  if(p.hard){
   g.fillStyle='rgba(0,0,0,'+alpha+')';
  }else{
   const fade=g.createLinearGradient(x0,y0,x1,y1);
   fade.addColorStop(0,'rgba(0,0,0,'+alpha+')');
   fade.addColorStop(1,'rgba(0,0,0,0)');
   g.fillStyle=fade;
  }
  g.fillRect(rx,ry,rw,rh);
 };
 shade(x,y,x,y+depth,x,y,w,depth,p.top);
 shade(x,y,x+depth,y,x,y,depth,h,p.left);
 shade(x,y+h,x,y+h-depth,x,y+h-depth,w,depth,p.bottom);
 shade(x+w,y,x+w-depth,y,x+w-depth,y,depth,h,p.right);
 g.restore();
 return true;
}

// V06 Gaussian, with asymmetric tap weights. A bias of zero is a conventional
// symmetric Gaussian; one discards taps that would blur toward the light.
function taps(sigma,bias){
 if(sigma<.15)return [{delta:0,weight:1}];
 const key=sigma.toFixed(4)+':'+bias.toFixed(3);
 const cached=TAP_CACHE.get(key);
 if(cached)return cached;
 const radius=Math.min(96,Math.ceil(GAUSS_TRUNCATION*sigma));
 const weights=[];let total=0;
 for(let k=-radius;k<=radius;k++){
  const weight=Math.exp(-(k*k)/(2*sigma*sigma))*(k<0?1-bias:1);
  if(weight<1e-6)continue;
  weights.push({delta:k,weight});total+=weight;
 }
 const result=weights.map(w=>({delta:w.delta,weight:w.weight/total}));
 if(TAP_CACHE.size>=64)TAP_CACHE.clear();
 TAP_CACHE.set(key,result);
 return result;
}

function bilinear(src,width,height,x,y){
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const at=(cx,cy)=>
  cx<0||cy<0||cx>=width||cy>=height?0:src[cy*width+cx];
 return (1-fx)*(1-fy)*at(ix,iy)+fx*(1-fy)*at(ix+1,iy)+
  (1-fx)*fy*at(ix,iy+1)+fx*fy*at(ix+1,iy+1);
}
function blurAxis(src,width,height,sigma,ux,uy,bias){
 const kernel=taps(sigma,bias);
 if(kernel.length===1&&kernel[0].delta===0)return src;
 const output=new Float32Array(src.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let value=0;
  for(let i=0;i<kernel.length;i++){
   const {delta,weight}=kernel[i];
   value+=weight*bilinear(src,width,height,x-ux*delta,y-uy*delta);
  }
  output[y*width+x]=value;
 }
 return output;
}

/** Pure v06 blur: alpha mask -> cross-axis Gaussian -> light-angle offset
 * -> biased along-axis Gaussian. Angles are screen coordinates, +Y down.
 * Distance and blur are given in the source mask's actual pixel units.
 */
export function directionalShadowAlpha(source,width,height,{
 angle=55,distance=13,blur=14,bias=1
}={}){
 if(width<1||height<1||source.length!==width*height)
  throw new RangeError('Directional shadow requires a complete alpha mask');
 const b=Math.max(0,Math.min(1,Number(bias)||0));
 const theta=angle*Math.PI/180,ux=Math.cos(theta),uy=Math.sin(theta);
 const size=Math.max(0,Number(blur)||0);
 const across=blurAxis(source,width,height,size*(1-.24*b),-uy,ux,0);
 const shifted=new Float32Array(source.length);
 const dx=(Number(distance)||0)*ux,dy=(Number(distance)||0)*uy;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)
  shifted[y*width+x]=bilinear(across,width,height,x-dx,y-dy);
 return blurAxis(shifted,width,height,size*(1+.3*b),ux,uy,b);
}

/** Normalize the *visible* Gaussian alpha in place. The shadow source is
 * black already; its apparent weakness came from Gaussian convolution
 * reducing peak coverage, even when the OPACITY slider was set to 100%.
 * Mask the original opaque tiles first so the visible peak, rather than a
 * hidden portion underneath the art, reaches full coverage. This retains
 * the smooth Gaussian edge ratios and requires no extra Canvas/GPU layer.
 */
export function normalizeVisibleShadowAlpha(blurred,source){
 if(blurred.length!==source.length)throw new RangeError('Shadow mask length mismatch');
 let peak=0;
 for(let i=0;i<blurred.length;i++){
  const coverage=Math.max(0,Math.min(1,source[i]));
  const value=Math.max(0,Math.min(1,blurred[i]))*(1-coverage);
  blurred[i]=value;
  if(value>peak)peak=value;
 }
 if(peak>1e-8){
  const gain=1/peak;
  for(let i=0;i<blurred.length;i++)
   blurred[i]=Math.min(1,blurred[i]*gain);
 }
 return blurred;
}

/** A frame recess casts its shadow *inside* the opening. It uses the
 * SAME user light direction, Gaussian softness, bias and opacity as the
 * tetrominoes, but is physically twice as deep: 2x throw and 2x blur.
 * Opacity is not divided by either multiplier.
 */
export function boardInsetShadowProfile(tile=35,fx={}){
 const piece=directionalShadowProfile(tile,fx);
 const blur=piece.blur*2;
 return Object.freeze({
  enabled:piece.enabled,angle:piece.angle,
  distance:piece.distance*2,blur,bias:piece.bias,
  opacity:piece.opacity,resolution:blur<=6?1:.5
 });
}

// Fast Gaussian CDF (maximum absolute error ~8e-8). For an axis-aligned
// rectangular aperture, a blurred exterior can be integrated per axis.
// Only O(width+height) Gaussian samples are needed, rather than a full
// 2D convolution of an entire phone-sized game board.
function normalCDF(z){
 if(z<=-8)return 0;
 if(z>=8)return 1;
 const x=Math.abs(z),t=1/(1+.2316419*x);
 const polynomial=t*(.319381530+t*(-.356563782+
  t*(1.781477937+t*(-1.821255978+t*1.330274429))));
 const positive=1-.3989422804014327*Math.exp(-x*x/2)*polynomial;
 return z>=0?positive:1-positive;
}
function apertureCoverage(pixel,length,offset,sigma){
 const shifted=pixel-offset;
 if(sigma<.001)return shifted>=0&&shifted<length?1:0;
 return Math.max(0,Math.min(1,
  normalCDF(shifted/sigma)-normalCDF((shifted-length)/sigma)));
}

/** Analytic inset-shadow alpha. Angles and screen axes match the piece engine:
 * e.g. 0 degrees means a rightward shadow, darkening the LEFT interior rim.
 * The biased, rotated Gaussian is approximated by its projected x/y variance
 * and directional mean. This avoids a costly board-sized convolution on iOS.
 * Normalize the strongest visible point to full coverage, independently of
 * the user's opacity slider, just as for piece shadows in v191.
 */
export function directionalBoardInsetAlpha(width,height,{
 angle=55,distance=26,blur=28,bias=1
}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)
  throw new RangeError('Board inset requires positive integer dimensions');
 const b=Math.max(0,Math.min(1,Number(bias)||0));
 const theta=angle*Math.PI/180,ux=Math.cos(theta),uy=Math.sin(theta);
 const size=Math.max(0,Number(blur)||0);
 const along=size*(1+.3*b),across=size*(1-.24*b);
 const sx=Math.hypot(along*ux,across*uy);
 const sy=Math.hypot(along*uy,across*ux);
 // The piece renderer's one-sided along-axis Gaussian adds a mean shift.
 const biasThrow=b*along*Math.sqrt(2/Math.PI);
 const shift=(Number(distance)||0)+biasThrow;
 const dx=shift*ux,dy=shift*uy;
 const insideX=new Float32Array(width),insideY=new Float32Array(height);
 for(let x=0;x<width;x++)
  insideX[x]=apertureCoverage(x+.5,width,dx,sx);
 for(let y=0;y<height;y++)
  insideY[y]=apertureCoverage(y+.5,height,dy,sy);
 const alpha=new Float32Array(width*height);
 let peak=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const amount=Math.max(0,1-insideX[x]*insideY[y]);
  const value=amount<1e-6?0:amount;
  alpha[y*width+x]=value;
  peak=Math.max(peak,value);
 }
 if(peak>1e-8)for(let i=0;i<alpha.length;i++)
  alpha[i]=Math.min(1,alpha[i]/peak);
 return alpha;
}

/** One cached inset raster, shared by active board and the sharper popup.
 * Draws only into existing Canvas layers: no added GPU texture or pass.
 */
export function createBoardInsetShadowRenderer({
 createCanvas=()=>document.createElement('canvas'),getSettings=()=>null
}={}){
 let cached=null,signature=null,builds=0;
 function stamp(width,height,tile,p){
  const key=[width,height,tile,p.angle,p.distance,p.blur,p.bias,p.resolution]
   .map(v=>Number(v).toFixed(3)).join(':');
  if(signature===key&&cached)return cached;
  const sw=Math.max(1,Math.ceil(width*p.resolution));
  const sh=Math.max(1,Math.ceil(height*p.resolution));
  const alpha=directionalBoardInsetAlpha(sw,sh,{
   angle:p.angle,distance:p.distance*p.resolution,
   blur:p.blur*p.resolution,bias:p.bias
  });
  const canvas=createCanvas();canvas.width=sw;canvas.height=sh;
  const context=canvas.getContext('2d',{alpha:true});
  if(!context)return null;
  const image=context.createImageData(sw,sh);
  for(let i=0;i<alpha.length;i++)image.data[4*i+3]=Math.round(alpha[i]*255);
  context.putImageData(image,0,0);
  if(cached){cached.width=1;cached.height=1;}
  cached=canvas;signature=key;builds++;
  return canvas;
 }
 function draw(g,x,y,width,height,tile,strength=1){
  if(!(width>0&&height>0&&tile>0))return 0;
  const p=boardInsetShadowProfile(tile,getSettings()||{});
  if(!p.enabled||p.opacity<=0||strength<=0)return 0;
  const canvas=stamp(width,height,tile,p);
  if(!canvas)return 0;
  g.save();
  try{
   g.beginPath();g.rect(x,y,width,height);g.clip();
   g.globalAlpha*=p.opacity*Math.max(0,Math.min(1,strength));
   g.drawImage(canvas,x,y,width,height);
  }finally{g.restore();}
  return 1;
 }
 function dispose(){
  if(cached){cached.width=1;cached.height=1;}
  cached=null;signature=null;
 }
 return Object.freeze({draw,dispose,
  get stats(){return {builds,cached:!!cached,
   cacheKiB:cached?Math.round(cached.width*cached.height*4/1024):0};}
 });
}

/** Cached Canvas2D bridge for the existing stage. The published v06 uses
 * 0.5 CSS-pixel alpha masks and bilinear upscaling; retain that sampling.
 * No per-frame convolution: a moving/locked piece just draws its cached stamp.
 */
export function createDirectionalShadowRenderer({
 createCanvas=()=>document.createElement('canvas'),
 getSettings=()=>null,capacity=48
}={}){
 const cache=new Map();
 const limit=Math.max(1,Math.floor(capacity)||48);
 let builds=0,buildMs=0,worstBuildMs=0,cacheBytes=0,lastProfileKey=null;
 const clock=()=>typeof performance!=='undefined'&&performance.now?
  performance.now():Date.now();
 function stamp(group,tile,settings){
  const scale=settings.resolution;
  // Changing angle/blur/distance/bias invalidates all cached silhouettes.
  // Opacity and enable/disable are draw-only: they never rerun convolution.
  const signature=[tile,settings.angle,settings.distance,settings.blur,settings.bias].join(':');
  if(signature!==lastProfileKey){
   cache.clear();cacheBytes=0;lastProfileKey=signature;
  }
  const normalized=group.cells.map(c=>
   (c.x-group.minX)+','+(c.y-group.minY)).sort().join(';');
  const key=tile.toFixed(4)+':'+normalized;
  const previous=cache.get(key);
  if(previous){
   cache.delete(key);cache.set(key,previous);return previous;
  }
  const start=clock();
  // Account for the full blur support, so the offscreen edge does not clip it.
  const spread=settings.blur*(1+.3*settings.bias);
  const pad=Math.ceil(settings.distance+GAUSS_TRUNCATION*spread+5);
  const shapeWidth=(group.maxX-group.minX+1)*tile;
  const shapeHeight=(group.maxY-group.minY+1)*tile;
  const width=shapeWidth+2*pad,height=shapeHeight+2*pad;
  const sw=Math.max(1,Math.ceil(width*scale));
  const sh=Math.max(1,Math.ceil(height*scale));
  const mask=createCanvas();mask.width=sw;mask.height=sh;
  const mg=mask.getContext('2d',{willReadFrequently:true});
  if(!mg)return null;
  mg.save();mg.scale(scale,scale);
  mg.fillStyle='#000';
  for(const {x,y} of group.cells)
   mg.fillRect(pad+(x-group.minX)*tile,
    pad+(y-group.minY)*tile,tile,tile);
  mg.restore();
  const rgba=mg.getImageData(0,0,sw,sh).data;
  const alpha=new Float32Array(sw*sh);
  for(let i=0;i<alpha.length;i++)alpha[i]=rgba[4*i+3]/255;
  const out=normalizeVisibleShadowAlpha(directionalShadowAlpha(alpha,sw,sh,{
   angle:settings.angle,distance:settings.distance*scale,
   blur:settings.blur*scale,bias:settings.bias
  }),alpha);
  const canvas=createCanvas();canvas.width=sw;canvas.height=sh;
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return null;
  const image=ctx.createImageData(sw,sh);
  for(let i=0;i<out.length;i++)
   image.data[i*4+3]=Math.round(Math.max(0,Math.min(1,out[i]))*255);
  ctx.putImageData(image,0,0);
  // The opaque silhouette was already subtracted at mask resolution
  // before normalization. Avoid another Canvas compositing pass.
  const bytes=sw*sh*4;
  const item={canvas,width,height,pad,bytes};
  if(cache.size>=limit){
   const oldest=cache.keys().next().value;
   cacheBytes-=cache.get(oldest).bytes;cache.delete(oldest);
  }
  cache.set(key,item);cacheBytes+=bytes;
  builds++;const elapsed=clock()-start;
  buildMs+=elapsed;worstBuildMs=Math.max(worstBuildMs,elapsed);
  return item;
 }
 function draw(g,groups,offX,offY,tile){
  if(!(tile>0)||!groups?.length)return 0;
  const settings=directionalShadowProfile(tile,getSettings()||{});
  if(!settings.enabled||settings.opacity<=0)return 0;
  let count=0;
  g.save();
  g.globalAlpha*=settings.opacity;
  try{
   for(const group of groups){
    if(!group.cells.length)continue;
    const item=stamp(group,tile,settings);
    if(!item)continue;
    g.drawImage(item.canvas,
     offX+group.minX*tile-item.pad,
     offY+group.minY*tile-item.pad,item.width,item.height);
    count++;
   }
  }finally{g.restore();}
  return count;
 }
 return Object.freeze({
  draw,dispose:()=>{cache.clear();cacheBytes=0;lastProfileKey=null;},
  get cacheSize(){return cache.size;},
  get stats(){return {
   mode:'v06 cached directional Gaussian (0.5 CSS px)',builds,
   cacheSize:cache.size,cacheKiB:Math.round(cacheBytes/1024),
   totalBuildMs:+buildMs.toFixed(2),maxBuildMs:+worstBuildMs.toFixed(2)
  };}
 });
}

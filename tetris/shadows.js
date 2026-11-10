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

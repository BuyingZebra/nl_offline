/* Vector LCD engine
 *
 * A cell-free, physics-informed reflective LCD for vector artwork.
 * Geometry is given in millimetres on a virtual panel and re-rasterized at the
 * device's resolution, so artwork is never tied to a pixel grid.
 *
 * Model, per point on the glass (not per cell):
 *   drive voltage -> electro-optic target -> liquid-crystal response (state)
 *   -> ionic image retention (slow state) -> reflective optics + reflector shadow
 * Electrodes are arbitrary shapes, like a segment LCD. Off electrodes still see
 * the multiplex bias voltage (ghost segments) plus line-load crosstalk.
 * An optional fine-matrix zone lets art move freely; it behaves like an
 * addressable matrix finer than the eye can resolve, with row/column crosstalk.
 *
 * No dependencies. Requires WebGL2. Pure model functions are exported so the
 * maths can be tested without a browser; the shaders mirror them.
 */
export const ENGINE_VERSION='0.1.0';

export const DEFAULT_PARAMS=Object.freeze({
 // Liquid-crystal response. Times are milliseconds; voltages are fractions of
 // the full operating voltage (Vop).
 response:true,
 relaxMs:180,        // field-off relaxation time (elastic restoring torque)
 minSwitchMs:12,     // floor on the field-driven switching time
 thresholdV:.55,     // electro-optic threshold
 steepnessV:.075,    // width of the electro-optic transition
 // Multiplexed drive.
 ghost:true,
 bias:1/3,           // off-electrode RMS voltage (1/3-bias drive scheme)
 crosstalk:true,
 crosstalkAmount:.25,
 // Ionic image retention (slow, DC-induced charge).
 retention:true,
 retentionStrength:.14,
 retentionChargeS:12,
 retentionReleaseS:6,
 // Reflector shadow: the image layer sits above a mirror behind rear glass.
 shadow:true,
 lightAngleDeg:35,   // light angle from the panel normal
 lightAzimuthDeg:315,// direction the light comes FROM: 0 top, 90 right, clockwise
 glassMm:.7,
 shadowStrength:.35,
 lightSpread:.35,
 // Fringe fields soften electrode edges.
 softEdges:true,
 edgeSoftnessMm:.05,
 // Optics: sRGB 0-255 colours of the undriven panel and of fully driven ink.
 background:[164,170,146],
 ink:[30,36,26],
 inkDepth:.92
});

export const PARAM_RANGES=Object.freeze({
 relaxMs:[20,800],minSwitchMs:[2,100],thresholdV:[.3,.8],steepnessV:[.02,.2],
 bias:[0,.5],crosstalkAmount:[0,.6],
 retentionStrength:[0,.5],retentionChargeS:[1,120],retentionReleaseS:[1,120],
 lightAngleDeg:[0,75],lightAzimuthDeg:[0,360],glassMm:[0,2],shadowStrength:[0,.9],lightSpread:[0,1],
 edgeSoftnessMm:[0,.4],inkDepth:[.3,1]
});

export function normalizeParams(input){
 const out={...DEFAULT_PARAMS};
 for(const [key,value] of Object.entries(input||{})){
  if(!(key in DEFAULT_PARAMS))continue;
  const fallback=DEFAULT_PARAMS[key];
  if(typeof fallback==='boolean')out[key]=Boolean(value);
  else if(typeof fallback==='number'){
   const n=Number(value);
   if(!Number.isFinite(n))continue;
   const range=PARAM_RANGES[key];
   out[key]=range?Math.min(range[1],Math.max(range[0],n)):n;
  }else if(Array.isArray(fallback)&&Array.isArray(value)&&value.length===3&&value.every(Number.isFinite)){
   out[key]=value.map(c=>Math.min(255,Math.max(0,c)));
  }
 }
 return Object.freeze(out);
}

const clamp01=v=>Math.min(1,Math.max(0,v));
const sigmoid=(v,p)=>1/(1+Math.exp(-(v-p.thresholdV)/p.steepnessV));

/** Optical darkness (0 = clear, 1 = fully dark) reached at steady state for an RMS voltage. */
export function electroOptic(v,p=DEFAULT_PARAMS){
 const lo=sigmoid(0,p),hi=sigmoid(1,p);
 return clamp01((sigmoid(v,p)-lo)/(hi-lo));
}

/** Liquid-crystal time constant. Driving is faster above threshold (tau_on =
 * tau_off / ((V/Vth)^2 - 1)); relaxing back has no field to help it. */
export function switchingTimeMs(v,target,current,p=DEFAULT_PARAMS){
 if(target<=current)return p.relaxMs;
 const over=(v/p.thresholdV)**2-1;
 if(over<=1e-3)return p.relaxMs;
 return Math.max(p.minSwitchMs,p.relaxMs/over);
}

/** Exact exponential approach, so results do not depend on frame rate. */
export function stepToward(current,target,dtMs,tauMs){
 return current+(target-current)*(1-Math.exp(-dtMs/Math.max(1e-6,tauMs)));
}

/** One point of glass for dtMs. Mirrors the GPU update pass.
 * The crystal state d relaxes toward its target with time constant a, and the
 * retained charge r follows d with time constant b. Both are solved exactly
 * over the step (a linear two-stage cascade), so any frame rate gives the same
 * result for the same elapsed time. */
export function stepPixel(state,v,dtMs,p=DEFAULT_PARAMS){
 const target=electroOptic(v,p);
 const x0=state.d-target,y0=state.r-target;
 const a=p.response?switchingTimeMs(v,target,state.d,p):0;
 const ea=a>0?Math.exp(-dtMs/a):0;
 const d=target+x0*ea;
 if(!p.retention)return {d,r:d};
 const charging=state.d>state.r||(state.d===state.r&&target>state.r);
 const b=(charging?p.retentionChargeS:p.retentionReleaseS)*1000;
 const eb=Math.exp(-dtMs/b);
 let coupled=0;
 if(a>0)coupled=Math.abs(a-b)>1e-6*b?x0*a/(a-b)*(ea-eb):x0*(dtMs/b)*eb;
 return {d,r:target+y0*eb+coupled};
}

/** Darkness seen by the viewer, including retained charge. Mirrors the display pass. */
export function visibleDarkness({d,r},p=DEFAULT_PARAMS){
 return p.retention?clamp01(d+p.retentionStrength*(r-d)):d;
}

/** Shadow displacement on the reflector, refracted through rear glass of index n. */
export function reflectorShadowOffsetMm(glassMm,lightAngleDeg,refractiveIndex=1.5){
 const inside=Math.asin(Math.sin(lightAngleDeg*Math.PI/180)/refractiveIndex);
 return glassMm*Math.tan(inside);
}

/** Shadow vector in screen millimetres (y down). The shadow falls away from the light. */
export function shadowVectorMm(p=DEFAULT_PARAMS){
 const distance=reflectorShadowOffsetMm(p.glassMm,p.lightAngleDeg);
 const azimuth=p.lightAzimuthDeg*Math.PI/180;
 return {x:-Math.sin(azimuth)*distance,y:Math.cos(azimuth)*distance};
}

/** RMS drive per electrode. On electrodes get full voltage. Off electrodes get
 * the bias voltage, lifted by crosstalk in proportion to how many electrodes on
 * the same drive line are on. */
export function multiplexVoltages(electrodes,p=DEFAULT_PARAMS){
 const lines=new Map();
 for(const e of electrodes){
  const line=lines.get(e.line)||{on:0,total:0};
  line.total++;if(e.on)line.on++;
  lines.set(e.line,line);
 }
 const base=p.ghost?p.bias:0,out=new Map();
 for(const e of electrodes){
  if(e.on){out.set(e.id,1);continue;}
  const line=lines.get(e.line),load=line.total?line.on/line.total:0;
  out.set(e.id,base+(p.crosstalk?p.crosstalkAmount*load*(1-base):0));
 }
 return out;
}

export function srgbToLinear(c){
 const v=c/255;
 return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
}

/** Canvas colour that encodes a drive voltage (fraction of Vop). */
export function driveColor(v){
 const g=Math.round(clamp01(v)*255);
 return 'rgb('+g+','+g+','+g+')';
}

const VERT=`#version 300 es
void main(){
 vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
 gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;

// Separable Gaussian on the drive field: fringe fields at electrode edges.
const BLUR_FS=`#version 300 es
precision highp float;
uniform sampler2D uSrc;uniform ivec2 uDir;uniform ivec2 uSize;uniform float uSigma;
out vec4 o;
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 int radius=min(24,int(ceil(uSigma*2.5)));
 float sum=0.0,weights=0.0;
 for(int i=-24;i<=24;i++){
  if(i<-radius||i>radius)continue;
  ivec2 q=clamp(p+uDir*i,ivec2(0),uSize-1);
  float w=exp(-0.5*float(i*i)/(uSigma*uSigma));
  sum+=w*texelFetch(uSrc,q,0).r;weights+=w;
 }
 o=vec4(sum/weights,0.0,0.0,1.0);
}`;

// Fraction of each fine-matrix row (axis 0) or column (axis 1) that is driven.
const LOAD_FS=`#version 300 es
precision highp float;
uniform sampler2D uDrive;uniform ivec4 uRegion;uniform int uAxis;uniform float uBase;
out vec4 o;
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 float sum=0.0;int n=0;
 float span=max(1e-4,1.0-uBase);
 if(uAxis==0){
  if(p.y>=uRegion.y&&p.y<uRegion.w)
   for(int x=uRegion.x;x<uRegion.z;x++){sum+=max(0.0,texelFetch(uDrive,ivec2(x,p.y),0).r-uBase)/span;n++;}
 }else{
  if(p.x>=uRegion.x&&p.x<uRegion.z)
   for(int y=uRegion.y;y<uRegion.w;y++){sum+=max(0.0,texelFetch(uDrive,ivec2(p.x,y),0).r-uBase)/span;n++;}
 }
 o=vec4(n>0?sum/float(n):0.0,0.0,0.0,1.0);
}`;

// Liquid-crystal response and image retention. Mirrors stepPixel().
const UPDATE_FS=`#version 300 es
precision highp float;
uniform sampler2D uDrive,uState,uRows,uCols;
uniform ivec4 uRegion;
uniform float uDt,uRelax,uMinSwitch,uVth,uSteep,uXt,uCharge,uRelease;
uniform bool uResponse,uRetention;
out vec4 o;
float sig(float v){return 1.0/(1.0+exp(-(v-uVth)/uSteep));}
float eo(float v){float lo=sig(0.0),hi=sig(1.0);return clamp((sig(v)-lo)/(hi-lo),0.0,1.0);}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 float v=texelFetch(uDrive,p,0).r;
 if(uXt>0.0&&p.x>=uRegion.x&&p.x<uRegion.z&&p.y>=uRegion.y&&p.y<uRegion.w){
  float load=0.5*(texelFetch(uRows,ivec2(0,p.y),0).r+texelFetch(uCols,ivec2(p.x,0),0).r);
  v+=uXt*load*(1.0-v);
 }
 float target=eo(v);
 vec2 s=texelFetch(uState,p,0).rg;
 float x0=s.x-target,y0=s.y-target;
 float a=0.0;
 if(uResponse){
  a=uRelax;
  if(target>s.x){float over=(v/uVth)*(v/uVth)-1.0;if(over>1e-3)a=max(uMinSwitch,uRelax/over);}
 }
 float ea=a>0.0?exp(-uDt/a):0.0;
 float d=target+x0*ea,r=d;
 if(uRetention){
  bool charging=s.x>s.y||(s.x==s.y&&target>s.y);
  float b=charging?uCharge:uRelease,eb=exp(-uDt/b),coupled=0.0;
  if(a>0.0)coupled=abs(a-b)>1e-6*b?x0*a/(a-b)*(ea-eb):x0*(uDt/b)*eb;
  r=target+y0*eb+coupled;
 }
 o=vec4(d,r,0.0,1.0);
}`;

// Reflective optics in linear light, then the offset reflector shadow.
const DISPLAY_FS=`#version 300 es
precision highp float;
uniform sampler2D uState;uniform ivec2 uSize;
uniform vec3 uBg,uInk;uniform float uDepth,uRet;uniform bool uRetention,uShadow;
uniform vec2 uShadowPx;uniform float uShadowStrength,uSpreadPx;
out vec4 o;
float dark(ivec2 q){
 q=clamp(q,ivec2(0),uSize-1);
 vec2 s=texelFetch(uState,q,0).rg;
 return uRetention?clamp(s.x+uRet*(s.y-s.x),0.0,1.0):s.x;
}
float darkAt(vec2 c){
 vec2 f=c-0.5;ivec2 i=ivec2(floor(f));vec2 t=fract(f);
 return mix(mix(dark(i),dark(i+ivec2(1,0)),t.x),mix(dark(i+ivec2(0,1)),dark(i+ivec2(1,1)),t.x),t.y);
}
vec3 toSRGB(vec3 c){
 return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));
}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 float a=dark(p)*uDepth;
 vec3 color=mix(uBg,uInk,a);
 if(uShadow){
  vec2 c=gl_FragCoord.xy-uShadowPx;
  float s=0.4*darkAt(c)+0.15*(darkAt(c+vec2(uSpreadPx,0.0))+darkAt(c-vec2(uSpreadPx,0.0))
   +darkAt(c+vec2(0.0,uSpreadPx))+darkAt(c-vec2(0.0,uSpreadPx)));
  color*=1.0-uShadowStrength*s*uDepth;
 }
 o=vec4(toSRGB(color),1.0);
}`;

export function createVectorLCD(canvas,options={}){
 const {widthMm,heightMm,maxPixelRatio=2}=options;
 if(!(widthMm>0)||!(heightMm>0))throw new TypeError('Vector LCD needs a positive panel size in millimetres');
 let params=normalizeParams(options.params);
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,
  premultipliedAlpha:false,preserveDrawingBuffer:false});
 if(!gl)throw new Error('This browser does not provide WebGL2, which Vector LCD needs.');
 const drive=document.createElement('canvas');
 const dctx=drive.getContext('2d');
 const electrodes=new Map();
 const artCache=new WeakMap();
 let zone=null,zoneDraw=null,currentBase=params.bias;
 let W=0,H=0,pxPerMm=1,lastTime=null,lost=false,current=0,gpu=null;
 const fps={value:0,clock:0,frames:0};

 const BYTE={internal:gl.RGBA8,format:gl.RGBA,type:gl.UNSIGNED_BYTE,name:'8-bit',float:false};

 function compile(type,source){
  const s=gl.createShader(type);
  gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Vector LCD shader: '+gl.getShaderInfoLog(s));
  return s;
 }
 function program(fragment){
  const p=gl.createProgram();
  const vs=compile(gl.VERTEX_SHADER,VERT),fs=compile(gl.FRAGMENT_SHADER,fragment);
  gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);
  gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('Vector LCD program: '+gl.getProgramInfoLog(p));
  const locations=new Map();
  return {p,u(name){if(!locations.has(name))locations.set(name,gl.getUniformLocation(p,name));return locations.get(name);}};
 }
 function makeTarget(w,h,fmt){
  const tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,tex);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],
   [gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
  gl.texImage2D(gl.TEXTURE_2D,0,fmt.internal,w,h,0,fmt.format,fmt.type,null);
  const fb=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return {tex,fb,w,h,ok};
 }
 function destroyTarget(t){if(!t)return;gl.deleteFramebuffer(t.fb);gl.deleteTexture(t.tex);}
 function chooseStateFormat(){
  const candidates=[];
  if(gl.getExtension('EXT_color_buffer_float'))candidates.push(
   {internal:gl.RG32F,format:gl.RG,type:gl.FLOAT,name:'32-bit float',float:true},
   {internal:gl.RGBA16F,format:gl.RGBA,type:gl.HALF_FLOAT,name:'16-bit float',float:true});
  else if(gl.getExtension('EXT_color_buffer_half_float'))candidates.push(
   {internal:gl.RGBA16F,format:gl.RGBA,type:gl.HALF_FLOAT,name:'16-bit float',float:true});
  candidates.push(BYTE);
  for(const fmt of candidates){
   const t=makeTarget(1,1,fmt);const ok=t.ok;destroyTarget(t);
   if(ok)return fmt;
  }
  throw new Error('Vector LCD could not create a render target');
 }
 function init(){
  gpu={vao:gl.createVertexArray(),fmt:chooseStateFormat(),
   blur:program(BLUR_FS),load:program(LOAD_FS),update:program(UPDATE_FS),display:program(DISPLAY_FS),
   driveTex:null,soft:null,softTmp:null,rows:null,cols:null,states:[null,null]};
  if(W&&H)allocate();
 }
 function allocate(){
  for(const key of ['soft','softTmp','rows','cols'])destroyTarget(gpu[key]);
  gpu.states.forEach(destroyTarget);
  if(gpu.driveTex)gl.deleteTexture(gpu.driveTex);
  gpu.driveTex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,gpu.driveTex);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],
   [gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gpu.soft=makeTarget(W,H,BYTE);gpu.softTmp=makeTarget(W,H,BYTE);
  gpu.rows=makeTarget(1,H,BYTE);gpu.cols=makeTarget(W,1,BYTE);
  gpu.states=[makeTarget(W,H,gpu.fmt),makeTarget(W,H,gpu.fmt)];
  resetState();
 }
 function resetState(){
  if(!gpu||lost)return;
  gl.clearColor(0,0,0,0);
  for(const t of gpu.states){if(!t)continue;gl.bindFramebuffer(gl.FRAMEBUFFER,t.fb);gl.clear(gl.COLOR_BUFFER_BIT);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  lastTime=null;
 }
 function bindTexture(prog,unit,name,tex){
  gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(prog.u(name),unit);
 }
 function run(prog,target,w,h,setup){
  gl.bindFramebuffer(gl.FRAMEBUFFER,target?target.fb:null);
  gl.viewport(0,0,w,h);gl.useProgram(prog.p);setup(prog);
  gl.bindVertexArray(gpu.vao);gl.drawArrays(gl.TRIANGLES,0,3);
 }

 function rasterizeArt(source,wPx,hPx,on,base){
  const c=document.createElement('canvas');c.width=wPx;c.height=hPx;
  const x=c.getContext('2d');
  if(typeof source==='function')source(x,wPx,hPx);
  else{
   const sw=source.naturalWidth||source.videoWidth||source.width,sh=source.naturalHeight||source.videoHeight||source.height;
   if(sw>0&&sh>0){const s=Math.min(wPx/sw,hPx/sh);x.drawImage(source,(wPx-sw*s)/2,(hPx-sh*s)/2,sw*s,sh*s);}
  }
  try{
   // Dark parts of the art are driven harder; light parts sit at the bias.
   const image=x.getImageData(0,0,wPx,hPx),d=image.data;
   for(let i=0;i<d.length;i+=4){
    const a=d[i+3]/255;
    if(!a){d[i]=d[i+1]=d[i+2]=0;continue;}
    const dark=1-(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;
    const g=Math.round(a*(on?base+(1-base)*dark:base)*255);
    d[i]=d[i+1]=d[i+2]=g;d[i+3]=255;
   }
   x.putImageData(image,0,0);
  }catch(error){
   // A tainted source cannot be read back; drive its silhouette at one level.
   x.globalCompositeOperation='source-in';x.fillStyle=driveColor(on?1:base);x.fillRect(0,0,wPx,hPx);
  }
  return c;
 }
 function artCanvas(source,wMm,hMm,on=true,base=currentBase){
  const wPx=Math.max(1,Math.round(wMm*pxPerMm)),hPx=Math.max(1,Math.round(hMm*pxPerMm));
  const key=wPx+'x'+hPx+':'+(on?1:0)+':'+Math.round(base*255);
  let entry=artCache.get(source);
  if(!entry){entry=new Map();artCache.set(source,entry);}
  let c=entry.get(key);
  if(!c){if(entry.size>12)entry.clear();c=rasterizeArt(source,wPx,hPx,on,base);entry.set(key,c);}
  return c;
 }
 const tools=Object.freeze({level:driveColor,art:(source,wMm,hMm,on=true)=>artCanvas(source,wMm,hMm,on,currentBase)});

 function composeDrive(t){
  const base=params.ghost?params.bias:0;currentBase=base;
  const c=dctx;
  c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-over';c.globalAlpha=1;
  c.fillStyle='#000';c.fillRect(0,0,W,H);
  c.setTransform(pxPerMm,0,0,pxPerMm,0,0);
  if(zone){
   c.fillStyle=driveColor(base);c.fillRect(zone.x,zone.y,zone.w,zone.h);
   if(zoneDraw){
    c.save();c.beginPath();c.rect(zone.x,zone.y,zone.w,zone.h);c.clip();
    c.globalCompositeOperation='lighten';
    try{zoneDraw(c,t,tools);}catch(error){console.error('Vector LCD zone drawing failed',error);}
    c.restore();
   }
  }
  c.globalCompositeOperation='lighten';
  const list=[...electrodes.values()];
  const volts=multiplexVoltages(list,params);
  for(const e of list){
   const v=volts.get(e.id);
   if(e.path){c.fillStyle=driveColor(v);c.fill(e.path,e.fillRule);}
   else if(e.art){const a=e.art;c.drawImage(artCanvas(a.source,a.w,a.h,e.on,e.on?base:v),a.x,a.y,a.w,a.h);}
  }
  c.globalCompositeOperation='source-over';
 }

 function zonePixels(){
  if(!zone)return [0,0,0,0];
  const x0=Math.max(0,Math.round(zone.x*pxPerMm)),x1=Math.min(W,Math.round((zone.x+zone.w)*pxPerMm));
  const y0=Math.max(0,Math.round(zone.y*pxPerMm)),y1=Math.min(H,Math.round((zone.y+zone.h)*pxPerMm));
  return [x0,H-y1,x1,H-y0]; // WebGL rows start at the bottom
 }

 function frame(now=performance.now()){
  if(lost||!gpu||!W||!H)return;
  const dt=lastTime===null?1000/60:Math.min(100,Math.max(0,now-lastTime));
  lastTime=now;
  fps.frames++;fps.clock+=dt;
  if(fps.clock>=1000){fps.value=Math.round(fps.frames*1000/fps.clock);fps.frames=0;fps.clock=0;}
  composeDrive(now/1000);
  gl.bindTexture(gl.TEXTURE_2D,gpu.driveTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,drive);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);

  let driveField=gpu.driveTex;
  const sigma=params.softEdges?params.edgeSoftnessMm*pxPerMm:0;
  if(sigma>=.3){
   run(gpu.blur,gpu.softTmp,W,H,p=>{bindTexture(p,0,'uSrc',gpu.driveTex);gl.uniform2i(p.u('uDir'),1,0);
    gl.uniform2i(p.u('uSize'),W,H);gl.uniform1f(p.u('uSigma'),sigma);});
   run(gpu.blur,gpu.soft,W,H,p=>{bindTexture(p,0,'uSrc',gpu.softTmp.tex);gl.uniform2i(p.u('uDir'),0,1);
    gl.uniform2i(p.u('uSize'),W,H);gl.uniform1f(p.u('uSigma'),sigma);});
   driveField=gpu.soft.tex;
  }
  const region=zonePixels();
  const fineCrosstalk=zone&&params.crosstalk?params.crosstalkAmount:0;
  if(fineCrosstalk>0){
   for(const [axis,target,w,h] of [[0,gpu.rows,1,H],[1,gpu.cols,W,1]])
    run(gpu.load,target,w,h,p=>{bindTexture(p,0,'uDrive',gpu.driveTex);gl.uniform4i(p.u('uRegion'),...region);
     gl.uniform1i(p.u('uAxis'),axis);gl.uniform1f(p.u('uBase'),currentBase);});
  }
  const from=gpu.states[current],to=gpu.states[1-current];
  run(gpu.update,to,W,H,p=>{
   bindTexture(p,0,'uDrive',driveField);bindTexture(p,1,'uState',from.tex);
   bindTexture(p,2,'uRows',gpu.rows.tex);bindTexture(p,3,'uCols',gpu.cols.tex);
   gl.uniform4i(p.u('uRegion'),...region);
   gl.uniform1f(p.u('uDt'),dt);gl.uniform1f(p.u('uRelax'),params.relaxMs);
   gl.uniform1f(p.u('uMinSwitch'),params.minSwitchMs);gl.uniform1f(p.u('uVth'),params.thresholdV);
   gl.uniform1f(p.u('uSteep'),params.steepnessV);gl.uniform1f(p.u('uXt'),fineCrosstalk);
   gl.uniform1f(p.u('uCharge'),params.retentionChargeS*1000);gl.uniform1f(p.u('uRelease'),params.retentionReleaseS*1000);
   gl.uniform1i(p.u('uResponse'),params.response?1:0);gl.uniform1i(p.u('uRetention'),params.retention?1:0);
  });
  current=1-current;
  const shadow=shadowVectorMm(params);
  run(gpu.display,null,W,H,p=>{
   bindTexture(p,0,'uState',to.tex);gl.uniform2i(p.u('uSize'),W,H);
   gl.uniform3f(p.u('uBg'),...params.background.map(srgbToLinear));
   gl.uniform3f(p.u('uInk'),...params.ink.map(srgbToLinear));
   gl.uniform1f(p.u('uDepth'),params.inkDepth);gl.uniform1f(p.u('uRet'),params.retentionStrength);
   gl.uniform1i(p.u('uRetention'),params.retention?1:0);gl.uniform1i(p.u('uShadow'),params.shadow?1:0);
   gl.uniform2f(p.u('uShadowPx'),shadow.x*pxPerMm,-shadow.y*pxPerMm);
   gl.uniform1f(p.u('uShadowStrength'),params.shadowStrength);
   gl.uniform1f(p.u('uSpreadPx'),params.lightSpread*params.glassMm*.5*pxPerMm);
  });
 }

 function resize(cssWidth,cssHeight,devicePixelRatio=1){
  const fit=Math.max(1e-6,Math.min(cssWidth/widthMm,cssHeight/heightMm));
  const outW=Math.max(1,Math.floor(widthMm*fit)),outH=Math.max(1,Math.floor(heightMm*fit));
  const maxSize=gl.getParameter(gl.MAX_TEXTURE_SIZE)||4096;
  const ratio=Math.max(1,Math.min(maxPixelRatio,devicePixelRatio||1,maxSize/outW,maxSize/outH));
  const pxW=Math.max(1,Math.round(outW*ratio)),pxH=Math.max(1,Math.round(outH*ratio));
  canvas.style.width=outW+'px';canvas.style.height=outH+'px';
  if(pxW!==W||pxH!==H){
   W=pxW;H=pxH;canvas.width=W;canvas.height=H;drive.width=W;drive.height=H;
   pxPerMm=W/widthMm;
   if(gpu&&!lost)allocate();
  }
  return {width:outW,height:outH,pixelRatio:ratio,pxPerMm};
 }

 function addElectrode({id,line='default',path=null,fillRule='nonzero',art=null,on=false}){
  if(id===undefined||id===null)throw new TypeError('An electrode needs an id');
  if(!path&&!art)throw new TypeError('An electrode needs a path or art');
  const shape=typeof path==='string'?new Path2D(path):path;
  electrodes.set(id,{id,line,path:shape,fillRule,art,on:Boolean(on)});
 }
 function setOn(id,on){const e=electrodes.get(id);if(e)e.on=Boolean(on);}

 function sample(xMm,yMm){
  if(!gpu||lost)return null;
  const x=Math.min(W-1,Math.max(0,Math.floor(xMm*pxPerMm))),y=Math.min(H-1,Math.max(0,H-1-Math.floor(yMm*pxPerMm)));
  gl.bindFramebuffer(gl.FRAMEBUFFER,gpu.states[current].fb);
  let d,r;
  if(gpu.fmt.float){const out=new Float32Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.FLOAT,out);[d,r]=out;}
  else{const out=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);d=out[0]/255;r=out[1]/255;}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return {d,r};
 }

 function onLost(event){event.preventDefault();lost=true;}
 function onRestored(){lost=false;gpu=null;init();}
 canvas.addEventListener('webglcontextlost',onLost);
 canvas.addEventListener('webglcontextrestored',onRestored);
 init();

 return Object.freeze({
  get params(){return params;},
  setParams(next){params=normalizeParams({...params,...next});},
  resize,frame,resetState,addElectrode,setOn,
  removeElectrode(id){electrodes.delete(id);},
  clearElectrodes(){electrodes.clear();},
  setZone(rectMm,draw=null){zone=rectMm?{...rectMm}:null;zoneDraw=draw;},
  sample,
  info(){return {engineVersion:ENGINE_VERSION,stateFormat:gpu?.fmt.name??'none',width:W,height:H,
   pxPerMm,fps:fps.value,contextLost:lost};},
  dispose(){
   canvas.removeEventListener('webglcontextlost',onLost);
   canvas.removeEventListener('webglcontextrestored',onRestored);
   if(gpu&&!lost){
    for(const key of ['soft','softTmp','rows','cols'])destroyTarget(gpu[key]);
    gpu.states.forEach(destroyTarget);gl.deleteTexture(gpu.driveTex);gl.deleteVertexArray(gpu.vao);
    for(const key of ['blur','load','update','display'])gl.deleteProgram(gpu[key].p);
   }
   gpu=null;electrodes.clear();
  }
 });
}

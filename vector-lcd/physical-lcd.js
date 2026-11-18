/* Physical LCD renderer.
 *
 * Renders digital content through a screen profile computed from physics and
 * datasheets (see tools/reflective_tn.py and profiles/*.json). The renderer
 * adds nothing of its own: every frame is
 *   content gray -> drive voltage (the profile's drive table)
 *   -> director state, relaxing with the profile's measured time constants
 *   -> double-pass reflective optics R(a_entry, a_exit) from the profile's table,
 *      where the entry point is offset by refraction through the rear glass.
 *      Light from a source of finite size adds up over many entry points, so
 *      the light *entering* the glass is blurred (separable Gaussian along and
 *      across the light's direction), never the director state.
 * Content is digital and free: the glass is treated as a grid finer than the
 * device pixel, so any art can be shown. That is the one stated compromise.
 *
 * Pure model functions are exported for testing; the shaders mirror them.
 */
export const PHYSICAL_LCD_VERSION='0.3.0';

const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const interp=(x,xs,ys)=>{
 if(x<=xs[0])return ys[0];
 for(let i=1;i<xs.length;i++)if(x<=xs[i]){const t=(x-xs[i-1])/(xs[i]-xs[i-1]);return ys[i-1]+t*(ys[i]-ys[i-1]);}
 return ys[ys.length-1];
};

/** Drive voltage for an 8-bit content gray, using the profile's table. */
export function driveVoltage(profile,gray,mode='static'){
 const table=mode==='analog'?profile.drive.analog_by_gray:profile.drive.static_by_gray;
 return table[clamp(Math.round(gray),0,255)];
}
/** Equilibrium director state for a voltage. */
export function equilibriumState(profile,volts){
 return interp(volts,profile.drive.voltages,profile.drive.a_equilibrium);
}
/** Director time constant: field-driven switching speeds up as (V/Vth)^2 - 1;
 * relaxation has no field to help it. */
export function timeConstantMs(profile,volts,target,current){
 const {tau_on_at_Vop_ms:onOp,tau_off_ms:off,Vth,Vop}=profile.dynamics;
 if(target<=current)return off;
 const over=(volts/Vth)**2-1;
 if(over<=1e-3)return off;
 return onOp*((Vop/Vth)**2-1)/over;
}
/** Exact exponential step: identical results at any frame rate. */
export function stepState(profile,a,volts,dtMs){
 const target=equilibriumState(profile,volts);
 const tau=timeConstantMs(profile,volts,target,a);
 return target+(a-target)*Math.exp(-dtMs/tau);
}
/** Entry-point offset (mm, screen axes, y down) for light arriving at
 * lightAngleDeg from the normal, from azimuth (0 = from the top, clockwise).
 * Light refracts into the rear polarizer and glass; the viewer looks straight on. */
export function entryOffsetMm(profile,lightAngleDeg,azimuthDeg){
 const g=profile.sources.geometry,s=Math.sin(lightAngleDeg*Math.PI/180);
 const through=(t,n)=>t*Math.tan(Math.asin(clamp(s/n,-1,1)));
 const d=through(g.glass_mm,g.n_glass)+through(g.rear_polarizer_mm,g.n_polarizer);
 const az=azimuthDeg*Math.PI/180;
 // Light coming from the top enters further up than where it exits.
 return {x:Math.sin(az)*d,y:-Math.cos(az)*d};
}
/** Offset magnitude (mm) for light at angleDeg from the normal. */
function offsetMagnitudeMm(profile,angleDeg){
 const g=profile.sources.geometry,s=Math.sin(angleDeg*Math.PI/180);
 const through=(t,n)=>t*Math.tan(Math.asin(clamp(s/n,-1,1)));
 return through(g.glass_mm,g.n_glass)+through(g.rear_polarizer_mm,g.n_polarizer);
}
/** Where the light entering the glass comes from, for a room light whose
 * brightness falls off as a Gaussian with full width sourceDeg (half maximum).
 * Returns the mean entry offset and the spread along (radial) and across
 * (tangential) the light's direction, all in screen millimetres (y down). */
export function shadowKernel(profile,{angleDeg,azimuthDeg,sourceDeg}){
 const mean=entryOffsetMm(profile,angleDeg,azimuthDeg);
 const sigma=sourceDeg/(2*Math.sqrt(2*Math.LN2))*Math.PI/180;      // radians
 const h=.01,theta=angleDeg*Math.PI/180;
 const slope=(offsetMagnitudeMm(profile,angleDeg+h)-offsetMagnitudeMm(profile,Math.max(0,angleDeg-h)))
  /((angleDeg+h-Math.max(0,angleDeg-h))*Math.PI/180);               // mm per radian, radially
 const across=theta>1e-3?offsetMagnitudeMm(profile,angleDeg)/Math.sin(theta):slope; // mm per radian, tangentially
 const az=azimuthDeg*Math.PI/180;
 return {mean,radial:{x:Math.sin(az),y:-Math.cos(az)},
  sigmaRadialMm:slope*sigma,sigmaTangentialMm:across*sigma};
}
/** Reflectance from the profile's separable form: entry_k(a_in) . exit_k,c(a_out).
 * entryWeights may be a blur-averaged entry vector. */
export function entryVector(profile,a){
 const {rank,entry}=profile.factor,n=profile.lut.size;
 const u=clamp(a/profile.lut.a_max,0,1)*(n-1),i=Math.min(n-2,Math.floor(u)),f=u-i;
 return Array.from({length:rank},(_,k)=>(1-f)*entry[i*rank+k]+f*entry[(i+1)*rank+k]);
}
export function reflectanceFromEntry(profile,entryWeights,aOut){
 const {rank,exit}=profile.factor,n=profile.lut.size;
 const u=clamp(aOut/profile.lut.a_max,0,1)*(n-1),j=Math.min(n-2,Math.floor(u)),f=u-j;
 return [0,1,2].map(c=>entryWeights.reduce((sum,w,k)=>sum+w*((1-f)*exit[(j*3+c)*rank+k]+f*exit[((j+1)*3+c)*rank+k]),0));
}
/** Linear-sRGB reflectance for (entry state, exit state), bilinear in the table. */
export function reflectance(profile,aIn,aOut){
 const {size,a_max,linear_srgb:t}=profile.lut;
 const u=clamp(aIn/a_max,0,1)*(size-1),v=clamp(aOut/a_max,0,1)*(size-1);
 const i=Math.min(size-2,Math.floor(u)),j=Math.min(size-2,Math.floor(v)),fu=u-i,fv=v-j;
 const at=(a,b,k)=>t[(a*size+b)*3+k];
 return [0,1,2].map(k=>(1-fu)*((1-fv)*at(i,j,k)+fv*at(i,j+1,k))+fu*((1-fv)*at(i+1,j,k)+fv*at(i+1,j+1,k)));
}

const VERT=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;

const UPDATE_FS=`#version 300 es
precision highp float;
uniform sampler2D uContent,uState,uDrive,uEq;
uniform int uMode,uEqN;
uniform float uVmax,uDt,uTauOnOp,uTauOff,uVth,uVop;
out vec4 o;
float eq(float v){
 float x=clamp(v/uVmax,0.0,1.0)*float(uEqN-1);
 int i=min(uEqN-2,int(floor(x)));
 return mix(texelFetch(uEq,ivec2(i,0),0).r,texelFetch(uEq,ivec2(i+1,0),0).r,x-float(i));
}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 int gray=int(floor(texelFetch(uContent,p,0).r*255.0+0.5));
 float v=texelFetch(uDrive,ivec2(gray,uMode),0).r;
 float target=eq(v),a=texelFetch(uState,p,0).r;
 float tau=uTauOff;
 if(target>a){float over=(v/uVth)*(v/uVth)-1.0;if(over>1e-3)tau=uTauOnOp*((uVop/uVth)*(uVop/uVth)-1.0)/over;}
 o=vec4(target+(a-target)*exp(-uDt/tau),0.0,0.0,1.0);
}`;

// Light entering the glass at each point (rank-4 entry vector), stored
// normalized to [0,1] per component so 8-bit targets also work.
const ENTRY_FS=`#version 300 es
precision highp float;
uniform sampler2D uState,uEntryLut;uniform float uAmax,uN;uniform vec4 uLo,uSpan;
out vec4 o;
void main(){
 float a=texelFetch(uState,ivec2(gl_FragCoord.xy),0).r;
 vec4 e=texture(uEntryLut,vec2((clamp(a/uAmax,0.0,1.0)*(uN-1.0)+0.5)/uN,0.5));
 o=(e-uLo)/uSpan;
}`;

// One-dimensional Gaussian along any direction (two passes = elliptical blur).
const BLUR_FS=`#version 300 es
precision highp float;
uniform sampler2D uSrc;uniform vec2 uDir,uSize;uniform float uSigma;
out vec4 o;
void main(){
 vec2 p=gl_FragCoord.xy;
 if(uSigma<0.3){o=texture(uSrc,p/uSize);return;}
 int r=min(48,int(ceil(uSigma*3.0)));
 vec4 sum=vec4(0.0);float w=0.0;
 for(int i=-48;i<=48;i++){
  if(i<-r||i>r)continue;
  float k=exp(-0.5*float(i*i)/(uSigma*uSigma));
  sum+=k*texture(uSrc,(p+uDir*float(i))/uSize);w+=k;
 }
 o=sum/w;
}`;

// Exit point x, light that entered around x + mean offset.
const DISPLAY_FS=`#version 300 es
precision highp float;
uniform sampler2D uState,uField,uExitLut;
uniform vec2 uSize,uMean;uniform float uAmax,uN,uExposure;uniform vec4 uLo,uSpan;
out vec4 o;
vec3 toSRGB(vec3 c){c=clamp(c,0.0,1.0);return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
void main(){
 vec2 p=gl_FragCoord.xy;
 float aOut=texelFetch(uState,ivec2(p),0).r;
 vec4 e=uLo+uSpan*texture(uField,(p+uMean)/uSize);
 float x=(clamp(aOut/uAmax,0.0,1.0)*(uN-1.0)+0.5)/uN;
 vec3 r=vec3(dot(e,texture(uExitLut,vec2(x,0.5/3.0))),dot(e,texture(uExitLut,vec2(x,1.5/3.0))),
  dot(e,texture(uExitLut,vec2(x,2.5/3.0))));
 o=vec4(toSRGB(r*uExposure),1.0);
}`;

export async function loadProfile(url){
 const response=await fetch(url);
 if(!response.ok)throw new Error('Could not load the screen profile ('+response.status+')');
 return response.json();
}

export function createPhysicalLCD(canvas,{profile,widthMm,heightMm,maxPixelRatio=2}={}){
 if(!profile?.lut||!profile?.drive)throw new TypeError('A screen profile is required');
 if(!(widthMm>0)||!(heightMm>0))throw new TypeError('Panel size must be positive millimetres');
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false});
 if(!gl)throw new Error('This browser does not provide WebGL2, which the LCD renderer needs.');
 const content=document.createElement('canvas');
 const ctx=content.getContext('2d');
 let W=0,H=0,pxPerMm=1,last=null,current=0,lost=false,gpu=null,settle=false;
 let mode='static',lighting={angleDeg:30,azimuthDeg:0,sourceDeg:10,exposure:1};
 const fps={value:0,clock:0,frames:0};

 function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('LCD shader: '+gl.getShaderInfoLog(s));return s;}
 function program(fs){const p=gl.createProgram(),v=compile(gl.VERTEX_SHADER,VERT),f=compile(gl.FRAGMENT_SHADER,fs);
  gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('LCD program: '+gl.getProgramInfoLog(p));
  const cache=new Map();return {p,u:n=>{if(!cache.has(n))cache.set(n,gl.getUniformLocation(p,n));return cache.get(n);}};}
 function texture(filter=gl.NEAREST){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
 function target(w,h,fmt){const tex=texture();gl.texImage2D(gl.TEXTURE_2D,0,fmt.internal,w,h,0,fmt.format,fmt.type,null);
  const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return {tex,fb,ok};}
 function stateFormat(){
  const list=[];
  if(gl.getExtension('EXT_color_buffer_float'))list.push({internal:gl.R32F,format:gl.RED,type:gl.FLOAT,name:'32-bit float',float:true},
   {internal:gl.RGBA16F,format:gl.RGBA,type:gl.HALF_FLOAT,name:'16-bit float',float:true});
  list.push({internal:gl.RGBA8,format:gl.RGBA,type:gl.UNSIGNED_BYTE,name:'8-bit',float:false});
  for(const f of list){const t=target(1,1,f);gl.deleteFramebuffer(t.fb);gl.deleteTexture(t.tex);if(t.ok)return f;}
  throw new Error('No render target format available');
 }
 // The blurred entry field needs filtering; half floats filter in WebGL2.
 function fieldFormat(){
  const list=[];
  if(gl.getExtension('EXT_color_buffer_float')||gl.getExtension('EXT_color_buffer_half_float'))
   list.push({internal:gl.RGBA16F,format:gl.RGBA,type:gl.HALF_FLOAT,name:'16-bit float'});
  list.push({internal:gl.RGBA8,format:gl.RGBA,type:gl.UNSIGNED_BYTE,name:'8-bit'});
  for(const f of list){const t=target(1,1,f);gl.deleteFramebuffer(t.fb);gl.deleteTexture(t.tex);if(t.ok)return f;}
  throw new Error('No field format available');
 }
 function init(){
  const fmt=stateFormat();
  gpu={fmt,fieldFmt:fieldFormat(),vao:gl.createVertexArray(),update:program(UPDATE_FS),entry:program(ENTRY_FS),
   blur:program(BLUR_FS),display:program(DISPLAY_FS),
   content:texture(),drive:texture(),eq:texture(),entryLut:texture(gl.LINEAR),exitLut:texture(gl.LINEAR),
   states:[],fields:[]};
  const d=profile.drive,n=d.voltages.length;
  gl.bindTexture(gl.TEXTURE_2D,gpu.drive);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,256,2,0,gl.RED,gl.FLOAT,new Float32Array([...d.static_by_gray,...d.analog_by_gray]));
  gl.bindTexture(gl.TEXTURE_2D,gpu.eq);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,n,1,0,gl.RED,gl.FLOAT,new Float32Array(d.a_equilibrium));
  const F=profile.factor,G=profile.lut.size;
  if(F.rank!==4)throw new Error('The renderer expects a rank-4 profile factorization');
  gl.bindTexture(gl.TEXTURE_2D,gpu.entryLut);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,G,1,0,gl.RGBA,gl.FLOAT,new Float32Array(F.entry));
  const exitRows=new Float32Array(G*3*4);
  for(let j=0;j<G;j++)for(let c=0;c<3;c++)for(let k=0;k<4;k++)exitRows[(c*G+j)*4+k]=F.exit[(j*3+c)*4+k];
  gl.bindTexture(gl.TEXTURE_2D,gpu.exitLut);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,G,3,0,gl.RGBA,gl.FLOAT,exitRows);
  const lo=[0,1,2,3].map(k=>Math.min(...Array.from({length:G},(_,i)=>F.entry[i*4+k])));
  const hi=[0,1,2,3].map(k=>Math.max(...Array.from({length:G},(_,i)=>F.entry[i*4+k])));
  gpu.lo=lo;gpu.span=hi.map((h,k)=>Math.max(1e-9,h-lo[k]));
  if(W&&H)allocate();
 }
 function allocate(){
  for(const s of [...gpu.states,...gpu.fields]){gl.deleteFramebuffer(s.fb);gl.deleteTexture(s.tex);}
  gpu.states=[target(W,H,gpu.fmt),target(W,H,gpu.fmt)];
  gpu.fields=[target(W,H,gpu.fieldFmt),target(W,H,gpu.fieldFmt)];
  // New textures have no history: let the crystal settle to the current image.
  settle=true;
  for(const f of gpu.fields){gl.bindTexture(gl.TEXTURE_2D,f.tex);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);}
  gl.bindTexture(gl.TEXTURE_2D,gpu.content);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  reset();
 }
 function reset(){
  if(!gpu||lost)return;
  gl.clearColor(0,0,0,0);
  for(const s of gpu.states){gl.bindFramebuffer(gl.FRAMEBUFFER,s.fb);gl.clear(gl.COLOR_BUFFER_BIT);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);last=null;
 }
 function bind(p,unit,name,tex){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(p.u(name),unit);}
 function run(p,fb,setup){gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,W,H);gl.useProgram(p.p);setup(p);
  gl.bindVertexArray(gpu.vao);gl.drawArrays(gl.TRIANGLES,0,3);}

 /** Clears the content surface to unlit (white) and returns it in millimetres. */
 function beginContent(){
  ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  ctx.setTransform(pxPerMm,0,0,pxPerMm,0,0);
  return ctx;
 }

 function frame(now=performance.now()){
  if(lost||!gpu||!W)return;
  const dt=settle?1e6:last===null?1000/60:clamp(now-last,0,100);last=now;settle=false;
  fps.frames++;fps.clock+=dt;if(fps.clock>=1000){fps.value=Math.round(fps.frames*1000/fps.clock);fps.frames=0;fps.clock=0;}
  gl.bindTexture(gl.TEXTURE_2D,gpu.content);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,content);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  const dyn=profile.dynamics,d=profile.drive;
  const from=gpu.states[current],to=gpu.states[1-current];
  run(gpu.update,to.fb,p=>{
   bind(p,0,'uContent',gpu.content);bind(p,1,'uState',from.tex);bind(p,2,'uDrive',gpu.drive);bind(p,3,'uEq',gpu.eq);
   gl.uniform1i(p.u('uMode'),mode==='analog'?1:0);gl.uniform1i(p.u('uEqN'),d.voltages.length);
   gl.uniform1f(p.u('uVmax'),d.voltages[d.voltages.length-1]);gl.uniform1f(p.u('uDt'),dt);
   gl.uniform1f(p.u('uTauOnOp'),dyn.tau_on_at_Vop_ms);gl.uniform1f(p.u('uTauOff'),dyn.tau_off_ms);
   gl.uniform1f(p.u('uVth'),dyn.Vth);gl.uniform1f(p.u('uVop'),dyn.Vop);
  });
  current=1-current;
  const k=shadowKernel(profile,lighting);
  const lo=gpu.lo,span=gpu.span;
  run(gpu.entry,gpu.fields[0].fb,p=>{
   bind(p,0,'uState',to.tex);bind(p,1,'uEntryLut',gpu.entryLut);
   gl.uniform1f(p.u('uAmax'),profile.lut.a_max);gl.uniform1f(p.u('uN'),profile.lut.size);
   gl.uniform4fv(p.u('uLo'),lo);gl.uniform4fv(p.u('uSpan'),span);
  });
  // Screen y runs down; texture rows run up.
  const radial=[k.radial.x,-k.radial.y],across=[-radial[1],radial[0]];
  const blur=(src,dst,dir,sigmaMm)=>run(gpu.blur,dst.fb,p=>{
   bind(p,0,'uSrc',src.tex);gl.uniform2f(p.u('uDir'),dir[0],dir[1]);
   gl.uniform2f(p.u('uSize'),W,H);gl.uniform1f(p.u('uSigma'),sigmaMm*pxPerMm);
  });
  blur(gpu.fields[0],gpu.fields[1],radial,k.sigmaRadialMm);
  blur(gpu.fields[1],gpu.fields[0],across,k.sigmaTangentialMm);
  run(gpu.display,null,p=>{
   bind(p,0,'uState',to.tex);bind(p,1,'uField',gpu.fields[0].tex);bind(p,2,'uExitLut',gpu.exitLut);
   gl.uniform2f(p.u('uSize'),W,H);gl.uniform2f(p.u('uMean'),k.mean.x*pxPerMm,-k.mean.y*pxPerMm);
   gl.uniform1f(p.u('uAmax'),profile.lut.a_max);gl.uniform1f(p.u('uN'),profile.lut.size);
   gl.uniform1f(p.u('uExposure'),lighting.exposure);
   gl.uniform4fv(p.u('uLo'),lo);gl.uniform4fv(p.u('uSpan'),span);
  });
 }

 function resize(cssWidth,cssHeight,dpr=1){
  const fit=Math.max(1e-6,Math.min(cssWidth/widthMm,cssHeight/heightMm));
  const outW=Math.max(1,Math.floor(widthMm*fit)),outH=Math.max(1,Math.floor(heightMm*fit));
  const max=gl.getParameter(gl.MAX_TEXTURE_SIZE)||4096;
  const ratio=Math.max(1,Math.min(maxPixelRatio,dpr||1,max/outW,max/outH));
  const pw=Math.round(outW*ratio),ph=Math.round(outH*ratio);
  canvas.style.width=outW+'px';canvas.style.height=outH+'px';
  if(pw!==W||ph!==H){W=pw;H=ph;canvas.width=W;canvas.height=H;content.width=W;content.height=H;pxPerMm=W/widthMm;if(gpu&&!lost)allocate();}
  return {width:outW,height:outH,pxPerMm};
 }

 function sample(xMm,yMm){
  if(!gpu||lost)return null;
  const x=clamp(Math.floor(xMm*pxPerMm),0,W-1),y=clamp(H-1-Math.floor(yMm*pxPerMm),0,H-1);
  gl.bindFramebuffer(gl.FRAMEBUFFER,gpu.states[current].fb);
  let a;
  if(gpu.fmt.float){const out=new Float32Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.FLOAT,out);a=out[0];}
  else{const out=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);a=out[0]/255;}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return a;
 }

 const onLost=e=>{e.preventDefault();lost=true;};
 const onRestored=()=>{lost=false;gpu=null;init();};
 canvas.addEventListener('webglcontextlost',onLost);
 canvas.addEventListener('webglcontextrestored',onRestored);
 init();

 return Object.freeze({
  profile,beginContent,frame,resize,reset,sample,
  get mode(){return mode;},
  setMode(next){if(next!=='static'&&next!=='analog')throw new RangeError('Drive mode must be static or analog');mode=next;},
  get lighting(){return {...lighting};},
  setLighting(next){lighting={...lighting,...next};},
  info(){return {version:PHYSICAL_LCD_VERSION,stateFormat:gpu?.fmt.name??'none',fieldFormat:gpu?.fieldFmt.name??'none',width:W,height:H,pxPerMm,fps:fps.value,mode};},
  dispose(){canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);}
 });
}

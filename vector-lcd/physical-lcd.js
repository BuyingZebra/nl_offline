/* Physical LCD renderer.
 *
 * Renders digital content through a screen profile computed from physics and
 * datasheets (see tools/reflective_tn.py and profiles/*.json). The renderer
 * adds nothing of its own: every frame is
 *   content gray -> drive voltage (the profile's drive table)
 *   -> director state, relaxing with the profile's measured time constants
 *   -> double-pass reflective optics R(a_entry, a_exit) from the profile's table,
 *      where the entry point is offset by refraction through the rear glass.
 * Content is digital and free: the glass is treated as a grid finer than the
 * device pixel, so any art can be shown. That is the one stated compromise.
 *
 * Pure model functions are exported for testing; the shaders mirror them.
 */
export const PHYSICAL_LCD_VERSION='0.2.0';

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
/** A light source with angular diameter sourceDeg, sampled as a centre point
 * and a ring of six (equal weights). */
export function lightSamples(profile,{angleDeg,azimuthDeg,sourceDeg}){
 const out=[entryOffsetMm(profile,angleDeg,azimuthDeg)];
 const r=sourceDeg/2*.7071;
 if(r>0)for(let k=0;k<6;k++){
  const u=k*Math.PI/3;
  // Small-angle offsets in (angle, azimuth) space around the source centre.
  const dA=r*Math.cos(u),dZ=angleDeg>.5?r*Math.sin(u)/Math.sin(angleDeg*Math.PI/180):r*Math.sin(u);
  out.push(angleDeg>.5?entryOffsetMm(profile,Math.max(0,angleDeg+dA),azimuthDeg+dZ)
   :entryOffsetMm(profile,Math.hypot(dA,dZ),Math.atan2(dZ,dA)*180/Math.PI));
 }
 return out;
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

const DISPLAY_FS=`#version 300 es
precision highp float;
uniform sampler2D uState,uLut;
uniform ivec2 uSize;uniform float uAmax,uLutN,uExposure;
uniform vec2 uOffsets[7];uniform int uCount;
out vec4 o;
float stateAt(vec2 c){
 vec2 f=c-0.5;ivec2 i=ivec2(floor(f));vec2 t=fract(f);
 #define S(q) texelFetch(uState,clamp(q,ivec2(0),uSize-1),0).r
 return mix(mix(S(i),S(i+ivec2(1,0)),t.x),mix(S(i+ivec2(0,1)),S(i+ivec2(1,1)),t.x),t.y);
}
vec3 lut(float aIn,float aOut){
 vec2 uv=(vec2(clamp(aOut/uAmax,0.0,1.0),clamp(aIn/uAmax,0.0,1.0))*(uLutN-1.0)+0.5)/uLutN;
 return texture(uLut,uv).rgb;
}
vec3 toSRGB(vec3 c){c=clamp(c,0.0,1.0);return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
void main(){
 vec2 c=gl_FragCoord.xy;
 float aOut=texelFetch(uState,ivec2(c),0).r;
 vec3 sum=vec3(0.0);
 for(int k=0;k<7;k++){if(k>=uCount)break;sum+=lut(stateAt(c+uOffsets[k]),aOut);}
 o=vec4(toSRGB(sum/float(uCount)*uExposure),1.0);
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
 let W=0,H=0,pxPerMm=1,last=null,current=0,lost=false,gpu=null;
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
 function init(){
  const fmt=stateFormat();
  gpu={fmt,vao:gl.createVertexArray(),update:program(UPDATE_FS),display:program(DISPLAY_FS),
   content:texture(),drive:texture(),eq:texture(),lut:texture(gl.LINEAR),states:[]};
  const d=profile.drive,n=d.voltages.length;
  gl.bindTexture(gl.TEXTURE_2D,gpu.drive);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,256,2,0,gl.RED,gl.FLOAT,new Float32Array([...d.static_by_gray,...d.analog_by_gray]));
  gl.bindTexture(gl.TEXTURE_2D,gpu.eq);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,n,1,0,gl.RED,gl.FLOAT,new Float32Array(d.a_equilibrium));
  const L=profile.lut,rgba=new Float32Array(L.size*L.size*4);
  for(let i=0;i<L.size*L.size;i++){rgba[i*4]=L.linear_srgb[i*3];rgba[i*4+1]=L.linear_srgb[i*3+1];rgba[i*4+2]=L.linear_srgb[i*3+2];rgba[i*4+3]=1;}
  gl.bindTexture(gl.TEXTURE_2D,gpu.lut);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,L.size,L.size,0,gl.RGBA,gl.FLOAT,rgba);
  if(W&&H)allocate();
 }
 function allocate(){
  for(const s of gpu.states){gl.deleteFramebuffer(s.fb);gl.deleteTexture(s.tex);}
  gpu.states=[target(W,H,gpu.fmt),target(W,H,gpu.fmt)];
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
  const dt=last===null?1000/60:clamp(now-last,0,100);last=now;
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
  const samples=lightSamples(profile,lighting);
  const offsets=new Float32Array(14);
  // State texture rows run bottom-up, so screen y flips sign.
  samples.forEach((s,k)=>{offsets[k*2]=s.x*pxPerMm;offsets[k*2+1]=-s.y*pxPerMm;});
  run(gpu.display,null,p=>{
   bind(p,0,'uState',to.tex);bind(p,1,'uLut',gpu.lut);
   gl.uniform2i(p.u('uSize'),W,H);gl.uniform1f(p.u('uAmax'),profile.lut.a_max);
   gl.uniform1f(p.u('uLutN'),profile.lut.size);gl.uniform1f(p.u('uExposure'),lighting.exposure);
   gl.uniform2fv(p.u('uOffsets'),offsets);gl.uniform1i(p.u('uCount'),samples.length);
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
  info(){return {version:PHYSICAL_LCD_VERSION,stateFormat:gpu?.fmt.name??'none',width:W,height:H,pxPerMm,fps:fps.value,mode};},
  dispose(){canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);}
 });
}

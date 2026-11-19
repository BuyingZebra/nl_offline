/* Reflective STN screen with the Nintendo DMG-01's measured look and behaviour,
 * without its dot grid.
 *
 * Every number comes from profiles/dmg-01-stn.json, which tools/dmg01_profile.mjs
 * copies from Retro Display Lab (Apache-2.0, copyright 2026 JohnnySun; see
 * third_party/retro-display-lab/NOTICE). The time integration re-implements
 * Retro Display Lab's dmg01-response-v1.slang:
 *  - the art is quantized to the DMG's four drive levels;
 *  - each point carries a director coordinate q that drifts once per DMG frame
 *    (59.7275 Hz) by the generated STN table, interpolated across the contrast
 *    wheel's three conditions and scaled by an Arrhenius viscosity factor;
 *  - on a drive change q is projected onto the nominal optical branch;
 *  - ions slowly charge under a dark drive and release afterwards, leaving a
 *    faint image (sticking);
 *  - what the eye sees over a frame is the Simpson average of the optical
 *    state across it, mapped to the measured five-state palette in linear light.
 * The reflector shadow uses Retro Display Lab's measured strength and offset.
 * Because a gridless panel has no inter-pixel gaps, the shadow darkens a point
 * wherever the shifted image is darker than the point itself; flat areas keep
 * the measured palette exactly.
 * Pure model functions are exported for tests; the shaders mirror them. */
import {bezelShiftMm,bezelPenumbraMm,directionVector} from './physical-lcd.js';

export const DMG_STN_VERSION='0.1.0';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const mix=(a,b,f)=>a+(b-a)*f;

/** Drive level 0..3 for encoded sRGB components in [0, 1]. */
export function shadeFromRGB(r,g,b){
 const luma=.2126*r+.7152*g+.0722*b;
 return Math.floor(clamp(1-luma,0,1)*3+.5);
}
/** The two tabulated contrast conditions around a wheel setting and the mix between them. */
export function contrastConditions(profile,contrast){
 const [c0,c1,c2]=profile.contrast.conditions,c=clamp(contrast,c0,c2);
 return c<=c1?{low:0,high:1,fraction:(c-c0)/(c1-c0)}:{low:1,high:2,fraction:(c-c1)/(c2-c1)};
}
export function targetQ(profile,shade,contrast=1){
 const {low,high,fraction}=contrastConditions(profile,contrast),t=profile.stn.target_q;
 return mix(t[low*4+shade],t[high*4+shade],fraction);
}
function rowDrift(profile,condition,shade,q){
 const n=profile.stn.director_bins,d=profile.stn.drift_per_frame;
 const x=clamp(q,0,1)*(n-1),i=Math.min(n-2,Math.floor(x)),f=x-i,base=(condition*4+shade)*n+i;
 return mix(d[base],d[base+1],f);
}
/** Change of q over one DMG frame at the reference temperature. */
export function driftPerFrame(profile,shade,q,contrast=1){
 const {low,high,fraction}=contrastConditions(profile,contrast);
 return mix(rowDrift(profile,low,shade,q),rowDrift(profile,high,shade,q),fraction);
}
function opticalCorrection(profile,q){
 const A=profile.stn.optical_anchor_q,C=profile.stn.optical_correction,x=clamp(q,0,1);
 if(x<=A[0])return C[0]*x/Math.max(A[0],1e-6);
 for(let k=0;k<3;k++)if(x<=A[k+1])return mix(C[k],C[k+1],(x-A[k])/Math.max(A[k+1]-A[k],1e-6));
 return C[3]*(1-x)/Math.max(1-A[3],1e-6);
}
/** Optical state 0.25 (lightest driven shade) .. 1 (darkest) for director coordinate q. */
export function opticalState(profile,q){
 const n=profile.stn.optical_bins,o=profile.stn.optical;
 const x=clamp(q,0,1)*(n-1),i=Math.min(n-2,Math.floor(x));
 return clamp(mix(o[i],o[i+1],x-i)+opticalCorrection(profile,q),.25,1);
}
/** Unique q on the nominal branch that shows a given optical state. */
export function canonicalQ(profile,state){
 const s=clamp(state,.25,1),k=Math.min(Math.floor((s-.25)*4),2),A=profile.stn.optical_anchor_q;
 let lo=A[k],hi=A[k+1];
 for(let i=0;i<10;i++){const m=.5*(lo+hi);if(opticalState(profile,m)<s)lo=m;else hi=m;}
 return .5*(lo+hi);
}
export function temperatureScale(profile,celsius=20){
 const T=profile.temperature;
 return Math.exp(T.activation_K*(1/(T.reference_C+273.15)-1/(celsius+273.15)));
}
function ionicResponse(response,fraction){return 1-Math.pow(1-response,clamp(fraction,0,1));}
function ionicStep(profile,ionic,shade,fraction){
 const R=profile.retention,drive=shade/3;
 return ionic+(drive-ionic)*ionicResponse(drive>ionic?R.charge_per_frame:R.release_per_frame,fraction);
}
export function stickingVolts(profile){
 const R=profile.retention;return Math.max(R.sticking_volts_fit[0]*R.ionic_mobility+R.sticking_volts_fit[1],0);
}
/** Optical state the eye sees: the director plus any ionic sticking bias. */
export function displayedState(profile,q,ionic,shade){
 const bias=Math.max(ionic-shade/3,0)*stickingVolts(profile)*profile.retention.sticking_optical_gain;
 return clamp(opticalState(profile,q)+bias,.25,1);
}
/** One DMG frame for one point: returns the new state and the light it showed. */
export function stepFrame(profile,{q,ionic,shade:previous},shade,{contrast=1,celsius=20}={}){
 if(previous!==shade)q=canonicalQ(profile,opticalState(profile,q));
 const ts=temperatureScale(profile,celsius),d=driftPerFrame(profile,shade,q,contrast);
 const qm=clamp(q+d*.5*ts,0,1),qe=clamp(q+d*ts,0,1);
 const im=ionicStep(profile,ionic,shade,.5),ie=ionicStep(profile,ionic,shade,1);
 const light=(displayedState(profile,q,ionic,shade)+4*displayedState(profile,qm,im,shade)+displayedState(profile,qe,ie,shade))/6;
 return {q:qe,ionic:ie,shade,exposure:light};
}
const decode=v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);};
/** Linear-sRGB colour of an optical state (0 = LCD disabled, .25..1 = shades 0..3). */
export function opticalColor(profile,state){
 const P=profile.palette.srgb8,c=[P.disabled,...P.shades].map(rgb=>rgb.map(decode));
 const x=clamp(state,0,1)*4,k=Math.min(3,Math.floor(x));
 return [0,1,2].map(i=>mix(c[k][i],c[k+1][i],x-k));
}
/** Reflector-shadow offset in panel millimetres (x right, y down). */
export function shadowOffsetMm(profile){
 const [w,h]=profile.panel.active_mm,[cols,rows]=profile.panel.dots,[ox,oy]=profile.shadow.offset_dots;
 return {x:ox*w/cols,y:oy*h/rows};
}

const VERT=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;

// r = director q, g = ionic charge, b = drive level, a = light shown this frame.
const COMMON=`
uniform sampler2D uDrift,uOptical;
uniform float uTargetQ[12],uAnchorQ[4],uCorr[4];
uniform int uLo,uHi,uBins;uniform float uCondF;
float rowDrift(int c,int s,float q){
 float x=clamp(q,0.0,1.0)*float(uBins-1);int i=min(uBins-2,int(floor(x)));
 return mix(texelFetch(uDrift,ivec2(i,c*4+s),0).r,texelFetch(uDrift,ivec2(i+1,c*4+s),0).r,x-float(i));
}
float drift(int s,float q){return mix(rowDrift(uLo,s,q),rowDrift(uHi,s,q),uCondF);}
float targetQ(int s){return mix(uTargetQ[uLo*4+s],uTargetQ[uHi*4+s],uCondF);}
float corr(float q){
 float x=clamp(q,0.0,1.0);
 if(x<=uAnchorQ[0])return uCorr[0]*x/max(uAnchorQ[0],1e-6);
 for(int k=0;k<3;k++)if(x<=uAnchorQ[k+1])return mix(uCorr[k],uCorr[k+1],(x-uAnchorQ[k])/max(uAnchorQ[k+1]-uAnchorQ[k],1e-6));
 return uCorr[3]*(1.0-x)/max(1.0-uAnchorQ[3],1e-6);
}
float optical(float q){
 float x=clamp(q,0.0,1.0)*float(uBins-1);int i=min(uBins-2,int(floor(x)));
 return clamp(mix(texelFetch(uOptical,ivec2(i,0),0).r,texelFetch(uOptical,ivec2(i+1,0),0).r,x-float(i))+corr(q),0.25,1.0);
}`;

const UPDATE_FS=`#version 300 es
precision highp float;
uniform sampler2D uContent,uState;
uniform int uSteps,uInit;uniform float uTscale,uCharge,uRelease,uSticking;
${COMMON}
out vec4 o;
float canonical(float st){
 float s=clamp(st,0.25,1.0);int k=min(int(floor((s-0.25)*4.0)),2);
 float lo=uAnchorQ[k],hi=uAnchorQ[k+1];
 for(int i=0;i<10;i++){float m=0.5*(lo+hi);if(optical(m)<s)lo=m;else hi=m;}
 return 0.5*(lo+hi);
}
float ionicStep(float ionic,float drive,float f){
 float r=drive>ionic?uCharge:uRelease;return ionic+(drive-ionic)*(1.0-pow(1.0-r,f));
}
float shown(float q,float ionic,float drive){return clamp(optical(q)+max(ionic-drive,0.0)*uSticking,0.25,1.0);}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 vec3 c=texelFetch(uContent,p,0).rgb;
 int s=int(floor(clamp(1.0-dot(c,vec3(0.2126,0.7152,0.0722)),0.0,1.0)*3.0+0.5));
 vec4 st=texelFetch(uState,p,0);
 // 1: settle to the current image (new textures); 2: blank panel (reset).
 if(uInit==1){float q=targetQ(s);o=vec4(q,0.0,float(s),optical(q));return;}
 if(uInit==2){float q=targetQ(0);st=vec4(q,0.0,0.0,optical(q));}
 float q=st.r,ionic=st.g,drive=float(s)/3.0;
 if(int(st.b+0.5)!=s)q=canonical(optical(q));
 float sum=0.0;
 for(int i=0;i<8;i++){
  if(i>=uSteps)break;
  float d=drift(s,q),qm=clamp(q+d*0.5*uTscale,0.0,1.0),qe=clamp(q+d*uTscale,0.0,1.0);
  float im=ionicStep(ionic,drive,0.5),ie=ionicStep(ionic,drive,1.0);
  sum+=(shown(q,ionic,drive)+4.0*shown(qm,im,drive)+shown(qe,ie,drive))/6.0;
  q=qe;ionic=ie;
 }
 o=vec4(q,ionic,float(s),uSteps>0?sum/float(uSteps):st.a);
}`;

const DISPLAY_FS=`#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec3 uPalette[5];uniform vec2 uSize,uShadowPx,uPanelMm,uBezelShift;
uniform float uStrength,uPxPerMm,uBezelSigma,uExposure,uGlareSigma,uGlareNorm,uFront;uniform vec3 uEye,uLight;
out vec4 o;
vec3 color(float s){
 float x=clamp(s,0.0,1.0)*4.0;int k=min(3,int(floor(x)));
 return mix(uPalette[k],uPalette[k+1],x-float(k));
}
// State textures are 32-bit float, which WebGL2 does not filter: bilinear by hand.
float shownAt(vec2 p){
 vec2 q=clamp(p-0.5,vec2(0.0),uSize-1.0);ivec2 i=ivec2(floor(q));vec2 f=q-vec2(i);ivec2 m=ivec2(uSize)-1;
 float a=texelFetch(uState,i,0).a,b=texelFetch(uState,min(i+ivec2(1,0),m),0).a;
 float c=texelFetch(uState,min(i+ivec2(0,1),m),0).a,d=texelFetch(uState,min(i+1,m),0).a;
 return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float erf1(float x){float t=1.0/(1.0+0.3275911*abs(x));
 float y=1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*exp(-x*x);return sign(x)*y;}
float step1(float d){return 0.5*(1.0+erf1(d/(uBezelSigma*1.41421356)));}
float fresnel(float ci){
 float st=sqrt(max(0.0,1.0-ci*ci))/uFront,ct=sqrt(max(0.0,1.0-st*st));
 float rs=(ci-uFront*ct)/(ci+uFront*ct),rp=(uFront*ci-ct)/(uFront*ci+ct);
 return 0.5*(rs*rs+rp*rp);
}
vec3 toSRGB(vec3 c){c=clamp(c,0.0,1.0);return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
void main(){
 vec2 p=gl_FragCoord.xy;
 float s=clamp(texelFetch(uState,ivec2(p),0).a,0.25,1.0);
 float sh=clamp(shownAt(p-uShadowPx),0.25,1.0);
 vec3 r=max(color(s)-uPalette[0]*uStrength*max(sh-s,0.0),vec3(0.0));
 // The bezel frame above the glass shades the edges that face the light.
 vec2 b=vec2(p.x,uSize.y-p.y)/uPxPerMm+uBezelShift;
 r*=step1(b.x)*step1(uPanelMm.x-b.x)*step1(b.y)*step1(uPanelMm.y-b.y);
 vec3 pos=vec3(p.x/uPxPerMm,(uSize.y-p.y)/uPxPerMm,0.0);
 vec3 v=normalize(uEye-pos),m=vec3(-v.x,-v.y,v.z);
 float d=acos(clamp(dot(m,uLight),-1.0,1.0));
 float g=fresnel(v.z)*exp(-d*d/(2.0*uGlareSigma*uGlareSigma))*uGlareNorm;
 o=vec4(toSRGB((r+vec3(g))*uExposure),1.0);
}`;

export function createDMGLCD(canvas,{profile,widthMm,heightMm,maxPixelRatio=2,bezelLipMm=1}={}){
 if(profile?.model!=='dmg01-stn')throw new TypeError('A DMG-01 STN profile is required');
 if(!(widthMm>0)||!(heightMm>0))throw new TypeError('Panel size must be positive millimetres');
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false});
 if(!gl)throw new Error('This browser does not provide WebGL2, which the LCD renderer needs.');
 const content=document.createElement('canvas');
 const ctx=content.getContext('2d');
 let W=0,H=0,pxPerMm=1,last=null,current=0,lost=false,gpu=null,init=0,phase=0;
 let lighting={angleDeg:45,azimuthDeg:315,sourceDeg:15,exposure:1};
 let viewing={polarDeg:0,azimuthDeg:0,distanceMm:300},celsius=25,contrast=profile.contrast.value;
 const fps={value:0,clock:0,frames:0};

 function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('LCD shader: '+gl.getShaderInfoLog(s));return s;}
 function program(fs){const p=gl.createProgram(),v=compile(gl.VERTEX_SHADER,VERT),f=compile(gl.FRAGMENT_SHADER,fs);
  gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('LCD program: '+gl.getProgramInfoLog(p));
  const cache=new Map();return {p,u:n=>{if(!cache.has(n))cache.set(n,gl.getUniformLocation(p,n));return cache.get(n);}};}
 function texture(){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
  return t;}
 function target(w,h,fmt){const tex=texture();gl.texImage2D(gl.TEXTURE_2D,0,fmt.internal,w,h,0,gl.RGBA,fmt.type,null);
  const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return {tex,fb,ok};}
 // Ionic charge moves by ~1e-5 per frame, which needs 32-bit floats; with
 // only half floats the director still works but sticking cannot accumulate.
 function stateFormat(){
  const list=[];
  if(gl.getExtension('EXT_color_buffer_float'))list.push({internal:gl.RGBA32F,type:gl.FLOAT,name:'32-bit float',retention:true},
   {internal:gl.RGBA16F,type:gl.HALF_FLOAT,name:'16-bit float',retention:false});
  else if(gl.getExtension('EXT_color_buffer_half_float'))list.push({internal:gl.RGBA16F,type:gl.HALF_FLOAT,name:'16-bit float',retention:false});
  for(const f of list){const t=target(1,1,f);gl.deleteFramebuffer(t.fb);gl.deleteTexture(t.tex);if(t.ok)return f;}
  throw new Error('This screen model needs floating-point render targets, which this browser does not provide.');
 }
 function setup(){
  gpu={fmt:stateFormat(),vao:gl.createVertexArray(),update:program(UPDATE_FS),display:program(DISPLAY_FS),
   content:texture(),drift:texture(),optical:texture(),states:[]};
  const S=profile.stn;
  gl.bindTexture(gl.TEXTURE_2D,gpu.drift);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,S.director_bins,profile.contrast.conditions.length*4,0,gl.RED,gl.FLOAT,new Float32Array(S.drift_per_frame));
  gl.bindTexture(gl.TEXTURE_2D,gpu.optical);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,S.optical_bins,1,0,gl.RED,gl.FLOAT,new Float32Array(S.optical));
  if(W&&H)allocate();
 }
 function allocate(){
  for(const s of gpu.states){gl.deleteFramebuffer(s.fb);gl.deleteTexture(s.tex);}
  gpu.states=[target(W,H,gpu.fmt),target(W,H,gpu.fmt)];
  gl.bindTexture(gl.TEXTURE_2D,gpu.content);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  last=null;init=1;   // new textures have no history: settle to the current image
 }
 function reset(){if(gpu&&!lost){init=2;phase=0;}}
 function bind(p,unit,name,tex){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(p.u(name),unit);}
 function run(p,fb,set){gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,W,H);gl.useProgram(p.p);set(p);
  gl.bindVertexArray(gpu.vao);gl.drawArrays(gl.TRIANGLES,0,3);}
 function tables(p){
  const S=profile.stn,c=contrastConditions(profile,contrast);
  bind(p,2,'uDrift',gpu.drift);bind(p,3,'uOptical',gpu.optical);
  gl.uniform1fv(p.u('uTargetQ'),S.target_q);gl.uniform1fv(p.u('uAnchorQ'),S.optical_anchor_q);gl.uniform1fv(p.u('uCorr'),S.optical_correction);
  gl.uniform1i(p.u('uLo'),c.low);gl.uniform1i(p.u('uHi'),c.high);gl.uniform1f(p.u('uCondF'),c.fraction);gl.uniform1i(p.u('uBins'),S.director_bins);
 }

 function beginContent(){
  ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  ctx.setTransform(pxPerMm,0,0,pxPerMm,0,0);
  return ctx;
 }

 function frame(now=performance.now()){
  if(lost||!gpu||!W)return;
  const dt=last===null?0:clamp(now-last,0,100);last=now;
  fps.frames++;fps.clock+=dt;if(fps.clock>=1000){fps.value=Math.round(fps.frames*1000/fps.clock);fps.frames=0;fps.clock=0;}
  // The panel advances in whole DMG frames; the remainder carries over, so the
  // result is the same at any display refresh rate.
  phase+=dt*profile.panel.refresh_hz/1000;
  const steps=Math.min(8,Math.floor(phase));phase=Math.min(phase-steps,1);
  gl.bindTexture(gl.TEXTURE_2D,gpu.content);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,content);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  if(steps>0||init){
   const from=gpu.states[current],to=gpu.states[1-current],R=profile.retention;
   run(gpu.update,to.fb,p=>{
    bind(p,0,'uContent',gpu.content);bind(p,1,'uState',from.tex);tables(p);
    gl.uniform1i(p.u('uSteps'),init===1?0:steps);gl.uniform1i(p.u('uInit'),init);
    gl.uniform1f(p.u('uTscale'),temperatureScale(profile,celsius));
    gl.uniform1f(p.u('uCharge'),gpu.fmt.retention?R.charge_per_frame:0);gl.uniform1f(p.u('uRelease'),gpu.fmt.retention?R.release_per_frame:0);
    gl.uniform1f(p.u('uSticking'),stickingVolts(profile)*R.sticking_optical_gain);
   });
   current=1-current;init=0;
  }
  const P=profile.palette.srgb8,palette=[P.disabled,...P.shades].flatMap(rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}));
  const off=shadowOffsetMm(profile);
  run(gpu.display,null,p=>{
   bind(p,0,'uState',gpu.states[current].tex);
   gl.uniform3fv(p.u('uPalette'),palette);gl.uniform2f(p.u('uSize'),W,H);
   // Screen y runs down; texture rows run up.
   gl.uniform2f(p.u('uShadowPx'),off.x*pxPerMm,-off.y*pxPerMm);gl.uniform1f(p.u('uStrength'),profile.shadow.strength);
   const shift=bezelShiftMm(profile,lighting,bezelLipMm);
   gl.uniform2f(p.u('uPanelMm'),W/pxPerMm,H/pxPerMm);gl.uniform2f(p.u('uBezelShift'),shift.x,shift.y);
   gl.uniform1f(p.u('uBezelSigma'),Math.max(1e-3,bezelPenumbraMm(profile,lighting,bezelLipMm)));
   gl.uniform1f(p.u('uPxPerMm'),pxPerMm);gl.uniform1f(p.u('uExposure'),lighting.exposure);
   const e=directionVector(viewing.polarDeg,viewing.azimuthDeg),D=viewing.distanceMm;
   gl.uniform3f(p.u('uEye'),W/pxPerMm/2+e[0]*D,H/pxPerMm/2+e[1]*D,e[2]*D);
   gl.uniform3fv(p.u('uLight'),directionVector(lighting.angleDeg,lighting.azimuthDeg));
   const sigma=Math.max(.5,lighting.sourceDeg)/(2*Math.sqrt(2*Math.LN2))*Math.PI/180;
   gl.uniform1f(p.u('uGlareSigma'),sigma);
   gl.uniform1f(p.u('uGlareNorm'),1/(2*sigma*sigma*Math.max(.05,Math.cos(lighting.angleDeg*Math.PI/180))));
   gl.uniform1f(p.u('uFront'),profile.oblique.front_index);
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
 /** State at a point (panel mm): {q, ionic, shade, shown}. */
 function sample(xMm,yMm){
  if(!gpu||lost)return null;
  const x=clamp(Math.floor(xMm*pxPerMm),0,W-1),y=clamp(H-1-Math.floor(yMm*pxPerMm),0,H-1);
  gl.bindFramebuffer(gl.FRAMEBUFFER,gpu.states[current].fb);
  const out=new Float32Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.FLOAT,out);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return {q:out[0],ionic:out[1],shade:Math.round(out[2]),shown:out[3]};
 }
 const onLost=e=>{e.preventDefault();lost=true;};
 const onRestored=()=>{lost=false;gpu=null;setup();};
 canvas.addEventListener('webglcontextlost',onLost);
 canvas.addEventListener('webglcontextrestored',onRestored);
 setup();

 return Object.freeze({
  get profile(){return profile;},beginContent,frame,resize,reset,sample,
  setProfile(next){if(next?.model!=='dmg01-stn')throw new TypeError('A DMG-01 STN profile is required');profile=next;if(gpu&&!lost)setup();},
  setElectrodes(){},              // a dot matrix drives every point: no electrode map
  get lighting(){return {...lighting};},
  setLighting(next){lighting={...lighting,...next};},
  get viewing(){return {...viewing};},
  setViewing(next){viewing={...viewing,...next};},
  get temperature(){return celsius;},
  setTemperature(c){celsius=Number(c);},
  get contrast(){return contrast;},
  setContrast(c){contrast=clamp(Number(c),profile.contrast.min,profile.contrast.max);},
  bezelLipMm,
  info(){return {version:DMG_STN_VERSION,stateFormat:gpu?.fmt.name??'none',retention:Boolean(gpu?.fmt.retention),width:W,height:H,pxPerMm,fps:fps.value};},
  dispose(){canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);
   gl.getExtension('WEBGL_lose_context')?.loseContext();}
 });
}

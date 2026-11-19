/* Green phosphor CRT: an IBM 5151 monochrome display (P39) drawing vector
 * content with a real raster.
 *
 * profiles/crt-5151-p39.json (tools/crt_p39.py) supplies every number:
 *  - the beam sweeps 370 lines per frame at the MDA's 18.432 kHz (49.82 Hz),
 *    350 of them visible; along a line the signal is continuous (no pixels);
 *  - the content is quantized to the four TTL levels (video 2/3 + intensity 1/3);
 *  - each line deposits charge with the measured Gaussian spot profile;
 *  - each point of P39 phosphor answers a hit with its impulse response, five
 *    exponentials, stepped exactly at the moment the beam passes that point;
 *  - what the eye sees is the light averaged over one refresh period, so the
 *    50 Hz ripple is not aliased against the phone's refresh rate;
 *  - light trapped in the faceplate returns as a halo (halation);
 *  - the room light reflects off the screen and the etched glass.
 * The panel's height is the raster's 350 visible lines. Pure functions are
 * exported for tests; the shaders mirror them. */
import {bezelShiftMm,bezelPenumbraMm} from './physical-lcd.js';

export const CRT_VERSION='0.1.0';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

/** TTL level 0..3 for encoded sRGB in [0, 1]: dark art drives the beam. */
export function levelFromRGB(r,g,b){return Math.floor(clamp(1-(.2126*r+.7152*g+.0722*b),0,1)*3+.5);}
/** Phosphor light per unit excitation t seconds after a hit (unit total energy). */
export function impulse(profile,t){
 const {amplitudes:a,taus_s:tau}=profile.phosphor.impulse;
 return t<0?0:a.reduce((s,ai,i)=>s+ai*Math.exp(-t/tau[i]),0);
}
/** Mean light over one frame, in units of the full-drive luminance, for a point
 * hit once per frame with excitation E, observed tSince seconds after its last hit,
 * in the steady state (every frame the same). */
export function steadyWindow(profile,E,tSince){
 const T=profile.timing.frame_s,{amplitudes:a,taus_s:tau}=profile.phosphor.impulse;
 let sum=0;
 for(let i=0;i<a.length;i++){
  const plus=E*a[i]/(1-Math.exp(-T/tau[i])),minus=plus-E*a[i],d2=tSince,d1=T-d2;
  sum+=minus*tau[i]*(Math.exp(d1/tau[i])-1)+plus*tau[i]*(1-Math.exp(-d2/tau[i]));
 }
 // Each hit delivers one frame's worth of light per unit excitation, so a
 // steady point shows exactly E (full drive = 1).
 return sum;
}
/** Time (s) after a single hit until the light falls to `fraction` of its peak. */
export function decayTime(profile,fraction=.1){
 let peak=0,tp=0;for(let t=0;t<.2;t+=1e-5){const v=impulse(profile,t);if(v>peak){peak=v;tp=t;}}
 let t=tp;while(impulse(profile,t)>fraction*peak&&t<10)t+=1e-4;return t;
}
/** Exposure that brings the brightest line core at full drive (contrast 1) to
 * the display's maximum green, as the eye or a camera adapts to a lit screen.
 * One constant: every ratio (levels, afterglow, room reflection) is kept. */
export function adaptedExposure(profile){
 const peak=profile.raster.pitch_mm/(Math.sqrt(2*Math.PI)*profile.spot.sigma_mm);
 return .7152/(profile.luminance.full_drive_relative*peak);
}
/** Linear-sRGB colour for emitted luminance Y (relative to a white diffuser) on
 * top of a grey ambient reflection. P39 is outside sRGB, so its light is shown
 * on the display's green primary; above full green it clips, keeping the hue
 * (P39 never looks white) at the cost of the brightest line cores. */
export function displayColor(Y,ambient){
 return [ambient,ambient+Y/.7152,ambient].map(v=>clamp(v,0,1));
}

const VERT=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;

const RASTER=`
uniform float uPitch,uSigmaY,uSigmaX,uLineS,uActiveS,uFrameS,uW,uH;uniform int uLines;
float Phi(float x){float t=1.0/(1.0+0.3275911*abs(x)/1.41421356);
 float y=1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*exp(-0.5*x*x);return 0.5*(1.0+sign(x)*y);}
// Time within the frame at which the beam passes this pixel (nearest line).
float hitPhase(vec2 frag){
 float yTop=uH-frag.y;int n=clamp(int(floor(yTop/uPitch)),0,uLines-1);
 return float(n)*uLineS+frag.x/uW*uActiveS;
}`;

// Excitation and phosphor state. Two targets: c1..c4, and (c5, last excitation).
const UPDATE_FS=`#version 300 es
precision highp float;
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
uniform sampler2D uContent,uS0,uS1;
uniform float uPhase0,uDelta,uContrast,uBrightness;uniform float uA[5],uTau[5];
${RASTER}
float level(ivec2 p){vec3 c=texelFetch(uContent,p,0).rgb;
 return floor(clamp(1.0-dot(c,vec3(0.2126,0.7152,0.0722)),0.0,1.0)*3.0+0.5)/3.0;}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 vec4 s0=texelFetch(uS0,p,0),s1=texelFetch(uS1,p,0);
 float c[5]=float[5](s0.x,s0.y,s0.z,s0.w,s1.x);float last=s1.y;
 // Charge landing on this pixel from the lines whose spot reaches it, each
 // spot integrated over the pixel's height; the signal along each line is
 // blurred by the spot's width.
 float yTop=uH-gl_FragCoord.y,E=0.0;
 int n0=max(0,int(floor((yTop-0.5-4.0*uSigmaY)/uPitch))),n1=min(uLines-1,int(floor((yTop+0.5+4.0*uSigmaY)/uPitch)));
 for(int n=n0;n<=n1&&n<=n0+8;n++){
  float yn=(float(n)+0.5)*uPitch;
  float w=Phi((yTop+0.5-yn)/uSigmaY)-Phi((yTop-0.5-yn)/uSigmaY);
  if(w<1e-6)continue;
  int row=clamp(int(uH-yn),0,int(uH)-1);float v=0.0;
  for(int dx=-2;dx<=2;dx++){
   float wx=Phi((float(dx)+0.5)/uSigmaX)-Phi((float(dx)-0.5)/uSigmaX);
   v+=wx*level(ivec2(clamp(p.x+dx,0,int(uW)-1),row));
  }
  E+=w*(uContrast*v+uBrightness);
 }
 E*=uPitch;
 // Hits in (T0, T0 + delta]: once per frame at this pixel's phase.
 float first=mod(hitPhase(gl_FragCoord.xy)-uPhase0,uFrameS);if(first<=0.0)first+=uFrameS;
 int hits=first<=uDelta?int(floor((uDelta-first)/uFrameS))+1:0;
 for(int k=0;k<8;k++){
  if(k>=hits)break;
  for(int i=0;i<5;i++)c[i]=c[i]*exp(-uFrameS/uTau[i])+E*uA[i];
  last=E;
 }
 o0=vec4(c[0],c[1],c[2],c[3]);o1=vec4(c[4],last,0.0,1.0);
}`;

// Light averaged over the last refresh period, relative to full drive.
const EMIT_FS=`#version 300 es
precision highp float;
uniform sampler2D uS0,uS1;uniform float uPhase1,uA[5],uTau[5];
${RASTER}
out vec4 o;
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 vec4 s0=texelFetch(uS0,p,0),s1=texelFetch(uS1,p,0);
 float c[5]=float[5](s0.x,s0.y,s0.z,s0.w,s1.x);
 float d2=mod(uPhase1-hitPhase(gl_FragCoord.xy),uFrameS),d1=uFrameS-d2,sum=0.0;
 for(int i=0;i<5;i++){
  float plus=c[i],minus=plus-s1.y*uA[i];
  sum+=minus*uTau[i]*(exp(d1/uTau[i])-1.0)+plus*uTau[i]*(1.0-exp(-d2/uTau[i]));
 }
 o=vec4(max(sum,0.0),0.0,0.0,1.0);   // one frame's light per unit excitation: steady = E
}`;

// Halation, computed at low resolution: the rings are millimetres wide.
const HALO_FS=`#version 300 es
precision highp float;
uniform sampler2D uEmit;uniform vec2 uSize,uSmall;uniform float uPxPerMm,uHaloLod,uMonitorMm;
uniform float uHaloR[24],uHaloF[24];uniform int uHaloN;
out vec4 o;
float emitAt(vec2 px,float lod){
 if(px.x<0.0||px.y<0.0||px.x>uSize.x||px.y>uSize.y)return 0.0;
 return textureLod(uEmit,px/uSize,lod).r;
}
void main(){
 vec2 p=gl_FragCoord.xy/uSmall*uSize;   // full-resolution pixel position
 float halo=0.0;
 for(int j=0;j<24;j++){
  if(j>=uHaloN)break;
  float r=uHaloR[j]/uMonitorMm*uPxPerMm,ring=0.0;
  // Average over the gap between samples: a mip level as wide as the spacing.
  float lod=max(uHaloLod,log2(6.2831853*r/24.0));
  for(int k=0;k<24;k++){float a=6.2831853*(float(k)+0.5*float(j&1))/24.0;ring+=emitAt(p+r*vec2(cos(a),sin(a)),lod);}
  halo+=uHaloF[j]*ring/24.0;
 }
 o=vec4(halo,0.0,0.0,1.0);
}`;

const DISPLAY_FS=`#version 300 es
precision highp float;
uniform sampler2D uEmitFull,uHaloField;uniform vec2 uSize,uPanelMm,uBezelShift;
uniform float uFull,uAmbient,uSurface,uExposure,uPxPerMm,uBezelSigma;
out vec4 o;
float erf1(float x){float t=1.0/(1.0+0.3275911*abs(x));
 float y=1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*exp(-x*x);return sign(x)*y;}
float step1(float d){return 0.5*(1.0+erf1(d/(uBezelSigma*1.41421356)));}
vec3 toSRGB(vec3 c){c=clamp(c,0.0,1.0);return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
void main(){
 vec2 p=gl_FragCoord.xy;
 float e=texelFetch(uEmitFull,ivec2(p),0).r;
 float halo=texture(uHaloField,p/uSize).r;   // light returned by the faceplate
 float Y=(e+halo)*uFull;
 // Room light: through the glass to the screen and back, shaded by the bezel;
 // the etched front scatters its own reflection.
 vec2 b=vec2(p.x,uSize.y-p.y)/uPxPerMm+uBezelShift;
 float lit=step1(b.x)*step1(uPanelMm.x-b.x)*step1(b.y)*step1(uPanelMm.y-b.y);
 float amb=uAmbient*lit+uSurface;
 vec3 c=vec3(amb,amb+Y/0.7152,amb)*uExposure;   // P39 shown on the display's green primary
 o=vec4(toSRGB(c),1.0);
}`;

export function createCRT(canvas,{profile,widthMm,heightMm,maxPixelRatio=2,bezelLipMm=1}={}){
 if(profile?.model!=='crt-raster')throw new TypeError('A CRT raster profile is required');
 if(!(widthMm>0)||!(heightMm>0))throw new TypeError('Panel size must be positive millimetres');
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false});
 if(!gl)throw new Error('This browser does not provide WebGL2, which the screen renderer needs.');
 const content=document.createElement('canvas');
 const ctx=content.getContext('2d');
 let W=0,H=0,pxPerMm=1,last=null,clock=0,current=0,lost=false,gpu=null;
 let lighting={angleDeg:45,azimuthDeg:315,sourceDeg:15,exposure:1};
 let contrast=profile.controls.contrast.value,brightness=profile.controls.brightness.value;
 const fps={value:0,clock:0,frames:0};
 // Monitor millimetres per panel millimetre: the panel's height is the raster's.
 const monitorPerPanel=profile.raster.height_mm/heightMm;

 function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('CRT shader: '+gl.getShaderInfoLog(s));return s;}
 function program(fs){const p=gl.createProgram(),v=compile(gl.VERTEX_SHADER,VERT),f=compile(gl.FRAGMENT_SHADER,fs);
  gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('CRT program: '+gl.getProgramInfoLog(p));
  const cache=new Map();return {p,u:n=>{if(!cache.has(n))cache.set(n,gl.getUniformLocation(p,n));return cache.get(n);}};}
 function texture(filter=gl.NEAREST){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,filter],[gl.TEXTURE_MAG_FILTER,filter===gl.NEAREST?gl.NEAREST:gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
  return t;}
 function storage(tex,internal,type){gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,internal,W,H,0,gl.RGBA,type,null);}
 function setup(){
  if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('This screen model needs 32-bit float render targets, which this browser does not provide.');
  gpu={vao:gl.createVertexArray(),update:program(UPDATE_FS),emit:program(EMIT_FS),haloPass:program(HALO_FS),display:program(DISPLAY_FS),content:texture(),states:[],halo:null,haloField:null};
  if(W&&H)allocate();
 }
 function allocate(){
  for(const s of gpu.states){gl.deleteFramebuffer(s.fb);gl.deleteTexture(s.t0);gl.deleteTexture(s.t1);}
  gpu.states=[0,1].map(()=>{
   const t0=texture(),t1=texture();storage(t0,gl.RGBA32F,gl.FLOAT);storage(t1,gl.RGBA32F,gl.FLOAT);
   const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
   gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t0,0);
   gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,t1,0);
   gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('CRT state targets are not supported here.');
   return {t0,t1,fb};
  });
  for(const t of [gpu.halo,gpu.haloField])if(t){gl.deleteTexture(t.tex);gl.deleteFramebuffer(t.fb);}
  const target=(filter,mip)=>{const tex=texture(filter);storage(tex,gl.RGBA16F,gl.HALF_FLOAT);
   if(mip){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D);}
   const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);return {tex,fb};};
  gpu.halo=target(gl.LINEAR,true);   // emitted light; its mipmaps feed the halation
  gpu.small=[Math.max(1,Math.ceil(W/8)),Math.max(1,Math.ceil(H/8))];
  {const tex=texture(gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,gpu.small[0],gpu.small[1],0,gl.RGBA,gl.HALF_FLOAT,null);
   const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);gpu.haloField={tex,fb};}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.bindTexture(gl.TEXTURE_2D,gpu.content);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  reset();
 }
 // A cold screen: no charge on the phosphor.
 function reset(){
  if(!gpu||lost)return;
  gl.clearColor(0,0,0,0);
  for(const s of gpu.states){gl.bindFramebuffer(gl.FRAMEBUFFER,s.fb);gl.clear(gl.COLOR_BUFFER_BIT);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 function bind(p,unit,name,tex){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(p.u(name),unit);}
 function run(p,fb,set,size=[W,H]){gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,size[0],size[1]);gl.useProgram(p.p);set(p);
  gl.bindVertexArray(gpu.vao);gl.drawArrays(gl.TRIANGLES,0,3);}
 function raster(p){
  const T=profile.timing,pitch=H/T.lines_visible,sigma=profile.spot.sigma_mm/monitorPerPanel*pxPerMm;
  gl.uniform1f(p.u('uPitch'),pitch);gl.uniform1f(p.u('uSigmaY'),Math.max(sigma,1e-3));gl.uniform1f(p.u('uSigmaX'),Math.max(sigma,1e-3));
  gl.uniform1f(p.u('uLineS'),T.line_s);gl.uniform1f(p.u('uActiveS'),T.active_s);gl.uniform1f(p.u('uFrameS'),T.frame_s);
  gl.uniform1f(p.u('uW'),W);gl.uniform1f(p.u('uH'),H);gl.uniform1i(p.u('uLines'),T.lines_visible);
  gl.uniform1fv(p.u('uA'),profile.phosphor.impulse.amplitudes);gl.uniform1fv(p.u('uTau'),profile.phosphor.impulse.taus_s);
 }

 function beginContent(){
  ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  ctx.setTransform(pxPerMm,0,0,pxPerMm,0,0);
  return ctx;
 }

 function frame(now=performance.now()){
  if(lost||!gpu||!W)return;
  const dtMs=last===null?0:clamp(now-last,0,100);last=now;
  fps.frames++;fps.clock+=dtMs;if(fps.clock>=1000){fps.value=Math.round(fps.frames*1000/fps.clock);fps.frames=0;fps.clock=0;}
  const T=profile.timing.frame_s,delta=dtMs/1000,phase0=clock;
  clock=(clock+delta)%T;
  gl.bindTexture(gl.TEXTURE_2D,gpu.content);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,content);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  const from=gpu.states[current],to=gpu.states[1-current];
  if(delta>0){
   run(gpu.update,to.fb,p=>{
    bind(p,0,'uContent',gpu.content);bind(p,1,'uS0',from.t0);bind(p,2,'uS1',from.t1);raster(p);
    gl.uniform1f(p.u('uPhase0'),phase0);gl.uniform1f(p.u('uDelta'),delta);
    gl.uniform1f(p.u('uContrast'),contrast);gl.uniform1f(p.u('uBrightness'),brightness);
   });
   current=1-current;
  }
  const s=gpu.states[current];
  run(gpu.emit,gpu.halo.fb,p=>{
   bind(p,0,'uS0',s.t0);bind(p,1,'uS1',s.t1);raster(p);gl.uniform1f(p.u('uPhase1'),clock);
  });
  gl.bindTexture(gl.TEXTURE_2D,gpu.halo.tex);gl.generateMipmap(gl.TEXTURE_2D);
  const F=profile.faceplate,hal=F.halation;
  // Group the 1 mm halation bins into at most 24 rings.
  const rings=[];for(let i=0;i<hal.r_mm.length;i+=3){let f=0,r=0;for(let k=i;k<Math.min(i+3,hal.r_mm.length);k++){f+=hal.fraction[k];r+=hal.r_mm[k]*hal.fraction[k];}if(f>0)rings.push([r/f,f]);}
  run(gpu.haloPass,gpu.haloField.fb,p=>{
   bind(p,0,'uEmit',gpu.halo.tex);
   gl.uniform2f(p.u('uSize'),W,H);gl.uniform2f(p.u('uSmall'),gpu.small[0],gpu.small[1]);
   gl.uniform1f(p.u('uPxPerMm'),pxPerMm);gl.uniform1f(p.u('uMonitorMm'),monitorPerPanel);
   // Sample the emission from a mip level whose texels are about 1 monitor-mm wide.
   gl.uniform1f(p.u('uHaloLod'),Math.max(0,Math.log2(pxPerMm/monitorPerPanel)));
   gl.uniform1i(p.u('uHaloN'),Math.min(24,rings.length));
   gl.uniform1fv(p.u('uHaloR'),Array.from({length:24},(_,i)=>rings[i]?.[0]??0));
   gl.uniform1fv(p.u('uHaloF'),Array.from({length:24},(_,i)=>rings[i]?.[1]??0));
  },gpu.small);
  run(gpu.display,null,p=>{
   bind(p,0,'uEmitFull',gpu.halo.tex);bind(p,1,'uHaloField',gpu.haloField.tex);
   gl.uniform2f(p.u('uSize'),W,H);gl.uniform1f(p.u('uFull'),profile.luminance.full_drive_relative);
   gl.uniform1f(p.u('uAmbient'),F.ambient_reflectance-F.surface_reflectance);gl.uniform1f(p.u('uSurface'),F.surface_reflectance);
   gl.uniform1f(p.u('uExposure'),lighting.exposure*adaptedExposure(profile));gl.uniform1f(p.u('uPxPerMm'),pxPerMm);
   const shift=bezelShiftMm(profile,lighting,bezelLipMm);
   gl.uniform2f(p.u('uPanelMm'),W/pxPerMm,H/pxPerMm);gl.uniform2f(p.u('uBezelShift'),shift.x/monitorPerPanel,shift.y/monitorPerPanel);
   gl.uniform1f(p.u('uBezelSigma'),Math.max(1e-3,bezelPenumbraMm(profile,lighting,bezelLipMm)/monitorPerPanel));
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
 /** Light at a point (panel mm), relative to full drive, averaged over the last frame. */
 function sample(xMm,yMm){
  if(!gpu||lost)return null;
  const x=clamp(Math.floor(xMm*pxPerMm),0,W-1),y=clamp(H-1-Math.floor(yMm*pxPerMm),0,H-1);
  gl.bindFramebuffer(gl.FRAMEBUFFER,gpu.halo.fb);
  const out=new Float32Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.FLOAT,out);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return out[0];
 }
 const onLost=e=>{e.preventDefault();lost=true;};
 const onRestored=()=>{lost=false;gpu=null;setup();};
 canvas.addEventListener('webglcontextlost',onLost);
 canvas.addEventListener('webglcontextrestored',onRestored);
 setup();

 return Object.freeze({
  get profile(){return profile;},beginContent,frame,resize,reset,sample,
  setProfile(next){if(next?.model!=='crt-raster')throw new TypeError('A CRT raster profile is required');profile=next;if(gpu&&!lost)setup();},
  setElectrodes(){},
  get lighting(){return {...lighting};},
  setLighting(next){lighting={...lighting,...next};},
  get contrast(){return contrast;},
  setContrast(v){const c=profile.controls.contrast;contrast=clamp(Number(v),c.min,c.max);},
  get brightness(){return brightness;},
  setBrightness(v){const b=profile.controls.brightness;brightness=clamp(Number(v),b.min,b.max);},
  bezelLipMm,
  info(){return {version:CRT_VERSION,stateFormat:'32-bit float',width:W,height:H,pxPerMm,fps:fps.value,lines:profile.timing.lines_visible,linePx:H/profile.timing.lines_visible};},
  dispose(){canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);
   gl.getExtension('WEBGL_lose_context')?.loseContext();}
 });
}

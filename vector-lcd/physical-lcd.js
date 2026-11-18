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
 * Light and viewing directions both matter: each pass through the crystal is
 * taken from the profile's oblique table (extended Jones), so contrast fades
 * and inverts off-axis as on a real TN panel. The front surface adds Fresnel
 * glare: the mirror image of the room light, seen from a finite eye distance.
 * Temperature scales the crystal's speed and threshold from measured data.
 * A bezel frame above the glass blocks light near the edges facing the room
 * light, casting a soft shadow band onto the screen.
 * Multiplexed profiles drive every electrode point, lit or not; points outside
 * all electrodes get no voltage. An electrode map (white = electrode) tells the
 * renderer where the glass has electrodes, which is where unlit segments show.
 * Content is digital and free: the glass is treated as a grid finer than the
 * device pixel, so any art can be shown. That is the one stated compromise.
 *
 * Pure model functions are exported for testing; the shaders mirror them.
 */
export const PHYSICAL_LCD_VERSION='0.6.1';

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
/** Temperature scaling (15-40 C, the range covered by the measured data):
 * time constants follow gamma1/K, the threshold follows sqrt(K/delta-eps). */
export function temperatureFactors(profile,celsius=25){
 const t=profile.temperature;
 if(!t)return {tauScale:1,voltageScale:1};
 const c=clamp(celsius,t.temps_C[0],t.temps_C[t.temps_C.length-1]);
 return {tauScale:interp(c,t.temps_C,t.tau_scale),voltageScale:interp(c,t.temps_C,t.voltage_scale)};
}
/** Equilibrium director state for a voltage. voltageScale > 1 means the crystal
 * responds as if driven harder (a lower threshold). */
export function equilibriumState(profile,volts,voltageScale=1){
 return interp(volts*voltageScale,profile.drive.voltages,profile.drive.a_equilibrium);
}
/** Director time constant: field-driven switching speeds up as (V/Vth)^2 - 1;
 * relaxation has no field to help it. */
export function timeConstantMs(profile,volts,target,current,{tauScale=1,voltageScale=1}={}){
 const {tau_on_at_Vop_ms:onOp,tau_off_ms:off,Vth,Vop}=profile.dynamics;
 if(target<=current)return off*tauScale;
 const over=(volts*voltageScale/Vth)**2-1;
 if(over<=1e-3)return off*tauScale;
 return onOp*((Vop/Vth)**2-1)/over*tauScale;
}
/** Exact exponential step: identical results at any frame rate. */
export function stepState(profile,a,volts,dtMs,celsius=25){
 const f=temperatureFactors(profile,celsius);
 const target=equilibriumState(profile,volts,f.voltageScale);
 const tau=timeConstantMs(profile,volts,target,a,f);
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
/* ---------- Oblique optics ---------- */
const tableCache=new WeakMap();
function obliqueTable(profile){
 let t=tableCache.get(profile);
 if(!t){
  const b64=profile.oblique.table_float32_base64;
  const bytes=typeof atob==='function'?Uint8Array.from(atob(b64),ch=>ch.charCodeAt(0)):Uint8Array.from(Buffer.from(b64,'base64'));
  t=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  tableCache.set(profile,t);
 }
 return t;
}
/** Single-pass transmission (a-grid x wavelengths) for light arriving from
 * (polarDeg from the normal, azimuthDeg: 0 = from the top, clockwise),
 * bilinear over the profile's direction grid. */
export function passTransmission(profile,polarDeg,azimuthDeg,celsius=25){
 const O=profile.oblique,T=obliqueTable(profile),[nT,nDir,A,L]=O.table_shape,block=A*L;
 // Birefringence changes with temperature: interpolate between the computed tables.
 const temps=O.table_temps_C,tc=clamp(celsius,temps[0],temps[nT-1]);
 let ti=0;while(ti<nT-2&&tc>temps[ti+1])ti++;
 const ft=nT>1?(tc-temps[ti])/(temps[ti+1]-temps[ti]):0;
 const polars=O.polars_deg,azs=O.azimuths_deg,nAz=azs.length,step=360/nAz;
 const p=clamp(polarDeg,0,polars[polars.length-1]);
 const az=((azimuthDeg%360)+360)%360,j=Math.floor(az/step),fa=az/step-j;
 const ring=i=>{
  if(i===0)return [[0,1]];
  const base=1+(i-1)*nAz;
  return [[base+j,1-fa],[base+(j+1)%nAz,fa]];
 };
 let i=0;while(i<polars.length-2&&p>polars[i+1])i++;
 const fp=(p-polars[i])/(polars[i+1]-polars[i]);
 const terms=[...ring(i).map(([d,w])=>[d,w*(1-fp)]),...ring(i+1).map(([d,w])=>[d,w*fp])];
 const out=new Float64Array(block);
 for(const [tIndex,tw] of [[ti,1-ft],[Math.min(nT-1,ti+1),ft]]){
  if(!tw)continue;
  for(const [d,w] of terms){if(!w)continue;const o=(tIndex*nDir+d)*block;for(let k=0;k<block;k++)out[k]+=tw*w*T[o+k];}
 }
 return out;
}
function interpRow(grid,a){
 const n=grid.length,u=clamp(a/grid[n-1],0,1)*(n-1),i=Math.min(n-2,Math.floor(u));
 return [i,u-i];
}
/** Linear-sRGB reflectance for a light and a viewing direction (product model). */
export function reflectanceOblique(profile,aIn,aOut,light,view,celsius=25){
 const O=profile.oblique,[,,A,L]=O.table_shape;
 const TL=passTransmission(profile,light.polarDeg,light.azimuthDeg,celsius),TV=passTransmission(profile,view.polarDeg,view.azimuthDeg,celsius);
 const [i,fi]=interpRow(O.a_grid,aIn),[j,fj]=interpRow(O.a_grid,aOut);
 const at=(T,r,f,l)=>(1-f)*T[r*L+l]+f*T[(r+1)*L+l];
 return [0,1,2].map(c=>{let sum=0;for(let l=0;l<L;l++)sum+=O.rgb_weights[c][l]*at(TL,i,fi,l)*at(TV,j,fj,l);
  return 2*O.reflector*sum+O.surface_diffuse;});
}
/** Symmetric eigen-decomposition (cyclic Jacobi). */
function eigenSymmetric(m,n){
 const a=Float64Array.from(m),v=new Float64Array(n*n);
 for(let i=0;i<n;i++)v[i*n+i]=1;
 for(let sweep=0;sweep<60;sweep++){
  let off=0;for(let p=0;p<n;p++)for(let q=p+1;q<n;q++)off+=a[p*n+q]**2;
  if(off<1e-22)break;
  for(let p=0;p<n;p++)for(let q=p+1;q<n;q++){
   const apq=a[p*n+q];if(Math.abs(apq)<1e-30)continue;
   const theta=(a[q*n+q]-a[p*n+p])/(2*apq),t=Math.sign(theta||1)/(Math.abs(theta)+Math.sqrt(theta*theta+1));
   const c=1/Math.sqrt(t*t+1),s=t*c;
   for(let k=0;k<n;k++){const akp=a[k*n+p],akq=a[k*n+q];a[k*n+p]=c*akp-s*akq;a[k*n+q]=s*akp+c*akq;}
   for(let k=0;k<n;k++){const apk=a[p*n+k],aqk=a[q*n+k];a[p*n+k]=c*apk-s*aqk;a[q*n+k]=s*apk+c*aqk;}
   for(let k=0;k<n;k++){const vkp=v[k*n+p],vkq=v[k*n+q];v[k*n+p]=c*vkp-s*vkq;v[k*n+q]=s*vkp+c*vkq;}
  }
 }
 const order=[...Array(n).keys()].sort((x,y)=>a[y*n+y]-a[x*n+x]);
 return {values:order.map(k=>a[k*n+k]),vectors:order.map(k=>Array.from({length:n},(_,i)=>v[i*n+k]))};
}
/** Rank-4 separable optics for the current light and viewing directions:
 * R_c(a_in, a_out) ~= sum_k entry_k(a_in) * exit_k,c(a_out). Exact per
 * wavelength; the truncation error is returned. */
export function obliqueOptics(profile,light,view,celsius=25){
 const O=profile.oblique,[,,A,L]=O.table_shape,cols=A*3;
 const TL=passTransmission(profile,light.polarDeg,light.azimuthDeg,celsius),TV=passTransmission(profile,view.polarDeg,view.azimuthDeg,celsius);
 const M=new Float64Array(A*cols),k2=2*O.reflector;
 for(let j=0;j<A;j++)for(let c=0;c<3;c++){
  const w=O.rgb_weights[c],col=j*3+c;
  for(let i=0;i<A;i++){let s=0;for(let l=0;l<L;l++)s+=w[l]*TL[i*L+l]*TV[j*L+l];M[i*cols+col]=k2*s+O.surface_diffuse;}
 }
 const B=new Float64Array(A*A);
 for(let i=0;i<A;i++)for(let k=i;k<A;k++){let s=0;for(let c=0;c<cols;c++)s+=M[i*cols+c]*M[k*cols+c];B[i*A+k]=B[k*A+i]=s;}
 const {values,vectors}=eigenSymmetric(B,A);
 const entry=new Float32Array(A*4),exit=new Float32Array(A*3*4);
 for(let k=0;k<4;k++){
  const sigma=Math.sqrt(Math.max(values[k],0)),root=Math.sqrt(sigma),u=vectors[k];
  for(let i=0;i<A;i++)entry[i*4+k]=u[i]*root;
  for(let c=0;c<cols;c++){let s=0;for(let i=0;i<A;i++)s+=M[i*cols+c]*u[i];exit[c*4+k]=sigma>0?s/sigma*root:0;}
 }
 let err=0,max=0;
 for(let i=0;i<A;i++)for(let c=0;c<cols;c++){
  let r=0;for(let k=0;k<4;k++)r+=entry[i*4+k]*exit[c*4+k];
  err=Math.max(err,Math.abs(r-M[i*cols+c]));max=Math.max(max,M[i*cols+c]);
 }
 return {size:A,aMax:O.a_grid[A-1],entry,exit,error:err/max};
}
/** Direction toward the room light (screen axes: x right, y down, z out of the glass). */
export function directionVector(polarDeg,azimuthDeg){
 const t=polarDeg*Math.PI/180,a=azimuthDeg*Math.PI/180;
 return [Math.sin(t)*Math.sin(a),-Math.sin(t)*Math.cos(a),Math.cos(t)];
}
/** Unpolarized Fresnel reflectance of the front surface. */
export function fresnelReflectance(thetaRad,n=1.5){
 const ci=Math.cos(thetaRad),st=Math.sin(thetaRad)/n,ct=Math.sqrt(Math.max(0,1-st*st));
 const rs=(ci-n*ct)/(ci+n*ct),rp=(n*ci-ct)/(n*ci+ct);
 return .5*(rs*rs+rp*rp);
}
/** Glare seen along unit vector toward the eye: the front surface mirrors a
 * room light with a Gaussian angular profile (FWHM sourceDeg, at least 0.5 deg).
 * Relative to a white diffuser under the same light. */
export function glare(profile,toEye,{angleDeg,azimuthDeg,sourceDeg}){
 const L=directionVector(angleDeg,azimuthDeg),m=[-toEye[0],-toEye[1],toEye[2]];
 const dot=clamp(m[0]*L[0]+m[1]*L[1]+m[2]*L[2],-1,1),delta=Math.acos(dot);
 const sigma=Math.max(.5,sourceDeg)/(2*Math.sqrt(2*Math.LN2))*Math.PI/180;
 const n=profile.oblique?.front_index??1.5;
 return fresnelReflectance(Math.acos(clamp(toEye[2],-1,1)),n)*Math.exp(-delta*delta/(2*sigma*sigma))
  /(2*sigma*sigma*Math.max(.05,Math.cos(angleDeg*Math.PI/180)));
}

/* ---------- Bezel shadow ---------- */
/** Where light that reaches the crystal at a point crossed the bezel's plane:
 * the shift toward the light (mm, screen axes). Light passes the bezel lip
 * (air), then the front polarizer and front glass, refracting in each. */
export function bezelShiftMm(profile,{angleDeg,azimuthDeg},lipMm){
 const g=profile.sources.geometry,s=Math.sin(angleDeg*Math.PI/180);
 const through=(t,n)=>t*Math.tan(Math.asin(clamp(s/n,-1,1)));
 const d=through(g.glass_mm,g.n_glass)+through(g.rear_polarizer_mm,g.n_polarizer)+lipMm*Math.tan(Math.min(89,angleDeg)*Math.PI/180);
 const az=azimuthDeg*Math.PI/180;
 return {x:Math.sin(az)*d,y:-Math.cos(az)*d};
}
/** Width (mm, one standard deviation) of the bezel shadow's soft edge, from the
 * room light's angular size (Gaussian, FWHM sourceDeg). */
export function bezelPenumbraMm(profile,lighting,lipMm){
 const h=.05,a=lighting.angleDeg;
 const mag=deg=>{const v=bezelShiftMm(profile,{angleDeg:deg,azimuthDeg:0},lipMm);return Math.hypot(v.x,v.y);};
 const slope=(mag(a+h)-mag(Math.max(0,a-h)))/((a+h-Math.max(0,a-h))*Math.PI/180);
 return slope*lighting.sourceDeg/(2*Math.sqrt(2*Math.LN2))*Math.PI/180;
}
const erf=x=>{const t=1/(1+.3275911*Math.abs(x)),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return Math.sign(x)*y;};
/** Fraction of the room light reaching the crystal at pointMm (screen axes),
 * inside a viewing window panelMm = {w, h} framed by the bezel. */
export function bezelLight(profile,pointMm,panelMm,lighting,lipMm){
 const shift=bezelShiftMm(profile,lighting,lipMm),sigma=Math.max(1e-4,bezelPenumbraMm(profile,lighting,lipMm));
 const q={x:pointMm.x+shift.x,y:pointMm.y+shift.y};
 const step=d=>.5*(1+erf(d/(sigma*Math.SQRT2)));
 return step(q.x)*step(panelMm.w-q.x)*step(q.y)*step(panelMm.h-q.y);
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
uniform sampler2D uContent,uState,uDrive,uEq,uElectrodes;
uniform int uMode,uEqN;uniform bool uHasElectrodes;
uniform float uVmax,uDt,uTauOnOp,uTauOff,uVth,uVop,uVscale,uTauScale;
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
 // No electrode, no field. Electrode edges are sharp at this scale (the
 // field fringes over microns), so the map is a hard in/out test.
 if(uHasElectrodes)v*=step(0.5,texelFetch(uElectrodes,p,0).r);
 float ve=v*uVscale;
 float target=eq(ve),a=texelFetch(uState,p,0).r;
 float tau=uTauOff;
 if(target>a){float over=(ve/uVth)*(ve/uVth)-1.0;if(over>1e-3)tau=uTauOnOp*((uVop/uVth)*(uVop/uVth)-1.0)/over;}
 o=vec4(target+(a-target)*exp(-uDt/(tau*uTauScale)),0.0,0.0,1.0);
}`;

// Light entering the glass at each point (rank-4 entry vector), stored
// normalized to [0,1] per component so 8-bit targets also work.
const ENTRY_FS=`#version 300 es
precision highp float;
uniform sampler2D uState,uEntryLut;uniform float uAmax,uN;uniform vec4 uLo,uSpan;
uniform vec2 uPanelMm,uBezelShift;uniform float uBezelSigma,uPxPerMm,uHeightPx;
out vec4 o;
float erf1(float x){float t=1.0/(1.0+0.3275911*abs(x));
 float y=1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*exp(-x*x);return sign(x)*y;}
float step1(float d){return 0.5*(1.0+erf1(d/(uBezelSigma*1.41421356)));}
void main(){
 float a=texelFetch(uState,ivec2(gl_FragCoord.xy),0).r;
 vec4 e=texture(uEntryLut,vec2((clamp(a/uAmax,0.0,1.0)*(uN-1.0)+0.5)/uN,0.5));
 // Light reaching the crystal here crossed the bezel plane at q; the frame blocks it outside the window.
 vec2 q=vec2(gl_FragCoord.x,uHeightPx-gl_FragCoord.y)/uPxPerMm+uBezelShift;
 float lit=step1(q.x)*step1(uPanelMm.x-q.x)*step1(q.y)*step1(uPanelMm.y-q.y);
 o=(e*lit-uLo)/uSpan;
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
uniform float uPxPerMm,uGlareSigma,uGlareNorm,uFront;uniform vec3 uEye,uLight;
out vec4 o;
float fresnel(float ci){
 float st=sqrt(max(0.0,1.0-ci*ci))/uFront,ct=sqrt(max(0.0,1.0-st*st));
 float rs=(ci-uFront*ct)/(ci+uFront*ct),rp=(uFront*ci-ct)/(uFront*ci+ct);
 return 0.5*(rs*rs+rp*rp);
}
vec3 toSRGB(vec3 c){c=clamp(c,0.0,1.0);return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
void main(){
 vec2 p=gl_FragCoord.xy;
 float aOut=texelFetch(uState,ivec2(p),0).r;
 vec4 e=uLo+uSpan*texture(uField,(p+uMean)/uSize);
 float x=(clamp(aOut/uAmax,0.0,1.0)*(uN-1.0)+0.5)/uN;
 vec3 r=vec3(dot(e,texture(uExitLut,vec2(x,0.5/3.0))),dot(e,texture(uExitLut,vec2(x,1.5/3.0))),
  dot(e,texture(uExitLut,vec2(x,2.5/3.0))));
 // Front-surface glare: the room light mirrored toward this point's eye ray.
 vec3 pos=vec3(p.x/uPxPerMm,(uSize.y-p.y)/uPxPerMm,0.0);
 vec3 v=normalize(uEye-pos),m=vec3(-v.x,-v.y,v.z);
 float d=acos(clamp(dot(m,uLight),-1.0,1.0));
 float g=fresnel(v.z)*exp(-d*d/(2.0*uGlareSigma*uGlareSigma))*uGlareNorm;
 o=vec4(toSRGB((r+vec3(g))*uExposure),1.0);
}`;

export async function loadProfile(url){
 const response=await fetch(url);
 if(!response.ok)throw new Error('Could not load the screen profile ('+response.status+')');
 return response.json();
}

export function createPhysicalLCD(canvas,{profile:initialProfile,widthMm,heightMm,maxPixelRatio=2,bezelLipMm=1}={}){
 const checkProfile=p=>{if(!p?.oblique||!p?.drive)throw new TypeError('A screen profile with oblique optics is required');return p;};
 let profile=checkProfile(initialProfile);
 let drawElectrodes=null;
 if(!(widthMm>0)||!(heightMm>0))throw new TypeError('Panel size must be positive millimetres');
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false});
 if(!gl)throw new Error('This browser does not provide WebGL2, which the LCD renderer needs.');
 const content=document.createElement('canvas');
 const ctx=content.getContext('2d');
 const electrodes=document.createElement('canvas');
 const ectx=electrodes.getContext('2d');
 let W=0,H=0,pxPerMm=1,last=null,current=0,lost=false,gpu=null,settle=false;
 let mode='static',lighting={angleDeg:30,azimuthDeg:0,sourceDeg:10,exposure:1};
 let viewing={polarDeg:0,azimuthDeg:0,distanceMm:300},celsius=25,optics=null,opticsKey='';
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
   content:texture(),electrodes:texture(),drive:texture(),eq:texture(),entryLut:texture(gl.LINEAR),exitLut:texture(gl.LINEAR),
   states:[],fields:[]};
  uploadProfileTables();
  opticsKey='';
  if(W&&H)allocate();
 }
 function allocate(){
  for(const s of [...gpu.states,...gpu.fields]){gl.deleteFramebuffer(s.fb);gl.deleteTexture(s.tex);}
  gpu.states=[target(W,H,gpu.fmt),target(W,H,gpu.fmt)];
  gpu.fields=[target(W,H,gpu.fieldFmt),target(W,H,gpu.fieldFmt)];
  for(const f of gpu.fields){gl.bindTexture(gl.TEXTURE_2D,f.tex);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);}
  gl.bindTexture(gl.TEXTURE_2D,gpu.content);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  uploadElectrodes();
  reset();
  // New textures have no history: let the crystal settle to the current image.
  settle=true;
 }
 function reset(){
  if(!gpu||lost)return;
  gl.clearColor(0,0,0,0);
  for(const s of gpu.states){gl.bindFramebuffer(gl.FRAMEBUFFER,s.fb);gl.clear(gl.COLOR_BUFFER_BIT);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);last=null;settle=false;   // an explicit reset starts blank
 }
 function uploadProfileTables(){
  const d=profile.drive,n=d.voltages.length;
  gl.bindTexture(gl.TEXTURE_2D,gpu.drive);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,256,2,0,gl.RED,gl.FLOAT,new Float32Array([...d.static_by_gray,...d.analog_by_gray]));
  gl.bindTexture(gl.TEXTURE_2D,gpu.eq);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,n,1,0,gl.RED,gl.FLOAT,new Float32Array(d.a_equilibrium));
  opticsKey='';optics=null;
 }
 function uploadElectrodes(){
  if(!gpu||lost||!W||!drawElectrodes)return;
  ectx.setTransform(1,0,0,1,0,0);ectx.globalCompositeOperation='source-over';ectx.globalAlpha=1;
  ectx.fillStyle='#000';ectx.fillRect(0,0,W,H);
  ectx.setTransform(pxPerMm,0,0,pxPerMm,0,0);ectx.fillStyle='#fff';ectx.strokeStyle='#fff';
  drawElectrodes(ectx);
  gl.bindTexture(gl.TEXTURE_2D,gpu.electrodes);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,electrodes);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
 }
 // Rebuild the separable optics when the light or the eye moves.
 function updateOptics(){
  const key=[lighting.angleDeg,lighting.azimuthDeg,viewing.polarDeg,viewing.azimuthDeg,celsius].map(v=>v.toFixed(2)).join();
  if(key===opticsKey&&optics)return;
  opticsKey=key;
  optics=obliqueOptics(profile,{polarDeg:lighting.angleDeg,azimuthDeg:lighting.azimuthDeg},viewing,celsius);
  const A=optics.size;
  gl.bindTexture(gl.TEXTURE_2D,gpu.entryLut);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,A,1,0,gl.RGBA,gl.FLOAT,optics.entry);
  const rows=new Float32Array(A*3*4);
  for(let j=0;j<A;j++)for(let c=0;c<3;c++)for(let k=0;k<4;k++)rows[(c*A+j)*4+k]=optics.exit[(j*3+c)*4+k];
  gl.bindTexture(gl.TEXTURE_2D,gpu.exitLut);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,A,3,0,gl.RGBA,gl.FLOAT,rows);
  const lo=[0,1,2,3].map(k=>Math.min(...Array.from({length:A},(_,i)=>optics.entry[i*4+k])));
  const hi=[0,1,2,3].map(k=>Math.max(...Array.from({length:A},(_,i)=>optics.entry[i*4+k])));
  gpu.lo=lo;gpu.span=hi.map((h,k)=>Math.max(1e-9,h-lo[k]));
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
   bind(p,4,'uElectrodes',gpu.electrodes);
   gl.uniform1i(p.u('uHasElectrodes'),drawElectrodes&&profile.drive.uses_electrode_map?1:0);
   gl.uniform1i(p.u('uMode'),mode==='analog'?1:0);gl.uniform1i(p.u('uEqN'),d.voltages.length);
   gl.uniform1f(p.u('uVmax'),d.voltages[d.voltages.length-1]);gl.uniform1f(p.u('uDt'),dt);
   gl.uniform1f(p.u('uTauOnOp'),dyn.tau_on_at_Vop_ms);gl.uniform1f(p.u('uTauOff'),dyn.tau_off_ms);
   gl.uniform1f(p.u('uVth'),dyn.Vth);gl.uniform1f(p.u('uVop'),dyn.Vop);
   const tf=temperatureFactors(profile,celsius);
   gl.uniform1f(p.u('uVscale'),tf.voltageScale);gl.uniform1f(p.u('uTauScale'),tf.tauScale);
  });
  current=1-current;
  updateOptics();
  const k=shadowKernel(profile,lighting);
  // Light enters where it meets the crystal on the way in, and leaves where the
  // eye's ray meets it: the shadow offset is the difference of the two.
  const toView=entryOffsetMm(profile,viewing.polarDeg,viewing.azimuthDeg);
  k.mean={x:k.mean.x-toView.x,y:k.mean.y-toView.y};
  const lo=gpu.lo,span=gpu.span;
  run(gpu.entry,gpu.fields[0].fb,p=>{
   bind(p,0,'uState',to.tex);bind(p,1,'uEntryLut',gpu.entryLut);
   gl.uniform1f(p.u('uAmax'),optics.aMax);gl.uniform1f(p.u('uN'),optics.size);
   gl.uniform4fv(p.u('uLo'),lo);gl.uniform4fv(p.u('uSpan'),span);
   const shift=bezelShiftMm(profile,lighting,bezelLipMm);
   gl.uniform2f(p.u('uPanelMm'),W/pxPerMm,H/pxPerMm);gl.uniform2f(p.u('uBezelShift'),shift.x,shift.y);
   gl.uniform1f(p.u('uBezelSigma'),Math.max(1e-3,bezelPenumbraMm(profile,lighting,bezelLipMm)));
   gl.uniform1f(p.u('uPxPerMm'),pxPerMm);gl.uniform1f(p.u('uHeightPx'),H);
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
   gl.uniform1f(p.u('uAmax'),optics.aMax);gl.uniform1f(p.u('uN'),optics.size);
   gl.uniform1f(p.u('uExposure'),lighting.exposure);
   gl.uniform4fv(p.u('uLo'),lo);gl.uniform4fv(p.u('uSpan'),span);
   // Eye position in panel millimetres (screen axes, z out of the glass).
   const e=directionVector(viewing.polarDeg,viewing.azimuthDeg),D=viewing.distanceMm;
   gl.uniform3f(p.u('uEye'),W/pxPerMm/2+e[0]*D,H/pxPerMm/2+e[1]*D,e[2]*D);
   gl.uniform3fv(p.u('uLight'),directionVector(lighting.angleDeg,lighting.azimuthDeg));
   const sigma=Math.max(.5,lighting.sourceDeg)/(2*Math.sqrt(2*Math.LN2))*Math.PI/180;
   gl.uniform1f(p.u('uGlareSigma'),sigma);
   gl.uniform1f(p.u('uGlareNorm'),1/(2*sigma*sigma*Math.max(.05,Math.cos(lighting.angleDeg*Math.PI/180))));
   gl.uniform1f(p.u('uFront'),profile.oblique.front_index??1.5);gl.uniform1f(p.u('uPxPerMm'),pxPerMm);
  });
 }

 function resize(cssWidth,cssHeight,dpr=1){
  const fit=Math.max(1e-6,Math.min(cssWidth/widthMm,cssHeight/heightMm));
  const outW=Math.max(1,Math.floor(widthMm*fit)),outH=Math.max(1,Math.floor(heightMm*fit));
  const max=gl.getParameter(gl.MAX_TEXTURE_SIZE)||4096;
  const ratio=Math.max(1,Math.min(maxPixelRatio,dpr||1,max/outW,max/outH));
  const pw=Math.round(outW*ratio),ph=Math.round(outH*ratio);
  canvas.style.width=outW+'px';canvas.style.height=outH+'px';
  if(pw!==W||ph!==H){W=pw;H=ph;canvas.width=W;canvas.height=H;content.width=W;content.height=H;
   electrodes.width=W;electrodes.height=H;pxPerMm=W/widthMm;if(gpu&&!lost)allocate();}
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
  get profile(){return profile;},beginContent,frame,resize,reset,sample,
  /** Switch screen model; the crystal settles into the new panel's state. */
  setProfile(next){profile=checkProfile(next);if(gpu&&!lost){uploadProfileTables();settle=true;}},
  /** draw(ctx) paints electrodes white on black, in millimetres. */
  setElectrodes(draw){drawElectrodes=draw;uploadElectrodes();},
  get mode(){return mode;},
  setMode(next){if(next!=='static'&&next!=='analog')throw new RangeError('Drive mode must be static or analog');mode=next;},
  get lighting(){return {...lighting};},
  setLighting(next){lighting={...lighting,...next};},
  get viewing(){return {...viewing};},
  setViewing(next){viewing={...viewing,...next};},
  get temperature(){return celsius;},
  setTemperature(c){celsius=Number(c);},
  get opticsError(){return optics?.error??null;},
  bezelLipMm,
  info(){return {version:PHYSICAL_LCD_VERSION,stateFormat:gpu?.fmt.name??'none',fieldFormat:gpu?.fieldFmt.name??'none',width:W,height:H,pxPerMm,fps:fps.value,mode};},
  dispose(){canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);}
 });
}

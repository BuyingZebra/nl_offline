/* DMG-01 with vector input on the GPU: every point keeps its own crystal.
 *
 * Each screen pixel is read at n x n points inside it (the shapes are drawn
 * there, vector/draw.js). Every point keeps its own crystal state, as a dot of
 * the panel does, so a moving edge leaves each point its own history: nothing
 * is averaged. The states are stored as 16-bit fractions of the director range
 * (steps of 1.5e-5), two to a 32-bit word. One ion charge per pixel.
 *
 *   UPDATE   points -> levels; whole DMG frames of drift and sticking per point
 *            (model.js stepFrame, per point), then the fade of temporary resting
 *            states (settleTemporary, per point); the pixel's mean first-pass
 *            transmission and, for inspection, its mean measured colour
 *   ENTRY    first pass of the light through the pixel, shaded by the frame
 *   BLUR     spread of entry points from a light of finite size (shared)
 *   DISPLAY  second pass, or with the shadow off the mean measured colour; plus glare
 *
 * Targets: Q0, Q1 (RGBA32UI) the states of points 0-7 and 8-15; MEAN (RGBA16F)
 * mean first-pass transmission; META (RGBA32UI) the level at each point (2 bits
 * per point), the ion charge (float bits), the mean measured colour and the mean
 * shown optical state (halves). */

import {BEZEL_STEP, FRESNEL, TO_SRGB, BLUR_FS} from '../../gpu/glsl.js';
import {COMMON, PALETTE, LENS, GRAIN} from '../dmg/shaders.js';
import {SCRATCH_GLSL} from '../../optics/scratches.js';

export {BLUR_FS};

/** Points per screen pixel, each way, at most: 16 points of 2 bits fill one 32-bit word. */
export const MAX_POINTS = 4;



// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

export const UPDATE_FS = `#version 300 es
precision highp float;precision highp int;
uniform sampler2D uContent;uniform highp usampler2D uQ0,uQ1,uMeta;
uniform int uSteps,uInit,uN;uniform float uTscale,uCharge,uRelease,uSticking;
${COMMON}
${PALETTE}
layout(location=0) out uvec4 oQ0;
layout(location=1) out uvec4 oQ1;
layout(location=2) out vec4 oMean;
layout(location=3) out uvec4 oMeta;
float ionicStep(float ionic,float drive,float f){
 float r=drive>ionic?uCharge:uRelease;return ionic+(drive-ionic)*(1.0-pow(1.0-r,f));
}
float shown(float q,float ionic,float drive,float j){return mix(clamp(q+max(ionic-drive,0.0)*uSticking*branchSlope(q),0.0,1.0),0.0,unpowered(j));}
int levelAt(uint word,int k){return int((word>>uint(2*k))&3u);}
uint wordOf(uvec4 a,uvec4 b,int k){int w=k>>1;return w<4?a[w]:b[w-4];}
float qAt(uvec4 a,uvec4 b,int k){return float((wordOf(a,b,k)>>uint(16*(k&1)))&65535u)/65535.0;}
uint pack16(float q){return uint(clamp(q,0.0,1.0)*65535.0+0.5);}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 int N=uN*uN;
 // The drive level at each point of this pixel, as the shapes left it (r = level / 3).
 uint next=0u;
 for(int j=0;j<${MAX_POINTS};j++)for(int i=0;i<${MAX_POINTS};i++){
  if(i>=uN||j>=uN)continue;
  int level=int(texelFetch(uContent,p*uN+ivec2(i,j),0).r*3.0+0.5);
  next|=uint(level)<<uint(2*(j*uN+i));
 }
 uvec4 a=texelFetch(uQ0,p,0),b=texelFetch(uQ1,p,0),meta=texelFetch(uMeta,p,0);
 uint prev=meta.r;float ion=uintBitsToFloat(meta.g);
 if(uInit==2){prev=0u;ion=0.0;}
 // The pixel's average drive charges the ions (one charge per pixel).
 float drive=0.0;
 for(int k=0;k<${MAX_POINTS * MAX_POINTS};k++){if(k>=N)break;drive+=float(levelAt(next,k));}
 drive/=3.0*float(N);
 float ionDrive=uOff?0.0:drive;

 uvec4 outA=uvec4(0u),outB=uvec4(0u);vec3 trans=vec3(0.0),flatc=vec3(0.0);
 // Points with the same level and state give the same result: compute each once.
 int lastLevel=-1;uint lastBits=0xFFFFFFFFu;bool lastChanged=false;
 uint resBits=0u;vec3 resT=vec3(0.0),resC=vec3(0.0);float resL=0.0,lightSum=0.0;
 for(int k=0;k<${MAX_POINTS * MAX_POINTS};k++){
  if(k>=N)break;
  int s=levelAt(next,k),was=levelAt(prev,k);
  uint bits=(wordOf(a,b,k)>>uint(16*(k&1)))&65535u;
  bool changed=s!=was;
  if(uInit==1){bits=pack16(uOff?0.0:targetQ(s));changed=false;}
  else if(uInit==2){bits=pack16(targetQ(0));changed=s!=0;}
  if(s!=lastLevel||bits!=lastBits||changed!=lastChanged){
   lastLevel=s;lastBits=bits;lastChanged=changed;
   float q=float(bits)/65535.0,level=float(s)/3.0,ionic=ion,acc=0.0;
   // A point whose drive changed is first projected onto the nominal optical
   // branch, as a dot is when its drive changes (stepFrame).
   if(changed&&!uOff)q=canonical(q,optical(q));
   for(int i=0;i<8;i++){
    if(i>=uSteps)break;
    float d=drift(s,q),qm=clamp(q+d*0.5*uTscale,0.0,1.0),qe=clamp(q+d*uTscale,0.0,1.0);
    if(uOff){qm=q*sqrt(uUk);qe=q*uUk;}   // no drive: relaxing toward rest
    float im=ionicStep(ionic,ionDrive,0.5),ie=ionicStep(ionic,ionDrive,1.0),j=float(i);
    acc+=(shown(q,ionic,level,j)+4.0*shown(qm,im,level,j+0.5)+shown(qe,ie,level,j+1.0))/6.0;
    q=qe;ionic=ie;
   }
   float light=uSteps>0?acc/float(uSteps):shown(q,ion,level,0.0);
   resBits=pack16(q);resT=pass1(light);resC=color(light);resL=light;
  }
  // Each point on its own: one resting in a temporary state may give way (settle).
  uint bitsOut=resBits;
  if(uSteps>0){float qq=float(resBits)/65535.0,qs=settle(qq,s,decayDraw(uint(p.x),uint(p.y),uint(k),uFrame));if(qs!=qq)bitsOut=pack16(qs);}
  int w=k>>1;uint v=bitsOut<<uint(16*(k&1));
  if(w<4)outA[w]|=v;else outB[w-4]|=v;
  trans+=resT;flatc+=resC;lightSum+=resL;
 }
 for(int i=0;i<8;i++){if(i>=uSteps)break;ion=ionicStep(ion,ionDrive,1.0);}
 trans/=float(N);flatc/=float(N);
 oQ0=outA;oQ1=outB;oMean=vec4(trans,1.0);
 oMeta=uvec4(next,floatBitsToUint(ion),packHalf2x16(flatc.rg),packHalf2x16(vec2(flatc.b,lightSum/float(N))));
}`;


// ---------------------------------------------------------------------------
// ENTRY: first pass, the pixel's mean transmission, times the bezel's light.
// Alpha keeps the bezel's light alone, for the shadow-off view.
// ---------------------------------------------------------------------------

export const ENTRY_FS = `#version 300 es
precision highp float;precision highp int;
uniform sampler2D uMean;
uniform vec2 uPanelMm,uBezelShift;uniform float uBezelSigma,uPxPerMm,uHeightPx;
out vec4 o;
${BEZEL_STEP}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 vec3 t=texelFetch(uMean,p,0).rgb;
 vec2 q=vec2(gl_FragCoord.x,uHeightPx-gl_FragCoord.y)/uPxPerMm+uBezelShift;
 float lit=step1(q.x)*step1(uPanelMm.x-q.x)*step1(q.y)*step1(uPanelMm.y-q.y);
 o=vec4(t*lit,lit);
}`;


// ---------------------------------------------------------------------------
// DISPLAY
// ---------------------------------------------------------------------------

export const DISPLAY_FS = `#version 300 es
precision highp float;precision highp int;
uniform sampler2D uMean,uField;uniform highp usampler2D uMeta;
uniform bool uShadow;uniform vec2 uSize,uMean2;
uniform float uPxPerMm,uExposure,uGlareSigma,uGlareNorm,uFront,uLensN,uLensHeight;uniform vec3 uEye,uLight;
out vec4 o;
${FRESNEL}
${LENS}
${GRAIN}
${SCRATCH_GLSL}
${TO_SRGB}
void main(){
 vec2 p=gl_FragCoord.xy;ivec2 ip=ivec2(p);
 vec3 r;
 if(uShadow){
  // Light leaving this pixel entered around it plus the mean offset (the shadow).
  r=texelFetch(uMean,ip,0).rgb*texture(uField,(p+uMean2)/uSize).rgb;
 } else {
  // Inspection: light leaves where it entered, so each point shows its measured colour.
  uvec4 m=texelFetch(uMeta,ip,0);
  r=vec3(unpackHalf2x16(m.b),unpackHalf2x16(m.a).x)*texelFetch(uField,ip,0).a;
 }
 // The reflector's grain, where the light bounced: halfway between entry and exit.
 // (With the shadow off, light leaves where it entered: the bounce is under the pixel.)
 vec2 bounce=uShadow?0.5*uMean2:vec2(0.0);
 r*=grain(vec2(p.x+bounce.x,uSize.y-p.y-bounce.y)/uPxPerMm,1.0/uPxPerMm);
 vec3 pos=vec3(p.x/uPxPerMm,(uSize.y-p.y)/uPxPerMm,0.0);
 vec3 v=normalize(uEye-pos),m=vec3(-v.x,-v.y,v.z);
 float d=acos(clamp(dot(m,uLight),-1.0,1.0));
 float g=lensReflectance(v.z)*exp(-d*d/(2.0*uGlareSigma*uGlareSigma))*uGlareNorm;
 // Scratches on the lens front (the condition 'Used'): seen where the eye's ray crosses the lens.
 if(uLensN>1.0)g+=scratchesGlint(pos.xy+uLensHeight*v.xy/max(v.z,1e-3),1.0/uPxPerMm,v,uLight,uGlareSigma,uGlareNorm,uLensN);
 o=vec4(toSRGB((r+vec3(g))*uExposure),1.0);
}`;

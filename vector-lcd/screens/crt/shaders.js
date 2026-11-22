/* IBM 5151 CRT on the GPU. Each pass mirrors model.js:
 *
 *   UPDATE   beam hits since the last frame: spot charge -> phosphor state   (impulse)
 *   EMIT     light averaged over the last refresh period, per layer          (steadyWindow)
 *   HALO     light returned by the faceplate glass, at 1/8 resolution         (halationRings)
 *   DISPLAY  emission + halo per layer, in each layer's colour, + the room    (displayColor)
 *
 * Phosphor state: two textures per target. t0 = c1..c4, t1 = (c5, c6, c7, last excitation).
 * Light targets carry one channel per layer: r = layer 0, g = layer 1. */

import {BEZEL_STEP, TO_SRGB} from '../../gpu/glsl.js';


// ---------------------------------------------------------------------------
// Raster geometry shared by UPDATE and EMIT
// ---------------------------------------------------------------------------

const RASTER = `
uniform float uPitch,uLineS,uActiveS,uFrameS,uW,uH;uniform int uLines;
float Phi(float x){float t=1.0/(1.0+0.3275911*abs(x)/1.41421356);
 float y=1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*exp(-0.5*x*x);return 0.5*(1.0+sign(x)*y);}
// Time within the frame at which the beam passes this pixel (nearest line).
float hitPhase(vec2 frag){
 float yTop=uH-frag.y;int n=clamp(int(floor(yTop/uPitch)),0,uLines-1);
 return float(n)*uLineS+frag.x/uW*uActiveS;
}`;


// ---------------------------------------------------------------------------
// UPDATE: excitation from every line whose spot reaches this pixel, then one
// exact phosphor step per beam pass
// ---------------------------------------------------------------------------

export const UPDATE_FS = `#version 300 es
precision highp float;
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
uniform sampler2D uContent,uS0,uS1;
uniform float uPhase0,uDelta,uContrast,uBrightness;uniform float uA[7],uTau[7];
// Spot: sigma (px) = uSigmaW * (max(drive, uMinDrive) / uEff)^uBloomP  (model.js spotSigmaMm);
// uSigmaMax: the widest spot any signal can make, which bounds the search.
uniform float uSigmaW,uEff,uBloomP,uMinDrive,uSigmaMax;
${RASTER}
float level(ivec2 p){vec3 c=texelFetch(uContent,p,0).rgb;
 return floor(clamp(1.0-dot(c,vec3(0.2126,0.7152,0.0722)),0.0,1.0)*3.0+0.5)/3.0;}
float spotSigma(float drive){return max(uSigmaW*pow(max(drive,uMinDrive)/uEff,uBloomP),1e-3);}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 vec4 s0=texelFetch(uS0,p,0),s1=texelFetch(uS1,p,0);
 float c[7]=float[7](s0.x,s0.y,s0.z,s0.w,s1.x,s1.y,s1.z);float last=s1.w;
 // Charge landing on this pixel from every point whose spot reaches it. Each
 // point's spot has the width its own signal gives it (brighter = wider),
 // integrated over this pixel, so the charge each point deposits is kept.
 float yTop=uH-gl_FragCoord.y,E=0.0;
 int n0=max(0,int(floor((yTop-0.5-4.0*uSigmaMax)/uPitch))),n1=min(uLines-1,int(floor((yTop+0.5+4.0*uSigmaMax)/uPitch)));
 for(int n=n0;n<=n1&&n<=n0+8;n++){
  float yn=(float(n)+0.5)*uPitch;
  int row=clamp(int(uH-yn),0,int(uH)-1);
  for(int dx=-2;dx<=2;dx++){
   float drive=uContrast*level(ivec2(clamp(p.x+dx,0,int(uW)-1),row))+uBrightness;
   if(drive<=0.0)continue;
   float s=spotSigma(drive);
   float w=Phi((yTop+0.5-yn)/s)-Phi((yTop-0.5-yn)/s);
   float wx=Phi((float(dx)+0.5)/s)-Phi((float(dx)-0.5)/s);
   E+=w*wx*drive;
  }
 }
 E*=uPitch;
 // Hits in (T0, T0 + delta]: once per frame at this pixel's phase.
 float first=mod(hitPhase(gl_FragCoord.xy)-uPhase0,uFrameS);if(first<=0.0)first+=uFrameS;
 int hits=first<=uDelta?int(floor((uDelta-first)/uFrameS))+1:0;
 for(int k=0;k<8;k++){
  if(k>=hits)break;
  for(int i=0;i<7;i++)c[i]=c[i]*exp(-uFrameS/uTau[i])+E*uA[i];
  last=E;
 }
 o0=vec4(c[0],c[1],c[2],c[3]);o1=vec4(c[4],c[5],c[6],last);
}`;


// ---------------------------------------------------------------------------
// EMIT: light averaged over the last refresh period, relative to full drive
// ---------------------------------------------------------------------------

export const EMIT_FS = `#version 300 es
precision highp float;
uniform sampler2D uS0,uS1;uniform float uPhase1,uA[7],uTau[7],uLayer[7];
${RASTER}
out vec4 o;
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 vec4 s0=texelFetch(uS0,p,0),s1=texelFetch(uS1,p,0);
 float c[7]=float[7](s0.x,s0.y,s0.z,s0.w,s1.x,s1.y,s1.z);
 float d2=mod(uPhase1-hitPhase(gl_FragCoord.xy),uFrameS),d1=uFrameS-d2;vec2 sum=vec2(0.0);
 for(int i=0;i<7;i++){
  float plus=c[i],minus=plus-s1.w*uA[i];
  // Much faster than a frame: the window holds exactly the last hit's light (model.js FAST_FRACTION_OF_FRAME).
  float light=uTau[i]<0.02*uFrameS?s1.w*uA[i]*uTau[i]
   :minus*uTau[i]*(exp(d1/uTau[i])-1.0)+plus*uTau[i]*(1.0-exp(-d2/uTau[i]));
  if(uLayer[i]<0.5)sum.x+=light;else sum.y+=light;
 }
 o=vec4(max(sum,vec2(0.0)),0.0,1.0);   // one frame's light per unit excitation: steady = E
}`;


// ---------------------------------------------------------------------------
// HALO: rings of emitted light, sampled from mip levels as wide as their spacing
// ---------------------------------------------------------------------------

export const HALO_FS = `#version 300 es
precision highp float;
uniform sampler2D uEmit;uniform vec2 uSize,uSmall;uniform float uPxPerMm,uHaloLod,uMonitorMm;
uniform float uHaloR[24],uHaloF[24];uniform int uHaloN;
out vec4 o;
vec2 emitAt(vec2 px,float lod){
 if(px.x<0.0||px.y<0.0||px.x>uSize.x||px.y>uSize.y)return vec2(0.0);
 return textureLod(uEmit,px/uSize,lod).rg;
}
void main(){
 vec2 p=gl_FragCoord.xy/uSmall*uSize;   // full-resolution pixel position
 vec2 halo=vec2(0.0);
 for(int j=0;j<24;j++){
  if(j>=uHaloN)break;
  float r=uHaloR[j]/uMonitorMm*uPxPerMm;vec2 ring=vec2(0.0);
  // Average over the gap between samples: a mip level as wide as the spacing.
  float lod=max(uHaloLod,log2(6.2831853*r/24.0));
  for(int k=0;k<24;k++){float a=6.2831853*(float(k)+0.5*float(j&1))/24.0;ring+=emitAt(p+r*vec2(cos(a),sin(a)),lod);}
  halo+=uHaloF[j]*ring/24.0;
 }
 o=vec4(halo,0.0,1.0);
}`;


// ---------------------------------------------------------------------------
// DISPLAY: each layer's light in its own colour, plus the room's reflection,
// shaded by the bezel
// ---------------------------------------------------------------------------

export const DISPLAY_FS = `#version 300 es
precision highp float;
uniform sampler2D uEmitFull,uHaloField;uniform vec2 uSize,uPanelMm,uBezelShift;
uniform float uFull,uAmbient,uSurface,uExposure,uPxPerMm,uBezelSigma;uniform vec3 uRgb0,uRgb1;
uniform bool uLinear;   // true: linear light for the viewer's eye (gpu/eye-glare.js)
out vec4 o;
${BEZEL_STEP}
${TO_SRGB}
void main(){
 vec2 p=gl_FragCoord.xy;
 vec2 e=texelFetch(uEmitFull,ivec2(p),0).rg;
 vec2 halo=texture(uHaloField,p/uSize).rg;   // light returned by the faceplate
 vec2 Y=(e+halo)*uFull;
 // Room light: through the glass to the screen and back, shaded by the bezel;
 // the etched front scatters its own reflection.
 vec2 b=vec2(p.x,uSize.y-p.y)/uPxPerMm+uBezelShift;
 float lit=step1(b.x)*step1(uPanelMm.x-b.x)*step1(b.y)*step1(uPanelMm.y-b.y);
 float amb=uAmbient*lit+uSurface;
 vec3 c=(vec3(amb)+Y.x*uRgb0+Y.y*uRgb1)*uExposure;   // layers mix in linear light
 // Outside the display (a negative channel): toward grey of equal luminance (model.js intoGamut).
 float lo=min(c.r,min(c.g,c.b));
 if(lo<0.0){float L=dot(c,vec3(0.2126,0.7152,0.0722));c=L>0.0?vec3(L)+L/(L-lo)*(c-vec3(L)):vec3(0.0);}
 o=vec4(uLinear?c:toSRGB(c),1.0);
}`;

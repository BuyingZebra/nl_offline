/* IBM 5151 CRT on the GPU. Each pass mirrors model.js:
 *
 *   UPDATE   beam hits since the last frame: spot charge -> phosphor state   (impulse)
 *   EMIT     light averaged over the last refresh period, per layer          (steadyWindow)
 *   HALO     light returned by the faceplate glass, at 1/8 resolution         (halationRings)
 *   DISPLAY  emission + halo per layer, in each layer's colour, + the room    (displayColor)
 *
 * Phosphor state: two textures per target. t0 = c1..c4, t1 = (c5, c6, c7, last excitation).
 * Light targets carry one channel per layer: r = layer 0, g = layer 1. */

import {BEZEL_STEP, FRESNEL, TO_SRGB} from '../../gpu/glsl.js';


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
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;layout(location=2) out vec4 o2;
uniform sampler2D uContent,uS0,uS1,uS2;
uniform float uPhase0,uDelta,uContrast,uBrightness,uGamma;uniform float uA[9],uTau[9],uLayer[9];
uniform int uRgb;   // 0: one beam from the 4 TTL levels; 1: three guns from the art's RGB
// Spot: sigma (px) = uSigmaW * (max(drive, uMinDrive) / uEff)^uBloomP  (model.js spotSigmaMm);
// uSigmaMax: the widest spot any signal can make, which bounds the search.
uniform float uSigmaW,uEff,uBloomP,uMinDrive,uSigmaMax;
${RASTER}
// Beam drive at a pixel, per gun (model.js layerDrives).
vec3 drives(ivec2 p){
 vec3 c=texelFetch(uContent,p,0).rgb;
 if(uRgb==1)return uContrast*pow(c,vec3(uGamma))+uBrightness;
 return vec3(uContrast*floor(clamp(1.0-dot(c,vec3(0.2126,0.7152,0.0722)),0.0,1.0)*3.0+0.5)/3.0+uBrightness);
}
float spotSigma(float drive){return max(uSigmaW*pow(max(drive,uMinDrive)/uEff,uBloomP),1e-3);}
// Charge one beam point at (dx, line yn) of drive d puts on this pixel.
float spotWeight(float d,float yTop,float yn,float dx){
 if(d<=0.0)return 0.0;
 float s=spotSigma(d);
 return (Phi((yTop+0.5-yn)/s)-Phi((yTop-0.5-yn)/s))*(Phi((dx+0.5)/s)-Phi((dx-0.5)/s))*d;
}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 vec4 s0=texelFetch(uS0,p,0),s1=texelFetch(uS1,p,0),s2=texelFetch(uS2,p,0);
 float c[9]=float[9](s0.x,s0.y,s0.z,s0.w,s1.x,s1.y,s1.z,s1.w,s2.x);vec3 last=s2.yzw;
 // Charge landing on this pixel from every point whose spot reaches it. Each
 // point's spot has the width its own signal gives it (brighter = wider),
 // integrated over this pixel, so the charge each point deposits is kept.
 float yTop=uH-gl_FragCoord.y;vec3 E=vec3(0.0);
 int n0=max(0,int(floor((yTop-0.5-4.0*uSigmaMax)/uPitch))),n1=min(uLines-1,int(floor((yTop+0.5+4.0*uSigmaMax)/uPitch)));
 for(int n=n0;n<=n1&&n<=n0+8;n++){
  float yn=(float(n)+0.5)*uPitch;
  int row=clamp(int(uH-yn),0,int(uH)-1);
  for(int dx=-2;dx<=2;dx++){
   vec3 d=drives(ivec2(clamp(p.x+dx,0,int(uW)-1),row));
   if(uRgb==1)E+=vec3(spotWeight(d.r,yTop,yn,float(dx)),spotWeight(d.g,yTop,yn,float(dx)),spotWeight(d.b,yTop,yn,float(dx)));
   else E+=vec3(spotWeight(d.r,yTop,yn,float(dx)));
  }
 }
 E*=uPitch;
 // Hits in (T0, T0 + delta]: once per frame at this pixel's phase.
 float first=mod(hitPhase(gl_FragCoord.xy)-uPhase0,uFrameS);if(first<=0.0)first+=uFrameS;
 int hits=first<=uDelta?int(floor((uDelta-first)/uFrameS))+1:0;
 for(int k=0;k<8;k++){
  if(k>=hits)break;
  for(int i=0;i<9;i++)c[i]=c[i]*exp(-uFrameS/uTau[i])+E[int(uLayer[i]+0.5)]*uA[i];
  last=E;
 }
 o0=vec4(c[0],c[1],c[2],c[3]);o1=vec4(c[4],c[5],c[6],c[7]);o2=vec4(c[8],last);
}`;


// ---------------------------------------------------------------------------
// EMIT: light averaged over the last refresh period, relative to full drive
// ---------------------------------------------------------------------------

export const EMIT_FS = `#version 300 es
precision highp float;
uniform sampler2D uS0,uS1,uS2;uniform float uPhase1,uA[9],uTau[9],uLayer[9];
${RASTER}
out vec4 o;
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 vec4 s0=texelFetch(uS0,p,0),s1=texelFetch(uS1,p,0),s2=texelFetch(uS2,p,0);
 float c[9]=float[9](s0.x,s0.y,s0.z,s0.w,s1.x,s1.y,s1.z,s1.w,s2.x);vec3 last=s2.yzw;
 float d2=mod(uPhase1-hitPhase(gl_FragCoord.xy),uFrameS),d1=uFrameS-d2;vec3 sum=vec3(0.0);
 for(int i=0;i<9;i++){
  int l=int(uLayer[i]+0.5);
  float plus=c[i],minus=plus-last[l]*uA[i];
  // Much faster than a frame: the window holds exactly the last hit's light (model.js FAST_FRACTION_OF_FRAME).
  float light=uTau[i]<0.02*uFrameS?last[l]*uA[i]*uTau[i]
   :minus*uTau[i]*(exp(d1/uTau[i])-1.0)+plus*uTau[i]*(1.0-exp(-d2/uTau[i]));
  sum[l]+=light;
 }
 o=vec4(max(sum,vec3(0.0)),1.0);   // one frame's light per unit excitation, per layer: steady = E
}`;


// ---------------------------------------------------------------------------
// HALO: rings of emitted light, sampled from mip levels as wide as their spacing
// ---------------------------------------------------------------------------

export const HALO_FS = `#version 300 es
precision highp float;
uniform sampler2D uEmit;uniform vec2 uSize,uSmall;uniform float uPxPerMm,uHaloLod,uMonitorMm;
uniform float uHaloR[24],uHaloF[24];uniform int uHaloN;
out vec4 o;
vec3 emitAt(vec2 px,float lod){
 if(px.x<0.0||px.y<0.0||px.x>uSize.x||px.y>uSize.y)return vec3(0.0);
 return textureLod(uEmit,px/uSize,lod).rgb;
}
void main(){
 vec2 p=gl_FragCoord.xy/uSmall*uSize;   // full-resolution pixel position
 vec3 halo=vec3(0.0);
 for(int j=0;j<24;j++){
  if(j>=uHaloN)break;
  float r=uHaloR[j]/uMonitorMm*uPxPerMm;vec3 ring=vec3(0.0);
  // Average over the gap between samples: a mip level as wide as the spacing.
  float lod=max(uHaloLod,log2(6.2831853*r/24.0));
  for(int k=0;k<24;k++){float a=6.2831853*(float(k)+0.5*float(j&1))/24.0;ring+=emitAt(p+r*vec2(cos(a),sin(a)),lod);}
  halo+=uHaloF[j]*ring/24.0;
 }
 o=vec4(halo,1.0);
}`;


// ---------------------------------------------------------------------------
// DISPLAY: each layer's light in its own colour, plus the room's reflection,
// shaded by the bezel
// ---------------------------------------------------------------------------

export const DISPLAY_FS = `#version 300 es
precision highp float;
uniform sampler2D uEmitFull,uHaloField;uniform vec2 uSize,uPanelMm,uBezelShift;
uniform float uFull,uAmbient,uRoom,uExposure,uPxPerMm,uBezelSigma,uMpp,uFront;uniform vec3 uRgb0,uRgb1,uRgb2,uEye,uLight;
// Colour mask: R G B phosphor stripes, uTripletPx display pixels per triplet; uResolve fades
// them in where the display can draw them (model.js stripeResolve); 0 = no mask.
uniform float uTripletPx,uResolve;
uniform float uSpecular,uSigMirror,uNormMirror,uSigLobe,uNormLobe;   // etched front (model.js faceGlare)
out vec4 o;
${BEZEL_STEP}
${FRESNEL}
${TO_SRGB}
void main(){
 vec2 p=gl_FragCoord.xy;
 vec3 e=texelFetch(uEmitFull,ivec2(p),0).rgb;
 vec3 halo=texture(uHaloField,p/uSize).rgb;   // light returned by the faceplate
 vec3 Y=(e+halo)*uFull;
 // Room light: through the glass to the screen and back, shaded by the bezel.
 vec2 b=vec2(p.x,uSize.y-p.y)/uPxPerMm+uBezelShift;
 float lit=step1(b.x)*step1(uPanelMm.x-b.x)*step1(b.y)*step1(uPanelMm.y-b.y);
 // The etched front's reflection toward this point's eye ray (monitor mm).
 vec3 pos=vec3(p.x/uPxPerMm,(uSize.y-p.y)/uPxPerMm,0.0)*uMpp;
 vec3 v=normalize(uEye-pos),m=vec3(-v.x,-v.y,v.z);
 float d=acos(clamp(dot(m,uLight),-1.0,1.0));
 float g=fresnel(v.z)*(uSpecular*exp(-d*d/(2.0*uSigMirror*uSigMirror))*uNormMirror
  +(1.0-uSpecular)*exp(-d*d/(2.0*uSigLobe*uSigLobe))*uNormLobe);
 float amb=uAmbient*lit+g*uRoom;
 vec3 L0=Y.x*uRgb0*uExposure,L1=Y.y*uRgb1*uExposure,L2=Y.z*uRgb2*uExposure,a=vec3(amb)*uExposure;
 vec3 c=a+L0+L1+L2;   // layers mix in linear light
 if(uResolve>0.0){
  // Each layer lights only its own stripe (three times as bright there): the
  // stripes' share of this display pixel, softened where a stripe would pass
  // the display's white; the pixel's average colour is kept.
  float u0=floor(p.x)/uTripletPx,u1=(floor(p.x)+1.0)/uTripletPx;
  vec3 cov=vec3(0.0);
  for(int k=0;k<3;k++){
   for(float t=floor(u0);t<u1;t+=1.0){
    float s0=t+float(k)/3.0,s1=s0+1.0/3.0;cov[k]+=max(0.0,min(u1,s1)-max(u0,s0));
   }
  }
  cov/=(u1-u0);
  vec3 d0=2.0*L0-L1-L2,d1=2.0*L1-L0-L2,d2=2.0*L2-L0-L1;   // stripe k minus the average
  float m=uResolve;
  for(int ch=0;ch<3;ch++){
   float room=1.0-c[ch];
   if(d0[ch]>0.0)m=min(m,room/d0[ch]);if(d1[ch]>0.0)m=min(m,room/d1[ch]);if(d2[ch]>0.0)m=min(m,room/d2[ch]);
  }
  c+=max(m,0.0)*(cov.x*d0+cov.y*d1+cov.z*d2);
 }
 // Outside the display (a negative channel): toward grey of equal luminance (model.js intoGamut).
 float lo=min(c.r,min(c.g,c.b));
 if(lo<0.0){float L=dot(c,vec3(0.2126,0.7152,0.0722));c=L>0.0?vec3(L)+L/(L-lo)*(c-vec3(L)):vec3(0.0);}
 o=vec4(toSRGB(c),1.0);
}`;

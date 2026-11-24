/* DMG-01 with vector input on the GPU: memory per screen pixel, not per dot.
 *
 * Each screen pixel is read at n x n points inside it (the shapes are drawn
 * there, vector/draw.js), so it knows how much of it each drive level covers.
 * It keeps one crystal state for each drive level, the average state of the
 * part of the pixel at that level, plus the ion charge and the level at each
 * point. When a point changes level, its state moves with it into its new
 * level's average. So edges are as fine as the points, at any size, while the
 * memory stays a few numbers per screen pixel.
 *
 *   UPDATE   points -> levels; states move with their points; whole DMG frames
 *            of drift and sticking per level (model.js stepFrame, per level)
 *   ENTRY    first pass of the light through the pixel, shaded by the bezel
 *   BLUR     spread of entry points from a light of finite size (shared)
 *   DISPLAY  second pass, or with the shadow off each level's measured colour,
 *            weighted by how much of the pixel it covers; plus glare
 *
 * Targets: Q (RGBA32F) crystal state per level; SHOWN (RGBA16F) light shown
 * per level over the last frame; ION (R32F) ion charge; LEVELS (R32UI) the
 * level at each point, 2 bits per point (up to 4 x 4 points). */

import {BEZEL_STEP, FRESNEL, TO_SRGB, BLUR_FS} from '../../gpu/glsl.js';
import {COMMON, PALETTE} from '../dmg/shaders.js';

export {BLUR_FS};

/** Points per screen pixel, each way, at most: 16 points of 2 bits fill one 32-bit word. */
export const MAX_POINTS = 4;

const LEVELS = `
uniform highp usampler2D uLevels;uniform int uN;
int levelAt(uint word,int k){return int((word>>uint(2*k))&3u);}
vec4 coverage(uint word){
 vec4 c=vec4(0.0);
 for(int k=0;k<${MAX_POINTS * MAX_POINTS};k++){if(k>=uN*uN)break;c[levelAt(word,k)]+=1.0;}
 return c/float(uN*uN);
}`;


// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

export const UPDATE_FS = `#version 300 es
precision highp float;precision highp int;
uniform sampler2D uContent,uQ,uShown,uIon;
uniform int uSteps,uInit;uniform float uTscale,uCharge,uRelease,uSticking;
${COMMON}
${LEVELS}
layout(location=0) out vec4 oQ;
layout(location=1) out vec4 oShown;
layout(location=2) out vec4 oIon;
layout(location=3) out uvec4 oLevels;
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
 // The drive level at each point of this pixel, as the shapes left it (r = level / 3).
 uint next=0u;
 for(int j=0;j<${MAX_POINTS};j++)for(int i=0;i<${MAX_POINTS};i++){
  if(i>=uN||j>=uN)continue;
  int level=int(texelFetch(uContent,p*uN+ivec2(i,j),0).r*3.0+0.5);
  next|=uint(level)<<uint(2*(j*uN+i));
 }
 vec4 q0=texelFetch(uQ,p,0);
 float ion=texelFetch(uIon,p,0).r;
 uint prev=texelFetch(uLevels,p,0).r;
 // 1: settle to the current image (new targets); 2: blank panel (reset).
 if(uInit==1){
  vec4 q=vec4(targetQ(0),targetQ(1),targetQ(2),targetQ(3));
  oQ=q;oShown=vec4(optical(q.x),optical(q.y),optical(q.z),optical(q.w));oIon=vec4(0.0);oLevels=uvec4(next,0u,0u,0u);
  return;
 }
 if(uInit==2){q0=vec4(targetQ(0));ion=0.0;prev=0u;}

 // States move with their points. A point that changes level is first projected
 // onto the nominal optical branch, as a dot is when its drive changes (stepFrame).
 vec4 canon=q0;
 if(next!=prev)canon=vec4(canonical(optical(q0.x)),canonical(optical(q0.y)),canonical(optical(q0.z)),canonical(optical(q0.w)));
 vec4 sum=vec4(0.0),count=vec4(0.0);
 for(int k=0;k<${MAX_POINTS * MAX_POINTS};k++){
  if(k>=uN*uN)break;
  int a=levelAt(prev,k),b=levelAt(next,k);
  sum[b]+=a==b?q0[a]:canon[a];
  count[b]+=1.0;
 }
 // The pixel's average drive charges the ions (one charge per pixel).
 float drive=dot(count,vec4(0.0,1.0,2.0,3.0))/3.0/float(uN*uN);

 vec4 qOut=vec4(0.0),light=vec4(0.0);
 for(int s=0;s<4;s++){
  float q=count[s]>0.0?sum[s]/count[s]:targetQ(s),level=float(s)/3.0,ionic=ion,acc=0.0;
  for(int i=0;i<8;i++){
   if(i>=uSteps)break;
   float d=drift(s,q),qm=clamp(q+d*0.5*uTscale,0.0,1.0),qe=clamp(q+d*uTscale,0.0,1.0);
   float im=ionicStep(ionic,drive,0.5),ie=ionicStep(ionic,drive,1.0);
   acc+=(shown(q,ionic,level)+4.0*shown(qm,im,level)+shown(qe,ie,level))/6.0;
   q=qe;ionic=ie;
  }
  qOut[s]=q;
  light[s]=uSteps>0?acc/float(uSteps):shown(q,ion,level);
 }
 for(int i=0;i<8;i++){if(i>=uSteps)break;ion=ionicStep(ion,drive,1.0);}
 oQ=qOut;oShown=light;oIon=vec4(ion,0.0,0.0,1.0);oLevels=uvec4(next,0u,0u,0u);
}`;


// ---------------------------------------------------------------------------
// ENTRY: first pass, the pixel's mean transmission, times the bezel's light.
// Alpha keeps the bezel's light alone, for the shadow-off view.
// ---------------------------------------------------------------------------

export const ENTRY_FS = `#version 300 es
precision highp float;precision highp int;
uniform sampler2D uShown;uniform vec3 uPalette[5];
uniform vec2 uPanelMm,uBezelShift;uniform float uBezelSigma,uPxPerMm,uHeightPx;
out vec4 o;
${PALETTE}
${LEVELS}
${BEZEL_STEP}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 vec4 c=coverage(texelFetch(uLevels,p,0).r),s=texelFetch(uShown,p,0);
 vec3 t=c.x*pass1(s.x)+c.y*pass1(s.y)+c.z*pass1(s.z)+c.w*pass1(s.w);
 vec2 q=vec2(gl_FragCoord.x,uHeightPx-gl_FragCoord.y)/uPxPerMm+uBezelShift;
 float lit=step1(q.x)*step1(uPanelMm.x-q.x)*step1(q.y)*step1(uPanelMm.y-q.y);
 o=vec4(t*lit,lit);
}`;


// ---------------------------------------------------------------------------
// DISPLAY
// ---------------------------------------------------------------------------

export const DISPLAY_FS = `#version 300 es
precision highp float;precision highp int;
uniform sampler2D uShown,uField;uniform vec3 uPalette[5];
uniform bool uShadow;uniform vec2 uSize,uMean;
uniform float uPxPerMm,uExposure,uGlareSigma,uGlareNorm,uFront;uniform vec3 uEye,uLight;
out vec4 o;
${PALETTE}
${LEVELS}
${FRESNEL}
${TO_SRGB}
vec3 flat1(float s){return color(clamp(s,0.25,1.0));}
void main(){
 vec2 p=gl_FragCoord.xy;ivec2 ip=ivec2(p);
 vec4 c=coverage(texelFetch(uLevels,ip,0).r),s=texelFetch(uShown,ip,0);
 vec3 r;
 if(uShadow){
  // Light leaving this pixel entered around it plus the mean offset (the shadow).
  vec3 t=c.x*pass1(s.x)+c.y*pass1(s.y)+c.z*pass1(s.z)+c.w*pass1(s.w);
  r=t*texture(uField,(p+uMean)/uSize).rgb;
 } else {
  // Inspection: light leaves where it entered, so each level shows its measured colour.
  r=(c.x*flat1(s.x)+c.y*flat1(s.y)+c.z*flat1(s.z)+c.w*flat1(s.w))*texelFetch(uField,ip,0).a;
 }
 vec3 pos=vec3(p.x/uPxPerMm,(uSize.y-p.y)/uPxPerMm,0.0);
 vec3 v=normalize(uEye-pos),m=vec3(-v.x,-v.y,v.z);
 float d=acos(clamp(dot(m,uLight),-1.0,1.0));
 float g=fresnel(v.z)*exp(-d*d/(2.0*uGlareSigma*uGlareSigma))*uGlareNorm;
 o=vec4(toSRGB((r+vec3(g))*uExposure),1.0);
}`;

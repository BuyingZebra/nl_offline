/* DMG-01 STN on the GPU. Each pass mirrors model.js:
 *
 *   UPDATE   content -> drive level -> whole DMG frames of drift and sticking (stepFrame)
 *   ENTRY    first pass: room light through each dot, shaded by the bezel (passTransmission)
 *   BLUR     spread of entry points from a light of finite size (shadowKernel)
 *   DISPLAY  second pass at each dot, averaged over the dots under a screen pixel,
 *            plus glare (reflectedColor)
 *
 * UPDATE, ENTRY and BLUR run per panel dot; DISPLAY runs per screen pixel.
 * State texel: r = director q, g = ionic charge, b = drive level, a = coordinate shown
 * (its colour: PALETTE, BGB's measured colours at the solver's brightness). */

import {BEZEL_STEP, FRESNEL, TO_SRGB, BLUR_FS} from '../../gpu/glsl.js';
import {MAX_DOTS_PER_PIXEL} from '../../gpu/webgl.js';

export {BLUR_FS};


// ---------------------------------------------------------------------------
// Tables shared by both passes (driftPerFrame, targetQ, opticalState);
// also used by the vector-input processor (screens/dmgv/)
// ---------------------------------------------------------------------------

export const COMMON = `
// Power: with the LCD switched off there is no drive at all; the crystal relaxes
// toward its unpowered rest, which shows optical state 0 (the measured disabled
// colour), and back when it is switched on. u = how far the panel has relaxed,
// after j DMG frames of this update: off, 1 - (1 - u0) k^j; on, u0 k^j.
uniform float uU0,uUk;uniform bool uOff;
float unpowered(float j){if(!uOff&&uU0<=0.0)return 0.0;return uOff?1.0-(1.0-uU0)*pow(uUk,j):uU0*pow(uUk,j);}
uniform sampler2D uDrift,uOptical,uTargetQ;
uniform float uAnchorQ[4],uCorr[4];
uniform int uLo,uHi,uBins;uniform float uCondF;
float rowDrift(int c,int s,float q){
 float x=clamp(q,0.0,1.0)*float(uBins-1);int i=min(uBins-2,int(floor(x)));
 return mix(texelFetch(uDrift,ivec2(i,c*4+s),0).r,texelFetch(uDrift,ivec2(i+1,c*4+s),0).r,x-float(i));
}
float drift(int s,float q){return mix(rowDrift(uLo,s,q),rowDrift(uHi,s,q),uCondF);}
// The temporary resting state at the nearest solved wheel position, or -1 (model.js metaQ).
uniform sampler2D uMetaQ;uniform float uMetaP;uniform uint uFrame;
float metaQ(int s){return texelFetch(uMetaQ,ivec2(s,uCondF<0.5?uLo:uHi),0).r;}
// Same integer hash as model.js decayDraw: a uniform number per point and DMG frame.
float decayDraw(uint x,uint y,uint k,uint f){
 uint h=(x*0x8da6b343u)^(y*0xd8163841u)^(k*0xcb1ab31fu)^(f*0x165667b1u);
 h=(h^(h>>16u))*0x7feb352du;h=(h^(h>>15u))*0x846ca68bu;h^=h>>16u;
 return float(h>>8u)/16777216.0;
}
// Ion sticking as a move along the normal shades (model.js branchSlope, shownCoordinate).
float branchSlope(float q){int k=q<=uAnchorQ[1]?0:(q<=uAnchorQ[2]?1:2);return (uAnchorQ[k+1]-uAnchorQ[k])/0.25;}
// Target director per wheel position: texture (4 shades wide, one row per position).
float targetQ(int s){return mix(texelFetch(uTargetQ,ivec2(s,uLo),0).r,texelFetch(uTargetQ,ivec2(s,uHi),0).r,uCondF);}
// After this update's DMG frames, a point resting nearer its temporary state than its
// stable one gives way to the stable one with chance uMetaP (model.js settleTemporary;
// uMetaP is 0 when no frame passed).
float settle(float q,int s,float draw){
 float m=metaQ(s),t=targetQ(s);
 return (!uOff&&m>=0.0&&abs(q-m)<abs(q-t)&&draw<uMetaP)?t:q;
}
float corr(float q){
 float x=clamp(q,0.0,1.0);
 if(x<=uAnchorQ[0])return uCorr[0]*x/max(uAnchorQ[0],1e-6);
 for(int k=0;k<3;k++)if(x<=uAnchorQ[k+1])return mix(uCorr[k],uCorr[k+1],(x-uAnchorQ[k])/max(uAnchorQ[k+1]-uAnchorQ[k],1e-6));
 return uCorr[3]*(1.0-x)/max(1.0-uAnchorQ[3],1e-6);
}
float optical(float q){
 float x=clamp(q,0.0,1.0)*float(uBins-1);int i=min(uBins-2,int(floor(x)));
 return clamp(mix(texelFetch(uOptical,ivec2(i,0),0).r,texelFetch(uOptical,ivec2(i+1,0),0).r,x-float(i))+corr(q),-4.0,4.0);
}
// The nominal branch is defined only between the nominal shades (model.js canonicalQ).
float canonical(float q,float st){
 if(st<0.25||st>1.0)return q;
 int k=min(int(floor((st-0.25)*4.0)),2);
 float lo=uAnchorQ[k],hi=uAnchorQ[k+1];
 for(int i=0;i<10;i++){float m=0.5*(lo+hi);if(optical(m)<st)lo=m;else hi=m;}
 return 0.5*(lo+hi);
}`;


// ---------------------------------------------------------------------------
// UPDATE: up to 8 whole DMG frames per display frame
// ---------------------------------------------------------------------------

export const UPDATE_FS = `#version 300 es
precision highp float;
uniform sampler2D uContent,uState;
uniform int uSteps,uInit;uniform bool uIndexInput;uniform float uTscale,uCharge,uRelease,uSticking;
${COMMON}
out vec4 o;
float ionicStep(float ionic,float drive,float f){
 float r=drive>ionic?uCharge:uRelease;return ionic+(drive-ionic)*(1.0-pow(1.0-r,f));
}
float shown(float q,float ionic,float drive,float j){return mix(clamp(q+max(ionic-drive,0.0)*uSticking*branchSlope(q),0.0,1.0),0.0,unpowered(j));}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 vec3 c=texelFetch(uContent,p,0).rgb;
 // Vector input states each dot's drive level exactly (r = level / 3): a lookup.
 // A picture is read by brightness, the source's rule for art not drawn in four levels.
 int s=uIndexInput?int(c.r*3.0+0.5):int(floor(clamp(1.0-dot(c,vec3(0.2126,0.7152,0.0722)),0.0,1.0)*3.0+0.5));
 vec4 st=texelFetch(uState,p,0);
 // 1: settle to the current image (new textures); 2: blank panel (reset).
 if(uInit==1){float q=uOff?0.0:targetQ(s);o=vec4(q,0.0,float(s),shown(q,0.0,0.0,0.0));return;}
 if(uInit==2){float q=targetQ(0);st=vec4(q,0.0,0.0,q);}
 float q=st.r,ionic=st.g,drive=float(s)/3.0,ionDrive=uOff?0.0:drive;
 if(int(st.b+0.5)!=s&&!uOff)q=canonical(q,optical(q));
 float sum=0.0;
 for(int i=0;i<8;i++){
  if(i>=uSteps)break;
  float d=drift(s,q),qm=clamp(q+d*0.5*uTscale,0.0,1.0),qe=clamp(q+d*uTscale,0.0,1.0);
  if(uOff){qm=q*sqrt(uUk);qe=q*uUk;}   // no drive: relaxing toward rest
  float im=ionicStep(ionic,ionDrive,0.5),ie=ionicStep(ionic,ionDrive,1.0),j=float(i);
  sum+=(shown(q,ionic,drive,j)+4.0*shown(qm,im,drive,j+0.5)+shown(qe,ie,drive,j+1.0))/6.0;
  q=qe;ionic=ie;
 }
 q=settle(q,s,decayDraw(uint(p.x),uint(p.y),0u,uFrame));
 o=vec4(q,ionic,float(s),uSteps>0?sum/float(uSteps):st.a);
}`;


// ---------------------------------------------------------------------------
// Colour of a shown coordinate: BGB's measured colours at the solver's brightness
// for that crystal state, in linear light (model.js colorAt).
// ---------------------------------------------------------------------------

// The screen lens: a clear plastic plate (index uLensN) in front of the LCD, with
// an air gap. The room light mirrors off its front, its back and the LCD's front
// surface; all three are parallel, so for a distant light they mirror the same
// direction and add up (incoherently, with the light bouncing between them).
// JS twin: model.js lensReflectance.
export const LENS = `
float fresnelN(float ci,float n){
 float st=sqrt(max(0.0,1.0-ci*ci))/n,ct=sqrt(max(0.0,1.0-st*st));
 float rs=(ci-n*ct)/(ci+n*ct),rp=(n*ci-ct)/(n*ci+ct);
 return 0.5*(rs*rs+rp*rp);
}
float lensReflectance(float ci){
 if(uLensN<=1.0)return fresnel(ci);
 float r=fresnelN(ci,uLensN),Rl=2.0*r/(1.0+r),Tl=(1.0-r)/(1.0+r),Rc=fresnel(ci);
 return Rl+Tl*Tl*Rc/(1.0-Rl*Rc);
}`;

export const PALETTE = `
uniform sampler2D uColor;uniform int uColorBins;
vec3 color(float c){
 float x=clamp(c,0.0,1.0)*float(uColorBins-1);int i=min(uColorBins-2,int(floor(x)));
 return mix(texelFetch(uColor,ivec2(i,0),0).rgb,texelFetch(uColor,ivec2(i+1,0),0).rgb,x-float(i));
}
vec3 pass1(float c){return sqrt(color(c));}`;


// ---------------------------------------------------------------------------
// ENTRY: the first pass. Room light reaching the crystal at each dot (the
// bezel frame shades the edges facing the light), through that dot's state
// ---------------------------------------------------------------------------

export const ENTRY_FS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uPanelMm,uBezelShift;uniform float uBezelSigma,uDotsPerMm,uHeightDots;
out vec4 o;
${PALETTE}
${BEZEL_STEP}
void main(){
 float s=texelFetch(uState,ivec2(gl_FragCoord.xy),0).a;
 // Light reaching the crystal here crossed the bezel plane at q; the frame blocks it outside the window.
 vec2 q=vec2(gl_FragCoord.x,uHeightDots-gl_FragCoord.y)/uDotsPerMm+uBezelShift;
 float lit=step1(q.x)*step1(uPanelMm.x-q.x)*step1(q.y)*step1(uPanelMm.y-q.y);
 o=vec4(pass1(s)*lit,1.0);
}`;


// ---------------------------------------------------------------------------
// DISPLAY: the second pass. Light leaving a dot entered around the dot plus
// the mean entry offset; each screen pixel shows the average of its dots.
// ---------------------------------------------------------------------------

export const DISPLAY_FS = `#version 300 es
precision highp float;
uniform sampler2D uState,uField;
uniform int uDots;uniform vec2 uSize,uDotSize,uMean;
uniform float uPxPerMm,uExposure,uGlareSigma,uGlareNorm,uFront,uLensN;uniform vec3 uEye,uLight;
out vec4 o;
${PALETTE}
${FRESNEL}
${LENS}
${TO_SRGB}
void main(){
 vec2 p=gl_FragCoord.xy;ivec2 first=ivec2(floor(p))*uDots;
 vec3 sum=vec3(0.0);
 for(int y=0;y<${MAX_DOTS_PER_PIXEL};y++)for(int x=0;x<${MAX_DOTS_PER_PIXEL};x++){
  if(x>=uDots||y>=uDots)continue;
  ivec2 d=first+ivec2(x,y);
  vec3 entry=texture(uField,(vec2(d)+0.5+uMean)/uDotSize).rgb;
  sum+=pass1(texelFetch(uState,d,0).a)*entry;
 }
 vec3 r=sum/float(uDots*uDots);
 // Front-surface glare: the room light mirrored toward this point's eye ray.
 vec3 pos=vec3(p.x/uPxPerMm,(uSize.y-p.y)/uPxPerMm,0.0);
 vec3 v=normalize(uEye-pos),m=vec3(-v.x,-v.y,v.z);
 float d=acos(clamp(dot(m,uLight),-1.0,1.0));
 float g=lensReflectance(v.z)*exp(-d*d/(2.0*uGlareSigma*uGlareSigma))*uGlareNorm;
 o=vec4(toSRGB((r+vec3(g))*uExposure),1.0);
}`;

/* DMG-01 STN on the GPU. Each pass mirrors model.js:
 *
 *   UPDATE   content -> drive level -> whole DMG frames of drift and sticking (stepFrame)
 *   ENTRY    first pass: room light through each dot, shaded by the bezel (passTransmission)
 *   BLUR     spread of entry points from a light of finite size (shadowKernel)
 *   DISPLAY  second pass at each dot, averaged over the dots under a screen pixel,
 *            plus glare (reflectedColor)
 *
 * UPDATE, ENTRY and BLUR run per panel dot; DISPLAY runs per screen pixel.
 * State texel: r = director q, g = ionic charge, b = drive level, a = light shown. */

import {BEZEL_STEP, FRESNEL, TO_SRGB, BLUR_FS} from '../../gpu/glsl.js';
import {MAX_DOTS_PER_PIXEL} from '../../gpu/webgl.js';

export {BLUR_FS};


// ---------------------------------------------------------------------------
// Tables shared by both passes (driftPerFrame, targetQ, opticalState);
// also used by the vector-input processor (screens/dmgv/)
// ---------------------------------------------------------------------------

export const COMMON = `
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


// ---------------------------------------------------------------------------
// UPDATE: up to 8 whole DMG frames per display frame
// ---------------------------------------------------------------------------

export const UPDATE_FS = `#version 300 es
precision highp float;
uniform sampler2D uContent,uState;
uniform int uSteps,uInit;uniform bool uIndexInput;uniform float uTscale,uCharge,uRelease,uSticking;
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
 // Vector input states each dot's drive level exactly (r = level / 3): a lookup.
 // A picture is read by brightness, the source's rule for art not drawn in four levels.
 int s=uIndexInput?int(c.r*3.0+0.5):int(floor(clamp(1.0-dot(c,vec3(0.2126,0.7152,0.0722)),0.0,1.0)*3.0+0.5));
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


// ---------------------------------------------------------------------------
// The measured palette in linear light: LCD disabled, then shades 0..3
// (opticalColor). Needs: uniform vec3 uPalette[5].
// ---------------------------------------------------------------------------

export const PALETTE = `
vec3 color(float s){
 float x=clamp(s,0.0,1.0)*4.0;int k=min(3,int(floor(x)));
 return mix(uPalette[k],uPalette[k+1],x-float(k));
}
vec3 pass1(float s){return sqrt(color(clamp(s,0.25,1.0)));}`;


// ---------------------------------------------------------------------------
// ENTRY: the first pass. Room light reaching the crystal at each dot (the
// bezel frame shades the edges facing the light), through that dot's state
// ---------------------------------------------------------------------------

export const ENTRY_FS = `#version 300 es
precision highp float;
uniform sampler2D uState;uniform vec3 uPalette[5];
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
uniform sampler2D uState,uField;uniform vec3 uPalette[5];
uniform int uDots;uniform vec2 uSize,uDotSize,uMean;
uniform float uPxPerMm,uExposure,uGlareSigma,uGlareNorm,uFront;uniform vec3 uEye,uLight;
out vec4 o;
${PALETTE}
${FRESNEL}
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
 float g=fresnel(v.z)*exp(-d*d/(2.0*uGlareSigma*uGlareSigma))*uGlareNorm;
 o=vec4(toSRGB((r+vec3(g))*uExposure),1.0);
}`;

/* DMG-01 STN on the GPU. Each pass mirrors model.js:
 *
 *   UPDATE   content -> drive level -> whole DMG frames of drift and sticking (stepFrame)
 *   DISPLAY  shown state -> measured palette, reflector shadow, bezel, glare (opticalColor)
 *
 * State texel: r = director q, g = ionic charge, b = drive level, a = light shown. */

import {BEZEL_STEP, FRESNEL, TO_SRGB} from '../../gpu/glsl.js';


// ---------------------------------------------------------------------------
// Tables shared by both passes (driftPerFrame, targetQ, opticalState)
// ---------------------------------------------------------------------------

const COMMON = `
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


// ---------------------------------------------------------------------------
// DISPLAY: palette colour, reflector shadow where the shifted image is darker,
// bezel shadow and front-surface glare
// ---------------------------------------------------------------------------

export const DISPLAY_FS = `#version 300 es
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
${BEZEL_STEP}
${FRESNEL}
${TO_SRGB}
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
 vec3 c=(r+vec3(g))*uExposure;
 o=vec4(toSRGB(c),1.0);
}`;

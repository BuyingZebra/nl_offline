/* Reflective TN on the GPU. Each pass mirrors model.js:
 *
 *   UPDATE   content -> drive voltage -> director state       (stepState)
 *   ENTRY    light entering the glass at each point            (entryVector, bezelLight)
 *   BLUR     spread of entry points from a light of finite size (shadowKernel)
 *   DISPLAY  exit state + blurred entry light -> colour, + glare (reflectanceFromEntry, glare) */

import {BEZEL_STEP, FRESNEL, TO_SRGB, BLUR_FS} from '../../gpu/glsl.js';


// ---------------------------------------------------------------------------
// UPDATE: one exact exponential step of the director toward its equilibrium
// ---------------------------------------------------------------------------

export const UPDATE_FS = `#version 300 es
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


// ---------------------------------------------------------------------------
// ENTRY: rank-4 entry vector at each point, shaded by the bezel, stored
// normalized to [0, 1] per component so 8-bit targets also work
// ---------------------------------------------------------------------------

export const ENTRY_FS = `#version 300 es
precision highp float;
uniform sampler2D uState,uEntryLut;uniform float uAmax,uN;uniform vec4 uLo,uSpan;
uniform vec2 uPanelMm,uBezelShift;uniform float uBezelSigma,uPxPerMm,uHeightPx;
out vec4 o;
${BEZEL_STEP}
void main(){
 float a=texelFetch(uState,ivec2(gl_FragCoord.xy),0).r;
 vec4 e=texture(uEntryLut,vec2((clamp(a/uAmax,0.0,1.0)*(uN-1.0)+0.5)/uN,0.5));
 // Light reaching the crystal here crossed the bezel plane at q; the frame blocks it outside the window.
 vec2 q=vec2(gl_FragCoord.x,uHeightPx-gl_FragCoord.y)/uPxPerMm+uBezelShift;
 float lit=step1(q.x)*step1(uPanelMm.x-q.x)*step1(q.y)*step1(uPanelMm.y-q.y);
 o=(e*lit-uLo)/uSpan;
}`;


// ---------------------------------------------------------------------------
// BLUR: one-dimensional Gaussian along any direction (two passes = elliptical),
// shared with the DMG-01 in gpu/glsl.js
// ---------------------------------------------------------------------------

export {BLUR_FS};


// ---------------------------------------------------------------------------
// DISPLAY: light leaving at x entered around x + mean offset; add glare
// ---------------------------------------------------------------------------

export const DISPLAY_FS = `#version 300 es
precision highp float;
uniform sampler2D uState,uField,uExitLut;
uniform vec2 uSize,uMean;uniform float uAmax,uN,uExposure;uniform vec4 uLo,uSpan;
uniform float uPxPerMm,uGlareSigma,uGlareNorm,uFront;uniform vec3 uEye,uLight;
out vec4 o;
${FRESNEL}
${TO_SRGB}
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
 vec3 c=(r+vec3(g))*uExposure;
 o=vec4(toSRGB(c),1.0);
}`;

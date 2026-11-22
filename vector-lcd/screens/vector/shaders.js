/* Vectrex vector display on the GPU. Each pass mirrors model.js:
 *
 *   LINES    one quad per line, added up: its Gaussian cross-section, its
 *            spot-wide ends and the dot where the beam stops (lineLight)
 *   DISPLAY  the phosphor's colour, the room's reflection, bezel and glare */

import {BEZEL_STEP, FRESNEL, TO_SRGB} from '../../gpu/glsl.js';


// ---------------------------------------------------------------------------
// LINES: instanced quads, additive
// ---------------------------------------------------------------------------

export const LINES_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aLine;   // x0 y0 x1 y1, display pixels (rows up)
uniform float uReach;               // how far a line's light reaches: 4 sigma
uniform vec2 uSize;
flat out vec4 vLine;
void main(){
 vLine=aLine;
 vec2 a=aLine.xy,b=aLine.zw,d=b-a;float L=length(d);
 vec2 u=L>0.0?d/L:vec2(1.0,0.0),n=vec2(-u.y,u.x);
 // Two triangles around the line, grown by the reach on every side.
 int k=gl_VertexID;float s=(k==1||k==2||k==4)?1.0:0.0,t=(k==2||k==4||k==5)?1.0:-1.0;
 vec2 p=mix(a-u*uReach,b+u*uReach,s)+n*t*uReach;
 gl_Position=vec4(p/uSize*2.0-1.0,0.0,1.0);
}`;

export const LINES_FS = `#version 300 es
precision highp float;
uniform float uSigma,uDot,uScale;
flat in vec4 vLine;
out vec4 o;
float erf_(float x){
 float t=1.0/(1.0+0.3275911*abs(x));
 float y=1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*exp(-x*x);
 return sign(x)*y;
}
void main(){
 vec2 p=gl_FragCoord.xy,a=vLine.xy,b=vLine.zw,d=b-a;float L=length(d);
 vec2 u=L>0.0?d/L:vec2(1.0,0.0);
 vec2 q=p-a;float along=dot(q,u),across=-q.x*u.y+q.y*u.x,s2=uSigma*1.41421356;
 float line=exp(-across*across/(2.0*uSigma*uSigma))*0.5*(erf_((L-along)/s2)-erf_(-along/s2));
 vec2 e=p-b;
 o=vec4(uScale*(line+uDot*exp(-dot(e,e)/(2.0*uSigma*uSigma))),0.0,0.0,1.0);
}`;


// ---------------------------------------------------------------------------
// DISPLAY: phosphor colour, room reflection, bezel and glare
// ---------------------------------------------------------------------------

export const DISPLAY_FS = `#version 300 es
precision highp float;
uniform sampler2D uLight;uniform vec2 uSize,uPanelMm,uBezelShift;uniform vec3 uRgb,uEye,uLight3;
uniform float uFull,uAmbient,uExposure,uPxPerMm,uBezelSigma,uGlareSigma,uGlareNorm,uFront,uRoom,uMpp;
out vec4 o;
${BEZEL_STEP}
${FRESNEL}
${TO_SRGB}
void main(){
 vec2 p=gl_FragCoord.xy;
 float Y=texelFetch(uLight,ivec2(p),0).r*uFull;
 vec2 b=vec2(p.x,uSize.y-p.y)/uPxPerMm+uBezelShift;
 float lit=step1(b.x)*step1(uPanelMm.x-b.x)*step1(b.y)*step1(uPanelMm.y-b.y);
 vec3 pos=vec3(p.x/uPxPerMm,(uSize.y-p.y)/uPxPerMm,0.0)*uMpp;
 vec3 v=normalize(uEye-pos),m=vec3(-v.x,-v.y,v.z);
 float d=acos(clamp(dot(m,uLight3),-1.0,1.0));
 float g=fresnel(v.z)*exp(-d*d/(2.0*uGlareSigma*uGlareSigma))*uGlareNorm*uRoom;
 vec3 c=(vec3(uAmbient*lit+g)+Y*uRgb)*uExposure;
 o=vec4(toSRGB(c),1.0);
}`;

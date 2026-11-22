/* Game Boy Color CGB-001 on the GPU. Each pass mirrors model.js:
 *
 *   UPDATE   art -> RGB555 codes -> whole GBC frames of first-order response,
 *            and the frame-average colour along the way (stepFrame)
 *   DISPLAY  each pixel's colour through its R G B stripes, bezel and glare (apertureColour)
 *
 * The state lives on the 160 x 144 grid's pitch, one texel per logical pixel,
 * top row first, in two targets written by the same step:
 *   A: r g b = channel states s, a = target codes (r + 32 g + 1024 b)
 *   B: r = segment start codes (packed the same way), g b a = frame-average XYZ */

import {BEZEL_STEP, FRESNEL, TO_SRGB} from '../../gpu/glsl.js';
import {QUADRATURE} from './model.js';


// ---------------------------------------------------------------------------
// UPDATE: up to 8 whole GBC frames per display frame
// ---------------------------------------------------------------------------

export const UPDATE_FS = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D uContent,uA,uB,uRates;uniform sampler3D uLut;
uniform int uSteps,uInit,uWhich;uniform float uFrameS,uSnap;uniform vec2 uPitchPx,uSize;
out vec4 o;
const int ART_SAMPLES=6;   // per side: the art is averaged over 6 x 6 points of each pixel
const float QUAD[8]=float[8](${QUADRATURE.map(v => v.toFixed(9)).join(',')});
vec3 lut(ivec3 i){return texelFetch(uLut,i,0).rgb;}
vec3 xyzAt(vec3 s){
 vec3 x=clamp(s,0.0,1.0)*31.0;ivec3 i=min(ivec3(floor(x)),ivec3(30));vec3 f=x-vec3(i);
 vec3 a=mix(lut(i),lut(i+ivec3(1,0,0)),f.x),b=mix(lut(i+ivec3(0,1,0)),lut(i+ivec3(1,1,0)),f.x);
 vec3 c=mix(lut(i+ivec3(0,0,1)),lut(i+ivec3(1,0,1)),f.x),d=mix(lut(i+ivec3(0,1,1)),lut(i+ivec3(1,1,1)),f.x);
 return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);
}
ivec3 unpack(float v){int n=int(v+0.5);return ivec3(n&31,(n>>5)&31,(n>>10)&31);}
float pack(ivec3 c){return float(c.r+32*c.g+1024*c.b);}
float rate(int start,int target){return texelFetch(uRates,ivec2(target,start),0).r;}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 // The art averaged over the logical pixel's area, in linear light: the
 // art shrunk to the panel's pixels (content rows run up).
 vec3 artSum=vec3(0.0);
 for(int y=0;y<ART_SAMPLES;y++)for(int x=0;x<ART_SAMPLES;x++){
  vec2 c=(vec2(p)+(vec2(x,y)+0.5)/float(ART_SAMPLES))*uPitchPx;
  vec3 v=texelFetch(uContent,ivec2(clamp(floor(c.x),0.0,uSize.x-1.0),clamp(uSize.y-1.0-floor(c.y),0.0,uSize.y-1.0)),0).rgb;
  artSum+=mix(v/12.92,pow((v+0.055)/1.055,vec3(2.4)),step(0.04045,v));
 }
 vec3 lin=artSum/float(ART_SAMPLES*ART_SAMPLES);
 vec3 art=mix(lin*12.92,1.055*pow(lin,vec3(1.0/2.4))-0.055,step(0.0031308,lin));
 ivec3 code=ivec3(floor(clamp(art,0.0,1.0)*31.0+0.5));
 vec3 goal=vec3(code)/31.0;
 vec4 A=texelFetch(uA,p,0),B=texelFetch(uB,p,0);
 if(uInit==1){o=uWhich==0?vec4(goal,pack(code)):vec4(pack(code),xyzAt(goal));return;}
 vec3 s=A.rgb;ivec3 target=unpack(A.a),start=unpack(B.r);
 for(int k=0;k<3;k++)if(code[k]!=target[k])start[k]=int(floor(clamp(s[k],0.0,1.0)*31.0+0.5));
 vec3 rt=vec3(rate(start.r,code.r),rate(start.g,code.g),rate(start.b,code.b));
 vec3 sum=vec3(0.0);
 for(int n=0;n<8;n++){
  if(n>=uSteps)break;
  for(int q=0;q<8;q++)sum+=xyzAt(goal+(s-goal)*exp(-rt*QUAD[q]*uFrameS))/8.0;
  s=goal+(s-goal)*exp(-rt*uFrameS);
  s=mix(s,goal,vec3(lessThan(abs(s-goal),vec3(uSnap))));
 }
 vec3 xyz=uSteps>0?sum/float(uSteps):B.gba;
 o=uWhich==0?vec4(s,pack(code)):vec4(pack(start),xyz);
}`;


// ---------------------------------------------------------------------------
// DISPLAY: stripes over each display pixel's footprint, bezel shadow, glare
// ---------------------------------------------------------------------------

export const DISPLAY_FS = `#version 300 es
precision highp float;
uniform sampler2D uB;uniform ivec2 uGrid;
uniform vec2 uSize,uPitchPx,uPanelMm,uBezelShift;
uniform float uPxPerMm,uBezelSigma,uExposure,uGlareSigma,uGlareNorm,uFront,uResolve;uniform vec3 uEye,uLight;
out vec4 o;
${BEZEL_STEP}
${FRESNEL}
${TO_SRGB}
vec3 linearRGB(vec3 c){
 return vec3(dot(c,vec3(3.2404542,-1.5371385,-0.4985314)),dot(c,vec3(-0.969266,1.8760108,0.041556)),dot(c,vec3(0.0556434,-0.2040259,1.0572252)));
}
vec3 pixelColour(int i,int j){return linearRGB(texelFetch(uB,clamp(ivec2(i,j),ivec2(0),uGrid-1),0).gba)*uExposure;}
float stripeContrast(vec3 c){
 float m=1.0;for(int k=0;k<3;k++)if(c[k]>1.0/3.0)m=min(m,(1.0-c[k])/(2.0*c[k]));return max(m,0.0);
}
float overlap(float a0,float a1,float b0,float b1){return max(0.0,min(a1,b1)-max(a0,b0));}
void main(){
 vec2 p=gl_FragCoord.xy;
 float x0=floor(p.x),top=uSize.y-1.0-floor(p.y);
 float u0=x0/uPitchPx.x,u1=(x0+1.0)/uPitchPx.x,v0=top/uPitchPx.y,v1=(top+1.0)/uPitchPx.y;
 vec3 r=vec3(0.0);
 for(int dj=0;dj<4;dj++){
  float j=floor(v0)+float(dj);if(j>=v1)break;
  float wy=overlap(v0,v1,j,j+1.0);
  for(int di=0;di<4;di++){
   float i=floor(u0)+float(di);if(i>=u1)break;
   vec3 c=pixelColour(int(i),int(j));float m=uResolve*stripeContrast(c),all=overlap(u0,u1,i,i+1.0);
   vec3 stripe=vec3(overlap(u0,u1,i,i+1.0/3.0),overlap(u0,u1,i+1.0/3.0,i+2.0/3.0),overlap(u0,u1,i+2.0/3.0,i+1.0));
   r+=wy*c*((1.0-m)*all+m*3.0*stripe);
  }
 }
 r/=(u1-u0)*(v1-v0);
 // Outside the display (a negative channel): toward grey of equal luminance.
 float lo=min(r.r,min(r.g,r.b));
 if(lo<0.0){float L=dot(r,vec3(0.2126,0.7152,0.0722));r=L>0.0?vec3(L)+L/(L-lo)*(r-vec3(L)):vec3(0.0);}
 // The bezel frame above the glass shades the edges that face the light.
 vec2 b=vec2(p.x,uSize.y-p.y)/uPxPerMm+uBezelShift;
 r*=step1(b.x)*step1(uPanelMm.x-b.x)*step1(b.y)*step1(uPanelMm.y-b.y);
 vec3 pos=vec3(p.x/uPxPerMm,(uSize.y-p.y)/uPxPerMm,0.0);
 vec3 v=normalize(uEye-pos),m=vec3(-v.x,-v.y,v.z);
 float d=acos(clamp(dot(m,uLight),-1.0,1.0));
 float g=fresnel(v.z)*exp(-d*d/(2.0*uGlareSigma*uGlareSigma))*uGlareNorm;
 o=vec4(toSRGB(r+vec3(g)*uExposure),1.0);
}`;

/* GLSL shared by every screen's shaders.
 *
 * Each chunk is the GPU twin of a JavaScript function in optics/room.js, and
 * expects the uniforms named beside it to be declared by the shader using it. */


// ---------------------------------------------------------------------------
// Fullscreen triangle: one draw covers the whole target, no vertex buffer.
// ---------------------------------------------------------------------------

export const FULLSCREEN_VERT = `#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;


// ---------------------------------------------------------------------------
// Bezel shadow edge: a Gaussian-blurred step (room.js bezelLight).
// Needs: uniform float uBezelSigma.
// ---------------------------------------------------------------------------

export const BEZEL_STEP = `
float erf1(float x){float t=1.0/(1.0+0.3275911*abs(x));
 float y=1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*exp(-x*x);return sign(x)*y;}
float step1(float d){return 0.5*(1.0+erf1(d/(uBezelSigma*1.41421356)));}`;


// ---------------------------------------------------------------------------
// Unpolarized Fresnel reflectance of the front surface (room.js fresnelReflectance).
// Needs: uniform float uFront (refractive index).
// ---------------------------------------------------------------------------

export const FRESNEL = `
float fresnel(float ci){
 float st=sqrt(max(0.0,1.0-ci*ci))/uFront,ct=sqrt(max(0.0,1.0-st*st));
 float rs=(ci-uFront*ct)/(ci+uFront*ct),rp=(uFront*ci-ct)/(uFront*ci+ct);
 return 0.5*(rs*rs+rp*rp);
}`;


// ---------------------------------------------------------------------------
// Linear light to the display's sRGB encoding.
// ---------------------------------------------------------------------------

export const TO_SRGB = `
vec3 toSRGB(vec3 c){c=clamp(c,0.0,1.0);return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}`;

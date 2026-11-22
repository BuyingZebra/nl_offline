/* The viewer's eye on the GPU: one pass every screen can end with.
 *
 *   the screen's display pass  -> view (linear light, unclamped, with mipmaps)
 *   VEIL     the straylight integral over rings, at 1/4 resolution  (optics/eye.js glareRings)
 *   COMPOSE  direct image * (1 - scattered share) + veil -> sRGB on the canvas
 *
 * The rings run from 0.1 degrees to the far corner of the screen; light from
 * outside the screen (the room) is not included. */

import {TO_SRGB} from './glsl.js';
import {glareRings, scatteredFraction} from '../optics/eye.js';

// 24 rings x 24 taps: within 3 % of the exact integral (tests/vector-lcd-gpu.mjs eyeGlare); 12 taps gave 15 %.
const RINGS = 24, TAPS = 24, DOWNSCALE = 4;

const VEIL_FS = `#version 300 es
precision highp float;
uniform sampler2D uView;uniform vec2 uSize,uSmall;uniform float uR[${RINGS}],uW[${RINGS}];
out vec4 o;
vec3 viewAt(vec2 px,float lod){
 if(px.x<0.0||px.y<0.0||px.x>uSize.x||px.y>uSize.y)return vec3(0.0);   // outside the screen: no light
 return textureLod(uView,px/uSize,lod).rgb;
}
void main(){
 vec2 p=gl_FragCoord.xy*${DOWNSCALE}.0;   // full-resolution position: each veil texel is exactly a ${DOWNSCALE} x ${DOWNSCALE} px block
 vec3 veil=vec3(0.0);
 for(int j=0;j<${RINGS};j++){
  float r=uR[j];vec3 ring=vec3(0.0);
  // Average over the gap between taps: a mip level as wide as the spacing.
  float lod=max(0.0,log2(6.2831853*r/${TAPS}.0));
  for(int k=0;k<${TAPS};k++){float a=6.2831853*(float(k)+0.5*float(j&1))/${TAPS}.0;ring+=viewAt(p+r*vec2(cos(a),sin(a)),lod);}
  veil+=uW[j]*ring/${TAPS}.0;
 }
 o=vec4(veil,1.0);
}`;

const COMPOSE_FS = `#version 300 es
precision highp float;
uniform sampler2D uView,uVeil;uniform vec2 uSize,uSmall;uniform float uKeep;
out vec4 o;
${TO_SRGB}
void main(){
 vec2 p=gl_FragCoord.xy;
 vec3 direct=texelFetch(uView,ivec2(p),0).rgb*uKeep;
 o=vec4(toSRGB(direct+texture(uVeil,p/(uSmall*${DOWNSCALE}.0)).rgb),1.0);
}`;


/**
 * @param {ReturnType<import('./webgl.js').createGPU>} gpu
 */
export function createEyeGlare(gpu) {
 const {gl} = gpu;
 let programs = null, view = null, veil = null, size = null, small = null;
 let cache = {key: '', rings: null, keep: 1};       // ring weights change only with the eye or the screen size

 function setup() {
  programs = {veil: gpu.program(VEIL_FS), compose: gpu.program(COMPOSE_FS)};
  view = veil = size = null;
 }

 /** Targets for a W x H screen (call after every resize). */
 function allocate(W, H) {
  gpu.release(view, veil);
  size = [W, H];
  small = [Math.max(1, Math.ceil(W / DOWNSCALE)), Math.max(1, Math.ceil(H / DOWNSCALE))];
  const target = ([w, h], mipmaps) => {
   const tex = gpu.texture(gl.LINEAR);
   gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
   if (mipmaps) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.generateMipmap(gl.TEXTURE_2D); }
   const fb = gl.createFramebuffer();
   gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
   gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
   gl.bindFramebuffer(gl.FRAMEBUFFER, null);
   return {tex, fb};
  };
  view = target(size, true);
  veil = target(small, false);
 }

 /**
  * Scatter the view through the eye and draw the result to the canvas.
  * @param {{distancePx:number, age:number, pigment:number}} eye  distancePx: eye distance in screen pixels
  */
 function apply({distancePx, age, pigment}) {
  const [W, H] = size;
  gl.bindTexture(gl.TEXTURE_2D, view.tex);
  gl.generateMipmap(gl.TEXTURE_2D);
  // Rings out to the farthest the screen reaches from any point on it: its diagonal.
  const maxDeg = Math.atan(Math.hypot(W, H) / distancePx) * 180 / Math.PI;
  const key = [maxDeg.toFixed(4), age, pigment].join();
  if (key !== cache.key) cache = {key, rings: glareRings(maxDeg, age, pigment, RINGS), keep: 1 - scatteredFraction(age, pigment)};
  const {rings, keep} = cache;
  gpu.draw(programs.veil, veil.fb, small, p => {
   gpu.bind(p, 0, 'uView', view.tex);
   gl.uniform2f(p.u('uSize'), W, H);
   gl.uniform2f(p.u('uSmall'), small[0], small[1]);
   gl.uniform1fv(p.u('uR'), rings.thetaDeg.map(t => distancePx * Math.tan(t * Math.PI / 180)));
   gl.uniform1fv(p.u('uW'), rings.weight);
  });
  gpu.draw(programs.compose, null, size, p => {
   gpu.bind(p, 0, 'uView', view.tex);
   gpu.bind(p, 1, 'uVeil', veil.tex);
   gl.uniform2f(p.u('uSize'), W, H);
   gl.uniform2f(p.u('uSmall'), small[0], small[1]);
   gl.uniform1f(p.u('uKeep'), keep);
  });
 }

 /** The linear view the eye looked at, full resolution (GL rows, bottom up), for tests. */
 function readView() {
  const [W, H] = size, data = new Float32Array(W * H * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, view.fb);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, data);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return {width: W, height: H, data};
 }

 /** Veil (linear RGB) at a screen pixel (GL rows, bottom up), for tests. */
 function sampleVeil(x, y) {
  const t = gpu.readTexel(veil.fb, Math.min(small[0] - 1, Math.floor(x / DOWNSCALE)), Math.min(small[1] - 1, Math.floor(y / DOWNSCALE)));
  return [t[0], t[1], t[2]];
 }

 setup();
 return Object.freeze({
  setup, allocate, apply, sampleVeil, readView, DOWNSCALE,
  /** Framebuffer the screen draws its linear view into. */
  get viewFb() { return view?.fb ?? null; },
  get ready() { return Boolean(view); }
 });
}

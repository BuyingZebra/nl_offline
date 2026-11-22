/* Vectrex vector display renderer: draws the frame's display list (setVectors)
 * as additive Gaussian lines, then the display pass.
 *
 * Content comes as line segments in panel millimetres, not as a picture: a
 * vector display has no raster to draw on. beginContent is kept for the
 * contract and ignored. */

import {createGPU, createSurface, createMeter} from '../../gpu/webgl.js';
import {clamp, directionVector, bezelShiftMm, bezelPenumbraMm, glareSigma, glareNorm} from '../../optics/room.js';
import {checkProfile, dotStrength, monitorPerPanel, lightScale, ambient, fullRelative, adaptedExposure, refreshHz, lineLight} from './model.js';
import {LINES_VS, LINES_FS, DISPLAY_FS} from './shaders.js';

export const VERSION = '0.1.0';

const VIEW_DISTANCE_MM = 600;      // a console on a table, viewed straight on (assumed)
const MAX_ROOM_LUX = 1000;


/** @returns {import('../contract.js').ScreenRenderer} */
export function createRenderer(canvas, {profile: initialProfile, widthMm, heightMm, maxPixels, bezelLipMm = 1} = {}) {
 let profile = checkProfile(initialProfile);
 const surface = createSurface(canvas, {widthMm, heightMm, maxPixels});
 const gpu = createGPU(canvas, 'Vector'), {gl} = gpu;
 const meter = createMeter();


 // ===========================================================================
 // State
 // ===========================================================================

 let res = null;
 let vectors = [];                  // this round's display list, panel mm
 let lighting = {angleDeg: 45, azimuthDeg: 315, sourceDeg: 15, exposure: 1};
 let brightness = profile.controls.brightness.value;
 let roomLux = profile.luminance.room_lux;
 const mpp = () => monitorPerPanel(profile, heightMm);
 /** Spot sigma in display pixels, widened by the pixel's own width (a box of variance 1/12). */
 const sigmaPx = () => Math.hypot(profile.beam.sigma_mm / mpp() * surface.pxPerMm, Math.sqrt(1 / 12));


 // ===========================================================================
 // GPU resources
 // ===========================================================================

 function setup() {
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This screen model needs float render targets, which this browser does not provide.');
  res = {lines: linesProgram(), display: gpu.program(DISPLAY_FS), buffer: gl.createBuffer(), vao: gl.createVertexArray(), light: null};
  gl.bindVertexArray(res.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, res.buffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
  gl.vertexAttribDivisor(0, 1);
  gl.bindVertexArray(null);
  if (surface.W && surface.H) allocate();
 }

 /** The line program has its own vertex shader (instanced quads), so it is built here. */
 function linesProgram() {
  const compile = (type, src) => {
   const sh = gl.createShader(type);
   gl.shaderSource(sh, src);
   gl.compileShader(sh);
   if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('Vector shader: ' + gl.getShaderInfoLog(sh));
   return sh;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, LINES_VS));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, LINES_FS));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Vector program: ' + gl.getProgramInfoLog(p));
  return {p, u: name => gl.getUniformLocation(p, name)};
 }

 function allocate() {
  gpu.release(res.light);
  res.light = gpu.target(surface.W, surface.H, {internal: gl.RGBA16F, type: gl.HALF_FLOAT});
 }

 function reset() {}


 // ===========================================================================
 // Frame
 // ===========================================================================

 function frame(now = performance.now()) {
  if (gpu.lost || !res || !surface.W) return;
  meter.tick(1000 / 60);
  const {W, H, pxPerMm} = surface, m = mpp(), sigma = sigmaPx();

  // ---- 1. This round's lines, added up (display pixels, rows up)
  const data = new Float32Array(vectors.length * 4);
  vectors.forEach(([x0, y0, x1, y1], i) => data.set([x0 * pxPerMm, H - y0 * pxPerMm, x1 * pxPerMm, H - y1 * pxPerMm], i * 4));
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.light.fb);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (vectors.length) {
   gl.enable(gl.BLEND);
   gl.blendFunc(gl.ONE, gl.ONE);
   gl.useProgram(res.lines.p);
   gl.uniform1f(res.lines.u('uReach'), 4 * sigma);
   gl.uniform2f(res.lines.u('uSize'), W, H);
   gl.uniform1f(res.lines.u('uSigma'), sigma);
   gl.uniform1f(res.lines.u('uDot'), dotStrength(profile));
   gl.uniform1f(res.lines.u('uScale'), lightScale(profile, brightness, vectors.length));
   gl.bindVertexArray(res.vao);
   gl.bindBuffer(gl.ARRAY_BUFFER, res.buffer);
   gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
   gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, vectors.length);
   gl.bindVertexArray(null);
   gl.disable(gl.BLEND);
  }

  // ---- 2. Phosphor colour, room, bezel, glare
  gpu.draw(res.display, null, [W, H], p => {
   gpu.bind(p, 0, 'uLight', res.light.tex);
   gl.uniform2f(p.u('uSize'), W, H);
   gl.uniform3fv(p.u('uRgb'), profile.phosphor.display_rgb_per_Y);
   gl.uniform1f(p.u('uFull'), fullRelative(profile));
   gl.uniform1f(p.u('uAmbient'), ambient(profile, roomLux));
   gl.uniform1f(p.u('uRoom'), roomLux / profile.luminance.room_lux);
   gl.uniform1f(p.u('uExposure'), lighting.exposure * adaptedExposure(profile));
   gl.uniform1f(p.u('uPxPerMm'), pxPerMm);
   gl.uniform1f(p.u('uMpp'), m);
   const shift = bezelShiftMm(profile, lighting, bezelLipMm);
   gl.uniform2f(p.u('uPanelMm'), W / pxPerMm, H / pxPerMm);
   gl.uniform2f(p.u('uBezelShift'), shift.x / m, shift.y / m);
   gl.uniform1f(p.u('uBezelSigma'), Math.max(1e-3, bezelPenumbraMm(profile, lighting, bezelLipMm) / m));
   gl.uniform3f(p.u('uEye'), W / pxPerMm / 2 * m, H / pxPerMm / 2 * m, VIEW_DISTANCE_MM);
   gl.uniform3fv(p.u('uLight3'), directionVector(lighting.angleDeg, lighting.azimuthDeg));
   const g = glareSigma(lighting.sourceDeg);
   gl.uniform1f(p.u('uGlareSigma'), g);
   gl.uniform1f(p.u('uGlareNorm'), glareNorm(g, lighting.angleDeg));
   gl.uniform1f(p.u('uFront'), profile.oblique.front_index);
  });
 }


 // ===========================================================================
 // Size and readback
 // ===========================================================================

 function resize(cssWidth, cssHeight, dpr = 1) {
  const fit = surface.fit(cssWidth, cssHeight, dpr, gpu.maxTextureSize);
  if (fit.changed && res && !gpu.lost) allocate();
  return {width: fit.width, height: fit.height, pxPerMm: fit.pxPerMm};
 }

 /** Light at a point (panel mm), relative to a long full-current line at 50 Hz. */
 function sample(xMm, yMm) {
  if (!res || gpu.lost) return null;
  const [x, y] = surface.texelAt(xMm, yMm);
  return gpu.readTexel(res.light.fb, x, y)[0];
 }

 /** The model's light at the same display pixel centre, for tests. */
 function modelSample(xMm, yMm) {
  const [x, y] = surface.texelAt(xMm, yMm), {H, pxPerMm} = surface, sigma = sigmaPx(), dot = dotStrength(profile);
  const scale = lightScale(profile, brightness, vectors.length);
  return vectors.reduce((sum, [x0, y0, x1, y1]) =>
   sum + scale * lineLight(x + .5, y + .5, [x0 * pxPerMm, H - y0 * pxPerMm, x1 * pxPerMm, H - y1 * pxPerMm], sigma, dot), 0);
 }


 // ===========================================================================
 // Start, and the public interface
 // ===========================================================================

 gpu.onRestored = setup;
 setup();

 return Object.freeze({
  get profile() { return profile; },
  beginContent: surface.beginContent, frame, resize, reset, sample, modelSample, bezelLipMm,
  setProfile(next) { profile = checkProfile(next); },
  setElectrodes() {},
  /** This round's display list: [x0, y0, x1, y1] in panel mm. */
  setVectors(list) { vectors = list; },
  get vectorCount() { return vectors.length; },
  get refreshHz() { return refreshHz(profile, vectors.length); },

  get lighting() { return {...lighting}; },
  setLighting(next) { lighting = {...lighting, ...next}; },
  get brightness() { return brightness; },
  setBrightness(v) { brightness = clamp(Number(v), profile.controls.brightness.min, profile.controls.brightness.max); },
  get roomLux() { return roomLux; },
  setRoomLux(v) { roomLux = clamp(Number(v), 0, MAX_ROOM_LUX); },

  info() {
   return {version: VERSION, width: surface.W, height: surface.H, pxPerMm: surface.pxPerMm, fps: meter.fps,
    vectors: vectors.length, refreshHz: Math.round(refreshHz(profile, vectors.length) * 10) / 10};
  },
  dispose: gpu.dispose
 });
}

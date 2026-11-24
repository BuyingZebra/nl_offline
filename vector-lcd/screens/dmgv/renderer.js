/* DMG-01 with vector input: runs the passes in shaders.js every frame.
 *
 * The panel's memory is per screen pixel (a state for each drive level, the
 * ion charge, and the level at n x n points inside the pixel), so it costs the
 * same at any size, and edges stay as fine as the points however far the panel
 * is enlarged. The shapes are drawn at the points each frame (vector/draw.js).
 *
 * Points per pixel: enough that they sit no further apart than POINT_PITCH_MM
 * on the panel, at most 4 x 4, within the GPU's texture limit and a budget.
 * The physics is the DMG-01's (screens/dmg/model.js), run per drive level. */

import {createGPU, createSurface, createMeter} from '../../gpu/webgl.js';
import {clamp, directionVector, bezelShiftMm, bezelPenumbraMm, glareSigma, glareNorm, shadowKernel, entryOffsetMm} from '../../optics/room.js';
import {checkProfile, contrastConditions, temperatureScale, stickingVolts, linearPalette} from '../dmg/model.js';
import {UPDATE_FS, ENTRY_FS, BLUR_FS, DISPLAY_FS, MAX_POINTS} from './shaders.js';
import {createVectorPainter} from '../../vector/draw.js';

export const VERSION = '0.5.0';

const MAX_STEPS_PER_FRAME = 8;     // DMG frames advanced in one display frame, at most
const POINT_PITCH_MM = .025;       // points no further apart than this on the panel (40 per mm)
const POINT_BUDGET = 2.4e7;        // points in all (one byte each, plus a stencil byte)


/** @returns {import('../contract.js').ScreenRenderer} */
export function createRenderer(canvas, {profile: initialProfile, widthMm, heightMm, maxPixels = 6e6, bezelLipMm = 1} = {}) {
 let profile = checkProfile(initialProfile);
 // The pixel cap only guards against absurd sizes: memory per pixel is small.
 const surface = createSurface(canvas, {widthMm, heightMm, maxPixels, canvasContent: false});
 const gpu = createGPU(canvas, 'LCD'), {gl} = gpu;
 const meter = createMeter();
 if (!gl.getExtension('EXT_color_buffer_float'))
  throw new Error('The vector-input DMG-01 needs 32-bit float render targets, which this browser does not provide.');


 // ===========================================================================
 // State
 // ===========================================================================

 let res = null;                   // GPU resources; rebuilt after a context loss
 let current = 0;                  // which of the two state sets holds the present
 let last = null;                  // time of the previous frame (ms)
 let init = 0;                     // next update: 1 = settle to the image, 2 = blank panel
 let phase = 0;                    // fraction of a DMG frame carried to the next display frame
 let lighting = {angleDeg: 45, azimuthDeg: 315, sourceDeg: 15, exposure: 1};
 let viewing = {polarDeg: 0, azimuthDeg: 0, distanceMm: 300};
 let celsius = 25;
 let contrast = profile.contrast.value;
 let scene = [];                   // [{shape, matrix}] in panel millimetres
 let shadow = true;                // false: light leaves where it entered (for inspection; not physical)
 let points = 1;                   // points per pixel, each way


 // ===========================================================================
 // GPU resources
 // ===========================================================================

 function setup() {
  res = {
   update: gpu.program(UPDATE_FS), entry: gpu.program(ENTRY_FS), blur: gpu.program(BLUR_FS), display: gpu.program(DISPLAY_FS),
   drift: gpu.texture(), optical: gpu.texture(), targetQ: gpu.texture(), painter: createVectorPainter(gl),
   content: null, contentFb: null, stencil: null, sets: [], fields: [], size: null
  };
  uploadTables();
  if (surface.W && surface.H) allocate();
 }

 function uploadTables() {
  const S = profile.stn;
  gl.bindTexture(gl.TEXTURE_2D, res.drift);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, S.director_bins, profile.contrast.conditions.length * 4, 0, gl.RED, gl.FLOAT, new Float32Array(S.drift_per_frame));
  gl.bindTexture(gl.TEXTURE_2D, res.optical);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, S.optical_bins, 1, 0, gl.RED, gl.FLOAT, new Float32Array(S.optical));
  // Target director for each shade at each solved wheel position: 4 wide, one row per position.
  gl.bindTexture(gl.TEXTURE_2D, res.targetQ);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 4, profile.contrast.conditions.length, 0, gl.RED, gl.FLOAT, new Float32Array(S.target_q));
 }

 function storage(w, h, internal, format, type) {
  const tex = gpu.texture();
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  return tex;
 }

 /** One set of state targets, drawn together (multiple render targets). */
 function stateSet(w, h) {
  const tex = [
   storage(w, h, gl.RGBA32F, gl.RGBA, gl.FLOAT),               // Q: state per level
   storage(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT),          // SHOWN: light per level
   storage(w, h, gl.R32F, gl.RED, gl.FLOAT),                   // ION
   storage(w, h, gl.R32UI, gl.RED_INTEGER, gl.UNSIGNED_INT)    // LEVELS: 2 bits per point
  ];
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  tex.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(tex.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('The vector-input DMG-01 state targets are not supported here.');
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return {tex, fb};
 }

 /** Points per pixel for the current size: fine enough, within the limits. */
 function pointsFor(W, H) {
  let n = clamp(Math.ceil(1 / (POINT_PITCH_MM * surface.pxPerMm)), 1, MAX_POINTS);
  while (n > 1 && (W * n > gpu.maxTextureSize || H * n > gpu.maxTextureSize || W * H * n * n > POINT_BUDGET)) n--;
  return n;
 }

 /** Size-dependent targets. A new size settles straight to the current image. */
 function allocate() {
  const {W, H} = surface;
  for (const set of res.sets) { gl.deleteFramebuffer(set.fb); set.tex.forEach(t => gl.deleteTexture(t)); }
  gpu.release(...res.fields);
  if (res.content) gl.deleteTexture(res.content);
  if (res.contentFb) gl.deleteFramebuffer(res.contentFb);
  if (res.stencil) gl.deleteRenderbuffer(res.stencil);

  points = pointsFor(W, H);
  res.sets = [stateSet(W, H), stateSet(W, H)];
  const fieldFmt = {internal: gl.RGBA16F, type: gl.HALF_FLOAT, name: '16-bit float'};
  res.fields = [gpu.target(W, H, fieldFmt), gpu.target(W, H, fieldFmt)];
  for (const f of res.fields) {
   gl.bindTexture(gl.TEXTURE_2D, f.tex);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
  // The shapes are drawn at the points: one byte per point, with a stencil for any outline.
  const PW = W * points, PH = H * points;
  res.content = storage(PW, PH, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
  res.stencil = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, res.stencil);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, PW, PH);
  res.contentFb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.contentFb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, res.content, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, res.stencil);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  res.size = [W, H];
  last = null;
  init = 1;
 }

 function reset() {
  if (res && !gpu.lost) { init = 2; phase = 0; }
 }

 function bindTables(p) {
  const S = profile.stn, c = contrastConditions(profile, contrast);
  gpu.bind(p, 4, 'uDrift', res.drift);
  gpu.bind(p, 5, 'uOptical', res.optical);
  gpu.bind(p, 7, 'uTargetQ', res.targetQ);
  gl.uniform1fv(p.u('uAnchorQ'), S.optical_anchor_q);
  gl.uniform1fv(p.u('uCorr'), S.optical_correction);
  gl.uniform1i(p.u('uLo'), c.low);
  gl.uniform1i(p.u('uHi'), c.high);
  gl.uniform1f(p.u('uCondF'), c.fraction);
  gl.uniform1i(p.u('uBins'), S.director_bins);
 }


 // ===========================================================================
 // Frame
 // ===========================================================================

 function frame(now = performance.now()) {
  if (gpu.lost || !res || !surface.W) return;
  const {W, H, pxPerMm} = surface, size = [W, H];
  const dt = last === null ? 0 : clamp(now - last, 0, 100);
  last = now;
  meter.tick(dt);

  phase += dt * profile.panel.refresh_hz / 1000;
  const steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor(phase));
  phase = Math.min(phase - steps, 1);

  // ---- 0. The shapes, at every point of every pixel
  gpu.section('shapes');
  const k = pxPerMm * points, toPoints = m => [m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k];
  res.painter.draw(res.contentFb, [W * points, H * points], scene.map(item => ({shape: item.shape, matrix: toPoints(item.matrix)})));

  // ---- 1. Levels, moving states, and whole DMG frames of physics per level
  gpu.section('crystal');
  if (steps > 0 || init) {
   const from = res.sets[current], to = res.sets[1 - current], R = profile.retention;
   gpu.draw(res.update, to.fb, size, p => {
    gpu.bind(p, 0, 'uContent', res.content);
    gpu.bind(p, 1, 'uQ', from.tex[0]);
    gpu.bind(p, 2, 'uShown', from.tex[1]);
    gpu.bind(p, 3, 'uIon', from.tex[2]);
    gpu.bind(p, 6, 'uLevels', from.tex[3]);
    bindTables(p);
    gl.uniform1i(p.u('uN'), points);
    gl.uniform1i(p.u('uSteps'), init === 1 ? 0 : steps);
    gl.uniform1i(p.u('uInit'), init);
    gl.uniform1f(p.u('uTscale'), temperatureScale(profile, celsius));
    gl.uniform1f(p.u('uCharge'), R.charge_per_frame);
    gl.uniform1f(p.u('uRelease'), R.release_per_frame);
    gl.uniform1f(p.u('uSticking'), stickingVolts(profile) * R.sticking_optical_gain);
   });
   current = 1 - current;
   init = 0;
  }
  const state = res.sets[current], palette = linearPalette(profile).flat();

  // ---- 2. First pass through the pixel, shaded by the bezel
  gpu.section('first pass');
  gpu.draw(res.entry, res.fields[0].fb, size, p => {
   gpu.bind(p, 0, 'uShown', state.tex[1]);
   gpu.bind(p, 6, 'uLevels', state.tex[3]);
   gl.uniform1i(p.u('uN'), points);
   gl.uniform3fv(p.u('uPalette'), palette);
   gl.uniform4fv(p.u('uLum'), profile.stn.nominal_luminance);
   const shift = bezelShiftMm(profile, lighting, bezelLipMm);
   gl.uniform2f(p.u('uPanelMm'), W / pxPerMm, H / pxPerMm);
   gl.uniform2f(p.u('uBezelShift'), shift.x, shift.y);
   gl.uniform1f(p.u('uBezelSigma'), Math.max(1e-3, bezelPenumbraMm(profile, lighting, bezelLipMm)));
   gl.uniform1f(p.u('uPxPerMm'), pxPerMm);
   gl.uniform1f(p.u('uHeightPx'), H);
  });

  // ---- 3. Spread of entry points (only with the shadow on)
  gpu.section('shadow blur');
  const kernel = shadowKernel(profile, lighting);
  if (shadow) {
   const radial = [kernel.radial.x, -kernel.radial.y], across = [-radial[1], radial[0]];
   const blur = (src, dst, dir, sigmaMm) => gpu.draw(res.blur, dst.fb, size, p => {
    gpu.bind(p, 0, 'uSrc', src.tex);
    gl.uniform2f(p.u('uDir'), dir[0], dir[1]);
    gl.uniform2f(p.u('uSize'), W, H);
    gl.uniform1f(p.u('uSigma'), sigmaMm * pxPerMm);
   });
   blur(res.fields[0], res.fields[1], radial, kernel.sigmaRadialMm);
   blur(res.fields[1], res.fields[0], across, kernel.sigmaTangentialMm);
  }

  // ---- 4. Second pass, weighted by coverage, plus glare
  gpu.section('second pass + glare');
  const toView = entryOffsetMm(profile, viewing.polarDeg, viewing.azimuthDeg);
  const mean = {x: kernel.mean.x - toView.x, y: kernel.mean.y - toView.y};
  gpu.draw(res.display, null, size, p => {
   gpu.bind(p, 0, 'uShown', state.tex[1]);
   gpu.bind(p, 1, 'uField', res.fields[0].tex);
   gpu.bind(p, 6, 'uLevels', state.tex[3]);
   gl.uniform1i(p.u('uN'), points);
   gl.uniform1i(p.u('uShadow'), shadow ? 1 : 0);
   gl.uniform3fv(p.u('uPalette'), palette);
   gl.uniform4fv(p.u('uLum'), profile.stn.nominal_luminance);
   gl.uniform2f(p.u('uSize'), W, H);
   gl.uniform2f(p.u('uMean'), mean.x * pxPerMm, -mean.y * pxPerMm);
   gl.uniform1f(p.u('uPxPerMm'), pxPerMm);
   gl.uniform1f(p.u('uExposure'), lighting.exposure);
   const e = directionVector(viewing.polarDeg, viewing.azimuthDeg), D = viewing.distanceMm;
   gl.uniform3f(p.u('uEye'), W / pxPerMm / 2 + e[0] * D, H / pxPerMm / 2 + e[1] * D, e[2] * D);
   gl.uniform3fv(p.u('uLight'), directionVector(lighting.angleDeg, lighting.azimuthDeg));
   const sigma = glareSigma(lighting.sourceDeg);
   gl.uniform1f(p.u('uGlareSigma'), sigma);
   gl.uniform1f(p.u('uGlareNorm'), glareNorm(sigma, lighting.angleDeg));
   gl.uniform1f(p.u('uFront'), profile.oblique.front_index);
  });  gpu.section(null);
 }


 // ===========================================================================
 // Size and readback
 // ===========================================================================

 function resize(cssWidth, cssHeight, dpr = 1) {
  const fit = surface.fit(cssWidth, cssHeight, dpr, gpu.maxTextureSize);
  if (fit.changed && res && !gpu.lost) allocate();
  return {width: fit.width, height: fit.height, pxPerMm: fit.pxPerMm};
 }

 function read(attachment, x, y, integer = false) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.sets[current].fb);
  gl.readBuffer(gl.COLOR_ATTACHMENT0 + attachment);
  const out = integer ? new Uint32Array(4) : new Float32Array(4);
  gl.readPixels(x, y, 1, 1, integer ? gl.RGBA_INTEGER : gl.RGBA, integer ? gl.UNSIGNED_INT : gl.FLOAT, out);
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return out;
 }

 /** The pixel at a point (panel mm): its main drive level and that level's state,
  * {q, ionic, shade, shown}, and how much of the pixel each level covers. */
 function sample(xMm, yMm) {
  if (!res || gpu.lost) return null;
  const [x, y] = surface.texelAt(xMm, yMm);
  const q = read(0, x, y), light = read(1, x, y), ion = read(2, x, y)[0], word = read(3, x, y, true)[0];
  const cover = [0, 0, 0, 0];
  for (let k = 0; k < points * points; k++) cover[(word >>> (2 * k)) & 3]++;
  const shade = cover.indexOf(Math.max(...cover));
  return {q: q[shade], ionic: ion, shade, shown: light[shade], coverage: cover.map(c => c / (points * points))};
 }


 // ===========================================================================
 // Start, and the public interface
 // ===========================================================================

 gpu.onRestored = setup;
 setup();

 return Object.freeze({
  get profile() { return profile; },
  beginContent: surface.beginContent, frame, resize, reset, sample, bezelLipMm,
  setProfile(next) {
   profile = checkProfile(next);
   if (res && !gpu.lost) { uploadTables(); init = 1; }
  },
  setElectrodes() {},
  /** Average CPU and GPU time per pass since the last call (diagnostic report). */
  timings: gpu.takeTimings,
  /** The shapes to show, [{shape, matrix}] with the matrix from the shape's units to panel mm. */
  setScene(items) { scene = items; },
  get input() { return 'vector'; },

  get lighting() { return {...lighting}; },
  setLighting(next) { lighting = {...lighting, ...next}; },
  get viewing() { return {...viewing}; },
  setViewing(next) { viewing = {...viewing, ...next}; },
  get shadow() { return shadow; },
  setShadow(on) { shadow = Boolean(on); },
  get temperature() { return celsius; },
  setTemperature(c) { celsius = Number(c); },
  get contrast() { return contrast; },
  setContrast(c) { contrast = clamp(Number(c), profile.contrast.min, profile.contrast.max); },

  info() {
   return {version: VERSION, stateFormat: 'per pixel: 4 levels × 32-bit float', retention: true,
    width: surface.W, height: surface.H, pxPerMm: surface.pxPerMm, fps: meter.fps, input: 'vector',
    dotsPerPixel: points, dotPitchUm: 1000 / (surface.pxPerMm * points), pointsPerPixel: points,
    // Per pixel: two state sets (16 + 8 + 4 + 4 bytes), two light fields (8), points (1 byte + 1 stencil each).
    gpuMemoryMB: surface.W * surface.H * (2 * 32 + 2 * 8 + points * points * 2) / 1048576,
    vector: res?.painter.stats};
  },
  dispose: gpu.dispose
 });
}

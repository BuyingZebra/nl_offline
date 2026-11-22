/* Game Boy Color CGB-001 renderer: runs the passes in shaders.js every frame.
 *
 * The panel's state lives on its own pixel grid (0.275 x 0.278 mm), not on the
 * display's pixels, so a resize never touches it. The reflector is inside the
 * cell (HR-TFT): there is no reflector shadow, only the bezel's and the glare. */

import {createGPU, createSurface, createMeter} from '../../gpu/webgl.js';
import {clamp, directionVector, bezelShiftMm, bezelPenumbraMm, glareSigma, glareNorm} from '../../optics/room.js';
import {checkProfile, tables, gridSize, stripeResolve} from './model.js';
import {UPDATE_FS, DISPLAY_FS} from './shaders.js';

export const VERSION = '0.2.1';

const MAX_STEPS_PER_FRAME = 8;     // GBC frames advanced in one display frame, at most


/** @returns {import('../contract.js').ScreenRenderer} */
export function createRenderer(canvas, {profile: initialProfile, widthMm, heightMm, maxPixels, bezelLipMm = 1} = {}) {
 let profile = checkProfile(initialProfile);
 const surface = createSurface(canvas, {widthMm, heightMm, maxPixels});
 const gpu = createGPU(canvas, 'LCD'), {gl} = gpu;
 const meter = createMeter();


 // ===========================================================================
 // State
 // ===========================================================================

 let res = null;                   // GPU resources; rebuilt after a context loss
 let current = 0;                  // which pair of state targets holds the present
 let last = null;                  // time of the previous frame (ms)
 let init = 1;                     // next update settles straight to the image
 let phase = 0;                    // fraction of a GBC frame carried to the next display frame
 let lighting = {angleDeg: 45, azimuthDeg: 315, sourceDeg: 15, exposure: 1};
 let viewing = {polarDeg: 0, azimuthDeg: 0, distanceMm: 300};
 const grid = () => gridSize(profile, widthMm, heightMm);


 // ===========================================================================
 // GPU resources
 // ===========================================================================

 /** Channel states move by under 1e-4 per frame near their target: 32-bit floats. */
 function stateFormat() {
  if (!gl.getExtension('EXT_color_buffer_float'))
   throw new Error('This screen model needs 32-bit float render targets, which this browser does not provide.');
  return gpu.firstRenderable([{internal: gl.RGBA32F, type: gl.FLOAT, name: '32-bit float'}],
   'This screen model needs 32-bit float render targets, which this browser does not provide.');
 }

 function setup() {
  res = {
   fmt: stateFormat(),
   update: gpu.program(UPDATE_FS), display: gpu.program(DISPLAY_FS),
   content: gpu.texture(), rates: gpu.texture(), lut: gl.createTexture(),
   pairs: []
  };
  uploadTables();
  const [cols, rows] = grid(), pair = () => ({a: gpu.target(cols, rows, res.fmt), b: gpu.target(cols, rows, res.fmt)});
  res.pairs = [pair(), pair()];
  init = 1;
  if (surface.W && surface.H) allocate();
 }

 function uploadTables() {
  const {xyz, rates} = tables(profile), n = profile.colour.table_size;
  gl.bindTexture(gl.TEXTURE_3D, res.lut);
  for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, k, gl.NEAREST);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB32F, n, n, n, 0, gl.RGB, gl.FLOAT, xyz);
  gl.bindTexture(gl.TEXTURE_2D, res.rates);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 32, 32, 0, gl.RED, gl.FLOAT, rates);
 }

 /** The content texture follows the display size; the panel state does not. */
 function allocate() {
  gl.bindTexture(gl.TEXTURE_2D, res.content);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, surface.W, surface.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
 }

 /** Panel back to the current image, settled. */
 function reset() {
  if (res && !gpu.lost) { init = 1; phase = 0; }
 }


 // ===========================================================================
 // Frame
 // ===========================================================================

 function frame(now = performance.now()) {
  if (gpu.lost || !res || !surface.W) return;
  const {W, H, pxPerMm} = surface, size = [W, H], [cols, rows] = grid();
  const dt = last === null ? 0 : clamp(now - last, 0, 100);
  last = now;
  meter.tick(dt);
  const pitchPx = profile.panel.pitch_mm.map(v => v * pxPerMm);

  // The panel advances in whole GBC frames; the remainder carries over, so the
  // result is the same at any display refresh rate.
  phase += dt / 1000 / profile.panel.frame_s;
  const steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor(phase));
  phase = Math.min(phase - steps, 1);
  gpu.upload(res.content, surface.content);

  // ---- 1. Channel states and the frame-average colour, in whole GBC frames
  if (steps > 0 || init) {
   const from = res.pairs[current], to = res.pairs[1 - current];
   for (const [which, fb] of [[0, to.a.fb], [1, to.b.fb]]) gpu.draw(res.update, fb, [cols, rows], p => {
    gpu.bind(p, 0, 'uContent', res.content);
    gpu.bind(p, 1, 'uA', from.a.tex);
    gpu.bind(p, 2, 'uB', from.b.tex);
    gpu.bind(p, 3, 'uRates', res.rates);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_3D, res.lut);
    gl.uniform1i(p.u('uLut'), 4);
    gl.uniform1i(p.u('uSteps'), init ? 0 : steps);
    gl.uniform1i(p.u('uInit'), init);
    gl.uniform1i(p.u('uWhich'), which);
    gl.uniform1f(p.u('uFrameS'), profile.panel.frame_s);
    gl.uniform1f(p.u('uSnap'), profile.response.snap);
    gl.uniform2f(p.u('uPitchPx'), pitchPx[0], pitchPx[1]);
    gl.uniform2f(p.u('uSize'), W, H);
   });
   current = 1 - current;
   init = 0;
  }

  // ---- 2. Stripes, bezel and glare
  gpu.draw(res.display, null, size, p => {
   gpu.bind(p, 0, 'uB', res.pairs[current].b.tex);
   gl.uniform2i(p.u('uGrid'), cols, rows);
   gl.uniform2f(p.u('uSize'), W, H);
   gl.uniform2f(p.u('uPitchPx'), pitchPx[0], pitchPx[1]);
   gl.uniform1f(p.u('uResolve'), stripeResolve(pitchPx[0]));
   const shift = bezelShiftMm(profile, lighting, bezelLipMm);
   gl.uniform2f(p.u('uPanelMm'), W / pxPerMm, H / pxPerMm);
   gl.uniform2f(p.u('uBezelShift'), shift.x, shift.y);
   gl.uniform1f(p.u('uBezelSigma'), Math.max(1e-3, bezelPenumbraMm(profile, lighting, bezelLipMm)));
   gl.uniform1f(p.u('uPxPerMm'), pxPerMm);
   gl.uniform1f(p.u('uExposure'), lighting.exposure);
   const e = directionVector(viewing.polarDeg, viewing.azimuthDeg), D = viewing.distanceMm;
   gl.uniform3f(p.u('uEye'), W / pxPerMm / 2 + e[0] * D, H / pxPerMm / 2 + e[1] * D, e[2] * D);
   gl.uniform3fv(p.u('uLight'), directionVector(lighting.angleDeg, lighting.azimuthDeg));
   const sigma = glareSigma(lighting.sourceDeg);
   gl.uniform1f(p.u('uGlareSigma'), sigma);
   gl.uniform1f(p.u('uGlareNorm'), glareNorm(sigma, lighting.angleDeg));
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

 /** The logical pixel at a point (panel mm): channel states, codes and frame-average XYZ. */
 function sample(xMm, yMm) {
  if (!res || gpu.lost) return null;
  const [cols, rows] = grid(), [px, py] = profile.panel.pitch_mm;
  const i = clamp(Math.floor(xMm / px), 0, cols - 1), j = clamp(Math.floor(yMm / py), 0, rows - 1);
  const pair = res.pairs[current], a = gpu.readTexel(pair.a.fb, i, j), b = gpu.readTexel(pair.b.fb, i, j);
  const unpack = v => [v & 31, v >> 5 & 31, v >> 10 & 31];
  return {s: [a[0], a[1], a[2]], target: unpack(Math.round(a[3])), start: unpack(Math.round(b[0])), xyz: [b[1], b[2], b[3]]};
 }


 // ===========================================================================
 // Start, and the public interface
 // ===========================================================================

 gpu.onRestored = setup;
 setup();

 return Object.freeze({
  get profile() { return profile; },
  beginContent: surface.beginContent, frame, resize, reset, sample, bezelLipMm,

  /** Switch to another CGB profile; the panel settles into it. */
  setProfile(next) {
   profile = checkProfile(next);
   if (res && !gpu.lost) { gpu.release(...res.pairs.flatMap(p => [p.a, p.b])); setup(); }
  },
  setElectrodes() {},              // an active matrix drives every pixel: no electrode map

  get lighting() { return {...lighting}; },
  setLighting(next) { lighting = {...lighting, ...next}; },
  get viewing() { return {...viewing}; },
  setViewing(next) { viewing = {...viewing, ...next}; },

  info() {
   const [cols, rows] = grid();
   return {version: VERSION, stateFormat: res?.fmt.name ?? 'none', grid: [cols, rows],
    width: surface.W, height: surface.H, pxPerMm: surface.pxPerMm, fps: meter.fps};
  },
  dispose: gpu.dispose
 });
}

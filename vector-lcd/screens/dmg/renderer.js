/* DMG-01 STN renderer: runs the passes in shaders.js every frame.
 *
 * The reflector shadow uses Retro Display Lab's measured strength and offset.
 * A gridless panel has no gaps between dots, so the shadow darkens a point
 * wherever the shifted image is darker than the point itself; flat areas keep
 * the measured palette exactly. */

import {createGPU, createSurface, createMeter} from '../../gpu/webgl.js';
import {createEyeGlare} from '../../gpu/eye-glare.js';
import {clamp, directionVector, bezelShiftMm, bezelPenumbraMm, glareSigma, glareNorm} from '../../optics/room.js';
import {checkProfile, contrastConditions, temperatureScale, stickingVolts, linearPalette, shadowOffsetMm} from './model.js';
import {UPDATE_FS, DISPLAY_FS} from './shaders.js';

export const VERSION = '0.3.0';

const MAX_STEPS_PER_FRAME = 8;     // DMG frames advanced in one display frame, at most


/** @returns {import('../contract.js').ScreenRenderer} */
export function createRenderer(canvas, {profile: initialProfile, widthMm, heightMm, maxPixelRatio = 2, bezelLipMm = 1} = {}) {
 let profile = checkProfile(initialProfile);
 const surface = createSurface(canvas, {widthMm, heightMm, maxPixelRatio});
 const gpu = createGPU(canvas, 'LCD'), {gl} = gpu;
 const meter = createMeter();


 // ===========================================================================
 // State
 // ===========================================================================

 let res = null;                   // GPU resources; rebuilt after a context loss
 let current = 0;                  // which of the two state targets holds the present
 let last = null;                  // time of the previous frame (ms)
 let init = 0;                     // next update: 1 = settle to the image, 2 = blank panel
 let phase = 0;                    // fraction of a DMG frame carried to the next display frame
 let lighting = {angleDeg: 45, azimuthDeg: 315, sourceDeg: 15, exposure: 1};
 let viewing = {polarDeg: 0, azimuthDeg: 0, distanceMm: 300};
 let celsius = 25;
 let contrast = profile.contrast.value;
 let viewer = {glare: false, age: 35, pigment: .5};   // eye distance: viewing.distanceMm
 let eye = null;                                       // the viewer's-eye pass; rebuilt with the context


 // ===========================================================================
 // GPU resources
 // ===========================================================================

 /** Ionic charge moves by ~1e-5 per frame, which needs 32-bit floats; with
  * only half floats the director still works but sticking cannot accumulate. */
 function stateFormat() {
  const list = [];
  if (gl.getExtension('EXT_color_buffer_float')) list.push(
   {internal: gl.RGBA32F, type: gl.FLOAT, name: '32-bit float', retention: true},
   {internal: gl.RGBA16F, type: gl.HALF_FLOAT, name: '16-bit float', retention: false});
  else if (gl.getExtension('EXT_color_buffer_half_float'))
   list.push({internal: gl.RGBA16F, type: gl.HALF_FLOAT, name: '16-bit float', retention: false});
  return gpu.firstRenderable(list, 'This screen model needs floating-point render targets, which this browser does not provide.');
 }

 function setup() {
  res = {
   fmt: stateFormat(),
   update: gpu.program(UPDATE_FS), display: gpu.program(DISPLAY_FS),
   content: gpu.texture(), drift: gpu.texture(), optical: gpu.texture(),
   states: [], size: null
  };
  uploadTables();
  eye = createEyeGlare(gpu);
  if (surface.W && surface.H) allocate();
 }

 function uploadTables() {
  const S = profile.stn;
  gl.bindTexture(gl.TEXTURE_2D, res.drift);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, S.director_bins, profile.contrast.conditions.length * 4, 0, gl.RED, gl.FLOAT, new Float32Array(S.drift_per_frame));
  gl.bindTexture(gl.TEXTURE_2D, res.optical);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, S.optical_bins, 1, 0, gl.RED, gl.FLOAT, new Float32Array(S.optical));
 }

 /** Size-dependent targets. The panel's state carries over from the old size
  * when there is one; a new panel settles straight to the current image. */
 function allocate() {
  const {W, H} = surface, old = res.states, oldSize = res.size;
  res.states = [gpu.target(W, H, res.fmt), gpu.target(W, H, res.fmt)];
  gl.bindTexture(gl.TEXTURE_2D, res.content);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  eye.allocate(W, H);
  if (old.length && oldSize) gpu.copy(old[current].tex, oldSize, res.states[current].tex, [W, H]);
  else { last = null; init = 1; }
  gpu.release(...old);
  res.size = [W, H];
 }

 /** Blank panel. */
 function reset() {
  if (res && !gpu.lost) { init = 2; phase = 0; }
 }

 /** Profile tables and the contrast wheel's position between them. */
 function bindTables(p) {
  const S = profile.stn, c = contrastConditions(profile, contrast);
  gpu.bind(p, 2, 'uDrift', res.drift);
  gpu.bind(p, 3, 'uOptical', res.optical);
  gl.uniform1fv(p.u('uTargetQ'), S.target_q);
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

  // The panel advances in whole DMG frames; the remainder carries over, so the
  // result is the same at any display refresh rate.
  phase += dt * profile.panel.refresh_hz / 1000;
  const steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor(phase));
  phase = Math.min(phase - steps, 1);
  gpu.upload(res.content, surface.content);

  // ---- 1. Director and ions, in whole DMG frames
  if (steps > 0 || init) {
   const from = res.states[current], to = res.states[1 - current], R = profile.retention;
   gpu.draw(res.update, to.fb, size, p => {
    gpu.bind(p, 0, 'uContent', res.content);
    gpu.bind(p, 1, 'uState', from.tex);
    bindTables(p);
    gl.uniform1i(p.u('uSteps'), init === 1 ? 0 : steps);
    gl.uniform1i(p.u('uInit'), init);
    gl.uniform1f(p.u('uTscale'), temperatureScale(profile, celsius));
    gl.uniform1f(p.u('uCharge'), res.fmt.retention ? R.charge_per_frame : 0);
    gl.uniform1f(p.u('uRelease'), res.fmt.retention ? R.release_per_frame : 0);
    gl.uniform1f(p.u('uSticking'), stickingVolts(profile) * R.sticking_optical_gain);
   });
   current = 1 - current;
   init = 0;
  }

  // ---- 2. Palette, reflector shadow, bezel and glare
  const palette = linearPalette(profile).flat();
  const off = shadowOffsetMm(profile);
  gpu.draw(res.display, viewer.glare ? eye.viewFb : null, size, p => {
   gl.uniform1i(p.u('uLinear'), viewer.glare ? 1 : 0);
   gpu.bind(p, 0, 'uState', res.states[current].tex);
   gl.uniform3fv(p.u('uPalette'), palette);
   gl.uniform2f(p.u('uSize'), W, H);
   // Screen y runs down; texture rows run up.
   gl.uniform2f(p.u('uShadowPx'), off.x * pxPerMm, -off.y * pxPerMm);
   gl.uniform1f(p.u('uStrength'), profile.shadow.strength);
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

  // ---- 3. The viewer's eye, when on
  if (viewer.glare) eye.apply({distancePx: viewing.distanceMm * pxPerMm, age: viewer.age, pigment: viewer.pigment});
 }


 // ===========================================================================
 // Size and readback
 // ===========================================================================

 function resize(cssWidth, cssHeight, dpr = 1) {
  const fit = surface.fit(cssWidth, cssHeight, dpr, gpu.maxTextureSize);
  if (fit.changed && res && !gpu.lost) allocate();
  return {width: fit.width, height: fit.height, pxPerMm: fit.pxPerMm};
 }

 /** State at a point (panel mm): {q, ionic, shade, shown}. */
 function sample(xMm, yMm) {
  if (!res || gpu.lost) return null;
  const [x, y] = surface.texelAt(xMm, yMm);
  const t = gpu.readTexel(res.states[current].fb, x, y);
  return {q: t[0], ionic: t[1], shade: Math.round(t[2]), shown: t[3]};
 }


 // ===========================================================================
 // Start, and the public interface
 // ===========================================================================

 gpu.onRestored = setup;
 setup();

 return Object.freeze({
  get profile() { return profile; },
  beginContent: surface.beginContent, frame, resize, reset, sample, bezelLipMm,
  /** Veil the eye adds at a point (panel mm), linear RGB; for tests. */
  sampleVeil(xMm, yMm) { const [x, y] = surface.texelAt(xMm, yMm); return eye?.ready ? eye.sampleVeil(x, y) : null; },
  /** The linear view the eye looked at (tests). */
  readEyeView() { return eye?.ready ? eye.readView() : null; },

  /** Switch to another DMG profile; the panel settles into it. */
  setProfile(next) {
   profile = checkProfile(next);
   if (res && !gpu.lost) { uploadTables(); init = 1; }
  },
  setElectrodes() {},              // a dot matrix drives every point: no electrode map

  get lighting() { return {...lighting}; },
  setLighting(next) { lighting = {...lighting, ...next}; },
  get viewing() { return {...viewing}; },
  setViewing(next) { viewing = {...viewing, ...next}; },
  /** The viewer's eye: glare on or off, age (years), iris pigmentation (0 dark, 0.5 brown, 1 blue-green). */
  get viewer() { return {...viewer}; },
  setViewer(next) { viewer = {...viewer, ...next}; },
  get temperature() { return celsius; },
  setTemperature(c) { celsius = Number(c); },
  /** The DMG's contrast wheel: a drive-voltage multiplier within the source's range. */
  get contrast() { return contrast; },
  setContrast(c) { contrast = clamp(Number(c), profile.contrast.min, profile.contrast.max); },

  info() {
   return {version: VERSION, stateFormat: res?.fmt.name ?? 'none', retention: Boolean(res?.fmt.retention),
    width: surface.W, height: surface.H, pxPerMm: surface.pxPerMm, fps: meter.fps};
  },
  dispose: gpu.dispose
 });
}

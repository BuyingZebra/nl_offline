/* DMG-01 STN renderer: runs the passes in shaders.js every frame.
 *
 * The panel is finer than the screen showing it. Each screen pixel covers
 * dotsPerPixel x dotsPerPixel panel dots (gpu/webgl.js createSurface), and
 * every dot is driven at one of the DMG's four real levels. The crystal, the
 * ions and both passes of the light run per dot; a screen pixel shows the
 * average light of its dots, as the eye averages dots too small to resolve.
 * So edges are as clean as the content, with no level the DMG cannot drive.
 *
 * The reflector shadow is the light's two passes through the crystal at two
 * places (model.js reflectedColor), with the entry offset and its spread from
 * refraction through the rear glass (optics/room.js shadowKernel): it moves
 * with the light and the eye, as on the TN screens. */

import {createGPU, createSurface, createMeter} from '../../gpu/webgl.js';
import {clamp, directionVector, bezelShiftMm, bezelPenumbraMm, glareSigma, glareNorm, shadowKernel, entryOffsetMm} from '../../optics/room.js';
import {checkProfile, contrastConditions, temperatureScale, stickingVolts, linearPalette} from './model.js';
import {UPDATE_FS, ENTRY_FS, BLUR_FS, DISPLAY_FS} from './shaders.js';
import {createVectorPainter} from '../../vector/draw.js';

export const VERSION = '0.4.0';

const MAX_STEPS_PER_FRAME = 8;     // DMG frames advanced in one display frame, at most
/** Panel dots in all. The same as the most device pixels a screen draws, so the
 * finer panel costs no more memory than a high-density display already does. */
const DOT_BUDGET = 3e6;


/**
 * input: 'picture' (content drawn on a 2D canvas, read by brightness) or
 * 'vector' (shapes in drive levels, drawn on the GPU at the dot size: setScene).
 * @returns {import('../contract.js').ScreenRenderer}
 */
export function createRenderer(canvas, {profile: initialProfile, widthMm, heightMm, maxPixels, bezelLipMm = 1, dotBudget = DOT_BUDGET, input = 'picture'} = {}) {
 let profile = checkProfile(initialProfile);
 const vectorInput = input === 'vector';
 const surface = createSurface(canvas, {widthMm, heightMm, maxPixels, dotBudget, canvasContent: !vectorInput});
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
 let scene = [];                   // vector input: [{shape, matrix}] in panel millimetres
 let shadow = true;                // false: light leaves where it entered (for inspection; not physical)


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

 /** The entry light must filter (it is sampled between dots); half floats filter in WebGL2. */
 function fieldFormat() {
  const list = [];
  if (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))
   list.push({internal: gl.RGBA16F, type: gl.HALF_FLOAT, name: '16-bit float'});
  list.push({internal: gl.RGBA8, type: gl.UNSIGNED_BYTE, name: '8-bit'});
  return gpu.firstRenderable(list, 'No field format available');
 }

 function setup() {
  res = {
   fmt: stateFormat(), fieldFmt: fieldFormat(),
   update: gpu.program(UPDATE_FS), entry: gpu.program(ENTRY_FS), blur: gpu.program(BLUR_FS), display: gpu.program(DISPLAY_FS),
   content: gpu.texture(), drift: gpu.texture(), optical: gpu.texture(),
   states: [], fields: [], size: null,
   painter: vectorInput ? createVectorPainter(gl) : null, contentFb: null, stencil: null
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
 }

 /** Size-dependent targets, all at the dot size. The panel's state carries over
  * from the old size when there is one; a new panel settles straight to the image. */
 function allocate() {
  const [DW, DH] = surface.dotSize, old = res.states, oldSize = res.size;
  res.states = [gpu.target(DW, DH, res.fmt), gpu.target(DW, DH, res.fmt)];
  gpu.release(...res.fields);
  res.fields = [gpu.target(DW, DH, res.fieldFmt), gpu.target(DW, DH, res.fieldFmt)];
  for (const f of res.fields) {
   gl.bindTexture(gl.TEXTURE_2D, f.tex);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
  gl.bindTexture(gl.TEXTURE_2D, res.content);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, DW, DH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  if (vectorInput) {
   // The shapes are drawn into the content texture, with a stencil for filling any outline.
   if (res.contentFb) gl.deleteFramebuffer(res.contentFb);
   if (res.stencil) gl.deleteRenderbuffer(res.stencil);
   res.stencil = gl.createRenderbuffer();
   gl.bindRenderbuffer(gl.RENDERBUFFER, res.stencil);
   gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, DW, DH);
   res.contentFb = gl.createFramebuffer();
   gl.bindFramebuffer(gl.FRAMEBUFFER, res.contentFb);
   gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, res.content, 0);
   gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, res.stencil);
   gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  if (old.length && oldSize) gpu.copy(old[current].tex, oldSize, res.states[current].tex, [DW, DH]);
  else { last = null; init = 1; }
  gpu.release(...old);
  res.size = [DW, DH];
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
  const {W, H, pxPerMm} = surface, size = [W, H], dotSize = surface.dotSize;
  const dots = surface.dotsPerPixel, dotsPerMm = pxPerMm * dots;
  const dt = last === null ? 0 : clamp(now - last, 0, 100);
  last = now;
  meter.tick(dt);

  // The panel advances in whole DMG frames; the remainder carries over, so the
  // result is the same at any display refresh rate.
  phase += dt * profile.panel.refresh_hz / 1000;
  const steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor(phase));
  phase = Math.min(phase - steps, 1);
  if (vectorInput) {
   // Shapes in millimetres, drawn at the dot size: each dot gets its drive level exactly.
   const k = dotsPerMm, toDots = m => [m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k];
   res.painter.draw(res.contentFb, dotSize, scene.map(item => ({shape: item.shape, matrix: toDots(item.matrix)})));
  } else gpu.upload(res.content, surface.content);

  // ---- 1. Director and ions, in whole DMG frames, at every dot
  if (steps > 0 || init) {
   const from = res.states[current], to = res.states[1 - current], R = profile.retention;
   gpu.draw(res.update, to.fb, dotSize, p => {
    gpu.bind(p, 0, 'uContent', res.content);
    gpu.bind(p, 1, 'uState', from.tex);
    bindTables(p);
    gl.uniform1i(p.u('uSteps'), init === 1 ? 0 : steps);
    gl.uniform1i(p.u('uInit'), init);
    gl.uniform1i(p.u('uIndexInput'), vectorInput ? 1 : 0);
    gl.uniform1f(p.u('uTscale'), temperatureScale(profile, celsius));
    gl.uniform1f(p.u('uCharge'), res.fmt.retention ? R.charge_per_frame : 0);
    gl.uniform1f(p.u('uRelease'), res.fmt.retention ? R.release_per_frame : 0);
    gl.uniform1f(p.u('uSticking'), stickingVolts(profile) * R.sticking_optical_gain);
   });
   current = 1 - current;
   init = 0;
  }
  const state = res.states[current], palette = linearPalette(profile).flat();

  // ---- 2. First pass: light entering the crystal, shaded by the bezel
  gpu.draw(res.entry, res.fields[0].fb, dotSize, p => {
   gpu.bind(p, 0, 'uState', state.tex);
   gl.uniform3fv(p.u('uPalette'), palette);
   const shift = bezelShiftMm(profile, lighting, bezelLipMm);
   gl.uniform2f(p.u('uPanelMm'), W / pxPerMm, H / pxPerMm);
   gl.uniform2f(p.u('uBezelShift'), shift.x, shift.y);
   gl.uniform1f(p.u('uBezelSigma'), Math.max(1e-3, bezelPenumbraMm(profile, lighting, bezelLipMm)));
   gl.uniform1f(p.u('uDotsPerMm'), dotsPerMm);
   gl.uniform1f(p.u('uHeightDots'), dotSize[1]);
  });

  // ---- 3. Spread of entry points: along, then across the light (screen y runs down, rows up)
  const k = shadowKernel(profile, lighting);
  const radial = [k.radial.x, -k.radial.y], across = [-radial[1], radial[0]];
  const blur = (src, dst, dir, sigmaMm) => gpu.draw(res.blur, dst.fb, dotSize, p => {
   gpu.bind(p, 0, 'uSrc', src.tex);
   gl.uniform2f(p.u('uDir'), dir[0], dir[1]);
   gl.uniform2f(p.u('uSize'), dotSize[0], dotSize[1]);
   gl.uniform1f(p.u('uSigma'), sigmaMm * dotsPerMm);
  });
  if (shadow) {
   blur(res.fields[0], res.fields[1], radial, k.sigmaRadialMm);
   blur(res.fields[1], res.fields[0], across, k.sigmaTangentialMm);
  }

  // ---- 4. Second pass at each dot, averaged per screen pixel, plus glare.
  // Light enters where it meets the crystal on the way in and leaves where the
  // eye's ray meets it: the shadow offset is the difference of the two.
  const toView = entryOffsetMm(profile, viewing.polarDeg, viewing.azimuthDeg);
  // With the shadow off, light leaves where it entered: both passes cross the
  // same state, so every point shows the measured palette (bezel and glare stay).
  const mean = shadow ? {x: k.mean.x - toView.x, y: k.mean.y - toView.y} : {x: 0, y: 0};
  gpu.draw(res.display, null, size, p => {
   gpu.bind(p, 0, 'uState', state.tex);
   gpu.bind(p, 1, 'uField', res.fields[0].tex);
   gl.uniform3fv(p.u('uPalette'), palette);
   gl.uniform1i(p.u('uDots'), dots);
   gl.uniform2f(p.u('uSize'), W, H);
   gl.uniform2f(p.u('uDotSize'), dotSize[0], dotSize[1]);
   gl.uniform2f(p.u('uMean'), mean.x * dotsPerMm, -mean.y * dotsPerMm);
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

 /** State of the panel dot at a point (panel mm): {q, ionic, shade, shown}. */
 function sample(xMm, yMm) {
  if (!res || gpu.lost) return null;
  const [x, y] = surface.dotAt(xMm, yMm);
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

  /** Switch to another DMG profile; the panel settles into it. */
  setProfile(next) {
   profile = checkProfile(next);
   if (res && !gpu.lost) { uploadTables(); init = 1; }
  },
  setElectrodes() {},              // a dot matrix drives every point: no electrode map
  /** Vector input: the shapes to show, [{shape, matrix}] with the matrix from the shape's units to panel mm. */
  setScene(items) { scene = items; },
  get input() { return input; },

  get lighting() { return {...lighting}; },
  setLighting(next) { lighting = {...lighting, ...next}; },
  get viewing() { return {...viewing}; },
  setViewing(next) { viewing = {...viewing, ...next}; },
  /** The reflector shadow; off is for inspecting the image, and is not physical. */
  get shadow() { return shadow; },
  setShadow(on) { shadow = Boolean(on); },
  get temperature() { return celsius; },
  setTemperature(c) { celsius = Number(c); },
  /** The DMG's contrast wheel: a drive-voltage multiplier within the source's range. */
  get contrast() { return contrast; },
  setContrast(c) { contrast = clamp(Number(c), profile.contrast.min, profile.contrast.max); },

  info() {
   const dots = surface.dotsPerPixel;
   return {version: VERSION, stateFormat: res?.fmt.name ?? 'none', fieldFormat: res?.fieldFmt.name ?? 'none',
    retention: Boolean(res?.fmt.retention), width: surface.W, height: surface.H, pxPerMm: surface.pxPerMm,
    dotsPerPixel: dots, dotPitchUm: 1000 / (surface.pxPerMm * dots), fps: meter.fps,
    input, ...(res?.painter ? {vector: res.painter.stats} : {})};
  },
  dispose: gpu.dispose
 });
}

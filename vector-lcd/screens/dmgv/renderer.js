/* DMG-01 with vector input: runs the passes in shaders.js every frame.
 *
 * The panel's memory is per point: n x n points inside each screen pixel, each
 * with its own crystal state (16 bits) and drive level (2 bits), plus one ion
 * charge per pixel. Edges stay as fine as the points however far the panel is
 * enlarged, and a moving edge keeps every point's own history. The shapes are
 * drawn at the points each frame (vector/draw.js).
 *
 * Points per pixel: enough that they sit no further apart than POINT_PITCH_MM
 * on the panel, at most 4 x 4, within the GPU's texture limit and a budget.
 * The physics is the DMG-01's (screens/dmg/model.js), run per drive level. */

import {createGPU, createSurface, createMeter} from '../../gpu/webgl.js';
import {clamp, directionVector, bezelShiftMm, bezelPenumbraMm, glareSigma, glareNorm, shadowKernel, entryOffsetMm} from '../../optics/room.js';
import {checkProfile, contrastConditions, temperatureScale, powerFactor, stickingVolts, metastableChance} from '../dmg/model.js';
import {lensScratches, uploadScratches, MAX_PER_CELL} from '../../optics/scratches.js';
import {UPDATE_FS, ENTRY_FS, BLUR_FS, DISPLAY_FS, MAX_POINTS} from './shaders.js';
import {createVectorPainter} from '../../vector/draw.js';

export const VERSION = '0.11.0';

const MAX_STEPS_PER_FRAME = 8;     // DMG frames advanced in one display frame, at most
const POINT_PITCH_MM = .025;       // points no further apart than this on the panel (40 per mm)
const POINT_BUDGET = 2.4e7;        // points in all (one byte each, plus a stencil byte)


/** @returns {import('../contract.js').ScreenRenderer} */
export function createRenderer(canvas, {profile: initialProfile, widthMm, heightMm, maxPixels = 6e6, bezelLipMm = 1} = {}) {
 // The frame printed on the lens's underside sits an air gap above the LCD.
 const frameHeightMm = () => profile.lens?.gap_mm ?? bezelLipMm;
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
 let condition = 'box';             // the lens: 'box' (as new) or 'used' (scratches, lens.scratches.used)
 let scratches = null;              // the lens's scratch tables for the condition (optics/scratches.js)
 let grainOn = true;                // the reflector's grain (reflector.grain_*)
 let dmgFrame = 0;                 // DMG frames run so far: the fade's draws (model.js decayDraw)
 let lighting = {angleDeg: 45, azimuthDeg: 315, sourceDeg: 15, exposure: 1};
 let viewing = {polarDeg: 0, azimuthDeg: 0, distanceMm: 300};
 let celsius = 25;
 let power = true;                 // the LCD switched on
 let unpowered = 0;                // how far the panel has relaxed toward its unpowered rest (0 to 1)
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
   drift: gpu.texture(), optical: gpu.texture(), targetQ: gpu.texture(), metaQ: gpu.texture(), color: gpu.texture(), painter: createVectorPainter(gl),
   content: null, contentFb: null, stencil: null, sets: [], fields: [], size: null,
   none: gpu.texture()   // a 1 x 1 stand-in for Q1 when there are at most 8 points
  };
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, 1, 1, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, new Uint32Array(4));
  uploadTables();
  res.scratchTex = null;
  if (scratches) res.scratchTex = uploadScratches(gl, scratches);
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
  // The temporary resting state, the same layout (-1 where a shade has one state).
  gl.bindTexture(gl.TEXTURE_2D, res.metaQ);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 4, profile.contrast.conditions.length, 0, gl.RED, gl.FLOAT, new Float32Array(S.meta_q));
  // Colour per director coordinate (linear RGB): BGB's colours at the solver's brightness.
  gl.bindTexture(gl.TEXTURE_2D, res.color);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, S.color_bins, 1, 0, gl.RGB, gl.FLOAT, new Float32Array(S.color));
 }

 /** The fade of temporary resting states over this update's DMG frames (model.js
  * settleTemporary): the table, the chance, and the frame number for the draws. */
 function bindFade(p, frames) {
  gpu.bind(p, 11, 'uMetaQ', res.metaQ);
  gl.uniform1f(p.u('uMetaP'), frames > 0 && power ? metastableChance(profile, celsius, frames) : 0);
  gl.uniform1ui(p.u('uFrame'), dmgFrame);
 }

 function bindColor(p) {
  gpu.bind(p, 10, 'uColor', res.color);
  gl.uniform1i(p.u('uColorBins'), profile.stn.color_bins);
 }

 function storage(w, h, internal, format, type) {
  const tex = gpu.texture();
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  return tex;
 }

 /** One set of state targets, drawn together (multiple render targets). Points
  * 8-15 get storage only when there are more than 8 points per pixel. */
 function stateSet(w, h, n) {
  const big = n * n > 8;
  const tex = [
   storage(w, h, gl.RGBA32UI, gl.RGBA_INTEGER, gl.UNSIGNED_INT),               // Q0: points 0-7, 16 bits each
   big ? storage(w, h, gl.RGBA32UI, gl.RGBA_INTEGER, gl.UNSIGNED_INT) : null,  // Q1: points 8-15
   storage(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT),                          // MEAN: first-pass transmission
   storage(w, h, gl.RGBA32UI, gl.RGBA_INTEGER, gl.UNSIGNED_INT)                // META: levels, ion, mean colour
  ];
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  tex.forEach((t, i) => t && gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(tex.map((t, i) => t ? gl.COLOR_ATTACHMENT0 + i : gl.NONE));
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
  for (const set of res.sets) { gl.deleteFramebuffer(set.fb); set.tex.forEach(t => t && gl.deleteTexture(t)); }
  gpu.release(...res.fields);
  if (res.content) gl.deleteTexture(res.content);
  if (res.contentFb) gl.deleteFramebuffer(res.contentFb);
  if (res.stencil) gl.deleteRenderbuffer(res.stencil);

  points = pointsFor(W, H);
  res.sets = [stateSet(W, H, points), stateSet(W, H, points)];
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
    gpu.bind(p, 1, 'uQ0', from.tex[0]);
    gpu.bind(p, 2, 'uQ1', from.tex[1] ?? res.none);
    gpu.bind(p, 3, 'uMeta', from.tex[3]);
    bindTables(p);
    bindColor(p);
    bindFade(p, init === 1 ? 0 : steps);
    gl.uniform1i(p.u('uN'), points);
    gl.uniform1i(p.u('uSteps'), init === 1 ? 0 : steps);
    gl.uniform1i(p.u('uInit'), init);
    gl.uniform1f(p.u('uTscale'), temperatureScale(profile, celsius));
    gl.uniform1i(p.u('uOff'), power ? 0 : 1);
    gl.uniform1f(p.u('uU0'), init === 1 ? (power ? 0 : 1) : unpowered);
    gl.uniform1f(p.u('uUk'), powerFactor(profile, celsius, power));
    gl.uniform1f(p.u('uCharge'), R.charge_per_frame);
    gl.uniform1f(p.u('uRelease'), R.release_per_frame);
    gl.uniform1f(p.u('uSticking'), stickingVolts(profile) * R.sticking_optical_gain);
   });
   dmgFrame = (dmgFrame + (init === 1 ? 0 : steps)) >>> 0;
   const k = powerFactor(profile, celsius, power), n = init === 1 ? 0 : steps;
   if (init === 1) unpowered = power ? 0 : 1;
   else if (init === 2 && power) unpowered = 0;
   unpowered = power ? unpowered * k ** n : 1 - (1 - unpowered) * k ** n;
   current = 1 - current;
   init = 0;
  }
  const state = res.sets[current];

  // ---- 2. First pass through the pixel, shaded by the bezel
  gpu.section('first pass');
  gpu.draw(res.entry, res.fields[0].fb, size, p => {
   gpu.bind(p, 0, 'uMean', state.tex[2]);
   const shift = bezelShiftMm(profile, lighting, frameHeightMm());
   gl.uniform2f(p.u('uPanelMm'), W / pxPerMm, H / pxPerMm);
   gl.uniform2f(p.u('uBezelShift'), shift.x, shift.y);
   gl.uniform1f(p.u('uBezelSigma'), Math.max(1e-3, bezelPenumbraMm(profile, lighting, frameHeightMm())));
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
   gpu.bind(p, 0, 'uMean', state.tex[2]);
   gpu.bind(p, 1, 'uField', res.fields[0].tex);
   gpu.bind(p, 6, 'uMeta', state.tex[3]);
   gl.uniform1i(p.u('uShadow'), shadow ? 1 : 0);
   // The reflector's fixed grain (model.js reflectorGrain); off for inspection or checks.
   gl.uniform1f(p.u('uGrainMm'), profile.reflector?.grain_mm ?? 1);
   gl.uniform1f(p.u('uGrainAmp'), grainOn ? profile.reflector?.grain_amplitude ?? 0 : 0);
   // Scratches on the lens front (condition 'used'); the lens front sits gap + thickness above the image.
   gl.uniform1f(p.u('uLensHeight'), (profile.lens?.gap_mm ?? 0) + (profile.lens?.thickness_mm ?? 0));
   gl.uniform1i(p.u('uScratchOn'), scratches && res.scratchTex ? 1 : 0);
   if (scratches && res.scratchTex) {
    gpu.bind(p, 12, 'uScratchData', res.scratchTex.data);
    gpu.bind(p, 13, 'uScratchGrid', res.scratchTex.grid);
    gpu.bind(p, 14, 'uScratchIndex', res.scratchTex.index);
    gl.uniform1f(p.u('uScratchCell'), scratches.cellMm);
    gl.uniform1f(p.u('uScratchRough'), scratches.rough);
    gl.uniform2f(p.u('uScratchOrigin'), scratches.origin[0], scratches.origin[1]);
   } else {
    // Unused, but every sampler must name a texture of its kind.
    for (const [u, name] of [[12, 'uScratchData'], [13, 'uScratchGrid'], [14, 'uScratchIndex']]) gpu.bind(p, u, name, res.drift);
   }
   gl.uniform2f(p.u('uSize'), W, H);
   gl.uniform2f(p.u('uMean2'), mean.x * pxPerMm, -mean.y * pxPerMm);
   gl.uniform1f(p.u('uPxPerMm'), pxPerMm);
   gl.uniform1f(p.u('uExposure'), lighting.exposure);
   const e = directionVector(viewing.polarDeg, viewing.azimuthDeg), D = viewing.distanceMm;
   gl.uniform3f(p.u('uEye'), W / pxPerMm / 2 + e[0] * D, H / pxPerMm / 2 + e[1] * D, e[2] * D);
   gl.uniform3fv(p.u('uLight'), directionVector(lighting.angleDeg, lighting.azimuthDeg));
   const sigma = glareSigma(lighting.sourceDeg);
   gl.uniform1f(p.u('uGlareSigma'), sigma);
   gl.uniform1f(p.u('uGlareNorm'), glareNorm(sigma, lighting.angleDeg));
   gl.uniform1f(p.u('uFront'), profile.oblique.front_index);
   gl.uniform1f(p.u('uLensN'), profile.lens?.n ?? 0);
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

 /** The pixel at a point (panel mm): its main drive level, the mean state of
  * the points at that level, {q, ionic, shade, shown}, how much of the pixel
  * each level covers, and every point's own level and state (points). */
 function sample(xMm, yMm) {
  if (!res || gpu.lost) return null;
  const [x, y] = surface.texelAt(xMm, yMm), N = points * points;
  const set = res.sets[current], a = read(0, x, y, true), b = set.tex[1] ? read(1, x, y, true) : new Uint32Array(4);
  const meta = read(3, x, y, true), word = meta[0], ion = new Float32Array(new Uint32Array([meta[1]]).buffer)[0];
  const cover = [0, 0, 0, 0], sum = [0, 0, 0, 0], states = [];
  for (let k = 0; k < N; k++) {
   const level = (word >>> (2 * k)) & 3, w = k >> 1, bits = ((w < 4 ? a[w] : b[w - 4]) >>> (16 * (k & 1))) & 65535;
   states.push({level, q: bits / 65535});
   cover[level]++; sum[level] += bits / 65535;
  }
  // shown: the optical state the pixel showed over the last DMG frame, averaged over its points.
  const shade = cover.indexOf(Math.max(...cover)), q = sum[shade] / cover[shade];
  const half = h => { const e = (h >> 10) & 31, m = h & 1023, v = e ? (1 + m / 1024) * 2 ** (e - 15) : m / 1024 * 2 ** -14; return h & 32768 ? -v : v; };
  // texel and frame: what the fade's draws are keyed by (model.js decayDraw), for checks.
  return {q, ionic: ion, shade, shown: half(meta[3] >>> 16), coverage: cover.map(c => c / N), points: states, texel: [x, y], frame: dmgFrame};
 }


 // ===========================================================================
 // Start, and the public interface
 // ===========================================================================

 gpu.onRestored = setup;
 setup();

 return Object.freeze({
  get profile() { return profile; },
  beginContent: surface.beginContent, frame, resize, reset, sample, get bezelLipMm() { return frameHeightMm(); },
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
  /** The reflector's grain (on by default); the checks switch it off to compare flat colours. */
  get grain() { return grainOn; },
  setGrain(on) { grainOn = Boolean(on); },
  /** The lens's condition: 'box' (as it left the factory) or 'used' (procedural scratches; wear varies by unit). */
  get condition() { return condition; },
  setCondition(c) {
   condition = c === 'used' ? 'used' : 'box';
   scratches = condition === 'box' ? null : lensScratches(profile, condition, [widthMm, heightMm]);
   if (scratches && scratches.maxPerCell > MAX_PER_CELL) throw new Error('Too many scratches in one lens cell: ' + scratches.maxPerCell);
   if (res && !gpu.lost) res.scratchTex = scratches ? uploadScratches(gl, scratches, res.scratchTex ?? {}) : res.scratchTex;
  },
  /** The LCD switched on or off (the DMG's LCD enable; with no drive the panel relaxes to its unpowered rest). */
  get power() { return power; },
  setPower(on) { power = Boolean(on); },
  get temperature() { return celsius; },
  setTemperature(c) { celsius = Number(c); },
  get contrast() { return contrast; },
  setContrast(c) { contrast = clamp(Number(c), profile.contrast.min, profile.contrast.max); },

  info() {
   return {version: VERSION, stateFormat: 'per point: 16-bit state, 2-bit level; per pixel: ion charge', retention: true,
    width: surface.W, height: surface.H, pxPerMm: surface.pxPerMm, fps: meter.fps, input: 'vector',
    dotsPerPixel: points, dotPitchUm: 1000 / (surface.pxPerMm * points), pointsPerPixel: points,
    // Per pixel: two state sets ((16 or 32) + 8 + 16 bytes), two light fields (8), points (1 byte + 1 stencil each).
    gpuMemoryMB: surface.W * surface.H * (2 * ((points * points > 8 ? 32 : 16) + 24) + 2 * 8 + points * points * 2) / 1048576,
    vector: res?.painter.stats};
  },
  dispose: gpu.dispose
 });
}

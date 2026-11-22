/* Reflective TN renderer: runs the passes in shaders.js every frame.
 *
 * Multiplexed profiles drive every electrode point, lit or not; points outside
 * all electrodes get no voltage. The electrode map (white = electrode) shows
 * the renderer where the glass can switch, which is where unlit segments show.
 * Content is digital and free: the glass is treated as a grid finer than the
 * device pixel, so any art can be shown. That is the one stated compromise. */

import {createGPU, createSurface, createMeter} from '../../gpu/webgl.js';
import {createEyeGlare} from '../../gpu/eye-glare.js';
import {clamp, directionVector, bezelShiftMm, bezelPenumbraMm, glareSigma, glareNorm} from '../../optics/room.js';
import {checkProfile, temperatureFactors, shadowKernel, entryOffsetMm, obliqueOptics} from './model.js';
import {UPDATE_FS, ENTRY_FS, BLUR_FS, DISPLAY_FS} from './shaders.js';

export const VERSION = '0.9.0';


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
 let settle = false;               // next frame jumps straight to equilibrium
 let mode = 'static';              // 'static': on/off as the datasheet panel; 'analog': grays
 let lighting = {angleDeg: 30, azimuthDeg: 0, sourceDeg: 10, exposure: 1};
 let viewing = {polarDeg: 0, azimuthDeg: 0, distanceMm: 300};
 let celsius = 25;
 let driveGain = 1;                // supply trim: every drive voltage times this
 let optics = null, opticsKey = '';
 let viewer = {glare: false};                         // eye distance: viewing.distanceMm
 let eye = null;                                       // the viewer's-eye pass; rebuilt with the context

 const electrodes = document.createElement('canvas');
 const ectx = electrodes.getContext('2d');
 let drawElectrodes = null;


 // ===========================================================================
 // GPU resources
 // ===========================================================================

 /** Director state: as precise as the browser can render, down to 8 bits. */
 function stateFormat() {
  const list = [];
  if (gl.getExtension('EXT_color_buffer_float')) list.push(
   {internal: gl.R32F, format: gl.RED, type: gl.FLOAT, name: '32-bit float', float: true},
   {internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, name: '16-bit float', float: true});
  list.push({internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, name: '8-bit', float: false});
  return gpu.firstRenderable(list, 'No render target format available');
 }

 /** The blurred entry field must filter; half floats filter in WebGL2. */
 function fieldFormat() {
  const list = [];
  if (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))
   list.push({internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, name: '16-bit float'});
  list.push({internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, name: '8-bit'});
  return gpu.firstRenderable(list, 'No field format available');
 }

 function setup() {
  res = {
   fmt: stateFormat(), fieldFmt: fieldFormat(),
   update: gpu.program(UPDATE_FS), entry: gpu.program(ENTRY_FS), blur: gpu.program(BLUR_FS), display: gpu.program(DISPLAY_FS),
   content: gpu.texture(), electrodes: gpu.texture(), drive: gpu.texture(), eq: gpu.texture(),
   entryLut: gpu.texture(gl.LINEAR), exitLut: gpu.texture(gl.LINEAR),
   states: [], fields: [], size: null
  };
  uploadProfileTables();
  eye = createEyeGlare(gpu);
  if (surface.W && surface.H) allocate();
 }

 /** Size-dependent targets. The panel's state carries over from the old size
  * when there is one; a new panel settles straight to the current image. */
 function allocate() {
  const {W, H} = surface, old = res.states, oldSize = res.size;
  res.states = [gpu.target(W, H, res.fmt), gpu.target(W, H, res.fmt)];
  gpu.release(...res.fields);
  res.fields = [gpu.target(W, H, res.fieldFmt), gpu.target(W, H, res.fieldFmt)];
  for (const f of res.fields) {
   gl.bindTexture(gl.TEXTURE_2D, f.tex);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
  gl.bindTexture(gl.TEXTURE_2D, res.content);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  uploadElectrodes();
  eye.allocate(W, H);
  if (old.length && oldSize) {
   gpu.copy(old[current].tex, oldSize, res.states[current].tex, [W, H]);
   gpu.release(...old);
  } else {
   gpu.release(...old);
   reset();
   settle = true;
  }
  res.size = [W, H];
 }

 /** Blank panel: every point relaxed. */
 function reset() {
  if (!res || gpu.lost) return;
  gl.clearColor(0, 0, 0, 0);
  for (const s of res.states) {
   gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb);
   gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  last = null;
  settle = false;
 }

 function uploadProfileTables() {
  const d = profile.drive, n = d.voltages.length;
  gl.bindTexture(gl.TEXTURE_2D, res.drive);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 256, 2, 0, gl.RED, gl.FLOAT, new Float32Array([...d.static_by_gray, ...d.analog_by_gray]));
  gl.bindTexture(gl.TEXTURE_2D, res.eq);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, n, 1, 0, gl.RED, gl.FLOAT, new Float32Array(d.a_equilibrium));
  opticsKey = '';
  optics = null;
 }

 function uploadElectrodes() {
  if (!res || gpu.lost || !surface.W || !drawElectrodes) return;
  ectx.setTransform(1, 0, 0, 1, 0, 0);
  ectx.globalCompositeOperation = 'source-over';
  ectx.globalAlpha = 1;
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, surface.W, surface.H);
  ectx.setTransform(surface.pxPerMm, 0, 0, surface.pxPerMm, 0, 0);
  ectx.fillStyle = '#fff';
  ectx.strokeStyle = '#fff';
  drawElectrodes(ectx);
  gl.bindTexture(gl.TEXTURE_2D, res.electrodes);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, electrodes);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
 }

 /** Rebuild the separable optics when the light, the eye or the temperature moves. */
 function updateOptics() {
  const key = [lighting.angleDeg, lighting.azimuthDeg, viewing.polarDeg, viewing.azimuthDeg, celsius].map(v => v.toFixed(2)).join();
  if (key === opticsKey && optics) return;
  opticsKey = key;
  optics = obliqueOptics(profile, {polarDeg: lighting.angleDeg, azimuthDeg: lighting.azimuthDeg}, viewing, celsius);
  const A = optics.size;
  gl.bindTexture(gl.TEXTURE_2D, res.entryLut);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, A, 1, 0, gl.RGBA, gl.FLOAT, optics.entry);
  const rows = new Float32Array(A * 3 * 4);
  for (let j = 0; j < A; j++) for (let c = 0; c < 3; c++) for (let k = 0; k < 4; k++) rows[(c * A + j) * 4 + k] = optics.exit[(j * 3 + c) * 4 + k];
  gl.bindTexture(gl.TEXTURE_2D, res.exitLut);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, A, 3, 0, gl.RGBA, gl.FLOAT, rows);
  // Entry vectors are stored normalized per component (see ENTRY_FS).
  const lo = [0, 1, 2, 3].map(k => Math.min(...Array.from({length: A}, (_, i) => optics.entry[i * 4 + k])));
  const hi = [0, 1, 2, 3].map(k => Math.max(...Array.from({length: A}, (_, i) => optics.entry[i * 4 + k])));
  res.lo = lo;
  res.span = hi.map((h, k) => Math.max(1e-9, h - lo[k]));
 }


 // ===========================================================================
 // Frame
 // ===========================================================================

 function frame(now = performance.now()) {
  if (gpu.lost || !res || !surface.W) return;
  const {W, H, pxPerMm} = surface, size = [W, H];
  const dt = settle ? 1e6 : last === null ? 1000 / 60 : clamp(now - last, 0, 100);
  last = now;
  settle = false;
  meter.tick(dt);
  gpu.upload(res.content, surface.content);

  // ---- 1. Director: content -> drive -> state
  const dyn = profile.dynamics, d = profile.drive;
  const from = res.states[current], to = res.states[1 - current];
  gpu.draw(res.update, to.fb, size, p => {
   gpu.bind(p, 0, 'uContent', res.content);
   gpu.bind(p, 1, 'uState', from.tex);
   gpu.bind(p, 2, 'uDrive', res.drive);
   gpu.bind(p, 3, 'uEq', res.eq);
   gpu.bind(p, 4, 'uElectrodes', res.electrodes);
   gl.uniform1i(p.u('uHasElectrodes'), drawElectrodes && profile.drive.uses_electrode_map ? 1 : 0);
   gl.uniform1i(p.u('uMode'), mode === 'analog' ? 1 : 0);
   gl.uniform1i(p.u('uEqN'), d.voltages.length);
   gl.uniform1f(p.u('uVmax'), d.voltages[d.voltages.length - 1]);
   gl.uniform1f(p.u('uDt'), dt);
   gl.uniform1f(p.u('uTauOnOp'), dyn.tau_on_at_Vop_ms);
   gl.uniform1f(p.u('uTauOff'), dyn.tau_off_ms);
   gl.uniform1f(p.u('uVth'), dyn.Vth);
   gl.uniform1f(p.u('uVop'), dyn.Vop);
   const tf = temperatureFactors(profile, celsius);
   gl.uniform1f(p.u('uVscale'), tf.voltageScale * driveGain);
   gl.uniform1f(p.u('uTauScale'), tf.tauScale);
  });
  current = 1 - current;

  // ---- 2. Light entering the glass, shaded by the bezel
  updateOptics();
  const k = shadowKernel(profile, lighting);
  // Light enters where it meets the crystal on the way in and leaves where the
  // eye's ray meets it: the shadow offset is the difference of the two.
  const toView = entryOffsetMm(profile, viewing.polarDeg, viewing.azimuthDeg);
  k.mean = {x: k.mean.x - toView.x, y: k.mean.y - toView.y};
  const {lo, span} = res;
  gpu.draw(res.entry, res.fields[0].fb, size, p => {
   gpu.bind(p, 0, 'uState', to.tex);
   gpu.bind(p, 1, 'uEntryLut', res.entryLut);
   gl.uniform1f(p.u('uAmax'), optics.aMax);
   gl.uniform1f(p.u('uN'), optics.size);
   gl.uniform4fv(p.u('uLo'), lo);
   gl.uniform4fv(p.u('uSpan'), span);
   const shift = bezelShiftMm(profile, lighting, bezelLipMm);
   gl.uniform2f(p.u('uPanelMm'), W / pxPerMm, H / pxPerMm);
   gl.uniform2f(p.u('uBezelShift'), shift.x, shift.y);
   gl.uniform1f(p.u('uBezelSigma'), Math.max(1e-3, bezelPenumbraMm(profile, lighting, bezelLipMm)));
   gl.uniform1f(p.u('uPxPerMm'), pxPerMm);
   gl.uniform1f(p.u('uHeightPx'), H);
  });

  // ---- 3. Spread of entry points: along, then across the light (screen y runs down, rows up)
  const radial = [k.radial.x, -k.radial.y], across = [-radial[1], radial[0]];
  const blur = (src, dst, dir, sigmaMm) => gpu.draw(res.blur, dst.fb, size, p => {
   gpu.bind(p, 0, 'uSrc', src.tex);
   gl.uniform2f(p.u('uDir'), dir[0], dir[1]);
   gl.uniform2f(p.u('uSize'), W, H);
   gl.uniform1f(p.u('uSigma'), sigmaMm * pxPerMm);
  });
  blur(res.fields[0], res.fields[1], radial, k.sigmaRadialMm);
  blur(res.fields[1], res.fields[0], across, k.sigmaTangentialMm);

  // ---- 4. Colour leaving the glass, plus glare
  gpu.draw(res.display, viewer.glare ? eye.viewFb : null, size, p => {
   gl.uniform1i(p.u('uLinear'), viewer.glare ? 1 : 0);
   gpu.bind(p, 0, 'uState', to.tex);
   gpu.bind(p, 1, 'uField', res.fields[0].tex);
   gpu.bind(p, 2, 'uExitLut', res.exitLut);
   gl.uniform2f(p.u('uSize'), W, H);
   gl.uniform2f(p.u('uMean'), k.mean.x * pxPerMm, -k.mean.y * pxPerMm);
   gl.uniform1f(p.u('uAmax'), optics.aMax);
   gl.uniform1f(p.u('uN'), optics.size);
   gl.uniform1f(p.u('uExposure'), lighting.exposure);
   gl.uniform4fv(p.u('uLo'), lo);
   gl.uniform4fv(p.u('uSpan'), span);
   // Eye position in panel millimetres
   const e = directionVector(viewing.polarDeg, viewing.azimuthDeg), D = viewing.distanceMm;
   gl.uniform3f(p.u('uEye'), W / pxPerMm / 2 + e[0] * D, H / pxPerMm / 2 + e[1] * D, e[2] * D);
   gl.uniform3fv(p.u('uLight'), directionVector(lighting.angleDeg, lighting.azimuthDeg));
   const sigma = glareSigma(lighting.sourceDeg);
   gl.uniform1f(p.u('uGlareSigma'), sigma);
   gl.uniform1f(p.u('uGlareNorm'), glareNorm(sigma, lighting.angleDeg));
   gl.uniform1f(p.u('uFront'), profile.oblique.front_index ?? 1.5);
   gl.uniform1f(p.u('uPxPerMm'), pxPerMm);
  });

  // ---- 5. The viewer's eye, when on
  if (viewer.glare) eye.apply({distancePx: viewing.distanceMm * pxPerMm});
 }


 // ===========================================================================
 // Size and readback
 // ===========================================================================

 function resize(cssWidth, cssHeight, dpr = 1) {
  const fit = surface.fit(cssWidth, cssHeight, dpr, gpu.maxTextureSize);
  if (fit.changed) {
   electrodes.width = surface.W;
   electrodes.height = surface.H;
   if (res && !gpu.lost) allocate();
  }
  return {width: fit.width, height: fit.height, pxPerMm: fit.pxPerMm};
 }

 /** Director state at a point (panel mm). */
 function sample(xMm, yMm) {
  if (!res || gpu.lost) return null;
  const [x, y] = surface.texelAt(xMm, yMm);
  return gpu.readTexel(res.states[current].fb, x, y, res.fmt.float)[0];
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

  /** Switch to another TN profile; the crystal settles into the new panel's state. */
  setProfile(next) {
   profile = checkProfile(next);
   if (res && !gpu.lost) { uploadProfileTables(); settle = true; }
  },
  /** draw(ctx) paints electrodes white on black, in millimetres. */
  setElectrodes(draw) { drawElectrodes = draw; uploadElectrodes(); },

  get mode() { return mode; },
  setMode(next) {
   if (next !== 'static' && next !== 'analog') throw new RangeError('Drive mode must be static or analog');
   mode = next;
  },
  get lighting() { return {...lighting}; },
  setLighting(next) { lighting = {...lighting, ...next}; },
  get viewing() { return {...viewing}; },
  setViewing(next) { viewing = {...viewing, ...next}; },
  /** Glare inside the viewer's eye: on or off. */
  get viewer() { return {...viewer}; },
  setViewer(next) { viewer = {...viewer, ...next}; },
  get temperature() { return celsius; },
  setTemperature(c) { celsius = Number(c); },
  /** Scale every drive voltage, as a supply trim does: a multiplexed panel's on
   * and off rms voltages are fixed fractions of VLCD. 1 = the profile's drive. */
  get driveGain() { return driveGain; },
  setDriveGain(g) { driveGain = clamp(Number(g), 0, 2); },
  get opticsError() { return optics?.error ?? null; },

  info() {
   return {version: VERSION, stateFormat: res?.fmt.name ?? 'none', fieldFormat: res?.fieldFmt.name ?? 'none',
    width: surface.W, height: surface.H, pxPerMm: surface.pxPerMm, fps: meter.fps, mode};
  },
  dispose: gpu.dispose
 });
}

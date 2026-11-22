/* IBM 5151 CRT renderer: runs the passes in shaders.js every frame.
 *
 * The panel's height is the raster's 350 visible lines: the panel is drawn at
 * the app's size, and every monitor distance is scaled by monitorPerPanel. */

import {createGPU, createSurface, createMeter} from '../../gpu/webgl.js';
import {createEyeGlare} from '../../gpu/eye-glare.js';
import {clamp, bezelShiftMm, bezelPenumbraMm} from '../../optics/room.js';
import {checkProfile, adaptedExposure, halationRings, roomScale, spotSigmaMm, isPPI, eyeWindow, MAX_COMPONENTS} from './model.js';
import {UPDATE_FS, EMIT_FS, HALO_FS, DISPLAY_FS} from './shaders.js';

export const VERSION = '0.7.0';

const HALO_RINGS = 24;             // must match HALO_FS
const HALO_DOWNSCALE = 8;          // halation is millimetres wide: 1/8 resolution is plenty
const MAX_ROOM_LUX = 1000;

/** The profile's exponentials padded to the shaders' fixed count; unused ones
 * carry no light. layer: 0 or 1 per component. */
function components(profile) {
 const {amplitudes, taus_s, layer} = profile.phosphor.impulse;
 const pad = (list, fill) => Array.from({length: MAX_COMPONENTS}, (_, i) => list[i] ?? fill);
 return {a: pad(amplitudes, 0), tau: pad(taus_s, 1), layer: pad(layer, 0)};
}

/** Linear-sRGB colour per unit luminance of each layer (a missing second layer is black). */
function layerColours(profile) {
 const layers = profile.phosphor.layers;
 return [layers[0].display_rgb_per_Y, layers[1]?.display_rgb_per_Y ?? [0, 0, 0]];
}


/** @returns {import('../contract.js').ScreenRenderer} */
export function createRenderer(canvas, {profile: initialProfile, widthMm, heightMm, maxPixelRatio = 2, bezelLipMm = 1} = {}) {
 let profile = checkProfile(initialProfile);
 const surface = createSurface(canvas, {widthMm, heightMm, maxPixelRatio});
 const gpu = createGPU(canvas, 'CRT'), {gl} = gpu;
 const meter = createMeter();

 /** Monitor millimetres per panel millimetre. */
 const monitorPerPanel = () => profile.raster.height_mm / heightMm;


 // ===========================================================================
 // State
 // ===========================================================================

 let res = null;                   // GPU resources; rebuilt after a context loss
 let current = 0;                  // which of the two state targets holds the present
 let last = null;                  // time of the previous frame (ms)
 let clock = 0;                    // time within the CRT frame (s): where the beam is
 let lighting = {angleDeg: 45, azimuthDeg: 315, sourceDeg: 15, exposure: 1};
 let contrast = profile.controls.contrast.value;
 let brightness = profile.controls.brightness.value;
 let roomLux = profile.luminance.room_lux;    // the room's illuminance at the screen
 // The viewer's eye; distanceMm on the monitor (assumed: a desk monitor at 600 mm).
 let viewer = {glare: false, age: 35, pigment: .5, distanceMm: 600};
 let eye = null;                                // the viewer's-eye pass; rebuilt with the context


 // ===========================================================================
 // GPU resources
 // ===========================================================================

 function setup() {
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This screen model needs 32-bit float render targets, which this browser does not provide.');
  res = {
   update: gpu.program(UPDATE_FS), emit: gpu.program(EMIT_FS), haloPass: gpu.program(HALO_FS), display: gpu.program(DISPLAY_FS),
   content: gpu.texture(), states: [], halo: null, haloField: null, small: null, size: null
  };
  eye = createEyeGlare(gpu);
  if (surface.W && surface.H) allocate();
 }

 function storage(tex, internal, type, [w, h]) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
 }

 /** One phosphor state target: two 32-bit float textures drawn at once. */
 function stateTarget(size) {
  const t0 = gpu.texture(), t1 = gpu.texture();
  storage(t0, gl.RGBA32F, gl.FLOAT, size);
  storage(t1, gl.RGBA32F, gl.FLOAT, size);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t0, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, t1, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('CRT state targets are not supported here.');
  return {t0, t1, fb};
 }

 /** Half-float light target, optionally with mipmaps for the halation's wide samples. */
 function lightTarget(size, mipmaps) {
  const tex = gpu.texture(gl.LINEAR);
  storage(tex, gl.RGBA16F, gl.HALF_FLOAT, size);
  if (mipmaps) {
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
   gl.generateMipmap(gl.TEXTURE_2D);
  }
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return {tex, fb};
 }

 /** Size-dependent targets. The phosphor's charge carries over from the old
  * size when there is one; a new screen starts cold. */
 function allocate() {
  const {W, H} = surface, size = [W, H], old = res.states, oldSize = res.size;
  res.states = [stateTarget(size), stateTarget(size)];
  gpu.release(res.halo, res.haloField);
  res.halo = lightTarget(size, true);            // emitted light; its mipmaps feed the halation
  res.small = [Math.max(1, Math.ceil(W / HALO_DOWNSCALE)), Math.max(1, Math.ceil(H / HALO_DOWNSCALE))];
  res.haloField = lightTarget(res.small, false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, res.content);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  eye.allocate(W, H);
  if (old.length && oldSize) {
   gpu.copy(old[current].t0, oldSize, res.states[current].t0, size);
   gpu.copy(old[current].t1, oldSize, res.states[current].t1, size);
   gpu.release(...old);
  } else {
   gpu.release(...old);
   reset();
  }
  res.size = size;
 }

 /** A cold screen: no charge on the phosphor. */
 function reset() {
  if (!res || gpu.lost) return;
  gl.clearColor(0, 0, 0, 0);
  for (const s of res.states) {
   gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb);
   gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
 }

 /** Uniforms of the shared RASTER chunk (line pitch, beam timing) and the spot. */
 function bindRaster(p) {
  const T = profile.timing, {H, W, pxPerMm} = surface;
  const pitch = H / T.lines_visible, toPx = pxPerMm / monitorPerPanel(), B = profile.spot.bloom;
  gl.uniform1f(p.u('uPitch'), pitch);
  // Spot (UPDATE only): the measured W spot in px; the bloom law turns it into each point's width.
  gl.uniform1f(p.u('uSigmaW'), profile.spot.sigma_mm * toPx);
  gl.uniform1f(p.u('uEff'), profile.phosphor.efficiency_vs_P4);
  gl.uniform1f(p.u('uBloomP'), B.power);
  gl.uniform1f(p.u('uMinDrive'), B.min_drive_fraction);
  const C = profile.controls;
  gl.uniform1f(p.u('uSigmaMax'), Math.max(spotSigmaMm(profile, C.contrast.max + C.brightness.max) * toPx, 1e-3));
  gl.uniform1f(p.u('uLineS'), T.line_s);
  gl.uniform1f(p.u('uActiveS'), T.active_s);
  gl.uniform1f(p.u('uFrameS'), T.frame_s);
  gl.uniform1f(p.u('uW'), W);
  gl.uniform1f(p.u('uH'), H);
  gl.uniform1i(p.u('uLines'), T.lines_visible);
  // Drive: raster, or a PPI centred on the panel with its sweep reaching the corners.
  const ppi = isPPI(profile), sweepR = Math.hypot(W, H) / 2;
  gl.uniform1i(p.u('uPpi'), ppi ? 1 : 0);
  gl.uniform2f(p.u('uCenter'), W / 2, H / 2);
  gl.uniform1f(p.u('uRref'), ppi ? profile.drive.ppi.r_ref_fraction_of_sweep * sweepR : 1);
  gl.uniform1f(p.u('uRmin'), Math.max(spotSigmaMm(profile, 1) * toPx, 1));
  const eye = eyeWindow(profile);
  gl.uniform1f(p.u('uWindow'), eye.window);
  gl.uniform1f(p.u('uLightScale'), eye.scale);
  const c = components(profile);
  gl.uniform1fv(p.u('uA'), c.a);
  gl.uniform1fv(p.u('uTau'), c.tau);
  gl.uniform1fv(p.u('uLayer'), c.layer);       // EMIT only; ignored where the shader has no uLayer
 }


 // ===========================================================================
 // Frame
 // ===========================================================================

 function frame(now = performance.now()) {
  if (gpu.lost || !res || !surface.W) return;
  const {W, H, pxPerMm} = surface, size = [W, H], mpp = monitorPerPanel();
  const dtMs = last === null ? 0 : clamp(now - last, 0, 100);
  last = now;
  meter.tick(dtMs);
  const T = profile.timing.frame_s, delta = dtMs / 1000, phase0 = clock;
  clock = (clock + delta) % T;
  gpu.upload(res.content, surface.content);

  // ---- 1. Beam hits since the last frame
  if (delta > 0) {
   const from = res.states[current], to = res.states[1 - current];
   gpu.draw(res.update, to.fb, size, p => {
    gpu.bind(p, 0, 'uContent', res.content);
    gpu.bind(p, 1, 'uS0', from.t0);
    gpu.bind(p, 2, 'uS1', from.t1);
    bindRaster(p);
    gl.uniform1f(p.u('uPhase0'), phase0);
    gl.uniform1f(p.u('uDelta'), delta);
    gl.uniform1f(p.u('uContrast'), contrast);
    gl.uniform1f(p.u('uBrightness'), brightness);
   });
   current = 1 - current;
  }

  // ---- 2. Light over the last refresh period, per layer
  const s = res.states[current];
  gpu.draw(res.emit, res.halo.fb, size, p => {
   gpu.bind(p, 0, 'uS0', s.t0);
   gpu.bind(p, 1, 'uS1', s.t1);
   bindRaster(p);
   gl.uniform1f(p.u('uPhase1'), clock);
  });
  gl.bindTexture(gl.TEXTURE_2D, res.halo.tex);
  gl.generateMipmap(gl.TEXTURE_2D);

  // ---- 3. Halation
  const F = profile.faceplate, rings = halationRings(profile);
  gpu.draw(res.haloPass, res.haloField.fb, res.small, p => {
   gpu.bind(p, 0, 'uEmit', res.halo.tex);
   gl.uniform2f(p.u('uSize'), W, H);
   gl.uniform2f(p.u('uSmall'), res.small[0], res.small[1]);
   gl.uniform1f(p.u('uPxPerMm'), pxPerMm);
   gl.uniform1f(p.u('uMonitorMm'), mpp);
   // Sample the emission from a mip level whose texels are about 1 monitor-mm wide.
   gl.uniform1f(p.u('uHaloLod'), Math.max(0, Math.log2(pxPerMm / mpp)));
   gl.uniform1i(p.u('uHaloN'), Math.min(HALO_RINGS, rings.length));
   gl.uniform1fv(p.u('uHaloR'), Array.from({length: HALO_RINGS}, (_, i) => rings[i]?.[0] ?? 0));
   gl.uniform1fv(p.u('uHaloF'), Array.from({length: HALO_RINGS}, (_, i) => rings[i]?.[1] ?? 0));
  });

  // ---- 4. Each layer's light in its colour, plus the room
  gpu.draw(res.display, viewer.glare ? eye.viewFb : null, size, p => {
   gl.uniform1i(p.u('uLinear'), viewer.glare ? 1 : 0);
   gpu.bind(p, 0, 'uEmitFull', res.halo.tex);
   gpu.bind(p, 1, 'uHaloField', res.haloField.tex);
   gl.uniform2f(p.u('uSize'), W, H);
   gl.uniform1f(p.u('uFull'), profile.luminance.full_drive_relative);
   const room = roomScale(profile, roomLux);
   gl.uniform1f(p.u('uAmbient'), (F.ambient_reflectance - F.surface_reflectance) * room);
   gl.uniform1f(p.u('uSurface'), F.surface_reflectance * room);
   gl.uniform1f(p.u('uExposure'), lighting.exposure * adaptedExposure(profile));
   gl.uniform1f(p.u('uPxPerMm'), pxPerMm);
   const [rgb0, rgb1] = layerColours(profile);
   gl.uniform3fv(p.u('uRgb0'), rgb0);
   gl.uniform3fv(p.u('uRgb1'), rgb1);
   const shift = bezelShiftMm(profile, lighting, bezelLipMm);
   gl.uniform2f(p.u('uPanelMm'), W / pxPerMm, H / pxPerMm);
   gl.uniform2f(p.u('uBezelShift'), shift.x / mpp, shift.y / mpp);
   gl.uniform1f(p.u('uBezelSigma'), Math.max(1e-3, bezelPenumbraMm(profile, lighting, bezelLipMm) / mpp));
  });

  // ---- 5. The viewer's eye, when on (its distance is on the monitor: scale to the panel)
  if (viewer.glare) eye.apply({distancePx: viewer.distanceMm / mpp * pxPerMm, age: viewer.age, pigment: viewer.pigment});
 }


 // ===========================================================================
 // Size and readback
 // ===========================================================================

 function resize(cssWidth, cssHeight, dpr = 1) {
  const fit = surface.fit(cssWidth, cssHeight, dpr, gpu.maxTextureSize);
  if (fit.changed && res && !gpu.lost) allocate();
  return {width: fit.width, height: fit.height, pxPerMm: fit.pxPerMm};
 }

 /** Light at a point (panel mm) per layer, relative to full drive, averaged over the last frame. */
 function sampleLayers(xMm, yMm) {
  if (!res || gpu.lost) return null;
  const [x, y] = surface.texelAt(xMm, yMm);
  const t = gpu.readTexel(res.halo.fb, x, y);
  return [t[0], t[1]];
 }

 /** Total light at a point (panel mm), relative to full drive. */
 function sample(xMm, yMm) {
  const layers = sampleLayers(xMm, yMm);
  return layers && layers[0] + layers[1];
 }


 // ===========================================================================
 // Start, and the public interface
 // ===========================================================================

 gpu.onRestored = setup;
 setup();

 return Object.freeze({
  get profile() { return profile; },
  beginContent: surface.beginContent, frame, resize, reset, sample, sampleLayers, bezelLipMm,
  /** Veil the eye adds at a point (panel mm), linear RGB; for tests. */
  sampleVeil(xMm, yMm) { const [x, y] = surface.texelAt(xMm, yMm); return eye?.ready ? eye.sampleVeil(x, y) : null; },
  /** The linear view the eye looked at (tests). */
  readEyeView() { return eye?.ready ? eye.readView() : null; },

  /** Switch to another CRT profile (another phosphor); the screen starts cold. */
  setProfile(next) {
   profile = checkProfile(next);
   contrast = clamp(contrast, profile.controls.contrast.min, profile.controls.contrast.max);
   brightness = clamp(brightness, profile.controls.brightness.min, profile.controls.brightness.max);
   reset();
  },
  setElectrodes() {},              // a raster reaches every point: no electrode map

  get lighting() { return {...lighting}; },
  setLighting(next) { lighting = {...lighting, ...next}; },
  /** The 5151's front knobs. */
  get contrast() { return contrast; },
  setContrast(v) { const c = profile.controls.contrast; contrast = clamp(Number(v), c.min, c.max); },
  /** The viewer's eye: glare on or off, age (years), iris pigmentation (0 dark, 0.5 brown, 1 blue-green). */
  get viewer() { return {...viewer}; },
  setViewer(next) { viewer = {...viewer, ...next}; },
  /** The room's illuminance at the screen (lux): only the glass's reflection changes. */
  get roomLux() { return roomLux; },
  setRoomLux(v) { roomLux = clamp(Number(v), 0, MAX_ROOM_LUX); },
  get brightness() { return brightness; },
  setBrightness(v) { const b = profile.controls.brightness; brightness = clamp(Number(v), b.min, b.max); },

  info() {
   return {version: VERSION, stateFormat: '32-bit float', width: surface.W, height: surface.H, pxPerMm: surface.pxPerMm,
    fps: meter.fps, lines: profile.timing.lines_visible, linePx: surface.H / profile.timing.lines_visible};
  },
  dispose: gpu.dispose
 });
}

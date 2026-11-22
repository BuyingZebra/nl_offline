/* Vector LCD GPU checks, run in a real browser by test_vector_lcd_browser.py.
 *
 * The node tests check each screen's physics in JavaScript (model.js). These
 * check that the GPU computes the same thing (shaders.js), that every renderer
 * meets the shared contract, and that a resize keeps the panel's state. */

import {KINDS, SCREENS} from '../vector-lcd/app/screens.js';
import {missingMembers} from '../vector-lcd/screens/contract.js';

const PANEL = {w: 48, h: 92};
const CSS = [130, 250];
const T0 = 1000;

const tn = KINDS.tn, dmg = KINDS.dmg, crt = KINDS.crt, cgb = KINDS.cgb;


// ===========================================================================
// Helpers
// ===========================================================================

async function profileOf(id) {
 const response = await fetch('/vector-lcd/profiles/' + id + '.json');
 return response.json();
}

function mount(kind, profile, [w, h] = CSS) {
 const canvas = document.createElement('canvas');
 document.body.append(canvas);
 const renderer = KINDS[kind].createRenderer(canvas, {profile, widthMm: PANEL.w, heightMm: PANEL.h});
 renderer.resize(w, h, 1);
 return {renderer, done: () => { renderer.dispose(); canvas.remove(); }};
}

/** Content: white, or white with one black rectangle (mm). */
function paint(renderer, rect = null) {
 const ctx = renderer.beginContent();
 if (rect) { ctx.fillStyle = '#000'; ctx.fillRect(...rect); }
}

const result = (name, worst, tolerance, extra = '') =>
 ({name, ok: worst <= tolerance, detail: 'worst ' + worst.toExponential(2) + ' (tolerance ' + tolerance + ')' + extra});

const CENTER = [24, 45];
const PATCH = [10, 20, 28, 50];


// ===========================================================================
// Contract
// ===========================================================================

export async function contract() {
 const out = [];
 for (const screen of SCREENS) {
  const {renderer, done} = mount(screen.kind, await profileOf(screen.id));
  const missing = missingMembers(renderer);
  out.push({name: 'contract ' + screen.id, ok: missing.length === 0 && Object.isFrozen(renderer), detail: missing.join(', ') || 'complete'});
  done();
 }
 return out;
}


// ===========================================================================
// TN: director state on the GPU = stepState in JavaScript
// ===========================================================================

export async function tnParity() {
 const out = [];
 for (const id of ['reflective-tn', 'reflective-tn-mux4']) {
  const P = await profileOf(id);
  const {renderer: r, done} = mount('tn', P);
  r.setMode('static');
  r.setTemperature(25);
  r.setElectrodes(ctx => ctx.fillRect(0, 0, PANEL.w, PANEL.h));   // every point an electrode
  const vWhite = tn.driveVoltage(P, 255), vBlack = tn.driveVoltage(P, 0), dt = 1000 / 60;

  // First frame settles to the image; then drive the patch on, then off again.
  paint(r);
  r.frame(T0);
  let a = tn.stepState(P, 0, vWhite, 1e6, 25), worst = Math.abs(r.sample(...CENTER) - a), t = T0;
  for (let k = 0; k < 60; k++) {
   const on = k < 30;
   paint(r, on ? PATCH : null);
   r.frame(t += dt);
   a = tn.stepState(P, a, on ? vBlack : vWhite, dt, 25);
   worst = Math.max(worst, Math.abs(r.sample(...CENTER) - a));
  }
  out.push(result('TN GPU = model, ' + id, worst, 2e-4));
  done();
 }
 return out;
}


// ===========================================================================
// DMG-01: director, ions and shown light on the GPU = stepFrame in JavaScript
// ===========================================================================

export async function dmgParity() {
 const P = await profileOf('dmg-01-stn');
 const {renderer: r, done} = mount('dmg', P);
 r.setTemperature(25);
 r.setContrast(1);
 const options = {contrast: 1, celsius: 25}, dt = 23;

 // First frame settles to white (shade 0).
 paint(r);
 r.frame(T0);
 let st = {q: dmg.targetQ(P, 0, 1), ionic: 0, shade: 0}, shown = dmg.opticalState(P, st.q);
 let phase = 0, t = T0, worst = 0;
 for (let k = 0; k < 90; k++) {
  const shade = k < 45 ? 3 : 0;
  paint(r, shade ? PATCH : null);
  r.frame(t += dt);
  // The renderer's whole-frame stepping (frame-rate independence)
  phase += dt * P.panel.refresh_hz / 1000;
  const steps = Math.min(8, Math.floor(phase));
  phase = Math.min(phase - steps, 1);
  if (steps > 0) {
   let sum = 0;
   for (let i = 0; i < steps; i++) { const next = dmg.stepFrame(P, st, shade, options); sum += next.exposure; st = next; }
   shown = sum / steps;
  }
  const g = r.sample(...CENTER);
  worst = Math.max(worst, Math.abs(g.q - st.q), Math.abs(g.ionic - st.ionic), Math.abs(g.shown - shown));
 }
 done();
 return [result('DMG-01 GPU = model (q, ions, shown light)', worst, 2e-4)];
}


// ===========================================================================
// Game Boy Color: channel states and frame-average colour on the GPU = stepFrame
// ===========================================================================

export async function cgbParity() {
 const P = await profileOf('cgb-001-tft');
 const {renderer: r, done} = mount('cgb', P);
 const fill = rgb => { const ctx = r.beginContent(); ctx.fillStyle = 'rgb(' + rgb.join(',') + ')'; ctx.fillRect(0, 0, PANEL.w, PANEL.h); };
 const codes = rgb => cgb.codesFromRGB(rgb.map(v => v / 255));
 const dt = P.panel.frame_s * 1000 * (1 + 1e-7);       // one GBC frame per display frame

 // Settle on cyan, then switch to orange, then to white before orange has settled.
 let t = T0, st = cgb.settled(codes([0, 240, 240])), worstS = 0, worstXYZ = 0;
 fill([0, 240, 240]);
 r.frame(t);
 for (const [rgb, frames] of [[[240, 160, 0], 4], [[255, 255, 255], 6]]) {
  for (let k = 0; k < frames; k++) {
   fill(rgb);
   r.frame(t += dt);
   const step = cgb.stepFrame(P, st, codes(rgb));
   st = step.state;
   const g = r.sample(...CENTER);
   worstS = Math.max(worstS, ...g.s.map((v, i) => Math.abs(v - st.s[i])));
   worstXYZ = Math.max(worstXYZ, ...g.xyz.map((v, i) => Math.abs(v - step.xyz[i]) / step.xyz[i]));
   if (g.start.some((v, i) => v !== st.start[i])) worstS = Infinity;
  }
 }
 done();
 return [result('Game Boy Color GPU = model (channel states)', worstS, 2e-5),
  result('Game Boy Color GPU = model (frame-average colour, relative)', worstXYZ, 1e-4)];
}


// ===========================================================================
// Vectrex: added-up lines on the GPU = lineLight in JavaScript
// ===========================================================================

export async function vectorParity() {
 const P = await profileOf('vectrex');
 const {renderer: r, done} = mount('vector', P);
 r.setBrightness(1);
 r.setVectors([[6, 10, 40, 10], [6, 10, 6, 80], [12, 30, 37, 64], [20, 50, 20.5, 50]]);
 r.frame(T0);
 let worst = 0;
 for (const [x, y] of [[23, 10], [6, 45], [40, 10], [6, 80], [24.5, 47], [20.5, 50], [30, 40], [12, 30]]) {
  const got = r.sample(x, y), want = r.modelSample(x, y);
  worst = Math.max(worst, Math.abs(got - want) / Math.max(want, .05));
 }
 done();
 return [result('Vectrex GPU = model (added-up line light, relative)', worst, 5e-3)];
}


// ===========================================================================
// CRT: steady emitted light on the GPU = steadyWindow in JavaScript
// ===========================================================================

/** Same erf approximation as the RASTER chunk's Phi. */
function Phi(x) {
 const t = 1 / (1 + .3275911 * Math.abs(x) / Math.SQRT2);
 const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-.5 * x * x);
 return .5 * (1 + Math.sign(x) * y);
}

export async function crtParity() {
 const out = [];
 for (const id of ['crt-5151-p39', 'crt-5151-p3', 'crt-1084s-p22']) {
  const P = await profileOf(id);
  const {renderer: r, done} = mount('crt', P);
  r.setContrast(1);
  r.setBrightness(0);
  const {width: W, height: H, pxPerMm} = r.info(), T = P.timing, dt = 100;

  // Full drive everywhere (black art on the TTL monitor, white art on the colour one),
  // long enough for the slowest decay to settle.
  const full = P.drive.mode === 'rgb' ? null : [0, 0, PANEL.w, PANEL.h];
  let t = T0, clock = 0;
  paint(r, full);
  r.frame(t);
  const settleFrames = Math.ceil(8 * Math.max(...P.phosphor.impulse.taus_s) / (dt / 1000));
  for (let k = 0; k < Math.min(settleFrames, 3000); k++) {
   paint(r, full);
   r.frame(t += dt);
   clock = (clock + dt / 1000) % T.frame_s;
  }

  // Excitation at one pixel, from the spot of every line that reaches it.
  // Full drive everywhere: every point's spot has the full-drive width (model.js spotSigmaMm).
  const pitch = H / T.lines_visible, sigma = crt.spotSigmaMm(P, 1) / (P.raster.height_mm / PANEL.h) * pxPerMm;
  let worst = 0;
  for (const [xMm, yMm] of [[24, 45], [12, 30], [36, 70]]) {
   const x = Math.floor(xMm * pxPerMm), y = H - 1 - Math.floor(yMm * pxPerMm);
   const yTop = H - (y + .5);
   let wx = 0;
   for (let dx = -2; dx <= 2; dx++) wx += Phi((dx + .5) / sigma) - Phi((dx - .5) / sigma);
   const n0 = Math.max(0, Math.floor((yTop - .5 - 4 * sigma) / pitch)), n1 = Math.min(T.lines_visible - 1, Math.floor((yTop + .5 + 4 * sigma) / pitch));
   let E = 0;
   for (let n = n0; n <= n1 && n <= n0 + 8; n++) {
    const yn = (n + .5) * pitch, w = Phi((yTop + .5 - yn) / sigma) - Phi((yTop - .5 - yn) / sigma);
    if (w >= 1e-6) E += w * wx;
   }
   E *= pitch;
   const line = Math.min(T.lines_visible - 1, Math.max(0, Math.floor(yTop / pitch)));
   const hitPhase = line * T.line_s + (x + .5) / W * T.active_s;
   const tSince = ((clock - hitPhase) % T.frame_s + T.frame_s) % T.frame_s;
   // Each layer against the model's light for that layer.
   const got = r.sampleLayers(xMm, yMm);
   P.phosphor.layers.forEach((_, layer) => {
    const expected = crt.steadyWindow(P, E, tSince, layer);
    worst = Math.max(worst, Math.abs(got[layer] - expected) / expected);
   });
  }
  done();
  out.push(result('CRT GPU = model per layer (steady light, relative), ' + id, worst, 3e-3));
 }
 return out;
}


// ===========================================================================
// Resize keeps the panel's state
// ===========================================================================

export async function resizeCarry() {
 const out = [];

 // TN: the director state at a point survives a resize exactly.
 {
  const P = await profileOf('reflective-tn');
  const {renderer: r, done} = mount('tn', P);
  r.setMode('static');
  paint(r);
  r.frame(T0);
  let t = T0;
  for (let k = 0; k < 6; k++) { paint(r, PATCH); r.frame(t += 16); }   // mid-switch: not at equilibrium
  const before = r.sample(...CENTER);
  r.resize(200, 385, 1);
  const after = r.sample(...CENTER);
  out.push({name: 'resize keeps TN state', ok: before > .05 && Math.abs(after - before) < 1e-6,
   detail: before.toFixed(5) + ' -> ' + after.toFixed(5)});
  done();
 }

 // CRT: the phosphor keeps its charge (a cold restart would show no light).
 {
  const P = await profileOf('crt-5151-p39');
  const {renderer: r, done} = mount('crt', P);
  let t = T0;
  for (let k = 0; k < 20; k++) { paint(r, [0, 0, PANEL.w, PANEL.h]); r.frame(t += 50); }
  const before = r.sample(...CENTER);
  r.resize(200, 385, 1);
  paint(r, [0, 0, PANEL.w, PANEL.h]);
  r.frame(t);                                                             // no time passes
  const after = r.sample(...CENTER);
  out.push({name: 'resize keeps CRT phosphor charge', ok: before > .1 && after > .8 * before,
   detail: before.toFixed(4) + ' -> ' + after.toFixed(4)});
  done();
 }
 return out;
}


// ===========================================================================
// CRT spot blooming: a brighter line is wider, by the measured power law
// ===========================================================================

/** Width (px, one standard deviation) of the scanline through the panel's
 * centre, from the emitted light across it (pixel box removed). */
function lineSigmaPx(r, P) {
 const {height: H, pxPerMm} = r.info(), pitch = H / P.timing.lines_visible;
 const n = Math.floor(P.timing.lines_visible / 2), centre = (n + .5) * pitch;  // from the top, px
 let sum = 0, mean = 0, second = 0;
 for (let y = Math.ceil(n * pitch); y < (n + 1) * pitch; y++) {
  const e = r.sample(24, (y + .5) / pxPerMm), d = y + .5 - centre;
  sum += e; mean += e * d; second += e * d * d;
 }
 mean /= sum;
 return Math.sqrt(second / sum - mean * mean - 1 / 12);
}

export async function spotBloom() {
 const P = await profileOf('crt-5151-p39');
 const {renderer: r, done} = mount('crt', P, [1300, 2500]);      // big enough to resolve one scanline
 const width = contrast => {
  r.setContrast(contrast);
  r.setBrightness(0);
  r.reset();
  let t = T0;
  for (let k = 0; k < 40; k++) { paint(r, [0, 0, PANEL.w, PANEL.h]); r.frame(t += 100); }
  return lineSigmaPx(r, P);
 };
 const full = width(1), third = width(1 / 3);
 const {pxPerMm} = r.info(), toPx = pxPerMm / (P.raster.height_mm / PANEL.h);
 done();
 const law = 3 ** P.spot.bloom.power;
 const expectedFull = crt.spotSigmaMm(P, 1) * toPx;
 return [
  result('CRT bloom: full / third-drive line width = (3)^power', Math.abs(full / third / law - 1), .05,
   ' (measured ' + (full / third).toFixed(3) + ', law ' + law.toFixed(3) + ')'),
  result('CRT bloom: full-drive line width = model spot', Math.abs(full / expectedFull - 1), .05,
   ' (' + full.toFixed(3) + ' px vs ' + expectedFull.toFixed(3) + ' px)')
 ];
}


export async function runAll() {
 return [...await contract(), ...await tnParity(), ...await dmgParity(), ...await cgbParity(), ...await vectorParity(), ...await crtParity(), ...await spotBloom(), ...await resizeCarry()];
}

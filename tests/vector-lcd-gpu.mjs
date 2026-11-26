/* Vector LCD GPU checks, run in a real browser by test_vector_lcd_browser.py.
 *
 * The node tests check each screen's physics in JavaScript (model.js). These
 * check that the GPU computes the same thing (shaders.js), that every renderer
 * meets the shared contract, and that a resize keeps the panel's state. */

import {KINDS, SCREENS} from '../vector-lcd/app/screens.js';
import {missingMembers} from '../vector-lcd/screens/contract.js';
import {parsePath} from '../vector-lcd/vector/geometry.js';

const PANEL = {w: 48, h: 92};
const CSS = [130, 250];
const T0 = 1000;

const tn = KINDS.tn, dmg = KINDS.dmg, crt = KINDS.crt, cgb = KINDS.cgb;


// ===========================================================================
// Helpers
// ===========================================================================

/** A screen's profile; the static TN is the engine's datasheet reference (reference/). */
async function profileOf(id) {
 const response = await fetch('/vector-lcd/' + (id === 'reflective-tn' ? 'reference/' : 'profiles/') + id + '.json');
 return response.json();
}

function mount(kind, profile, [w, h] = CSS) {
 const canvas = document.createElement('canvas');
 document.body.append(canvas);
 const renderer = KINDS[kind].createRenderer(canvas, {profile, widthMm: PANEL.w, heightMm: PANEL.h});
 renderer.resize(w, h, 1);
 // The reflector's grain is a fixed texture; the checks compare flat colours without it
 // (dmgGrain checks the grain itself).
 renderer.setGrain?.(false);
 return {renderer, canvas, done: () => { renderer.dispose(); canvas.remove(); }};
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
  const {renderer, done} = mount(screen.kind, await profileOf(screen.profile ?? screen.id));
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
 let st = {q: dmg.targetQ(P, 0, 1), ionic: 0, shade: 0}, shown = st.q;
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
// DMG-01 optics: flat areas keep the measured palette, edges average the
// panel's dots, and the reflector shadow falls away from the light
// ===========================================================================

/** Displayed sRGB (0..1) at a point (mm), read straight after a frame. */
function shownColour(renderer, canvas, xMm, yMm) {
 const gl = canvas.getContext('webgl2'), i = renderer.info(), px = new Uint8Array(4);
 gl.bindFramebuffer(gl.FRAMEBUFFER, null);
 gl.readPixels(Math.floor(xMm * i.pxPerMm), i.height - 1 - Math.floor(yMm * i.pxPerMm), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
 return [px[0] / 255, px[1] / 255, px[2] / 255];
}
const luma = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];

/** Hold one picture until the crystal has settled (a second of DMG frames). */
function settle(renderer, t, rect) {
 for (let k = 0; k < 20; k++) { paint(renderer, rect); renderer.frame(t += 50); }
 return t;
}

export async function dmgOptics() {
 const out = [];
 const P = await profileOf('dmg-01-stn');
 const canvas = document.createElement('canvas');
 document.body.append(canvas);
 const r = dmg.createRenderer(canvas, {profile: P, widthMm: PANEL.w, heightMm: PANEL.h});
 r.resize(...CSS, 1);
 r.setGrain(false);
 const dots = r.info().dotsPerPixel, pxPerMm = r.info().pxPerMm;
 const palette = P.palette.srgb8.shades.map(c => c.map(v => v / 255));

 // A flat white area shows the measured lightest shade (both passes through the same state).
 paint(r);
 r.frame(T0);
 const flat = shownColour(r, canvas, ...CENTER);
 const worstFlat = Math.max(...flat.map((v, k) => Math.abs(v - palette[0][k])));
 out.push(result('DMG-01 flat area = measured palette', worstFlat, 1.5 / 255, ' (' + dots + ' × ' + dots + ' dots per pixel)'));

 // An edge half-way across a screen pixel shows the average of its dots: a
 // colour between the shades, not a step to one of them. A small light from the
 // top shifts the entry point along the edge only, so both passes stay on the
 // same side of it (angled light across an edge lights it too: the shadow's twin).
 r.setLighting({angleDeg: 40, azimuthDeg: 0, sourceDeg: .5});
 const edgeMm = (Math.floor(CENTER[0] * pxPerMm) + .5) / pxPerMm;
 let t = settle(r, T0, [edgeMm, 20, 10, 50]);
 const edge = shownColour(r, canvas, edgeMm, CENTER[1]);
 // Half the dots white, half black: the linear-light mean of the two palette colours.
 const lin = v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
 const enc = v => v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055;
 const mix = palette[0].map((v, k) => enc((lin(v) + lin(palette[3][k])) / 2));
 const worstEdge = Math.max(...edge.map((v, k) => Math.abs(v - mix[k])));
 out.push({name: 'DMG-01 edge pixel averages its dots', ok: dots > 1 && worstEdge <= 2.5 / 255,
  detail: 'worst ' + (worstEdge * 255).toFixed(1) + '/255 from the half-white, half-black mix, ' + dots + ' × ' + dots + ' dots'});

 // The shadow falls away from the light, and follows it round.
 const [x, y, w, h] = PATCH, gap = .3;
 const sides = azimuthDeg => {
  r.setLighting({angleDeg: 45, azimuthDeg, sourceDeg: 15});
  t = settle(r, t, PATCH);
  return [luma(shownColour(r, canvas, x - gap, y + h / 2)), luma(shownColour(r, canvas, x + w + gap, y + h / 2))];
 };
 const [leftUL, rightUL] = sides(315), [leftLR, rightLR] = sides(135);
 out.push({name: 'DMG-01 reflector shadow falls away from the light', ok: rightUL < leftUL - 2 / 255 && leftLR < rightLR - 2 / 255,
  detail: 'light upper left: left ' + leftUL.toFixed(3) + ', right ' + rightUL.toFixed(3)
   + '; lower right: left ' + leftLR.toFixed(3) + ', right ' + rightLR.toFixed(3)});

 // Inspection: with the shadow off both sides show the flat palette, however the light falls.
 r.setShadow(false);
 const [leftOff, rightOff] = sides(315);
 const flatLuma = luma(palette[0]);
 out.push({name: 'DMG-01 shadow switched off: no shadow either side', ok: Math.abs(leftOff - flatLuma) < 1.5 / 255 && Math.abs(rightOff - flatLuma) < 1.5 / 255,
  detail: 'left ' + leftOff.toFixed(3) + ', right ' + rightOff.toFixed(3) + ', flat ' + flatLuma.toFixed(3)});
 r.setShadow(true);

 r.dispose();
 canvas.remove();
 return out;
}


// ===========================================================================
// DMG-01 vector input: each dot gets the drive level of the shape at its centre
// ===========================================================================

export async function dmgVector() {
 const P = await profileOf('dmg-01-stn');
 const {renderer: r, done} = mount('dmgv', P);
 const fill = (d, value, rule = 'nonzero') => ({fill: {subpaths: parsePath(d), rule, value}, stroke: null});
 const ring = 'M24 30a12 12 0 1 0 0.001 0ZM24 36a6 6 0 1 0 0.001 0Z';     // centre (24, 42), hole radius 6
 const scene = [
  {shape: fill(ring, 2, 'evenodd'), matrix: [1, 0, 0, 1, 0, 0]},
  {shape: fill('M30 50h10v10h-10Z', 3), matrix: [1, 0, 0, 1, 0, 0]},                 // over the ring's lower right
  {shape: fill('M0 0h4v4h-4Z', 1), matrix: [1, 0, 0, 1, 10, 70]},                    // placed by its matrix
  {shape: {fill: null, stroke: {subpaths: parsePath('M5 85H43'), width: .5, cap: 'butt', join: 'miter', miterLimit: 4, value: 3}},
   matrix: [1, 0, 0, 1, 0, 0]}
 ];
 r.setScene(scene);
 let t = T0;
 for (let k = 0; k < 5; k++) r.frame(t += 50);
 const probes = [
  ['outside', 4, 4, 0], ['ring', 24, 33, 2], ['hole (evenodd)', 24, 42, 0], ['square over ring', 33, 52, 3],
  ['square outside ring', 39, 59, 3], ['placed by matrix', 12, 72, 1], ['stroke', 20, 85, 3], ['beside stroke', 20, 86, 0]
 ];
 const wrong = probes.filter(([, x, y, want]) => r.sample(x, y).shade !== want).map(([name, x, y, want]) => name + ' ' + r.sample(x, y).shade + '≠' + want);
 done();
 return [{name: 'DMG-01 vector input: drive levels exactly where the shapes are', ok: wrong.length === 0,
  detail: wrong.join(', ') || probes.length + ' probes: fills, an evenodd hole, overlap order, a matrix, a stroke'}];
}


// ===========================================================================
// DMG-01 vector input, memory per pixel: same physics, edges fine at any size
// ===========================================================================

const rectShape = (x, y, w, h, value) => ({fill: {subpaths: parsePath(`M${x} ${y}h${w}v${h}h${-w}Z`), rule: 'nonzero', value}, stroke: null});

/** A flat pixel follows the DMG-01's stepFrame exactly (each level's state is a dot's). */
export async function dmgvParity() {
 const P = await profileOf('dmg-01-stn');
 const {renderer: r, done} = mount('dmgv', P);
 r.setTemperature(25);
 r.setContrast(1);
 const options = {contrast: 1, celsius: 25}, dt = 23, patch = rectShape(...PATCH, 3);
 r.setScene([]);
 r.frame(T0);
 let st = {q: dmg.targetQ(P, 0, 1), ionic: 0, shade: 0}, shown = st.q;
 let phase = 0, t = T0, worst = 0;
 for (let k = 0; k < 90; k++) {
  const shade = k < 45 ? 3 : 0;
  r.setScene(shade ? [{shape: patch, matrix: [1, 0, 0, 1, 0, 0]}] : []);
  r.frame(t += dt);
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
 return [result('DMG vector GPU = model, memory per pixel (q, ions, shown light)', worst, 2e-3)];
}

/** A moving edge: every point keeps its own history, as a dot of the panel does
 * (stepFrame per point, driven by the level the GPU drew at that point). */
export async function dmgvMovingEdge() {
 const P = await profileOf('dmg-01-stn');
 const {renderer: r, done} = mount('dmgv', P);
 r.setTemperature(25);
 r.setContrast(1);
 const {pxPerMm, pointsPerPixel: n} = r.info(), px = 1 / pxPerMm, options = {contrast: 1, celsius: 25}, dt = 23;
 const x0 = (Math.floor(CENTER[0] * pxPerMm)) / pxPerMm, scene = x => [{shape: rectShape(x, CENTER[1] - 5, 10, 10, 3), matrix: [1, 0, 0, 1, 0, 0]}];
 let t = T0, phase = 0, worst = 0, models = null, mixedFrames = 0;
 r.setScene(scene(x0 + 1.2 * px));
 r.frame(t);
 for (let k = 0; k < 80; k++) {
  // The edge sweeps left across the pixel, then holds.
  r.setScene(scene(x0 + Math.max(-.2, 1.2 - k * .03) * px));
  r.frame(t += dt);
  phase += dt * P.panel.refresh_hz / 1000;
  const steps = Math.min(8, Math.floor(phase));
  phase = Math.min(phase - steps, 1);
  const g = r.sample(x0 + .5 * px, CENTER[1]);
  if (!models) { models = g.points.map(p => ({q: p.q, ionic: 0, shade: p.level})); continue; }
  if (steps > 0) models = models.map((m, i) => { let st = m; for (let s = 0; s < steps; s++) st = dmg.stepFrame(P, st, g.points[i].level, options); return st; });
  if (new Set(g.points.map(p => p.level)).size > 1) mixedFrames++;
  g.points.forEach((p, i) => { worst = Math.max(worst, Math.abs(p.q - models[i].q)); });
 }
 done();
 return [{...result('DMG vector moving edge: every point follows its own dot history (q)', worst, 2e-3),
  detail: 'worst q error ' + worst.toExponential(2) + ' over 80 frames; ' + n + ' × ' + n + ' points; edge inside the pixel for ' + mixedFrames + ' frames'}];
}

/** The wheel turned down to x0.85 under a black square: the part-switched rest is
 * temporary, and every point gives way on the same frame as the model's
 * (stepFrame, then settleTemporary with the same draw). */
export async function dmgvFade() {
 const P = await profileOf('dmg-01-stn');
 const {renderer: r, done} = mount('dmgv', P);
 r.setTemperature(25);
 r.setContrast(1);
 r.setScene([{shape: rectShape(CENTER[0] - 5, CENTER[1] - 5, 10, 10, 3), matrix: [1, 0, 0, 1, 0, 0]}]);
 let t = T0, worst = 0, models = null, flipped = 0;
 const dt = 23, options = {contrast: .85, celsius: 25};
 for (let k = 0; k < 40; k++) r.frame(t += dt);
 r.setContrast(.85);
 const before = r.sample(...CENTER);
 let frame = before.frame;
 models = before.points.map(p => ({q: p.q, ionic: before.ionic, shade: p.level}));
 for (let k = 0; k < 90; k++) {
  r.frame(t += dt);
  // The renderer's own DMG frame count says how many frames this update ran.
  const g = r.sample(...CENTER), [x, y] = g.texel, f0 = frame, steps = (g.frame - frame) >>> 0;
  frame = g.frame;
  if (steps > 0) models = models.map((m, i) => {
   let st = m;
   for (let s = 0; s < steps; s++) st = dmg.stepFrame(P, st, g.points[i].level, options);
   const q = dmg.settleTemporary(P, st.q, g.points[i].level, steps, dmg.decayDraw(x, y, i, f0), options);
   if (q !== st.q) flipped++;
   return {...st, q};
  });
  g.points.forEach((p, i) => { worst = Math.max(worst, Math.abs(p.q - models[i].q)); });
 }
 const after = r.sample(...CENTER);
 done();
 const n = after.points.length, settled = after.points.filter(p => Math.abs(p.q - dmg.targetQ(P, 3, .85)) < .01).length;
 return [{...result('DMG vector wheel turned down: the temporary state fades point by point = model (q)', worst, 2e-3),
  detail: 'worst q error ' + worst.toExponential(2) + '; ' + flipped + ' of ' + n + ' points gave way in the model; ' + settled + ' of ' + n + ' relaxed after 2 s'},
  {name: 'DMG vector wheel turned down: no lasting ghost (every point relaxed within 2 s)', ok: settled === n, detail: settled + ' of ' + n}];
}

/** The reflector's grain on a flat white area = model.js reflectorGrain at each
 * pixel (the ratio of the colour with and without it), for both DMG screens. */
export async function dmgGrain() {
 const P = await profileOf('dmg-01-stn'), out = [];
 const linear = v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
 for (const kind of ['dmg', 'dmgv']) {
  const {renderer: r, canvas, done} = mount(kind, P);
  r.setTemperature(25);
  r.setShadow(false);
  let t = T0;
  const show = () => { if (kind === 'dmgv') r.setScene([]); else paint(r); r.frame(t += 23); };
  for (let k = 0; k < 6; k++) show();
  const {pxPerMm} = r.info(), y = CENTER[1], xs = Array.from({length: 40}, (_, i) => CENTER[0] - 4 + i * .2);
  // Pixel centres, in panel mm, where the shader evaluates the grain.
  const at = x => (Math.floor(x * pxPerMm) + .5) / pxPerMm, yc = (Math.floor(y * pxPerMm) + .5) / pxPerMm;
  show();
  const plain = xs.map(x => shownColour(r, canvas, x, y));
  r.setGrain(true);
  show();
  const grained = xs.map(x => shownColour(r, canvas, x, y));
  done();
  let worst = 0, spread = 0;
  xs.forEach((x, i) => {
   const ratio = linear(grained[i][1]) / linear(plain[i][1]), model = dmg.reflectorGrain(P, at(x), yc, 1 / pxPerMm);
   worst = Math.max(worst, Math.abs(ratio - model));
   spread = Math.max(spread, Math.abs(model - 1));
  });
  out.push({...result((kind === 'dmg' ? 'DMG-01' : 'DMG vector') + ' reflector grain = model (ratio on flat white)', worst, .012),
   detail: 'worst ' + worst.toExponential(2) + ' (8-bit output); grain up to ±' + (100 * spread).toFixed(1) + '% at ' + pxPerMm.toFixed(1) + ' px/mm'});
 }
 return out;
}

/** Lens scratches (condition 'used'): the light they add = optics/scratches.js
 * at every pixel of a band, on both DMG screens (shadow and grain off, blank panel). */
export async function dmgScratches() {
 const P = await profileOf('dmg-01-stn'), out = [];
 const S = await import('../vector-lcd/optics/scratches.js'), R = await import('../vector-lcd/optics/room.js');
 const linear = v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
 for (const kind of ['dmg', 'dmgv']) {
  const {renderer: r, canvas, done} = mount(kind, P, [400, 760]);
  r.setTemperature(25);
  r.setShadow(false);
  const light = {angleDeg: 35, azimuthDeg: 300, sourceDeg: 15};
  r.setLighting(light);
  let t = T0;
  const show = () => { if (kind === 'dmgv') r.setScene([]); else paint(r); r.frame(t += 23); };
  const grab = () => {
   show();
   const gl = canvas.getContext('webgl2'), i = r.info(), px = new Uint8Array(i.width * i.height * 4);
   gl.bindFramebuffer(gl.FRAMEBUFFER, null);
   gl.readPixels(0, 0, i.width, i.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
   return px;
  };
  for (let k = 0; k < 6; k++) show();
  const plain = grab();
  r.setCondition('used');
  const used = grab();
  const i = r.info(), pxPerMm = i.pxPerMm, W = i.width, H = i.height, pack = S.lensScratches(P, 'used', [PANEL.w, PANEL.h]);
  const view = r.viewing, lit = r.lighting, e = R.directionVector(view.polarDeg, view.azimuthDeg), D = view.distanceMm;
  const eye = [W / pxPerMm / 2 + e[0] * D, H / pxPerMm / 2 + e[1] * D, e[2] * D], l = R.directionVector(lit.angleDeg, lit.azimuthDeg);
  const sigma = R.glareSigma(lit.sourceDeg), norm = R.glareNorm(sigma, lit.angleDeg), lensH = P.lens.gap_mm + P.lens.thickness_mm;
  let worst = 0, glints = 0, compared = 0, sum = 0;
  const errs = [];
  done();
  for (let row = 0; row < H; row++) for (let col = 0; col < W; col++) {
   const o = (row * W + col) * 4, a = linear(plain[o + 1] / 255), b = linear(used[o + 1] / 255);
   if (a > .8 || b > .8) continue;                    // clipped near the lamp's reflection
   const x = (col + .5) / pxPerMm, y = (H - row - .5) / pxPerMm;
   let v = [eye[0] - x, eye[1] - y, eye[2]];
   const vl = Math.hypot(...v); v = v.map(c => c / vl);
   const want = lit.exposure * S.scratchesGlint(pack, x + lensH * v[0] / v[2], y + lensH * v[1] / v[2], 1 / pxPerMm, v, l, sigma, norm, P.lens.n);
   // In 8-bit screen codes: the plain pixel plus the model's glint, against the scratched pixel.
   const enc = x => 255 * (x <= .0031308 ? 12.92 * x : 1.055 * Math.pow(Math.min(x, 1), 1 / 2.4) - .055);
   const err = Math.abs(enc(a + want) - used[o + 1]);
   errs.push(err); sum += Math.abs((b - a) - want);
   worst = Math.max(worst, err);
   if (want > .005) glints++;
   compared++;
  }
  // Groove edges are sharp: a pixel an edge cuts is as sensitive as it gets, so the bar is
  // 99.9% of pixels within 1.5 codes and the mean within the 8-bit step, not one worst pixel.
  errs.sort((x, y) => x - y);
  const p999 = errs[Math.floor(errs.length * .999)], mean = sum / compared;
  out.push({name: (kind === 'dmg' ? 'DMG-01' : 'DMG vector') + ' lens scratches = model (light added per pixel)', ok: p999 <= 1.5 && mean < .002,
   detail: '99.9% within ' + p999.toFixed(2) + ' codes (worst ' + worst.toFixed(2) + '), mean ' + mean.toExponential(2) + ' over ' + compared + ' pixels, ' + glints + ' glinting'},
   {name: (kind === 'dmg' ? 'DMG-01' : 'DMG vector') + ' lens scratches: some glint at this light', ok: glints > 0, detail: glints + ' pixels'});
 }
 return out;
}

/** LCD power: both DMG renderers follow the model off and back on (shown light). */
export async function dmgPower() {
 const P = await profileOf('dmg-01-stn'), out = [];
 for (const kind of ['dmg', 'dmgv']) {
  const {renderer: r, done} = mount(kind, P);
  r.setTemperature(25);
  r.setContrast(1);
  const options = {contrast: 1, celsius: 25}, dt = 23;
  const content = kind === 'dmgv' ? () => r.setScene([{shape: rectShape(...PATCH, 3), matrix: [1, 0, 0, 1, 0, 0]}]) : () => paint(r, PATCH);
  let t = T0;
  content();
  r.frame(t);   // settles to the patch (black)
  let st = {q: dmg.targetQ(P, 3, 1), ionic: 0, shade: 3}, phase = 0, worst = 0, shown = 0;
  for (let k = 0; k < 160; k++) {
   const power = k < 20 || k >= 90;
   r.setPower(power);
   content();
   r.frame(t += dt);
   phase += dt * P.panel.refresh_hz / 1000;
   const steps = Math.min(8, Math.floor(phase));
   phase = Math.min(phase - steps, 1);
   if (steps > 0) { let sum = 0; for (let i = 0; i < steps; i++) { st = dmg.stepFrame(P, st, st.shade, {...options, power}); sum += st.exposure; } shown = sum / steps; }
   if (k > 0) worst = Math.max(worst, Math.abs(r.sample(...CENTER).shown - shown));
  }
  done();
  out.push({...result((kind === 'dmg' ? 'DMG-01' : 'DMG vector') + ' LCD off and on = model (shown light)', worst, 3e-3), detail: 'worst ' + worst.toExponential(2) + ' through 1.6 s off and 1.6 s back on'});
 }
 return out;
}

/** An edge across a screen pixel shows the two levels mixed by coverage, small or enlarged: no steps. */
export async function dmgvEdges() {
 const out = [];
 const P = await profileOf('dmg-01-stn');
 const palette = P.palette.srgb8.shades.map(c => c.map(v => v / 255));
 const lin = v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
 const enc = v => v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055;
 for (const css of [[130, 250], [700, 1342]]) {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const r = KINDS.dmgv.createRenderer(canvas, {profile: P, widthMm: PANEL.w, heightMm: PANEL.h});
  r.resize(...css, 1);
  r.setGrain(false);
  r.setShadow(false);
  r.setLighting({angleDeg: 40, azimuthDeg: 0, sourceDeg: .5});
  const {pxPerMm, pointsPerPixel: n} = r.info();
  const edgeMm = (Math.floor(CENTER[0] * pxPerMm) + .5) / pxPerMm;
  let t = T0;
  for (let k = 0; k < 20; k++) { r.setScene([{shape: rectShape(edgeMm, 20, 10, 50, 3), matrix: [1, 0, 0, 1, 0, 0]}]); r.frame(t += 50); }
  const edge = shownColour(r, canvas, edgeMm, CENTER[1]);
  const flat = shownColour(r, canvas, edgeMm + 2, CENTER[1]);
  // The mix the pixel's points call for: white and black in proportion to their coverage.
  const cover = r.sample(edgeMm, CENTER[1]).coverage;
  const want = palette[0].map((v, k) => enc(cover[0] * lin(v) + cover[3] * lin(palette[3][k])));
  const worst = Math.max(...edge.map((v, k) => Math.abs(v - want[k])));
  const flatErr = Math.max(...flat.map((v, k) => Math.abs(v - palette[3][k])));
  const mixed = cover[0] > 0 && cover[3] > 0 && cover[0] + cover[3] > .999;
  out.push({name: 'DMG vector edge pixel mixes by coverage at ' + css.join('×') + ' px', ok: mixed && worst <= 2 / 255 && flatErr <= 1.5 / 255,
   detail: 'coverage white ' + cover[0].toFixed(3) + ' / black ' + cover[3].toFixed(3) + '; edge ' + (worst * 255).toFixed(1) + '/255 from that mix, inside '
    + (flatErr * 255).toFixed(1) + '/255 from black; ' + n + ' × ' + n + ' points per pixel at ' + pxPerMm.toFixed(1) + ' px/mm'});
  r.dispose();
  canvas.remove();
 }
 return out;
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
 return [...await contract(), ...await tnParity(), ...await dmgParity(), ...await dmgOptics(), ...await dmgVector(), ...await dmgvParity(), ...await dmgvMovingEdge(), ...await dmgvFade(), ...await dmgGrain(), ...await dmgScratches(), ...await dmgPower(), ...await dmgvEdges(), ...await cgbParity(), ...await vectorParity(), ...await crtParity(), ...await spotBloom(), ...await resizeCarry()];
}

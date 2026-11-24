#!/usr/bin/env node
/* The DMG-01 contrast wheel, solved at every 0.01 of its travel.
 *
 *   node tools/dmg01_wheel.mjs /path/to/retro-display-lab
 *
 * Retro Display Lab (Apache-2.0, copyright 2026 JohnnySun; see
 * ../third_party/retro-display-lab/NOTICE) tabulates its STN surrogate at three
 * drive scales, 0.88, 1.00 and 1.08, and interpolates linearly between them. Its
 * own solver shows the panel's picture fading in between 0.92 and 1.00, a range
 * the three points skip: a straight line there blanks the picture at 0.99. And
 * its optical calibration clamps any luminance outside the four nominal shades,
 * so turning the wheel up flattens every shade to black.
 *
 * This tool runs the same solver (models/nintendo-dmg-01/reference/stn-physics.mjs)
 * and the same table construction as tools/build-dmg01-stn-physics.mjs, with two
 * changes, and patches profiles/dmg-01-stn.json:
 *   1. drive scales every 0.01 from 0.85 to 1.08. The low end is a repairer's
 *      measurement of a real board, -11 V at one end of the wheel against -13 V
 *      for good contrast (chipmusic.org, 2015); the high end, -14 V, agrees with
 *      the source's 1.08. The director coordinate spans the 0.85 and 1.08 bounds.
 *   2. luminance beyond the nominal white or black continues the calibration
 *      linearly (optical states below 0.25 or above 1) instead of clamping.
 *   3. the drift is also sampled along real trajectories from the fully relaxed and
 *      the fully switched states, which the source never simulates; without them a
 *      pixel relaxed at a low wheel setting stays stuck when the wheel comes back.
 *   4. two resting states. Below about x1.00 the solver has two resting states for
 *      some shades: relaxed (reached from the unpowered panel) and part-switched
 *      (reached from the normal drive, i.e. after the wheel is turned down). Both
 *      are solved at every position; the one with the lower free energy is stable
 *      (stn.target_q) and the other temporary (stn.meta_q, -1 where there is one
 *      state). The director coordinate runs through solved states only: the
 *      unpowered rest (0), every resting state on both branches, and the source's
 *      high-bound black (1). Only between the two branches is it a blend.
 *   5. colour from the solver's spectrum. The source computes the reflected
 *      spectrum (Jones matrices at 15 wavelengths) but keeps only its luminance.
 *      Here its CIE XYZ at every coordinate becomes the colour, through one 3 x 3
 *      matrix fitted (least squares) to BGB's five measured colours, with the
 *      dot gaps (which show the unpowered colour) taken out of BGB's averages;
 *      the small residual at the five anchors is spread linearly between them
 *      so the measured colours come out exactly (stn.color).
 * The material, drive reduction, solver, time step and frame period are the
 * source's, unchanged; the tables are four times finer (257 bins, not 65); equilibria near the threshold get longer to
 * converge (60 s, not 5 s). */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = process.argv[2];
if (!root) { console.error('usage: node tools/dmg01_wheel.mjs /path/to/retro-display-lab'); process.exit(2); }
const model = path.join(root, 'models', 'nintendo-dmg-01');
const R = await import(path.join(model, 'reference', 'stn-physics.mjs'));
const drive = JSON.parse(fs.readFileSync(path.join(model, 'data', 'dmg-drive-v1.json'), 'utf8'));
const ensemble = JSON.parse(fs.readFileSync(path.join(model, 'data', 'stn-material-ensemble-v1.json'), 'utf8'));

// The source's solver settings (tools/build-dmg01-stn-physics.mjs).
const frameSeconds = 1 / drive.panel.refreshHz, timestepSeconds = 1e-4;
// Near the switching threshold the crystal settles slowly (the drive barely exceeds the
// elastic restoring torque), so equilibria get up to 60 s instead of the source's 5 s;
// the convergence test is the source's.
const minimumEquilibriumSeconds = .8, maximumEquilibriumSeconds = 60, equilibriumChunkSeconds = .2, tolerance = 1e-7;
// The source tabulates 65 bins. The four normal shades lie within 0.06 of the coordinate,
// white and light grey 1.4 of those bins apart, so the speed near them hung on where the bins
// fell; 257 bins (four times finer) resolve them.
const transitionSeconds = 1.2, driftBins = 257, opticalBins = 257;

// The wheel: every 0.01 from the measured low end to the source's high end.
const LOW = .85, HIGH = 1.08;
const SCALES = Array.from({length: Math.round((HIGH - LOW) / .01) + 1}, (_, i) => Math.round((LOW + i * .01) * 100) / 100);

const round = (v, d = 10) => Number(v.toFixed(d));
const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'profiles', 'dmg-01-stn.json');
let profileCache = null;
const P0 = () => profileCache ??= JSON.parse(fs.readFileSync(file, 'utf8'));
const clampUnit = v => Math.min(1, Math.max(0, v));
const material = R.materialToSI(ensemble.members.find(m => m.id === 'nominal'), ensemble.sharedGeometry);


// ---- Equilibria (as the source) -------------------------------------------------

function solveEquilibrium(volts, start = R.initialDirector(material, 17)) {
 let state = {theta: [...start.theta], phi: [...start.phi]}, elapsed = 0, residual = Infinity;
 while (elapsed < maximumEquilibriumSeconds - 1e-12) {
  const d = Math.min(equilibriumChunkSeconds, maximumEquilibriumSeconds - elapsed);
  const next = R.integrateDirector(state, material, volts, d, {timestepSeconds, sampleSeconds: .05}).state;
  residual = Math.max(...state.theta.map((v, i) => Math.abs(next.theta[i] - v)), ...state.phi.map((v, i) => Math.abs(next.phi[i] - v)));
  state = next; elapsed += d;
  if (elapsed + 1e-12 >= minimumEquilibriumSeconds && residual <= tolerance) break;
 }
 if (residual > tolerance) throw new Error('equilibrium did not converge at ' + volts + ' V');
 return state;
}
const solveEquilibria = (scale, starts = []) => R.shadeRmsVoltages(drive, scale).map((rmsVolts, shadeIndex) => {
 const state = solveEquilibrium(rmsVolts, starts[shadeIndex]);
 return {shadeIndex, rmsVolts, state, optical: R.opticalObservation(state, material), energy: R.freeEnergy(state, material, rmsVolts)};
});


// ---- Calibration: the source's, continued beyond the nominal shades -------------

const nominal = solveEquilibria(1);
const L = nominal.map(e => e.optical.luminance);           // white .. black, decreasing
if (!L.every((v, i) => !i || v < L[i - 1])) throw new Error('nominal luminance is not monotonic');
const base = R.buildOpticalCalibration(nominal);
const calibration = {
 stateForLuminance(lum) {
  if (lum > L[0]) return .25 - .25 * (lum - L[0]) / (L[0] - L[1]);
  if (lum < L[3]) return 1 + .25 * (L[3] - lum) / (L[2] - L[3]);
  return base.stateForLuminance(lum);
 }
};

const order = s => s.theta.reduce((a, t) => a + Math.sin(t) ** 2, 0) / s.theta.length;
// Every resting state at every wheel position, from the unpowered panel (relaxed) and
// from the normal drive (the wheel turned from x1.00): both branches, all solved.
const unpowered = {state: solveEquilibrium(0), rmsVolts: 0};
unpowered.optical = R.opticalObservation(unpowered.state, material);
const SAME = .01;                  // order difference below which two rests are one state
const rests = [];
for (const scale of SCALES) {
 const t0 = Date.now(), relaxed = solveEquilibria(scale), driven = solveEquilibria(scale, nominal.map(e => e.state));
 rests.push({scale, relaxed, driven});
 console.log('rests x' + scale.toFixed(2), relaxed.map((e, i) => order(e.state).toFixed(3) + '/' + order(driven[i].state).toFixed(3)).join(' '), '(' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
}
const highBound = rests.at(-1).relaxed;
const qMin = order(unpowered.state), qMax = order(highBound[3].state);
const normalize = s => (order(s) - qMin) / (qMax - qMin);
const knots = [unpowered, ...nominal, ...rests.flatMap(r => [...r.relaxed, ...r.driven])]
 .filter(e => normalize(e.state) >= -1e-9 && normalize(e.state) <= 1 + 1e-9)
 .sort((a, b) => order(a.state) - order(b.state));
const manifold = knots.filter((e, i) => !i || order(e.state) - order(knots[i - 1].state) > 2e-4);

const manifoldQ = manifold.map(e => normalize(e.state));
function manifoldState(coordinate) {
 const q = clampUnit(coordinate), knots = manifoldQ;
 let low = 0;
 while (low < knots.length - 2 && q > knots[low + 1]) low++;
 const mix = clampUnit((q - knots[low]) / Math.max(knots[low + 1] - knots[low], 1e-12));
 const a = manifold[low].state, b = manifold[low + 1].state;
 return {theta: a.theta.map((v, i) => v + (b.theta[i] - v) * mix), phi: a.phi.map((v, i) => v + (b.phi[i] - v) * mix)};
}

const opticalLut = Array.from({length: opticalBins}, (_, i) =>
 round(calibration.stateForLuminance(R.opticalObservation(manifoldState(i / (opticalBins - 1)), material).luminance), 12));
const lookup = (lut, q) => {
 const p = clampUnit(q) * (lut.length - 1), lo = Math.min(Math.floor(p), lut.length - 2);
 return lut[lo] + (lut[lo + 1] - lut[lo]) * (p - lo);
};
const anchors = nominal.map(e => round(normalize(e.state), 9));
const corrections = anchors.map((q, i) => round([.25, .5, .75, 1][i] - lookup(opticalLut, q), 12));


// ---- Conditions: equilibria, transitions and per-frame drift (as the source) ----

function transition(eq, from, to) {
 const result = R.integrateDirector(eq[from].state, material, eq[to].rmsVolts, transitionSeconds, {timestepSeconds, sampleSeconds: frameSeconds});
 return {from, to, samples: [normalize(eq[from].state), ...result.samples.map(s => normalize(s.director))]};
}

/* The source samples only transitions between one wheel position's own four
 * shades, so the drift far below or above them (where the panel rests after the
 * wheel has been turned to an end) comes from the interpolated manifold alone,
 * which leaves a false resting point near the bottom: a pixel relaxed at a low
 * wheel setting never switches again. Real trajectories close the gap: from the
 * fully relaxed state (the low bound's white) and the fully switched state (the
 * high bound's black) to every shade, long enough to finish switching near the
 * threshold. */
const EXTREME_SECONDS = 4;
function fromExtreme(state, eq, to) {
 const result = R.integrateDirector(state, material, eq[to].rmsVolts, EXTREME_SECONDS, {timestepSeconds, sampleSeconds: frameSeconds});
 return {from: -1, to, samples: [normalize(state), ...result.samples.map(s => normalize(s.director))]};
}

function driftTable(eq, transitions, meta) {
 const deltas = [];
 for (let t = 0; t < 4; t++) for (let bin = 0; bin < driftBins; bin++) {
  const q = bin / (driftBins - 1);
  const next = R.integrateDirector(manifoldState(q), material, eq[t].rmsVolts, frameSeconds, {timestepSeconds}).state;
  deltas.push(round(clampUnit(normalize(next)) - q, 12));
 }
 // The source's correction: drift sampled along the full transition trajectories.
 for (let t = 0; t < 4; t++) {
  const sums = new Array(driftBins).fill(0), counts = new Array(driftBins).fill(0);
  for (const tr of transitions.filter(x => x.to === t && x.from !== t)) {
   for (let i = 0; i < tr.samples.length - 1; i++) {
    const cur = clampUnit(tr.samples[i]), next = clampUnit(tr.samples[i + 1]), bin = Math.round(cur * (driftBins - 1));
    sums[bin] += next - cur; counts[bin]++;
   }
  }
  const seen = counts.map((c, i) => c ? i : -1).filter(i => i >= 0);
  if (seen.length) for (let bin = seen[0]; bin <= seen.at(-1); bin++) {
   let lo = seen[0], hi = seen.at(-1);
   for (const s of seen) { if (s <= bin) lo = s; if (s >= bin) { hi = s; break; } }
   const a = sums[lo] / counts[lo], b = sums[hi] / counts[hi], mix = hi === lo ? 0 : (bin - lo) / (hi - lo);
   deltas[t * driftBins + bin] = round(a + (b - a) * mix, 12);
  }
  // Anchor each resting state (the stable one, and any temporary one) as a fixed point of the drift.
  for (const rest of [eq[t], meta[t]].filter(Boolean)) {
   const target = normalize(rest.state), offset = lookup(deltas.slice(t * driftBins, (t + 1) * driftBins), target);
   const radius = 4 / (driftBins - 1);
   const weights = Array.from({length: driftBins}, (_, bin) => Math.max(0, 1 - Math.abs(bin / (driftBins - 1) - target) / radius));
   const atTarget = lookup(weights, target);
   for (let bin = 0; bin < driftBins; bin++) deltas[t * driftBins + bin] = round(deltas[t * driftBins + bin] - offset * weights[bin] / atTarget, 12);
  }
 }
 return deltas;
}

const targetQ = [], metaQ = [], drift = [], report = [];
for (const {scale, relaxed, driven} of rests) {
 const t0 = Date.now(), transitions = [];
 // Per shade: one resting state, or two; then the lower free energy is the stable one.
 const pairs = relaxed.map((r, i) => {
  const d = driven[i];
  if (Math.abs(order(r.state) - order(d.state)) < SAME) return {stable: r, meta: null};
  return r.energy <= d.energy ? {stable: r, meta: d} : {stable: d, meta: r};
 });
 const eq = pairs.map(p => p.stable), meta = pairs.map(p => p.meta);
 for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) transitions.push(transition(eq, a, b));
 for (let b = 0; b < 4; b++) transitions.push(fromExtreme(unpowered.state, eq, b), fromExtreme(highBound[3].state, eq, b));
 // The wheel turned from x1.00: the path from each normal shade to its rest here.
 for (let b = 0; b < 4; b++) transitions.push(fromExtreme(nominal[b].state, eq, b));
 targetQ.push(...eq.map(e => round(normalize(e.state), 9)));
 metaQ.push(...meta.map(e => e ? round(normalize(e.state), 9) : -1));
 drift.push(...driftTable(eq, transitions, meta));
 const states = eq.map(e => round(calibration.stateForLuminance(e.optical.luminance), 4));
 report.push({scale, volts: eq.map(e => round(e.rmsVolts, 3)), luminance: eq.map(e => round(e.optical.luminance / L[0], 4)), states,
  temporary: meta.map((m, i) => m ? {q: round(normalize(m.state), 4), luminance: round(m.optical.luminance / L[0], 4), energy_above_stable_J_m2: round(m.energy - eq[i].energy, 12)} : null)});
 console.log('x' + scale.toFixed(2), 'optical states', states.join(' '), 'temporary', meta.map(m => m ? normalize(m.state).toFixed(3) : '-').join(' '), '(' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
}


// ---- How long a temporary resting state lasts ------------------------------------

/* The solver follows one column of crystal, so it keeps a temporary state forever.
 * In a real cell the stable state nucleates at defects and spreads across the dot.
 * No lifetime is published for this STN; metastable twisted textures erase this way
 * in 0.1 to 1 s depending on the cell gap (bistable nematic cell patent, US 6,867,836).
 * Assumed: 0.3 s, the middle of that range (geometric), scaled with viscosity like the
 * drift. Supported by BGB ("the lightest shade is the LCD disabled color") and by
 * owner-supplied videos of real DMGs, which show no lasting ghost at a low wheel. */
const METASTABLE = {
 tau_s: .3,
 basis: 'assumed: geometric middle of 0.1-1 s, the erasure time of metastable twisted textures by defect nucleation and propagation '
  + '(US 6,867,836, 180-degree texture, thickness-dependent); no DMG or STN measurement found',
 rule: 'per point, once per screen update: a point resting nearer its temporary state than its stable one takes the stable state '
  + 'with chance 1 - exp(-frames * viscosity factor / (tau * refresh)); which state is stable: the lower free energy (the source\'s functional)',
 evidence: 'BGB: as in reality, the lightest shade is the LCD disabled color; videos of real DMGs turned down show a plain screen, no lasting ghost'
};


// ---- Colour from the solver's spectrum ----------------------------------------------

/* BGB's colours are photographs of whole pixels, gaps included, and the gaps show the
 * unpowered colour (BGB: "the edge is yellow"). The solver's spectrum is the dot's own.
 * So the fit is to the dots' colour: (average - gap * unpowered) / (1 - gap). The gap
 * is 1 - 0.875^2 of the area: the source's aperture fill, from BGB's drawing, which
 * BGB calls idealized (assumed). Shown, a flat area is again the average of dots and
 * gaps, so the screens show what BGB photographed, without drawing a grid. */
const FILL = .875, GAP = 1 - FILL * FILL;
const decode = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
const measured = [P0().palette.srgb8.disabled, ...P0().palette.srgb8.shades].map(c => c.map(decode));
const off = measured[0];
const dotTarget = measured.map((c, i) => i ? c.map((v, k) => (v - GAP * off[k]) / (1 - GAP)) : c);
const anchorStates = [unpowered, ...nominal].map(e => e.optical.xyz);
// Least squares: linear RGB = M * XYZ over the five anchors (normal equations).
const XtX = [0, 1, 2].map(i => [0, 1, 2].map(j => anchorStates.reduce((a, x) => a + x[i] * x[j], 0)));
const inv3 = m => {
 const [[a, b, c], [d, e, f], [g, h, i]] = m, A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C;
 return [[A, c * h - b * i, b * f - c * e], [B, a * i - c * g, c * d - a * f], [C, b * g - a * h, a * e - b * d]].map(r => r.map(v => v / det));
};
const XtXi = inv3(XtX);
const M = [0, 1, 2].map(ch => {
 const Xty = [0, 1, 2].map(i => anchorStates.reduce((a, x, n) => a + x[i] * dotTarget[n][ch], 0));
 return [0, 1, 2].map(j => XtXi[j][0] * Xty[0] + XtXi[j][1] * Xty[1] + XtXi[j][2] * Xty[2]);
});
const toRGB = xyz => M.map(r => r[0] * xyz[0] + r[1] * xyz[1] + r[2] * xyz[2]);
const anchorQ = [0, ...anchors];
const residual = anchorStates.map((x, n) => toRGB(x).map((v, k) => dotTarget[n][k] - v));
const residualAt = q => {
 if (q >= anchorQ.at(-1)) return residual.at(-1);
 let k = 0;
 while (k < anchorQ.length - 2 && q > anchorQ[k + 1]) k++;
 const f = clampUnit((q - anchorQ[k]) / Math.max(anchorQ[k + 1] - anchorQ[k], 1e-12));
 return residual[k].map((v, c) => v + (residual[k + 1][c] - v) * f);
};
const colorBins = 1025, color = [];          // fine: the four normal shades lie within 0.06 of the coordinate
for (let i = 0; i < colorBins; i++) {
 const q = i / (colorBins - 1), dot = toRGB(R.opticalObservation(manifoldState(q), material).xyz), r = residualAt(q);
 color.push(...dot.map((v, k) => round(Math.max(0, (1 - GAP) * (v + r[k]) + GAP * off[k]), 9)));
}
const fitError = anchorStates.map((x, n) => Math.max(...toRGB(x).map((v, k) => Math.abs(v - dotTarget[n][k]))));


// ---- Patch the profile -------------------------------------------------------------

const P = P0();
P.contrast = {
 value: 1, min: LOW, max: HIGH, conditions: SCALES,
 note: P.contrast.note,
 range: 'x0.85 to x1.08: a repairer measured -11 V and -14 V at the ends of a real DMG wheel against -13 V for good contrast '
  + '(chipmusic.org, "DMG screen stuck on max contrast?", 2015): one board. The source supports 0.88 to 1.08.',
 solved: 'every 0.01 by tools/dmg01_wheel.mjs with the source\'s solver; the source tabulates 0.88, 1.00 and 1.08 only'
};
Object.assign(P.stn, {
 director_bins: driftBins, optical_bins: opticalBins,
 target_q: targetQ, drift_per_frame: drift, optical: opticalLut, optical_anchor_q: anchors, optical_correction: corrections,
 /** Luminance of the four nominal shades relative to white, from the solver: colours beyond the palette scale with it. */
 nominal_luminance: L.map(v => round(v / L[0], 9)),
 optical_range: 'optical states continue below 0.25 (lighter than nominal white) and above 1 (darker than nominal black), linearly in luminance; '
  + 'used for the drive-change projection and for reports. The colour comes from stn.color.',
 meta_q: metaQ,
 metastable: METASTABLE,
 coordinate: 'q = mean sin^2(tilt) through the cell, 0 at the unpowered rest, 1 at the source\'s high-bound black (x1.08, shade 3); '
  + manifold.length + ' solved resting states along it (both branches at every wheel position), blended only between them',
 color_bins: colorBins, color,
 color_fit: {
  method: 'CIE XYZ of the reflected spectrum (source: Jones matrices, 15 wavelengths, ideal polarizers) to linear sRGB by one 3 x 3 matrix, '
   + 'least squares over the unpowered rest and the four normal shades; the residual at those five is spread linearly between them',
  matrix: M.map(r => r.map(v => round(v, 9))),
  max_error_before_residual: fitError.map(v => round(v, 6)),
  gap_fraction: round(GAP, 6),
  gap_basis: 'BGB\'s colours are whole pixels, gaps included, and the gaps show the unpowered colour; gap = 1 - 0.875^2 (the source\'s aperture fill, '
   + 'from BGB\'s idealized drawing): assumed',
  ref: 'BGB, The reality of DMG colors: colour-accurate light, ColorChecker-corrected to true colour and brightness in sRGB, 1/60 s, defocused, averaged'
 }
});
P.attribution.changes = 'Values copied into one JSON profile. The contrast tables (stn.target_q, drift_per_frame, optical, anchors, corrections) are '
 + 'recomputed by tools/dmg01_wheel.mjs with the source\'s own solver at every 0.01 of the wheel from 0.85 to 1.08, with the optical calibration '
 + 'continued beyond the nominal shades. Used without the pixel aperture, the passive-matrix crosstalk and the row-latch scan-out, which belong to the 160x144 dot grid.';
P.contrast_solution = report;
P.contrast_solution_note = 'temporary: the other resting state where a shade has two (q, luminance relative to normal white, free energy above the stable one)';
fs.writeFileSync(file, JSON.stringify(P));
console.log('patched profiles/dmg-01-stn.json:', SCALES.length, 'wheel positions, optical', Math.min(...opticalLut).toFixed(3), 'to', Math.max(...opticalLut).toFixed(3));

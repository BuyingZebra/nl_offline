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
 * The material, drive reduction, solver, time step, frame period and table
 * sizes are the source's, unchanged; equilibria near the threshold get longer to
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
const transitionSeconds = 1.2, driftBins = 65, opticalBins = 65;

// The wheel: every 0.01 from the measured low end to the source's high end.
const LOW = .85, HIGH = 1.08;
const SCALES = Array.from({length: Math.round((HIGH - LOW) / .01) + 1}, (_, i) => Math.round((LOW + i * .01) * 100) / 100);

const round = (v, d = 10) => Number(v.toFixed(d));
const clampUnit = v => Math.min(1, Math.max(0, v));
const material = R.materialToSI(ensemble.members.find(m => m.id === 'nominal'), ensemble.sharedGeometry);


// ---- Equilibria (as the source) -------------------------------------------------

function solveEquilibrium(volts) {
 let state = R.initialDirector(material, 17), elapsed = 0, residual = Infinity;
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
const solveEquilibria = scale => R.shadeRmsVoltages(drive, scale).map((rmsVolts, shadeIndex) => {
 const state = solveEquilibrium(rmsVolts);
 return {shadeIndex, rmsVolts, state, optical: R.opticalObservation(state, material)};
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
const lowBound = solveEquilibria(LOW), highBound = solveEquilibria(HIGH);
const qMin = order(lowBound[0].state), qMax = order(highBound[3].state);
const normalize = s => (order(s) - qMin) / (qMax - qMin);
const manifold = [lowBound[0], ...nominal, highBound[3]].sort((a, b) => normalize(a.state) - normalize(b.state));

function manifoldState(coordinate) {
 const q = clampUnit(coordinate), knots = manifold.map(e => normalize(e.state));
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

function driftTable(eq, transitions) {
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
  // Anchor the equilibrium as a fixed point of the drift.
  const target = normalize(eq[t].state), offset = lookup(deltas.slice(t * driftBins, (t + 1) * driftBins), target);
  const radius = 4 / (driftBins - 1);
  const weights = Array.from({length: driftBins}, (_, bin) => Math.max(0, 1 - Math.abs(bin / (driftBins - 1) - target) / radius));
  const atTarget = lookup(weights, target);
  for (let bin = 0; bin < driftBins; bin++) deltas[t * driftBins + bin] = round(deltas[t * driftBins + bin] - offset * weights[bin] / atTarget, 12);
 }
 return deltas;
}

const targetQ = [], drift = [], report = [];
for (const scale of SCALES) {
 const t0 = Date.now(), eq = solveEquilibria(scale), transitions = [];
 for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) transitions.push(transition(eq, a, b));
 targetQ.push(...eq.map(e => round(normalize(e.state), 9)));
 drift.push(...driftTable(eq, transitions));
 const states = eq.map(e => round(calibration.stateForLuminance(e.optical.luminance), 4));
 report.push({scale, volts: eq.map(e => round(e.rmsVolts, 3)), luminance: eq.map(e => round(e.optical.luminance / L[0], 4)), states});
 console.log('x' + scale.toFixed(2), 'optical states', states.join(' '), '(' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
}


// ---- Patch the profile -------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'profiles', 'dmg-01-stn.json');
const P = JSON.parse(fs.readFileSync(file, 'utf8'));
P.contrast = {
 value: 1, min: LOW, max: HIGH, conditions: SCALES,
 note: P.contrast.note,
 range: 'x0.85 to x1.08: a repairer measured -11 V and -14 V at the ends of a real DMG wheel against -13 V for good contrast '
  + '(chipmusic.org, "DMG screen stuck on max contrast?", 2015): one board. The source supports 0.88 to 1.08.',
 solved: 'every 0.01 by tools/dmg01_wheel.mjs with the source\'s solver; the source tabulates 0.88, 1.00 and 1.08 only'
};
Object.assign(P.stn, {
 target_q: targetQ, drift_per_frame: drift, optical: opticalLut, optical_anchor_q: anchors, optical_correction: corrections,
 /** Luminance of the four nominal shades relative to white, from the solver: colours beyond the palette scale with it. */
 nominal_luminance: L.map(v => round(v / L[0], 9)),
 optical_range: 'optical states continue below 0.25 (lighter than nominal white) and above 1 (darker than nominal black), linearly in luminance'
});
P.attribution.changes = 'Values copied into one JSON profile. The contrast tables (stn.target_q, drift_per_frame, optical, anchors, corrections) are '
 + 'recomputed by tools/dmg01_wheel.mjs with the source\'s own solver at every 0.01 of the wheel from 0.85 to 1.08, with the optical calibration '
 + 'continued beyond the nominal shades. Used without the pixel aperture, the passive-matrix crosstalk and the row-latch scan-out, which belong to the 160x144 dot grid.';
P.contrast_solution = report;
fs.writeFileSync(file, JSON.stringify(P));
console.log('patched profiles/dmg-01-stn.json:', SCALES.length, 'wheel positions, optical', Math.min(...opticalLut).toFixed(3), 'to', Math.max(...opticalLut).toFixed(3));

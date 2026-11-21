/* Reflective twisted-nematic LCD: the physics, as pure functions.
 *
 * Every frame of the TN renderer follows this chain, and shaders.js mirrors it:
 *   content gray -> drive voltage (the profile's drive table)
 *   -> director state, relaxing with the profile's measured time constants
 *   -> double-pass reflective optics R(a_entry, a_exit), where the entry point
 *      is offset by refraction through the rear glass. A light of finite size
 *      reaches each exit point through many entry points, so the light
 *      *entering* the glass is blurred, never the director state.
 * Each pass through the crystal uses the profile's oblique table (extended
 * Jones matrices), so contrast fades and inverts off-axis as on a real panel.
 * Temperature scales the crystal's speed and threshold from measured data. */

import {clamp, rad, fwhmToSigmaRad, refractionOffsetMm} from '../../optics/room.js';
import {requireFields, ROOM_FIELDS} from '../contract.js';


// ===========================================================================
// Profile
// ===========================================================================

export const PROFILE_FIELDS = Object.freeze([
 ...ROOM_FIELDS,
 'drive.voltages', 'drive.a_equilibrium', 'drive.static_by_gray', 'drive.analog_by_gray',
 'dynamics.tau_on_at_Vop_ms', 'dynamics.tau_off_ms', 'dynamics.Vth', 'dynamics.Vop',
 'oblique.table_float32_base64', 'oblique.table_shape', 'oblique.table_temps_C',
 'oblique.polars_deg', 'oblique.azimuths_deg', 'oblique.a_grid',
 'oblique.rgb_weights', 'oblique.reflector', 'oblique.surface_diffuse'
]);

export const checkProfile = profile => requireFields(profile, PROFILE_FIELDS, 'Reflective TN');

const interp = (x, xs, ys) => {
 if (x <= xs[0]) return ys[0];
 for (let i = 1; i < xs.length; i++) {
  if (x <= xs[i]) {
   const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
   return ys[i - 1] + t * (ys[i] - ys[i - 1]);
  }
 }
 return ys[ys.length - 1];
};


// ===========================================================================
// Drive and director response
// ===========================================================================

/** Drive voltage for an 8-bit content gray, from the profile's table. */
export function driveVoltage(profile, gray, mode = 'static') {
 const table = mode === 'analog' ? profile.drive.analog_by_gray : profile.drive.static_by_gray;
 return table[clamp(Math.round(gray), 0, 255)];
}

/** Temperature scaling over the measured range: time constants follow gamma1/K,
 * the threshold follows sqrt(K/delta-eps). */
export function temperatureFactors(profile, celsius = 25) {
 const t = profile.temperature;
 if (!t) return {tauScale: 1, voltageScale: 1};
 const c = clamp(celsius, t.temps_C[0], t.temps_C[t.temps_C.length - 1]);
 return {tauScale: interp(c, t.temps_C, t.tau_scale), voltageScale: interp(c, t.temps_C, t.voltage_scale)};
}

/** Equilibrium director state for a voltage. voltageScale > 1: the crystal
 * responds as if driven harder (a lower threshold). */
export function equilibriumState(profile, volts, voltageScale = 1) {
 return interp(volts * voltageScale, profile.drive.voltages, profile.drive.a_equilibrium);
}

/** Director time constant: field-driven switching speeds up as (V/Vth)^2 - 1;
 * relaxation has no field to help it. */
export function timeConstantMs(profile, volts, target, current, {tauScale = 1, voltageScale = 1} = {}) {
 const {tau_on_at_Vop_ms: onOp, tau_off_ms: off, Vth, Vop} = profile.dynamics;
 if (target <= current) return off * tauScale;
 const over = (volts * voltageScale / Vth) ** 2 - 1;
 if (over <= 1e-3) return off * tauScale;
 return onOp * ((Vop / Vth) ** 2 - 1) / over * tauScale;
}

/** Exact exponential step: identical results at any frame rate. */
export function stepState(profile, a, volts, dtMs, celsius = 25) {
 const f = temperatureFactors(profile, celsius);
 const target = equilibriumState(profile, volts, f.voltageScale);
 const tau = timeConstantMs(profile, volts, target, a, f);
 return target + (a - target) * Math.exp(-dtMs / tau);
}


// ===========================================================================
// Reflector shadow: where light enters the crystal
// ===========================================================================

/** Entry-point offset (mm) for light arriving at lightAngleDeg from the normal.
 * Light from the top enters further up than where it exits. */
export function entryOffsetMm(profile, lightAngleDeg, azimuthDeg) {
 const d = refractionOffsetMm(profile.sources.geometry, lightAngleDeg);
 const az = rad(azimuthDeg);
 return {x: Math.sin(az) * d, y: -Math.cos(az) * d};
}

/** Where the light entering the glass comes from, for a room light of full
 * width sourceDeg: the mean entry offset and the spread along (radial) and
 * across (tangential) the light's direction, in millimetres. */
export function shadowKernel(profile, {angleDeg, azimuthDeg, sourceDeg}) {
 const g = profile.sources.geometry;
 const mean = entryOffsetMm(profile, angleDeg, azimuthDeg);
 const sigma = fwhmToSigmaRad(sourceDeg);
 const h = .01, theta = rad(angleDeg);
 // mm per radian, along the light's direction and across it
 const slope = (refractionOffsetMm(g, angleDeg + h) - refractionOffsetMm(g, Math.max(0, angleDeg - h)))
  / rad(angleDeg + h - Math.max(0, angleDeg - h));
 const across = theta > 1e-3 ? refractionOffsetMm(g, angleDeg) / Math.sin(theta) : slope;
 const az = rad(azimuthDeg);
 return {
  mean,
  radial: {x: Math.sin(az), y: -Math.cos(az)},
  sigmaRadialMm: slope * sigma,
  sigmaTangentialMm: across * sigma
 };
}


// ===========================================================================
// Straight-on optics (the profile's precomputed tables)
// ===========================================================================

/** Rank-k entry weights for a director state: R = entry_k(a_in) . exit_k,c(a_out). */
export function entryVector(profile, a) {
 const {rank, entry} = profile.factor, n = profile.lut.size;
 const u = clamp(a / profile.lut.a_max, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(u)), f = u - i;
 return Array.from({length: rank}, (_, k) => (1 - f) * entry[i * rank + k] + f * entry[(i + 1) * rank + k]);
}

/** Reflectance for (possibly blur-averaged) entry weights and an exit state. */
export function reflectanceFromEntry(profile, entryWeights, aOut) {
 const {rank, exit} = profile.factor, n = profile.lut.size;
 const u = clamp(aOut / profile.lut.a_max, 0, 1) * (n - 1), j = Math.min(n - 2, Math.floor(u)), f = u - j;
 return [0, 1, 2].map(c => entryWeights.reduce(
  (sum, w, k) => sum + w * ((1 - f) * exit[(j * 3 + c) * rank + k] + f * exit[((j + 1) * 3 + c) * rank + k]), 0));
}

/** Linear-sRGB reflectance for (entry state, exit state), bilinear in the table. */
export function reflectance(profile, aIn, aOut) {
 const {size, a_max, linear_srgb: t} = profile.lut;
 const u = clamp(aIn / a_max, 0, 1) * (size - 1), v = clamp(aOut / a_max, 0, 1) * (size - 1);
 const i = Math.min(size - 2, Math.floor(u)), j = Math.min(size - 2, Math.floor(v)), fu = u - i, fv = v - j;
 const at = (a, b, k) => t[(a * size + b) * 3 + k];
 return [0, 1, 2].map(k =>
  (1 - fu) * ((1 - fv) * at(i, j, k) + fv * at(i, j + 1, k)) + fu * ((1 - fv) * at(i + 1, j, k) + fv * at(i + 1, j + 1, k)));
}


// ===========================================================================
// Oblique optics: any light and viewing direction
// ===========================================================================

const tableCache = new WeakMap();

/** The profile's oblique transmission table, decoded once per profile. */
function obliqueTable(profile) {
 let t = tableCache.get(profile);
 if (!t) {
  const b64 = profile.oblique.table_float32_base64;
  const bytes = typeof atob === 'function'
   ? Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))
   : Uint8Array.from(Buffer.from(b64, 'base64'));
  t = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  tableCache.set(profile, t);
 }
 return t;
}

/** Single-pass transmission (a-grid x wavelengths) for light arriving from
 * (polarDeg, azimuthDeg), bilinear over the profile's direction grid and
 * linear between its temperature tables (birefringence changes with temperature). */
export function passTransmission(profile, polarDeg, azimuthDeg, celsius = 25) {
 const O = profile.oblique, T = obliqueTable(profile), [nT, nDir, A, L] = O.table_shape, block = A * L;

 // Temperature: the two tables around celsius
 const temps = O.table_temps_C, tc = clamp(celsius, temps[0], temps[nT - 1]);
 let ti = 0;
 while (ti < nT - 2 && tc > temps[ti + 1]) ti++;
 const ft = nT > 1 ? (tc - temps[ti]) / (temps[ti + 1] - temps[ti]) : 0;

 // Direction: rings of constant polar angle, each with nAz azimuths (ring 0 is the normal)
 const polars = O.polars_deg, azs = O.azimuths_deg, nAz = azs.length, step = 360 / nAz;
 const p = clamp(polarDeg, 0, polars[polars.length - 1]);
 const az = ((azimuthDeg % 360) + 360) % 360, j = Math.floor(az / step), fa = az / step - j;
 const ring = i => {
  if (i === 0) return [[0, 1]];
  const base = 1 + (i - 1) * nAz;
  return [[base + j, 1 - fa], [base + (j + 1) % nAz, fa]];
 };
 let i = 0;
 while (i < polars.length - 2 && p > polars[i + 1]) i++;
 const fp = (p - polars[i]) / (polars[i + 1] - polars[i]);
 const terms = [...ring(i).map(([d, w]) => [d, w * (1 - fp)]), ...ring(i + 1).map(([d, w]) => [d, w * fp])];

 const out = new Float64Array(block);
 for (const [tIndex, tw] of [[ti, 1 - ft], [Math.min(nT - 1, ti + 1), ft]]) {
  if (!tw) continue;
  for (const [d, w] of terms) {
   if (!w) continue;
   const o = (tIndex * nDir + d) * block;
   for (let k = 0; k < block; k++) out[k] += tw * w * T[o + k];
  }
 }
 return out;
}

function interpRow(grid, a) {
 const n = grid.length, u = clamp(a / grid[n - 1], 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(u));
 return [i, u - i];
}

/** Linear-sRGB reflectance for a light and a viewing direction (double pass,
 * computed as a product per wavelength). */
export function reflectanceOblique(profile, aIn, aOut, light, view, celsius = 25) {
 const O = profile.oblique, [, , , L] = O.table_shape;
 const TL = passTransmission(profile, light.polarDeg, light.azimuthDeg, celsius);
 const TV = passTransmission(profile, view.polarDeg, view.azimuthDeg, celsius);
 const [i, fi] = interpRow(O.a_grid, aIn), [j, fj] = interpRow(O.a_grid, aOut);
 const at = (T, r, f, l) => (1 - f) * T[r * L + l] + f * T[(r + 1) * L + l];
 return [0, 1, 2].map(c => {
  let sum = 0;
  for (let l = 0; l < L; l++) sum += O.rgb_weights[c][l] * at(TL, i, fi, l) * at(TV, j, fj, l);
  return 2 * O.reflector * sum + O.surface_diffuse;
 });
}

/** Symmetric eigen-decomposition (cyclic Jacobi), largest eigenvalue first. */
function eigenSymmetric(m, n) {
 const a = Float64Array.from(m), v = new Float64Array(n * n);
 for (let i = 0; i < n; i++) v[i * n + i] = 1;
 for (let sweep = 0; sweep < 60; sweep++) {
  let off = 0;
  for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2;
  if (off < 1e-22) break;
  for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
   const apq = a[p * n + q];
   if (Math.abs(apq) < 1e-30) continue;
   const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
   const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
   const c = 1 / Math.sqrt(t * t + 1), s = t * c;
   for (let k = 0; k < n; k++) { const akp = a[k * n + p], akq = a[k * n + q]; a[k * n + p] = c * akp - s * akq; a[k * n + q] = s * akp + c * akq; }
   for (let k = 0; k < n; k++) { const apk = a[p * n + k], aqk = a[q * n + k]; a[p * n + k] = c * apk - s * aqk; a[q * n + k] = s * apk + c * aqk; }
   for (let k = 0; k < n; k++) { const vkp = v[k * n + p], vkq = v[k * n + q]; v[k * n + p] = c * vkp - s * vkq; v[k * n + q] = s * vkp + c * vkq; }
  }
 }
 const order = [...Array(n).keys()].sort((x, y) => a[y * n + y] - a[x * n + x]);
 return {
  values: order.map(k => a[k * n + k]),
  vectors: order.map(k => Array.from({length: n}, (_, i) => v[i * n + k]))
 };
}

/** Rank-4 separable optics for the current light and viewing directions:
 * R_c(a_in, a_out) ~= sum_k entry_k(a_in) * exit_k,c(a_out). Exact per
 * wavelength; the truncation error is returned. */
export function obliqueOptics(profile, light, view, celsius = 25) {
 const O = profile.oblique, [, , A, L] = O.table_shape, cols = A * 3;
 const TL = passTransmission(profile, light.polarDeg, light.azimuthDeg, celsius);
 const TV = passTransmission(profile, view.polarDeg, view.azimuthDeg, celsius);

 // Full reflectance matrix: rows = entry state, columns = (exit state, colour)
 const M = new Float64Array(A * cols), k2 = 2 * O.reflector;
 for (let j = 0; j < A; j++) for (let c = 0; c < 3; c++) {
  const w = O.rgb_weights[c], col = j * 3 + c;
  for (let i = 0; i < A; i++) {
   let s = 0;
   for (let l = 0; l < L; l++) s += w[l] * TL[i * L + l] * TV[j * L + l];
   M[i * cols + col] = k2 * s + O.surface_diffuse;
  }
 }

 // Its best rank-4 factorization, from the eigenvectors of M M^T
 const B = new Float64Array(A * A);
 for (let i = 0; i < A; i++) for (let k = i; k < A; k++) {
  let s = 0;
  for (let c = 0; c < cols; c++) s += M[i * cols + c] * M[k * cols + c];
  B[i * A + k] = B[k * A + i] = s;
 }
 const {values, vectors} = eigenSymmetric(B, A);
 const entry = new Float32Array(A * 4), exit = new Float32Array(A * 3 * 4);
 for (let k = 0; k < 4; k++) {
  const sigma = Math.sqrt(Math.max(values[k], 0)), root = Math.sqrt(sigma), u = vectors[k];
  for (let i = 0; i < A; i++) entry[i * 4 + k] = u[i] * root;
  for (let c = 0; c < cols; c++) {
   let s = 0;
   for (let i = 0; i < A; i++) s += M[i * cols + c] * u[i];
   exit[c * 4 + k] = sigma > 0 ? s / sigma * root : 0;
  }
 }

 // Worst error of the factorization, relative to the brightest entry
 let err = 0, max = 0;
 for (let i = 0; i < A; i++) for (let c = 0; c < cols; c++) {
  let r = 0;
  for (let k = 0; k < 4; k++) r += entry[i * 4 + k] * exit[c * 4 + k];
  err = Math.max(err, Math.abs(r - M[i * cols + c]));
  max = Math.max(max, M[i * cols + c]);
 }
 return {size: A, aMax: O.a_grid[A - 1], entry, exit, error: err / max};
}

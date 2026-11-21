/* Nintendo DMG-01 reflective STN, without its dot grid: the physics, as pure functions.
 *
 * Every number comes from profiles/dmg-01-stn.json, which tools/dmg01_profile.mjs
 * copies from Retro Display Lab (Apache-2.0, copyright 2026 JohnnySun; see
 * third_party/retro-display-lab/NOTICE). The time integration re-implements
 * Retro Display Lab's dmg01-response-v1.slang:
 *  - the art is quantized to the DMG's four drive levels;
 *  - each point carries a director coordinate q that drifts once per DMG frame
 *    (59.7275 Hz) by the generated STN table, interpolated across the contrast
 *    wheel's three conditions and scaled by an Arrhenius viscosity factor;
 *  - on a drive change q is projected onto the nominal optical branch;
 *  - ions slowly charge under a dark drive and release afterwards (sticking);
 *  - what the eye sees over a frame is the Simpson average of the optical
 *    state across it, mapped to the measured palette in linear light. */

import {requireFields, ROOM_FIELDS} from '../contract.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, f) => a + (b - a) * f;


// ===========================================================================
// Profile
// ===========================================================================

export const PROFILE_FIELDS = Object.freeze([
 ...ROOM_FIELDS,
 'stn.director_bins', 'stn.drift_per_frame', 'stn.target_q', 'stn.optical_bins', 'stn.optical',
 'stn.optical_anchor_q', 'stn.optical_correction',
 'contrast.conditions', 'contrast.min', 'contrast.max', 'contrast.value',
 'panel.refresh_hz', 'panel.active_mm', 'panel.dots',
 'retention.charge_per_frame', 'retention.release_per_frame', 'retention.sticking_volts_fit',
 'retention.ionic_mobility', 'retention.sticking_optical_gain',
 'temperature.activation_K', 'temperature.reference_C',
 'palette.srgb8.disabled', 'palette.srgb8.shades', 'shadow.offset_dots', 'shadow.strength', 'oblique.front_index'
]);

export function checkProfile(profile) {
 if (profile?.model !== 'dmg01-stn') throw new TypeError('A DMG-01 STN profile is required');
 return requireFields(profile, PROFILE_FIELDS, 'DMG-01 STN');
}


// ===========================================================================
// Drive levels and the contrast wheel
// ===========================================================================

/** Drive level 0..3 for encoded sRGB components in [0, 1]. */
export function shadeFromRGB(r, g, b) {
 const luma = .2126 * r + .7152 * g + .0722 * b;
 return Math.floor(clamp(1 - luma, 0, 1) * 3 + .5);
}

/** The two tabulated contrast conditions around a wheel setting, and the mix between them. */
export function contrastConditions(profile, contrast) {
 const [c0, c1, c2] = profile.contrast.conditions, c = clamp(contrast, c0, c2);
 return c <= c1
  ? {low: 0, high: 1, fraction: (c - c0) / (c1 - c0)}
  : {low: 1, high: 2, fraction: (c - c1) / (c2 - c1)};
}

/** Director coordinate a point settles at under a steady drive level. */
export function targetQ(profile, shade, contrast = 1) {
 const {low, high, fraction} = contrastConditions(profile, contrast), t = profile.stn.target_q;
 return mix(t[low * 4 + shade], t[high * 4 + shade], fraction);
}


// ===========================================================================
// Director drift and optics
// ===========================================================================

function rowDrift(profile, condition, shade, q) {
 const n = profile.stn.director_bins, d = profile.stn.drift_per_frame;
 const x = clamp(q, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(x)), f = x - i, base = (condition * 4 + shade) * n + i;
 return mix(d[base], d[base + 1], f);
}

/** Change of q over one DMG frame at the reference temperature. */
export function driftPerFrame(profile, shade, q, contrast = 1) {
 const {low, high, fraction} = contrastConditions(profile, contrast);
 return mix(rowDrift(profile, low, shade, q), rowDrift(profile, high, shade, q), fraction);
}

function opticalCorrection(profile, q) {
 const A = profile.stn.optical_anchor_q, C = profile.stn.optical_correction, x = clamp(q, 0, 1);
 if (x <= A[0]) return C[0] * x / Math.max(A[0], 1e-6);
 for (let k = 0; k < 3; k++) if (x <= A[k + 1]) return mix(C[k], C[k + 1], (x - A[k]) / Math.max(A[k + 1] - A[k], 1e-6));
 return C[3] * (1 - x) / Math.max(1 - A[3], 1e-6);
}

/** Optical state 0.25 (lightest driven shade) .. 1 (darkest) for director coordinate q. */
export function opticalState(profile, q) {
 const n = profile.stn.optical_bins, o = profile.stn.optical;
 const x = clamp(q, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(x));
 return clamp(mix(o[i], o[i + 1], x - i) + opticalCorrection(profile, q), .25, 1);
}

/** Unique q on the nominal branch that shows a given optical state (bisection). */
export function canonicalQ(profile, state) {
 const s = clamp(state, .25, 1), k = Math.min(Math.floor((s - .25) * 4), 2), A = profile.stn.optical_anchor_q;
 let lo = A[k], hi = A[k + 1];
 for (let i = 0; i < 10; i++) {
  const m = .5 * (lo + hi);
  if (opticalState(profile, m) < s) lo = m;
  else hi = m;
 }
 return .5 * (lo + hi);
}

/** Arrhenius viscosity factor: how many reference frames of drift one frame is worth. */
export function temperatureScale(profile, celsius = 20) {
 const T = profile.temperature;
 return Math.exp(T.activation_K * (1 / (T.reference_C + 273.15) - 1 / (celsius + 273.15)));
}


// ===========================================================================
// Ionic sticking
// ===========================================================================

function ionicResponse(response, fraction) { return 1 - Math.pow(1 - response, clamp(fraction, 0, 1)); }

function ionicStep(profile, ionic, shade, fraction) {
 const R = profile.retention, drive = shade / 3;
 return ionic + (drive - ionic) * ionicResponse(drive > ionic ? R.charge_per_frame : R.release_per_frame, fraction);
}

export function stickingVolts(profile) {
 const R = profile.retention;
 return Math.max(R.sticking_volts_fit[0] * R.ionic_mobility + R.sticking_volts_fit[1], 0);
}

/** Optical state the eye sees: the director plus any ionic sticking bias. */
export function displayedState(profile, q, ionic, shade) {
 const bias = Math.max(ionic - shade / 3, 0) * stickingVolts(profile) * profile.retention.sticking_optical_gain;
 return clamp(opticalState(profile, q) + bias, .25, 1);
}


// ===========================================================================
// One frame, and the colours it shows
// ===========================================================================

/** One DMG frame for one point: the new state and the light it showed (Simpson average). */
export function stepFrame(profile, {q, ionic, shade: previous}, shade, {contrast = 1, celsius = 20} = {}) {
 if (previous !== shade) q = canonicalQ(profile, opticalState(profile, q));
 const ts = temperatureScale(profile, celsius), d = driftPerFrame(profile, shade, q, contrast);
 const qm = clamp(q + d * .5 * ts, 0, 1), qe = clamp(q + d * ts, 0, 1);
 const im = ionicStep(profile, ionic, shade, .5), ie = ionicStep(profile, ionic, shade, 1);
 const light = (displayedState(profile, q, ionic, shade) + 4 * displayedState(profile, qm, im, shade) + displayedState(profile, qe, ie, shade)) / 6;
 return {q: qe, ionic: ie, shade, exposure: light};
}

/** 8-bit sRGB component to linear light. */
export const decodeSRGB8 = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };

/** The measured palette in linear light: LCD disabled, then shades 0..3. */
export function linearPalette(profile) {
 const P = profile.palette.srgb8;
 return [P.disabled, ...P.shades].map(rgb => rgb.map(decodeSRGB8));
}

/** Linear-sRGB colour of an optical state (0 = LCD disabled, .25..1 = shades 0..3). */
export function opticalColor(profile, state) {
 const c = linearPalette(profile);
 const x = clamp(state, 0, 1) * 4, k = Math.min(3, Math.floor(x));
 return [0, 1, 2].map(i => mix(c[k][i], c[k + 1][i], x - k));
}

/** Reflector-shadow offset in panel millimetres (x right, y down). */
export function shadowOffsetMm(profile) {
 const [w, h] = profile.panel.active_mm, [cols, rows] = profile.panel.dots, [ox, oy] = profile.shadow.offset_dots;
 return {x: ox * w / cols, y: oy * h / rows};
}

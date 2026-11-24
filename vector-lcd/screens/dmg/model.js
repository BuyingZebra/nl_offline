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
 *    state across it, mapped to the measured palette in linear light.
 *
 * The reflector shadow is not Retro Display Lab's: it follows from the light
 * crossing the crystal twice, as on the TN screens. Room light enters the
 * crystal at one point, reaches the reflector behind the rear glass, and
 * leaves at another; under angled light the two points differ. The measured
 * palette is the colour of a flat area, where both passes cross the same
 * state, so each pass is taken to carry the square root of that colour. */

import {requireFields, ROOM_FIELDS} from '../contract.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, f) => a + (b - a) * f;


// ===========================================================================
// Profile
// ===========================================================================

export const PROFILE_FIELDS = Object.freeze([
 ...ROOM_FIELDS,
 'stn.director_bins', 'stn.drift_per_frame', 'stn.target_q', 'stn.optical_bins', 'stn.optical',
 'stn.optical_anchor_q', 'stn.optical_correction', 'stn.nominal_luminance',
 'contrast.conditions', 'contrast.min', 'contrast.max', 'contrast.value',
 'panel.refresh_hz', 'panel.active_mm', 'panel.dots',
 'retention.charge_per_frame', 'retention.release_per_frame', 'retention.sticking_volts_fit',
 'retention.ionic_mobility', 'retention.sticking_optical_gain',
 'temperature.activation_K', 'temperature.reference_C', 'temperature.response_scale', 'sources.response.target_ms',
 'palette.srgb8.disabled', 'palette.srgb8.shades', 'oblique.front_index'
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

/** The two tabulated wheel positions around a setting, and the mix between them
 * (the profile solves the wheel every 0.01: tools/dmg01_wheel.mjs). */
export function contrastConditions(profile, contrast) {
 const C = profile.contrast.conditions, c = clamp(contrast, C[0], C[C.length - 1]);
 let low = 0;
 while (low < C.length - 2 && c > C[low + 1]) low++;
 return {low, high: low + 1, fraction: (c - C[low]) / (C[low + 1] - C[low])};
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

/** Most extreme optical state any table reaches, either way (a guard, not a clamp of the physics). */
const OPTICAL_LIMIT = 4;

/** Optical state for director coordinate q: .25, .5, .75 and 1 are the four
 * nominal shades; below .25 is lighter than nominal white and above 1 darker than
 * nominal black, which the contrast wheel reaches (linear in luminance). */
export function opticalState(profile, q) {
 const n = profile.stn.optical_bins, o = profile.stn.optical;
 const x = clamp(q, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(x));
 return clamp(mix(o[i], o[i + 1], x - i) + opticalCorrection(profile, q), -OPTICAL_LIMIT, OPTICAL_LIMIT);
}

/** Unique q on the nominal branch that shows a given optical state (bisection),
 * or null for a state outside the nominal shades, where the branch is not defined. */
export function canonicalQ(profile, state) {
 if (!(state >= .25 && state <= 1)) return null;
 const s = state, k = Math.min(Math.floor((s - .25) * 4), 2), A = profile.stn.optical_anchor_q;
 let lo = A[k], hi = A[k + 1];
 for (let i = 0; i < 10; i++) {
  const m = .5 * (lo + hi);
  if (opticalState(profile, m) < s) lo = m;
  else hi = m;
 }
 return .5 * (lo + hi);
}

/** Arrhenius viscosity factor: how many reference frames of drift one frame is worth.
 * temperature.response_scale (default 1) slows or speeds the whole crystal by
 * scaling its viscosity; the DMG profile uses it to match the era's published STN
 * response times (see the profile's sources.response). */
export function temperatureScale(profile, celsius = 20) {
 const T = profile.temperature;
 return (T.response_scale ?? 1) * Math.exp(T.activation_K * (1 / (T.reference_C + 273.15) - 1 / (celsius + 273.15)));
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
 return clamp(opticalState(profile, q) + bias, -OPTICAL_LIMIT, OPTICAL_LIMIT);
}


// ===========================================================================
// One frame, and the colours it shows
// ===========================================================================

/** One DMG frame for one point: the new state and the light it showed (Simpson average). */
export function stepFrame(profile, {q, ionic, shade: previous}, shade, {contrast = 1, celsius = 20} = {}) {
 if (previous !== shade) q = canonicalQ(profile, opticalState(profile, q)) ?? q;
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

/** Linear-sRGB colour of an optical state. Between .25 and 1, the measured
 * palette (shades 0..3, linear light). Beyond it the panel is lighter than its
 * nominal white or darker than its nominal black: the end shade's colour, with its
 * brightness scaled by the solver's luminance (stn.nominal_luminance), continued
 * linearly past the end. */
export function opticalColor(profile, state) {
 const c = linearPalette(profile), L = profile.stn.nominal_luminance;
 if (state > 1) { const l = Math.max(L[3] - (state - 1) * 4 * (L[2] - L[3]), 0); return c[4].map(v => v * l / L[3]); }
 if (state < .25) { const l = L[0] + (.25 - state) * 4 * (L[0] - L[1]); return c[1].map(v => v * l / L[0]); }
 const x = state * 4, k = Math.min(3, Math.floor(x));
 return [0, 1, 2].map(i => mix(c[k][i], c[k + 1][i], x - k));
}


// ===========================================================================
// Two passes through the crystal: the reflector shadow
// ===========================================================================

/** Linear-light transmission of one pass through a point in an optical state:
 * the square root of its measured colour, so two passes through the same
 * state give the palette exactly. */
export function passTransmission(profile, state) {
 return opticalColor(profile, state).map(Math.sqrt);
}

/** Colour leaving a point in exitState, for the light that entered the
 * crystal elsewhere and arrived with entryLight (linear RGB: the room light
 * reaching the crystal, times its first pass; blurred over the light's size). */
export function reflectedColor(profile, exitState, entryLight) {
 return passTransmission(profile, exitState).map((t, i) => t * entryLight[i]);
}

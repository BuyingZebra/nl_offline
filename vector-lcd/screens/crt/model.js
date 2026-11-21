/* IBM 5151 green phosphor CRT (P39): the physics, as pure functions.
 *
 * profiles/crt-5151-p39.json (tools/crt_p39.py) supplies every number:
 *  - the beam sweeps 370 lines per frame at the MDA's 18.432 kHz (49.82 Hz),
 *    350 of them visible; along a line the signal is continuous (no pixels);
 *  - the content is quantized to the four TTL levels (video 2/3 + intensity 1/3);
 *  - each line deposits charge with the measured Gaussian spot profile;
 *  - each point of P39 phosphor answers a hit with its impulse response, five
 *    exponentials, stepped exactly at the moment the beam passes that point;
 *  - what the eye sees is the light averaged over one refresh period, so the
 *    50 Hz ripple is not aliased against the phone's refresh rate;
 *  - light trapped in the faceplate returns as a halo (halation);
 *  - the room light reflects off the screen and the etched glass. */

import {requireFields, ROOM_FIELDS} from '../contract.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));


// ===========================================================================
// Profile
// ===========================================================================

export const PROFILE_FIELDS = Object.freeze([
 ...ROOM_FIELDS,
 'timing.frame_s', 'timing.line_s', 'timing.active_s', 'timing.lines_visible',
 'phosphor.impulse.amplitudes', 'phosphor.impulse.taus_s',
 'raster.pitch_mm', 'raster.height_mm', 'spot.sigma_mm', 'luminance.full_drive_relative',
 'faceplate.ambient_reflectance', 'faceplate.surface_reflectance',
 'faceplate.halation.r_mm', 'faceplate.halation.fraction',
 'controls.contrast.min', 'controls.contrast.max', 'controls.contrast.value',
 'controls.brightness.min', 'controls.brightness.max', 'controls.brightness.value'
]);

export function checkProfile(profile) {
 if (profile?.model !== 'crt-raster') throw new TypeError('A CRT raster profile is required');
 return requireFields(profile, PROFILE_FIELDS, 'CRT');
}


// ===========================================================================
// Signal
// ===========================================================================

/** TTL level 0..3 for encoded sRGB in [0, 1]: dark art drives the beam. */
export function levelFromRGB(r, g, b) {
 return Math.floor(clamp(1 - (.2126 * r + .7152 * g + .0722 * b), 0, 1) * 3 + .5);
}


// ===========================================================================
// Phosphor response
// ===========================================================================

/** Phosphor light per unit excitation, t seconds after a hit (unit total energy). */
export function impulse(profile, t) {
 const {amplitudes: a, taus_s: tau} = profile.phosphor.impulse;
 return t < 0 ? 0 : a.reduce((s, ai, i) => s + ai * Math.exp(-t / tau[i]), 0);
}

/** Mean light over one frame, in units of the full-drive luminance, for a point
 * hit once per frame with excitation E and observed tSince seconds after its
 * last hit, in the steady state (every frame the same). Each hit delivers one
 * frame's worth of light per unit excitation, so a steady point shows exactly E. */
export function steadyWindow(profile, E, tSince) {
 const T = profile.timing.frame_s, {amplitudes: a, taus_s: tau} = profile.phosphor.impulse;
 let sum = 0;
 for (let i = 0; i < a.length; i++) {
  const plus = E * a[i] / (1 - Math.exp(-T / tau[i])), minus = plus - E * a[i], d2 = tSince, d1 = T - d2;
  sum += minus * tau[i] * (Math.exp(d1 / tau[i]) - 1) + plus * tau[i] * (1 - Math.exp(-d2 / tau[i]));
 }
 return sum;
}

/** Time (s) after a single hit until the light falls to `fraction` of its peak. */
export function decayTime(profile, fraction = .1) {
 let peak = 0, tp = 0;
 for (let t = 0; t < .2; t += 1e-5) {
  const v = impulse(profile, t);
  if (v > peak) { peak = v; tp = t; }
 }
 let t = tp;
 while (impulse(profile, t) > fraction * peak && t < 10) t += 1e-4;
 return t;
}


// ===========================================================================
// What the display shows
// ===========================================================================

/** Exposure that brings the brightest line core at full drive (contrast 1) to
 * the display's maximum green, as the eye adapts to a lit screen. One
 * constant: every ratio (levels, afterglow, room reflection) is kept. */
export function adaptedExposure(profile) {
 const peak = profile.raster.pitch_mm / (Math.sqrt(2 * Math.PI) * profile.spot.sigma_mm);
 return .7152 / (profile.luminance.full_drive_relative * peak);
}

/** Linear-sRGB colour for emitted luminance Y (relative to a white diffuser) on
 * top of a grey ambient reflection. P39 lies outside sRGB, so its light is
 * shown on the display's green primary; above full green it clips, keeping the
 * hue (P39 never looks white) at the cost of the brightest line cores. */
export function displayColor(Y, ambient) {
 return [ambient, ambient + Y / .7152, ambient].map(v => clamp(v, 0, 1));
}

/** The faceplate's 1 mm halation bins, grouped into at most 24 rings of
 * [mean radius mm, fraction of the light]. */
export function halationRings(profile) {
 const hal = profile.faceplate.halation, rings = [];
 for (let i = 0; i < hal.r_mm.length; i += 3) {
  let f = 0, r = 0;
  for (let k = i; k < Math.min(i + 3, hal.r_mm.length); k++) {
   f += hal.fraction[k];
   r += hal.r_mm[k] * hal.fraction[k];
  }
  if (f > 0) rings.push([r / f, f]);
 }
 return rings;
}

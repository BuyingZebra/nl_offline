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
 *  - the room light reflects off the screen and the etched glass.
 *
 * A screen may have up to two phosphor layers, each with its own colour (P7:
 * a blue flash cascaded on a yellow-green afterglow). The impulse response is
 * a sum of at most seven exponentials; each belongs to one layer. */

import {requireFields, ROOM_FIELDS} from '../contract.js';
import {glare, rad} from '../../optics/room.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const MAX_COMPONENTS = 9;   // exponentials per point (shaders.js state: 3 x RGBA with the last hits)
export const MAX_LAYERS = 3;       // phosphor layers with their own colour (one per gun on a colour tube)

/** A component this much faster than a frame is over long before the frame
 * window ends: its light in the window is exactly the light of the last hit
 * (the general formula would overflow: exp(T / tau)). Mirrored in EMIT_FS. */
export const FAST_FRACTION_OF_FRAME = .02;


// ===========================================================================
// Profile
// ===========================================================================

export const PROFILE_FIELDS = Object.freeze([
 ...ROOM_FIELDS,
 'timing.frame_s', 'timing.line_s', 'timing.active_s', 'timing.lines_visible',
 'phosphor.impulse.amplitudes', 'phosphor.impulse.taus_s', 'phosphor.impulse.layer', 'phosphor.layers', 'phosphor.facts',
 'raster.pitch_mm', 'raster.height_mm', 'spot.sigma_mm', 'luminance.full_drive_relative',
 'spot.bloom.power', 'spot.bloom.min_drive_fraction', 'phosphor.efficiency_vs_P4',
 'faceplate.ambient_reflectance', 'faceplate.surface_reflectance', 'faceplate.etch.specular_fraction', 'faceplate.etch.lobe_sigma_deg', 'oblique.front_index',
 'faceplate.halation.r_mm', 'faceplate.halation.fraction',
 'controls.contrast.min', 'controls.contrast.max', 'controls.contrast.value',
 'controls.brightness.min', 'controls.brightness.max', 'controls.brightness.value'
]);

export function checkProfile(profile) {
 if (profile?.model !== 'crt-raster') throw new TypeError('A CRT raster profile is required');
 requireFields(profile, PROFILE_FIELDS, 'CRT');
 const {amplitudes, taus_s, layer} = profile.phosphor.impulse, layers = profile.phosphor.layers;
 if (amplitudes.length > MAX_COMPONENTS || taus_s.length !== amplitudes.length || layer.length !== amplitudes.length)
  throw new TypeError('CRT profile "' + profile.profile + '": impulse needs matching amplitudes, taus_s and layer, at most ' + MAX_COMPONENTS);
 if (!layers.length || layers.length > MAX_LAYERS || layer.some(l => !(l >= 0 && l < layers.length)))
  throw new TypeError('CRT profile "' + profile.profile + '": 1 to ' + MAX_LAYERS + ' layers, and every component in one of them');
 return profile;
}


// ===========================================================================
// Signal
// ===========================================================================

/** TTL level 0..3 for encoded sRGB in [0, 1]: dark art drives the beam. */
export function levelFromRGB(r, g, b) {
 return Math.floor(clamp(1 - (.2126 * r + .7152 * g + .0722 * b), 0, 1) * 3 + .5);
}

/** Beam drive per layer for encoded sRGB art in [0, 1], at the knobs' settings:
 * a colour tube's three guns follow the art's channels to the power gamma; a
 * monochrome tube's one beam follows the TTL level. Mirrored in UPDATE_FS. */
export function layerDrives(profile, rgb, contrast = 1, brightness = 0) {
 if (profile.drive.mode === 'rgb') return rgb.map(v => contrast * clamp(v, 0, 1) ** profile.drive.gamma + brightness);
 const d = contrast * levelFromRGB(...rgb) / 3 + brightness;
 return profile.phosphor.layers.map(() => d);
}

/** How far the display can draw a colour mask's stripes, from its pixels per
 * triplet: a stripe needs at least two display pixels to be drawn without
 * aliasing (Nyquist), so the stripes fade in from 2 to 3 pixels per stripe.
 * Mirrored in DISPLAY_FS (uResolve). */
export const stripeResolve = pxPerTriplet => clamp(pxPerTriplet / 3 - 2, 0, 1);


// ===========================================================================
// Spot: wider at higher beam current
// ===========================================================================

/** Gaussian spot width (monitor mm, one standard deviation) for a beam signal
 * `drive` (1 = full drive). The measured spot is for phosphor W (P4) at the
 * resolution test's light output; a less efficient phosphor needs more current
 * for the same light, and the line width grows as a power of the current
 * (Philips T16, Fig. 5). Below min_drive_fraction it is held (outside the
 * measured range). Mirrored in UPDATE_FS. */
export function spotSigmaMm(profile, drive) {
 const B = profile.spot.bloom, eff = profile.phosphor.efficiency_vs_P4;
 return profile.spot.sigma_mm * Math.pow(Math.max(drive, B.min_drive_fraction) / eff, B.power);
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
export function steadyWindow(profile, E, tSince, layer = null) {
 const T = profile.timing.frame_s, {amplitudes: a, taus_s: tau, layer: of} = profile.phosphor.impulse;
 let sum = 0;
 for (let i = 0; i < a.length; i++) {
  if (layer !== null && of[i] !== layer) continue;
  if (tau[i] < FAST_FRACTION_OF_FRAME * T) { sum += E * a[i] * tau[i]; continue; }
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

/** Room reflection relative to the profile's own room: the profile measures
 * every light against a white card under luminance.room_lux. The phosphor's
 * light does not change with the room; only the reflection off the glass does. */
/** The room light reflected by the etched front toward the eye (unit vector),
 * relative to a white diffuser: a faint mirror image plus the etch's blurred
 * lobe, both carrying the Fresnel reflection. Mirrored in DISPLAY_FS. */
export function faceGlare(profile, toEye, lighting) {
 const E = profile.faceplate.etch;
 return E.specular_fraction * glare(profile, toEye, lighting)
  + (1 - E.specular_fraction) * glare(profile, toEye, lighting, rad(E.lobe_sigma_deg));
}

export function roomScale(profile, lux) {
 return Math.max(0, lux) / profile.luminance.room_lux;
}

/** Each layer's share of the light under steady excitation (sums to 1). */
export function layerShares(profile) {
 const {amplitudes: a, taus_s: tau, layer} = profile.phosphor.impulse;
 const shares = profile.phosphor.layers.map(() => 0);
 a.forEach((ai, i) => { shares[layer[i]] += ai * tau[i]; });
 const total = shares.reduce((s, v) => s + v, 0);
 return shares.map(v => v / total);
}

/** Display colour (linear sRGB) of a steady image, per unit luminance. */
export function steadyRGBPerY(profile) {
 const shares = layerShares(profile);
 return [0, 1, 2].map(c => profile.phosphor.layers.reduce((s, L, l) => s + shares[l] * L.display_rgb_per_Y[c], 0));
}

/** Exposure that brings the brightest line core at full drive (contrast 1) to
 * the display's maximum in its brightest channel, as the eye adapts to a lit
 * screen. One constant: every ratio (levels, afterglow, room reflection) is kept. */
export function adaptedExposure(profile) {
 const peak = profile.raster.pitch_mm / (Math.sqrt(2 * Math.PI) * spotSigmaMm(profile, 1));
 return 1 / (profile.luminance.full_drive_relative * peak * Math.max(...intoGamut(steadyRGBPerY(profile))));
}

/** Bring a linear-sRGB colour into the display's gamut: if a channel is
 * negative, move toward the grey of equal luminance just far enough; hue and
 * luminance are kept. Colours already inside are returned unchanged. Mirrored
 * in DISPLAY_FS. */
export function intoGamut(rgb) {
 const lo = Math.min(...rgb);
 if (lo >= 0) return rgb;
 const Y = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
 if (Y <= 0) return [0, 0, 0];
 const t = Y / (Y - lo);
 return rgb.map(v => Y + t * (v - Y));
}

/** Linear-sRGB colour for emitted luminance Y (relative to a white diffuser) of
 * one layer, on top of a grey ambient reflection. Phosphors outside sRGB carry
 * their display colour in the profile (P39: the display's green primary); above
 * the display's maximum a channel clips, keeping the hue. */
export function displayColor(Y, ambient, rgbPerY = [0, 1 / .7152, 0]) {
 return intoGamut(rgbPerY.map(k => ambient + Y * k)).map(v => clamp(v, 0, 1));
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

/* Vectrex vector display: the physics, as pure functions.
 *
 * Every number comes from profiles/vectrex.json (tools/vectrex.py):
 *  - the beam draws each line at one speed, so a line lays down charge in
 *    proportion to current / speed per millimetre, and stops for a moment at
 *    its end, leaving a brighter dot;
 *  - each 1/50 s round draws the whole display list; a list longer than the
 *    round slows the refresh (and the picture dims and flickers);
 *  - the phosphor is far faster than a round: each round shows the lines drawn in it;
 *  - the spot is a Gaussian, so a line's cross-section is a Gaussian and its
 *    ends fade over the spot width.
 * Light is relative to the core of a long line at full current and 50 Hz. Mirrored in shaders.js. */

import {requireFields, ROOM_FIELDS} from '../contract.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SQRT2PI = Math.sqrt(2 * Math.PI);

export const PROFILE_FIELDS = Object.freeze([
 ...ROOM_FIELDS,
 'timing.frame_s', 'timing.vector_s', 'beam.speed_mm_per_s', 'beam.dwell_s', 'beam.sigma_mm',
 'picture.height_mm', 'phosphor.display_rgb_per_Y', 'faceplate.screen_reflectance', 'faceplate.transmission',
 'luminance.full_drive_cd_m2', 'luminance.white_diffuser_cd_m2', 'luminance.room_lux',
 'controls.brightness.value', 'oblique.front_index'
]);

export function checkProfile(profile) {
 if (profile?.model !== 'vector-xy') throw new TypeError('A vector (XY) display profile is required');
 return requireFields(profile, PROFILE_FIELDS, 'Vector display');
}


// ===========================================================================
// Timing: one round per display list
// ===========================================================================

/** Seconds to draw a list of n vectors: the 1/50 s round, or longer when the list overruns it. */
export const roundTime = (profile, n) => Math.max(profile.timing.frame_s, n * profile.timing.vector_s);
export const refreshHz = (profile, n) => 1 / roundTime(profile, n);


// ===========================================================================
// Light from one line
// ===========================================================================

const erf = x => {
 const t = 1 / (1 + .3275911 * Math.abs(x));
 const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x);
 return Math.sign(x) * y;
};

/** Dot at a line's end, relative to a long line's core: dwell x speed over the
 * spot's line spread (sqrt(2 pi) sigma). */
export const dotStrength = profile =>
 profile.beam.dwell_s * profile.beam.speed_mm_per_s / (SQRT2PI * profile.beam.sigma_mm);

/**
 * Light at point (x, y) from a line from (x0, y0) to (x1, y1), all in the same
 * length unit, with spot sigma in that unit: relative to a long line's core.
 * A long line's core is 1; its end dot peaks at dotStrength.
 */
export function lineLight(x, y, [x0, y0, x1, y1], sigma, dot) {
 const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
 const ux = L > 0 ? dx / L : 1, uy = L > 0 ? dy / L : 0;
 const px = x - x0, py = y - y0, along = px * ux + py * uy, across = -px * uy + py * ux;
 const s2 = sigma * Math.SQRT2;
 const line = Math.exp(-across * across / (2 * sigma * sigma)) * .5 * (erf((L - along) / s2) - erf(-along / s2));
 const ex = x - x1, ey = y - y1;
 return line + dot * Math.exp(-(ex * ex + ey * ey) / (2 * sigma * sigma));
}

/** Monitor millimetres per panel millimetre: the picture's height fills the panel. */
export const monitorPerPanel = (profile, panelHeightMm) => profile.picture.height_mm / panelHeightMm;

/** Light relative to a long full-current line at 50 Hz, for a brightness knob
 * setting and the list's refresh: charge per round x rounds per second. */
export const lightScale = (profile, brightness, n) =>
 brightness * refreshHz(profile, n) * profile.timing.frame_s;

/** The room's reflection: through the glass to the phosphor and back, relative to a white card. */
export const ambient = (profile, lux) =>
 profile.faceplate.screen_reflectance * profile.faceplate.transmission ** 2 * Math.max(0, lux) / profile.luminance.room_lux;

/** Full-current line core relative to a white card at the profile's room light. */
export const fullRelative = profile => profile.luminance.full_drive_cd_m2 / profile.luminance.white_diffuser_cd_m2;

/** Exposure as the eye adapts to the screen: a full-current line core just reaches the display's maximum. */
export const adaptedExposure = profile => 1 / (fullRelative(profile) * Math.max(...profile.phosphor.display_rgb_per_Y));

/* Nintendo Game Boy Color CGB-001 reflective HR-TFT: the physics, as pure functions.
 *
 * Every number comes from profiles/cgb-001-tft.json, which tools/cgb001_profile.mjs
 * copies from Retro Display Lab (Apache-2.0, copyright 2026 JohnnySun; see
 * third_party/retro-display-lab/NOTICE). The integration follows its CGB-001
 * reference (WS1 colour, WS4 response, WS5 exposure, WS6 aperture):
 *  - each pixel takes the art at its centre, and the art's sRGB channels are
 *    the raw RGB555 codes a game writes (0..31);
 *  - each channel of each pixel carries a state s in [0, 1] that moves toward
 *    code/31 at a first-order rate, once per GBC frame (59.7275 Hz). The rate is
 *    frozen for a constant target, addressed by the code nearest s when the
 *    target last changed;
 *  - what the eye sees over a frame is the frame average of the measured
 *    colour table along that path (absolute XYZ reflectance, D65, 45/0);
 *  - each pixel is three equal stripes, R G B left to right.
 * Mirrored in shaders.js. */

import {requireFields, ROOM_FIELDS} from '../contract.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));


// ===========================================================================
// Profile
// ===========================================================================

export const PROFILE_FIELDS = Object.freeze([
 ...ROOM_FIELDS,
 'panel.pixels', 'panel.pitch_mm', 'panel.frame_s',
 'colour.table_size', 'colour.xyz_f32_base64',
 'response.rates_per_s_f32_base64', 'response.snap',
 'aperture.stripes', 'oblique.front_index'
]);

export function checkProfile(profile) {
 if (profile?.model !== 'cgb001-hrtft') throw new TypeError('A Game Boy Color HR-TFT profile is required');
 return requireFields(profile, PROFILE_FIELDS, 'CGB-001');
}

/** The profile's tables as Float32Arrays, decoded once per profile. */
const decoded = new WeakMap();
function floats(base64) {
 const text = atob(base64), out = new Uint8Array(text.length);
 for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
 return new Float32Array(out.buffer);
}
export function tables(profile) {
 if (!decoded.has(profile)) decoded.set(profile, {
  xyz: floats(profile.colour.xyz_f32_base64),
  rates: floats(profile.response.rates_per_s_f32_base64)
 });
 return decoded.get(profile);
}


// ===========================================================================
// Drive: the art's channels as RGB555 codes
// ===========================================================================

/** Codes 0..31 for encoded sRGB components in [0, 1]. */
export const codesFromRGB = rgb => rgb.map(v => Math.round(clamp(v, 0, 1) * 31));

/** Logical pixels covering a panel of w x h mm. */
export const gridSize = (profile, wMm, hMm) =>
 [Math.ceil(wMm / profile.panel.pitch_mm[0]), Math.ceil(hMm / profile.panel.pitch_mm[1])];


// ===========================================================================
// Colour: the measured table, and the display's linear sRGB
// ===========================================================================

/** Absolute XYZ reflectance for a state (three channels in [0, 1]), trilinear. */
export function colourXYZ(profile, s) {
 const {xyz} = tables(profile), n = profile.colour.table_size;
 const x = s.map(v => clamp(v, 0, 1) * (n - 1)), i = x.map(v => Math.min(n - 2, Math.floor(v))), f = x.map((v, k) => v - i[k]);
 const out = [0, 0, 0];
 for (let corner = 0; corner < 8; corner++) {
  const d = [corner & 1, corner >> 1 & 1, corner >> 2 & 1];
  const w = d.reduce((acc, dk, k) => acc * (dk ? f[k] : 1 - f[k]), 1);
  const at = (((i[2] + d[2]) * n + i[1] + d[1]) * n + i[0] + d[0]) * 3;
  for (let c = 0; c < 3; c++) out[c] += w * xyz[at + c];
 }
 return out;
}

/** XYZ (D65) to linear sRGB. */
export const linearRGB = ([X, Y, Z]) => [
 3.2404542 * X - 1.5371385 * Y - .4985314 * Z,
 -.969266 * X + 1.8760108 * Y + .041556 * Z,
 .0556434 * X - .2040259 * Y + 1.0572252 * Z
];


// ===========================================================================
// Response: one GBC frame
// ===========================================================================

export const rate = (profile, startCode, targetCode) => tables(profile).rates[startCode * 32 + targetCode];

/** 2-point Gauss-Legendre over 4 equal parts of a frame. */
export const QUADRATURE = Object.freeze((() => {
 const g = .5 / Math.sqrt(3), out = [];
 for (let k = 0; k < 4; k++) for (const x of [.5 - g, .5 + g]) out.push((k + x) / 4);
 return out;
})());

/**
 * One GBC frame for one pixel.
 * @param {{s:number[], start:number[], target:number[]}} state  s in [0,1]; start and target codes
 * @param {number[]} codes  this frame's target codes
 * @returns {{state, xyz:number[]}} the new state, and the frame-average XYZ the eye sees
 */
export function stepFrame(profile, state, codes) {
 const T = profile.panel.frame_s, snap = profile.response.snap;
 const start = codes.map((c, k) => c === state.target[k] ? state.start[k] : Math.round(clamp(state.s[k], 0, 1) * 31));
 const k = codes.map((c, i) => rate(profile, start[i], c)), goal = codes.map(c => c / 31);
 const at = t => state.s.map((s, i) => goal[i] + (s - goal[i]) * Math.exp(-k[i] * t));
 const xyz = [0, 0, 0];
 for (const u of QUADRATURE) colourXYZ(profile, at(u * T)).forEach((v, c) => { xyz[c] += v / QUADRATURE.length; });
 const s = at(T).map((v, i) => Math.abs(v - goal[i]) < snap ? goal[i] : v);
 return {state: {s, start, target: [...codes]}, xyz};
}

/** A pixel settled on its codes. */
export const settled = codes => ({s: codes.map(c => c / 31), start: [...codes], target: [...codes]});


// ===========================================================================
// Aperture: three equal stripes, R G B left to right
// ===========================================================================

/** The largest stripe contrast the display can show for a pixel's linear
 * colour (at display scale): a stripe carries three times its channel, and no
 * channel may pass the display's white, so the stripes are blended toward the
 * pixel's average just enough. The average colour is always kept. Mirrored in DISPLAY_FS. */
export function stripeContrast(rgb) {
 return rgb.reduce((m, v) => v > 1 / 3 ? Math.min(m, (1 - v) / (2 * v)) : m, 1);
}

export {stripeResolve} from '../../optics/aperture.js';

/** Linear colour a display pixel shows across [u0, u1] x [v0, v1] in logical
 * pixel units, given each logical pixel's linear colour (pixelAt(i, j)). */
export function apertureColour(pixelAt, u0, u1, v0, v1, resolve = 1) {
 const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
 const out = [0, 0, 0];
 for (let j = Math.floor(v0); j < v1; j++) {
  const wy = overlap(v0, v1, j, j + 1);
  for (let i = Math.floor(u0); i < u1; i++) {
   const rgb = pixelAt(i, j), m = resolve * Math.max(0, stripeContrast(rgb)), all = overlap(u0, u1, i, i + 1);
   for (let c = 0; c < 3; c++) {
    const stripe = overlap(u0, u1, i + c / 3, i + (c + 1) / 3);
    out[c] += wy * rgb[c] * ((1 - m) * all + m * 3 * stripe);
   }
  }
 }
 const area = (u1 - u0) * (v1 - v0);
 return out.map(v => v / area);
}

/* NOMAD V105 — balanced monochrome tile brightness.
 * Seven hand-tuned 8-bit grayscale levels, evenly separated by 13 units.
 * The full range is 148–226 instead of the former colour-derived 76–247.
 * Pieces retain their former brightest-to-darkest ordering, while dark
 * pieces become readable and bright pieces retain headroom for bevels.
 * No colour components, sRGB hue conversion or game rules are involved.
 */
export const PIECE_LUMINANCE=Object.freeze({
 I:213, // long bar
 J:148, // darkest, now readable
 L:187,
 O:226, // brightest, reserves highlight headroom
 S:200,
 T:161,
 Z:174
});
export function pieceLuminance(kind){
 return PIECE_LUMINANCE[kind]??PIECE_LUMINANCE.T;
}

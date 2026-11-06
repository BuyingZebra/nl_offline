/* NOMAD V106 — balanced monochrome tetromino brightness.
 * Hand-tuned 8-bit grayscale, equal 18-unit steps between 129 and 237.
 * Preserves the existing brightness order and independent green/amber tint.
 */
export const PIECE_LUMINANCE=Object.freeze({
 I:219,
 J:129,
 L:183,
 O:237,
 S:201,
 T:147,
 Z:165
});
export function pieceLuminance(kind){
 return PIECE_LUMINANCE[kind]??PIECE_LUMINANCE.T;
}

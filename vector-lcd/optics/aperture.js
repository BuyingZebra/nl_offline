/* Colour stripes on a display that may not resolve them.
 *
 * A colour screen (the Game Boy Color's R G B stripes, a colour CRT's slot
 * mask) puts each colour on its own third of a period. A stripe needs at least
 * two display pixels to be drawn without aliasing into rainbow bands (Nyquist),
 * so stripes fade in from 2 to 3 display pixels per stripe; below that each
 * period shows its average colour. Mirrored in the shaders as uResolve. */

/** How far the stripes are drawn (0 to 1), for display pixels per period of three stripes. */
export const stripeResolve = pxPerPeriod => Math.min(1, Math.max(0, pxPerPeriod / 3 - 2));

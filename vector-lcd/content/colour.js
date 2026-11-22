/* Colour version of a tile, for colour screens (Game Boy Color).
 *
 * Same shapes and shading as the grey art: the tile's body (its first fill)
 * takes the piece's standard Tetris colour, lighter tones blend toward white
 * and darker tones toward black by how far they sit from the body. */

/** Standard Tetris piece colours (Tetris Guideline). */
export const PIECE_COLOURS = Object.freeze({
 I: [0, 240, 240], O: [240, 240, 0], T: [160, 0, 240], S: [0, 240, 0],
 Z: [240, 0, 0], J: [0, 0, 240], L: [240, 160, 0]
});

const FILL = /fill="rgb\((\d+),\d+,\d+\)"/g;

export function colourSVG(svg, rgb) {
 const greys = [...svg.matchAll(FILL)].map(m => Number(m[1]));
 if (!greys.length) return svg;
 const body = greys[0];
 return svg.replace(FILL, (_, v) => {
  const g = Number(v);
  const c = g >= body
   ? rgb.map(x => x + (255 - x) * (g - body) / Math.max(1, 255 - body))
   : rgb.map(x => x * g / Math.max(1, body));
  return 'fill="rgb(' + c.map(Math.round).join(',') + ')"';
 });
}

/* Content for vector-input screens: shapes in drive levels, placed in panel
 * millimetres. The design decisions live here, before the processor:
 *
 *   tetrisScene(game)              NOMAD Tetris: one solid square per cell, each
 *                                  piece in one of the four drive levels
 *   cardScene(card, star, timeMs)  a test card from an SVG file, with a turning star
 *
 * A scene is [{shape, matrix}]: a shape as vector/svg.js reads it (or built
 * here), and the matrix from its units to panel millimetres. */

import {parsePath} from '../vector/geometry.js';
import {GLYPHS} from './glyphs.js';
import {BOARD, CELL, PANEL, COUNTER_BASELINE, occupiedCells} from './tetris.js';

/** Drive level of each piece: 0 white, 1 light, 2 dark, 3 black. White is the
 * unlit panel, so pieces use the other three. A design choice: change it here. */
export const PIECE_LEVELS = Object.freeze({I: 3, O: 2, T: 1, S: 2, Z: 3, J: 1, L: 3});

/** Gap (mm) between neighbouring squares, so cells read as cells. */
const CELL_GAP = .35;
const FRAME_WIDTH = .35;           // mm, as on the picture screens
const COUNTER_SIZE = 3.2;          // mm per em, as on the picture screens

const translate = (x, y, s = 1) => [s, 0, 0, s, x, y];

/** One filled outline, in drive level `value`. */
const filled = (d, value, rule = 'nonzero') => ({fill: {subpaths: parsePath(d), rule, value}, stroke: null});

/** A square cell, the same shape for every cell (so its flattening is cached once). */
const SQUARES = [0, 1, 2, 3].map(v => {
 const a = CELL_GAP / 2, b = CELL - CELL_GAP / 2;
 return filled(`M${a} ${a}H${b}V${b}H${a}Z`, v);
});

const FRAME = {
 fill: null,
 stroke: {subpaths: parsePath(`M${BOARD.x - .6} ${BOARD.y - .6}h${BOARD.cols * CELL + 1.2}v${BOARD.rows * CELL + 1.2}h${-(BOARD.cols * CELL + 1.2)}Z`),
  width: FRAME_WIDTH, cap: 'butt', join: 'miter', miterLimit: 4, value: 3}
};

/** Glyph outlines of the bundled bold font, as black shapes in font units. */
const GLYPH_SHAPES = Object.fromEntries(Object.entries(GLYPHS.glyphs).filter(([, g]) => g.d).map(([ch, g]) => [ch, filled(g.d, 3)]));

/** Text as glyph outlines, baseline at y, starting at x (mm). */
function text(string, x, y, size = COUNTER_SIZE) {
 const s = size / GLYPHS.unitsPerEm, out = [];
 for (const ch of string) {
  const g = GLYPHS.glyphs[ch];
  if (!g) continue;
  if (GLYPH_SHAPES[ch]) out.push({shape: GLYPH_SHAPES[ch], matrix: translate(x, y, s)});
  x += g.advance * s;
 }
 return out;
}
const textWidth = (string, size = COUNTER_SIZE) => [...string].reduce((w, ch) => w + (GLYPHS.glyphs[ch]?.advance ?? 0), 0) * size / GLYPHS.unitsPerEm;

/** NOMAD Tetris as shapes: the frame, a square per occupied cell, the counters. */
export function tetrisScene(game) {
 const out = [{shape: FRAME, matrix: translate(0, 0)}];
 for (const {col, row, kind} of occupiedCells(game))
  out.push({shape: SQUARES[PIECE_LEVELS[kind] ?? 3], matrix: translate(BOARD.x + col * CELL, BOARD.y + row * CELL)});
 const score = String(game.score).padStart(6, '0');
 out.push(...text('LINES ' + String(game.lines).padStart(3, '0'), BOARD.x, COUNTER_BASELINE));
 out.push(...text(score, BOARD.x + BOARD.cols * CELL - textWidth(score), COUNTER_BASELINE));
 return out;
}

/** A test card (read by vector/svg.js) filling the panel, with the star turning
 * once every 12 s at its centre: moving edges show the crystal's response. */
export function cardScene(card, star, timeMs) {
 const sx = PANEL.w / card.width, sy = PANEL.h / card.height, out = [];
 for (const shape of card.shapes) out.push({shape, matrix: [sx, 0, 0, sy, 0, 0]});
 if (star) {
  const a = timeMs / 12000 * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
  // The star fills a 236-unit circle centred at (240, 330) on the card; its own
  // centre is (h, h) once its viewBox origin is moved to (0, 0).
  const k = 236 * sx / star.width, cx = 240 * sx, cy = 330 * sy, h = star.width / 2;
  out.push(...star.shapes.map(shape => ({shape, matrix: [k * c, k * s, -k * s, k * c,
   cx - k * (c * h - s * h), cy - k * (s * h + c * h)]})));
 }
 return out;
}

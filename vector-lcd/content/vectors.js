/* NOMAD Tetris as a vector display list, for screens that draw lines instead
 * of scanning a raster (the Vectrex).
 *
 *   tetrisVectors(game) -> [[x0, y0, x1, y1], ...] in panel millimetres
 *
 * The board frame, one square per occupied cell, and the counters in a stroke
 * font: what a vector game would draw each frame. */

import {BOARD, CELL, PANEL} from './tetris.js';

const INSET = .45;                 // mm between a cell's square and its neighbour's
const GLYPH = {w: 1.6, h: 3.0, gap: .7};
const BASELINE = PANEL.h - 2.2;

/** Stroke font: each glyph as polylines in a 2 x 4 grid (x right, y down). */
const STROKES = {
 0: [[[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]], [[2, 0], [0, 4]]],
 1: [[[1, 0], [1, 4]], [[0, 1], [1, 0]]],
 2: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 4], [2, 4]]],
 3: [[[0, 0], [2, 0], [2, 4], [0, 4]], [[0, 2], [2, 2]]],
 4: [[[0, 0], [0, 2], [2, 2]], [[2, 0], [2, 4]]],
 5: [[[2, 0], [0, 0], [0, 2], [2, 2], [2, 4], [0, 4]]],
 6: [[[2, 0], [0, 0], [0, 4], [2, 4], [2, 2], [0, 2]]],
 7: [[[0, 0], [2, 0], [2, 4]]],
 8: [[[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]], [[0, 2], [2, 2]]],
 9: [[[2, 2], [0, 2], [0, 0], [2, 0], [2, 4], [0, 4]]],
 L: [[[0, 0], [0, 4], [2, 4]]],
 I: [[[1, 0], [1, 4]], [[0, 0], [2, 0]], [[0, 4], [2, 4]]],
 N: [[[0, 4], [0, 0], [2, 4], [2, 0]]],
 E: [[[2, 0], [0, 0], [0, 4], [2, 4]], [[0, 2], [1.5, 2]]],
 S: [[[2, 0], [0, 0], [0, 2], [2, 2], [2, 4], [0, 4]]],
 ' ': []
};

function polylines(lines, out) {
 for (const line of lines) for (let i = 1; i < line.length; i++) out.push([...line[i - 1], ...line[i]]);
}

function text(string, x, out) {
 const sx = GLYPH.w / 2, sy = GLYPH.h / 4, top = BASELINE - GLYPH.h;
 for (const ch of string) {
  polylines(STROKES[ch].map(l => l.map(([u, v]) => [x + u * sx, top + v * sy])), out);
  x += GLYPH.w + GLYPH.gap;
 }
 return x;
}

const textWidth = string => string.length * (GLYPH.w + GLYPH.gap) - GLYPH.gap;

/** @param {object} game  the content's Core.Game */
export function tetrisVectors(game) {
 const out = [];
 const x0 = BOARD.x - .6, y0 = BOARD.y - .6, x1 = BOARD.x + BOARD.cols * CELL + .6, y1 = BOARD.y + BOARD.rows * CELL + .6;
 polylines([[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]], out);

 const cell = (c, r) => {
  const x = BOARD.x + c * CELL + INSET / 2, y = BOARD.y + r * CELL + INSET / 2, s = CELL - INSET;
  polylines([[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]], out);
 };
 for (let r = 0; r < BOARD.rows; r++) for (let c = 0; c < BOARD.cols; c++) if (game.board[r][c]) cell(c, r);
 const p = game.current;
 if (p) for (let iy = 0; iy < p.matrix.length; iy++) for (let ix = 0; ix < p.matrix[iy].length; ix++) {
  const r = p.y + iy, c = p.x + ix;
  if (p.matrix[iy][ix] && r >= 0 && r < BOARD.rows && c >= 0 && c < BOARD.cols) cell(c, r);
 }

 const lines = 'LINES ' + String(game.lines).padStart(3, '0'), score = String(game.score).padStart(6, '0');
 text(lines, BOARD.x, out);
 text(score, BOARD.x + BOARD.cols * CELL - textWidth(score), out);
 return out;
}

/* NOMAD Tetris as screen content: the real game rules (tetris/game.js) on a
 * simple autoplay, drawn in panel millimetres with the game's own tiles.
 *
 *   createTetrisContent(tiles)
 *     .update(dtMs)              advance the game
 *     .draw(ctx, tileSet)        paint the board and counters (unlit = white)
 *     .drawElectrodes(ctx)       where the glass can switch, for segment screens */

import {Core} from '../../tetris/game.js';
import {SHAPED_PIECES} from './tiles.js';

export const CELL = 4;                                               // mm per board cell
export const BOARD = Object.freeze({x: 4, y: 6, cols: Core.COLS, rows: Core.ROWS});
export const PANEL = Object.freeze({w: BOARD.x * 2 + BOARD.cols * CELL, h: BOARD.y + BOARD.rows * CELL + 6});

const COUNTER_FONT = '700 3.2px ui-monospace,Menlo,Consolas,monospace';
const COUNTER_BASELINE = PANEL.h - 2.2;
const AUTOPLAY_STEP_MS = 70;
const SEED = 20261118;
const ELECTRODE_THRESHOLD = 188;   // darker than 50% luminance switches on (static drive)


// ===========================================================================
// Board geometry shared by the content and its electrodes
// ===========================================================================

function strokeFrame(ctx) {
 ctx.strokeRect(BOARD.x - .6, BOARD.y - .6, BOARD.cols * CELL + 1.2, BOARD.rows * CELL + 1.2);
}

/** "LINES 000" at the left, the score at the right, on the bottom line. */
function fillCounters(ctx, lines, score) {
 ctx.font = COUNTER_FONT;
 ctx.textBaseline = 'alphabetic';
 ctx.fillText('LINES ' + lines, BOARD.x, COUNTER_BASELINE);
 ctx.fillText(score, BOARD.x + BOARD.cols * CELL - ctx.measureText(score).width, COUNTER_BASELINE);
}

/** Same mapping the game uses when it locks an I piece (game.js iSourceIndex). */
function iSourceIndex(rotation, x, y) {
 if (rotation === 0) return y === 1 ? x : null;
 if (rotation === 1) return x === 2 ? y : null;
 if (rotation === 2) return y === 2 ? 3 - x : null;
 if (rotation === 3) return x === 1 ? 3 - y : null;
 return null;
}


// ===========================================================================
// Content
// ===========================================================================

/** @param {import('./tiles.js').Tiles} tiles */
export function createTetrisContent(tiles) {
 let seed = SEED;
 const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
 const game = new Core.Game(rng);
 game.start();
 let plan = null, actClock = 0;
 const cellElectrode = electrodeCell(tiles.original);


 // ---- Autoplay: pick a rotation and column per piece, then walk it there ----

 function choosePlan() {
  plan = {piece: game.current?.id, rotation: Math.floor(rng() * 4), x: Math.floor(rng() * (BOARD.cols - 2))};
 }

 function update(dtMs) {
  if (game.status === 'over') { game.reset(); game.start(); plan = null; }
  if (game.status !== 'playing' || !game.current) return;
  if (!plan || plan.piece !== game.current.id) choosePlan();
  actClock += dtMs;
  while (actClock >= AUTOPLAY_STEP_MS) {
   actClock -= AUTOPLAY_STEP_MS;
   const p = game.current;
   if (!p) break;
   if (p.rotation !== plan.rotation && p.kind !== 'O') { if (!game.rotate(1)) plan.rotation = p.rotation; }
   else if (p.x !== plan.x) { if (!game.move(Math.sign(plan.x - p.x))) plan.x = p.x; }
   else game.softDrop();
  }
  game.tick(dtMs);
 }


 // ---- Drawing -------------------------------------------------------------

 function drawCell(ctx, set, col, row, kind, meta) {
  const image = kind === 'I' ? set.I[meta?.sourceIndex ?? 0]?.[meta?.rotation ?? 0] : set[kind];
  if (image) ctx.drawImage(image, BOARD.x + col * CELL, BOARD.y + row * CELL, CELL, CELL);
 }

 /** @param {CanvasRenderingContext2D} ctx in millimetres @param {import('./tiles.js').TileSet} set */
 function draw(ctx, set) {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = .35;
  strokeFrame(ctx);

  for (let r = 0; r < BOARD.rows; r++) for (let c = 0; c < BOARD.cols; c++) {
   const kind = game.board[r][c];
   if (kind) drawCell(ctx, set, c, r, kind, game.boardMeta[r][c]);
  }

  const p = game.current;
  if (p) for (let iy = 0; iy < p.matrix.length; iy++) for (let ix = 0; ix < p.matrix[iy].length; ix++) {
   const kind = p.matrix[iy][ix], r = p.y + iy, c = p.x + ix;
   if (!kind || r < 0 || r >= BOARD.rows || c < 0 || c >= BOARD.cols) continue;
   drawCell(ctx, set, c, r, kind, kind === 'I' ? {sourceIndex: iSourceIndex(p.rotation, ix, iy), rotation: p.rotation} : null);
  }

  ctx.fillStyle = '#000';
  fillCounters(ctx, String(game.lines).padStart(3, '0'), String(game.score).padStart(6, '0'));
 }

 /** Every point some content can switch: any tile design in any cell, the
  * frame, and every digit the counters can show. */
 function drawElectrodes(ctx) {
  ctx.lineWidth = .35;
  strokeFrame(ctx);
  for (let r = 0; r < BOARD.rows; r++) for (let c = 0; c < BOARD.cols; c++)
   ctx.drawImage(cellElectrode, BOARD.x + c * CELL, BOARD.y + r * CELL, CELL, CELL);
  for (let d = 0; d < 10; d++) fillCounters(ctx, String(d).repeat(3), String(d).repeat(6));
 }

 return Object.freeze({update, draw, drawElectrodes, game});
}


/** One cell's electrode mask: the union of every tile design's switchable area. */
function electrodeCell(set, size = 144) {
 const out = document.createElement('canvas');
 out.width = out.height = size;
 const octx = out.getContext('2d'), mask = octx.createImageData(size, size);
 const temp = document.createElement('canvas');
 temp.width = temp.height = size;
 const t = temp.getContext('2d', {willReadFrequently: true});
 const designs = [...SHAPED_PIECES.map(k => set[k]), ...set.I.flat()];
 for (const image of designs) {
  t.fillStyle = '#fff';
  t.fillRect(0, 0, size, size);
  t.drawImage(image, 0, 0, size, size);
  const d = t.getImageData(0, 0, size, size).data;
  for (let i = 0; i < d.length; i += 4) {
   if (d[i] < ELECTRODE_THRESHOLD) mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = mask.data[i + 3] = 255;
  }
 }
 octx.putImageData(mask, 0, 0);
 return out;
}

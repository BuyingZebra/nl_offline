import {KINDS} from '/vector-lcd/app/screens.js';
import {loadTiles} from '/vector-lcd/content/tiles.js';
import {createTetrisContent, PANEL} from '/vector-lcd/content/tetris.js';
import {tetrisScene} from '/vector-lcd/content/scenes.js';
export async function repro(kind, switchTo, seconds) {
 const profile = await (await fetch('/vector-lcd/profiles/dmg-01-stn.json')).json();
 const content = createTetrisContent(await loadTiles());
 const canvas = document.createElement('canvas'); document.body.append(canvas);
 const r = KINDS[kind].createRenderer(canvas, {profile, widthMm: PANEL.w, heightMm: PANEL.h});
 r.resize(200, 384, 1);
 r.setLighting({angleDeg: 19, azimuthDeg: 307, sourceDeg: 15});
 let t = 1000;
 const frame = () => { content.update(1000 / 60 * 2); if (kind === 'dmgv') r.setScene(tetrisScene(content.game)); r.frame(t += 1000 / 30); };
 for (let i = 0; i < 30 * 4; i++) frame();          // 4 s at x1.00
 r.setContrast(switchTo);
 for (let i = 0; i < 30 * seconds; i++) frame();
 // Compare every board cell's shown state with what the current board says.
 const {BOARD, CELL} = await import('/vector-lcd/content/tetris.js');
 let stuck = 0, empty = 0;
 for (let row = 0; row < BOARD.rows; row++) for (let col = 0; col < BOARD.cols; col++) {
  const x = BOARD.x + (col + .5) * CELL, y = BOARD.y + (row + .5) * CELL;
  const occupied = content.game.board[row][col] || 0;
  if (occupied) continue;
  empty++;
  const s = r.sample(x, y);
  if (s.shade !== 0) stuck++;
 }
 const gl = canvas.getContext('webgl2'), i = r.info(), px = new Uint8Array(i.width * i.height * 4);
 gl.readPixels(0, 0, i.width, i.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
 const c2 = document.createElement('canvas'); c2.width = i.width; c2.height = i.height;
 const img = c2.getContext('2d').createImageData(i.width, i.height);
 for (let y = 0; y < i.height; y++) img.data.set(px.subarray((i.height - 1 - y) * i.width * 4, (i.height - y) * i.width * 4), y * i.width * 4);
 c2.getContext('2d').putImageData(img, 0, 0);
 return {stuck, empty, score: content.game.score, url: c2.toDataURL()};
}

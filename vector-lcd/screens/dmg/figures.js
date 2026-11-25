/* DMG-01 figures for the Info tab, drawn from the profile and the model, so they
 * always show what the screen does. Each is {title, svg, caption}: svg is markup
 * built here from numbers (no outside images), caption says where each value
 * comes from. In the spirit of BGB's "reality" page figures, redrawn from our data. */

import {linearPalette, colorAt, targetQ, stepFrame, shownCoordinate} from './model.js';
import {entryOffsetMm} from '../../optics/room.js';

const enc = v => Math.round(255 * (v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - .055));
const hex = c => '#' + c.map(v => Math.min(255, Math.max(0, enc(v))).toString(16).padStart(2, '0')).join('');
const Y = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
const text = (x, y, s, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${esc(s)}</text>`;
const NAMES = ['White', 'Light', 'Dark', 'Black'];


/** BGB's five measured colours, and the path between them in linear light. */
function measured(P) {
 const c = linearPalette(P), names = ['LCD off', ...NAMES], w = 64, gap = 8, x0 = 0;
 let s = '';
 c.forEach((col, i) => {
  const x = x0 + i * (w + gap);
  s += `<rect x="${x}" y="0" width="${w}" height="${w}" rx="6" fill="${hex(col)}"/>`;
  s += text(x, w + 16, names[i], 'class="fig-label"');
  s += text(x, w + 30, hex(col), 'class="fig-note"');
 });
 // The path: off -> white -> ... -> black, linear light, as the screen blends it.
 const stops = c.map((col, i) => `<stop offset="${(i / 4 * 100).toFixed(0)}%" stop-color="${hex(col)}"/>`).join('');
 const mid = [];
 for (let i = 0; i <= 40; i++) {
  const f = i / 40 * 4, k = Math.min(3, Math.floor(f)), t = f - k;
  mid.push(`<stop offset="${(i / 40 * 100).toFixed(1)}%" stop-color="${hex(c[k].map((v, ch) => v + (c[k + 1][ch] - v) * t))}"/>`);
 }
 const W = 5 * w + 4 * gap;
 s += `<defs><linearGradient id="figPath">${mid.join('') || stops}</linearGradient></defs>`;
 s += `<rect x="0" y="${w + 44}" width="${W}" height="22" rx="4" fill="url(#figPath)"/>`;
 s += text(0, w + 82, 'lighter', 'class="fig-note"') + text(W, w + 82, 'darker', 'class="fig-note" text-anchor="end"');
 return {title: 'The measured colours', svg: `<svg viewBox="-2 -2 ${W + 4} ${w + 90}" role="img" aria-label="BGB's five measured DMG colours">${s}</svg>`,
  caption: 'BGB photographed a real DMG under colour-accurate light, corrected to true colour and brightness with a ColorChecker, '
   + 'defocused at 1/60 s so each patch is the average of dots and gaps. These five are the only calibrated DMG colours anywhere. '
   + 'The strip is the path the screen takes between them, in linear light.'};
}


/** An idealised close-up: dots and the gaps between them, and what the eye averages. */
function closeUp(P) {
 const pal = linearPalette(P), off = pal[0], fill = .875, gap = 1 - fill * fill;
 // A dot's own colour: BGB's whole-pixel average with the gap colour taken out.
 const dot = s => pal[s + 1].map((v, i) => Math.max(0, (v - gap * off[i]) / (1 - gap)));
 const grid = [[0, 1, 2, 3], [1, 2, 3, 3], [0, 0, 1, 2], [0, 1, 1, 0]], cell = 36, inner = cell * fill;
 let s = `<rect x="0" y="0" width="${4 * cell}" height="${4 * cell}" fill="${hex(off)}"/>`;
 grid.forEach((row, j) => row.forEach((sh, i) => {
  s += `<rect x="${i * cell + (cell - inner) / 2}" y="${j * cell + (cell - inner) / 2}" width="${inner}" height="${inner}" fill="${hex(dot(sh))}"/>`;
 }));
 const X = 4 * cell + 28;
 grid.forEach((row, j) => row.forEach((sh, i) => {
  s += `<rect x="${X + i * cell}" y="${j * cell}" width="${cell}" height="${cell}" fill="${hex(pal[sh + 1])}"/>`;
 }));
 s += text(0, 4 * cell + 16, 'up close (idealised)', 'class="fig-label"') + text(X, 4 * cell + 16, 'what the eye sees', 'class="fig-label"');
 const pitch = P.panel.active_mm[0] / P.panel.dots[0];
 return {title: 'Dots and gaps', svg: `<svg viewBox="-2 -2 ${X + 4 * cell + 4} ${4 * cell + 24}" role="img" aria-label="Idealised close-up of DMG dots">${s}</svg>`,
  caption: 'Dots are ' + (pitch * 1000).toFixed(0) + ' µm apart (Nintendo: ' + P.panel.active_mm.join(' × ') + ' mm, ' + P.panel.dots.join(' × ') + ' dots). '
   + 'The gaps are never driven, so they show the LCD-off colour; BGB notes that this makes each dot bluer than the average you see. '
   + 'The gap width is unknown (BGB\'s drawing, ' + (fill * 100).toFixed(1) + '% fill, is its own guess). Our screen draws no grid: '
   + 'it shows what the eye averages, so modern art stays clean.'};
}


/** The contrast wheel: the four shades, settled, at positions across the wheel. */
function wheel(P, renderer) {
 const W = [.85, .88, .9, .92, .95, .97, 1, 1.03, 1.05, 1.08], cell = 34, gapX = 4, lab = 54, now = renderer?.contrast ?? 1;
 let s = '';
 NAMES.forEach((n, i) => { s += text(lab + i * (cell + gapX) + cell / 2, 10, n, 'class="fig-note" text-anchor="middle"'); });
 W.forEach((w, j) => {
  const y = 18 + j * (cell * .62 + 4), h = cell * .62, near = Math.abs(w - now) < .005;
  s += text(lab - 8, y + h * .72, '×' + w.toFixed(2), `class="${near ? 'fig-label' : 'fig-note'}" text-anchor="end"`);
  for (let i = 0; i < 4; i++) {
   const c = colorAt(P, targetQ(P, i, w));
   s += `<rect x="${lab + i * (cell + gapX)}" y="${y}" width="${cell}" height="${h}" rx="3" fill="${hex(c)}"><title>${esc(NAMES[i] + ' at ×' + w.toFixed(2) + ': ' + hex(c))}</title></rect>`;
  }
  if (near) s += `<rect x="${lab - 3}" y="${y - 3}" width="${4 * cell + 3 * gapX + 6}" height="${h + 6}" rx="5" fill="none" class="fig-mark"/>`;
 });
 const H = 18 + W.length * (cell * .62 + 4);
 return {title: 'The contrast wheel', svg: `<svg viewBox="0 0 ${lab + 4 * (cell + gapX) + 4} ${H + 4}" role="img" aria-label="The four shades across the contrast wheel">${s}</svg>`,
  caption: 'Each row is the four shades settled at one wheel position (the outlined row is the current setting). '
   + 'The solver decides how bright each shade is; the colour is BGB\'s measured path at that brightness. '
   + 'Low: everything settles to the LCD-off colour, as BGB describes and real units show. High: everything darkens toward a dimmed black.'};
}


/** Inside the screen: the layers, not to scale, with where each value comes from. */
function layers(P, renderer) {
 const G = P.sources.geometry, L = P.lens, light = renderer?.lighting ?? {angleDeg: 19, azimuthDeg: 307};
 const rows = [
  ['Lens (plastic)', L.thickness_mm + ' mm', 'estimate'],
  ['Air gap', L.gap_mm + ' mm', 'assumed'],
  ['Front polarizer', 'glued to the glass', 'repair reports'],
  ['Front glass', G.glass_mm + ' mm', 'assumed'],
  ['Crystal (supertwisted)', 'about 6 µm', 'source estimate'],
  ['Rear glass', G.glass_mm + ' mm', 'assumed'],
  ['Rear polarizer', G.rear_polarizer_mm + ' mm', 'assumed'],
  ['Reflector (grainy)', '±' + (P.reflector.grain_amplitude * 100).toFixed(1) + '% grain', 'measured from photos']
 ];
 const hgt = [22, 18, 8, 26, 6, 26, 8, 12], fills = ['fig-lens', 'fig-air', 'fig-pol', 'fig-glass', 'fig-lc', 'fig-glass', 'fig-pol', 'fig-refl'];
 let y = 0, s = '';
 const bx = 0, bw = 120, step = 27, lx = bw + 34;
 // Labels evenly spaced on the right, each joined to its layer by a thin leader.
 const total = hgt.reduce((a, h) => a + h, 0) + 6 * (hgt.length - 1), y0 = (total - step * (rows.length - 1)) / 2 - 4;
 rows.forEach((r, i) => {
  s += `<rect x="${bx}" y="${y}" width="${bw}" height="${hgt[i]}" class="${fills[i]}"/>`;
  const ly = y0 + i * step, cy = y + hgt[i] / 2;
  s += `<path d="M ${bw + 2} ${cy} L ${bw + 14} ${cy} L ${lx - 6} ${ly - 3}" class="fig-grid" fill="none"/>`;
  s += text(lx, ly, r[0] + ' · ' + r[1], 'class="fig-label"');
  s += text(lx, ly + 11, r[2], 'class="fig-note"');
  y += hgt[i] + (i === 7 ? 0 : 6);
 });
 y = Math.max(y, y0 + (rows.length - 1) * step + 14);
 // A ray: in at the light angle, out toward the eye, offset at the reflector (schematic).
 const off = entryOffsetMm(P, light.angleDeg, light.azimuthDeg), um = Math.round(Math.hypot(off.x, off.y) * 1000);
 const top = 0, bottom = y - 12, xin = 24, xout = 86;
 s += `<path d="M ${xin - 20} ${top - 18} L ${xin} ${top} L ${(xin + xout) / 2} ${bottom} L ${xout} ${top} L ${xout} ${top - 18}" class="fig-ray"/>`;
 return {title: 'Inside the screen', svg: `<svg viewBox="-4 -22 ${lx + 250} ${y + 30}" role="img" aria-label="The layers of the DMG screen">${s}</svg>`,
  caption: 'Not to scale. Room light passes the lens, crosses the crystal, bounces off the reflector behind the rear glass and crosses the crystal again. '
   + 'At this light angle it leaves about ' + um + ' µm from where it entered, so shapes cast a faint shadow on the reflector. '
   + 'Only the panel\'s size and the reflector grain are measured; the thicknesses are informed assumptions (no DMG has been measured with calipers).'};
}


/** A shade change over time: brightness shown, white to black and back, at 25 °C. */
function response(P) {
 const frames = 30, ms = 1000 / P.panel.refresh_hz, run = (from, to) => {
  let st = {q: targetQ(P, from, 1), ionic: from / 3, shade: from};
  for (let i = 0; i < 600; i++) st = stepFrame(P, st, from, {celsius: 25});
  const y0 = Y(colorAt(P, shownCoordinate(P, st.q, st.ionic, from))), out = [[0, y0]];
  for (let i = 1; i <= frames; i++) { st = stepFrame(P, st, to, {celsius: 25}); out.push([i * ms, Y(colorAt(P, st.exposure))]); }
  return out;
 };
 const series = [{name: 'White to black', pts: run(0, 3), cls: 'fig-line-a'}, {name: 'Black to white', pts: run(3, 0), cls: 'fig-line-b'}];
 const all = series.flatMap(s => s.pts.map(p => p[1])), lo = Math.min(...all), hi = Math.max(...all);
 const W = 300, H = 120, px = t => 34 + t / (frames * ms) * W, py = v => 8 + (1 - (v - lo) / (hi - lo)) * H;
 let s = '';
 // Recessive grid: 0, 100, ... ms; the 10 % and 90 % levels.
 for (let t = 0; t <= frames * ms; t += 100) s += `<line x1="${px(t)}" y1="8" x2="${px(t)}" y2="${8 + H}" class="fig-grid"/>` + text(px(t), H + 22, t + ' ms', 'class="fig-note" text-anchor="middle"');
 for (const f of [.1, .9]) s += `<line x1="${px(0)}" y1="${py(lo + f * (hi - lo))}" x2="${px(frames * ms)}" y2="${py(lo + f * (hi - lo))}" class="fig-grid fig-dash"/>`;
 s += text(30, py(hi) + 4, 'light', 'class="fig-note" text-anchor="end"') + text(30, py(lo) + 4, 'dark', 'class="fig-note" text-anchor="end"');
 series.forEach(se => {
  s += `<polyline points="${se.pts.map(p => px(p[0]).toFixed(1) + ',' + py(p[1]).toFixed(1)).join(' ')}" class="${se.cls}"/>`;
  se.pts.forEach(p => { s += `<circle cx="${px(p[0]).toFixed(1)}" cy="${py(p[1]).toFixed(1)}" r="6" class="fig-hit"><title>${esc(se.name + ', ' + Math.round(p[0]) + ' ms')}</title></circle>`; });
  const end = se.pts.at(-1);
  s += text(px(end[0]) - 2, py(end[1]) + (se.cls === 'fig-line-a' ? -6 : 14), se.name, 'class="fig-label" text-anchor="end"');
 });
 return {title: 'A shade change', svg: `<svg viewBox="0 0 ${W + 60} ${H + 30}" role="img" aria-label="Brightness over time for a shade change">${s}</svg>`,
  caption: 'The brightness the screen shows, frame by frame (DMG frames, 59.73 Hz), when a dot switches between white and black at 25 °C. '
   + 'Dashed lines: 10 % and 90 % of the change. The crystal\'s motion comes from the source\'s solver; its overall speed is matched to the era\'s '
   + 'published STN figures (about 150 ms per change), since no DMG has been timed with instruments.'};
}


/** The figures, in reading order. */
export function figures(P, renderer) {
 return [measured(P), closeUp(P), wheel(P, renderer), layers(P, renderer), response(P)];
}

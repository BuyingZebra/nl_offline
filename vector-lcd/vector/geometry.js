/* Vector input, the pure part: SVG paths as exact geometry, and the triangles
 * that cover them at any resolution. No DOM, no GPU (tested in node).
 *
 *   parsePath(d)                    path data -> subpaths of line and cubic segments
 *   shapePath(tag, attributes)      rect, circle, ellipse, line, polyline, polygon -> path data
 *   transformSubpaths(subs, m)      an affine matrix [a, b, c, d, e, f], as in SVG
 *   flatten(subs, tolerance)        curves -> polylines, no point further than tolerance from the curve
 *   fanTriangles(polys)             triangles for a stencil fill (any shape, holes, either fill rule)
 *   convexTriangles(polys)          triangles for one convex outline, or null
 *   strokeTriangles(polys, stroke)  triangles covering a stroke: width, caps, joins, miter limit
 *   driveIndex(r, g, b)             one of the four drive levels, or null: never rounded
 *
 * Resolution independence: the shapes stay curves until they are drawn, and
 * the drawing chooses the tolerance from the size of a panel dot. */


// ===========================================================================
// The four drive levels: a lookup, never a rounding
// ===========================================================================

/** Grey value of each drive level, as the art states it: white, light, dark, black. */
export const DRIVE_GREYS = Object.freeze([255, 170, 85, 0]);

/** Drive level 0..3 for an exact grey, or null for any other colour. */
export function driveIndex(r, g, b) {
 if (r !== g || g !== b) return null;
 const i = DRIVE_GREYS.indexOf(r);
 return i < 0 ? null : i;
}


// ===========================================================================
// Matrices: [a, b, c, d, e, f] maps (x, y) to (a x + c y + e, b x + d y + f)
// ===========================================================================

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

/** m1 after m2: apply m2 first. */
export function multiply(m1, m2) {
 const [a, b, c, d, e, f] = m1, [A, B, C, D, E, F] = m2;
 return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
}

export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** How much a matrix enlarges lengths, at most (for flattening tolerance). */
export function maxScale(m) {
 const [a, b, c, d] = m, s = (a * a + b * b + c * c + d * d) / 2, det = a * d - b * c;
 return Math.sqrt(s + Math.sqrt(Math.max(0, s * s - det * det)));
}

/** Area scale: a stroke width under a non-uniform scale becomes this times wider (on average). */
export const meanScale = m => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));


// ===========================================================================
// Path data
// ===========================================================================

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const SEPARATOR = /[\s,]*/y;
const ARGUMENTS = {M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0};

/** Reads path data on demand: arc flags are single digits and may touch the
 * next number ("a1 1 0 011 1"), so they cannot be split out in advance. */
function scanner(d) {
 let i = 0;
 const skip = () => { SEPARATOR.lastIndex = i; SEPARATOR.exec(d); i = SEPARATOR.lastIndex; };
 skip();
 return {
  done: () => i >= d.length,
  command() {
   const c = d[i];
   if (c && /[MmLlHhVvCcSsQqTtAaZz]/.test(c)) { i++; skip(); return c; }
   return null;
  },
  number() {
   NUMBER.lastIndex = i;
   const m = NUMBER.exec(d);
   if (!m) throw new SyntaxError('Path data: expected a number at "' + d.slice(i, i + 12) + '"');
   i = NUMBER.lastIndex; skip();
   return Number(m[0]);
  },
  flag() {
   const c = d[i];
   if (c !== '0' && c !== '1') throw new SyntaxError('Path data: expected an arc flag at "' + d.slice(i, i + 12) + '"');
   i++; skip();
   return c === '1' ? 1 : 0;
  }
 };
}

/** Endpoint arc to cubic Bézier segments (SVG implementation notes, F.6). */
function arcToCubics(x1, y1, rx, ry, phiDeg, largeArc, sweep, x2, y2) {
 if (x1 === x2 && y1 === y2) return [];
 rx = Math.abs(rx); ry = Math.abs(ry);
 if (!rx || !ry) return [{type: 'L', p: [x2, y2]}];
 const phi = phiDeg * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
 const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
 const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
 const lambda = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
 if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }
 const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
 const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
 const k = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
 const cxp = k * rx * y1p / ry, cyp = -k * ry * x1p / rx;
 const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
 const angle = (ux, uy, vx, vy) => {
  const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  return a;
 };
 const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
 let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
 if (!sweep && dt > 0) dt -= 2 * Math.PI;
 if (sweep && dt < 0) dt += 2 * Math.PI;
 // Pieces of at most 22.5 degrees: each cubic stays within 1e-7 of the radius,
 // far below any dot, so arcs stay exact at any scale that matters.
 const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 8) - 1e-9)), step = dt / n;
 const h = 4 / 3 * Math.tan(step / 4);
 const point = t => {
  const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
  return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy];
 };
 const deriv = t => {
  const ex = -rx * Math.sin(t), ey = ry * Math.cos(t);
  return [cos * ex - sin * ey, sin * ex + cos * ey];
 };
 const out = [];
 for (let i = 0; i < n; i++) {
  const a = t1 + i * step, b = a + step, pa = point(a), pb = i === n - 1 ? [x2, y2] : point(b), da = deriv(a), db = deriv(b);
  out.push({type: 'C', c1: [pa[0] + h * da[0], pa[1] + h * da[1]], c2: [pb[0] - h * db[0], pb[1] - h * db[1]], p: pb});
 }
 return out;
}

/**
 * Path data to subpaths: {start:[x,y], segs:[{type:'L', p} | {type:'C', c1, c2, p}], closed}.
 * Quadratics become cubics and arcs become cubics; nothing is approximated yet.
 */
export function parsePath(d) {
 const scan = scanner(String(d ?? ''));
 const subpaths = [];
 let current = null, x = 0, y = 0, sx = 0, sy = 0, cmd = null;
 let lastC = null, lastQ = null;          // reflected control points for S and T
 const begin = (px, py) => { current = {start: [px, py], segs: [], closed: false}; subpaths.push(current); sx = px; sy = py; };
 const need = () => { if (!current) begin(x, y); };
 while (!scan.done()) {
  const c = scan.command();
  if (c) cmd = c;
  else if (cmd === null) throw new SyntaxError('Path data must start with a command');
  const upper = cmd.toUpperCase(), rel = cmd !== upper;
  if (upper === 'Z') {
   if (current) { current.closed = true; x = sx; y = sy; current = null; }
   lastC = lastQ = null;
   cmd = null;
   continue;
  }
  const args = upper === 'A'
   ? [scan.number(), scan.number(), scan.number(), scan.flag(), scan.flag(), scan.number(), scan.number()]
   : Array.from({length: ARGUMENTS[upper]}, () => scan.number());
  const ox = rel ? x : 0, oy = rel ? y : 0;
  let nextC = null, nextQ = null;
  switch (upper) {
   case 'M':
    x = ox + args[0]; y = oy + args[1]; begin(x, y);
    cmd = rel ? 'l' : 'L';                 // further pairs are line-tos
    break;
   case 'L': need(); x = ox + args[0]; y = oy + args[1]; current.segs.push({type: 'L', p: [x, y]}); break;
   case 'H': need(); x = ox + args[0]; current.segs.push({type: 'L', p: [x, y]}); break;
   case 'V': need(); y = oy + args[0]; current.segs.push({type: 'L', p: [x, y]}); break;
   case 'C': case 'S': {
    need();
    let c1, c2, p;
    if (upper === 'C') { c1 = [ox + args[0], oy + args[1]]; c2 = [ox + args[2], oy + args[3]]; p = [ox + args[4], oy + args[5]]; }
    else { c1 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y]; c2 = [ox + args[0], oy + args[1]]; p = [ox + args[2], oy + args[3]]; }
    current.segs.push({type: 'C', c1, c2, p});
    x = p[0]; y = p[1]; nextC = c2;
    break;
   }
   case 'Q': case 'T': {
    need();
    const q = upper === 'Q' ? [ox + args[0], oy + args[1]] : (lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y]);
    const p = upper === 'Q' ? [ox + args[2], oy + args[3]] : [ox + args[0], oy + args[1]];
    current.segs.push({type: 'C', c1: [x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y)], c2: [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])], p});
    x = p[0]; y = p[1]; nextQ = q;
    break;
   }
   case 'A': {
    need();
    const p = [ox + args[5], oy + args[6]];
    current.segs.push(...arcToCubics(x, y, args[0], args[1], args[2], args[3] !== 0, args[4] !== 0, p[0], p[1]));
    x = p[0]; y = p[1];
    break;
   }
  }
  lastC = nextC; lastQ = nextQ;
 }
 return subpaths;
}

const num = (v, fallback = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };

/** Basic shapes as path data (SVG 2 shape equivalents). attributes: name -> string. */
export function shapePath(tag, at) {
 switch (tag) {
  case 'path': return at.d ?? '';
  case 'rect': {
   const x = num(at.x), y = num(at.y), w = num(at.width), h = num(at.height);
   if (!(w > 0) || !(h > 0)) return '';
   let rx = at.rx === undefined || at.rx === 'auto' ? NaN : num(at.rx), ry = at.ry === undefined || at.ry === 'auto' ? NaN : num(at.ry);
   if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
   if (Number.isNaN(ry)) ry = rx;
   rx = Math.min(Math.max(rx, 0), w / 2); ry = Math.min(Math.max(ry, 0), h / 2);
   if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
   return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`
    + `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
  }
  case 'circle': case 'ellipse': {
   const cx = num(at.cx), cy = num(at.cy);
   const rx = tag === 'circle' ? num(at.r) : num(at.rx), ry = tag === 'circle' ? num(at.r) : num(at.ry);
   if (!(rx > 0) || !(ry > 0)) return '';
   return `M${cx + rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy + ry}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}`
    + `A${rx} ${ry} 0 0 1 ${cx} ${cy - ry}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}Z`;
  }
  case 'line': return `M${num(at.x1)} ${num(at.y1)}L${num(at.x2)} ${num(at.y2)}`;
  case 'polyline': case 'polygon': {
   const v = (at.points ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
   if (v.length < 4 || v.some(n => !Number.isFinite(n))) return '';
   let d = 'M' + v[0] + ' ' + v[1];
   for (let i = 2; i + 1 < v.length; i += 2) d += 'L' + v[i] + ' ' + v[i + 1];
   return tag === 'polygon' ? d + 'Z' : d;
  }
  default: return null;
 }
}

/** Every point of the subpaths through an affine matrix (exact for lines and cubics). */
export function transformSubpaths(subpaths, m) {
 const t = p => apply(m, p[0], p[1]);
 return subpaths.map(s => ({
  start: t(s.start), closed: s.closed,
  segs: s.segs.map(g => g.type === 'L' ? {type: 'L', p: t(g.p)} : {type: 'C', c1: t(g.c1), c2: t(g.c2), p: t(g.p)})
 }));
}


// ===========================================================================
// Flattening: curves to polylines within a tolerance
// ===========================================================================

function flattenCubic(p0, c1, c2, p3, tolerance, out, depth = 0) {
 // Flat enough when both control points lie within tolerance of the chord.
 const dx = p3[0] - p0[0], dy = p3[1] - p0[1], len = Math.hypot(dx, dy);
 const dist = p => len > 1e-12 ? Math.abs((p[0] - p0[0]) * dy - (p[1] - p0[1]) * dx) / len : Math.hypot(p[0] - p0[0], p[1] - p0[1]);
 if (depth >= 18 || Math.max(dist(c1), dist(c2)) <= tolerance) { out.push(p3); return; }
 const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
 const a = mid(p0, c1), b = mid(c1, c2), c = mid(c2, p3), ab = mid(a, b), bc = mid(b, c), m = mid(ab, bc);
 flattenCubic(p0, a, ab, m, tolerance, out, depth + 1);
 flattenCubic(m, bc, c, p3, tolerance, out, depth + 1);
}

/** Subpaths to polylines {points:[[x,y]...], closed}; no point of the curve is further than tolerance away. */
export function flatten(subpaths, tolerance) {
 return subpaths.map(s => {
  const points = [s.start];
  let p = s.start;
  for (const g of s.segs) {
   if (g.type === 'L') points.push(g.p);
   else flattenCubic(p, g.c1, g.c2, g.p, tolerance, points);
   p = g.p;
  }
  // Drop repeated points; a closed outline does not repeat its start.
  const clean = points.filter((q, i) => i === 0 || q[0] !== points[i - 1][0] || q[1] !== points[i - 1][1]);
  if (s.closed && clean.length > 1) {
   const a = clean[0], b = clean[clean.length - 1];
   if (a[0] === b[0] && a[1] === b[1]) clean.pop();
  }
  return {points: clean, closed: s.closed};
 });
}


// ===========================================================================
// Triangles
// ===========================================================================

/** A fan per outline from its first point. Drawn into a stencil (counting
 * windings), any shape comes out exact: holes, overlaps, either fill rule. */
export function fanTriangles(polys) {
 const out = [];
 for (const {points} of polys) {
  if (points.length < 3) continue;
  const [x0, y0] = points[0];
  for (let i = 1; i + 1 < points.length; i++) out.push(x0, y0, ...points[i], ...points[i + 1]);
 }
 return out;
}

/** Triangles for a single convex outline (drawn directly, no stencil), or null. */
export function convexTriangles(polys) {
 const real = polys.filter(p => p.points.length >= 3);
 if (real.length !== 1) return real.length ? null : [];
 const pts = real[0].points, n = pts.length;
 let sign = 0, turning = 0;
 for (let i = 0; i < n; i++) {
  const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
  const cross = ux * vy - uy * vx;
  if (Math.abs(cross) > 1e-12) {
   const s = Math.sign(cross);
   if (sign && s !== sign) return null;
   sign = s;
  }
  turning += Math.atan2(cross, ux * vx + uy * vy);
 }
 // One full turn: a simple convex outline (a star with only left turns turns twice).
 if (Math.abs(Math.abs(turning) - 2 * Math.PI) > 1e-6) return null;
 return fanTriangles(real);
}

/** Points along an arc around c from angle a0 to a1, r = radius, with chords within tolerance. */
function arcPoints(c, r, a0, a1, tolerance) {
 const step = r > tolerance ? 2 * Math.acos(1 - tolerance / r) : Math.PI / 2;
 const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / Math.max(step, 1e-3)));
 return Array.from({length: n + 1}, (_, i) => {
  const a = a0 + (a1 - a0) * i / n;
  return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
 });
}

function fan(center, rim, out) {
 for (let i = 0; i + 1 < rim.length; i++) out.push(...center, ...rim[i], ...rim[i + 1]);
}

/**
 * Triangles covering a stroke of the polylines. stroke = {width, cap: 'butt'|'round'|'square',
 * join: 'miter'|'round'|'bevel', miterLimit}. Triangles may overlap: they all
 * carry the same drive level, so overlap changes nothing.
 */
export function strokeTriangles(polys, {width, cap = 'butt', join = 'miter', miterLimit = 4}, tolerance) {
 const out = [], hw = width / 2;
 if (!(hw > 0)) return out;
 const quad = (a, b, c, d) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
 for (const {points, closed} of polys) {
  const n = points.length;
  if (n === 1) {
   // A zero-length subpath: round and square caps still draw a dot.
   const p = points[0];
   if (cap === 'round') fan(p, arcPoints(p, hw, 0, 2 * Math.PI, tolerance), out);
   else if (cap === 'square') quad([p[0] - hw, p[1] - hw], [p[0] + hw, p[1] - hw], [p[0] + hw, p[1] + hw], [p[0] - hw, p[1] + hw]);
   continue;
  }
  const segCount = closed ? n : n - 1;
  const dir = i => {
   const a = points[i], b = points[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
   return [dx / l, dy / l];
  };
  // Segment bodies
  for (let i = 0; i < segCount; i++) {
   const a = points[i], b = points[(i + 1) % n], [ux, uy] = dir(i), nx = -uy * hw, ny = ux * hw;
   quad([a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]);
  }
  // Joins, on the outer side of each turn (the inner side is inside both bodies)
  const joinAt = (v, d0, d1) => {
   const cross = d0[0] * d1[1] - d0[1] * d1[0], dot = d0[0] * d1[0] + d0[1] * d1[1];
   if (Math.abs(cross) < 1e-12 && dot > 0) return;                       // straight on
   const s = cross > 0 ? -1 : 1;                                           // outer side
   const n0 = [-d0[1] * s, d0[0] * s], n1 = [-d1[1] * s, d1[0] * s];
   const a = [v[0] + n0[0] * hw, v[1] + n0[1] * hw], b = [v[0] + n1[0] * hw, v[1] + n1[1] * hw];
   if (join === 'round') {
    const a0 = Math.atan2(n0[1], n0[0]);
    let a1 = Math.atan2(n1[1], n1[0]);
    while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    while (a1 - a0 < -Math.PI) a1 += 2 * Math.PI;
    fan(v, arcPoints(v, hw, a0, a1, tolerance), out);
    return;
   }
   out.push(...v, ...a, ...b);                                             // bevel
   if (join === 'miter' || join === 'miter-clip' || join === 'arcs') {
    const mx = n0[0] + n1[0], my = n0[1] + n1[1], ml = Math.hypot(mx, my);
    if (ml < 1e-9) return;
    const cosHalf = (mx * n0[0] + my * n0[1]) / ml;                        // cos of half the join angle
    if (1 / cosHalf <= miterLimit) {
     const tip = [v[0] + mx / ml * hw / cosHalf, v[1] + my / ml * hw / cosHalf];
     out.push(...a, ...tip, ...b);
    }
   }
  };
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) joinAt(points[i], dir((i - 1 + n) % n), dir(i));
  // Caps
  if (!closed) {
   const capAt = (p, d) => {                                               // d points out of the line
    const nx = -d[1] * hw, ny = d[0] * hw;
    if (cap === 'square') quad([p[0] + nx, p[1] + ny], [p[0] + nx + d[0] * hw, p[1] + ny + d[1] * hw],
     [p[0] - nx + d[0] * hw, p[1] - ny + d[1] * hw], [p[0] - nx, p[1] - ny]);
    else if (cap === 'round') { const a = Math.atan2(ny, nx); fan(p, arcPoints(p, hw, a, a - Math.PI, tolerance), out); }
   };
   const d0 = dir(0), dn = dir(n - 2);
   capAt(points[0], [-d0[0], -d0[1]]);
   capAt(points[n - 1], dn);
  }
 }
 return out;
}

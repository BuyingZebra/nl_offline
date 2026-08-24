const DATA = window.NL_DATA;
const $ = id => document.getElementById(id);
const base = $('base');
const overlay = $('overlay');
const bctx = base.getContext('2d');
const octx = overlay.getContext('2d');

function decodeU16(s) {
  const bin = atob(s);
  const out = new Uint16Array(bin.length / 2);
  for (let i = 0, j = 0; i < bin.length; i += 2, j++) out[j] = bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8);
  return out;
}
function decodeFerryPacked(s, size) {
  const dist = new Uint16Array(size);
  const time = new Uint16Array(size);
  if (!s) return { dist, time };
  const bin = atob(s);
  for (let i = 0; i + 7 < bin.length; i += 8) {
    const k = (bin.charCodeAt(i)) |
      (bin.charCodeAt(i + 1) << 8) |
      (bin.charCodeAt(i + 2) << 16) |
      (bin.charCodeAt(i + 3) << 24);
    const fd = bin.charCodeAt(i + 4) | (bin.charCodeAt(i + 5) << 8);
    const ft = bin.charCodeAt(i + 6) | (bin.charCodeAt(i + 7) << 8);
    const idx = k >>> 0;
    if (idx < size) { dist[idx] = fd; time[idx] = ft; }
  }
  return { dist, time };
}

const names = DATA.communities;
const N = names.length;
const nameIndex = new Map(names.map((n, i) => [n.toLowerCase(), i]));
const DIST = decodeU16(DATA.distanceB64);
const TIME = decodeU16(DATA.timeB64);
const FERRY = decodeFerryPacked(DATA.ferryPackedB64, N * N);
const special = DATA.specialRoutes || {};

$('towns').innerHTML = names.map(n => `<option value="${n.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></option>`).join('');

function tripInfo(a, b) {
  const k = a * N + b;
  // The original compact DIST/TIME matrices already store official total trip values.
  // v0.11 adds the ferry components so we can restore the road/ferry breakdown without double-counting.
  const totalDistance = DIST[k] || 0;
  const totalTime = TIME[k] || 0;
  const ferryDistance = FERRY.dist[k] || 0;
  const ferryTime = FERRY.time[k] || 0;
  const roadDistance = Math.max(0, totalDistance - ferryDistance);
  const roadTime = Math.max(0, totalTime - ferryTime);
  return {
    roadDistance, roadTime, ferryDistance, ferryTime, totalDistance, totalTime,
    hasFerry: ferryDistance > 0 || ferryTime > 0,
  };
}

const adj = Array.from({ length: DATA.nodes.length }, () => []);
DATA.edges.forEach((e, ei) => {
  const type = e[4] || 'road';
  adj[e[0]].push([e[1], e[2], ei, type]);
  adj[e[1]].push([e[0], e[2], ei, type]);
});

const edgeBounds = DATA.edges.map(e => {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of e[3]) {
    minx = Math.min(minx, p[0]); miny = Math.min(miny, p[1]);
    maxx = Math.max(maxx, p[0]); maxy = Math.max(maxy, p[1]);
  }
  return [minx, miny, maxx, maxy];
});

// Spatial buckets keep follow-mode redraws from scanning every road edge on every GPS fix.
const EDGE_GRID_DEG = 0.25;
const edgeGrid = new Map();
function gridKey(x, y) { return `${x},${y}`; }
function gridCoord(v) { return Math.floor(v / EDGE_GRID_DEG); }
for (let ei = 0; ei < edgeBounds.length; ei++) {
  const b = edgeBounds[ei];
  const x0 = gridCoord(b[0]), x1 = gridCoord(b[2]), y0 = gridCoord(b[1]), y1 = gridCoord(b[3]);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const key = gridKey(x, y);
    let list = edgeGrid.get(key);
    if (!list) edgeGrid.set(key, list = []);
    list.push(ei);
  }
}
function visibleEdgeIds() {
  const x0 = gridCoord(view.minx), x1 = gridCoord(view.maxx), y0 = gridCoord(view.miny), y1 = gridCoord(view.maxy);
  const seen = new Set();
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const list = edgeGrid.get(gridKey(x, y));
    if (list) for (const ei of list) seen.add(ei);
  }
  return seen;
}

class Heap {
  constructor() { this.a = []; }
  push(x) {
    const a = this.a; a.push(x); let i = a.length - 1;
    while (i) { const p = (i - 1) >> 1; if (a[p][0] <= x[0]) break; a[i] = a[p]; i = p; }
    a[i] = x;
  }
  pop() {
    const a = this.a; if (!a.length) return null;
    const r = a[0], x = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        const l = i * 2 + 1; if (l >= a.length) break;
        const rr = l + 1, c = rr < a.length && a[rr][0] < a[l][0] ? rr : l;
        if (a[c][0] >= x[0]) break; a[i] = a[c]; i = c;
      }
      a[i] = x;
    }
    return r;
  }
  get size() { return this.a.length; }
}

// Named trips with no official ferry component are forbidden from using ferry edges.
// Ferry trips heavily penalize ferry distance so a ferry cannot become an unrealistic road shortcut.
function dijkstra(s, t, options = {}) {
  if (s === t) return [];
  const allowFerry = !!options.allowFerry;
  const ferryPenalty = options.ferryPenalty ?? 8;
  const dist = new Float64Array(adj.length); dist.fill(Infinity);
  const pn = new Int32Array(adj.length), pe = new Int32Array(adj.length); pn.fill(-1); pe.fill(-1);
  dist[s] = 0;
  const h = new Heap(); h.push([0, s]);
  while (h.size) {
    const [d, u] = h.pop(); if (d !== dist[u]) continue; if (u === t) break;
    for (const [v, w, e, type] of adj[u]) {
      if (type === 'ferry' && !allowFerry) continue;
      const cost = w * (type === 'ferry' ? ferryPenalty : 1);
      const nd = d + cost;
      if (nd < dist[v]) { dist[v] = nd; pn[v] = u; pe[v] = e; h.push([nd, v]); }
    }
  }
  if (!isFinite(dist[t])) return null;
  const es = []; let u = t;
  while (u !== s) { if (pe[u] < 0) return null; es.push(pe[u]); u = pn[u]; }
  return es.reverse();
}

function kmBetween(a, b) {
  const lat = (a[1] + b[1]) * Math.PI / 360;
  const dx = (b[0] - a[0]) * 111.32 * Math.cos(lat), dy = (b[1] - a[1]) * 111.32;
  return Math.hypot(dx, dy);
}
function edgeKm(es) { return (es || []).reduce((s, ei) => s + (DATA.edges[ei][2] || 0), 0); }
function nearestNode(lon, lat) {
  let best = -1, bd = Infinity; const c = Math.cos(lat * Math.PI / 180);
  for (let i = 0; i < DATA.nodes.length; i++) {
    const p = DATA.nodes[i], dx = (p[0] - lon) * 111.32 * c, dy = (p[1] - lat) * 111.32, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return { node: best, distanceKm: Math.sqrt(bd) };
}
function nearestCommunity(lon, lat) {
  let bi = -1, bd = Infinity; const c = Math.cos(lat * Math.PI / 180);
  for (let i = 0; i < N; i++) {
    const a = DATA.anchors[i]; if (a == null || a < 0) continue;
    const p = DATA.nodes[a], dx = (p[0] - lon) * 111.32 * c, dy = (p[1] - lat) * 111.32, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; bi = i; }
  }
  return { index: bi, distanceKm: Math.sqrt(bd) };
}

let routeSegments = [], routeCoords = [], routeCoordKinds = [], routeCum = [], routePolylineKm = 0;
let routeRoadGeomKm = 0, routeFerryGeomKm = 0, routeLabelCandidates = [];
let routeRoadDistance = 0, routeRoadTime = 0, routeFerryDistance = 0, routeFerryTime = 0, routeDist = 0, routeTime = 0;
let routeProgressReliable = true, currentTripLoaded = false, currentTripHasFerry = false;
let progress = 0, gpsWatch = null, gpsPosition = null, followGPS = false, followRadiusKm = 18, drag = null;
let originMode = 'town', originGPS = null, currentDestIndex = -1, currentOriginIndex = -1;
let rafPan = 0, gpsLastFixAt = 0, gpsStaleTimer = null, wakeLock = null, gpsPermission = 'unknown', gpsRunning = false;
let offlinePackageReady = false, lastGpsAppliedAt = 0, deferredInstall = null, offRouteState = false;
let etaModel = { movingKm: 0, speedKmh: null, lastOfficialDistance: null, lastTs: null };
let view = { minx: DATA.bounds[0], miny: DATA.bounds[1], maxx: DATA.bounds[2], maxy: DATA.bounds[3] };

function setStatus(text, warn = false) { $('statusText').textContent = text; $('status').classList.toggle('warn', warn); }
function restoreTripPrefs() {
  try {
    const d = localStorage.getItem('nl-offline-destination'), o = localStorage.getItem('nl-offline-origin');
    if (d && nameIndex.has(d.toLowerCase())) $('to').value = d;
    if (o && nameIndex.has(o.toLowerCase())) $('from').value = o;
  } catch (_) {}
}
function saveTripPrefs() {
  try {
    const d = $('to').value.trim(); if (nameIndex.has(d.toLowerCase())) localStorage.setItem('nl-offline-destination', d);
    if (originMode !== 'gps') { const o = $('from').value.trim(); if (nameIndex.has(o.toLowerCase())) localStorage.setItem('nl-offline-origin', o); }
  } catch (_) {}
}

function resize(c, ctx) {
  const dpr = Math.min(devicePixelRatio || 1, 2), r = c.getBoundingClientRect();
  c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function mapAspect() { return Math.max(.35, base.clientWidth / Math.max(base.clientHeight, 1)); }
function normalizeView(v) {
  const cy = (v.miny + v.maxy) / 2, cx = (v.minx + v.maxx) / 2, c = Math.max(.2, Math.cos(cy * Math.PI / 180));
  const aspect = mapAspect(), lonSpan = Math.max(v.maxx - v.minx, .0001), latSpan = Math.max(v.maxy - v.miny, .0001), xSpan = lonSpan * c;
  let nx = xSpan, ny = latSpan; if (nx / ny > aspect) ny = nx / aspect; else nx = ny * aspect;
  const newLon = nx / c;
  return { minx: cx - newLon / 2, maxx: cx + newLon / 2, miny: cy - ny / 2, maxy: cy + ny / 2 };
}
function size() { resize(base, bctx); resize(overlay, octx); view = normalizeView(view); renderBase(); renderOverlay(); }
function project(lon, lat) {
  const w = base.clientWidth, h = base.clientHeight, p = 12, cy = (view.miny + view.maxy) / 2, c = Math.max(.2, Math.cos(cy * Math.PI / 180));
  const xspan = (view.maxx - view.minx) * c, yspan = view.maxy - view.miny;
  const sx = (w - 2 * p) / Math.max(xspan, 1e-9), sy = (h - 2 * p) / Math.max(yspan, 1e-9), s = Math.min(sx, sy);
  const ox = (w - xspan * s) / 2, oy = (h - yspan * s) / 2;
  return [ox + (lon - view.minx) * c * s, h - (oy + (lat - view.miny) * s)];
}
function visible(bb) { return !(bb[2] < view.minx || bb[0] > view.maxx || bb[3] < view.miny || bb[1] > view.maxy); }

function renderBase() {
  bctx.clearRect(0, 0, base.clientWidth, base.clientHeight); bctx.lineJoin = 'round'; bctx.lineCap = 'round';
  const ids = visibleEdgeIds();
  for (const type of ['road', 'virtual', 'ferry']) {
    bctx.beginPath();
    for (const ei of ids) {
      const e = DATA.edges[ei], raw = e[4] || 'road'; if (raw !== type || !visible(edgeBounds[ei])) continue;
      for (let i = 0; i < e[3].length; i++) { const q = project(e[3][i][0], e[3][i][1]); i ? bctx.lineTo(q[0], q[1]) : bctx.moveTo(q[0], q[1]); }
    }
    bctx.strokeStyle = type === 'ferry' ? '#496b7d' : type === 'virtual' ? '#355566' : '#29404d';
    bctx.globalAlpha = type === 'ferry' ? .82 : type === 'virtual' ? .55 : .66;
    bctx.lineWidth = type === 'ferry' ? 1.25 : type === 'virtual' ? .9 : .72;
    if (type !== 'road') bctx.setLineDash(type === 'ferry' ? [4, 4] : [2, 4]);
    bctx.stroke(); bctx.setLineDash([]);
  }
  bctx.globalAlpha = 1; renderCommunityLabels();
}
function boxesOverlap(a, b, pad = 4) { return !(a.r + pad < b.l || a.l - pad > b.r || a.b + pad < b.t || a.t - pad > b.b); }
function rebuildRouteLabels() {
  routeLabelCandidates = []; if (routeCoords.length < 2 || routePolylineKm <= 0) return;
  const start = $('from').value.trim().toLowerCase(), dest = $('to').value.trim().toLowerCase(), all = [];
  for (let i = 0; i < N; i++) {
    const a = DATA.anchors[i]; if (a == null || a < 0) continue; const p = DATA.nodes[a];
    if (!p || names[i].toLowerCase() === start || names[i].toLowerCase() === dest) continue;
    const s = snapGlobal(p[0], p[1]); if (s && s.distanceKm <= 2.25) all.push({ index: i, fraction: s.fraction, distanceKm: s.distanceKm });
  }
  all.sort((a, b) => a.fraction - b.fraction || a.distanceKm - b.distanceKm || names[a.index].localeCompare(names[b.index]));
  const minGapKm = Math.max(8, Math.min(32, routePolylineKm / 10)); let lastKm = -1e9;
  for (const c of all) { const km = c.fraction * routePolylineKm; if (km - lastKm < minGapKm) continue; routeLabelCandidates.push(c); lastKm = km; if (routeLabelCandidates.length >= 16) break; }
}
function renderCommunityLabels() {
  const span = view.maxx - view.minx; if (span > 3.4) return;
  let candidates = routeCoords.length ? routeLabelCandidates : names.map((_, i) => ({ index: i, fraction: 0 }));
  if (followGPS && routeCoords.length) {
    const back = Math.max(0, progress - .045), ahead = Math.min(1, progress + .18);
    candidates = candidates.filter(c => c.fraction >= back && c.fraction <= ahead);
  }
  const boxes = [], maxLabels = followGPS ? 5 : span < .55 ? 10 : span < 1.35 ? 8 : 6;
  let shown = 0; bctx.font = '600 10.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  for (const c of candidates) {
    if (shown >= maxLabels) break; const i = c.index ?? c;
    const a = DATA.anchors[i]; if (a == null || a < 0) continue; const p = DATA.nodes[a];
    if (!p || p[0] < view.minx || p[0] > view.maxx || p[1] < view.miny || p[1] > view.maxy) continue;
    const q = project(p[0], p[1]);
    if (q[0] < 8 || q[0] > base.clientWidth - 8 || q[1] < 92 || q[1] > base.clientHeight - 22) continue;
    if (q[0] > base.clientWidth - 96 && q[1] < 255) continue;
    if (q[0] < 215 && q[1] > base.clientHeight - 82) continue;
    const text = names[i], tw = bctx.measureText(text).width, box = { l: q[0] + 5, t: q[1] - 16, r: q[0] + 9 + tw, b: q[1] + 3 };
    if (boxes.some(b => boxesOverlap(box, b))) continue; boxes.push(box);
    bctx.beginPath(); bctx.arc(q[0], q[1], 2.15, 0, Math.PI * 2); bctx.fillStyle = '#7897a7'; bctx.fill();
    bctx.lineWidth = 3.2; bctx.strokeStyle = 'rgba(5,15,23,.94)'; bctx.fillStyle = '#b7c7cf';
    bctx.strokeText(text, q[0] + 6, q[1] - 5); bctx.fillText(text, q[0] + 6, q[1] - 5); shown++;
  }
}
function drawSegment(ctx, s) {
  const c = s.coords; if (!c || c.length < 2) return; ctx.beginPath();
  for (let i = 0; i < c.length; i++) { const q = project(c[i][0], c[i][1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
  ctx.strokeStyle = s.type === 'road' ? '#61df97' : '#a4dfbd'; ctx.lineWidth = s.type === 'road' ? 4.4 : 3.2;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; if (s.type !== 'road') ctx.setLineDash([10, 7]); ctx.stroke(); ctx.setLineDash([]);
}
function marker(p, label, kind) {
  if (!p) return; const q = project(p[0], p[1]);
  if (kind === 'gps' && gpsPosition && gpsPosition.accuracy) {
    const q2 = project(p[0] + .01, p[1]), pxPerKm = Math.abs(q2[0] - q[0]) / (.01 * 111.32 * Math.cos(p[1] * Math.PI / 180) || 1);
    const r = Math.min(38, Math.max(8, (gpsPosition.accuracy / 1000) * pxPerKm));
    octx.beginPath(); octx.arc(q[0], q[1], r, 0, Math.PI * 2); octx.fillStyle = 'rgba(116,188,255,.13)'; octx.fill();
    octx.strokeStyle = 'rgba(116,188,255,.25)'; octx.lineWidth = 1; octx.stroke();
  }
  octx.beginPath(); octx.arc(q[0], q[1], kind === 'gps' ? 7 : 6, 0, Math.PI * 2);
  octx.fillStyle = kind === 'gps' ? '#74bcff' : kind === 'dest' ? '#61df97' : '#f6f8fa'; octx.fill();
  octx.lineWidth = kind === 'gps' ? 3 : 2; octx.strokeStyle = '#061019'; octx.stroke();
  if (label) {
    octx.font = '650 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'; octx.fillStyle = '#f6f8fa';
    octx.strokeStyle = 'rgba(6,16,25,.95)'; octx.lineWidth = 4; octx.strokeText(label, q[0] + 9, q[1] - 9); octx.fillText(label, q[0] + 9, q[1] - 9);
  }
}
function renderOverlay() {
  octx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight); for (const s of routeSegments) drawSegment(octx, s);
  if (routeCoords.length) {
    const startLabel = originMode === 'gps' ? 'Current location' : $('from').value.trim();
    marker(routeCoords[0], startLabel, 'start'); marker(routeCoords.at(-1), $('to').value.trim(), 'dest');
    const p = gpsPosition ? [gpsPosition.lon, gpsPosition.lat] : pointAt(progress); marker(p, '', 'gps');
  }
}
function setOverviewMapHeight(coords) {
  if (!coords?.length || followGPS) return;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of coords) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
  const cy = (miny + maxy) / 2, c = Math.max(.2, Math.cos(cy * Math.PI / 180));
  const routeAspect = Math.max(.45, ((maxx - minx) * c) / Math.max(maxy - miny, .02));
  const w = $('mapwrap').clientWidth || 400;
  const desired = Math.max(320, Math.min(540, w / Math.max(.78, Math.min(routeAspect, 1.75))));
  $('mapwrap').style.setProperty('--overview-height', `${Math.round(desired)}px`);
}
function fit(coords) {
  if (!coords.length) return; setOverviewMapHeight(coords);
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of coords) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
  const dx = Math.max(maxx - minx, .018), dy = Math.max(maxy - miny, .018);
  view = normalizeView({ minx: minx - dx * .11, maxx: maxx + dx * .11, miny: miny - dy * .11, maxy: maxy + dy * .11 });
  renderBase(); renderOverlay();
}
function currentFollowPoint() { return gpsRunning && gpsPosition ? [gpsPosition.lon, gpsPosition.lat] : pointAt(progress); }
function followViewAt(p) {
  if (!p) return; const aspect = mapAspect(), c = Math.max(.2, Math.cos(p[1] * Math.PI / 180));
  const latHalf = followRadiusKm / 111.32, lonHalf = (followRadiusKm * aspect) / (111.32 * c);
  const ahead = routeDist > 0 ? pointAt(Math.min(1, progress + Math.min(.08, 8 / Math.max(routeDist, 1)))) : null;
  let cx = p[0], cy = p[1]; if (ahead) { cx = p[0] * .68 + ahead[0] * .32; cy = p[1] * .68 + ahead[1] * .32; }
  view = normalizeView({ minx: cx - lonHalf, maxx: cx + lonHalf, miny: cy - latHalf, maxy: cy + latHalf });
  renderBase(); renderOverlay();
}
function setFollow(on, localZoom = false) {
  followGPS = !!on; $('follow').textContent = followGPS ? 'Following' : 'Follow'; $('follow').classList.toggle('active', followGPS);
  $('mapwrap').classList.toggle('following', followGPS); document.body.classList.toggle('map-following', followGPS);
  if (followGPS && localZoom) followRadiusKm = Math.max(5, Math.min(22, routeDist * .14 || 18));
  size(); if (followGPS) followViewAt(currentFollowPoint()); else if (routeCoords.length) fit(routeCoords);
}
function zoom(f) {
  if (followGPS) { followRadiusKm = Math.max(2.5, Math.min(160, followRadiusKm * f)); followViewAt(currentFollowPoint()); return; }
  const cx = (view.minx + view.maxx) / 2, cy = (view.miny + view.maxy) / 2, dx = (view.maxx - view.minx) * f / 2, dy = (view.maxy - view.miny) * f / 2;
  view = normalizeView({ minx: cx - dx, maxx: cx + dx, miny: cy - dy, maxy: cy + dy }); renderBase(); renderOverlay();
}

function addRoad(es, reverse = false) {
  if (es == null) throw new Error('network components do not connect');
  const seq = reverse ? es.slice().reverse() : es.slice(); let cur = null;
  for (const ei of seq) {
    const e = DATA.edges[ei], raw = e[4] || 'road'; let c = e[3].map(p => [p[0], p[1]]); if (reverse) c.reverse();
    const type = raw === 'ferry' ? 'ferry' : raw === 'virtual' ? 'virtual' : 'road';
    if (cur && cur.type === type) {
      const last = cur.coords.at(-1), a = c[0], b = c.at(-1), d0 = (last[0] - a[0]) ** 2 + (last[1] - a[1]) ** 2, d1 = (last[0] - b[0]) ** 2 + (last[1] - b[1]) ** 2;
      if (d1 < d0) c.reverse(); if ((last[0] - c[0][0]) ** 2 + (last[1] - c[0][1]) ** 2 < 1e-8) c = c.slice(1);
      cur.coords.push(...c); cur.edgeCount++;
    } else {
      cur = { type, coords: c, edgeCount: 1, label: type === 'ferry' ? 'Ferry segment' : type === 'virtual' ? 'Schematic network connection' : '' };
      routeSegments.push(cur);
    }
  }
}
function addVirtual(a, b, label, type = 'virtual') { routeSegments.push({ type, coords: [[a[0], a[1]], [b[0], b[1]]], label }); }
function gatewayNode(name) { const i = nameIndex.get(name.toLowerCase()); return i == null ? -1 : DATA.anchors[i]; }
function remotePoint(name) { const s = special[name]; return s ? [s.lon, s.lat] : null; }
function pointForCommunity(name, index) { return remotePoint(name) || (DATA.anchors[index] >= 0 ? DATA.nodes[DATA.anchors[index]] : null); }

function composePath(originName, destName, a, b, allowFerry) {
  routeSegments = [];
  const sa = special[originName], sb = special[destName], aa = DATA.anchors[a], bb = DATA.anchors[b];
  if (!sa && !sb) { addRoad(dijkstra(aa, bb, { allowFerry })); return; }
  if (sa && sb && ((originName === 'Francois' && destName === 'Grey River') || (originName === 'Grey River' && destName === 'Francois'))) {
    addVirtual(remotePoint(originName), remotePoint(destName), 'Direct remote ferry', 'ferry'); return;
  }
  const startNode = sa ? gatewayNode(sa.gateway) : aa, endNode = sb ? gatewayNode(sb.gateway) : bb;
  if (startNode < 0 || endNode < 0) throw new Error('gateway anchor unavailable');
  if (sa) addVirtual(remotePoint(originName), DATA.nodes[startNode], sa.label, 'ferry');
  const road = dijkstra(startNode, endNode, { allowFerry }); if (road && road.length) addRoad(road);
  if (sb) addVirtual(DATA.nodes[endNode], remotePoint(destName), sb.label, 'ferry');
}
function composeFromNode(startNode, destName, b, originPoint, allowFerry) {
  routeSegments = []; const sb = special[destName], endNode = sb ? gatewayNode(sb.gateway) : DATA.anchors[b];
  if (endNode < 0) throw new Error('destination anchor unavailable');
  if (originPoint && kmBetween(originPoint, DATA.nodes[startNode]) > .03) addVirtual(originPoint, DATA.nodes[startNode], 'GPS to road', 'virtual');
  const road = dijkstra(startNode, endNode, { allowFerry }); if (road && road.length) addRoad(road);
  if (sb) addVirtual(DATA.nodes[endNode], remotePoint(destName), sb.label, 'ferry');
}
function graphKmToDestination(startNode, destName, b, allowFerry) {
  const sb = special[destName], endNode = sb ? gatewayNode(sb.gateway) : DATA.anchors[b], es = dijkstra(startNode, endNode, { allowFerry });
  if (es == null) return null; let k = edgeKm(es); if (sb) k += kmBetween(DATA.nodes[endNode], remotePoint(destName)); return k;
}

function flattenSegments() {
  const out = [], kinds = [];
  for (const s of routeSegments) {
    let c = s.coords.map(p => [p[0], p[1]]), type = s.type || 'road';
    if (out.length && c.length) {
      const last = out.at(-1), a = c[0], b = c.at(-1), d0 = (last[0] - a[0]) ** 2 + (last[1] - a[1]) ** 2, d1 = (last[0] - b[0]) ** 2 + (last[1] - b[1]) ** 2;
      if (d1 < d0) c.reverse(); if ((last[0] - c[0][0]) ** 2 + (last[1] - c[0][1]) ** 2 < 1e-8) c = c.slice(1);
    }
    for (const p of c) { if (out.length) kinds.push(type); out.push(p); }
  }
  routeCoordKinds = kinds; return out;
}
function metrics() {
  routeCum = [0]; let total = 0; routeRoadGeomKm = 0; routeFerryGeomKm = 0;
  for (let i = 1; i < routeCoords.length; i++) {
    const d = kmBetween(routeCoords[i - 1], routeCoords[i]); total += d; routeCum.push(total);
    if (routeCoordKinds[i - 1] === 'ferry') routeFerryGeomKm += d; else routeRoadGeomKm += d;
  }
  routePolylineKm = total; rebuildRouteLabels();
}
function pointAt(f) {
  if (!routeCoords.length) return null; if (routeCoords.length === 1) return routeCoords[0];
  const target = routePolylineKm * Math.max(0, Math.min(1, f)); let i = 1;
  while (i < routeCum.length && routeCum[i] < target) i++; if (i >= routeCum.length) return routeCoords.at(-1);
  const a = routeCoords[i - 1], b = routeCoords[i], den = Math.max(routeCum[i] - routeCum[i - 1], 1e-9), t = (target - routeCum[i - 1]) / den;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
function snapRange(lon, lat, startKm = 0, endKm = Infinity) {
  if (routeCoords.length < 2) return null; let bd = Infinity, along = 0;
  for (let i = 1; i < routeCoords.length; i++) {
    if (routeCum[i] < startKm || routeCum[i - 1] > endKm) continue;
    const a = routeCoords[i - 1], b = routeCoords[i], sl = 111.32 * Math.cos((lat + (a[1] + b[1]) / 2) * Math.PI / 360);
    const ax = a[0] * sl, ay = a[1] * 111.32, bx = b[0] * sl, by = b[1] * 111.32, px = lon * sl, py = lat * 111.32;
    const vx = bx - ax, vy = by - ay, len = vx * vx + vy * vy; let t = len ? ((px - ax) * vx + (py - ay) * vy) / len : 0; t = Math.max(0, Math.min(1, t));
    const qx = ax + t * vx, qy = ay + t * vy, d = (px - qx) ** 2 + (py - qy) ** 2;
    if (d < bd) { bd = d; along = routeCum[i - 1] + (routeCum[i] - routeCum[i - 1]) * t; }
  }
  return isFinite(bd) ? { fraction: Math.max(0, Math.min(1, along / Math.max(routePolylineKm, .0001))), distanceKm: Math.sqrt(bd), alongKm: along } : null;
}
function snapGlobal(lon, lat) { return snapRange(lon, lat, 0, Infinity); }
function snapGpsFix(lon, lat, now) {
  // Only the first fix is allowed to search the whole route. Once progress has been
  // established we match inside a physically plausible window around that progress.
  // This prevents a nearby loop/crossing later in the trip from stealing the GPS fix.
  if (!lastGpsAppliedAt || routePolylineKm < 8) return snapGlobal(lon, lat);
  const dt = Math.max(1, (now - lastGpsAppliedAt) / 1000), backKm = 3.0;
  const possibleForward = Math.min(120, Math.max(6, dt / 3600 * 170 + 6));
  const at = progress * routePolylineKm;
  return snapRange(lon, lat, Math.max(0, at - backKm), Math.min(routePolylineKm, at + possibleForward));
}

function geomProgressByKind(f) {
  if (routePolylineKm <= 0 || routeCoords.length < 2) return { road: f >= 1 ? 1 : 0, ferry: f >= 1 ? 1 : 0 };
  const target = routePolylineKm * Math.max(0, Math.min(1, f)); let roadDone = 0, ferryDone = 0;
  for (let i = 1; i < routeCoords.length; i++) {
    const a = routeCum[i - 1], b = routeCum[i]; if (target <= a) break;
    const d = Math.min(b, target) - a, kind = routeCoordKinds[i - 1]; if (kind === 'ferry') ferryDone += d; else roadDone += d;
    if (target <= b) break;
  }
  return {
    road: routeRoadGeomKm > 0 ? Math.min(1, roadDone / routeRoadGeomKm) : 1,
    ferry: routeFerryGeomKm > 0 ? Math.min(1, ferryDone / routeFerryGeomKm) : (routeFerryDistance || routeFerryTime ? 0 : 1),
  };
}
function officialDistanceAtProgress(f) {
  if (!routeProgressReliable) return routeDist * Math.max(0, Math.min(1, f));
  const g = geomProgressByKind(f); return routeRoadDistance * g.road + routeFerryDistance * g.ferry;
}
function officialMinutesAtProgress(f) {
  if (!routeProgressReliable) return routeTime * Math.max(0, Math.min(1, f));
  const g = geomProgressByKind(f); return routeRoadTime * g.road + routeFerryTime * g.ferry;
}
function fmtMin(m) { m = Math.round(Math.max(0, m)); const h = Math.floor(m / 60), mm = m % 60; return h ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm} min`; }
function resetEta() { etaModel = { movingKm: 0, speedKmh: null, lastOfficialDistance: null, lastTs: null }; }
function trackPace(newProgress, ts, gpsSpeedMps = null) {
  const od = officialDistanceAtProgress(newProgress);
  if (gpsSpeedMps != null && isFinite(gpsSpeedMps) && gpsSpeedMps >= 1.5 && gpsSpeedMps <= 55) {
    const gv = gpsSpeedMps * 3.6; etaModel.speedKmh = etaModel.speedKmh == null ? gv : etaModel.speedKmh * .82 + gv * .18;
  }
  if (etaModel.lastOfficialDistance != null && etaModel.lastTs != null) {
    const dk = od - etaModel.lastOfficialDistance, hours = (ts - etaModel.lastTs) / 3600000;
    if (dk > .02 && hours > 0) { const v = dk / hours; if (v >= 4 && v <= 150) { etaModel.movingKm += dk; etaModel.speedKmh = etaModel.speedKmh == null ? v : etaModel.speedKmh * .84 + v * .16; } }
  }
  etaModel.lastOfficialDistance = od; etaModel.lastTs = ts;
}
function remainingMinutes() {
  if (!currentTripLoaded) return 0;
  const g = geomProgressByKind(progress), roadRemainFrac = 1 - g.road, ferryRemainFrac = 1 - g.ferry;
  const baselineRoad = routeRoadTime * roadRemainFrac, baselineFerry = routeFerryTime * ferryRemainFrac;
  if (!etaModel.speedKmh || etaModel.movingKm < 2) return baselineRoad + baselineFerry;
  const roadKmRemaining = routeRoadDistance * roadRemainFrac, observedRoad = roadKmRemaining / etaModel.speedKmh * 60;
  const w = Math.min(.65, etaModel.movingKm / 45 * .65);
  return baselineRoad * (1 - w) + observedRoad * w + baselineFerry;
}
function update() {
  if (!currentTripLoaded) { $('remaining').textContent = '—'; $('eta').textContent = '—'; return renderOverlay(); }
  const travelledKm = officialDistanceAtProgress(progress), rem = Math.max(0, routeDist - travelledKm), rm = remainingMinutes();
  $('remaining').textContent = `${Math.round(rem)} km`;
  $('eta').textContent = routeTime > 0 ? new Date(Date.now() + rm * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Now';
  $('etaCaption').textContent = etaModel.speedKmh && etaModel.movingKm >= 2 ? 'live arrival' : 'arrival';
  const pct = routeDist > 0 ? Math.min(100, travelledKm / routeDist * 100) : 100;
  $('progressText').textContent = `${Math.round(pct)}% complete`; $('travelled').textContent = `${Math.round(travelledKm)} km`;
  $('fill').style.width = `${pct}%`; $('slider').value = Math.round(progress * 1000);
  if (followGPS) followViewAt(currentFollowPoint()); else renderOverlay();
}

function setTownLabels(info) {
  $('distanceLabel').textContent = info.hasFerry ? 'Official total distance' : 'Official distance';
  $('timeLabel').textContent = info.hasFerry ? 'Official total time' : 'Official time';
  $('distanceNote').textContent = info.hasFerry ? `Road ${info.roadDistance} + ferry ${info.ferryDistance} km` : 'NL-RDDb';
  $('timeNote').textContent = info.hasFerry ? `Road ${fmtMin(info.roadTime)} + ferry ${fmtMin(info.ferryTime)}` : 'NL-RDDb';
  $('tripModeHint').textContent = info.hasFerry ? 'Official road + ferry estimate' : 'Official town-to-town estimate';
}
function setGpsLabels(nearName, info) {
  $('distanceLabel').textContent = info.hasFerry ? 'Estimated total distance' : 'Estimated distance';
  $('timeLabel').textContent = info.hasFerry ? 'Estimated total time' : 'Estimated time';
  $('distanceNote').textContent = info.hasFerry ? `Calibrated near ${nearName} · ferry included` : `Calibrated near ${nearName}`;
  $('timeNote').textContent = info.hasFerry ? `Road + official ferry component` : `Calibrated near ${nearName}`;
  $('tripModeHint').textContent = 'Current road position → destination';
}
function setRouteTotals(info) {
  routeRoadDistance = info.roadDistance; routeRoadTime = info.roadTime; routeFerryDistance = info.ferryDistance; routeFerryTime = info.ferryTime;
  routeDist = info.totalDistance; routeTime = info.totalTime; currentTripHasFerry = info.hasFerry;
}
function busy(on) { $('go').disabled = on; $('go').textContent = on ? 'Calculating…' : 'Show trip'; }
function updateRouteQuality(virtual = false) {
  const errPct = routeDist > 0 ? Math.abs(routePolylineKm - routeDist) / routeDist * 100 : 0;
  if (!routeProgressReliable) { $('routeStatus').textContent = 'Schematic'; $('routeNote').textContent = 'Level 1 reliable · Level 2 ferry map approximate'; return; }
  if (virtual || currentTripHasFerry) $('routeStatus').textContent = 'Mixed'; else $('routeStatus').textContent = errPct <= 5 ? 'On road' : 'Map approx';
  const quality = routeDist > 0 ? `Map ${Math.round(routePolylineKm)} km · ${errPct.toFixed(1)}% vs official` : 'Co-located';
  $('routeNote').textContent = virtual ? `Ferry / remote leg · ${quality}` : quality;
}
function setProgressReliability(ok) {
  routeProgressReliable = !!ok;
  $('gpsStart').disabled = !routeProgressReliable || !currentTripLoaded || routeCoords.length < 2;
  if (!ok) $('gpsDetail').textContent = 'Level 1 distance/time is available, but this ferry map is schematic. Live route progress is disabled for this trip.';
}
function ferryFallback(originName, destName, a, b) {
  const p1 = pointForCommunity(originName, a), p2 = pointForCommunity(destName, b); if (!p1 || !p2) return false;
  routeSegments = [{ type: 'ferry', coords: [p1, p2], label: 'Schematic ferry connection' }]; routeCoords = flattenSegments(); metrics();
  setProgressReliability(false); fit(routeCoords); updateRouteQuality(true); return true;
}
function finishPath(virtual, statusText, originName, destName, a, b) {
  routeCoords = flattenSegments(); if (routeCoords.length < 2) throw new Error('empty path'); metrics();
  const mismatch = routeDist > 0 ? Math.abs(routePolylineKm - routeDist) / routeDist * 100 : 0;
  if (currentTripHasFerry && mismatch > 10 && ferryFallback(originName, destName, a, b)) {
    setStatus('Official ferry trip loaded. Level 2 is shown schematically because the local ferry network geometry does not match the official trip closely enough.');
  } else {
    setProgressReliability(true); setFollow(false); fit(routeCoords); updateRouteQuality(virtual); setStatus(statusText);
  }
  progress = 0; offRouteState = false; resetEta(); currentTripLoaded = true; update();
}
function buildAlias(av, bv, a, b, info) {
  setRouteTotals(info); setTownLabels(info); currentTripLoaded = true; routeSegments = [];
  const p1 = pointForCommunity(av, a), p2 = pointForCommunity(bv, b); routeCoords = p1 && p2 ? [p1, p2] : p1 ? [p1] : [];
  routeCoordKinds = routeCoords.length > 1 ? ['road'] : []; metrics(); setFollow(false); if (routeCoords.length) fit(routeCoords);
  $('destination').textContent = bv; $('distance').textContent = '0 km'; $('time').textContent = '0 min'; $('routeStatus').textContent = 'Same place'; $('routeNote').textContent = 'Official aliases / co-located communities';
  progress = 1; resetEta(); setProgressReliability(false); update(); setStatus('These two official community entries are co-located in NL-RDDb.');
}
function makeTrip() {
  stopGPS(false); saveTripPrefs();
  const av = $('from').value.trim(), bv = $('to').value.trim(), b = nameIndex.get(bv.toLowerCase());
  if (b == null) { setStatus('Choose a Newfoundland & Labrador destination from the list.', true); return; }
  currentDestIndex = b;
  if (originMode !== 'gps') {
    const a = nameIndex.get(av.toLowerCase()); if (a == null) { setStatus('Choose an origin from the list, or use current location.', true); return; }
    currentOriginIndex = a; if (a === b) { setStatus('Origin and destination must be different.', true); return; }
    const info = tripInfo(a, b); if (info.totalDistance === 0 && info.totalTime === 0) return buildAlias(av, bv, a, b, info);
    setRouteTotals(info); setTownLabels(info); buildTown(av, bv, a, b, info); return;
  }
  if (!originGPS) { setStatus('Current location has not been captured yet.', true); return; }
  buildGps(bv, b);
}
function buildTown(av, bv, a, b, info) {
  $('destination').textContent = bv; $('distance').textContent = `${routeDist} km`; $('time').textContent = fmtMin(routeTime);
  routeSegments = []; routeCoords = []; currentTripLoaded = true; progress = 0; resetEta(); update(); busy(true); setStatus('Calculating path locally…');
  setTimeout(() => {
    try {
      composePath(av, bv, a, b, info.hasFerry);
      const virtual = routeSegments.some(s => s.type !== 'road'), count = routeSegments.reduce((n, s) => n + (s.edgeCount || 0), 0);
      finishPath(virtual, `Offline path ready · ${count || 'special'} network segments.`, av, bv, a, b);
    } catch (_) { setProgressReliability(false); setStatus('Official trip data is available, but the Level 2 map path could not be connected.', true); }
    finally { busy(false); }
  }, 10);
}
function buildGps(bv, b) {
  return new Promise(resolve => {
    $('destination').textContent = bv; busy(true); setStatus('Routing from your road position…');
    setTimeout(() => {
      let ok = false;
      try {
        const nn = nearestNode(originGPS.lon, originGPS.lat), nc = nearestCommunity(originGPS.lon, originGPS.lat); if (nn.node < 0 || nc.index < 0) throw new Error('no nearby network');
        const ref = tripInfo(nc.index, b), allowFerry = ref.hasFerry;
        composeFromNode(nn.node, bv, b, [originGPS.lon, originGPS.lat], allowFerry); routeCoords = flattenSegments(); metrics();
        const baseStart = DATA.anchors[nc.index], baseGraph = graphKmToDestination(baseStart, bv, b, allowFerry), curGraph = graphKmToDestination(nn.node, bv, b, allowFerry);
        if (baseGraph == null || curGraph == null) throw new Error('calibration unavailable');
        let info;
        if (ref.totalDistance === 0 && ref.totalTime === 0) {
          // The nearest named community can be the destination itself. There is then
          // no RDDb town-to-town baseline to scale from, so use the actual local graph
          // distance and a conservative local-road speed rather than failing the trip.
          const localRoadKm = Math.max(.1, curGraph + nn.distanceKm);
          info = { roadDistance: localRoadKm, roadTime: Math.max(1, localRoadKm / 35 * 60), ferryDistance: 0, ferryTime: 0, hasFerry: false };
        } else {
          if (baseGraph <= .001) throw new Error('calibration baseline unavailable');
          const ratio = Math.max(.08, Math.min(2.5, curGraph / baseGraph));
          info = {
            roadDistance: Math.max(.1, ref.roadDistance * ratio + nn.distanceKm), roadTime: Math.max(1, ref.roadTime * ratio),
            ferryDistance: ref.ferryDistance, ferryTime: ref.ferryTime,
            hasFerry: ref.hasFerry,
          };
        }
        info.totalDistance = info.roadDistance + info.ferryDistance; info.totalTime = info.roadTime + info.ferryTime;
        setRouteTotals(info); setGpsLabels(names[nc.index], info); $('distance').textContent = `${Math.round(routeDist)} km`; $('time').textContent = fmtMin(routeTime);
        const virtual = routeSegments.some(s => s.type !== 'road'), mismatch = routeDist > 0 ? Math.abs(routePolylineKm - routeDist) / routeDist * 100 : 0;
        setProgressReliability(!(info.hasFerry && mismatch > 10)); fit(routeCoords); updateRouteQuality(virtual);
        progress = 0; gpsPosition = { lon: originGPS.lon, lat: originGPS.lat, accuracy: originGPS.accuracy }; offRouteState = false; resetEta(); currentTripLoaded = true; update();
        setStatus(`Current location routed · nearest reference: ${names[nc.index]} (${nc.distanceKm.toFixed(1)} km).`); ok = true;
      } catch (_) { setProgressReliability(false); setStatus('Could not connect current location to the offline road network.', true); }
      finally { busy(false); resolve(ok); }
    }, 10);
  });
}

async function swMessage(type, timeout = 45000) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  const reg = await navigator.serviceWorker.ready, worker = reg.active || reg.waiting || reg.installing; if (!worker) return null;
  return await new Promise(resolve => {
    const ch = new MessageChannel(), timer = setTimeout(() => resolve(null), timeout);
    ch.port1.onmessage = e => { clearTimeout(timer); resolve(e.data); }; worker.postMessage({ type }, [ch.port2]);
  });
}
async function verifyOfflinePackage(force = false) {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) { offlinePackageReady = false; updateRoadReadiness(); return false; }
  try { const r = await swMessage(force ? 'PREPARE_OFFLINE' : 'CACHE_STATUS', 60000); offlinePackageReady = !!r?.ready; updateRoadReadiness(r); return offlinePackageReady; }
  catch (e) { offlinePackageReady = false; updateRoadReadiness({ error: e.message }); return false; }
}
async function requestPersistentStorage() { try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch (_) {} return false; }
function installInstructions() {
  if (standaloneMode()) return 'Installed on Home Screen.'; if (deferredInstall) return 'Install is available on this device.';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent); return ios ? 'On iPhone/iPad: Share → Add to Home Screen after this page is on HTTPS.' : 'Install from your browser menu after this page is on HTTPS.';
}
function updateRoadReadiness(cacheResult = null) {
  const secure = window.isSecureContext, cache = offlinePackageReady, standalone = standaloneMode(); let text = '', cls = '';
  if (!secure) { text = 'Needs HTTPS before phone GPS can work.'; cls = 'warn'; }
  else if (!cache) { text = cacheResult?.error ? `Offline package incomplete: ${cacheResult.error}` : 'Offline package is still being verified.'; cls = 'warn'; }
  else if (gpsPermission === 'denied') { text = 'Offline data is ready, but Location permission is denied.'; cls = 'warn'; }
  else { text = `Offline package ready · GPS ${gpsPermission === 'granted' ? 'permission granted' : 'available'}${standalone ? ' · installed' : ''}.`; cls = 'good'; }
  $('roadReadyDetail').textContent = text; $('roadReadyDetail').className = `readydetail ${cls}`; $('installHint').textContent = installInstructions();
  $('prepareRoad').textContent = secure && cache ? 'Recheck road setup' : 'Prepare for road';
  if (secure && cache && gpsPermission !== 'denied') { $('appBadge').textContent = navigator.onLine ? '● ROAD READY' : '● OFFLINE READY'; $('appBadge').classList.remove('warn'); }
}
async function prepareForRoad() {
  const b = $('prepareRoad'); b.disabled = true; b.textContent = 'Preparing…'; setStatus('Preparing the complete offline package…');
  try {
    await requestPersistentStorage(); const cache = await verifyOfflinePackage(true); await refreshGpsPermission();
    if (!cache) { setStatus('Offline package did not finish caching. The previous complete offline version was kept; stay online and try again.', true); return; }
    const blocked = gpsBlockReason(); if (blocked) { setStatus(blocked, true); return; }
    setStatus('Offline package ready. Testing one GPS fix…');
    try { const p = await obtainFix(); gpsLastFixAt = Date.now(); setStatus(`ROAD READY · offline files verified · GPS fix ±${Math.round(p.coords.accuracy || 0)} m.`); $('gpsPill').textContent = 'GPS verified'; $('gpsPill').className = 'gpspill live'; }
    catch (e) { setStatus(`Offline package is ready. GPS test: ${geoErrorText(e)}`, true); }
  } finally { b.disabled = false; updateRoadReadiness(); }
}
function standaloneMode() { return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function gpsBlockReason() {
  if (!navigator.geolocation) return 'This browser does not expose GPS/geolocation.';
  if (!window.isSecureContext) return `GPS is blocked because ${location.hostname || 'this address'} is being served over HTTP. Use HTTPS for live GPS.`;
  if (gpsPermission === 'denied') return 'Location permission is denied. Enable Location access for this site/app in your browser or phone settings.'; return '';
}
function updateGpsEnvironment() {
  const secure = window.isSecureContext, standalone = standaloneMode(), proto = location.protocol.replace(':', '').toUpperCase(), host = location.hostname || 'local file';
  const perm = gpsPermission === 'unknown' ? 'permission not checked' : `permission ${gpsPermission}`;
  $('gpsEnv').textContent = `${secure ? 'Secure GPS context' : 'GPS blocked'} · ${standalone ? 'Home Screen / standalone' : 'browser tab'} · ${proto} ${host} · ${perm}`;
  $('gpsEnv').classList.toggle('warn', !secure || gpsPermission === 'denied');
  if (!secure) { $('gpsPill').textContent = 'GPS needs HTTPS'; $('gpsPill').className = 'gpspill warn'; }
  else if (!gpsRunning) { $('gpsPill').textContent = gpsPermission === 'denied' ? 'GPS denied' : 'GPS ready'; $('gpsPill').className = `gpspill${gpsPermission === 'denied' ? ' warn' : ''}`; }
  if (!(secure && offlinePackageReady && gpsPermission !== 'denied')) { $('appBadge').textContent = !secure ? '● HTTPS REQUIRED' : navigator.onLine ? '● PREPARING' : '● OFFLINE'; $('appBadge').classList.toggle('warn', !secure || !offlinePackageReady); }
  updateRoadReadiness();
}
async function refreshGpsPermission() {
  if (!navigator.permissions || !navigator.permissions.query) { updateGpsEnvironment(); return gpsPermission; }
  try { const q = await navigator.permissions.query({ name: 'geolocation' }); gpsPermission = q.state; q.onchange = () => { gpsPermission = q.state; updateGpsEnvironment(); }; }
  catch (_) { gpsPermission = 'unknown'; }
  updateGpsEnvironment(); return gpsPermission;
}
function geoErrorText(e) { if (!e) return 'Location unavailable.'; if (e.code === 1) return 'Location permission was denied.'; if (e.code === 2) return 'The phone could not determine a GPS position.'; if (e.code === 3) return 'GPS is taking longer than expected.'; return e.message || 'Location unavailable.'; }
function getOneFix(high = true) { return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: high, maximumAge: high ? 8000 : 30000, timeout: high ? 25000 : 12000 })); }
async function obtainFix() { try { return await getOneFix(true); } catch (first) { if (first && first.code === 1) throw first; return await getOneFix(false); } }
async function requestWake() { if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return; try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch (_) {} }
function releaseWake() { if (wakeLock) { try { wakeLock.release(); } catch (_) {} wakeLock = null; } }
function startStaleTimer() {
  if (gpsStaleTimer) clearInterval(gpsStaleTimer);
  gpsStaleTimer = setInterval(() => { if (!gpsRunning) return; if ((gpsLastFixAt ? Date.now() - gpsLastFixAt : Infinity) > 30000) { $('gpsPill').textContent = 'GPS waiting'; $('gpsPill').className = 'gpspill warn'; $('gpsDetail').textContent = 'GPS signal paused or stale. Keep the app visible and give the phone a clear view of the sky.'; } }, 5000);
}
function stopStaleTimer() { if (gpsStaleTimer) clearInterval(gpsStaleTimer); gpsStaleTimer = null; }
function updateOffRoute(distanceKm, accuracyM) {
  const accKm = Math.max(0, accuracyM || 0) / 1000;
  const enter = Math.min(.60, Math.max(.18, accKm * 2.4));
  const exit = Math.min(.40, Math.max(.11, accKm * 1.5));
  if (!offRouteState && distanceKm > enter) offRouteState = true;
  else if (offRouteState && distanceKm < exit) offRouteState = false;
  return { off: offRouteState, enter, exit };
}
function applyGpsFix(p) {
  const now = p.timestamp || Date.now(); gpsLastFixAt = Date.now();
  gpsPosition = { lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy || 0 };
  const s = snapGpsFix(gpsPosition.lon, gpsPosition.lat, now), acc = Math.round(gpsPosition.accuracy || 0);
  $('gpsPill').textContent = 'GPS live'; $('gpsPill').className = 'gpspill live';
  if (!s) { $('gpsDetail').textContent = `GPS fix ±${acc}m · waiting for route match`; renderOverlay(); return; }
  const state = updateOffRoute(s.distanceKm, gpsPosition.accuracy), reliableFix = (gpsPosition.accuracy || 0) <= 150;
  if (routeProgressReliable && reliableFix && !state.off) {
    let next = Math.max(progress, Math.min(1, s.fraction));
    if (lastGpsAppliedAt && next > progress && routePolylineKm > 0) {
      const dt = Math.max(1, (now - lastGpsAppliedAt) / 1000), maxGeomKm = dt / 3600 * 175 + 2.0, maxJump = maxGeomKm / routePolylineKm;
      if (next - progress > maxJump) next = progress;
    }
    trackPace(next, now, p.coords.speed); progress = next; lastGpsAppliedAt = now; update();
  } else renderOverlay();
  $('routeStatus').textContent = state.off ? 'Off route' : reliableFix ? (currentTripHasFerry ? 'Mixed' : 'On route') : 'GPS uncertain';
  $('gpsDetail').textContent = state.off ? `OFF ROUTE · ${s.distanceKm.toFixed(2)} km from path · GPS ±${acc}m` : reliableFix ? `On route · GPS ±${acc}m${etaModel.speedKmh ? ` · pace ${Math.round(etaModel.speedKmh)} km/h` : ''}` : `GPS ±${acc}m · waiting for a more accurate fix`;
  $('gpsDetail').classList.toggle('offroute', state.off);
}
async function captureLocation() {
  await refreshGpsPermission(); const blocked = gpsBlockReason(); if (blocked) { setStatus(blocked, true); updateGpsEnvironment(); return; }
  $('useLocation').disabled = true; $('useLocation').textContent = 'Locating…'; setStatus('Requesting a GPS fix…');
  try {
    const p = await obtainFix(); originGPS = { lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy || 0, capturedAt: Date.now() }; originMode = 'gps'; $('from').value = 'Current location';
    const nc = nearestCommunity(originGPS.lon, originGPS.lat); $('locationHint').textContent = nc.index >= 0 ? `near ${names[nc.index]} · GPS ±${Math.round(originGPS.accuracy)}m` : `GPS ±${Math.round(originGPS.accuracy)}m`;
    $('useLocation').textContent = '◎ Refresh location'; makeTrip();
  } catch (e) { setStatus(geoErrorText(e), true); $('useLocation').textContent = '◎ Use current location'; }
  finally { $('useLocation').disabled = false; refreshGpsPermission(); }
}
async function startGPS() {
  if (!routeCoords.length || !routeProgressReliable) { setStatus(routeProgressReliable ? 'Load a trip before starting GPS.' : 'This Level 2 ferry map is schematic, so live route progress is disabled for this trip.', true); return; }
  await refreshGpsPermission(); const blocked = gpsBlockReason(); if (blocked) { setStatus(blocked, true); updateGpsEnvironment(); return; } if (gpsWatch != null) return;
  $('gpsStart').disabled = true; $('gpsDetail').textContent = 'Getting a fresh start position…'; let first = null;
  try {
    first = await obtainFix();
    if (originMode === 'gps' && currentDestIndex >= 0) {
      originGPS = { lon: first.coords.longitude, lat: first.coords.latitude, accuracy: first.coords.accuracy || 0, capturedAt: Date.now() }; $('from').value = 'Current location';
      const nc = nearestCommunity(originGPS.lon, originGPS.lat); $('locationHint').textContent = nc.index >= 0 ? `near ${names[nc.index]} · GPS ±${Math.round(originGPS.accuracy)}m` : `GPS ±${Math.round(originGPS.accuracy)}m`;
      const ok = await buildGps(names[currentDestIndex], currentDestIndex); if (!ok || !routeProgressReliable) throw new Error('route refresh failed');
    }
  } catch (e) { setStatus(geoErrorText(e) || 'Could not refresh GPS start position.', true); $('gpsStart').disabled = !routeProgressReliable; return; }
  gpsRunning = true; setFollow(true, true); lastGpsAppliedAt = 0; offRouteState = false;
  $('gpsStart').disabled = true; $('gpsStop').disabled = false; $('slider').disabled = true; $('gpsDetail').textContent = 'Live GPS active · keep NL Offline open while driving.';
  $('gpsPill').textContent = 'GPS starting'; $('gpsPill').className = 'gpspill'; resetEta(); gpsLastFixAt = 0; startStaleTimer(); requestWake();
  if (first && gpsRunning) applyGpsFix(first); if (!gpsRunning) return;
  gpsWatch = navigator.geolocation.watchPosition(p => applyGpsFix(p), e => {
    if (e?.code === 1) { setStatus(geoErrorText(e), true); stopGPS(false); refreshGpsPermission(); return; }
    $('gpsPill').textContent = 'GPS waiting'; $('gpsPill').className = 'gpspill warn'; $('gpsDetail').textContent = `${geoErrorText(e)} The tracker will keep trying while the app is open.`;
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  setStatus('Live trip running · map, route, distance and ETA are operating locally.');
}
function stopGPS(clear = true) {
  gpsRunning = false; lastGpsAppliedAt = 0; if (gpsWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null;
  stopStaleTimer(); releaseWake(); setFollow(false); $('gpsStart').disabled = !routeProgressReliable || !currentTripLoaded || routeCoords.length < 2; $('gpsStop').disabled = true; $('slider').disabled = false;
  if (clear) { gpsPosition = null; offRouteState = false; $('gpsDetail').textContent = 'Slider simulates driving. Tap Follow to preview the moving map; live GPS requires HTTPS.'; $('gpsDetail').classList.remove('offroute'); renderOverlay(); }
  updateGpsEnvironment();
}

$('prepareRoad').addEventListener('click', prepareForRoad);
$('go').addEventListener('click', makeTrip);
$('useLocation').addEventListener('click', captureLocation);
$('from').addEventListener('input', () => { if ($('from').value.trim().toLowerCase() !== 'current location') { originMode = 'town'; originGPS = null; $('locationHint').textContent = ''; } });
$('swap').addEventListener('click', () => { if (originMode === 'gps') { originMode = 'town'; originGPS = null; $('locationHint').textContent = ''; } const x = $('from').value; $('from').value = $('to').value; $('to').value = x; makeTrip(); });
$('slider').addEventListener('input', () => { gpsPosition = null; progress = +$('slider').value / 1000; resetEta(); update(); if (followGPS) { $('gpsDetail').textContent = 'Simulation follow active · drag the slider to preview the moving map.'; $('routeStatus').textContent = 'Simulating'; } });
$('gpsStart').addEventListener('click', startGPS);
$('gpsStop').addEventListener('click', () => stopGPS(true));
$('follow').addEventListener('click', () => { setFollow(!followGPS, !followGPS); if (followGPS && !gpsRunning) $('gpsDetail').textContent = 'Simulation follow active · drag the slider to preview the moving map.'; });
$('fitRoute').addEventListener('click', () => { setFollow(false); fit(routeCoords); updateRouteQuality(routeSegments.some(s => s.type !== 'road')); $('gpsDetail').textContent = gpsRunning ? 'Live GPS active.' : routeProgressReliable ? 'Slider simulates driving. Tap Follow to preview the moving map.' : 'Level 2 is schematic for this ferry trip.'; });
$('zoomIn').addEventListener('click', () => zoom(.65));
$('zoomOut').addEventListener('click', () => zoom(1.55));

const mw = $('mapwrap');
mw.addEventListener('pointerdown', e => {
  if (followGPS) { setFollow(false); $('gpsDetail').textContent = 'Follow paused because you moved the map.'; }
  drag = { x: e.clientX, y: e.clientY, v: { ...view } }; mw.setPointerCapture(e.pointerId);
});
mw.addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y, w = mw.clientWidth, h = mw.clientHeight;
  const lon = (drag.v.maxx - drag.v.minx) * dx / Math.max(w, 1), lat = (drag.v.maxy - drag.v.miny) * dy / Math.max(h, 1);
  view = { minx: drag.v.minx - lon, maxx: drag.v.maxx - lon, miny: drag.v.miny + lat, maxy: drag.v.maxy + lat };
  if (!rafPan) rafPan = requestAnimationFrame(() => { rafPan = 0; renderBase(); renderOverlay(); });
});
mw.addEventListener('pointerup', () => drag = null); mw.addEventListener('pointercancel', () => drag = null);

if ('ResizeObserver' in window) new ResizeObserver(() => size()).observe(mw);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; updateRoadReadiness(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; updateRoadReadiness(); });
window.addEventListener('resize', size);
window.addEventListener('online', () => { updateGpsEnvironment(); verifyOfflinePackage(false); });
window.addEventListener('offline', updateGpsEnvironment);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (gpsRunning) { requestWake(); obtainFix().then(p => { if (gpsRunning) applyGpsFix(p); }).catch(() => {}); } updateGpsEnvironment(); }
  else if (gpsRunning) $('gpsDetail').textContent = 'App is in the background. Live GPS may pause until NL Offline is visible again.';
});
window.addEventListener('pageshow', () => { updateGpsEnvironment(); if (gpsRunning) obtainFix().then(p => { if (gpsRunning) applyGpsFix(p); }).catch(() => {}); });

async function boot() {
  restoreTripPrefs(); size(); await refreshGpsPermission(); updateGpsEnvironment();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js?v=0.11', { scope: './' }); await navigator.serviceWorker.ready; reg.update().catch(() => {}); await verifyOfflinePackage(false);
    } catch (e) { offlinePackageReady = false; updateRoadReadiness({ error: e.message }); }
  } else updateRoadReadiness();
  setStatus(`Ready · ${DATA.level1Count} official places · ${DATA.level2Count || DATA.routeReady} mapped locally · ${DATA.ferryPairCount || 0} ferry-aware pairs.`);
  makeTrip();
}
boot();

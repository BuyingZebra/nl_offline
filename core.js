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

// v0.12 conservative Level-2 routing-anchor corrections.
// These are only used for route graph entry/exit; community label placement still uses the original anchors.
// Selection rule: <=2 km movement, <=1% validated median error, <=10% p90 error, and >=5 km median improvement.
const ROUTING_ANCHOR_OVERRIDES = Object.freeze({"Turks Cove":1378,"Brownsdale":17544,"Sibley's Cove":19079,"New Melbourne":6053,"New Perlican":37049,"Lead Cove":29208,"Winterton":6213,"Hant's Harbour":21697,"Biscay Bay":923,"New Chelsea":3319,"Trepassey":17561,"Angels Cove":9902,"Patrick's Cove":8301,"Conception Bay South (Kelligrews)":35356,"Kelligrews (Conception Bay South)":35356,"Little Barasway":13549,"Dunville (Placentia)":33846,"Placentia (Dunville)":33846,"Ship Cove, Placentia Bay":14269,"Gooseberry Cove, Placentia Bay":28685,"Placentia (Jerseyside)":36931});
const ROUTING_ANCHOR_META = Object.freeze({"Turks Cove":{"old":19846,"new":1378,"medianPct":0.23,"p90Pct":4.46,"moveKm":0.27},"Brownsdale":{"old":34282,"new":17544,"medianPct":0.19,"p90Pct":3.77,"moveKm":0.83},"Sibley's Cove":{"old":19499,"new":19079,"medianPct":0.2,"p90Pct":4.04,"moveKm":0.33},"New Melbourne":{"old":34894,"new":6053,"medianPct":0.19,"p90Pct":4.05,"moveKm":0.37},"New Perlican":{"old":33951,"new":37049,"medianPct":0.22,"p90Pct":4.49,"moveKm":0.56},"Lead Cove":{"old":24523,"new":29208,"medianPct":0.26,"p90Pct":4.26,"moveKm":0.07},"Winterton":{"old":4469,"new":6213,"medianPct":0.26,"p90Pct":4.26,"moveKm":0.37},"Hant's Harbour":{"old":13446,"new":21697,"medianPct":0.24,"p90Pct":4.04,"moveKm":1.73},"Biscay Bay":{"old":8120,"new":923,"medianPct":0.18,"p90Pct":8.07,"moveKm":0.32},"New Chelsea":{"old":32068,"new":3319,"medianPct":0.41,"p90Pct":3.52,"moveKm":0.83},"Trepassey":{"old":34966,"new":17561,"medianPct":0.32,"p90Pct":8.81,"moveKm":1.73},"Angels Cove":{"old":2015,"new":9902,"medianPct":0.2,"p90Pct":6.48,"moveKm":0.18},"Patrick's Cove":{"old":22144,"new":8301,"medianPct":0.22,"p90Pct":7.63,"moveKm":0.24},"Conception Bay South (Kelligrews)":{"old":33382,"new":35356,"medianPct":0.23,"p90Pct":4.9,"moveKm":0.35},"Kelligrews (Conception Bay South)":{"old":33382,"new":35356,"medianPct":0.23,"p90Pct":4.9,"moveKm":0.35},"Little Barasway":{"old":17364,"new":13549,"medianPct":0.28,"p90Pct":9.2,"moveKm":0.0},"Dunville (Placentia)":{"old":14801,"new":33846,"medianPct":0.24,"p90Pct":7.78,"moveKm":1.22},"Placentia (Dunville)":{"old":14801,"new":33846,"medianPct":0.24,"p90Pct":7.78,"moveKm":1.22},"Ship Cove, Placentia Bay":{"old":13549,"new":14269,"medianPct":0.38,"p90Pct":7.14,"moveKm":0.18},"Gooseberry Cove, Placentia Bay":{"old":22147,"new":28685,"medianPct":0.29,"p90Pct":7.27,"moveKm":0.12},"Placentia (Jerseyside)":{"old":3435,"new":36931,"medianPct":0.36,"p90Pct":6.47,"moveKm":0.26}});
function routingAnchor(index) {
  const name = names[index];
  const override = name != null ? ROUTING_ANCHOR_OVERRIDES[name] : null;
  return override != null ? override : DATA.anchors[index];
}
function usesCorrectedAnchor(index) { return index >= 0 && ROUTING_ANCHOR_OVERRIDES[names[index]] != null; }

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
let latestSpeedKmh = null, latestAccuracyM = null;
let etaModel = { movingKm: 0, speedKmh: null, lastOfficialDistance: null, lastTs: null, startedAt: null, startOfficialMinutes: 0, scheduleRatio: null, samples: 0 };
const ROAD_LOG_KEY = 'nl-offline-roadtest-v012';
let roadLog = [];
let lastLoggedFixAt = 0;

let view = { minx: DATA.bounds[0], miny: DATA.bounds[1], maxx: DATA.bounds[2], maxy: DATA.bounds[3] };

function setStatus(text, warn = false) { $('statusText').textContent = text; $('status').classList.toggle('warn', warn); }

function loadRoadLog() {
  try { const raw = localStorage.getItem(ROAD_LOG_KEY); roadLog = raw ? JSON.parse(raw) : []; if (!Array.isArray(roadLog)) roadLog = []; } catch (_) { roadLog = []; }
  updateRoadLogUI();
}
function saveRoadLog() {
  try { localStorage.setItem(ROAD_LOG_KEY, JSON.stringify(roadLog.slice(-1200))); } catch (_) {}
}
function currentTripSnapshot() {
  return {
    origin: originMode === 'gps' ? 'Current location' : $('from').value.trim(), destination: $('to').value.trim(),
    officialKm: routeDist || 0, officialMin: routeTime || 0, mapKm: +routePolylineKm.toFixed(2), progress: +progress.toFixed(5),
    ferry: !!currentTripHasFerry, level2Reliable: !!routeProgressReliable,
    correctedOriginAnchor: usesCorrectedAnchor(currentOriginIndex), correctedDestinationAnchor: usesCorrectedAnchor(currentDestIndex)
  };
}
function logRoadEvent(type, detail = {}, forceSave = false) {
  const item = { at: new Date().toISOString(), type, ...detail };
  roadLog.push(item); if (roadLog.length > 1200) roadLog.splice(0, roadLog.length - 1200);
  if (forceSave || roadLog.length % 5 === 0) saveRoadLog(); updateRoadLogUI();
}
function updateRoadLogUI() {
  const el = $('logSummary'); if (el) el.textContent = `${roadLog.length} local test events · never uploaded`;
}
async function exportRoadLog() {
  const payload = {
    app: 'NL Offline', version: '0.12.0', exportedAt: new Date().toISOString(),
    userAgent: navigator.userAgent, standalone: standaloneMode(), secure: window.isSecureContext,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 },
    trip: currentTripSnapshot(), events: roadLog
  };
  payload.anchorCorrections = ROUTING_ANCHOR_META;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const filename = `nl-offline-roadtest-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  const file = typeof File === 'function' ? new File([blob], filename, { type: 'application/json' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] }) && navigator.share) { await navigator.share({ title: 'NL Offline road-test log', files: [file] }); return; }
  } catch (_) {}
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function clearRoadLog() { roadLog = []; saveRoadLog(); updateRoadLogUI(); setStatus('Local road-test log cleared.'); }
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

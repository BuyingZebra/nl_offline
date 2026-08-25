// NL Offline v0.18 — metadata-driven fastest-reasonable routing.
// Uses the original National Road Network (NRN) road class / route number / lane metadata.
// Level 1 NL-RDDb distance and time remain authoritative display values.

const ROAD_META = window.NL_ROAD_META || {};
function decodeU8B64(s, length) {
  const out = new Uint8Array(length || 0);
  if (!s) return out;
  const bin = atob(s), n = Math.min(bin.length, out.length);
  for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const ROAD_CLASS = decodeU8B64(ROAD_META.classB64, DATA.edges.length);
const ROAD_LANES = decodeU8B64(ROAD_META.laneB64, DATA.edges.length);
const ROAD_ROUTE = decodeU16(ROAD_META.routeB64 || '');
const ROAD_CLASSES = ROAD_META.classes || [];
const ROAD_ROUTES = ROAD_META.routes || [];
const ROAD_ROUTE_NAMES = ROAD_META.routeNames || {};

const ROUTING_PROFILE = Object.freeze({
  version: 'NRN fastest-reasonable v4 + dual-end civic access',
  maxKmh: 105,
  primaryRoutes: ['1', '2', '75'],
  speedKmh: {
    freeway: 100,
    expresswayNumbered: 82,
    expressway: 76,
    arterial: 65,
    collector: 58,
    ramp: 50,
    local: 44,
    strata: 32,
    unknownLocal: 38,
    service: 24,
  },
  exitPenaltyMin: 1.15,
  arterialExitPenaltyMin: 0.35,
});
window.NL_ROUTING_PROFILE = ROUTING_PROFILE;

function routeNumber(ei) { return ROAD_ROUTES[ROAD_ROUTE[ei] || 0] || ''; }
function roadClassName(ei) { return ROAD_CLASSES[ROAD_CLASS[ei] || 0] || ''; }
function isPrimaryRoute(r) { return r === '1' || r === '2' || r === '75'; }

function roadTier(ei) {
  const cls = roadClassName(ei), r = routeNumber(ei);
  if (isPrimaryRoute(r) || cls === 'Freeway') return 5;
  if (cls === 'Expressway / Highway') return 4;
  if (cls === 'Arterial' || cls === 'Ramp') return 3;
  if (cls === 'Collector') return 2;
  return 1;
}
function edgeSpeedKmh(ei) {
  const cls = roadClassName(ei), r = routeNumber(ei), lanes = ROAD_LANES[ei] || 0;
  if ((DATA.edges[ei]?.[4] || 'road') === 'ferry') return 25;
  let v;
  if (isPrimaryRoute(r)) v = 100;
  else if (cls === 'Freeway') v = 100;
  else if (cls === 'Expressway / Highway') v = r ? ROUTING_PROFILE.speedKmh.expresswayNumbered : ROUTING_PROFILE.speedKmh.expressway;
  else if (cls === 'Arterial') v = ROUTING_PROFILE.speedKmh.arterial;
  else if (cls === 'Collector') v = ROUTING_PROFILE.speedKmh.collector;
  else if (cls === 'Ramp') v = ROUTING_PROFILE.speedKmh.ramp;
  else if (cls === 'Local / Strata') v = ROUTING_PROFILE.speedKmh.strata;
  else if (cls === 'Local / Unknown') v = ROUTING_PROFILE.speedKmh.unknownLocal;
  else if (cls === 'Service Lane' || cls === 'Alleyway / Lane') v = ROUTING_PROFILE.speedKmh.service;
  else v = ROUTING_PROFILE.speedKmh.local;
  if (lanes >= 4 && cls !== 'Local / Street' && cls !== 'Ramp') v = Math.min(100, v + 4);
  return v;
}
function transitionPenalty(prevTier, nextTier) {
  if (!prevTier) return 0;
  if (prevTier >= 4 && nextTier <= 2) return ROUTING_PROFILE.exitPenaltyMin;
  if (prevTier >= 4 && nextTier === 3) return ROUTING_PROFILE.arterialExitPenaltyMin;
  if (prevTier - nextTier >= 2) return .18;
  return 0;
}

function estimateRouteMinutes(edgeIds) {
  let mins = 0, prevTier = 0;
  for (const ei of edgeIds || []) {
    const e = DATA.edges[ei]; if (!e) continue;
    const type = e[4] || 'road';
    if (type === 'ferry') { mins += (e[2] || 0) / 25 * 60; prevTier = 0; continue; }
    const tier = roadTier(ei);
    mins += (e[2] || 0) / Math.max(20, edgeSpeedKmh(ei)) * 60 + transitionPenalty(prevTier, tier);
    prevTier = tier;
  }
  return mins;
}
window.estimateRouteMinutes = estimateRouteMinutes;

const distanceRouterV014 = dijkstra;
function straightMinutes(u, t) {
  const a = DATA.nodes[u], b = DATA.nodes[t];
  if (!a || !b) return 0;
  const lat = (a[1] + b[1]) * Math.PI / 360;
  const km = Math.hypot((b[0] - a[0]) * 111.32 * Math.cos(lat), (b[1] - a[1]) * 111.32);
  return km / ROUTING_PROFILE.maxKmh * 60;
}

// A* with a small state dimension for the previous road tier. That lets us penalize
// premature exits from freeways/major highways without blocking necessary local access.
dijkstra = function(s, t, options = {}) {
  if (options.allowFerry || options.metric === 'distance') return distanceRouterV014(s, t, options);
  if (s === t) return [];
  const LEVELS = 6, stateCount = adj.length * LEVELS;
  const dist = new Float64Array(stateCount); dist.fill(Infinity);
  const prevState = new Int32Array(stateCount); prevState.fill(-1);
  const prevEdge = new Int32Array(stateCount); prevEdge.fill(-1);
  const sid = (node, tier) => node * LEVELS + tier;
  const start = sid(s, 0); dist[start] = 0;
  const h = new Heap(); h.push([straightMinutes(s, t), start]);
  let goal = -1;
  while (h.size) {
    const item = h.pop(), state = item[1], node = Math.floor(state / LEVELS), prevTier = state % LEVELS;
    const g = dist[state];
    // Heap key contains g+heuristic. Old states are filtered by recomputing it.
    if (Math.abs(item[0] - (g + straightMinutes(node, t))) > 1e-7) continue;
    if (node === t) { goal = state; break; }
    for (const [v, km, ei, type] of adj[node]) {
      if (type === 'ferry') continue;
      const tier = roadTier(ei), mins = km / Math.max(20, edgeSpeedKmh(ei)) * 60 + transitionPenalty(prevTier, tier);
      const ns = sid(v, tier), ng = g + mins;
      if (ng + 1e-10 < dist[ns]) {
        dist[ns] = ng; prevState[ns] = state; prevEdge[ns] = ei;
        h.push([ng + straightMinutes(v, t), ns]);
      }
    }
  }
  if (goal < 0) return null;
  const edges = []; let state = goal;
  while (state !== start) {
    const ei = prevEdge[state]; if (ei < 0) return null;
    edges.push(ei); state = prevState[state]; if (state < 0) return null;
  }
  return edges.reverse();
};

// v0.14 urban anchor correction: the former St. John's anchor landed ~4 km north of
// the central city and biased the route away from the Route 2/Pitts Memorial approach.
// This node is on Route 2 near the central-city access and independently produces the
// expected Route 75 -> Route 1/TCH -> Route 2 corridor while staying close to NL-RDDb totals.
const V014_ANCHOR_OVERRIDES = Object.freeze({ "St. John's": 34301 });
const baseRoutingAnchorV014 = routingAnchor;
routingAnchor = function(index) {
  const name = names[index], override = name != null ? V014_ANCHOR_OVERRIDES[name] : null;
  return override != null ? override : baseRoutingAnchorV014(index);
};
const baseUsesCorrectedAnchorV014 = usesCorrectedAnchor;
usesCorrectedAnchor = function(index) { return baseUsesCorrectedAnchorV014(index) || (index >= 0 && V014_ANCHOR_OVERRIDES[names[index]] != null); };
window.NL_V014_ANCHOR_COUNT = Object.keys(V014_ANCHOR_OVERRIDES).length;

function routeDisplayName(r) {
  if (!r) return '';
  if (r === '1') return 'Route 1 / TCH';
  if (r === '2') return 'Route 2 / Pitts Memorial';
  if (r === '75') return 'Route 75 / Veterans Memorial';
  const n = ROAD_ROUTE_NAMES[r];
  return n ? `Route ${r} / ${n}` : `Route ${r}`;
}
function describeRouteEdges(edgeIds) {
  if (!edgeIds?.length) return '';
  const groups = []; let cur = null;
  for (const ei of edgeIds) {
    if ((DATA.edges[ei]?.[4] || 'road') !== 'road') continue;
    const cls = roadClassName(ei), r = routeNumber(ei), km = DATA.edges[ei][2] || 0;
    if (cls === 'Ramp') continue;
    const key = r || (roadTier(ei) >= 4 ? cls : '');
    if (!key) continue;
    if (cur && cur.key === key) cur.km += km;
    else { cur = { key, route: r, cls, km }; groups.push(cur); }
  }
  const kept = groups.filter(g => isPrimaryRoute(g.route) || g.km >= 3.0 || (g.cls === 'Freeway' && g.km >= 1.5));
  // Merge repeated corridor labels caused by short access fragments.
  const labels = [];
  for (const g of kept) {
    const label = g.route ? routeDisplayName(g.route) : g.cls;
    if (label && labels.at(-1) !== label) labels.push(label);
  }
  return labels.length ? `Via ${labels.slice(0, 5).join(' → ')}` : '';
}
window.describeRouteEdges = describeRouteEdges;

const baseTripSnapshotV014 = currentTripSnapshot;
currentTripSnapshot = function() {
  return { ...baseTripSnapshotV014(), routeModel: ROUTING_PROFILE.version, via: describeRouteEdges(routeEdgeIds || []) };
};

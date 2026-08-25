function orientedEdgeCoords(edge, fromNode, toNode) {
  let coords = edge[3].map(p => [p[0], p[1]]);
  if (!coords.length) throw new Error('route edge has no geometry');
  const from = DATA.nodes[fromNode], to = DATA.nodes[toNode];
  const forward = kmBetween(coords[0], from) + kmBetween(coords.at(-1), to);
  const backward = kmBetween(coords.at(-1), from) + kmBetween(coords[0], to);
  if (backward < forward) coords.reverse();
  if (kmBetween(coords[0], from) > .02) coords.unshift([from[0], from[1]]);
  if (kmBetween(coords.at(-1), to) > .02) coords.push([to[0], to[1]]);
  return coords;
}
function polylineKm(coords) { let total = 0; for (let i = 1; i < (coords || []).length; i++) total += kmBetween(coords[i - 1], coords[i]); return total; }
function addRoad(es, startNode) {
  if (es == null) throw new Error('network components do not connect');
  if (startNode == null || startNode < 0 || !DATA.nodes[startNode]) throw new Error('route start node unavailable');
  let cur = null, node = startNode;
  for (const ei of es) {
    const e = DATA.edges[ei]; if (!e) throw new Error(`route edge ${ei} unavailable`);
    let next = -1;
    if (e[0] === node) next = e[1];
    else if (e[1] === node) next = e[0];
    else throw new Error(`route edge ${ei} is not contiguous with node ${node}`);
    routeEdgeIds.push(ei); routeEdgeTraversals.push({ edgeId: ei, fromNode: node, toNode: next });
    const raw = e[4] || 'road', c = orientedEdgeCoords(e, node, next);
    const type = raw === 'ferry' ? 'ferry' : raw === 'virtual' ? 'virtual' : 'road';
    if (cur && cur.type === type) {
      const last = cur.coords.at(-1), append = kmBetween(last, c[0]) <= .025 ? c.slice(1) : c;
      cur.coords.push(...append); cur.edgeCount++;
    } else {
      cur = { type, coords: c, edgeCount: 1, schematic: type === 'virtual', label: type === 'ferry' ? 'Ferry segment' : type === 'virtual' ? 'Schematic network connection' : '' };
      routeSegments.push(cur);
    }
    node = next;
  }
  return node;
}
function addVirtual(a, b, label, type = 'virtual', options = {}) {
  if (!a || !b) throw new Error('schematic endpoint unavailable');
  routeSegments.push({ type, coords: [[a[0], a[1]], [b[0], b[1]]], label, schematic: options.schematic ?? type === 'virtual', access: type === 'access' });
}
function addAccessCoords(coords, label, options = {}) {
  if (!coords?.length) return;
  const clean = coords.map(point => [point[0], point[1]]);
  if (clean.length < 2 || polylineKm(clean) < .003) return;
  routeSegments.push({
    type: 'access', coords: clean, label, schematic: false, access: true,
    accessMinutes: options.accessMinutes ?? null, sourceEdgeId: options.sourceEdgeId ?? null,
  });
}
function gatewayNode(name) { const i = nameIndex.get(name.toLowerCase()); return i == null ? -1 : routingAnchor(i); }
function remotePoint(name) { const s = special[name]; return s ? [s.lon, s.lat] : null; }
function pointForCommunity(name, index) { return remotePoint(name) || (DATA.anchors[index] >= 0 ? DATA.nodes[DATA.anchors[index]] : null); }
const SPECIAL_LOCAL_ROAD_NODES = Object.freeze({ "Shalloway Cove, St. Brendan's": 28279 });
function specialLocalRoadNode(name) { const node = SPECIAL_LOCAL_ROAD_NODES[name]; return node != null && DATA.nodes[node] ? node : -1; }

function composePath(originName, destName, a, b, allowFerry) {
  routeSegments = []; routeEdgeIds = []; routeEdgeTraversals = [];
  const sa = special[originName], sb = special[destName], aa = routingAnchor(a), bb = routingAnchor(b);
  if (!sa && !sb) { addRoad(dijkstra(aa, bb, { allowFerry }), aa); return; }
  if (sa && sb && ((originName === 'Francois' && destName === 'Grey River') || (originName === 'Grey River' && destName === 'Francois'))) {
    addVirtual(remotePoint(originName), remotePoint(destName), 'Direct remote ferry', 'ferry', { schematic: true }); return;
  }
  const startLocal = sa && !allowFerry ? specialLocalRoadNode(originName) : -1;
  const endLocal = sb && !allowFerry ? specialLocalRoadNode(destName) : -1;
  const startNode = sa ? (startLocal >= 0 ? startLocal : gatewayNode(sa.gateway)) : aa;
  const endNode = sb ? (endLocal >= 0 ? endLocal : gatewayNode(sb.gateway)) : bb;
  if (startNode < 0 || endNode < 0) throw new Error('gateway anchor unavailable');
  if (sa) addVirtual(remotePoint(originName), DATA.nodes[startNode], startLocal >= 0 ? 'Community road access' : sa.label, startLocal >= 0 ? 'access' : 'ferry', { schematic: startLocal < 0 });
  const road = dijkstra(startNode, endNode, { allowFerry }); if (road == null) throw new Error('network components do not connect'); if (road.length) addRoad(road, startNode);
  if (sb) addVirtual(DATA.nodes[endNode], remotePoint(destName), endLocal >= 0 ? 'Community road access' : sb.label, endLocal >= 0 ? 'access' : 'ferry', { schematic: endLocal < 0 });
}
function composeFromNode(startNode, destName, b, originPoint, allowFerry) {
  routeSegments = []; routeEdgeIds = []; routeEdgeTraversals = []; const sb = special[destName], endNode = sb ? gatewayNode(sb.gateway) : routingAnchor(b);
  if (endNode < 0) throw new Error('destination anchor unavailable');
  if (originPoint && kmBetween(originPoint, DATA.nodes[startNode]) > .03) addVirtual(originPoint, DATA.nodes[startNode], 'GPS to road', 'access', { schematic: false });
  const road = dijkstra(startNode, endNode, { allowFerry }); if (road && road.length) addRoad(road, startNode);
  if (sb) addVirtual(DATA.nodes[endNode], remotePoint(destName), sb.label, 'ferry', { schematic: true });
}

function composeNodeToNode(startNode, endNode, startPoint = null, endPoint = null, startLabel = 'Position to road', endLabel = 'Road to destination', allowFerry = false) {
  routeSegments = []; routeEdgeIds = []; routeEdgeTraversals = [];
  if (startNode == null || endNode == null || startNode < 0 || endNode < 0) throw new Error('route endpoint unavailable');
  if (startPoint && kmBetween(startPoint, DATA.nodes[startNode]) > .025) addVirtual(startPoint, DATA.nodes[startNode], startLabel, 'access', { schematic: false });
  const road = dijkstra(startNode, endNode, { allowFerry });
  if (road == null) throw new Error('network components do not connect');
  if (road.length) addRoad(road, startNode);
  if (endPoint && kmBetween(DATA.nodes[endNode], endPoint) > .025) addVirtual(DATA.nodes[endNode], endPoint, endLabel, 'access', { schematic: false });
}

function projectPointToPolyline(coords, point) {
  if (!coords?.length || !point) return null;
  if (coords.length === 1) return { point: [coords[0][0], coords[0][1]], segment: 0, alongKm: 0, totalKm: 0 };
  const cumulative = [0]; let total = 0, best = null;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i], segmentKm = kmBetween(a, b); total += segmentKm; cumulative.push(total);
    const scaleLon = 111.32 * Math.cos((point[1] + (a[1] + b[1]) / 2) * Math.PI / 360);
    const ax = a[0] * scaleLon, ay = a[1] * 111.32, bx = b[0] * scaleLon, by = b[1] * 111.32, px = point[0] * scaleLon, py = point[1] * 111.32;
    const vx = bx - ax, vy = by - ay, length2 = vx * vx + vy * vy;
    let t = length2 ? ((px - ax) * vx + (py - ay) * vy) / length2 : 0; t = Math.max(0, Math.min(1, t));
    const projected = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const distanceKm = kmBetween(point, projected);
    if (!best || distanceKm < best.distanceKm) best = { point: projected, segment: i - 1, t, distanceKm, alongKm: cumulative[i - 1] + segmentKm * t };
  }
  return best ? { ...best, totalKm: total, cumulative } : null;
}
function splitPolylineAtPoint(coords, point) {
  const location = projectPointToPolyline(coords, point); if (!location) return null;
  const before = coords.slice(0, location.segment + 1).map(p => [p[0], p[1]]), after = coords.slice(location.segment + 1).map(p => [p[0], p[1]]);
  if (!before.length || kmBetween(before.at(-1), location.point) > .001) before.push(location.point);
  else before[before.length - 1] = location.point;
  if (!after.length || kmBetween(location.point, after[0]) > .001) after.unshift(location.point);
  else after[0] = location.point;
  return { ...location, before, after };
}
function polylineBetweenPoints(coords, startPoint, endPoint) {
  const start = projectPointToPolyline(coords, startPoint), end = projectPointToPolyline(coords, endPoint); if (!start || !end) return [startPoint, endPoint];
  const forward = start.alongKm <= end.alongKm, low = forward ? start : end, high = forward ? end : start;
  const out = [low.point];
  for (let i = low.segment + 1; i <= high.segment; i++) if (coords[i] && kmBetween(out.at(-1), coords[i]) > .001) out.push([coords[i][0], coords[i][1]]);
  if (kmBetween(out.at(-1), high.point) > .001) out.push(high.point); else out[out.length - 1] = high.point;
  if (!forward) out.reverse();
  if (out.length < 2) out.push([endPoint[0], endPoint[1]]);
  return out;
}
function endpointNodeSet(endpoint, specialRoute = null) {
  if (!endpoint) return [];
  if (specialRoute) {
    const node = gatewayNode(specialRoute.gateway);
    return node >= 0 ? [node] : [];
  }
  if (endpoint.kind === 'road') return [...new Set(endpoint.road?.nodeIds || endpoint.nodeIds || [])];
  return endpoint.node != null && endpoint.node >= 0 ? [endpoint.node] : [];
}

// General endpoint composer used by road/place routing and live GPS rerouting.
// Endpoint shape: {kind:'town'|'road'|'gps', label, index?, node?, point?, road?}.
// A named road contributes all of its connected graph endpoints; the router chooses
// the best pair in one graph search instead of selecting an arbitrary address point.
function composeEndpoints(originEp, destEp) {
  routeSegments = []; routeEdgeIds = []; routeEdgeTraversals = [];
  if (!originEp || !destEp) throw new Error('route endpoint unavailable');
  const oa = originEp.kind === 'town' && originEp.index >= 0 ? special[names[originEp.index]] : null;
  const da = destEp.kind === 'town' && destEp.index >= 0 ? special[names[destEp.index]] : null;
  const sourceNodes = endpointNodeSet(originEp, oa), targetNodes = endpointNodeSet(destEp, da);
  if (!sourceNodes.length || !targetNodes.length) throw new Error('route endpoint unavailable');

  let selected = routeBetweenNodeSets(sourceNodes, targetNodes, { allowFerry: !!(oa || da) });
  if (!selected && !(oa || da)) selected = routeBetweenNodeSets(sourceNodes, targetNodes, { allowFerry: true });
  if (!selected) throw new Error('network components do not connect');
  const startNode = selected.startNode, endNode = selected.endNode;
  originEp.node = startNode; originEp.point = originEp.kind === 'gps' ? originEp.point : DATA.nodes[startNode];
  destEp.node = endNode; destEp.point = DATA.nodes[endNode];

  if (oa) addVirtual(remotePoint(names[originEp.index]), DATA.nodes[startNode], oa.label, 'ferry', { schematic: true });
  else if (originEp.kind === 'gps' && originEp.point && kmBetween(originEp.point, DATA.nodes[startNode]) > .025)
    addVirtual(originEp.point, DATA.nodes[startNode], 'Position to road', 'access', { schematic: false });

  if (selected.edges.length) addRoad(selected.edges, startNode);
  else {
    const point = DATA.nodes[startNode];
    routeSegments.push({ type: 'road', coords: [[point[0], point[1]], [point[0], point[1]]], label: 'Roads meet here', schematic: false, edgeCount: 0 });
  }

  if (da) addVirtual(DATA.nodes[endNode], remotePoint(names[destEp.index]), da.label, 'ferry', { schematic: true });
  return {
    usedFerry: routeSegments.some(segment => segment.type === 'ferry'),
    roadEndpointOptimized: originEp.kind === 'road' || destEp.kind === 'road',
    originNode: startNode,
    destinationNode: endNode,
    estimatedMinutes: selected.estimatedMinutes,
  };
}
window.composeEndpoints = composeEndpoints;
function destinationRouteNode() {
  if (currentDestRoad?.node != null) return currentDestRoad.node;
  if (currentDestination?.node != null) return currentDestination.node;
  if (currentDestIndex >= 0 && !special[names[currentDestIndex]]) return routingAnchor(currentDestIndex);
  return -1;
}
function destinationRoutePoint() {
  if (currentDestRoad?.point) return currentDestRoad.point;
  if (currentDestination?.point) return currentDestination.point;
  if (currentDestIndex >= 0) return pointForCommunity(names[currentDestIndex], currentDestIndex);
  return null;
}
function graphKmToDestination(startNode, destName, b, allowFerry) {
  const sb = special[destName], endNode = sb ? gatewayNode(sb.gateway) : routingAnchor(b), es = dijkstra(startNode, endNode, { allowFerry });
  if (es == null) return null; let k = edgeKm(es); if (sb) k += kmBetween(DATA.nodes[endNode], remotePoint(destName)); return k;
}

function flattenSegments() {
  const out = [], kinds = [];
  for (const s of routeSegments) {
    let c = s.coords.map(p => [p[0], p[1]]), type = s.type === 'access' ? 'road' : (s.type || 'road');
    if (out.length && c.length) {
      const last = out.at(-1); if (kmBetween(last, c[0]) <= .025) c = c.slice(1);
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
  routePolylineKm = total; if (typeof rebuildRouteLabels === 'function') rebuildRouteLabels(); if (typeof rebuildManeuvers === 'function') rebuildManeuvers();
}
function pointAt(f) {
  if (!routeCoords.length) return null; if (routeCoords.length === 1) return routeCoords[0];
  const target = routePolylineKm * Math.max(0, Math.min(1, f)); let i = 1;
  while (i < routeCum.length && routeCum[i] < target) i++; if (i >= routeCum.length) return routeCoords.at(-1);
  const a = routeCoords[i - 1], b = routeCoords[i], den = Math.max(routeCum[i] - routeCum[i - 1], 1e-9), t = (target - routeCum[i - 1]) / den;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
function snapRange(lon, lat, startKm = 0, endKm = Infinity, headingDeg = null) {
  if (routeCoords.length < 2) return null; let bestScore = Infinity, bestDistance2 = Infinity, along = 0, bestPoint = null, bestSegment = -1, bestBearing = null, bestHeadingDifference = null;
  for (let i = 1; i < routeCoords.length; i++) {
    if (routeCum[i] < startKm || routeCum[i - 1] > endKm) continue;
    const a = routeCoords[i - 1], b = routeCoords[i], sl = 111.32 * Math.cos((lat + (a[1] + b[1]) / 2) * Math.PI / 360);
    const ax = a[0] * sl, ay = a[1] * 111.32, bx = b[0] * sl, by = b[1] * 111.32, px = lon * sl, py = lat * 111.32;
    const vx = bx - ax, vy = by - ay, len = vx * vx + vy * vy; let t = len ? ((px - ax) * vx + (py - ay) * vy) / len : 0; t = Math.max(0, Math.min(1, t));
    const qx = ax + t * vx, qy = ay + t * vy, d = (px - qx) ** 2 + (py - qy) ** 2, segmentBearing = typeof bearingDegrees === 'function' ? bearingDegrees(a, b) : null;
    const headingDifference = headingDeg != null && segmentBearing != null ? Math.abs(angleDifference(segmentBearing, headingDeg)) : null;
    const headingPenaltyKm = headingDifference == null ? 0 : Math.min(.16, headingDifference / 180 * .16), score = d + headingPenaltyKm * headingPenaltyKm;
    if (score < bestScore) {
      bestScore = score; bestDistance2 = d; along = routeCum[i - 1] + (routeCum[i] - routeCum[i - 1]) * t;
      bestPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; bestSegment = i - 1; bestBearing = segmentBearing; bestHeadingDifference = headingDifference;
    }
  }
  return isFinite(bestDistance2) ? { fraction: Math.max(0, Math.min(1, along / Math.max(routePolylineKm, .0001))), distanceKm: Math.sqrt(bestDistance2), alongKm: along, point: bestPoint, segmentIndex: bestSegment, routeBearing: bestBearing, headingDifference: bestHeadingDifference } : null;
}
function snapGlobal(lon, lat, headingDeg = null) { return snapRange(lon, lat, 0, Infinity, headingDeg); }
function snapGpsFix(lon, lat, now, headingDeg = null) {
  // Only the first fix is allowed to search the whole route. Once progress has been
  // established we match inside a physically plausible window around that progress.
  // This prevents a nearby loop/crossing later in the trip from stealing the GPS fix.
  if (!lastGpsAppliedAt || routePolylineKm < 8) return snapGlobal(lon, lat, headingDeg);
  const dt = Math.max(1, (now - lastGpsAppliedAt) / 1000), backKm = 3.0;
  const possibleForward = Math.min(120, Math.max(6, dt / 3600 * 170 + 6));
  const at = progress * routePolylineKm;
  return snapRange(lon, lat, Math.max(0, at - backKm), Math.min(routePolylineKm, at + possibleForward), headingDeg);
}

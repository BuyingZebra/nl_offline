function addRoad(es, reverse = false) {
  if (es == null) throw new Error('network components do not connect');
  const seq = reverse ? es.slice().reverse() : es.slice(); let cur = null;
  for (const ei of seq) {
    routeEdgeIds.push(ei);
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
function gatewayNode(name) { const i = nameIndex.get(name.toLowerCase()); return i == null ? -1 : routingAnchor(i); }
function remotePoint(name) { const s = special[name]; return s ? [s.lon, s.lat] : null; }
function pointForCommunity(name, index) { return remotePoint(name) || (DATA.anchors[index] >= 0 ? DATA.nodes[DATA.anchors[index]] : null); }

function composePath(originName, destName, a, b, allowFerry) {
  routeSegments = []; routeEdgeIds = [];
  const sa = special[originName], sb = special[destName], aa = routingAnchor(a), bb = routingAnchor(b);
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
  routeSegments = []; routeEdgeIds = []; const sb = special[destName], endNode = sb ? gatewayNode(sb.gateway) : routingAnchor(b);
  if (endNode < 0) throw new Error('destination anchor unavailable');
  if (originPoint && kmBetween(originPoint, DATA.nodes[startNode]) > .03) addVirtual(originPoint, DATA.nodes[startNode], 'GPS to road', 'virtual');
  const road = dijkstra(startNode, endNode, { allowFerry }); if (road && road.length) addRoad(road);
  if (sb) addVirtual(DATA.nodes[endNode], remotePoint(destName), sb.label, 'ferry');
}

function composeNodeToNode(startNode, endNode, startPoint = null, endPoint = null, startLabel = 'Position to road', endLabel = 'Road to destination', allowFerry = false) {
  routeSegments = []; routeEdgeIds = [];
  if (startNode == null || endNode == null || startNode < 0 || endNode < 0) throw new Error('route endpoint unavailable');
  if (startPoint && kmBetween(startPoint, DATA.nodes[startNode]) > .025) addVirtual(startPoint, DATA.nodes[startNode], startLabel, 'virtual');
  const road = dijkstra(startNode, endNode, { allowFerry });
  if (road == null) throw new Error('network components do not connect');
  if (road.length) addRoad(road);
  if (endPoint && kmBetween(DATA.nodes[endNode], endPoint) > .025) addVirtual(DATA.nodes[endNode], endPoint, endLabel, 'virtual');
}

// General endpoint composer used by v0.15 civic-address routing and live rerouting.
// Endpoint shape: {kind:'town'|'address'|'gps', label, index?, node?, point?, address?}.
// Regular road trips first refuse ferry edges; if the road graph is disconnected we
// retry with the same guarded ferry model used by town-to-town routing.
function composeEndpoints(originEp, destEp) {
  routeSegments = []; routeEdgeIds = [];
  if (!originEp || !destEp) throw new Error('route endpoint unavailable');
  const oa = originEp.kind === 'town' && originEp.index >= 0 ? special[names[originEp.index]] : null;
  const da = destEp.kind === 'town' && destEp.index >= 0 ? special[names[destEp.index]] : null;
  let startNode = oa ? gatewayNode(oa.gateway) : originEp.node;
  let endNode = da ? gatewayNode(da.gateway) : destEp.node;
  if (startNode == null || endNode == null || startNode < 0 || endNode < 0) throw new Error('route endpoint unavailable');

  if (oa) addVirtual(remotePoint(names[originEp.index]), DATA.nodes[startNode], oa.label, 'ferry');
  else if (originEp.point && kmBetween(originEp.point, DATA.nodes[startNode]) > .025)
    addVirtual(originEp.point, DATA.nodes[startNode], originEp.kind === 'address' ? 'Address to road' : 'Position to road', 'virtual');

  let road = dijkstra(startNode, endNode, { allowFerry: !!(oa || da) });
  if (road == null && !(oa || da)) road = dijkstra(startNode, endNode, { allowFerry: true });
  if (road == null) throw new Error('network components do not connect');
  if (road.length) addRoad(road);

  if (da) addVirtual(DATA.nodes[endNode], remotePoint(names[destEp.index]), da.label, 'ferry');
  else if (destEp.kind === 'address' && destEp.point && kmBetween(DATA.nodes[endNode], destEp.point) > .025)
    addVirtual(DATA.nodes[endNode], destEp.point, 'Road to address', 'virtual');
  return { usedFerry: routeSegments.some(s => s.type === 'ferry') };
}
window.composeEndpoints = composeEndpoints;
function destinationRouteNode() {
  if (currentDestAddress?.node != null) return currentDestAddress.node;
  if (currentDestIndex >= 0 && !special[names[currentDestIndex]]) return routingAnchor(currentDestIndex);
  return -1;
}
function destinationRoutePoint() {
  if (currentDestAddress?.point) return currentDestAddress.point;
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


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

function traceVectorRings(ctx, features, minImportance = 0) {
  let traced = 0;
  for (const feature of features || []) {
    const bb = feature[0], rings = feature[1], importance = feature[2] || 0;
    if (!visible(bb) || importance < minImportance) continue;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const q = project(ring[i][0], ring[i][1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
      }
      ctx.closePath(); traced++;
    }
  }
  return traced;
}
function renderVectorBasemap() {
  const map = window.NL_BASEMAP; if (!map) return;
  const span = view.maxx - view.minx;
  bctx.beginPath();
  if (traceVectorRings(bctx, map.land)) {
    bctx.fillStyle = '#183a3d'; bctx.globalAlpha = 1; bctx.fill('evenodd');
  }
  const waterFloor = span > 6 ? .012 : span > 2.5 ? .0012 : span > .8 ? .00012 : 0;
  bctx.beginPath();
  if (traceVectorRings(bctx, map.water, waterFloor)) {
    bctx.fillStyle = '#061b2a'; bctx.globalAlpha = 1; bctx.fill('evenodd');
  }
  bctx.globalAlpha = 1;
}

function minimumVisibleRoadTier(span) {
  if (span > 7) return 5;
  if (span > 3.4) return 4;
  if (span > 1.5) return 3;
  if (span > .72) return 2;
  return 0;
}
function roadPaint(pass, span) {
  const close = span < .18, local = pass.max <= 1, major = pass.min >= 4;
  const width = major ? (close ? 5.2 : span < .8 ? 3.5 : 2.15)
    : local ? (close ? 2.15 : span < .48 ? 1.35 : .72)
      : (close ? 3.25 : span < .8 ? 2.2 : 1.2);
  return {
    width,
    color: major ? '#a9bbbe' : local ? '#47646b' : '#6f8c93',
    alpha: major ? 1 : local ? .82 : .96,
  };
}
function traceRoadPass(ids, pass, minimumTier) {
  bctx.beginPath(); let traced = 0;
  for (const ei of ids) {
    const e = DATA.edges[ei], raw = e[4] || 'road'; if (raw !== 'road' || !visible(edgeBounds[ei])) continue;
    const tier = typeof roadTier === 'function' ? roadTier(ei) : 1;
    if (tier < minimumTier || tier < pass.min || tier > pass.max) continue;
    for (let i = 0; i < e[3].length; i++) { const q = project(e[3][i][0], e[3][i][1]); i ? bctx.lineTo(q[0], q[1]) : bctx.moveTo(q[0], q[1]); }
    traced++;
  }
  return traced;
}

function renderBase() {
  bctx.clearRect(0, 0, base.clientWidth, base.clientHeight); bctx.lineJoin = 'round'; bctx.lineCap = 'round';
  renderVectorBasemap();
  const ids = visibleEdgeIds();
  const roadPasses = [
    { min: 0, max: 1 },
    { min: 2, max: 3 },
    { min: 4, max: 5 },
  ];
  const span = view.maxx - view.minx, minimumTier = minimumVisibleRoadTier(span);
  for (const pass of roadPasses) {
    const paint = roadPaint(pass, span); if (!traceRoadPass(ids, pass, minimumTier)) continue;
    bctx.strokeStyle = '#07151c'; bctx.globalAlpha = .94; bctx.lineWidth = paint.width + 1.65; bctx.stroke();
    traceRoadPass(ids, pass, minimumTier); bctx.strokeStyle = paint.color; bctx.globalAlpha = paint.alpha; bctx.lineWidth = paint.width; bctx.stroke();
  }
  for (const type of ['virtual', 'ferry']) {
    bctx.beginPath();
    for (const ei of ids) {
      const e = DATA.edges[ei], raw = e[4] || 'road'; if (raw !== type || !visible(edgeBounds[ei])) continue;
      for (let i = 0; i < e[3].length; i++) { const q = project(e[3][i][0], e[3][i][1]); i ? bctx.lineTo(q[0], q[1]) : bctx.moveTo(q[0], q[1]); }
    }
    bctx.strokeStyle = type === 'ferry' ? '#496b7d' : '#355566'; bctx.globalAlpha = type === 'ferry' ? .82 : .55; bctx.lineWidth = type === 'ferry' ? 1.25 : .9;
    bctx.setLineDash(type === 'ferry' ? [4, 4] : [2, 4]); bctx.stroke(); bctx.setLineDash([]);
  }
  bctx.globalAlpha = 1; renderRoadRouteLabels(ids); renderStreetLabels(ids); renderCommunityLabels();
}
function boxesOverlap(a, b, pad = 4) { return !(a.r + pad < b.l || a.l - pad > b.r || a.b + pad < b.t || a.t - pad > b.b); }
function mapUiObstacles() {
  const wrap = $('mapwrap'), wr = wrap.getBoundingClientRect(), boxes = [];
  for (const el of wrap.querySelectorAll('.drivecard,.maptools,.maplegend')) {
    const style = getComputedStyle(el); if (style.display === 'none' || style.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    boxes.push({ l: r.left - wr.left, t: r.top - wr.top, r: r.right - wr.left, b: r.bottom - wr.top });
  }
  return boxes;
}
function renderRoadRouteLabels(ids) {
  if (typeof routeNumber !== 'function' || typeof roadTier !== 'function') return;
  const span = view.maxx - view.minx; if (span > 4.5) return;
  const placed = [], uiBoxes = mapUiObstacles(), seenRoutes = new Map(); let shown = 0;
  for (const ei of ids) {
    if (shown >= (followGPS ? 7 : 10)) break;
    const r = routeNumber(ei); if (!r) continue;
    const tier = roadTier(ei); if (tier < 4 && !(r === '1' || r === '2' || r === '75')) continue;
    const e = DATA.edges[ei], c = e?.[3]; if (!c?.length) continue;
    const p = c[Math.floor(c.length / 2)], q = project(p[0], p[1]);
    if (q[0] < 18 || q[0] > base.clientWidth - 18 || q[1] < 18 || q[1] > base.clientHeight - 18) continue;
    const last = seenRoutes.get(r); if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 135) continue;
    const text = r === '1' ? '1' : r; bctx.font = '700 9.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    const tw = bctx.measureText(text).width, w = Math.max(20, tw + 10), h = 17, box = { l: q[0] - w / 2, t: q[1] - h / 2, r: q[0] + w / 2, b: q[1] + h / 2 };
    if (placed.some(b => boxesOverlap(box, b, 7)) || uiBoxes.some(b => boxesOverlap(box, b, 7))) continue; placed.push(box); seenRoutes.set(r, q);
    bctx.fillStyle = 'rgba(8,25,35,.92)'; bctx.strokeStyle = '#7897a7'; bctx.lineWidth = 1;
    bctx.beginPath(); if (bctx.roundRect) bctx.roundRect(box.l, box.t, w, h, 5); else bctx.rect(box.l, box.t, w, h); bctx.fill(); bctx.stroke();
    bctx.fillStyle = '#e5edf0'; bctx.textAlign = 'center'; bctx.textBaseline = 'middle'; bctx.fillText(text, q[0], q[1] + .5); bctx.textAlign = 'start'; bctx.textBaseline = 'alphabetic'; shown++;
  }
}
function renderStreetLabels(ids) {
  if (typeof streetNameForEdge !== 'function') return;
  const span = view.maxx - view.minx; if (span > .42) return;
  const placed = [], uiBoxes = mapUiObstacles(), seen = new Map(), maxLabels = followGPS ? 8 : 13; let shown = 0;
  bctx.font = '600 9.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  for (const ei of ids) {
    if (shown >= maxLabels) break;
    const label = streetNameForEdge(ei); if (!label || label === 'None') continue;
    const e = DATA.edges[ei], coords = e?.[3]; if (!coords?.length || !visible(edgeBounds[ei])) continue;
    const p = coords[Math.floor(coords.length / 2)], q = project(p[0], p[1]);
    if (q[0] < 25 || q[0] > base.clientWidth - 25 || q[1] < 22 || q[1] > base.clientHeight - 22) continue;
    const prior = seen.get(label); if (prior && Math.hypot(q[0] - prior[0], q[1] - prior[1]) < 150) continue;
    const text = label.length > 26 ? `${label.slice(0, 24)}…` : label, tw = bctx.measureText(text).width;
    const box = { l: q[0] - tw / 2 - 4, t: q[1] - 9, r: q[0] + tw / 2 + 4, b: q[1] + 5 };
    if (placed.some(b => boxesOverlap(box, b, 6)) || uiBoxes.some(b => boxesOverlap(box, b, 6))) continue;
    placed.push(box); seen.set(label, q); bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
    bctx.lineWidth = 3; bctx.strokeStyle = 'rgba(5,15,23,.94)'; bctx.fillStyle = '#c9d7dc'; bctx.strokeText(text, q[0], q[1]); bctx.fillText(text, q[0], q[1]); shown++;
  }
  bctx.textAlign = 'start'; bctx.textBaseline = 'alphabetic';
}
function rebuildRouteLabels() {
  routeLabelCandidates = []; if (routeCoords.length < 2 || routePolylineKm <= 0) return;
  const start = (loadedOriginLabel || (currentOriginIndex >= 0 ? names[currentOriginIndex] : $('from').value.trim())).toLowerCase(), dest = (loadedDestLabel || (currentDestIndex >= 0 ? names[currentDestIndex] : $('to').value.trim())).toLowerCase(), all = [];
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
  const boxes = [], uiBoxes = mapUiObstacles(), maxLabels = followGPS ? 5 : span < .55 ? 10 : span < 1.35 ? 8 : 6;
  let shown = 0; bctx.font = '600 10.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  for (const c of candidates) {
    if (shown >= maxLabels) break; const i = c.index ?? c;
    const a = DATA.anchors[i]; if (a == null || a < 0) continue; const p = DATA.nodes[a];
    if (!p || p[0] < view.minx || p[0] > view.maxx || p[1] < view.miny || p[1] > view.maxy) continue;
    const q = project(p[0], p[1]);
    if (q[0] < 8 || q[0] > base.clientWidth - 8 || q[1] < 16 || q[1] > base.clientHeight - 16) continue;
    const text = names[i], tw = bctx.measureText(text).width, box = { l: q[0] + 5, t: q[1] - 16, r: q[0] + 9 + tw, b: q[1] + 3 };
    if (boxes.some(b => boxesOverlap(box, b)) || uiBoxes.some(b => boxesOverlap(box, b, 5))) continue; boxes.push(box);
    bctx.beginPath(); bctx.arc(q[0], q[1], 2.15, 0, Math.PI * 2); bctx.fillStyle = '#7897a7'; bctx.fill();
    bctx.lineWidth = 3.2; bctx.strokeStyle = 'rgba(5,15,23,.94)'; bctx.fillStyle = '#d1dde1';
    bctx.strokeText(text, q[0] + 6, q[1] - 5); bctx.fillText(text, q[0] + 6, q[1] - 5); shown++;
  }
}
function drawSegment(ctx, s) {
  const c = s.coords; if (!c || c.length < 2) return;
  const trace = () => { ctx.beginPath(); for (let i = 0; i < c.length; i++) { const q = project(c[i][0], c[i][1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } };
  const verifiedRoad = s.type === 'road' || s.type === 'access';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; if (!verifiedRoad) ctx.setLineDash([10, 7]);
  trace(); ctx.strokeStyle = 'rgba(5,14,20,.9)'; ctx.lineWidth = verifiedRoad ? 7.4 : 6; ctx.stroke();
  trace(); ctx.strokeStyle = verifiedRoad ? '#61df97' : '#a4dfbd'; ctx.lineWidth = verifiedRoad ? 4.8 : 3.4; ctx.stroke(); ctx.setLineDash([]);
}
function marker(p, label, kind) {
  if (!p) return; const q = project(p[0], p[1]);
  if (kind === 'gps' && gpsPosition && gpsPosition.accuracy) {
    const q2 = project(p[0] + .01, p[1]), pxPerKm = Math.abs(q2[0] - q[0]) / (.01 * 111.32 * Math.cos(p[1] * Math.PI / 180) || 1);
    const r = Math.min(38, Math.max(8, (gpsPosition.accuracy / 1000) * pxPerKm));
    octx.beginPath(); octx.arc(q[0], q[1], r, 0, Math.PI * 2); octx.fillStyle = 'rgba(116,188,255,.13)'; octx.fill();
    octx.strokeStyle = 'rgba(116,188,255,.25)'; octx.lineWidth = 1; octx.stroke();
  }
  const heading = kind === 'gps' && typeof currentDisplayHeading === 'function' ? currentDisplayHeading() : null;
  if (kind === 'gps' && heading != null) {
    octx.save(); octx.translate(q[0], q[1]); octx.rotate(heading * Math.PI / 180);
    octx.beginPath(); octx.moveTo(0, -12); octx.lineTo(7.5, 8); octx.lineTo(0, 5); octx.lineTo(-7.5, 8); octx.closePath();
    octx.fillStyle = '#74bcff'; octx.fill(); octx.lineWidth = 2.5; octx.strokeStyle = '#061019'; octx.stroke(); octx.restore();
  } else {
    octx.beginPath(); octx.arc(q[0], q[1], kind === 'gps' ? 7 : 6, 0, Math.PI * 2);
    octx.fillStyle = kind === 'gps' ? '#74bcff' : kind === 'dest' ? '#61df97' : '#f6f8fa'; octx.fill();
    octx.lineWidth = kind === 'gps' ? 3 : 2; octx.strokeStyle = '#061019'; octx.stroke();
  }
  if (label) {
    octx.font = '650 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    let text = label; while (text.length > 12 && octx.measureText(text).width > Math.min(180, overlay.clientWidth * .46)) text = `${text.slice(0, -2)}…`;
    const tw = octx.measureText(text).width, uiBoxes = mapUiObstacles();
    const right = { x: q[0] + 9, y: q[1] - 9, align: 'left', box: { l: q[0] + 6, t: q[1] - 24, r: q[0] + 13 + tw, b: q[1] - 4 } };
    const left = { x: q[0] - 9, y: q[1] - 9, align: 'right', box: { l: q[0] - 13 - tw, t: q[1] - 24, r: q[0] - 6, b: q[1] - 4 } };
    const placement = [right, left].find(a => a.box.l >= 4 && a.box.r <= overlay.clientWidth - 4 && a.box.t >= 4 && !uiBoxes.some(b => boxesOverlap(a.box, b, 4)));
    if (placement) {
      octx.textAlign = placement.align; octx.fillStyle = '#f6f8fa'; octx.strokeStyle = 'rgba(6,16,25,.95)'; octx.lineWidth = 4;
      octx.strokeText(text, placement.x, placement.y); octx.fillText(text, placement.x, placement.y); octx.textAlign = 'start';
    }
  }
}
function renderOverlay() {
  octx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight); for (const s of routeSegments) drawSegment(octx, s);
  if (routeCoords.length) {
    const startLabel = loadedOriginLabel || (originMode === 'gps' ? 'Current location' : (currentOriginIndex >= 0 ? names[currentOriginIndex] : $('from').value.trim()));
    const destLabel = loadedDestLabel || (currentDestIndex >= 0 ? names[currentDestIndex] : $('destination').textContent);
    marker(routeCoords[0], mapImmersive ? '' : startLabel, 'start'); marker(routeCoords.at(-1), mapImmersive ? '' : destLabel, 'dest');
    const p = gpsPosition ? [gpsPosition.lon, gpsPosition.lat] : pointAt(progress); marker(p, '', 'gps');
  }
}
function setOverviewMapHeight(coords) {
  if (!coords?.length || mapImmersive) return;
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
function updateMapModeUI() {
  const follow = $('follow');
  follow.textContent = followGPS ? 'Following' : mapImmersive ? 'Recenter' : 'Follow';
  follow.classList.toggle('active', followGPS);
  follow.setAttribute('aria-pressed', followGPS ? 'true' : 'false');
  $('mapwrap').classList.toggle('following', mapImmersive);
  document.body.classList.toggle('map-following', mapImmersive);
}
function clampViewToNL(v) {
  const marginX = 1.2, marginY = .8, minX = DATA.bounds[0] - marginX, maxX = DATA.bounds[2] + marginX, minY = DATA.bounds[1] - marginY, maxY = DATA.bounds[3] + marginY;
  let width = v.maxx - v.minx, height = v.maxy - v.miny;
  if (width > maxX - minX) { v.minx = minX; v.maxx = maxX; width = v.maxx - v.minx; }
  if (height > maxY - minY) { v.miny = minY; v.maxy = maxY; height = v.maxy - v.miny; }
  if (v.minx < minX) { v.maxx += minX - v.minx; v.minx = minX; }
  if (v.maxx > maxX) { v.minx -= v.maxx - maxX; v.maxx = maxX; }
  if (v.miny < minY) { v.maxy += minY - v.miny; v.miny = minY; }
  if (v.maxy > maxY) { v.miny -= v.maxy - maxY; v.maxy = maxY; }
  return v;
}
function setFollow(on, localZoom = false, options = {}) {
  const preserveView = !!options.preserveView, keepImmersive = !!options.keepImmersive;
  followGPS = !!on;
  if (followGPS) mapImmersive = true; else if (!keepImmersive) mapImmersive = false;
  if (followGPS && localZoom) followRadiusKm = Math.max(5, Math.min(22, routeDist * .14 || 18));
  updateMapModeUI(); size();
  if (followGPS) followViewAt(currentFollowPoint()); else if (!preserveView && routeCoords.length) fit(routeCoords);
}
function pauseMapFollowForGesture() {
  if (!followGPS) return;
  setFollow(false, false, { preserveView: true, keepImmersive: true });
  $('gpsDetail').textContent = gpsRunning ? 'Map moved · live GPS continues · tap Recenter to follow again.' : 'Free map view · tap Recenter to follow the simulated trip.';
}
function projectionMetrics(v = view) {
  const w = base.clientWidth, h = base.clientHeight, p = 12, cy = (v.miny + v.maxy) / 2, c = Math.max(.2, Math.cos(cy * Math.PI / 180));
  const xspan = (v.maxx - v.minx) * c, yspan = v.maxy - v.miny;
  const sx = (w - 2 * p) / Math.max(xspan, 1e-9), sy = (h - 2 * p) / Math.max(yspan, 1e-9), s = Math.min(sx, sy);
  return { w, h, c, s, ox: (w - xspan * s) / 2, oy: (h - yspan * s) / 2 };
}
function unproject(x, y, v = view) {
  const m = projectionMetrics(v);
  return [v.minx + (x - m.ox) / Math.max(m.c * m.s, 1e-9), v.miny + (m.h - y - m.oy) / Math.max(m.s, 1e-9)];
}
function viewForGesture(baseView, startPoint, currentPoint, factor) {
  const span = Math.max(baseView.maxx - baseView.minx, .0001);
  factor = Math.max(.006 / span, Math.min(30 / span, factor));
  const cx = (baseView.minx + baseView.maxx) / 2, cy = (baseView.miny + baseView.maxy) / 2;
  const dx = (baseView.maxx - baseView.minx) * factor / 2, dy = (baseView.maxy - baseView.miny) * factor / 2;
  let next = normalizeView({ minx: cx - dx, maxx: cx + dx, miny: cy - dy, maxy: cy + dy });
  const anchor = unproject(startPoint.x, startPoint.y, baseView), current = unproject(currentPoint.x, currentPoint.y, next);
  const shiftX = anchor[0] - current[0], shiftY = anchor[1] - current[1];
  next = { minx: next.minx + shiftX, maxx: next.maxx + shiftX, miny: next.miny + shiftY, maxy: next.maxy + shiftY };
  return clampViewToNL(next);
}
function queueMapRender() {
  if (!rafPan) rafPan = requestAnimationFrame(() => { rafPan = 0; renderBase(); renderOverlay(); });
}
function zoomAt(f, x = base.clientWidth / 2, y = base.clientHeight / 2) {
  view = viewForGesture({ ...view }, { x, y }, { x, y }, f); queueMapRender();
}
function zoom(f) {
  if (followGPS) { followRadiusKm = Math.max(2.5, Math.min(160, followRadiusKm * f)); followViewAt(currentFollowPoint()); return; }
  zoomAt(f);
}

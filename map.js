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


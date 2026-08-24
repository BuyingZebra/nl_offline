function setTownLabels(info) {
  $('distanceLabel').textContent = info.hasFerry ? 'Official total distance' : 'Official distance';
  $('timeLabel').textContent = info.hasFerry ? 'Official total time' : 'Official time';
  $('distanceNote').textContent = info.hasFerry ? `Road ${info.roadDistance} + ferry ${info.ferryDistance} km` : 'NL-RDDb';
  $('timeNote').textContent = info.hasFerry ? `Road ${fmtMin(info.roadTime)} + ferry ${fmtMin(info.ferryTime)}` : 'NL-RDDb';
  $('tripModeHint').textContent = info.hasFerry ? 'Official road + ferry estimate' : 'Official town-to-town estimate';
}
function setEstimatedLabels(source = 'NRN road network') {
  $('distanceLabel').textContent = currentTripHasFerry ? 'Estimated total distance' : 'Estimated distance';
  $('timeLabel').textContent = currentTripHasFerry ? 'Estimated total time' : 'Estimated time';
  $('distanceNote').textContent = source;
  $('timeNote').textContent = currentTripHasFerry ? 'NRN road classes + ferry geometry' : 'NRN road-class model';
  $('tripModeHint').textContent = currentOriginAddress || currentDestAddress ? 'Offline civic-address estimate' : originMode === 'gps' || liveRerouteCount ? 'Current position → destination' : 'Offline road-network estimate';
}
function setRouteTotals(info) {
  routeRoadDistance = info.roadDistance; routeRoadTime = info.roadTime; routeFerryDistance = info.ferryDistance; routeFerryTime = info.ferryTime;
  routeDist = info.totalDistance; routeTime = info.totalTime; currentTripHasFerry = info.hasFerry;
}
function segmentLengthKm(coords) { let k = 0; for (let i = 1; i < (coords || []).length; i++) k += kmBetween(coords[i - 1], coords[i]); return k; }
function setEstimatedRouteTotalsFromPath() {
  let roadKm = 0, ferryKm = 0, accessMin = 0;
  for (const s of routeSegments) {
    const k = segmentLengthKm(s.coords);
    if (s.type === 'ferry') ferryKm += k;
    else roadKm += k;
    if (s.type === 'virtual') accessMin += k / 25 * 60;
    if (s.type === 'ferry' && !s.edgeCount) accessMin += k / 25 * 60;
  }
  const roadEdgeIds = routeEdgeIds.filter(ei => (DATA.edges[ei]?.[4] || 'road') !== 'ferry');
  const ferryEdgeIds = routeEdgeIds.filter(ei => (DATA.edges[ei]?.[4] || 'road') === 'ferry');
  const roadMin = (typeof estimateRouteMinutes === 'function' ? estimateRouteMinutes(roadEdgeIds) : Math.max(1, roadKm / 60 * 60)) + accessMin;
  const ferryMin = ferryEdgeIds.reduce((m, ei) => m + (DATA.edges[ei]?.[2] || 0) / 25 * 60, 0);
  setRouteTotals({ roadDistance: roadKm, roadTime: roadMin, ferryDistance: ferryKm, ferryTime: ferryMin, totalDistance: roadKm + ferryKm, totalTime: roadMin + ferryMin, hasFerry: ferryKm > .02 || ferryEdgeIds.length > 0 });
}
function busy(on) { $('go').disabled = on; $('go').textContent = on ? 'Calculating…' : 'Show trip'; }
function updateRouteQuality(virtual = false) {
  if ($('viaRoute')) $('viaRoute').textContent = (!virtual && routeEdgeIds.length && typeof describeRouteEdges === 'function') ? describeRouteEdges(routeEdgeIds) : (routeEdgeIds.length && typeof describeRouteEdges === 'function' ? describeRouteEdges(routeEdgeIds) : '');
  const estimated = !!(currentOriginAddress || currentDestAddress || originMode === 'gps' || liveRerouteCount);
  if (!routeProgressReliable) { $('routeStatus').textContent = 'Schematic'; $('routeNote').textContent = estimated ? 'NRN estimate · schematic ferry/remote leg' : 'Level 1 reliable · Level 2 ferry map approximate'; return; }
  if (estimated) {
    $('routeStatus').textContent = currentTripHasFerry ? 'Mixed' : 'On road';
    $('routeNote').textContent = `Map ${routePolylineKm.toFixed(1)} km · NRN estimated${liveRerouteCount ? ` · rerouted ${liveRerouteCount}×` : ''}`;
    return;
  }
  const errPct = routeDist > 0 ? Math.abs(routePolylineKm - routeDist) / routeDist * 100 : 0;
  if (virtual || currentTripHasFerry) $('routeStatus').textContent = 'Mixed'; else $('routeStatus').textContent = errPct <= 5 ? 'On road' : 'Map approx';
  const quality = routeDist > 0 ? `Map ${Math.round(routePolylineKm)} km · ${errPct.toFixed(1)}% vs official` : 'Co-located';
  const calibrated = usesCorrectedAnchor(currentOriginIndex) || usesCorrectedAnchor(currentDestIndex) ? ' · calibrated anchor' : '';
  $('routeNote').textContent = (virtual ? `Ferry / remote leg · ${quality}` : quality) + calibrated;
}
function setProgressReliability(ok) {
  routeProgressReliable = !!ok;
  $('gpsStart').disabled = !routeProgressReliable || !currentTripLoaded || routeCoords.length < 2;
  if (!ok) $('gpsDetail').textContent = 'This route contains a schematic ferry/remote connection, so live route progress is limited for this trip.';
}
function ferryFallback(originName, destName, a, b) {
  const p1 = pointForCommunity(originName, a), p2 = pointForCommunity(destName, b); if (!p1 || !p2) return false;
  routeEdgeIds = []; routeSegments = [{ type: 'ferry', coords: [p1, p2], label: 'Schematic ferry connection' }]; routeCoords = flattenSegments(); metrics();
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
  progress = 0; offRouteState = false; offRouteBadFixes = 0; offRouteGoodFixes = 0; offRouteSince = 0; resetEta(); currentTripLoaded = true; update(); logRoadEvent('trip_loaded', currentTripSnapshot(), true);
}
function finishEstimatedPath(statusText) {
  routeCoords = flattenSegments(); if (routeCoords.length < 2) throw new Error('empty path'); metrics(); setEstimatedRouteTotalsFromPath();
  const schematicFerry = routeSegments.some(s => s.type === 'ferry' && !s.edgeCount);
  setProgressReliability(!schematicFerry); setEstimatedLabels(currentOriginAddress || currentDestAddress ? 'NRN civic address range + road network' : 'NRN road network');
  $('distance').textContent = `${routeDist < 10 ? routeDist.toFixed(1) : Math.round(routeDist)} km`; $('time').textContent = fmtMin(routeTime);
  setFollow(false); fit(routeCoords); updateRouteQuality(routeSegments.some(s => s.type !== 'road'));
  progress = 0; offRouteState = false; offRouteBadFixes = 0; offRouteGoodFixes = 0; offRouteSince = 0; lastGpsAppliedAt = 0; resetEta(); currentTripLoaded = true; update();
  setStatus(statusText); logRoadEvent('estimated_trip_loaded', currentTripSnapshot(), true);
}
function buildAlias(av, bv, a, b, info) {
  setRouteTotals(info); setTownLabels(info); currentTripLoaded = true; routeSegments = []; routeEdgeIds = [];
  const p1 = pointForCommunity(av, a), p2 = pointForCommunity(bv, b); routeCoords = p1 && p2 ? [p1, p2] : p1 ? [p1] : [];
  routeCoordKinds = routeCoords.length > 1 ? ['road'] : []; metrics(); setFollow(false); if (routeCoords.length) fit(routeCoords);
  $('destination').textContent = bv; $('distance').textContent = '0 km'; $('time').textContent = '0 min'; $('routeStatus').textContent = 'Same place'; $('routeNote').textContent = 'Official aliases / co-located communities';
  progress = 1; resetEta(); setProgressReliability(false); update(); logRoadEvent('alias_trip', currentTripSnapshot(), true); setStatus('These two official community entries are co-located in NL-RDDb.');
}
function endpointFromText(text) {
  const raw = String(text || '').trim(); if (!raw) return null;
  const i = nameIndex.get(raw.toLowerCase());
  if (i != null) return { kind: 'town', label: names[i], index: i, node: special[names[i]] ? -1 : routingAnchor(i), point: pointForCommunity(names[i], i) };
  if (typeof resolveAddress === 'function') {
    const a = resolveAddress(raw); if (a) return { kind: 'address', label: a.label, index: -1, node: a.node, point: a.point, address: a };
  }
  return null;
}
function setEndpointState(originEp, destEp) {
  routeDataSource = (originEp?.kind === 'address' || destEp?.kind === 'address') ? 'nrn-address' : originEp?.kind === 'gps' ? 'gps-nrn' : 'official';
  currentOriginIndex = originEp?.kind === 'town' ? originEp.index : -1;
  currentDestIndex = destEp?.kind === 'town' ? destEp.index : -1;
  currentOriginAddress = originEp?.kind === 'address' ? originEp.address : null;
  currentDestAddress = destEp?.kind === 'address' ? destEp.address : null;
  currentDestination = destEp || null;
  loadedOriginLabel = originEp?.label || '';
  loadedDestLabel = destEp?.label || '';
  if (destEp) $('destination').textContent = destEp.label;
}
function buildEstimatedEndpoints(originEp, destEp, statusPrefix = 'Offline route') {
  return new Promise(resolve => {
    setEndpointState(originEp, destEp); routeSegments = []; routeEdgeIds = []; routeCoords = []; currentTripLoaded = true; progress = 0; resetEta(); update(); busy(true); setStatus('Calculating fastest reasonable path locally…');
    setTimeout(() => {
      let ok = false;
      try {
        composeEndpoints(originEp, destEp); finishEstimatedPath(`${statusPrefix} ready · ${routeEdgeIds.length || 'special'} network segments.`); ok = true;
      } catch (e) { setProgressReliability(false); setStatus('Could not connect those endpoints through the offline road network.', true); logRoadEvent('route_failed', { origin: originEp?.label, destination: destEp?.label, message: e?.message || 'route failed' }, true); }
      finally { busy(false); resolve(ok); }
    }, 10);
  });
}
function makeTrip() {
  stopGPS(false); saveTripPrefs(); liveRerouteCount = 0; journeyCompletedKm = 0; journeyLastGpsPoint = null; journeyLastGpsAt = 0;
  const destEp = endpointFromText($('to').value);
  if (!destEp) { setStatus('Choose a Newfoundland & Labrador town, or enter an address like “123 Water Street, Carbonear”.', true); return; }
  if (originMode === 'gps') {
    if (!originGPS) { setStatus('Current location has not been captured yet.', true); return; }
    const nn = nearestNode(originGPS.lon, originGPS.lat); if (nn.node < 0) { setStatus('Could not connect current location to the offline road network.', true); return; }
    const originEp = { kind: 'gps', label: 'Current location', index: -1, node: nn.node, point: [originGPS.lon, originGPS.lat] };
    buildEstimatedEndpoints(originEp, destEp, 'Current-location route'); return;
  }
  const originEp = endpointFromText($('from').value);
  if (!originEp) { setStatus('Choose an origin town, enter a civic address, or use current location.', true); return; }
  if (originEp.kind === 'town' && destEp.kind === 'town') {
    const a = originEp.index, b = destEp.index, av = originEp.label, bv = destEp.label;
    setEndpointState(originEp, destEp);
    if (a === b) { setStatus('Origin and destination must be different.', true); return; }
    const info = tripInfo(a, b); if (info.totalDistance === 0 && info.totalTime === 0) return buildAlias(av, bv, a, b, info);
    setRouteTotals(info); setTownLabels(info); buildTown(av, bv, a, b, info); return;
  }
  buildEstimatedEndpoints(originEp, destEp, 'Address route');
}
function buildTown(av, bv, a, b, info) {
  $('destination').textContent = bv; $('distance').textContent = `${routeDist} km`; $('time').textContent = fmtMin(routeTime);
  routeSegments = []; routeEdgeIds = []; routeCoords = []; currentTripLoaded = true; progress = 0; resetEta(); update(); busy(true); setStatus('Calculating path locally…');
  setTimeout(() => {
    try {
      composePath(av, bv, a, b, info.hasFerry);
      const virtual = routeSegments.some(s => s.type !== 'road'), count = routeSegments.reduce((n, s) => n + (s.edgeCount || 0), 0);
      finishPath(virtual, `Offline path ready · ${count || 'special'} network segments.`, av, bv, a, b);
    } catch (_) { setProgressReliability(false); setStatus('Official trip data is available, but the Level 2 map path could not be connected.', true); }
    finally { busy(false); }
  }, 10);
}
function buildGpsEndpoint(destEp = currentDestination) {
  if (!originGPS || !destEp) return Promise.resolve(false);
  const nn = nearestNode(originGPS.lon, originGPS.lat); if (nn.node < 0) return Promise.resolve(false);
  const originEp = { kind: 'gps', label: 'Current location', index: -1, node: nn.node, point: [originGPS.lon, originGPS.lat] };
  return buildEstimatedEndpoints(originEp, destEp, 'Current-location route');
}
// Compatibility wrapper for older callers.
function buildGps(bv, b) {
  const destEp = currentDestination || (b >= 0 ? endpointFromText(names[b]) : endpointFromText(bv));
  return buildGpsEndpoint(destEp);
}

function rerouteFromGpsPosition(lon, lat, reason = 'off-route') {
  return new Promise(resolve => {
    if (!currentDestination || rerouteInFlight) { resolve(false); return; }
    const nn = nearestNode(lon, lat); if (nn.node < 0 || nn.distanceKm > 8) { resolve(false); return; }
    rerouteInFlight = true; setStatus('Recalculating route from your current position…');
    setTimeout(() => {
      let ok = false;
      try {
        const originEp = { kind: 'gps', label: 'Recalculated position', index: -1, node: nn.node, point: [lon, lat] };
        composeEndpoints(originEp, currentDestination); routeCoords = flattenSegments(); if (routeCoords.length < 2) throw new Error('empty reroute'); metrics(); setEstimatedRouteTotalsFromPath();
        liveRerouteCount += 1; routeDataSource = 'nrn-reroute'; currentOriginIndex = -1; currentOriginAddress = null; originMode = 'gps'; originGPS = { lon, lat, accuracy: gpsPosition?.accuracy || 0, capturedAt: Date.now() }; loadedOriginLabel = 'Current location'; currentTripLoaded = true; progress = 0; lastGpsAppliedAt = 0;
        offRouteState = false; offRouteBadFixes = 0; offRouteGoodFixes = 0; offRouteSince = 0; setProgressReliability(!routeSegments.some(s => s.type === 'ferry' && !s.edgeCount));
        setEstimatedLabels('Live NRN reroute'); $('distance').textContent = `${routeDist < 10 ? routeDist.toFixed(1) : Math.round(routeDist)} km`; $('time').textContent = fmtMin(routeTime); updateRouteQuality(routeSegments.some(s => s.type !== 'road'));
        resetEta(); startEtaTracking(Date.now()); update(); if (followGPS) followViewAt([lon, lat]); else { renderBase(); renderOverlay(); }
        $('routeStatus').textContent = 'Rerouted'; $('gpsDetail').textContent = `Route recalculated locally · ${routeDist.toFixed(1)} km remaining.`; $('gpsDetail').classList.remove('offroute');
        setStatus(`Route recalculated locally · ${routeDist.toFixed(1)} km remaining.`); lastRerouteAt = Date.now();
        logRoadEvent('route_recalculated', { reason, nearestRoadKm: +nn.distanceKm.toFixed(3), routeKm: +routeDist.toFixed(2), routeMin: +routeTime.toFixed(1), reroutes: liveRerouteCount, via: typeof describeRouteEdges === 'function' ? describeRouteEdges(routeEdgeIds) : '' }, true); ok = true;
      } catch (e) { setStatus('You are off the planned route and the offline reroute could not connect yet. Tracking will keep trying.', true); logRoadEvent('reroute_failed', { reason, message: e?.message || 'reroute failed' }, true); }
      finally { rerouteInFlight = false; resolve(ok); }
    }, 10);
  });
}
window.rerouteFromGpsPosition = rerouteFromGpsPosition;

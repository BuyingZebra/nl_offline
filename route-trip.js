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
<<<<<<< HEAD
=======
  if ($('viaRoute')) $('viaRoute').textContent = (!virtual && routeEdgeIds.length && typeof describeRouteEdges === 'function') ? describeRouteEdges(routeEdgeIds) : '';
>>>>>>> d2e1bc5 (NL Offline v0.14 NRN routing rebuild)
  const errPct = routeDist > 0 ? Math.abs(routePolylineKm - routeDist) / routeDist * 100 : 0;
  if (!routeProgressReliable) { $('routeStatus').textContent = 'Schematic'; $('routeNote').textContent = 'Level 1 reliable · Level 2 ferry map approximate'; return; }
  if (virtual || currentTripHasFerry) $('routeStatus').textContent = 'Mixed'; else $('routeStatus').textContent = errPct <= 5 ? 'On road' : 'Map approx';
  const quality = routeDist > 0 ? `Map ${Math.round(routePolylineKm)} km · ${errPct.toFixed(1)}% vs official` : 'Co-located';
  const calibrated = usesCorrectedAnchor(currentOriginIndex) || usesCorrectedAnchor(currentDestIndex) ? ' · calibrated anchor' : '';
  $('routeNote').textContent = (virtual ? `Ferry / remote leg · ${quality}` : quality) + calibrated;
}
function setProgressReliability(ok) {
  routeProgressReliable = !!ok;
  $('gpsStart').disabled = !routeProgressReliable || !currentTripLoaded || routeCoords.length < 2;
  if (!ok) $('gpsDetail').textContent = 'Level 1 distance/time is available, but this ferry map is schematic. Live route progress is disabled for this trip.';
}
function ferryFallback(originName, destName, a, b) {
  const p1 = pointForCommunity(originName, a), p2 = pointForCommunity(destName, b); if (!p1 || !p2) return false;
<<<<<<< HEAD
  routeSegments = [{ type: 'ferry', coords: [p1, p2], label: 'Schematic ferry connection' }]; routeCoords = flattenSegments(); metrics();
=======
  routeEdgeIds = []; routeSegments = [{ type: 'ferry', coords: [p1, p2], label: 'Schematic ferry connection' }]; routeCoords = flattenSegments(); metrics();
>>>>>>> d2e1bc5 (NL Offline v0.14 NRN routing rebuild)
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
  progress = 0; offRouteState = false; resetEta(); currentTripLoaded = true; update(); logRoadEvent('trip_loaded', currentTripSnapshot(), true);
}
function buildAlias(av, bv, a, b, info) {
<<<<<<< HEAD
  setRouteTotals(info); setTownLabels(info); currentTripLoaded = true; routeSegments = [];
=======
  setRouteTotals(info); setTownLabels(info); currentTripLoaded = true; routeSegments = []; routeEdgeIds = [];
>>>>>>> d2e1bc5 (NL Offline v0.14 NRN routing rebuild)
  const p1 = pointForCommunity(av, a), p2 = pointForCommunity(bv, b); routeCoords = p1 && p2 ? [p1, p2] : p1 ? [p1] : [];
  routeCoordKinds = routeCoords.length > 1 ? ['road'] : []; metrics(); setFollow(false); if (routeCoords.length) fit(routeCoords);
  $('destination').textContent = bv; $('distance').textContent = '0 km'; $('time').textContent = '0 min'; $('routeStatus').textContent = 'Same place'; $('routeNote').textContent = 'Official aliases / co-located communities';
  progress = 1; resetEta(); setProgressReliability(false); update(); logRoadEvent('alias_trip', currentTripSnapshot(), true); setStatus('These two official community entries are co-located in NL-RDDb.');
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
<<<<<<< HEAD
  routeSegments = []; routeCoords = []; currentTripLoaded = true; progress = 0; resetEta(); update(); busy(true); setStatus('Calculating path locally…');
=======
  routeSegments = []; routeEdgeIds = []; routeCoords = []; currentTripLoaded = true; progress = 0; resetEta(); update(); busy(true); setStatus('Calculating path locally…');
>>>>>>> d2e1bc5 (NL Offline v0.14 NRN routing rebuild)
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
        const baseStart = routingAnchor(nc.index), baseGraph = graphKmToDestination(baseStart, bv, b, allowFerry), curGraph = graphKmToDestination(nn.node, bv, b, allowFerry);
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
        setStatus(`Current location routed · nearest reference: ${names[nc.index]} (${nc.distanceKm.toFixed(1)} km).`); logRoadEvent('gps_route_loaded', { ...currentTripSnapshot(), nearestReference: names[nc.index], referenceKm: +nc.distanceKm.toFixed(2) }, true); ok = true;
      } catch (_) { setProgressReliability(false); setStatus('Could not connect current location to the offline road network.', true); }
      finally { busy(false); resolve(ok); }
    }, 10);
  });
}


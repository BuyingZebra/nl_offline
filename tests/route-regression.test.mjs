import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, evaluate } from './runtime-harness.mjs';

const runtime = createRuntime({ addresses: true });

test('100 representative non-ferry routes are forward and graph-contiguous', () => {
  const result = evaluate(runtime, `(() => {
    const failures = []; let checked = 0, seed = 17017;
    function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (let attempt = 0; attempt < 800 && checked < 100; attempt++) {
      const a = Math.floor(random() * N), b = Math.floor(random() * N);
      if (a === b || special[names[a]] || special[names[b]] || tripInfo(a, b).hasFerry) continue;
      try {
        composePath(names[a], names[b], a, b, false); const coords = flattenSegments();
        const start = DATA.nodes[routingAnchor(a)], end = DATA.nodes[routingAnchor(b)];
        let node = routingAnchor(a), contiguous = true;
        for (const traversal of routeEdgeTraversals) {
          if (traversal.fromNode !== node) { contiguous = false; break; }
          node = traversal.toNode;
        }
        const startGap = kmBetween(coords[0], start), endGap = kmBetween(coords.at(-1), end);
        if (startGap > .03 || endGap > .03 || !contiguous || node !== routingAnchor(b))
          failures.push({ from: names[a], to: names[b], startGap, endGap, contiguous, node, expected: routingAnchor(b) });
      } catch (error) { failures.push({ from: names[a], to: names[b], error: error.message }); }
      checked++;
    }
    return { checked, failures };
  })()`);
  assert.equal(result.checked, 100);
  assert.deepEqual(Array.from(result.failures), []);
});

test('all non-zero official pairs have compatible packaged graph components', () => {
  const result = evaluate(runtime, `(() => {
    function components(includeFerry) {
      const component = new Int32Array(DATA.nodes.length); component.fill(-1); let id = 0;
      for (let start = 0; start < DATA.nodes.length; start++) {
        if (component[start] >= 0) continue; component[start] = id; const queue = [start];
        for (let q = 0; q < queue.length; q++) for (const [next,,,type] of adj[queue[q]]) {
          if (!includeFerry && type === 'ferry') continue;
          if (component[next] < 0) { component[next] = id; queue.push(next); }
        }
        id++;
      }
      return component;
    }
    const road = components(false), all = components(true), failures = [];
    function pairNode(name, index, hasFerry) {
      const route = special[name];
      if (!route) return routingAnchor(index);
      const local = !hasFerry ? specialLocalRoadNode(name) : -1;
      return local >= 0 ? local : gatewayNode(route.gateway);
    }
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      if (a === b) continue; const info = tripInfo(a, b);
      if (!info.totalDistance && !info.totalTime) continue;
      const start = pairNode(names[a], a, info.hasFerry), end = pairNode(names[b], b, info.hasFerry), component = info.hasFerry ? all : road;
      if (start < 0 || end < 0 || component[start] !== component[end]) failures.push([names[a], names[b], info.hasFerry]);
    }
    return { checked: N * (N - 1), failures };
  })()`);
  assert.ok(result.checked > 850000);
  assert.deepEqual(Array.from(result.failures), []);
});

test('Shalloway Cove and St. Brendan’s route directly in both directions', () => {
  const result = evaluate(runtime, `(() => {
    const pairs = [["Shalloway Cove, St. Brendan's", "St. Brendan's"], ["St. Brendan's", "Shalloway Cove, St. Brendan's"]];
    return pairs.map(([from, to]) => {
      const a = names.indexOf(from), b = names.indexOf(to), info = tripInfo(a, b);
      composePath(from, to, a, b, info.hasFerry); const coords = flattenSegments();
      return {
        from, to, hasFerry: info.hasFerry, schematic: routeSegments.some(segment => segment.schematic),
        startGap: kmBetween(coords[0], pointForCommunity(from, a)), endGap: kmBetween(coords.at(-1), pointForCommunity(to, b)),
      };
    });
  })()`);
  for (const route of result) {
    assert.equal(route.hasFerry, false);
    assert.equal(route.schematic, false);
    assert.ok(route.startGap < .01 && route.endGap < .01, `${route.from} → ${route.to} endpoints drifted`);
  }
});

test('town normalization and civic-address suggestions remain usable offline', () => {
  assert.equal(evaluate(runtime, `names[townIndexFromText('st brendans')]`), "St. Brendan's");
  assert.ok(Array.from(evaluate(runtime, `townSuggestions('carboneer', 5)`)).includes('Carbonear'));
  const address = evaluate(runtime, `resolveAddress('123 Water Street, Carbonear')`);
  assert.equal(address?.label, '123 Water Street, Carbonear');
  assert.equal(address?.confidence, 'range');
  assert.ok(Array.from(evaluate(runtime, `addressSuggestions('123 water carbo', 5)`)).includes('123 Water Street, Carbonear'));
});

test('civic addresses evaluate both road exits and retain exact road geometry', () => {
  const result = evaluate(runtime, `(() => {
    const originAddress = resolveAddress('123 Water Street, Carbonear'), destinationAddress = resolveAddress('50 West Street, Corner Brook');
    const origin = { kind: 'address', label: originAddress.label, index: -1, node: originAddress.node, point: originAddress.point, address: originAddress };
    const destination = { kind: 'address', label: destinationAddress.label, index: -1, node: destinationAddress.node, point: destinationAddress.point, address: destinationAddress };
    const origins = endpointCandidates(origin, 'origin'), destinations = endpointCandidates(destination, 'destination');
    const closestOrigin = origins.find(candidate => candidate.node === originAddress.node), closestDestination = destinations.find(candidate => candidate.node === destinationAddress.node);
    const closestEdges = dijkstra(closestOrigin.node, closestDestination.node, { allowFerry: false });
    const closestMinutes = closestOrigin.accessMinutes + estimateRouteMinutes(closestEdges) + closestDestination.accessMinutes;
    const selected = composeEndpoints(origin, destination), coords = flattenSegments();
    return {
      selected, closestMinutes, startGap: kmBetween(coords[0], originAddress.point), endGap: kmBetween(coords.at(-1), destinationAddress.point),
      firstSource: routeSegments[0]?.sourceEdgeId, lastSource: routeSegments.at(-1)?.sourceEdgeId,
      contiguous: routeSegments.every((segment, index) => !index || kmBetween(routeSegments[index - 1].coords.at(-1), segment.coords[0]) < .03),
    };
  })()`);
  assert.equal(result.selected.addressEndpointOptimized, true);
  assert.ok(result.selected.estimatedMinutes <= result.closestMinutes + 1e-7);
  assert.ok(result.startGap < .002 && result.endGap < .002);
  assert.equal(result.firstSource, 18074);
  assert.equal(result.lastSource, 15902);
  assert.equal(result.contiguous, true);
});

test('two addresses on one road segment use the direct partial segment', () => {
  const result = evaluate(runtime, `(() => {
    const a = resolveAddress('123 Water Street, Carbonear'), b = resolveAddress('125 Water Street, Carbonear');
    const origin = { kind: 'address', label: a.label, index: -1, node: a.node, point: a.point, address: a };
    const destination = { kind: 'address', label: b.label, index: -1, node: b.node, point: b.point, address: b };
    const selected = composeEndpoints(origin, destination), coords = flattenSegments();
    return { selected, edges: routeEdgeIds.length, segments: routeSegments.length, km: polylineKm(coords), startGap: kmBetween(coords[0], a.point), endGap: kmBetween(coords.at(-1), b.point), label: routeSegments[0]?.label };
  })()`);
  assert.equal(result.selected.addressEndpointOptimized, true);
  assert.equal(result.edges, 0);
  assert.equal(result.segments, 1);
  assert.ok(result.km > .005 && result.km < .1);
  assert.ok(result.startGap < .002 && result.endGap < .002);
  assert.equal(result.label, 'Water Street');
});

test('offline guidance produces ordered, bounded maneuvers for a long route', () => {
  const result = evaluate(runtime, `(() => {
    const a = names.indexOf('Carbonear'), b = names.indexOf('Bonavista'), info = tripInfo(a, b); loadedOriginLabel = names[a]; loadedDestLabel = names[b];
    composePath(names[a], names[b], a, b, info.hasFerry); routeCoords = flattenSegments(); metrics();
    return { km: routePolylineKm, maneuvers: routeManeuvers.map(item => ({ type: item.type, atKm: item.atKm, instruction: item.instruction })), summary: $('directionSummary').textContent };
  })()`);
  assert.ok(result.maneuvers.length >= 5 && result.maneuvers.length <= 40);
  assert.equal(result.maneuvers[0].type, 'start');
  assert.equal(result.maneuvers.at(-1).type, 'arrive');
  assert.match(result.maneuvers.at(-1).instruction, /Bonavista/);
  assert.ok(result.maneuvers.some(item => /Route 1 \/ TCH/.test(item.instruction)));
  for (let i = 1; i < result.maneuvers.length; i++) assert.ok(result.maneuvers[i].atKm >= result.maneuvers[i - 1].atKm);
  assert.match(result.summary, /maneuvers/);
});

test('heading-aware matching distinguishes opposite nearby route segments', () => {
  const result = evaluate(runtime, `(() => {
    routeCoords = [[-53,48],[-52.99,48],[-52.99,48.001],[-53,48.001]];
    routeCum = [0]; routePolylineKm = 0;
    for (let i = 1; i < routeCoords.length; i++) { routePolylineKm += kmBetween(routeCoords[i - 1], routeCoords[i]); routeCum.push(routePolylineKm); }
    const east = snapGlobal(-52.995, 48.0005, 90), west = snapGlobal(-52.995, 48.0005, 270);
    return { eastSegment: east.segmentIndex, westSegment: west.segmentIndex, eastDifference: east.headingDifference, westDifference: west.headingDifference };
  })()`);
  assert.equal(result.eastSegment, 0);
  assert.equal(result.westSegment, 2);
  assert.ok(result.eastDifference < 10 && result.westDifference < 10);
});

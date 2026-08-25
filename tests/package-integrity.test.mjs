import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { root } from './runtime-harness.mjs';

const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('release versions agree', () => {
  const build = JSON.parse(read('build-info.json'));
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const pkg = JSON.parse(read('package.json'));
  assert.equal(build.version, '0.22.0');
  assert.equal(pkg.version, build.version);
  assert.match(manifest.name, /v0\.22$/);
  assert.match(read('sw.js'), /const VERSION = '0\.22\.0'/);
  assert.match(read('index.html'), /NL Offline MVP v0\.22/);
});

test('HTML runtime files exist and are cached by the service worker', () => {
  const html = read('index.html'), sw = read('sw.js');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
  const assetsMatch = sw.match(/const ASSETS = (\[[\s\S]*?\]);/);
  assert.ok(assetsMatch, 'service-worker asset list missing');
  const assets = vm.runInNewContext(assetsMatch[1]);
  assert.equal(new Set(assets).size, assets.length, 'duplicate service-worker assets');
  for (const file of [...scripts, 'index.html', 'manifest.webmanifest', 'build-info.json', 'icon-192.png', 'icon-512.png']) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is referenced but missing`);
    assert.ok(assets.includes(file), `${file} is not protected for offline use`);
  }
  for (const file of assets) assert.ok(fs.existsSync(path.join(root, file)), `${file} is cached but missing`);
  assert.equal(scripts.filter(file => file.startsWith('roadmeta-part-')).length, 13);
  assert.equal(scripts.filter(file => file.startsWith('addressmeta-part-')).length, 0);
  assert.ok(scripts.includes('roadindex.js'));
  assert.ok(scripts.includes('roads.js'));
});

test('release contains no stale v0.21 runtime references', () => {
  const files = ['index.html', 'core.js', 'roads.js', 'routing.js', 'map.js', 'route-path.js', 'guidance.js', 'route-progress.js', 'route-trip.js', 'pwa.js', 'gps.js', 'sw.js', 'manifest.webmanifest'];
  const stale = files.filter(file => /v0\.21|0\.21\.0|v021/.test(read(file)));
  assert.deepEqual(stale, []);
});

test('declared dataset counts match the packaged data', () => {
  const build = JSON.parse(read('build-info.json'));
  let sandbox = { window: {} }; sandbox.window = sandbox; sandbox = vm.createContext(sandbox);
  vm.runInContext(read('data.js'), sandbox); vm.runInContext(read('ferry.js'), sandbox);
  const data = sandbox.NL_DATA;
  assert.equal(data.communities.length, build.data.officialCommunities);
  assert.equal(data.nodes.length, build.data.roadNodes);
  assert.equal(data.edges.length, build.data.networkEdges);
  assert.equal(data.routeReady, build.data.roadMappedCommunities);
  assert.equal(data.ferryPairCount, build.data.ferryAwarePairs);
  assert.equal(data.edges.filter(edge => (edge[4] || 'road') === 'road').length, build.data.roadEdges);
  assert.equal(data.edges.filter(edge => edge[4] === 'ferry').length, build.data.ferryEdges);
  assert.equal(data.edges.filter(edge => edge[4] === 'virtual').length, build.data.schematicDataEdges);
  assert.equal(data.geometryQuality.newGeometryPoints, build.data.roadGeometryPoints);
  assert.equal(data.geometryQuality.oldGeometryPoints, build.data.previousRoadGeometryPoints);
  assert.equal(data.geometryQuality.matchedExact + data.geometryQuality.matchedNear, build.data.nrnGeometryEdgesMatched);
  assert.equal(data.geometryQuality.uniqueSourceFeatures, build.data.nrnUniqueSourceFeatures);
  assert.equal(data.geometryQuality.duplicateSourceAssignments, build.data.nrnDuplicateSourceAssignments);
  assert.ok(data.geometryQuality.newGeometryPoints > data.geometryQuality.oldGeometryPoints * 2.5, 'road geometry was not materially improved');

  const basemapSandbox = { window: {} }; basemapSandbox.window = basemapSandbox;
  vm.createContext(basemapSandbox); vm.runInContext(read('basemap.js'), basemapSandbox);
  const basemap = basemapSandbox.NL_BASEMAP;
  assert.equal(basemap.land.length, build.data.vectorLandFeatures);
  assert.equal(basemap.water.length, build.data.vectorWaterFeatures);
  assert.equal(basemap.quality.landVectorPoints, build.data.vectorLandPoints);
  assert.equal(basemap.quality.waterVectorPoints, build.data.vectorWaterPoints);

  const roadSandbox = { window: {} }; roadSandbox.window = roadSandbox;
  vm.createContext(roadSandbox); vm.runInContext(read('roadindex.js'), roadSandbox);
  const roads = roadSandbox.NL_ROAD_INDEX;
  assert.equal(roads.pairs.length, build.data.roadPlaceEntries);
  assert.equal(roads.streets.length, build.data.roadNameCount);
  assert.equal(roads.places.length, build.data.roadLocalities);
  assert.equal(roads.quality.pairEdgeLinks, build.data.roadPairEdgeLinks);
  assert.equal(roads.quality.namedRoadEdges, build.data.namedRoadEdges);
  assert.equal(build.data.civicAddressesIncluded, 0);
  assert.equal(build.data.civicNumberNavigationEnabled, false);
  assert.ok(!('recordsB64' in roads), 'civic-number records leaked into the road/place index');
  assert.ok(fs.statSync(path.join(root, 'roadindex.js')).size < 1_000_000, 'road/place index unexpectedly large');
  assert.equal(fs.existsSync(path.join(root, 'addresspoints.js')), false, 'exact civic-address package should not ship in v0.22');
});

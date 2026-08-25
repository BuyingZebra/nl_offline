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
  assert.equal(build.version, '0.19.0');
  assert.equal(pkg.version, build.version);
  assert.match(manifest.name, /v0\.19$/);
  assert.match(read('sw.js'), /const VERSION = '0\.19\.0'/);
  assert.match(read('index.html'), /NL Offline MVP v0\.19/);
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
  assert.equal(scripts.filter(file => file.startsWith('addressmeta-part-')).length, 34);
});

test('release contains no stale v0.18 runtime references', () => {
  const files = ['index.html', 'core.js', 'addresses.js', 'routing.js', 'map.js', 'route-path.js', 'guidance.js', 'route-progress.js', 'route-trip.js', 'pwa.js', 'gps.js', 'sw.js', 'manifest.webmanifest'];
  const stale = files.filter(file => /v0\.18|0\.18\.0|v018/.test(read(file)));
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

  const addressSandbox = { window: {} }; addressSandbox.window = addressSandbox;
  vm.createContext(addressSandbox); vm.runInContext(read('addresspoints.js'), addressSandbox);
  const points = addressSandbox.NL_ADDRESS_POINTS;
  assert.equal(points.recordCount, build.data.exactCivicAddresses);
  assert.equal(points.streetCount, build.data.exactAddressStreets);
  assert.equal(points.placeCount, build.data.exactAddressLocalities);
  assert.equal(points.quality.snappedToRoad, build.data.exactAddressRoadSnaps);
  assert.equal(points.quality.fallbackPoints, build.data.exactAddressFallbackPoints);
  assert.ok(fs.statSync(path.join(root, 'addresspoints.js')).size < 4_000_000, 'exact address package unexpectedly large');
});

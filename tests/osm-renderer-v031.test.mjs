// FIELD ATLAS v0.31: OSM Standard / phosphor rendering regression guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script, runInNewContext} from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const protocolCode = readFileSync(
  new URL('../experiments/osm-phosphor-protocol.js', import.meta.url), 'utf8');

test('experiment and the v0.31 map program parse', () => {
  assert.ok(js);
  assert.doesNotThrow(() => new Script(js));
  assert.doesNotThrow(() => new Script(protocolCode));
  assert.match(js, /APP_VERSION='0\.31'/);
});

test('renderer choice is reversible without losing the map camera', () => {
  for (const id of ['vector', 'osm-standard', 'osm-phosphor']) {
    assert.ok(js.includes("'" + id + "'"), id);
  }
  assert.ok(js.includes("state.map.setStyle(makeStyle())"));
  // Changing renderer never invokes a new flyTo or jumpTo.
  const select = js.slice(js.indexOf('function selectMapRenderer('),
    js.indexOf('const EFFECT_OPTIONS', js.indexOf('function selectMapRenderer(')));
  assert.doesNotMatch(select, /\.flyTo\(|\.jumpTo\(|\.easeTo\(/);
});

test('raster source uses the actual OSM Standard map, not substitute tiles', () => {
  assert.ok(js.includes('https://tile.openstreetmap.org/{z}/{x}/{y}.png'));
  assert.match(js, /tileSize:256,maxzoom:19/);
  assert.ok(js.includes("'osm-standard-raster'"));
  assert.ok(js.includes('fieldAtlasRendererV031'));
});

test('OSM coastline-clipped water grid and pins survive raster mode', () => {
  assert.ok(js.includes("id:'water-grid',type:'fill'"));
  assert.ok(js.includes("'source-layer':'water'"));
  assert.ok(js.includes("'fill-pattern':'water-grid-'+state.theme"));
  for (const layer of ['water-grid','route','saved-pin-glow','saved-pin-points']) {
    assert.ok(js.includes("'" + layer + "'"), layer);
  }
  assert.match(js, /mapAttribution/);
});

test('custom raster protocol is on-demand only and enforces tile URL structure', async () => {
  const added = [];
  const window = {};
  runInNewContext(protocolCode, {window, Uint8Array, Uint8ClampedArray});
  window.FieldAtlasPhosphor.install({addProtocol: (name, fn) => added.push({name, fn})});
  assert.equal(added.length, 1);
  assert.equal(added[0].name, 'fieldatlas');
  assert.equal(window.FieldAtlasPhosphor.tileTemplate('amber'),
    'fieldatlas://amber/{z}/{x}/{y}.png');
  await assert.rejects(added[0].fn({url:'fieldatlas://green/0/invalid/0.png'}, {}),
    /Unexpected FIELD ATLAS tile URL/);
  assert.doesNotMatch(protocolCode, /Promise\.all\(|prefetch|offlinePack|OfflineManager\.createPack/);
});

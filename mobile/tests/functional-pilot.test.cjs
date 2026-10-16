const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const green = JSON.parse(read('styles/field-atlas-pipboy.json'));
const dark = JSON.parse(read('styles/field-atlas-dark.json'));

test('pilot styles are genuine MapLibre vector styles with matching resources', () => {
  for (const style of [green, dark]) {
    assert.equal(style.version, 8);
    assert.equal(style.sources.osm.url, 'https://tiles.openfreemap.org/planet');
    assert.equal(style.glyphs, 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf');
    for (const layer of ['background','water','buildings-fill','local-roads',
      'primary-roads','street-names','settlements'])
      assert.ok(style.layers.some(x => x.id === layer), layer);
  }
  assert.deepEqual(green.layers.map(x => x.id), dark.layers.map(x => x.id));
});
test('the live native map and downloader use the same style URL per theme', () => {
  const styleUrls = read('src/map/pilotStyles.ts');
  const map = read('src/screens/MapScreen.tsx');
  const offline = read('src/core/offline/useOfflineRegion.ts');
  assert.match(styleUrls, /field-atlas-pipboy\.json/);
  assert.match(styleUrls, /field-atlas-dark\.json/);
  assert.match(styleUrls, /7fd756eb488a834eaddefa5f3db48eccf07c05c6/);
  assert.match(map, /const mapStyle = PILOT_STYLE_URLS\[theme\]/);
  assert.match(offline, /mapStyle: PILOT_STYLE_URLS\[theme\]/);
  assert.match(offline, /REGION_ID \+ '-' \+ theme/);
  assert.doesNotMatch(offline, /mapStyle: OFFLINE_STYLE_URL/);
});
test('GPS permission and first-fix follow path are wired', () => {
  const gps = read('src/core/gps/useGps.ts');
  const map = read('src/screens/MapScreen.tsx');
  assert.match(gps, /requestForegroundPermissionsAsync/);
  assert.match(gps, /getForegroundPermissionsAsync/);
  assert.match(gps, /watchPositionAsync/);
  assert.match(gps, /Promise<boolean>/);
  assert.match(map, /pendingLocate\.current = true/);
  assert.match(map, /gps\.permission !== 'granted'/);
  assert.match(map, /trackUserLocation=\{follow \? 'default' : undefined\}/);
});

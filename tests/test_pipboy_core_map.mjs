import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync('map-preview.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(s=>s.trim());
assert.ok(scripts.length>0,'Core map JavaScript missing');
for(const script of scripts)new vm.Script(script,{filename:'map-preview.html'});

// The MapLibre style must exclude sidewalks both from vehicle roads and from
// the acceptable trails overlay. Parsing this data without importing MapLibre
// avoids depending on a browser during CI.
const a=html.indexOf('const nonRoadFilter=');
const b=html.indexOf("\nadd('buildings'",a);
assert.ok(a>0 && b>a,'Core road/trail style filters not found');
const core=html.slice(a,b);
assert.match(core,/const trailFilter=/);
assert.match(core,/\['!',nonRoadFilter\]/);
assert.match(core,/'footway'/);
assert.match(core,/'track'/);
assert.match(core,/'sidewalk'/);
assert.match(core,/'line-join':'round'/);
assert.match(core,/'line-cap':'round'/);

const segment=fs.readFileSync('tools/prepare_overture_segments.py','utf8');
assert.match(segment,/if subclass=="sidewalk"/);
assert.match(segment,/return "hidden_pedestrian"/);
assert.match(segment,/return "trail"/);
assert.match(html,/filter:\['==',\['get','kind'\],'motor_candidate'\]/);
assert.match(html,/filter:\['==',\['get','kind'\],'trail'\]/);
assert.ok(!/get','kind'\],'hidden_pedestrian'\]/.test(html),
  'Sidewalk geometry must not render in the core view');

assert.match(html,/function chooseTown\(feature\)/);
assert.match(html,/const center=feature\.geometry\.coordinates/);
assert.match(html,/const hasIslandOverture=!!map\.getSource\('overture-island-0'\)/);
assert.match(html,/map\.flyTo\(\{center,zoom,essential:true\}\)/);
assert.match(html,/activeSelectedTown\.geometry\.coordinates/);
assert.match(html,/loadDetailedCoast/);
assert.match(html,/natural-shoreline-hires/);

console.log('PASS: default map is road/trail only, vectors are rounded, real coast and OSM-label town picker are present');

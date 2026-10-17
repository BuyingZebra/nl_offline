#!/usr/bin/env node
// This test checks our browser preview NEVER draws overview and detail roads
// simultaneously. Source tile maxzoom alone does not stop overzoom rendering.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync('map-preview.html','utf8');
const from=source.indexOf('function add(group, sourceLayer, type, paint, options={}) {');
const to=source.indexOf("\nadd('terrain'",from);
assert.ok(from>=0 && to>from, 'map-preview add() style layer builder not found');
const builder=source.slice(from,to);
const sandbox={};
vm.createContext(sandbox);
vm.runInContext(
  "const meta={baseZoom:9}; const layers={}; const style={layers:[]}; const available=new Set(['transportation','building','transportation_name']);"+
  builder+
  "\nadd('roads','transportation','line',{'line-width':2});"+
  "\nadd('buildings','building','fill',{}, {minzoom:12});"+
  "\nadd('labels','transportation_name','symbol',{}, {minzoom:11});"+
  "\nthis.result=style.layers;",
  sandbox
);
const roads=sandbox.result.filter(l=>l['source-layer']==='transportation');
const base=roads.find(l=>l.source==='base');
const sample=roads.find(l=>l.source==='samples');
assert.ok(base && sample,'Both overview and detail road layers required');
assert.equal(base.maxzoom,10,'Generalized overview must end before detailed layers begin');
assert.equal(sample.minzoom,10,'Detail begins at precisely the overview cutoff');
assert.ok(base.maxzoom<=sample.minzoom,'Overview/detail zoom overlap would duplicate road geometry');
assert.equal(sandbox.result.filter(l=>l.source==='base' && l['source-layer']==='building').length,0,
             'Detailed buildings must not render on generalized source');
assert.equal(sandbox.result.filter(l=>l.source==='base' && l['source-layer']==='transportation_name').length,0,
             'Detailed road labels must not render on generalized source');
console.log('PASS: road zoom sources are mutually exclusive; detailed-only layers have no overview copies');

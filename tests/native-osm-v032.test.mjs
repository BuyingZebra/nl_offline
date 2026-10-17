// v0.32 browser preview: native-only geometry from OSM, no external basemap
// geometry substitutes and no accidental duplicate rendering of roads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const html=readFileSync(new URL('../preview-v032/index.html',import.meta.url),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function styleFor(mode, withCoastline=true) {
 const a=js.indexOf('function makeStyle(){');
 const b=js.indexOf('\nfunction startLiveMap(){',a);
 assert.ok(a>0&&b>a);
 const state={
  theme:'green',mapRenderer:mode,showWaterGrid:true,
  showBuildings:true,effects:{glow:0}
 };
 const getStyle=new Function('state','window','gridPatternId','gridOpacity',
   'pinFeatures','textHaloPaint',
   js.slice(a,b)+'\nreturn makeStyle();');
 return getStyle(state,{fieldAtlasPMTilesInstalled:withCoastline},
   ()=>'water-grid-green-'+mode,()=>.35,
   ()=>({type:'FeatureCollection',features:[]}),
   ()=>({color:'#123a24',width:1,blur:0}));
}

test('new mobile-first browser preview has parseable script and v0.32 identifier',()=>{
 assert.ok(js);
 assert.doesNotThrow(()=>new Script(js));
 assert.match(js,/APP_VERSION='0\.32'/);
 assert.ok(js.includes("'osm-native':'OSM NATIVE DETAIL'"));
});
test('native mode includes exact OSM geometry sources for every requested category',()=>{
 const style=styleFor('osm-native');
 for(const category of ['roads','buildings','water','streams']){
  assert.equal(style.sources['osm-native-'+category].type,'geojson');
  assert.ok(style.sources['osm-native-'+category].data.endsWith(
    '/carbonear_'+category+'.geojson'));
 }
 assert.ok(style.sources['native-osm-coastline'].url.endsWith('nl_coastline.pmtiles'));
 assert.equal(style.layers.find(l=>l.id==='native-osm-shore')['source-layer'],'nl_shoreline');
 assert.equal(style.layers.find(l=>l.id==='native-osm-land')['source-layer'],'nl_land');
 assert.ok(style.layers.some(l=>l.id==='native-osm-roads'));
 assert.ok(style.layers.some(l=>l.id==='native-osm-buildings'));
 assert.ok(style.layers.some(l=>l.id==='water-grid'));
});
test('native roads suppress duplicate provider geometry inside trial area',()=>{
 const style=styleFor('osm-native');
 const base=style.layers.find(l=>l.id==='local-roads');
 assert.equal(base.filter[0],'all');
 assert.equal(base.filter[2][0],'!');
 assert.equal(base.filter[2][1][0],'within');
 assert.equal(base.filter[2][1][1].type,'Polygon');
 assert.equal(style.layers.find(l=>l.id==='native-osm-roads').source,'osm-native-roads');
});
test('non-native modes preserve v0.31 baseline and previous colour settings',()=>{
 const essentials=styleFor('osm-essentials');
 assert.equal(essentials.sources['native-osm-coastline'],undefined);
 assert.ok(essentials.layers.some(l=>l.id==='local-roads'));
 assert.ok(!essentials.layers.some(l=>l.id==='native-osm-roads'));
 const untouched=styleFor('vector');
 assert.ok(untouched.layers.some(l=>l.id==='parks'));
 assert.ok(!untouched.layers.some(l=>l.id==='native-osm-roads'));
});
test('native mode still renders regional details when PMTiles plugin is unavailable',()=>{
 const style=styleFor('osm-native',false);
 assert.equal(style.sources['native-osm-coastline'],undefined);
 assert.ok(style.layers.some(l=>l.id==='native-osm-roads'));
 assert.ok(style.layers.some(l=>l.id==='native-osm-water'));
});

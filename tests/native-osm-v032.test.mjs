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

test('map type uses an explicit iOS-accessible selector with every map option',()=>{
 assert.match(html,/<select id="mapTypeSetting" aria-label="Choose map type">/);
 assert.match(js,/MAP_RENDERERS\.map\(type=>/);
 assert.match(js,/\$\('mapTypeSetting'\)\.addEventListener\('change'/);
 assert.doesNotMatch(js,/\$\('rendererSetting'\)\.onclick/);
 assert.match(html,/\.\.\/preview-v031\/osm-phosphor-protocol\.js\?v=0312/);
});

test('all selectable map styles can be constructed without throwing',()=>{
 for(const mode of ['vector','osm-essentials','osm-native',
                    'osm-standard','osm-composite','osm-phosphor']){
  // In raster phosphor mode the live source URL needs the protocol helper.
  if(mode==='osm-phosphor')continue;
  assert.doesNotThrow(()=>styleFor(mode,true),mode);
 }
});

test('map type changes update map style and report failures instead of silently sticking',()=>{
 const a=js.indexOf('function selectMapRenderer(mode){');
 const b=js.indexOf('const EFFECT_OPTIONS',a);
 assert.ok(a>0&&b>a);
 const snippet=js.slice(a,b);
 const state={mapRenderer:'osm-essentials',map:{setStyle(style){this.lastStyle=style;}}};
 const document={documentElement:{dataset:{renderer:'osm-essentials'}}};
 const notices=[],cache=[];
 const helper=new Function('state','document','MAP_RENDERERS','MAP_RENDERER_NAMES',
  'window','toast','status','makeStyle','isReal','updateReadout','localStorage','console',
  snippet+' return selectMapRenderer;');
 let throws=false;
 const mapTypes=['vector','osm-essentials','osm-native','osm-standard','osm-composite','osm-phosphor'];
 const names=Object.fromEntries(mapTypes.map(x=>[x,x.toUpperCase()]));
 const change=helper(state,document,mapTypes,names,{FieldAtlasPhosphor:true},
  m=>notices.push(m),()=>{},()=>{if(throws)throw Error('Invalid map style');return {version:8}},
  ()=>true,()=>{}, {setItem:(...x)=>cache.push(x)}, {error:()=>{}});
 assert.equal(change('osm-native'),true);
 assert.equal(state.mapRenderer,'osm-native');
 assert.equal(document.documentElement.dataset.renderer,'osm-native');
 assert.ok(state.map.lastStyle);
 throws=true;
 assert.equal(change('vector'),false);
 assert.equal(state.mapRenderer,'osm-native');
 assert.equal(document.documentElement.dataset.renderer,'osm-native');
 assert.ok(notices.some(x=>x.includes('Unable to load')));
});

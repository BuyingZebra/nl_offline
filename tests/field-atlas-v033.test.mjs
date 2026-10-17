import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const input=JSON.parse(readFileSync(new URL('../data/osm-detail/carbonear_roads.geojson',import.meta.url),'utf8'));
const curves=JSON.parse(readFileSync(new URL('../data/osm-detail/carbonear_roads_spline.geojson',import.meta.url),'utf8'));
const report=JSON.parse(readFileSync(new URL('../data/osm-detail/carbonear_roads_spline_report.json',import.meta.url),'utf8'));
const html=readFileSync(new URL('../preview-v033/index.html',import.meta.url),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
function styleFor(mode){
 const i=inline.indexOf('function makeStyle(){');
 const j=inline.indexOf('\nfunction startLiveMap(){',i);
 const state={theme:'green',mapRenderer:mode,showWaterGrid:true,showBuildings:true,effects:{glow:0}};
 const fn=new Function('state','window','gridPatternId','gridOpacity','pinFeatures','textHaloPaint',inline.slice(i,j)+'\nreturn makeStyle();');
 return fn(state,{fieldAtlasPMTilesInstalled:true},()=> 'water-grid-green-'+mode,()=> .32,
  ()=>({type:'FeatureCollection',features:[]}),()=>({color:'#123a24',width:1,blur:0}));
}
test('all original regional OSM road feature IDs and coordinate nodes remain intact',()=>{
 assert.equal(input.features.length,3065);
 assert.equal(curves.features.length,input.features.length);
 let originalCount=0,newCount=0,improved=0;
 for(let i=0;i<input.features.length;i++){
  const a=input.features[i],b=curves.features[i],old=a.geometry.coordinates,now=b.geometry.coordinates;
  assert.deepEqual(a.properties,b.properties);
  assert.deepEqual(old[0],now[0]);assert.deepEqual(old.at(-1),now.at(-1));
  let index=0;
  for(const p of now){if(index<old.length&&p[0]===old[index][0]&&p[1]===old[index][1])index++}
  assert.equal(index,old.length,'Road node changed on OSM way '+a.properties.osm_id);
  originalCount+=old.length;newCount+=now.length;
  if(now.length>old.length)improved++;
 }
 assert.equal(originalCount,report.stats.original_nodes);
 assert.equal(newCount,report.stats.curved_nodes);
 assert.equal(improved,report.stats.modified_ways);
});
test('sampled spline points stay inside a 2.2-metre buffer around each original segment',()=>{
 const metres=111195;
 for(let i=0;i<input.features.length;i++){
  const a=input.features[i].geometry.coordinates,b=curves.features[i].geometry.coordinates;
  const fx=metres*Math.cos(a[0][1]*Math.PI/180);
  let segment=0;
  for(const p of b){
   if(segment<a.length-2&&p[0]===a[segment+1][0]&&p[1]===a[segment+1][1])segment++;
   const start=a[segment],end=a[Math.min(segment+1,a.length-1)],dx=(end[0]-start[0])*fx,dy=(end[1]-start[1])*metres;
   const px=(p[0]-start[0])*fx,py=(p[1]-start[1])*metres;
   const t=Math.max(0,Math.min(1,(px*dx+py*dy)/(dx*dx+dy*dy||1)));
   const dist=Math.hypot(px-dx*t,py-dy*t);
   assert.ok(dist<=2.2,'OSM way '+input.features[i].properties.osm_id+' deviation '+dist.toFixed(3)+'m');
  }
 }
});
test('both spline and original road styles are selectable on iPhone',()=>{
 assert.ok(inline);assert.doesNotThrow(()=>new Script(inline));
 assert.match(inline,/APP_VERSION='0\.33'/);
 assert.ok(html.includes('id="mapTypeSetting"'));
 assert.ok(inline.includes("fieldAtlasRendererV033"));
 const spline=styleFor('osm-curves'),original=styleFor('osm-native');
 assert.equal(spline.sources['osm-native-roads'].data,'../data/osm-detail/carbonear_roads_spline.geojson');
 assert.equal(original.sources['osm-native-roads'].data,'../data/osm-detail/carbonear_roads.geojson');
 assert.ok(spline.layers.find(x=>x.id==='native-osm-roads'));
 assert.ok(spline.layers.find(x=>x.id==='water-grid'));
});

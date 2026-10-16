import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const index=JSON.parse(readFileSync(new URL('../data/nl-places.json',import.meta.url),'utf8'));
const places=index.places;
const defaultPlaces=[
 {name:'Carbonear',lat:47.735,lng:-53.227,region:'Conception Bay North'},
 {name:'Bay Roberts',lat:47.598,lng:-53.262,region:'Conception Bay North'}
];

function searchFunctions(){
 const start=js.indexOf('function searchKey(value){');
 const end=js.indexOf('function placeResults(q){',start);
 assert.ok(start>=0&&end>start,'search functions exist');
 return new Function('PLACES','officialPlaces',js.slice(start,end)+
  'return {searchKey,placeSearchMatches};')(defaultPlaces,places);
}

test('full NL official community file is present, valid and audited',()=>{
 assert.ok(places.length>=1458,'expected at least 1458 validated place records');
 assert.equal(index.licence,'Open Government Licence - Canada');
 assert.equal(new Set(places.map(p=>p.id)).size,places.length);
 for(const p of places){
  assert.ok(p.name && p.id && p.kind);
  assert.ok(Number.isFinite(p.lat)&&p.lat>=45&&p.lat<=61);
  assert.ok(Number.isFinite(p.lng)&&p.lng>=-70&&p.lng<=-50);
 }
 for(const n of ["Carbonear","Bay Roberts","St. John's","Natuashish",
     "Labrador City","Happy Valley - Goose Bay"])
  assert.ok(places.some(p=>p.name===n),'missing '+n);
});
test('search is accent/spacing/punctuation tolerant and exact matches rank first',()=>{
 const {searchKey,placeSearchMatches}=searchFunctions();
 assert.equal(searchKey('St. John’s'),searchKey('st johns'));
 assert.equal(searchKey('Happy Valley – Goose Bay'),searchKey('Happy Valley - Goose Bay'));
 assert.equal(placeSearchMatches('Carbonear')[0].name,'Carbonear');
 assert.equal(placeSearchMatches('st johns')[0].name,"St. John's");
 assert.equal(placeSearchMatches('natuashish')[0].name,'Natuashish');
 assert.equal(placeSearchMatches('happy valley goose bay')[0].name,'Happy Valley - Goose Bay');
 assert.equal(placeSearchMatches('sp aniard s bay')[0].name,"Spaniard's Bay");
 assert.ok(placeSearchMatches('Bay').length<=60,'limit results to protect phone UI');
 assert.equal(placeSearchMatches('').length,defaultPlaces.length);
});
test('selecting a community eases directly without cinematic zoom-out',()=>{
 const start=js.indexOf('function viewPlace(p){'),end=js.indexOf('function getGPS(){',start);
 assert.ok(end>start);
 const fun=new Function('state','cancelPinPlacement','isReal','drawFallback',
  'toast','updateReadout','closeSheet',js.slice(start,end)+'return viewPlace;');
 let easing=null,zoomChanges=0;
 const state={center:null,route:null,map:{
   easeTo(o){easing=o;},
   flyTo(){throw new Error('Must not use flyTo')},
   zoomTo(){zoomChanges++}
 }};
 const view=fun(state,()=>{},()=>true,()=>{},()=>{},()=>{},()=>{});
 view({name:'Test Point',lng:-57.9,lat:48.9});
 assert.deepEqual(easing,{center:[-57.9,48.9],duration:650,essential:true});
 assert.equal(zoomChanges,0);
});
test('browser script remains parseable and uses fallback when official index fails',()=>{
 assert.doesNotThrow(()=>new Script(js));
 assert.ok(js.includes('loadCommunityIndex();'));
 assert.ok(js.includes("placesIndexState='error'"));
 assert.ok(js.includes('officialPlaces=[]'));
});

import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ENGINE_VERSION,DEFAULT_PARAMS as P,PARAM_RANGES,normalizeParams,electroOptic,switchingTimeMs,stepToward,
 stepPixel,visibleDarkness,reflectorShadowOffsetMm,shadowVectorMm,multiplexVoltages,srgbToLinear,driveColor}
 from '../vector-lcd/vector-lcd.js';

const appDir=fileURLToPath(new URL('../vector-lcd/',import.meta.url));
const read=name=>fs.readFileSync(appDir+name,'utf8');
const near=(a,b,eps=1e-9,msg)=>assert.ok(Math.abs(a-b)<=eps,(msg||'')+` ${a} vs ${b}`);

describe('Vector LCD electro-optics and response',()=>{
 test('no field is clear, full drive is dark, and the curve never reverses',()=>{
  near(electroOptic(0),0);near(electroOptic(1),1);
  let previous=-1;
  for(let v=0;v<=1.0001;v+=.01){const d=electroOptic(v);assert.ok(d>=previous);previous=d;}
 });
 test('off electrodes at the bias voltage show a faint ghost that grows with the bias ratio',()=>{
  const third=electroOptic(1/3),quarter=electroOptic(1/4);
  assert.ok(third>.02&&third<.12,'1/3 bias ghost should be faint but visible: '+third);
  assert.ok(quarter<third);
  near(electroOptic(0,{...P,ghost:false}),0);
 });
 test('driving on is faster than relaxing off, and faster at higher voltage',()=>{
  const on=switchingTimeMs(1,1,0),off=switchingTimeMs(0,0,1);
  assert.equal(off,P.relaxMs);
  assert.ok(on<off/2,'on '+on+' off '+off);
  assert.ok(switchingTimeMs(.9,.9,0)>on);
  assert.equal(switchingTimeMs(.5,.6,.1),P.relaxMs,'below threshold the field does not help');
  assert.ok(switchingTimeMs(5,1,0)>=P.minSwitchMs);
 });
 test('the same elapsed time gives the same result at any frame rate',()=>{
  const run=(hz,ms,v)=>{let s={d:0,r:0};const dt=1000/hz;for(let t=0;t<ms-1e-9;t+=dt)s=stepPixel(s,v,dt);return s;};
  for(const v of [1,1/3,0]){
   const a=run(30,300,v),b=run(60,300,v),c=run(120,300,v);
   near(a.d,b.d,1e-9,'d 30/60');near(b.d,c.d,1e-9,'d 60/120');near(a.r,c.r,1e-9,'r');
  }
  near(stepToward(0,1,P.relaxMs,P.relaxMs),1-Math.exp(-1));
 });
 test('retention charges while held and leaves a fading image after release',()=>{
  let s={d:0,r:0};
  for(let i=0;i<20*60;i++)s=stepPixel(s,1,1000/60);
  assert.ok(s.r>.7,'charged after 20 s: '+s.r);
  for(let i=0;i<60;i++)s=stepPixel(s,1/3,1000/60);
  const after=visibleDarkness(s);
  assert.ok(after>electroOptic(1/3)+.05,'retained image visible: '+after);
  for(let i=0;i<60*60;i++)s=stepPixel(s,1/3,1000/60);
  assert.ok(visibleDarkness(s)<after/2,'retained image fades');
  const off={...P,retention:false};
  near(visibleDarkness({d:.2,r:.9},off),.2);
 });
});

describe('Vector LCD reflector shadow and multiplexing',()=>{
 test('shadow offset is zero under normal light and grows with angle and glass',()=>{
  near(reflectorShadowOffsetMm(.7,0),0);
  assert.ok(reflectorShadowOffsetMm(.7,40)>reflectorShadowOffsetMm(.7,20));
  assert.ok(reflectorShadowOffsetMm(1.4,30)>reflectorShadowOffsetMm(.7,30));
  // Refraction into glass (n=1.5) keeps even grazing light below the critical angle.
  assert.ok(reflectorShadowOffsetMm(1,89.9)<1/Math.sqrt(1.5**2-1)+1e-6);
 });
 test('the shadow falls away from the light',()=>{
  const fromTop=shadowVectorMm({...P,lightAzimuthDeg:0}),fromRight=shadowVectorMm({...P,lightAzimuthDeg:90});
  assert.ok(fromTop.y>0&&Math.abs(fromTop.x)<1e-12);
  assert.ok(fromRight.x<0&&Math.abs(fromRight.y)<1e-12);
  const fromTopLeft=shadowVectorMm(P);
  assert.ok(fromTopLeft.x>0&&fromTopLeft.y>0);
 });
 test('crosstalk lifts only off electrodes, in proportion to their line load',()=>{
  const e=[{id:'a',line:'L',on:true},{id:'b',line:'L',on:true},{id:'c',line:'L',on:false},
   {id:'d',line:'M',on:false},{id:'e',line:'M',on:false}];
  const v=multiplexVoltages(e,P);
  assert.equal(v.get('a'),1);
  near(v.get('d'),P.bias,1e-12,'empty line keeps plain bias');
  near(v.get('c'),P.bias+P.crosstalkAmount*(2/3)*(1-P.bias),1e-12);
  const plain=multiplexVoltages(e,{...P,crosstalk:false});
  near(plain.get('c'),P.bias,1e-12);
  const noGhost=multiplexVoltages(e,{...P,ghost:false,crosstalk:false});
  assert.equal(noGhost.get('d'),0);
 });
});

describe('Vector LCD parameters and helpers',()=>{
 test('parameters are clamped to their ranges and unknown keys are ignored',()=>{
  const p=normalizeParams({relaxMs:99999,bias:-1,shadow:0,nonsense:5,background:[300,-4,10],ink:'red'});
  assert.equal(p.relaxMs,PARAM_RANGES.relaxMs[1]);
  assert.equal(p.bias,0);assert.equal(p.shadow,false);
  assert.ok(!('nonsense' in p));
  assert.deepEqual(p.background,[255,0,10]);assert.deepEqual(p.ink,P.ink);
  assert.ok(Object.isFrozen(p));
  for(const [key,[min,max]] of Object.entries(PARAM_RANGES))
   assert.ok(P[key]>=min&&P[key]<=max,key+' default inside its range');
 });
 test('colour helpers encode drive and linearize sRGB',()=>{
  assert.equal(driveColor(1),'rgb(255,255,255)');assert.equal(driveColor(-3),'rgb(0,0,0)');
  near(srgbToLinear(255),1);near(srgbToLinear(0),0);
 });
});

describe('Vector LCD app packaging',()=>{
 test('one version everywhere: engine, page, demo and offline worker',()=>{
  const html=read('index.html'),demo=read('demo.js'),worker=read('sw.js');
  assert.match(ENGINE_VERSION,/^\d+\.\d+\.\d+$/);
  assert.equal(html.match(/name="vector-lcd-version" content="([^"]+)"/)[1],ENGINE_VERSION);
  assert.equal(demo.match(/APP_VERSION='([^']+)'/)[1],ENGINE_VERSION);
  assert.equal(worker.match(/const VERSION='([^']+)'/)[1],ENGINE_VERSION);
 });
 test('every file the worker precaches exists, and every app file is precached',()=>{
  const worker=read('sw.js');
  const assets=[...worker.matchAll(/^ '\.\/([^']*)',?$/gm)].map(m=>m[1]);
  assert.ok(assets.includes(''));
  for(const asset of assets.filter(Boolean))assert.ok(fs.existsSync(appDir+asset),asset+' missing');
  const shipped=fs.readdirSync(appDir).filter(f=>!/^(sw\.js|README\.md)$/.test(f));
  for(const file of shipped)assert.ok(assets.includes(file),file+' is not precached');
 });
 test('manifest is installable on its own scope with 192 and 512 icons',()=>{
  const m=JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.start_url,'./');assert.equal(m.scope,'./');assert.equal(m.display,'standalone');
  assert.ok(m.name&&m.short_name);
  for(const size of ['192x192','512x512']){
   const icon=m.icons.find(i=>i.sizes===size&&i.type==='image/png');
   assert.ok(icon,size);assert.ok(fs.existsSync(appDir+icon.src.slice(2)));
  }
  assert.ok(m.icons.some(i=>i.purpose==='maskable'));
  assert.ok(!m.icons.some(i=>/any maskable|maskable any/.test(i.purpose)),'any and maskable are separate entries');
 });
});

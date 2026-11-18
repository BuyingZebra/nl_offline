import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {driveVoltage,equilibriumState,timeConstantMs,stepState,entryOffsetMm,shadowKernel,entryVector,reflectanceFromEntry,reflectance,PHYSICAL_LCD_VERSION}
 from '../vector-lcd/physical-lcd.js';
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

const TN=JSON.parse(read('profiles/reflective-tn.json'));
const luminance=rgb=>.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];

describe('Reflective TN profile: physics and datasheet agreement',()=>{
 test('every input names its source, and the panel values match the VI-402 datasheet',()=>{
  const s=TN.sources;
  assert.match(s.panel.ref,/ZD1886/);assert.match(s.polarizer.ref,/orientdisplay/);
  assert.ok(s.liquid_crystal.refs.length>=2);
  assert.deepEqual([s.panel.Vop_typ,s.panel.rise_ms_typ,s.panel.decay_ms_typ,s.panel.contrast_typ],[3,30,60,15]);
 });
 test('threshold equals the TN Freedericksz formula from the cited E7 constants',()=>{
  const L=TN.sources.liquid_crystal,eps0=8.8541878128e-12;
  const k=(L.K11_pN+(L.K33_pN-2*L.K22_pN)/4)*1e-12;
  near(TN.dynamics.Vth,Math.PI*Math.sqrt(k/(eps0*(L.eps_parallel-L.eps_perpendicular))),1e-4);
  // The computed director does not deform below threshold, and does above it.
  assert.ok(equilibriumState(TN,.8)<.05);assert.ok(equilibriumState(TN,1.6)>.5);
 });
 test('cell gap satisfies the Gooch-Tarry first maximum at 550 nm',()=>{
  near(2*TN.derived.cell_gap_um*TN.derived.dn_550/.55,Math.sqrt(3),1e-4);
 });
 test('director state rises monotonically with voltage',()=>{
  const a=TN.drive.a_equilibrium;
  assert.equal(a[0],0);
  for(let i=1;i<a.length;i++)assert.ok(a[i]>=a[i-1]);
 });
 test('optical contrast reproduces the datasheet 15:1',()=>{
  const on=equilibriumState(TN,TN.drive.Vop);
  const cr=luminance(reflectance(TN,0,0))/luminance(reflectance(TN,on,on));
  assert.ok(Math.abs(cr-15)<.3,'contrast '+cr);
 });
 test('simulated optical 10-90% times reproduce the datasheet response',()=>{
  const measure=(fromGray,toGray)=>{
   let a=equilibriumState(TN,driveVoltage(TN,fromGray));
   const y0=luminance(reflectance(TN,a,a)),target=equilibriumState(TN,driveVoltage(TN,toGray));
   const y1=luminance(reflectance(TN,target,target));
   let t=0,t10=null,t90=null;
   while(t<1000){a=stepState(TN,a,driveVoltage(TN,toGray),.05);t+=.05;
    const f=(luminance(reflectance(TN,a,a))-y0)/(y1-y0);
    if(t10===null&&f>=.1)t10=t;if(t90===null&&f>=.9){t90=t;break;}}
   return t90-t10;
  };
  assert.ok(Math.abs(measure(255,0)-30)<1.5,'rise '+measure(255,0));
  assert.ok(Math.abs(measure(0,255)-60)<1.5,'decay '+measure(0,255));
 });
 test('switching on is faster at higher voltage; switching off never uses the field',()=>{
  assert.ok(timeConstantMs(TN,3,.9,0)<timeConstantMs(TN,2,.8,0));
  assert.equal(timeConstantMs(TN,0,0,.9),TN.dynamics.tau_off_ms);
 });
 test('state steps give the same result at any frame rate',()=>{
  const run=(hz)=>{let a=0;for(let t=0;t<200-1e-9;t+=1000/hz)a=stepState(TN,a,3,1000/hz);return a;};
  near(run(30),run(120),1e-9);
 });
 test('static drive is on/off only; analog drive gets darker for darker content',()=>{
  assert.ok(TN.drive.static_by_gray.every(v=>v===0||v===TN.drive.Vop));
  const a=TN.drive.analog_by_gray;
  for(let i=1;i<256;i++)assert.ok(a[i]<=a[i-1]+1e-9);
  near(a[255],0,1e-6);near(a[0],TN.drive.Vop,1e-3);
 });
 test('reflector shadow: none under straight-on light; falls away from the light by Snell refraction',()=>{
  const z=entryOffsetMm(TN,0,0);near(z.x,0,1e-12);near(z.y,0,1e-12);
  const top=entryOffsetMm(TN,30,0);
  assert.ok(top.y<0&&Math.abs(top.x)<1e-12,'light from the top enters above the exit point');
  const g=TN.sources.geometry,s=Math.sin(Math.PI/6);
  near(-top.y,g.glass_mm*Math.tan(Math.asin(s/g.n_glass))+g.rear_polarizer_mm*Math.tan(Math.asin(s/g.n_polarizer)),1e-12);

 });
 test('soft shadows: the separable form reproduces the full optics table',()=>{
  assert.equal(TN.factor.rank,4);
  assert.ok(TN.factor.max_relative_error<.01,'factor error '+TN.factor.max_relative_error);
  const tableMax=Math.max(...TN.lut.linear_srgb);
  for(const [ai,ao] of [[0,0],[.5,.2],[.95,.95],[0,.95],[.95,0]]){
   const full=reflectance(TN,ai,ao),fact=reflectanceFromEntry(TN,entryVector(TN,ai),ao);
   for(let c=0;c<3;c++)near(fact[c],full[c],.01*tableMax,'a_in '+ai+' a_out '+ao);
  }
 });
 test('soft shadows: a point light gives a sharp shadow; a larger light widens it',()=>{
  const point=shadowKernel(TN,{angleDeg:30,azimuthDeg:0,sourceDeg:0});
  assert.equal(point.sigmaRadialMm,0);assert.equal(point.sigmaTangentialMm,0);
  const small=shadowKernel(TN,{angleDeg:30,azimuthDeg:0,sourceDeg:10});
  const big=shadowKernel(TN,{angleDeg:30,azimuthDeg:0,sourceDeg:40});
  assert.ok(big.sigmaRadialMm>small.sigmaRadialMm&&small.sigmaRadialMm>0);
  near(big.sigmaRadialMm/small.sigmaRadialMm,4,1e-6);
  // Straight-on light: no mean offset, and the spread is the same in every direction.
  const overhead=shadowKernel(TN,{angleDeg:0,azimuthDeg:0,sourceDeg:20});
  near(overhead.mean.x,0,1e-12);near(overhead.mean.y,0,1e-12);
  near(overhead.sigmaRadialMm,overhead.sigmaTangentialMm,1e-3);
  // The shadow's mean moves with the light direction.
  assert.deepEqual(Object.values(big.mean).map(v=>Math.sign(Math.round(v*1e9))),[0,-1]);
 });
});

describe('Vector LCD app packaging',()=>{
 test('one app version: page, demo and offline worker; the concept model keeps its own',()=>{
  const html=read('index.html'),app=read('tn-demo.js'),worker=read('sw.js');
  const v=html.match(/name="vector-lcd-version" content="([^"]+)"/)[1];
  assert.match(v,/^\d+\.\d+\.\d+$/);
  assert.equal(app.match(/APP_VERSION='([^']+)'/)[1],v);
  assert.equal(worker.match(/const VERSION='([^']+)'/)[1],v);
  assert.match(PHYSICAL_LCD_VERSION,/^\d+\.\d+\.\d+$/);
  const concept=read('concept.html'),demo=read('demo.js');
  assert.equal(concept.match(/name="vector-lcd-version" content="([^"]+)"/)[1],ENGINE_VERSION);
  assert.equal(demo.match(/APP_VERSION='([^']+)'/)[1],ENGINE_VERSION);
 });
 test('every precached file exists, and every shipped file is precached',()=>{
  const worker=read('sw.js');
  const assets=[...worker.matchAll(/^ '(\.{1,2}\/[^']*)',?$/gm)].map(m=>m[1]);
  assert.ok(assets.includes('./'));
  for(const asset of assets.filter(a=>a!=='./'))
   assert.ok(fs.existsSync(new URL(asset,'file://'+appDir).pathname),asset+' missing');
  const shipped=fs.readdirSync(appDir,{withFileTypes:true}).filter(e=>e.isFile()&&!/^(sw\.js|README\.md)$/.test(e.name)).map(e=>'./'+e.name)
   .concat(fs.readdirSync(appDir+'profiles').map(f=>'./profiles/'+f));
  for(const file of shipped)assert.ok(assets.includes(file),file+' is not precached');
 });
 test('the screen test uses the real game and the real tile files',()=>{
  const app=read('tn-demo.js');
  assert.match(app,/from '\.\.\/tetris\/game\.js'/);
  assert.match(app,/from '\.\.\/tetris\/assets\/tiles\/smooth-geometry\.mjs'/);
  assert.match(app,/'\.\.\/tetris\/assets\/tiles\/vector\/'/);
 });
 test('manifest is installable on its own scope with 192 and 512 icons',()=>{
  const m=JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.start_url,'./');assert.equal(m.scope,'./');assert.equal(m.display,'standalone');
  for(const size of ['192x192','512x512']){
   const icon=m.icons.find(i=>i.sizes===size&&i.type==='image/png');
   assert.ok(icon,size);assert.ok(fs.existsSync(appDir+icon.src.slice(2)));
  }
  assert.ok(m.icons.some(i=>i.purpose==='maskable'));
 });
});

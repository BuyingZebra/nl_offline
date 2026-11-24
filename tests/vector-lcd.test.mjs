import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {driveVoltage,equilibriumState,timeConstantMs,stepState,entryOffsetMm,shadowKernel,entryVector,reflectanceFromEntry,reflectance,VERSION as PHYSICAL_LCD_VERSION,
 passTransmission,reflectanceOblique,obliqueOptics,temperatureFactors}
 from '../vector-lcd/screens/tn/index.js';
import {glare,fresnelReflectance,directionVector,bezelShiftMm,bezelPenumbraMm,bezelLight}
 from '../vector-lcd/optics/room.js';
import {ENGINE_VERSION,DEFAULT_PARAMS as P,PARAM_RANGES,normalizeParams,electroOptic,switchingTimeMs,stepToward,
 stepPixel,visibleDarkness,reflectorShadowOffsetMm,shadowVectorMm,multiplexVoltages,srgbToLinear,driveColor}
 from '../vector-lcd/concept/vector-lcd.js';

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

const TN=JSON.parse(read('reference/reflective-tn.json'));   // the static-drive datasheet reference
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

describe('Reflective TN: viewing angle, glare and temperature',()=>{
 const normal={polarDeg:0,azimuthDeg:0};
 const aOn=()=>equilibriumState(TN,TN.drive.Vop);
 const Y=rgb=>luminance(rgb);
 test('oblique tables cover temperatures, directions, states and wavelengths',()=>{
  const [nT,nDir,A,L]=TN.oblique.table_shape;
  assert.deepEqual([nT,A,L],[TN.oblique.table_temps_C.length,TN.oblique.a_grid.length,TN.oblique.wavelengths_nm.length]);
  assert.equal(nDir,1+(TN.oblique.polars_deg.length-1)*TN.oblique.azimuths_deg.length);
  assert.equal(passTransmission(TN,0,0).length,A*L);
 });
 test('at normal incidence the per-pass product model matches the exact double pass',()=>{
  assert.ok(TN.oblique.product_model_error<.03,'product error '+TN.oblique.product_model_error);
  for(const [ai,ao] of [[0,0],[aOn(),aOn()],[.5,.5]])
   near(Y(reflectanceOblique(TN,ai,ao,normal,normal)),Y(reflectance(TN,ai,ao)),.03*Y(reflectance(TN,0,0)));
 });
 test('straight on, the oblique model keeps the datasheet 15:1 contrast',()=>{
  const cr=Y(reflectanceOblique(TN,0,0,normal,normal))/Y(reflectanceOblique(TN,aOn(),aOn(),normal,normal));
  assert.ok(Math.abs(cr-15)<.5,'contrast '+cr);
 });
 test('contrast falls off-axis, faster from the top than the bottom (a 6 o\'clock panel)',()=>{
  const cr=az=>{const d={polarDeg:45,azimuthDeg:az};
   return Y(reflectanceOblique(TN,0,0,d,d))/Y(reflectanceOblique(TN,aOn(),aOn(),d,d));};
  const straight=Y(reflectanceOblique(TN,0,0,normal,normal))/Y(reflectanceOblique(TN,aOn(),aOn(),normal,normal));
  assert.ok(cr(0)<straight&&cr(180)<straight);
  assert.ok(cr(0)<cr(180),'top '+cr(0)+' bottom '+cr(180));
  const c=TN.oblique.viewing_cone_CR2_deg;
  assert.ok(c.top<c.bottom,'computed cone narrower at the top');
  assert.deepEqual(TN.sources.geometry.design_comparison_cone_CR2_deg.datasheet,{bottom:70,top:35,left:70,right:70});
 });
 test('runtime separable optics stay within 1% for tilted light and eye',()=>{
  for(const [l,v] of [[{polarDeg:30,azimuthDeg:315},normal],[{polarDeg:40,azimuthDeg:0},{polarDeg:30,azimuthDeg:180}]]){
   const o=obliqueOptics(TN,l,v);
   assert.ok(o.error<.01,'error '+o.error);
  }
 });
 test('glare: Fresnel 4% straight on, peaks in the mirror direction, gone far from it',()=>{
  near(fresnelReflectance(0),.04,1e-9);
  assert.ok(fresnelReflectance(1.2)>fresnelReflectance(.3));
  const light={angleDeg:20,azimuthDeg:0,sourceDeg:20};
  const mirror=directionVector(20,180),straight=[0,0,1];
  assert.ok(glare(TN,mirror,light)>glare(TN,straight,light));
  assert.ok(glare(TN,directionVector(60,90),light)<1e-6);
  // A wider light spreads the same reflection over more angles: lower peak.
  assert.ok(glare(TN,mirror,{...light,sourceDeg:40})<glare(TN,mirror,light));
 });
 test('temperature: measured viscosity slows the crystal when cold and speeds it when warm',()=>{
  near(temperatureFactors(TN,25).tauScale,1,1e-9);
  assert.ok(temperatureFactors(TN,15).tauScale>1.4&&temperatureFactors(TN,40).tauScale<.7);
  const step=c=>stepState(TN,0,TN.drive.Vop,20,c);
  assert.ok(step(15)<step(25)&&step(25)<step(40));
  // Birefringence changes the optics too.
  const a=passTransmission(TN,0,0,15),b=passTransmission(TN,0,0,40);
  assert.ok(a.some((v,i)=>Math.abs(v-b[i])>.01));
 });
});

describe('Reflective TN: bezel shadow',()=>{
 const panel={w:48,h:92},lip=1;
 test('no shift under straight-on light; under angled light the shift points toward the light',()=>{
  const z=bezelShiftMm(TN,{angleDeg:0,azimuthDeg:0},lip);near(z.x,0,1e-12);near(z.y,0,1e-12);
  const top=bezelShiftMm(TN,{angleDeg:45,azimuthDeg:0},lip);
  assert.ok(top.y<0&&Math.abs(top.x)<1e-12);
  const g=TN.sources.geometry,s=Math.sin(Math.PI/4);
  near(-top.y,g.glass_mm*Math.tan(Math.asin(s/g.n_glass))+g.rear_polarizer_mm*Math.tan(Math.asin(s/g.n_polarizer))+lip,1e-9);
 });
 test('edges facing the light are shaded; the middle and the far edges are not',()=>{
  const light={angleDeg:45,azimuthDeg:315,sourceDeg:15};
  assert.ok(bezelLight(TN,{x:24,y:46},panel,light,lip)>.999);
  assert.ok(bezelLight(TN,{x:24,y:.3},panel,light,lip)<.05,'top edge shaded');
  assert.ok(bezelLight(TN,{x:.3,y:46},panel,light,lip)<.05,'left edge shaded');
  assert.ok(bezelLight(TN,{x:24,y:91.7},panel,light,lip)>.999,'bottom edge lit');
  assert.ok(bezelLight(TN,{x:47.7,y:46},panel,light,lip)>.999,'right edge lit');
 });
 test('a larger light softens the bezel shadow edge',()=>{
  const a=bezelPenumbraMm(TN,{angleDeg:45,azimuthDeg:0,sourceDeg:5},lip),b=bezelPenumbraMm(TN,{angleDeg:45,azimuthDeg:0,sourceDeg:30},lip);
  assert.ok(b>a&&a>0);near(b/a,6,1e-6);
 });
});

describe('Reflective TN, multiplexed 1/4 duty',()=>{
 const MUX=JSON.parse(read('profiles/reflective-tn-mux4.json'));
 test('same cell and optics as the static panel; only the drive differs',()=>{
  assert.equal(MUX.oblique.table_float32_base64,TN.oblique.table_float32_base64);
  assert.deepEqual(MUX.drive.a_equilibrium,TN.drive.a_equilibrium);
  assert.deepEqual(MUX.dynamics,TN.dynamics);
  assert.ok(MUX.drive.uses_electrode_map&&!TN.drive.uses_electrode_map);
 });
 test('rms voltages follow the 1/4 duty, 1/3 bias drive formula',()=>{
  const {vlcd,on_voltage:on,off_voltage:off}=MUX.drive;
  near(on,vlcd*Math.sqrt(1/4+3/(4*9)),1e-4);near(off,vlcd*Math.sqrt((1/3)**2/4+3/(4*9)),1e-4);
  near(on/off,Math.sqrt(3),1e-4);
  assert.ok(MUX.drive.static_by_gray.every(v=>Math.abs(v-on)<1e-5||Math.abs(v-off)<1e-5));
 });
 test('the supply is this cell\'s contrast optimum, and unlit segments are faintly visible',()=>{
  // The Lumex LCD-S401M16KR drawing: 3.0 V AC, 1/4 duty, 1/3 bias, 1.10 mm glass plates.
  // 3.0 V suits Lumex's own crystal; the E7 stand-in is driven at its optimum.
  assert.equal(MUX.derived.vlcd_datasheet_V,3);
  assert.equal(MUX.drive.vlcd,MUX.derived.vlcd_optimum_V);
  assert.ok(MUX.derived.contrast_final>MUX.derived.contrast_at_datasheet_V,'the optimum beats the datasheet voltage on this cell');
  assert.deepEqual(MUX.sources.panel_multiplexed.glass_mm,[1.1,1.1]);
  assert.equal(TN.sources.geometry.glass_mm,1.1);
  const Yd=a=>luminance(reflectance(MUX,a,a)),cr=v=>Yd(equilibriumState(MUX,v*0.3333))/Yd(equilibriumState(MUX,v*0.5774));
  const opt=MUX.derived.vlcd_optimum_V;
  assert.ok(cr(opt)>=cr(opt-.3)&&cr(opt)>=cr(opt+.3),'reported optimum is a contrast peak');
  assert.ok(MUX.derived.contrast_final<TN.derived.contrast_final,'multiplexing costs contrast');
  const ghost=MUX.derived.luminance_off_segment/MUX.derived.luminance_off;
  assert.ok(ghost<.99&&ghost>.9,'unlit segment faintly darker than the background: '+ghost);
 });
});

describe('DMG-01 STN (Retro Display Lab data, fine panel without the DMG grid)',async()=>{
 const D=JSON.parse(read('profiles/dmg-01-stn.json'));
 const M=await import('../vector-lcd/screens/dmg/index.js');
 test('carries the source, licence and notice',()=>{
  assert.equal(D.attribution.license,'Apache-2.0');
  assert.match(D.attribution.url,/github\.com\/JohnnySun\/retro-display-lab/);
  assert.ok(fs.existsSync(appDir+'third_party/retro-display-lab/LICENSE'));
  assert.match(read('third_party/retro-display-lab/NOTICE'),/Copyright 2026 JohnnySun/);
 });
 test('the measured BGB palette and table sizes',()=>{
  assert.deepEqual(D.palette.srgb8.shades,[[117,152,51],[88,143,81],[59,117,96],[46,97,90]]);
  assert.equal(D.stn.drift_per_frame.length,D.contrast.conditions.length*4*D.stn.director_bins);
  assert.equal(D.stn.target_q.length,D.contrast.conditions.length*4);
  assert.equal(D.panel.refresh_hz,59.7275);
 });
 test('art maps to four drive levels like the DMG source',()=>{
  assert.equal(M.shadeFromRGB(1,1,1),0);assert.equal(M.shadeFromRGB(0,0,0),3);
  assert.equal(M.shadeFromRGB(142/255,142/255,142/255),1);assert.equal(M.shadeFromRGB(.3,.3,.3),2);
 });
 test('at the nominal contrast each shade settles on its palette position',()=>{
  [0,1,2,3].forEach(s=>near(M.opticalState(D,M.targetQ(D,s,1)),.25*(s+1),2e-3));
  // The equilibrium is a fixed point of the drift.
  [0,1,2,3].forEach(s=>assert.ok(Math.abs(M.driftPerFrame(D,s,M.targetQ(D,s,1),1))<1e-6));
 });
 test('palette colours are the measured ones at each shade',()=>{
  const enc=v=>Math.round(255*(v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055));
  D.palette.srgb8.shades.forEach((rgb,s)=>assert.deepEqual(M.opticalColor(D,.25*(s+1)).map(enc),rgb));
 });
 test('the crystal takes several frames to switch, slower when cold',()=>{
  const run=(from,to,celsius)=>{let st={q:M.targetQ(D,from),ionic:0,shade:from},n=0;
   while(Math.abs(M.opticalState(D,st.q)-.25*(to+1))>.1*.75&&n<600){st=M.stepFrame(D,st,to,{celsius});n++;}return n;};
  const warm=run(0,3,20),cold=run(0,3,10);
  assert.ok(warm>=2&&warm<=20,'darkening frames at 20 C: '+warm);
  assert.ok(cold>warm,'cold is slower: '+cold+' vs '+warm);
  assert.ok(run(3,0,20)>=2);
 });
 test('response matches the era\'s published STN figures: about 150 ms per change, 10–90%, at 25 °C',()=>{
  const FR=1000/D.panel.refresh_hz,settle=s=>{let x={q:M.canonicalQ(D,.25*(s+1)),ionic:s/3,shade:s};for(let i=0;i<2000;i++)x=M.stepFrame(D,x,s,{celsius:25});return x;};
  const times=[];
  for(let a=0;a<4;a++)for(let b=0;b<4;b++){if(a===b)continue;
   let x=settle(a);const y=settle(b),s0=M.displayedState(D,x.q,x.ionic,a),s1=M.displayedState(D,y.q,y.ionic,b);
   let t10=null,t90=null;for(let i=0;i<300&&t90===null;i++){x=M.stepFrame(D,x,b,{celsius:25});const f=(x.exposure-s0)/(s1-s0);
    if(t10===null&&f>=.1)t10=i;if(f>=.9)t90=i;}
   times.push((t90-t10+1)*FR);}
  const mean=times.reduce((s,t)=>s+t,0)/times.length;
  near(mean,D.sources.response.target_ms,15,'mean 10–90% '+mean.toFixed(0)+' ms');
  times.forEach(t=>assert.ok(t>=100&&t<=210,'every change within the period range: '+t.toFixed(0)+' ms'));
  assert.ok(D.temperature.response_scale<1,'slowed from the source tables, labelled');
 });
 test('LCD off: the panel relaxes to the measured disabled colour, and back when switched on',()=>{
  let st={q:M.targetQ(D,3),ionic:0,shade:3};
  for(let i=0;i<60;i++)st=M.stepFrame(D,st,3,{celsius:25,power:false});
  assert.ok(st.unpowered>.99,'relaxed after a second: '+st.unpowered);
  assert.ok(Math.abs(st.exposure)<.01,'shows optical state 0: '+st.exposure);
  const enc=v=>Math.round(255*(v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055));
  assert.deepEqual(M.opticalColor(D,0).map(enc),D.palette.srgb8.disabled);
  for(let i=0;i<120;i++)st=M.stepFrame(D,st,3,{celsius:25,power:true});
  assert.ok(st.unpowered<.01,'back on: '+st.unpowered);
  near(st.exposure,1,.02,'black again');
  assert.ok(M.powerTauS(D,10)>M.powerTauS(D,30),'slower when cold');
 });
 test('screen lens: three parallel surfaces mirror the light, about 11% straight on',()=>{
  near(M.lensReflectance(D,1),.109,.002);
  near(M.lensReflectance({...D,lens:null},1),.04,.001);
  assert.ok(M.lensReflectance(D,Math.cos(Math.PI/4))>M.lensReflectance(D,1));
 });
 test('holding a dark image leaves a faint sticking ghost',()=>{
  let st={q:M.targetQ(D,3),ionic:0,shade:3};
  for(let i=0;i<180*60;i++)st=M.stepFrame(D,st,3);
  for(let i=0;i<60;i++)st=M.stepFrame(D,st,0);
  const ghost=st.exposure-.25;
  assert.ok(ghost>0&&ghost<.25*.1,'ghost below a tenth of a shade: '+ghost);
 });
 test('the wheel is solved every 0.01 over the measured range, ×0.85 to ×1.08',()=>{
  const C=D.contrast.conditions;
  assert.equal(C[0],.85);assert.equal(C.at(-1),1.08);assert.equal(D.contrast.min,.85);assert.equal(D.contrast.max,1.08);
  C.slice(1).forEach((c,i)=>near(c-C[i],.01,1e-9));
 });
 test('the wheel fades the picture in gradually and darkens it without flattening the shades',()=>{
  const shades=c=>[0,1,2,3].map(s=>M.opticalState(D,M.targetQ(D,s,c)));
  const spread=c=>{const s=shades(c);return s[3]-s[0];};
  // Washed out at the low end: every shade lighter than nominal white, no picture.
  assert.ok(shades(.85).every(v=>v<.25)&&spread(.85)<.02,'washed out at 0.85: '+shades(.85));
  // A 1% turn keeps most of the picture (the old three-point tables blanked it).
  assert.ok(spread(.99)>.75*spread(1),'0.99 keeps the picture: '+spread(.99));
  // The picture grows steadily from 0.94 to its peak at 0.99: just under the nominal
  // drive the white is lightest (the solver's brightening near threshold), so the
  // contrast peaks a step below nominal.
  for(let c=.94;c<.985;c+=.01)assert.ok(spread(c+.01)>spread(c)-1e-9,'fades in at '+c.toFixed(2));
  assert.ok(spread(.99)>=spread(1),'contrast peaks at 0.99');
  // Turning up darkens white past nominal black, but the shades stay apart.
  const hi=shades(1.08);
  assert.ok(hi[0]>.75&&hi.every((v,i)=>!i||v>hi[i-1]+.1),'1.08 dark but distinct: '+hi);
  assert.ok(M.opticalColor(D,hi[3]).every((v,i)=>v<M.opticalColor(D,1)[i]),'darker than nominal black');
 });
 test('after any wheel and picture history, ×1.00 brings every shade back within 2 s (no pixel stays stuck)',()=>{
  let seed=1;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let trial=0;trial<60;trial++){
   let st={q:M.targetQ(D,0,1),ionic:0,shade:0},c=1;
   for(let f=0;f<900;f++){
    if(rand()<.05)c=.85+rand()*.23;
    st=M.stepFrame(D,st,rand()<.1?Math.floor(rand()*4):st.shade,{contrast:c,celsius:10+rand()*20});
   }
   for(let s=0;s<4;s++){
    let x={...st};for(let f=0;f<120;f++)x=M.stepFrame(D,x,s,{contrast:1,celsius:25});
    near(M.opticalState(D,x.q),.25*(s+1),.01,'trial '+trial+' shade '+s);
   }
  }
 });
 test('a fully relaxed pixel (left by a low wheel) switches within about a second at ×1.00 (scaled by the era response)',()=>{
  for(let s=0;s<4;s++){
   let x={q:0,ionic:0,shade:0},f=0;
   while(Math.abs(M.opticalState(D,x.q)-.25*(s+1))>.025&&f<600){x=M.stepFrame(D,x,s,{contrast:1,celsius:25});f++;}
   assert.ok(f<60/D.temperature.response_scale,'shade '+s+' took '+f+' frames');
  }
 });
 test('two passes through one state give the measured palette exactly',()=>{
  [0,.25,.5,.75,1,.4,.9].forEach(s=>{
   const t=M.passTransmission(D,s),c=M.opticalColor(D,s);
   t.forEach((v,i)=>near(v*v,c[i],1e-12));
   M.reflectedColor(D,s,t).forEach((v,i)=>near(v,c[i],1e-12));
  });
 });
 test('reflector shadow: light that entered through a darker dot leaves darker',()=>{
  const light=M.reflectedColor(D,.25,M.passTransmission(D,.25));
  const shaded=M.reflectedColor(D,.25,M.passTransmission(D,1));
  // By luminance: the palette's darker shades are bluer, so the shadow shifts hue too.
  const Y=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
  assert.ok(Y(shaded)<Y(light));
  // Between the two flat colours: a shadow, not a second copy of the shape.
  assert.ok(Y(shaded)>Y(M.opticalColor(D,1)));
 });
 test('reflector shadow follows the light: none overhead, toward the light, longer when lower',()=>{
  // The same refraction geometry as the TN screens (optics/room.js).
  const at=(angleDeg,azimuthDeg)=>shadowKernel(D,{angleDeg,azimuthDeg,sourceDeg:15}).mean;
  const o=at(0,315);near(Math.hypot(o.x,o.y),0,1e-12);
  const ul=at(45,315);assert.ok(ul.x<0&&ul.y<0,'light from the upper left enters up and left of where it leaves');
  const br=at(45,135);near(br.x,-ul.x,1e-12);near(br.y,-ul.y,1e-12);
  assert.ok(Math.hypot(...Object.values(at(60,315)))>Math.hypot(ul.x,ul.y));
 });
});

describe('Green phosphor CRT (IBM 5151, P39)',async()=>{
 const C=JSON.parse(read('profiles/crt-5151-p39.json'));
 const M=await import('../vector-lcd/screens/crt/index.js');
 const F=await import('../vector-lcd/content/four-tone.js');
 test('MDA timing gives the 5151\'s 18.432 kHz and 50 Hz with 350 lines',()=>{
  const T=C.timing;
  near(T.horizontal_hz,18432,1);near(T.refresh_hz,49.82,.01);
  assert.equal(T.lines_visible,350);assert.equal(T.lines_total,370);
  near(T.frame_s,T.lines_total*T.line_s,1e-9);
 });
 test('four TTL levels from video 2/3 and intensity 1/3',()=>{
  assert.deepEqual(C.drive.levels.map(v=>Math.round(v*3)),[0,1,2,3]);
  assert.equal(M.levelFromRGB(1,1,1),0);assert.equal(M.levelFromRGB(0,0,0),3);
 });
 test('P39 colour and afterglow match the sources',()=>{
  assert.deepEqual(C.phosphor.cie_xy,[.205,.715]);
  const t10=M.decayTime(C,.1);
  assert.ok(t10>=.1&&t10<=1,'JEDEC long class: 100 ms to 1 s, got '+t10);
  // The fitted response reproduces the measured 30 Hz ripple ratio (peak-to-peak / mean).
  const f=30,N=20000,dt=4/N;let re=0,im=0,mean=0;
  for(let i=0;i<N;i++){const t=i*dt,h=M.impulse(C,t);re+=h*Math.cos(2*Math.PI*f*t)*dt;im+=h*Math.sin(2*Math.PI*f*t)*dt;mean+=h*dt;}
  near(4*Math.hypot(re,im)/mean,C.phosphor.ripple_30hz,.01);
  // Slow build-up (the reason P39 could not drive a light pen).
  assert.ok(C.phosphor.derived.peak_after_s>.005);
 });
 test('a steady image shows its drive level at every point of the scan',()=>{
  for(const phase of [0,.1,.5,.9])near(M.steadyWindow(C,.6667,phase*C.timing.frame_s),.6667,1e-3);
 });
 test('scanlines: the spot is narrower than the line pitch',()=>{
  const ratio=C.spot.sigma_mm/C.raster.pitch_mm;
  assert.ok(ratio>.1&&ratio<.2,'sigma/pitch '+ratio);
  near(C.spot.sigma_mm,C.raster.height_mm/1300/2,1e-6);
 });
 test('halation and room light stay small and physical',()=>{
  assert.ok(C.faceplate.halation.total>0&&C.faceplate.halation.total<.05);
  near(C.faceplate.surface_reflectance,((1.52-1)/2.52)**2,1e-6);
  assert.ok(M.adaptedExposure(C)>0&&M.adaptedExposure(C)<1);
  assert.deepEqual(M.displayColor(0,0),[0,0,0]);
  assert.equal(M.displayColor(.5,0)[0],0,'P39 drives only the display green');
 });
 test('4-tone tiles keep each tile\'s tone order',()=>{
  const S=fs.readFileSync(new URL('../tetris/assets/tiles/vector/S.svg',import.meta.url),'utf8');
  const out=[...F.fourToneSVG(S).matchAll(/rgb\((\d+)/g)].map(m=>Number(m[1]));
  assert.deepEqual(out,[85,170,170,0,0,0]);
  assert.ok(out.every(v=>[0,85,170,255].includes(v)));
 });
});

describe('Vector LCD app packaging',()=>{
 test('one app version: page, demo and offline worker; the concept model keeps its own',()=>{
  const html=read('index.html'),app=read('app/main.js'),worker=read('sw.js');
  const v=html.match(/name="vector-lcd-version" content="([^"]+)"/)[1];
  assert.match(v,/^\d+\.\d+\.\d+$/);
  assert.equal(app.match(/APP_VERSION\s*=\s*'([^']+)'/)[1],v);
  assert.equal(worker.match(/const VERSION\s*=\s*'([^']+)'/)[1],v);
  assert.match(PHYSICAL_LCD_VERSION,/^\d+\.\d+\.\d+$/);
  const concept=read('concept/concept.html'),demo=read('concept/demo.js');
  assert.equal(concept.match(/name="vector-lcd-version" content="([^"]+)"/)[1],ENGINE_VERSION);
  assert.equal(demo.match(/APP_VERSION='([^']+)'/)[1],ENGINE_VERSION);
 });
 test('every precached file exists, and every shipped file is precached',()=>{
  const worker=read('sw.js');
  const assets=[...worker.matchAll(/^ '(\.{1,2}\/[^']*)',?$/gm)].map(m=>m[1]);
  assert.ok(assets.includes('./'));
  for(const asset of assets.filter(a=>a!=='./'))
   assert.ok(fs.existsSync(new URL(asset,'file://'+appDir).pathname),asset+' missing');
  const walk=dir=>fs.readdirSync(appDir+dir,{withFileTypes:true})
   .flatMap(e=>e.isDirectory()?walk(dir+e.name+'/'):['./'+dir+e.name]);
  const shipped=fs.readdirSync(appDir,{withFileTypes:true}).filter(e=>e.isFile()&&!/^(sw\.js|README\.md)$/.test(e.name)).map(e=>'./'+e.name)
   .concat(...['app/','gpu/','optics/','screens/','content/','concept/','profiles/','vector/'].map(walk),['./third_party/retro-display-lab/NOTICE'],
    walk('fonts/').filter(f=>f.endsWith('.woff')));
  for(const file of shipped)assert.ok(assets.includes(file),file+' is not precached');
 });
 test('text uses only the bundled fonts, each with its licence',()=>{
  const html=read('index.html');
  assert.match(html,/--mono:"Vector Mono",monospace;/);
  assert.doesNotMatch(html,/system-ui|ui-monospace|Menlo|Consolas/);
  assert.match(read('content/tetris.js'),/COUNTER_FONT = '700 3\.2px "Vector Mono",monospace'/);
  for(const f of ['DejaVuSansMono.woff','DejaVuSansMono-Bold.woff','Inter-Regular.woff'])assert.ok(fs.existsSync(appDir+'fonts/'+f),f);
  assert.match(read('fonts/Inter-LICENSE.txt'),/SIL Open Font License, Version 1\.1/);
  assert.match(read('fonts/DejaVu-LICENSE.txt'),/Bitstream/);
 });
 test('the screen test uses the real game and the real tile files',()=>{
  const tetris=read('content/tetris.js'),tiles=read('content/tiles.js');
  assert.match(tetris,/from '\.\.\/\.\.\/tetris\/game\.js'/);
  assert.match(tiles,/from '\.\.\/\.\.\/tetris\/assets\/tiles\/smooth-geometry\.mjs'/);
  assert.match(tiles,/'\.\.\/\.\.\/tetris\/assets\/tiles\/vector\/'/);
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

describe('Vector LCD structure: screen kinds, definitions and profiles',async()=>{
 const {SCREENS,KINDS,FAMILIES}=await import('../vector-lcd/app/screens.js');
 const profileOf=screen=>JSON.parse(read('profiles/'+(screen.profile??screen.id)+'.json'));
 // What a definition may ask of a renderer when building the Info tab.
 const fakeRenderer={bezelLipMm:1,lighting:{angleDeg:45,azimuthDeg:315,sourceDeg:15},info:()=>({retention:true,dotsPerPixel:2,dotPitchUm:48,pointsPerPixel:2})};

 test('every kind has one public entry with a version, a renderer, a profile check and a definition',()=>{
  for(const [name,kind] of Object.entries(KINDS)){
   assert.match(kind.VERSION,/^\d+\.\d+\.\d+$/,name);
   for(const fn of ['createRenderer','checkProfile'])assert.equal(typeof kind[fn],'function',name+'.'+fn);
   for(const key of ['tiles','usesElectrodes','prepare','device','deviceNote','roomLight','roomNote','temperatureRange','temperatureNote','lightNote','driveNote','facts'])
    assert.ok(key in kind.definition,name+' definition lacks '+key);
  }
 });
 test('every screen names a known kind and family, and its profile passes that kind\'s check',()=>{
  const ids=new Set();
  for(const screen of SCREENS){
   assert.ok(KINDS[screen.kind],screen.id+' kind');
   assert.ok(FAMILIES[screen.family],screen.id+' family');
   assert.ok(!ids.has(screen.id),'duplicate '+screen.id);ids.add(screen.id);
   assert.equal(screen.sub.length,2,screen.id+' sub lines');
   const P=KINDS[screen.kind].checkProfile(profileOf(screen));
   assert.equal(P.profile,screen.profile??screen.id);
  }
 });
 test('a profile missing a field is refused, naming the field',()=>{
  const P=profileOf(SCREENS.find(s=>s.kind==='crt'));
  delete P.timing.frame_s;
  assert.throws(()=>KINDS.crt.checkProfile(P),/timing\.frame_s/);
  assert.throws(()=>KINDS.tn.checkProfile({}),/drive\.voltages/);
 });
 test('device controls start inside their range and describe their value',()=>{
  for(const screen of SCREENS){
   const P=profileOf(screen);
   for(const c of KINDS[screen.kind].definition.device(P)){
    assert.ok(c.min<c.max&&c.step>0,screen.id+' '+c.key+' range');
    assert.ok(c.initial>=c.min&&c.initial<=c.max,screen.id+' '+c.key+' initial '+c.initial);
    for(const v of [c.min,c.initial,c.max])assert.equal(typeof c.format(v),'string');
    assert.equal(typeof c.apply,'function');
   }
  }
 });
 test('only real device controls: the trim on the Lumex, the wheel on the DMG-01, none on the Game Boy Color, two knobs on the 5151',()=>{
  const keys=id=>{const s=SCREENS.find(x=>x.id===id);return KINDS[s.kind].definition.device(profileOf(s)).map(c=>c.key);};
  assert.deepEqual(keys('cgb-001-tft'),[]);
  assert.deepEqual(keys('reflective-tn-mux4'),['vlcd']);
  assert.deepEqual(keys('dmg-01-stn'),['contrast']);
  assert.deepEqual(keys('crt-5151-p39'),['brightness','contrast']);
 });
 test('the VLCD trim scales both segment voltages by their datasheet fractions',()=>{
  const s=SCREENS.find(x=>x.id==='reflective-tn-mux4'),P=profileOf(s),[trim]=KINDS.tn.definition.device(P);
  let gain=null;trim.apply({setDriveGain:g=>{gain=g;}},P.derived.vlcd_V);
  near(gain,1,1e-12,'default trim is the profile drive');
  near(P.derived.on_rms_V/P.derived.vlcd_V,Math.sqrt(1/4+3/(4*9)),1e-3,'1/4 duty, 1/3 bias on');
  near(P.derived.off_rms_V/P.derived.vlcd_V,Math.sqrt(1/(4*9)+3/(4*9)),1e-3,'1/4 duty, 1/3 bias off');
 });
 test('every Info list is label/value text',()=>{
  for(const screen of SCREENS){
   const def=KINDS[screen.kind].definition,P=profileOf(screen);
   for(const row of def.facts(P,fakeRenderer)){
    assert.equal(row.length,2);
    for(const cell of row)assert.ok(typeof cell==='string'&&cell.length&&!/undefined|NaN/.test(cell),screen.id+': '+row);
   }
   assert.ok(def.driveNote(P).length&&def.deviceNote(P).length);
  }
 });
});

describe('P3 amber CRT',async()=>{
 const P=JSON.parse(read('profiles/crt-5151-p3.json'));
 const P39=JSON.parse(read('profiles/crt-5151-p39.json'));
 const M=await import('../vector-lcd/screens/crt/index.js');
 test('the same monitor as the P39 profile: only the phosphor differs',()=>{
  for(const key of ['timing','drive','spot','raster','faceplate','luminance','controls','sources','oblique'])
   assert.deepEqual(P[key],P39[key],key);
  M.checkProfile(P);
 });
 test('one exponential, 13 ms to 10 %, as published (and close to RCA\'s 12.5 ms)',()=>{
  assert.equal(P.phosphor.impulse.taus_s.length,1);
  const t10=M.decayTime(P,.1);
  assert.ok(Math.abs(t10-.013)<2e-4,'t10 '+t10);
  near(P.phosphor.impulse.amplitudes[0]*P.phosphor.impulse.taus_s[0],1,1e-6);
 });
 test('colour: amber, computed from the published band (602 nm peak, 10 % at 504 and 700 nm)',()=>{
  const [x,y]=P.phosphor.cie_xy,d=P.phosphor.derived;
  assert.ok(x>.5&&x<.56&&y>.43&&y<.48,'amber region '+x+', '+y);
  assert.ok(d.dominant_wavelength_nm>=580&&d.dominant_wavelength_nm<=595,'dominant '+d.dominant_wavelength_nm);
  near(d.band_sigma_nm,98/Math.sqrt(2*Math.log(10)),1e-3);
  assert.ok(d.colour_uncertainty_xy>0,'the alternative band shape is recorded');
 });
 test('just outside sRGB (blue slightly negative); shown in gamut at its true luminance',()=>{
  const rgb=P.phosphor.layers[0].display_rgb_per_Y;
  near(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],1,2e-3);
  assert.ok(rgb[2]<0&&rgb[2]>-.2);
  const shown=M.intoGamut(rgb);
  assert.ok(Math.min(...shown)>=-1e-12);near(.2126*shown[0]+.7152*shown[1]+.0722*shown[2],1,2e-3);
 });
 test('a steady image shows its drive level at every phase of the scan',()=>{
  for(const phase of [0,.1,.5,.9])near(M.steadyWindow(P,.6667,phase*P.timing.frame_s),.6667,1e-3);
 });
});

describe('Room brightness (CRT surroundings)',async()=>{
 const {SCREENS,KINDS}=await import('../vector-lcd/app/screens.js');
 const C=await import('../vector-lcd/screens/crt/index.js');
 test('only screens that make their own light have it: every CRT, no reflective LCD',()=>{
  for(const s of SCREENS){
   const room=KINDS[s.kind].definition.roomLight(JSON.parse(read('profiles/'+(s.profile??s.id)+'.json')));
   assert.equal(Boolean(room),['crt','vector'].includes(s.kind),s.id);   // screens that make their own light
  }
 });
 test('the room scales only the reflection, from dark to office light, and the profile\'s own room is unchanged',()=>{
  const P=JSON.parse(read('profiles/crt-5151-p39.json'));
  assert.equal(C.roomScale(P,P.luminance.room_lux),1);
  assert.equal(C.roomScale(P,0),0);
  near(C.roomScale(P,500),500/P.luminance.room_lux,1e-12);
  const room=KINDS.crt.definition.roomLight(P);
  assert.ok(room.min===0&&room.max>=500&&room.initial===P.luminance.room_lux);
 });
});

describe('Spot blooming (Philips T16, Fig. 5)',async()=>{
 const C=await import('../vector-lcd/screens/crt/index.js');
 const trace=JSON.parse(fs.readFileSync(new URL('../vector-lcd/tools/philips-m31-line-width.json',import.meta.url),'utf8'));
 const profiles=['crt-5151-p39','crt-5151-p3'].map(id=>JSON.parse(read('profiles/'+id+'.json')));
 const P39=profiles[0],B=P39.spot.bloom;
 test('the power law reproduces the traced line widths at the assumed 45 V within 3 %',()=>{
  const at=I=>{const c=trace.curves[I];let i=0;while(c.vkr_V[i+1]<45)i++;const f=(45-c.vkr_V[i])/(c.vkr_V[i+1]-c.vkr_V[i]);return c.line_width_mm[i]+f*(c.line_width_mm[i+1]-c.line_width_mm[i]);};
  const I=['50','75','100','200'],logs=I.map(i=>Math.log(at(i))-B.power*Math.log(Number(i)));
  const c=logs.reduce((a,b)=>a+b,0)/logs.length;           // the fitted law's constant
  for(const k of logs)assert.ok(Math.abs(k-c)<.03,'misfit '+(k-c));
  assert.ok(B.power>=B.power_range_30_60V[0]&&B.power<=B.power_range_30_60V[1]);
 });
 test('the same tube for every phosphor; brighter signals make wider spots, by the measured power',()=>{
  for(const P of profiles){
   assert.deepEqual(P.spot,P39.spot);
   near(C.spotSigmaMm(P,1)/C.spotSigmaMm(P,1/3),3**B.power,1e-9);
   assert.ok(C.spotSigmaMm(P,.1)===C.spotSigmaMm(P,B.min_drive_fraction),'held below the measured range');
  }
 });
 test('a less efficient phosphor needs more current, so its full-drive spot is wider than the W test spot',()=>{
  near(P39.phosphor.efficiency_vs_P4,.75,1e-9);
  for(const P of profiles){
   const ratio=C.spotSigmaMm(P,1)/P.spot.sigma_mm;
   near(ratio,(1/P.phosphor.efficiency_vs_P4)**B.power,1e-9);
   assert.ok(ratio>1&&ratio<1.2,P.profile+' '+ratio);
  }
 });
});

describe('CRT etched front: the room light\'s reflection (Nuijs & Horikx 1994)',async()=>{
 const C=await import('../vector-lcd/screens/crt/index.js'),R=await import('../vector-lcd/optics/room.js');
 const P=JSON.parse(read('profiles/crt-5151-p39.json')),E=P.faceplate.etch;
 test('Philips etched glass: gloss 69, specular 0.014; the lobe holds the rest of the gloss aperture\'s flux',()=>{
  assert.equal(E.gloss,69);assert.equal(E.specular_fraction,.014);
  const erf=x=>{const t=1/(1+.3275911*Math.abs(x)),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return Math.sign(x)*y;};
  const s=E.lobe_sigma_deg*Math.SQRT2,inside=erf(2.2/s)*erf(5.85/s);
  near(E.specular_fraction+(1-E.specular_fraction)*inside,.69,2e-3);
  assert.ok(E.lobe_sigma_deg>1.5&&E.lobe_sigma_deg<3,'a few degrees: '+E.lobe_sigma_deg);
 });
 test('the reflection follows the light: bright toward the mirror direction, gone far from it',()=>{
  const light={angleDeg:20,azimuthDeg:315,sourceDeg:15};
  const L=R.directionVector(20,315),mirrorEye=[-L[0],-L[1],L[2]];
  const at=C.faceGlare(P,mirrorEye,light),straight=C.faceGlare(P,[0,0,1],light),far=C.faceGlare(P,[0,0,1],{...light,angleDeg:60});
  assert.ok(at>straight&&straight>far*10,'mirror '+at+', straight '+straight+', 60 degrees away '+far);
  // the etch only softens a 15-degree lamp: its peak is about 90 % of polished glass
  const polished=R.glare(P,mirrorEye,light),ratio=at/polished;
  assert.ok(ratio>.85&&ratio<.95,'etched/polished peak '+ratio);
 });
});

describe('Game Boy Color CGB-001 (Retro Display Lab, HCS measurement)',async()=>{
 const G=await import('../vector-lcd/screens/cgb/index.js');
 const P=G.checkProfile(JSON.parse(read('profiles/cgb-001-tft.json')));
 const lin=codes=>G.linearRGB(G.colourXYZ(P,codes.map(c=>c/31)));
 test('the measured table: a dim, low-contrast panel (black ~20 %, white ~59 % of a white card)',()=>{
  near(G.colourXYZ(P,[0,0,0])[1],P.colour.black_xyz[1],1e-7);near(G.colourXYZ(P,[1,1,1])[1],P.colour.white_xyz[1],1e-7);
  near(P.colour.black_xyz[1],.1998,1e-3);near(P.colour.white_xyz[1],.5928,1e-3);
  const n=32,{xyz}=G.tables(P);assert.equal(xyz.length,n*n*n*3);
  // between table entries the colour is trilinear
  const a=G.colourXYZ(P,[3/31,7/31,9/31]),b=G.colourXYZ(P,[4/31,7/31,9/31]),m=G.colourXYZ(P,[3.5/31,7/31,9/31]);
  for(let c=0;c<3;c++)near(m[c],(a[c]+b[c])/2,1e-7);
 });
 test('every standard piece colour stays inside the display, pale as on the real screen',()=>{
  for(const code of [[0,29,29],[29,29,0],[19,0,29],[0,29,0],[29,0,0],[0,0,29],[29,19,0]]){
   const c=lin(code);assert.ok(Math.min(...c)>0&&Math.max(...c)<.7,code+' -> '+c);
  }
 });
 test('response: the source anchors, 65 ms black to white and 115 ms for a small step (10-90 %)',()=>{
  near(Math.log(9)/G.rate(P,0,31)*1000,65,1e-3);near(Math.log(9)/G.rate(P,31,0)*1000,65,1e-3);
  near(Math.log(9)/G.rate(P,15,16)*1000,115,1e-3);
 });
 test('one frame follows the first-order path exactly, and the rate is frozen until the target changes',()=>{
  const T=P.panel.frame_s,k=G.rate(P,0,31);
  let r=G.stepFrame(P,G.settled([0,0,0]),[31,0,0]);
  near(r.state.s[0],1-Math.exp(-k*T),1e-12);assert.deepEqual(r.state.start,[0,0,0]);
  r=G.stepFrame(P,r.state,[31,0,0]);near(r.state.s[0],1-Math.exp(-2*k*T),1e-12,'same rate the next frame');
  const back=G.stepFrame(P,r.state,[0,0,0]);assert.equal(back.state.start[0],Math.round(r.state.s[0]*31),'new segment starts at the nearest code');
 });
 test('a settled pixel shows exactly its table colour; the frame average lies between start and end',()=>{
  const st=G.settled([10,20,30]),r=G.stepFrame(P,st,[10,20,30]);
  const want=G.colourXYZ(P,[10/31,20/31,30/31]);for(let c=0;c<3;c++)near(r.xyz[c],want[c],1e-7);
  const up=G.stepFrame(P,G.settled([0,0,0]),[31,31,31]);
  assert.ok(up.xyz[1]>P.colour.black_xyz[1]&&up.xyz[1]<G.colourXYZ(P,up.state.s)[1]);
 });
 test('stripes keep every pixel\'s colour, and never pass the display\'s white',()=>{
  const white=lin([31,31,31]),black=lin([0,0,0]),at=i=>i%2?white:black;
  for(const [u0,u1] of [[0,1],[0,3],[1,2],[2,5]]){   // whole pixels: the average is kept
   const c=G.apertureColour(i=>at(i),u0,u1,0,1);
   let want=[0,0,0];for(let i=Math.floor(u0);i<u1;i++){const w=Math.min(u1,i+1)-Math.max(u0,i);want=want.map((v,k)=>v+at(i)[k]*w/(u1-u0));}
   for(let k=0;k<3;k++)near(c[k],want[k],1e-9,u0+'..'+u1);
  }
  for(let k=0;k<3;k++){const c=G.apertureColour(()=>white,k/3,(k+1)/3,0,1);assert.ok(Math.max(...c)<=1+1e-9,String(c));}
  assert.equal(G.stripeContrast(black),1,'dark pixels show full stripes');
  assert.equal(G.stripeResolve(9),1);assert.equal(G.stripeResolve(6),0);near(G.stripeResolve(7.5),.5,1e-12);
  const flat=G.apertureColour(()=>white,0,1/3,0,1,0);for(let k=0;k<3;k++)near(flat[k],white[k],1e-12,'unresolved: the average');
 });
});

describe('Commodore 1084S colour CRT (P22, Kuhn 2002; EBU Tech 3213)',async()=>{
 const C=await import('../vector-lcd/screens/crt/index.js');
 const P=C.checkProfile(JSON.parse(read('profiles/crt-1084s-p22.json')));
 test('three layers balanced to D65: equal full drive gives white at full luminance',()=>{
  const shares=C.layerShares(P);near(shares.reduce((a,b)=>a+b),1,1e-6);
  [.222,.7067,.0713].forEach((v,i)=>near(shares[i],v,2e-3));
  const rgb=C.steadyRGBPerY(P);for(const v of rgb)near(v,1,2e-3);   // D65 white in linear sRGB, per unit luminance
 });
 test('the guns follow the art to the power 2.4; the TTL monitor keeps its levels',()=>{
  const d=C.layerDrives(P,[1,.5,0]);near(d[0],1,1e-12);near(d[1],.5**2.4,1e-12);near(d[2],0,1e-12);
  const M=JSON.parse(read('profiles/crt-5151-p39.json'));assert.deepEqual(C.layerDrives(M,[0,0,0]),[1]);
 });
 test('red is gone within a frame; green and blue keep about 5 % for the next frame (Kuhn\'s power-law tail)',()=>{
  const D=P.phosphor.derived.next_frame_light;
  assert.ok(D.red<1e-6);near(D.green,.052,.002);near(D.blue,.046,.002);
  assert.ok(P.phosphor.derived.tail_fit_max_log_misfit.green<.15);
 });
 test('PAL timing and the 0.42 mm slot mask',()=>{
  near(P.timing.frame_s,.019968,1e-6);assert.equal(P.timing.lines_visible,256);
  assert.equal(P.mask.triplet_pitch_mm,.42);
  assert.equal(C.stripeResolve(9),1);assert.equal(C.stripeResolve(6),0);
 });
});

describe('Vectrex vector display (Malban; Vectrex service manual)',async()=>{
 const V=await import('../vector-lcd/screens/vector/index.js');
 const P=V.checkProfile(JSON.parse(read('profiles/vectrex.json')));
 test('a 30 000-cycle round at 1.5 MHz is 1/50 s; a list over the 200-400 budget slows the refresh',()=>{
  near(P.timing.frame_s,.02,1e-12);near(V.refreshHz(P,200),50,1e-9);near(V.refreshHz(P,300),50,1e-9);
  near(V.refreshHz(P,600),25,1e-9);near(V.lightScale(P,1,600),.5,1e-12,'half the rounds per second: half the light');
 });
 test('a long line\'s core is 1, its cross-section is the spot, its end dot is dwell x speed over the line spread',()=>{
  const s=1.7,line=[0,0,100,0];
  near(V.lineLight(50,0,line,s,0),1,1e-9);near(V.lineLight(50,s,line,s,0),Math.exp(-.5),1e-9);
  near(V.lineLight(0,0,line,s,0),.5,1e-7,'half the light at the start, where the spot is half on the line');
  near(V.dotStrength(P),P.beam.dwell_s*P.beam.speed_mm_per_s/(Math.sqrt(2*Math.PI)*P.beam.sigma_mm),1e-12);
  assert.ok(V.dotStrength(P)>1,'the end dot is brighter than the line');
 });
 test('the game as a display list: frame, cells and counters',async()=>{
  const {tetrisVectors}=await import('../vector-lcd/content/vectors.js');
  const empty={board:Array.from({length:20},()=>Array(10).fill(null)),current:null,lines:0,score:0};
  const n0=tetrisVectors(empty).length;
  empty.board[19][0]='I';assert.equal(tetrisVectors(empty).length,n0+4,'one square per cell');
 });
});

describe('Curved face of the 5151 tube (Philips M31-336: 510 mm radius)',async()=>{
 const C=await import('../vector-lcd/screens/crt/index.js'),R=await import('../vector-lcd/optics/room.js');
 const P=JSON.parse(read('profiles/crt-5151-p39.json'));
 test('the data sheet radius; flat where no radius is published',()=>{
  assert.equal(P.faceplate.curvature_radius_mm,510);
  assert.equal(JSON.parse(read('profiles/crt-1084s-p22.json')).faceplate.curvature_radius_mm,null);
  assert.deepEqual(R.sphereNormal(null,10,10),[0,0,1]);
 });
 test('the normal tilts outward by asin(r/R): 11 degrees at the top edge of the raster',()=>{
  const n=R.sphereNormal(510,0,100);near(Math.asin(n[1])*180/Math.PI,11.3,.05);near(Math.hypot(...n),1,1e-12);
 });
 test('on a curved face the lamp\'s reflection moves: it peaks where the tilted mirror points at the light',()=>{
  const light={angleDeg:20,azimuthDeg:0,sourceDeg:15},L=R.directionVector(20,0);
  // straight-on eye: on the flat face the reflection needs the eye at the mirror of L; the curved face finds it where n bisects v and L
  const v=[0,0,1],h=[L[0]+v[0],L[1]+v[1],L[2]+v[2]],k=Math.hypot(...h),n=h.map(x=>x/k);
  const y=n[1]*510,flatAt=C.faceGlare(P,v,light),curvedAt=C.faceGlare(P,v,light,R.sphereNormal(510,0,y));
  assert.ok(curvedAt>5*flatAt,'flat '+flatAt+', curved at '+y.toFixed(0)+' mm: '+curvedAt);
 });
});

describe('Vector input (experimental): any SVG as exact shapes in four drive levels',async()=>{
 const G=await import('../vector-lcd/vector/geometry.js');
 const area=t=>{let a=0;for(let i=0;i<t.length;i+=6)a+=Math.abs((t[i+2]-t[i])*(t[i+5]-t[i+1])-(t[i+4]-t[i])*(t[i+3]-t[i+1]))/2;return a;};
 test('shapes kept on the GPU in their own units: moved by the matrix, the same triangles as built in panel dots',async()=>{
  const {shapeTriangles}=await import('../vector-lcd/vector/draw.js');
  const shape={fill:{subpaths:G.parsePath('M0 0H10V10H0Z M3 3V7H7V3Z'),rule:'evenodd',value:2},
   stroke:{subpaths:G.parsePath('M0 0C5 -4 10 4 15 0'),width:1.5,cap:'round',join:'round',miterLimit:4,value:3}};
  // Rotation and even scaling (every scene uses these): stroke width scales with the shape.
  const a=.7,k=37,m=[k*Math.cos(a),k*Math.sin(a),-k*Math.sin(a),k*Math.cos(a),120.5,80.25],t=.2/k;
  const local=shapeTriangles(shape,t),move=l=>l.map((v,i)=>i%2?m[1]*l[i-1]+m[3]*v+m[5]:m[0]*v+m[2]*l[i+1]+m[4]);
  const toDots=polys=>polys.map(p=>({closed:p.closed,points:p.points.map(q=>G.apply(m,...q))}));
  const fan=G.fanTriangles(toDots(G.flatten(shape.fill.subpaths,t)));
  const stroke=G.strokeTriangles(toDots(G.flatten(shape.stroke.subpaths,t)),{...shape.stroke,width:shape.stroke.width*k},.2);
  assert.equal(local.stencil,true);
  const close=(x,y)=>{assert.equal(x.length,y.length);x.forEach((v,i)=>assert.ok(Math.abs(v-y[i])<1e-9,`${i}: ${v} vs ${y[i]}`));};
  close(move(local.fill),fan);
  close(move(local.stroke),stroke);
  // The cover is the outline's bounding box, so it holds every fan triangle.
  assert.deepEqual(local.cover,[0,0,10,0,10,10,0,0,10,10,0,10]);
  // A convex outline needs no stencil and no cover.
  const square=shapeTriangles({fill:{subpaths:G.parsePath('M0 0H1V1H0Z'),rule:'nonzero',value:1},stroke:null},.1);
  assert.equal(square.stencil,false);assert.equal(square.cover.length,0);assert.equal(area(square.fill),1);
 });
 test('the four drive greys are looked up exactly; every other colour is refused, never rounded',()=>{
  assert.deepEqual([255,170,85,0].map(v=>G.driveIndex(v,v,v)),[0,1,2,3]);
  for(const v of [254,171,169,86,84,1,128])assert.equal(G.driveIndex(v,v,v),null,String(v));
  assert.equal(G.driveIndex(170,170,171),null);
 });
 test('path data: every command, relative and absolute, packed arc flags, implicit line-tos',()=>{
  const s=G.parsePath('m10 10h5v5q2 2 4 0t4 0c1 1 2 2 3 0s2 2 3 0a2 2 0 011 1z M0 0 1 1 2 0');
  assert.equal(s.length,2);assert.equal(s[0].closed,true);assert.deepEqual(s[0].segs.at(-1).p,[30,16]);
  assert.deepEqual(s[1].segs.map(g=>g.p),[[1,1],[2,0]]);
  assert.throws(()=>G.parsePath('M0 0L1'),SyntaxError);
 });
 test('arcs and curves stay within the tolerance at any scale',()=>{
  for(const scale of [1,1e3,1e6]){
   const c=G.flatten(G.transformSubpaths(G.parsePath(G.shapePath('circle',{cx:'0',cy:'0',r:'10'})),[scale,0,0,scale,0,0]),.2);
   const worst=Math.max(...c[0].points.map(p=>Math.abs(Math.hypot(...p)-10*scale)));
   assert.ok(worst<=.2+10*scale*1e-6,'scale '+scale+': '+worst);
  }
 });
 test('basic shapes: rounded rect area, convex fast path, self-crossing stars are not convex',()=>{
  const rr=G.flatten(G.parsePath(G.shapePath('rect',{x:'0',y:'0',width:'20',height:'10',rx:'2'})),1e-4);
  near(area(G.convexTriangles(rr)),200-(4-Math.PI)*4,1e-3);
  assert.equal(G.convexTriangles(G.flatten(G.parsePath('M0 -10L5.9 8.1L-9.5 -3.1H9.5L-5.9 8.1Z'),1)),null);
  assert.equal(G.convexTriangles(G.flatten(G.parsePath('M0 0H10V10H0ZM2 2H8V8H2Z'),1)),null,'a hole needs the stencil');
 });
 test('strokes: a straight line covers width x length; miter joins respect the miter limit',()=>{
  near(area(G.strokeTriangles(G.flatten(G.parsePath('M0 0H10'),.01),{width:2,cap:'butt'},.01)),20,1e-9);
  near(area(G.strokeTriangles(G.flatten(G.parsePath('M0 0H10'),.01),{width:2,cap:'square'},.01)),24,1e-9);
  const sharp=G.flatten(G.parsePath('M0 0L10 0L0 1'),.01);
  const withMiter=area(G.strokeTriangles(sharp,{width:1,join:'miter',miterLimit:100},.01));
  const limited=area(G.strokeTriangles(sharp,{width:1,join:'miter',miterLimit:4},.01));
  assert.ok(withMiter>limited,'a very sharp corner falls back to a bevel under the default limit');
 });
 test('the test cards use only the four drive greys, and the off-palette card breaks the rule on purpose',()=>{
  const greys=svg=>[...svg.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-f]{3,6})"/g)].map(m=>m[1]);
  const ok=new Set(['#ffffff','#aaaaaa','#555555','#000000']);
  for(const g of greys(read('content/test-card.svg')))assert.ok(ok.has(g),g);
  assert.ok(greys(read('content/test-card-off-palette.svg')).includes('#777777'));
  assert.match(read('content/test-card-off-palette.svg'),/url\(#fade\)/);
 });
 test('Tetris pieces each take one drive level that shows on the unlit panel',async()=>{
  const {PIECE_LEVELS}=await import('../vector-lcd/content/scenes.js');
  assert.deepEqual(Object.keys(PIECE_LEVELS).sort(),['I','J','L','O','S','T','Z']);
  for(const v of Object.values(PIECE_LEVELS))assert.ok([1,2,3].includes(v));
 });
});

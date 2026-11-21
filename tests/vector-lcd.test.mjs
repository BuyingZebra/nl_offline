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

describe('DMG-01 STN (Retro Display Lab data, no dot grid)',async()=>{
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
  assert.equal(D.stn.drift_per_frame.length,3*4*D.stn.director_bins);
  assert.equal(D.stn.target_q.length,12);
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
  assert.ok(warm>=2&&warm<=10,'darkening frames at 20 C: '+warm);
  assert.ok(cold>warm,'cold is slower: '+cold+' vs '+warm);
  assert.ok(run(3,0,20)>=2);
 });
 test('holding a dark image leaves a faint sticking ghost',()=>{
  let st={q:M.targetQ(D,3),ionic:0,shade:3};
  for(let i=0;i<180*60;i++)st=M.stepFrame(D,st,3);
  for(let i=0;i<60;i++)st=M.stepFrame(D,st,0);
  const ghost=st.exposure-.25;
  assert.ok(ghost>0&&ghost<.25*.1,'ghost below a tenth of a shade: '+ghost);
 });
 test('reflector shadow: measured strength and offset in DMG dot units',()=>{
  assert.equal(D.shadow.strength,.18);assert.deepEqual(D.shadow.offset_dots,[.11,.13]);
  const o=M.shadowOffsetMm(D);near(o.x,.11*47/160,1e-12);near(o.y,.13*43/144,1e-12);
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
   .concat(...['app/','gpu/','optics/','screens/','content/','concept/','profiles/'].map(walk),['./third_party/retro-display-lab/NOTICE']);
  for(const file of shipped)assert.ok(assets.includes(file),file+' is not precached');
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
 const profileOf=screen=>JSON.parse(read('profiles/'+screen.id+'.json'));
 // What a definition may ask of a renderer when building the Info tab.
 const fakeRenderer={bezelLipMm:1,info:()=>({retention:true})};

 test('every kind has one public entry with a version, a renderer, a profile check and a definition',()=>{
  for(const [name,kind] of Object.entries(KINDS)){
   assert.match(kind.VERSION,/^\d+\.\d+\.\d+$/,name);
   for(const fn of ['createRenderer','checkProfile'])assert.equal(typeof kind[fn],'function',name+'.'+fn);
   for(const key of ['tiles','usesElectrodes','prepare','device','deviceNote','temperatureRange','temperatureNote','lightNote','driveNote','facts'])
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
   assert.equal(P.profile,screen.id);
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
 test('only real device controls: none on the VI-402, the wheel on the DMG-01, two knobs on the 5151',()=>{
  const keys=id=>{const s=SCREENS.find(x=>x.id===id);return KINDS[s.kind].definition.device(profileOf(s)).map(c=>c.key);};
  assert.deepEqual(keys('reflective-tn'),[]);
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

describe('P7 cascade CRT (RCA 1961, MIT 1948)',async()=>{
 const P=JSON.parse(read('profiles/crt-5151-p7.json'));
 const P39=JSON.parse(read('profiles/crt-5151-p39.json'));
 const M=await import('../vector-lcd/screens/crt/index.js');
 const trace=JSON.parse(fs.readFileSync(new URL('../vector-lcd/tools/rca-p7-persistence.json',import.meta.url),'utf8'));
 const I=P.phosphor.impulse,[blue,yellow]=P.phosphor.layers;
 // Decay after steady excitation of one layer: S(t) = sum a tau exp(-t/tau) / sum a tau
 const stepOff=(layer,t)=>{let s=0,n=0;I.amplitudes.forEach((a,i)=>{if(I.layer[i]!==layer)return;s+=a*I.taus_s[i]*Math.exp(-t/I.taus_s[i]);n+=a*I.taus_s[i];});return s/n;};
 const timeTo=(layer,f)=>{let lo=0,hi=600;for(let k=0;k<200;k++){const m=(lo+hi)/2;if(stepOff(layer,m)>f)lo=m;else hi=m;}return lo;};

 test('the same monitor as the P39 profile: only the phosphor differs',()=>{
  for(const key of ['timing','drive','spot','raster','faceplate','luminance','controls','sources','oblique'])
   assert.deepEqual(P[key],P39[key],key);
  M.checkProfile(P);
 });
 test('two layers with RCA\'s measured colours and peaks',()=>{
  assert.deepEqual(blue.cie_xy,[.151,.032]);assert.equal(blue.peak_nm,435);
  assert.deepEqual(yellow.cie_xy,[.357,.537]);assert.equal(yellow.peak_nm,555);
  assert.equal(I.layer.filter(l=>l===0).length,1,'one fast blue component');
  near(M.layerShares(P).reduce((a,b)=>a+b),1,1e-9);
 });
 test('decay matches RCA: blue 25-75 µs, yellow-green 400 ms to 10 %',()=>{
  const tb=timeTo(0,.1);assert.ok(tb>=25e-6&&tb<=75e-6,'blue t10 '+tb);
  const ty=timeTo(1,.1);assert.ok(Math.abs(ty-.4)<.04,'yellow-green t10 '+ty);
 });
 test('the yellow-green fit follows RCA\'s traced curve: within 3 % on average in every band, 8 % at any traced point',()=>{
  const {t_ms,relative}=trace.yellow_green_B;
  for(const [lo,hi] of [[20,50],[50,100],[100,200],[200,300],[300,400]]){
   const errs=t_ms.map((t,i)=>[t,stepOff(1,t/1000)*100/relative[i]-1]).filter(([t])=>t>=lo&&t<hi).map(([,e])=>e);
   const mean=errs.reduce((a,b)=>a+b,0)/errs.length;
   assert.ok(errs.length>5&&Math.abs(mean)<.03,lo+'-'+hi+' ms mean '+mean);
   assert.ok(errs.every(e=>Math.abs(e)<.08),lo+'-'+hi+' ms worst '+Math.max(...errs.map(Math.abs)));
  }
 });
 test('colour balance: the steady light is the mix closest to white (illuminant C)',()=>{
  const uv=([x,y])=>{const d=-2*x+12*y+3;return [4*x/d,6*y/d];};
  const mix=f=>{const XYZ=[[blue,f],[yellow,1-f]].reduce((s,[L,w])=>{const[x,y]=L.cie_xy;return[s[0]+w*x/y,s[1]+w,s[2]+w*(1-x-y)/y];},[0,0,0]);
   const n=XYZ[0]+XYZ[1]+XYZ[2];return [XYZ[0]/n,XYZ[1]/n];};
  const dist=f=>{const a=uv(mix(f)),b=uv([.3101,.3162]);return Math.hypot(a[0]-b[0],a[1]-b[1]);};
  const f=M.layerShares(P)[0];
  assert.ok(dist(f)<=dist(f*1.05)&&dist(f)<=dist(f*.95),'not the closest mix');
  near(P.phosphor.cie_xy[0],mix(f)[0],1e-4);near(P.phosphor.cie_xy[1],mix(f)[1],1e-4);
 });
 test('cross-check: a single 1/60 s flash fades as MIT measured from 10 to 100 ms (within 0.15 decades)',()=>{
  const c=P.phosphor.derived.single_flash_vs_mit[0];
  assert.equal(c.from_s,.01);assert.equal(c.to_s,.1);
  assert.ok(Math.abs(c.model_decades-c.mit_decades)<.15,JSON.stringify(c));
 });
 test('each layer has its true colour at unit luminance; they mix inside the display, and only a bare blue flash needs mapping',()=>{
  for(const L of P.phosphor.layers){const[r,g,b]=L.display_rgb_per_Y;near(.2126*r+.7152*g+.0722*b,1,2e-3);}
  assert.ok(Math.min(...blue.display_rgb_per_Y)<0,'P7 blue lies outside sRGB');
  assert.ok(Math.min(...yellow.display_rgb_per_Y)>=0,'P7 yellow-green lies inside');
  const steady=M.steadyRGBPerY(P);
  assert.ok(Math.min(...steady)>=0,'the steady mix lies inside sRGB');
  assert.deepEqual(M.intoGamut(steady),steady);
  const mapped=M.intoGamut(blue.display_rgb_per_Y);
  assert.ok(Math.min(...mapped)>=-1e-12);near(.2126*mapped[0]+.7152*mapped[1]+.0722*mapped[2],1,2e-3);
 });
 test('a steady image shows its drive level in total, split by the layer shares, at every phase',()=>{
  const shares=M.layerShares(P);
  for(const phase of [0,.1,.5,.9]){
   const t=phase*P.timing.frame_s;
   near(M.steadyWindow(P,.6667,t),.6667,1e-3);
   near(M.steadyWindow(P,1,t,0),shares[0],1e-6);
   near(M.steadyWindow(P,1,t,1),shares[1],1e-3);
  }
 });
});

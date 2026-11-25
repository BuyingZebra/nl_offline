#!/usr/bin/env node
/* Builds profiles/dmg-01-stn.json from a Retro Display Lab checkout.
 *
 *   node tools/dmg01_profile.mjs /path/to/retro-display-lab
 *
 * Retro Display Lab (https://github.com/JohnnySun/retro-display-lab) is
 * Apache-2.0, copyright 2026 JohnnySun. Its DMG-01 model supplies every number
 * this profile carries: the measured five-state palette, the generated STN
 * director-drift and optical tables, the contrast-wheel conditions, the ionic
 * retention defaults, the reflector-shadow strength and offset, and the panel
 * geometry. Nothing here is fitted or tuned; values are copied and labelled.
 * See ../third_party/retro-display-lab/NOTICE. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=process.argv[2];
if(!root){console.error('usage: node tools/dmg01_profile.mjs /path/to/retro-display-lab');process.exit(2);}
const model=join(root,'models','nintendo-dmg-01');
const read=p=>readFileSync(join(model,p),'utf8');
const sha=p=>createHash('sha256').update(readFileSync(join(model,p))).digest('hex');

// --- Generated STN surrogate (tools/build-dmg01-stn-physics.mjs output) ---
const inc=read('shaders/dmg01-stn-surrogate.inc');
const scalar=name=>{const m=inc.match(new RegExp('const (?:float|int) '+name+' = ([-0-9.e]+);'));if(!m)throw new Error('missing '+name);return Number(m[1]);};
const array=(name,length)=>{
 const m=inc.match(new RegExp('const float '+name+'\\[(\\d+)\\] = float\\[\\]\\(([^)]*)\\);'));
 if(!m)throw new Error('missing '+name);
 const values=m[2].split(',').map(Number);
 if(values.length!==Number(m[1])||values.length!==length||values.some(v=>!Number.isFinite(v)))throw new Error('bad '+name);
 return values;
};
const bins=scalar('DMG_PHYSICAL_DRIFT_BINS'),opticalBins=scalar('DMG_PHYSICAL_OPTICAL_BINS');

// --- Display shader: palette and reflector shadow defaults ---
const display=read('shaders/dmg01-display-v1.slang');
const rgb=name=>{const m=display.match(new RegExp('const vec3 '+name+'\\s*= vec3\\(([^)]*)\\) / 255\\.0;'));if(!m)throw new Error('missing '+name);return m[1].split(',').map(v=>Math.round(Number(v)));};
const param=(src,name)=>{const m=src.match(new RegExp('#pragma parameter '+name+' "[^"]*" ([-0-9.e]+) ([-0-9.e]+) ([-0-9.e]+)'));if(!m)throw new Error('missing parameter '+name);return {value:Number(m[1]),min:Number(m[2]),max:Number(m[3])};};

// --- Response shader: contrast wheel, temperature, retention defaults ---
const response=read('shaders/dmg01-response-v1.slang');
const sticking=response.match(/max\(([0-9.]+) \* params\.IonicMobility - ([0-9.]+), 0\.0\)/);
if(!sticking)throw new Error('missing sticking-voltage fit');
const drive=JSON.parse(read('data/dmg-drive-v1.json'));
const physics=JSON.parse(read('generated/ws2-stn-physics-v1.json'));
const contrastConditions=physics.runtimeContrastConditions.map(c=>c.contrastScale);

const profile={
 profile:'dmg-01-stn',model:'dmg01-stn',
 name:'Reflective STN, Nintendo DMG-01 (Retro Display Lab reconstruction)',
 attribution:{
  project:'Retro Display Lab',url:'https://github.com/JohnnySun/retro-display-lab',
  license:'Apache-2.0',copyright:'Copyright 2026 JohnnySun',notice:'third_party/retro-display-lab/NOTICE',
  files:Object.fromEntries(['shaders/dmg01-stn-surrogate.inc','shaders/dmg01-display-v1.slang','shaders/dmg01-response-v1.slang',
   'data/dmg-drive-v1.json','generated/ws2-stn-physics-v1.json'].map(f=>['models/nintendo-dmg-01/'+f,sha(f)])),
  changes:'Values copied into one JSON profile; no value changed. Used without the pixel aperture, the passive-matrix crosstalk and the row-latch scan-out, which belong to the 160x144 dot grid.'
 },
 panel:{
  active_mm:[47,43],dots:[drive.panel.visibleColumns,drive.panel.visibleRows],
  refresh_hz:scalar('DMG_PHYSICAL_REFRESH_HZ'),duty:'1/'+drive.panel.visibleRows,
  ref:'Nintendo Game Boy technical data (DMG-DIMENSIONS-01); DMG drive record dmg-drive-v1.json'
 },
 palette:{
  srgb8:{disabled:rgb('DMG_DISABLED'),shades:[rgb('DMG_SHADE_0'),rgb('DMG_SHADE_1'),rgb('DMG_SHADE_2'),rgb('DMG_SHADE_3')]},
  optical_states:[0,.25,.5,.75,1],
  interpolation:'linear light, piecewise between the five states',
  ref:'BGB, The reality of DMG colors (DMG-COLOR-01): central-patch samples'
 },
 drive:{
  levels:4,
  mapping:'shade = floor(3 (1 - luma) + 0.5), luma = Rec.709 weights on the encoded sRGB value (Retro Display Lab gameboy_drive_index)',
  selected_energy_fractions:drive.multiplexModel.fourShadeSelectedEnergyFractions,
  nonselect_rms_V:drive.multiplexModel.nominalNonselectRmsVolts,
  note:drive.multiplexModel.fourShadeEncodingStatus
 },
 contrast:{...param(response,'DriveContrast'),conditions:contrastConditions,
  note:drive.boardTopology.contrastControl},
 stn:{
  director_bins:bins,optical_bins:opticalBins,
  target_q:array('DMG_PHYSICAL_TARGET_Q',contrastConditions.length*4),
  drift_per_frame:array('DMG_PHYSICAL_DRIFT',contrastConditions.length*4*bins),
  optical:array('DMG_PHYSICAL_OPTICAL',opticalBins),
  optical_anchor_q:array('DMG_PHYSICAL_OPTICAL_ANCHOR_Q',4),
  optical_correction:array('DMG_PHYSICAL_OPTICAL_CORRECTION',4),
  layout:'drift_per_frame[(condition*4 + shade)*bins + bin], bin over director coordinate q in [0, 1]',
  method:physics.solver.directorDynamics+'; '+physics.solver.opticalReduction,
  t90_s:{darkening:physics.validation.motionTopology.darkeningT90Seconds,clearing:physics.validation.motionTopology.clearingT90Seconds},
  claim:physics.claimBoundary
 },
 temperature:{
  activation_K:scalar('DMG_VISCOSITY_ACTIVATION_K'),reference_C:20,
  range_C:[param(response,'PanelTemperatureCelsius').min,param(response,'PanelTemperatureCelsius').max],
  // Not from the source: slows the crystal to the era's published STN response
  // (see sources.response). The source's tables alone give about 91 ms per change.
  response_scale:0.52,
  law:'drift per frame scaled by response_scale × exp(activation_K (1/293.15 - 1/T))'
 },
 retention:{
  ionic_mobility:param(response,'IonicMobility').value,
  sticking_optical_gain:param(response,'StickingOpticalGain').value,
  charge_per_frame:param(response,'IonicChargeResponse').value,
  release_per_frame:param(response,'IonicReleaseResponse').value,
  sticking_volts_fit:[Number(sticking[1]),-Number(sticking[2])],
  ref:'Nakazono et al. (Merck Japan, 1994) sticking-voltage regression; the optical gain is an explicit bridge (Retro Display Lab)'
 },
 shadow:{
  strength:param(display,'ShadowStrength').value,
  offset_dots:[param(display,'ShadowOffsetX').value,param(display,'ShadowOffsetY').value],
  ref:'Retro Display Lab reflector shadow (DMG-APERTURE-01), reference-image matched'
 },
 // The bezel shadow needs the front stack. Nothing published gives the DMG's,
 // so the TN panel's measured 1.1 mm glass is used and labelled as assumed.
 sources:{geometry:{glass_mm:1.1,n_glass:1.5,rear_polarizer_mm:.18,n_polarizer:1.5,assumed:true,
  note:"DMG glass thickness not published; 1.1 mm is the thickest of the common small-STN options (0.4/0.55/0.7/1.1 mm), the same front stack as the TN profiles (assumed)"},
  response:{"scale": 0.52, "target_ms": 150, "measured": "mean 10–90% response in shown brightness over the 12 shade changes at 25 °C: 149 ms (100–201 ms per change), with the 257-bin tables of tools/dmg01_wheel.mjs; the tables alone give 70 ms (50–100 ms); until v0.31 the 65-bin tables needed 0.64", "basis": "no DMG measurement exists; matched to the era's published STN figures, not to a DMG panel", "refs": ["Sharp, 1997 press release: conventional STN 300 ms (10–90% rise plus fall), i.e. about 150 ms per change", "Hitachi, 1996 (Nikkei): conventional STN 300 ms rise plus fall, 10–90%", "Sharp LM32019T STN module datasheet: rise 190 ms, fall 210 ms", "Period small STN modules: 100–200 ms (Japanese DMG-recreation notes, unmeasured)"]}},
 oblique:{front_index:1.5},
 // The screen lens: not in the source. See README (DMG-01, Screen lens).
 lens:{"n": 1.49, "thickness_mm": 1.0, "gap_mm": 1.0, "assumed": true, "note": "Clear \"high-impact plastic\" window in the front shell (Game Boy Modding, No Starch), its frame printed on the underside (assumed). Index of acrylic (PMMA, n 1.49, assumed; polycarbonate would be 1.585 and mirror slightly more). 1.0 mm is an upper estimate: replacement lenses are sold at 1.0 mm (Hand Held Legend) and owners report they sit higher than the stock lens. The 1.0 mm air gap to the LCD is not published (assumed). The measured palette is taken as seen through the lens, so the lens does not dim it again.", "effect": "glare from three parallel surfaces (lens front, lens back, LCD front); the printed frame's shadow falls across the air gap"},
 // The reflector's grain: not in the source. See README (DMG-01, Reflector grain).
 reflector:{"grain_mm": 0.118, "grain_amplitude": 0.039, "source": "Brick Boy emulator developer (fugudaro/kathoc), measured from close-up images of LCD modules: grains 0.3-0.5 dot, non-directional, amplitude total ±3.9% (Time Extension, Aug 2026, https://www.timeextension.com/news/2026/08/the-most-gorgeous-game-boy-emulation-ive-ever-seen-brick-boy-goes-the-extra-mile-to-copy-the-consoles-nostalgic-display); which unit and photos not stated", "basis": "grain 0.4 dot (0.118 mm at the 0.294 mm pitch from Nintendo's 47 mm / 160 dots); ±3.9% read as the peak of the variation (assumed reading); value noise, a multiplicative reflectance where the light bounces, halfway between entry and exit", "effect": "a fixed paper-like texture, strongest in light areas (multiplicative), averaged out where a screen pixel is wider than the grain"},
 limitations:JSON.parse(read('model.json')).limitations
};
const here=dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here,'..','profiles','dmg-01-stn.json'),JSON.stringify(profile));
console.log('wrote profiles/dmg-01-stn.json',{contrastConditions,bins,temperature:profile.temperature.range_C,shadow:profile.shadow});

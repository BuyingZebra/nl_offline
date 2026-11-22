#!/usr/bin/env node
/* Builds profiles/cgb-001-tft.json from a Retro Display Lab checkout.
 *
 *   node tools/cgb001_profile.mjs /path/to/retro-display-lab
 *
 * Retro Display Lab (https://github.com/JohnnySun/retro-display-lab) is
 * Apache-2.0, copyright 2026 JohnnySun. Its CGB-001 model supplies every number
 * this profile carries: the colour table built from the Handheld Color Space
 * Project's measured GBC reflectance (Brankale / Pokefan531), the first-order
 * response rates from Sharp's HR-TFT family bounds, the GBC frame time and the
 * equal-third RGB aperture. Nothing here is fitted or tuned; values are copied
 * and labelled. See ../third_party/retro-display-lab/NOTICE. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=process.argv[2];
if(!root){console.error('usage: node tools/cgb001_profile.mjs /path/to/retro-display-lab');process.exit(2);}
const model=join(root,'models','nintendo-cgb-001');
const bytes=p=>readFileSync(join(model,p));
const json=p=>JSON.parse(bytes(p).toString('utf8'));
const sha=p=>createHash('sha256').update(bytes(p)).digest('hex');
const f32=buffer=>new Float32Array(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
const base64=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength).toString('base64');

// --- Colour: 32^3 absolute relative-reflectance XYZ, D65, 45 deg light, 0 deg view ---
const lutInfo=json('generated/cgb001-d65-lut-v1.json');
const lutRaw=bytes('generated/cgb001-d65-lut-v1.rgba32f');
if(sha('generated/cgb001-d65-lut-v1.rgba32f')!==lutInfo.sha256)throw new Error('LUT checksum mismatch');
const rgba=f32(lutRaw),xyz=new Float32Array(32*32*32*3);
for(let i=0;i<32*32*32;i++)for(let c=0;c<3;c++)xyz[i*3+c]=rgba[i*4+c];
const colour=json('data/color-reference-v1.json');
const at=(r,g,b)=>Array.from(xyz.slice(((b*32+g)*32+r)*3,((b*32+g)*32+r)*3+3));

// --- Response: first-order rate per (segment start code, target code) ---
const rateInfo=json('generated/cgb001-ws4-gtg-rates-v1.json');
const rateAll=f32(bytes('generated/cgb001-ws4-gtg-rates-v1.r32f'));
if(sha('generated/cgb001-ws4-gtg-rates-v1.r32f')!==rateInfo.binary.sha256)throw new Error('rate checksum mismatch');
const policy=json('data/ws4-response-policy-v1.json');
const members=policy.members.map(m=>m.id),nominal=members.indexOf('mid-envelope-nominal');
const table=(m,c)=>rateAll.slice((m*3+c)*1024,(m*3+c+1)*1024);
for(let c=1;c<3;c++)if(table(nominal,c).some((v,i)=>v!==table(nominal,0)[i]))throw new Error('channel rates differ: the profile stores one table');
const rates=table(nominal,0);
const exposure=json('data/ws5-exposure-policy-v1.json');
const aperture=json('data/aperture-v1.json');

const profile={
 profile:'cgb-001-tft',model:'cgb001-hrtft',
 name:'Reflective HR-TFT, Nintendo Game Boy Color CGB-001 (Retro Display Lab reconstruction)',
 attribution:{
  project:'Retro Display Lab',url:'https://github.com/JohnnySun/retro-display-lab',
  license:'Apache-2.0',copyright:'Copyright 2026 JohnnySun',notice:'third_party/retro-display-lab/NOTICE',
  measurement:'Handheld Color Space Project, Nintendo GBC (WIP), Brankale / Pokefan531, commit e688fc51141c0974728aa1bdcb89b94d74123f6b',
  files:Object.fromEntries(['generated/cgb001-d65-lut-v1.json','generated/cgb001-d65-lut-v1.rgba32f','generated/cgb001-ws4-gtg-rates-v1.r32f',
   'data/color-reference-v1.json','data/ws4-response-policy-v1.json','data/ws5-exposure-policy-v1.json','data/aperture-v1.json']
   .map(f=>['models/nintendo-cgb-001/'+f,sha(f)])),
  changes:'Values copied into one JSON profile; no value changed. The alpha channel of the colour table (always 1) and the fast/slow response members (stored as bounds) are not carried as tables; the three channels share one rate table, as in the source.'
 },
 panel:{
  pixels:[160,144],active_mm:[44,40],pitch_mm:[44/160,40/144],
  frame_s:exposure.observationInterval.secondsPerFrame,frame_equation:exposure.observationInterval.equation,
  ref:'Nintendo: reflective TFT LCD, 160 x 144, 44 x 40 mm (Wikipedia, Game Boy Color); Sharp HR-TFT (Nintendo Game Boy Color Repair Procedures, 1999)'
 },
 colour:{
  table_size:32,axis_order:lutInfo.axisOrder,domain:lutInfo.domain,interpolation:lutInfo.interpolation,
  xyz_f32_base64:base64(xyz),
  illuminant:'D65',geometry:'45 degree illumination, 0 degree (panel-normal) view',
  black_xyz:at(0,0,0),white_xyz:at(31,31,31),
  meaning:'reflectance relative to a perfect white diffuser under the same light (Y of a white card = 1)',
  limitations:colour.limitations,
  ref:'Handheld Color Space Project GBC reflectance (Pokefan531), reduced by Retro Display Lab WS1 (cgb001-d65-lut-v1)'
 },
 response:{
  model:'first-order per channel: s(t) = target + (s0 - target) exp(-rate t); rate frozen per constant-target segment, addressed by (round(31 s) at the segment start, target code)',
  member:'mid-envelope-nominal',rates_per_s_f32_base64:base64(rates),
  t10to90_ms:policy.members[nominal].parameters,
  bounds_ms:Object.fromEntries(policy.members.map(m=>[m.role,m.parameters])),
  snap:policy.state.snapEpsilon.value,
  rate_equation:rateInfo.responseDefinition.equation,
  classification:policy.members[nominal].classification,
  ref:'Nakamura et al., Development of HR-TFT (Sharp Technical Journal): HCR 50/80 ms and GH 80/150 ms family bounds; nominal = their midpoint (not a measured GBC value)'
 },
 aperture:{
  order:aperture.subpixelOrder,stripes:aperture.geometry.stripeIntervals,fill:aperture.geometry.activeFill.value,
  equation:aperture.decomposition.equation,
  note:aperture.decomposition.physicalClaim+'; gaps, notches and surface grain are not claimed'
 },
 retention:{amplitude:0,note:'no source gives a healthy-GBC sticking amplitude; held at zero, as in the source (WS7)'},
 drive:{
  levels:32,mapping:'code = round(31 v) per sRGB channel of the art: the raw RGB555 value a game writes',
  ref:'Nintendo Game Boy Programming Manual (1999): RGB555 palette, 32 codes per channel'
 },
 sources:{geometry:{glass_mm:.7,n_glass:1.52,rear_polarizer_mm:0,n_polarizer:1.5,assumed:true,
  note:'single front polarizer with the reflector inside the cell (HR-TFT): no rear polarizer and no reflector shadow; front glass thickness not published (assumed 0.7 mm) and used only for the bezel shadow'}},
 oblique:{front_index:1.5},
 limitations:[
  'Colour holds for 45 degree light and a straight-on view only: the panel\'s angle dependence is not modelled, so the light angle moves only the glare and the bezel shadow',
  'Response speed is a period midpoint between Sharp family bounds, not a measured GBC value; there is no temperature or per-channel data',
  'Pixel gaps, the reflector\'s grain and the plastic lens are not modelled (no measured values)',
  ...colour.limitations
 ]
};

const out=join(dirname(fileURLToPath(import.meta.url)),'..','profiles','cgb-001-tft.json');
writeFileSync(out,JSON.stringify(profile));
console.log('wrote',out,'black Y',profile.colour.black_xyz[1].toFixed(3),'white Y',profile.colour.white_xyz[1].toFixed(3),
 'rate 0->31',rates[31].toFixed(3),'/s; 15->16',rates[15*32+16].toFixed(3),'/s');

/* V063 — immutable Display System model and pure layout calculations.
 * Preserves all persisted setting keys and the V062 row geometry.
 */
export const DEFAULT=Object.freeze({phosphor:true,bloom:true,bloomStrength:.30,
 ghost:true,ghostX:2,ghostY:0,ghostStrength:22,
 scanlines:true,scanlinePreset:'original',scanlineOpacity:20,
 softness:true,softnessStrength:.64,softnessRadius:3,
 vignette:true,vignetteAmount:.39});
export const DISPLAY_EFFECTS=[
 {id:'phosphor',title:'PHOSPHOR COLOR',toggle:'phosphor'},
 {id:'scanlines',title:'CRT SCANLINES',toggle:'scanlines',pattern:true,
  sliders:[['','scanlineOpacity',0,100,1,'%']]},
 {id:'vignette',title:'SCREEN VIGNETTE',toggle:'vignette',
  sliders:[['','vignetteAmount',0,100,1,'%']]},
 {id:'bloom',title:'PHOSPHOR BLOOM',toggle:'bloom',
  sliders:[['','bloomStrength',0,100,1,'%']]},
 {id:'ghost',title:'SIGNAL GHOSTING',toggle:'ghost',
  sliders:[['X','ghostX',-32,32,1,'px'],
   ['Y','ghostY',-32,32,1,'px'],
   ['','ghostStrength',0,100,1,'%']]},
 {id:'softness',title:'EDGE SOFTNESS',toggle:'softness',
  sliders:[['STRENGTH','softnessStrength',0,100,1,'%'],
   ['RADIUS','softnessRadius',0,10,.5,'px']]},
 {id:'piece',title:'GHOST PIECE',toggle:'pieceGhost'},
 {id:'sound',title:'SOUND',toggle:'sound'}
];
export function settingsPreviewSize(width){
 return Math.min(68,Math.max(56,Math.round(width*.185)));
}
export function settingsContentHeight(effect,gap){
 const controls=effect.id==='ghost'||effect.id==='softness'?2:
  effect.sliders?.length?1:0;
 return 20+controls*(28+gap)+(effect.pattern?(30+gap):0);
}
export function buildSettingsRows(buttonH,gap,width,expanded,scanlineChoices,unit=6){
 const image=settingsPreviewSize(width),rows=[];let offset=0;
 const maxContentHeight=Math.max(...DISPLAY_EFFECTS.map(effect=>settingsContentHeight(effect,gap)));
 const rowHeight=Math.max(image,maxContentHeight+2*gap);
 for(const effect of DISPLAY_EFFECTS){
  const contentHeight=settingsContentHeight(effect,gap);
  const choiceHeight=Math.max(34,buttonH-8);
  const isExpanded=effect.pattern&&expanded;
  const height=rowHeight+(isExpanded?scanlineChoices.length*(choiceHeight+gap):0);
  rows.push({kind:'effect',effect,offset,height,rowHeight,contentHeight,choiceHeight});
  offset+=height+unit;
 }
 return {rows,height:Math.max(0,offset-unit)};
}
export function displayValue(value,step,unit){
 const digits=step<.1?2:step<1?1:0;
 return Number(value).toFixed(digits)+unit;
}
export function settingValueForKey(key,fx,showGhost,soundOn){
 if(key==='pieceGhost')return showGhost;
 if(key==='sound')return soundOn;
 if(['softnessStrength','vignetteAmount','bloomStrength'].includes(key))return Math.round(fx[key]*100);
 return fx[key];
}
export function normalizedSetting(key,value,clamp){
 return ['softnessStrength','vignetteAmount','bloomStrength'].includes(key)?clamp(value/100,0,1):value;
}

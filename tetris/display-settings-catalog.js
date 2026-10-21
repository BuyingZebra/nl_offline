/* V063 — declarative user-facing effect settings, independent of rendering.
 * These defaults and slider ranges intentionally match the approved V062 UI.
 */
export const DEFAULT_EFFECTS=Object.freeze({phosphor:true,bloom:true,bloomStrength:.30,
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
export function scanlineChoices(presets){
 return [{id:'off',name:'OFF'},...presets.map(p=>({id:p.id,name:p.name}))];
}
export function effectSettingValue(key,fx,{ghost,sound}){
 if(key==='pieceGhost')return ghost;
 if(key==='sound')return sound;
 if(['softnessStrength','vignetteAmount','bloomStrength'].includes(key))
  return Math.round(fx[key]*100);
 return fx[key];
}
export function effectSettingToStored(key,value,clamp=(v,a,b)=>Math.max(a,Math.min(b,v))){
 return ['softnessStrength','vignetteAmount','bloomStrength'].includes(key)?
  clamp(value/100,0,1):value;
}

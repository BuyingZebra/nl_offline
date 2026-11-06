/* NOMAD Tetris V085 — Settings Manager.
 * Owns the existing user preferences and persistence; no rendering or UI
 * dependencies. Historical storage keys and reset behaviour are preserved.
 */
import {DEFAULT_EFFECTS,effectSettingValue,effectSettingToStored}
 from './display-settings-catalog.js?v103';
import {normalizePersistenceMs}
 from './phosphor-model.js?v103';

export const STORAGE_KEYS=Object.freeze({
 effects:'fieldAtlasThreeV027FX01',
 pieceGhost:'fieldAtlasTetrisGhost',
 sound:'fieldAtlasTetrisSound',
 theme:'fieldAtlasThemeV06',
 initials:'fieldAtlasTetrisInitials'
});

export function createSettingsManager(storage){
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const read=(key,fallback)=>{
  try{return storage?.getItem(key)??fallback;}catch(e){return fallback;}
 };
 const write=(key,value)=>{
  try{storage?.setItem(key,String(value));}catch(e){}
 };
 let effects={...DEFAULT_EFFECTS};
 try{
  const saved=JSON.parse(read(STORAGE_KEYS.effects,'null'));
  if(saved&&typeof saved==='object'){
   for(const [key,value] of Object.entries(DEFAULT_EFFECTS)){
    if(typeof saved[key]===typeof value)effects[key]=saved[key];
   }
  }
 }catch(e){}
 // Match the existing V084 migration of out-of-range historical bloom values.
 effects.bloomStrength=clamp(Number(effects.bloomStrength)||0,0,1);
 effects.persistenceMs=normalizePersistenceMs(effects.persistenceMs);
 let pieceGhost=read(STORAGE_KEYS.pieceGhost,'yes')!=='no';
 let soundOn=read(STORAGE_KEYS.sound,'yes')!=='no';
 let theme=read(STORAGE_KEYS.theme,'green')==='amber'?'amber':'green';

 function persistEffects(){
  write(STORAGE_KEYS.effects,JSON.stringify(effects));
 }
 function settingValue(key){
  return effectSettingValue(key,effects,{ghost:pieceGhost,sound:soundOn});
 }
 function setSetting(key,value){
  if(key==='pieceGhost'){
   pieceGhost=Boolean(value);
   write(STORAGE_KEYS.pieceGhost,pieceGhost?'yes':'no');
   return;
  }
  if(key==='sound'){
   soundOn=Boolean(value);
   write(STORAGE_KEYS.sound,soundOn?'yes':'no');
   return;
  }
  if(key==='persistenceMs')value=normalizePersistenceMs(value);
  if(Object.prototype.hasOwnProperty.call(DEFAULT_EFFECTS,key)){
   effects[key]=effectSettingToStored(key,value,clamp);
   persistEffects();
  }
 }
 function chooseScanline(id){
  effects.scanlines=id!=='off';
  if(id!=='off')effects.scanlinePreset=id;
  persistEffects();
 }
 function toggleTheme(){
  theme=theme==='green'?'amber':'green';
  write(STORAGE_KEYS.theme,theme);
  return theme;
 }
 function restoreDefaults(){
  effects={...DEFAULT_EFFECTS};
  persistEffects();
  pieceGhost=true;soundOn=true;
  write(STORAGE_KEYS.pieceGhost,'yes');
  write(STORAGE_KEYS.sound,'yes');
  // The phosphor theme is deliberately not reset in the historical behaviour.
 }
 return Object.freeze({
  get effects(){return effects;},
  get pieceGhost(){return pieceGhost;},
  get soundOn(){return soundOn;},
  get theme(){return theme;},
  settingValue,setSetting,chooseScanline,toggleTheme,restoreDefaults,
  readInitials:()=>read(STORAGE_KEYS.initials,'AAA'),
  saveInitials:value=>write(STORAGE_KEYS.initials,value)
 });
}

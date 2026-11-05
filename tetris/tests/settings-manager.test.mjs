/* V085 regression coverage: original V083 defaults and persistent preferences.
 * Run with Node 22+: node --test tetris/tests/settings-manager.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsManager,STORAGE_KEYS} from '../settings-manager.js';
import {DEFAULT_EFFECTS} from '../display-settings-catalog.js';

function memoryStorage(initial={}){
 const data=new Map(Object.entries(initial));
 return {
  data,
  getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>{data.set(key,String(value));}
 };
}

test('original visual defaults, sound and ghost settings are unchanged',()=>{
 const settings=createSettingsManager(memoryStorage());
 assert.deepEqual(settings.effects,DEFAULT_EFFECTS);
 assert.equal(settings.pieceGhost,true);
 assert.equal(settings.soundOn,true);
 assert.equal(settings.theme,'green');
});

test('slider values are stored using the original percent scaling',()=>{
 const storage=memoryStorage(),settings=createSettingsManager(storage);
 settings.setSetting('bloomStrength',35);
 assert.equal(settings.effects.bloomStrength,.35);
 assert.equal(JSON.parse(storage.data.get(STORAGE_KEYS.effects)).bloomStrength,.35);
});

test('all historical preference storage keys remain compatible',()=>{
 const storage=memoryStorage();
 const settings=createSettingsManager(storage);
 settings.setSetting('pieceGhost',false);
 settings.setSetting('sound',false);
 settings.toggleTheme();
 assert.equal(storage.data.get(STORAGE_KEYS.pieceGhost),'no');
 assert.equal(storage.data.get(STORAGE_KEYS.sound),'no');
 assert.equal(storage.data.get(STORAGE_KEYS.theme),'amber');
 assert.equal(settings.pieceGhost,false);
 assert.equal(settings.soundOn,false);
 assert.equal(settings.theme,'amber');
});

test('scanline Off retains the selected pattern for later use',()=>{
 const settings=createSettingsManager(memoryStorage());
 settings.chooseScanline('off');
 assert.equal(settings.effects.scanlines,false);
 assert.equal(settings.effects.scanlinePreset,'aperture');
 settings.chooseScanline('dot');
 assert.equal(settings.effects.scanlines,true);
 assert.equal(settings.effects.scanlinePreset,'dot');
});

test('Restore Defaults resets effects/ghost/sound but not phosphor theme',()=>{
 const settings=createSettingsManager(memoryStorage());
 settings.setSetting('ghost',true);
 settings.setSetting('pieceGhost',false);
 settings.setSetting('sound',false);
 settings.toggleTheme();
 settings.restoreDefaults();
 assert.deepEqual(settings.effects,DEFAULT_EFFECTS);
 assert.equal(settings.pieceGhost,true);
 assert.equal(settings.soundOn,true);
 assert.equal(settings.theme,'amber');
});

test('legacy saved effects load by matching value types and clamp bloom',()=>{
 const storage=memoryStorage({
  [STORAGE_KEYS.effects]:JSON.stringify({
   bloomStrength:3,scanlineOpacity:67,ghost:'invalid',softnessRadius:4
  }),
  [STORAGE_KEYS.pieceGhost]:'no',
  [STORAGE_KEYS.theme]:'amber'
 });
 const settings=createSettingsManager(storage);
 assert.equal(settings.effects.bloomStrength,1);
 assert.equal(settings.effects.scanlineOpacity,67);
 assert.equal(settings.effects.ghost,false);
 assert.equal(settings.effects.softnessRadius,4);
 assert.equal(settings.pieceGhost,false);
 assert.equal(settings.theme,'amber');
});

test('score initials remain at their original preference key',()=>{
 const storage=memoryStorage();
 const settings=createSettingsManager(storage);
 assert.equal(settings.readInitials(),'AAA');
 settings.saveInitials('MRC');
 assert.equal(settings.readInitials(),'MRC');
 assert.equal(storage.data.get(STORAGE_KEYS.initials),'MRC');
});

test('settings work if local persistence throws',()=>{
 const settings=createSettingsManager({
  getItem(){throw Error('access blocked');},
  setItem(){throw Error('quota exceeded');}
 });
 settings.setSetting('sound',false);
 assert.equal(settings.soundOn,false);
 settings.restoreDefaults();
 assert.equal(settings.soundOn,true);
 assert.deepEqual(settings.effects,DEFAULT_EFFECTS);
});


test('V099 uses two bounded continuous sliders and persists both settings',()=>{
 const store=memoryStorage(),settings=createSettingsManager(store);
 assert.equal(settings.effects.persistence,true);
 assert.equal(settings.effects.scanRefreshHz,60);
 assert.equal(settings.effects.persistenceMs,190);
 settings.setSetting('scanRefreshHz',87);
 settings.setSetting('persistenceMs',560);
 assert.equal(settings.effects.scanRefreshHz,87);
 assert.equal(settings.effects.persistenceMs,560);
 settings.setSetting('persistence',false);
 const reopened=createSettingsManager(store);
 assert.equal(reopened.effects.scanRefreshHz,87);
 assert.equal(reopened.effects.persistenceMs,560);
 assert.equal(reopened.effects.persistence,false);
 reopened.restoreDefaults();
 assert.equal(reopened.effects.scanRefreshHz,60);
 assert.equal(reopened.effects.persistenceMs,190);
 assert.equal(reopened.theme,'green');
});
test('range extremes clamp and older profile strings cannot enter settings',()=>{
 const store=memoryStorage(),settings=createSettingsManager(store);
 settings.setSetting('scanRefreshHz',999);
 assert.equal(settings.effects.scanRefreshHz,120);
 settings.setSetting('scanRefreshHz',-40);
 assert.equal(settings.effects.scanRefreshHz,30);
 settings.setSetting('persistenceMs',90000);
 assert.equal(settings.effects.persistenceMs,2000);
 settings.setSetting('persistenceMs',0);
 assert.equal(settings.effects.persistenceMs,10);
 settings.setSetting('persistenceMs',193);
 assert.equal(settings.effects.persistenceMs,190);
 settings.setSetting('persistenceProfile','p39');
 assert.equal('persistenceProfile' in settings.effects,false);
});
test('legacy P39 profile selection migrates harmlessly to custom decay',()=>{
 const store=memoryStorage({
  [STORAGE_KEYS.effects]:JSON.stringify({
   persistenceProfile:'p39',scanRefreshHz:75,persistence:true
  })
 });
 const effects=createSettingsManager(store).effects;
 assert.equal(effects.persistenceMs,190);
 assert.equal(effects.scanRefreshHz,75);
 assert.equal(effects.persistence,true);
 assert.equal('persistenceProfile' in effects,false);
});

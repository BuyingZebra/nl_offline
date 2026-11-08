/* V085 regression coverage: original V083 defaults and persistent preferences.
 * Run with Node 22+: node --test tetris/tests/settings-manager.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsManager,STORAGE_KEYS} from '../settings-manager.js';
import fs from 'node:fs';
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


test('V103 persists and caps decay at 120ms with no scan refresh control',()=>{
 const store=memoryStorage(),settings=createSettingsManager(store);
 assert.equal(settings.effects.persistence,true);
 assert.equal(settings.effects.persistenceMs,120);
 assert.equal('scanRefreshHz' in settings.effects,false);
 settings.setSetting('persistenceMs',80);
 assert.equal(settings.effects.persistenceMs,80);
 settings.setSetting('persistence',false);
 const reopened=createSettingsManager(store);
 assert.equal(reopened.effects.persistenceMs,80);
 assert.equal(reopened.effects.persistence,false);
 reopened.restoreDefaults();
 assert.equal(reopened.effects.persistenceMs,120);
 assert.equal('scanRefreshHz' in reopened.effects,false);
 assert.equal(reopened.theme,'green');
});
test('decay setting clamps; removed scanning options are ignored',()=>{
 const store=memoryStorage(),settings=createSettingsManager(store);
 settings.setSetting('persistenceMs',90000);
 assert.equal(settings.effects.persistenceMs,120);
 settings.setSetting('persistenceMs',0);
 assert.equal(settings.effects.persistenceMs,10);
 settings.setSetting('persistenceMs',193);
 assert.equal(settings.effects.persistenceMs,120);
 settings.setSetting('scanRefreshHz',120);
 settings.setSetting('persistenceProfile','p39');
 assert.equal('scanRefreshHz' in settings.effects,false);
 assert.equal('persistenceProfile' in settings.effects,false);
});
test('stored V102 settings above 120 ms migrate to the new ceiling',()=>{
 const old=memoryStorage({
  [STORAGE_KEYS.effects]:JSON.stringify({
   persistenceProfile:'p39',scanRefreshHz:75,persistence:true,persistenceMs:460
  })
 });
 const settings=createSettingsManager(old);
 assert.equal(settings.effects.persistenceMs,120);
 assert.equal('scanRefreshHz' in settings.effects,false);
 assert.equal(settings.effects.persistence,true);
});
test('a prior saved decay at 190ms is automatically clamped to 120ms',()=>{
 const stored=memoryStorage({
  [STORAGE_KEYS.effects]:JSON.stringify({persistence:true,persistenceMs:190})
 });
 const settings=createSettingsManager(stored);
 assert.equal(settings.effects.persistenceMs,120);
 settings.setSetting('persistenceMs',120);
 assert.equal(createSettingsManager(stored).effects.persistenceMs,120);
});

test('V161 restores the original green/amber phosphor cycle',()=>{
 const storage=memoryStorage();
 const settings=createSettingsManager(storage);
 assert.equal(settings.theme,'green');
 assert.equal(settings.toggleTheme(),'amber');
 assert.equal(settings.toggleTheme(),'green');
 assert.equal(storage.data.get(STORAGE_KEYS.theme),'green');
 const savedBlue=memoryStorage({[STORAGE_KEYS.theme]:'blue'});
 const reopened=createSettingsManager(savedBlue);
 assert.equal(reopened.theme,'green','obsolete V160 blue falls back to green');
 assert.equal(reopened.toggleTheme(),'amber');
});
test('V161 removes the blue tint without changing original emissive ratios',()=>{
 const source=fs.readFileSync(new URL('../compositor.js',import.meta.url),'utf8');
 assert.match(source,/green:new THREE\.Vector3\(\.2,1,\.2\)/);
 assert.match(source,/amber:new THREE\.Vector3\(185\/255,79\/255,9\/255\)/);
 assert.doesNotMatch(source,/blue:new THREE\.Vector3/);
 assert.match(source,/tint\.uniforms\.uTint\.value\.copy\(hues\[theme\]\|\|hues\.green\)/);
});

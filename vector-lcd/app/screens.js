/* The screens the app offers, and how to load them.
 *
 * To add a screen (a new phosphor, say): build its profile into profiles/,
 * add an entry to SCREENS with the kind that renders it, and list the profile
 * in sw.js. Its button appears under its family on its own. */

import * as tn from '../screens/tn/index.js';
import * as dmg from '../screens/dmg/index.js';
import * as crt from '../screens/crt/index.js';


/**
 * What a screen kind tells the app (screens/<kind>/definition.js).
 * @typedef {Object} ScreenDefinition
 * @property {'original'|'fourTone'} tiles            which version of the tile art it shows
 * @property {boolean} usesElectrodes                   whether the glass has an electrode map
 * @property {(renderer:Object) => void} prepare        reset settings that only some profiles change
 * @property {(P:Object) => DeviceControl[]} device     the real device's controls, and only those
 * @property {(P:Object) => string} deviceNote
 * @property {(P:Object) => (number[]|null)} temperatureRange  valid panel temperatures, or null
 * @property {string} temperatureNote
 * @property {string} lightNote
 * @property {(P:Object) => string} driveNote           shown on the Info tab
 * @property {(P:Object, renderer:Object) => string[][]} facts  [label, value] rows for the Info tab
 *
 * @typedef {Object} DeviceControl
 * @property {string} key  @property {string} label
 * @property {number} min  @property {number} max  @property {number} step  @property {number} initial
 * @property {(v:number) => string} format
 * @property {(renderer:Object, v:number) => void} apply
 *
 * @typedef {Object} Screen
 * @property {string} id        the profile's id (profiles/<id>.json)
 * @property {'tn'|'dmg'|'crt'} kind
 * @property {'lcd'|'crt'} family
 * @property {string} short     its button
 * @property {string[]} sub     the two lines beside the card title
 * @property {string} label     its full name
 */

export const KINDS = Object.freeze({tn, dmg, crt});

export const FAMILIES = Object.freeze({
 lcd: Object.freeze({title: 'LCD', picker: 'Panel'}),
 crt: Object.freeze({title: 'CRT', picker: 'Phosphor'})
});

/** @type {readonly Screen[]} */
export const SCREENS = Object.freeze([
 {id: 'reflective-tn', kind: 'tn', family: 'lcd', short: 'TN static', sub: ['Reflective TN', 'Static drive · VI-402'],
  label: 'Reflective TN · static drive (VI-402)'},
 {id: 'reflective-tn-mux4', kind: 'tn', family: 'lcd', short: 'TN 1/4 mux', sub: ['Reflective TN', '1/4 mux · Lumex'],
  label: 'Reflective TN · multiplexed 1/4 duty (Lumex)'},
 {id: 'dmg-01-stn', kind: 'dmg', family: 'lcd', short: 'DMG-01', sub: ['Reflective STN', '4 shades · DMG-01'],
  label: 'Reflective STN · Nintendo DMG-01, 4 shades (Retro Display Lab)'},
 {id: 'crt-5151-p39', kind: 'crt', family: 'crt', short: 'P39 green', sub: ['Green phosphor', 'P39 · IBM 5151'],
  label: 'Green phosphor CRT · IBM 5151, P39'}
].map(Object.freeze));


// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export const screenById = id => SCREENS.find(s => s.id === id) ?? SCREENS[0];
export const screensIn = family => SCREENS.filter(s => s.family === family);
export const kindOf = screen => KINDS[screen.kind];


// ---------------------------------------------------------------------------
// Profiles: fetched once, checked against their kind's required fields
// ---------------------------------------------------------------------------

const profiles = new Map();

export async function loadProfile(screen) {
 if (!profiles.has(screen.id)) {
  const response = await fetch(new URL('../profiles/' + screen.id + '.json', import.meta.url));
  if (!response.ok) throw new Error('Could not load the screen profile ' + screen.id + ' (' + response.status + ')');
  profiles.set(screen.id, kindOf(screen).checkProfile(await response.json()));
 }
 return profiles.get(screen.id);
}

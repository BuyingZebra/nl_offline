/* Vectrex vector display, as the app presents it. No logic: the console's one
 * picture control, the notes, and where every number on the Info tab comes from. */

import {refreshHz} from './model.js';

/** @type {import('../../app/screens.js').ScreenDefinition} */
export const definition = Object.freeze({
 tiles: 'fourTone',               // unused: the game is drawn as lines
 vectors: true,                   // content comes as a display list, not a picture
 usesElectrodes: false,

 prepare() {},


 // ---- On the device --------------------------------------------------------

 device: P => [{
  key: 'brightness', label: 'Brightness knob', min: P.controls.brightness.min, max: P.controls.brightness.max, step: .01,
  initial: P.controls.brightness.value,
  format: v => Math.round(v * 100) + '% beam',
  apply: (renderer, v) => renderer.setBrightness(v)
 }],
 deviceNote: () => 'The Vectrex\'s one picture control: the brightness knob on the back sets the beam current.',


 // ---- Surroundings ---------------------------------------------------------

 temperatureRange: () => null,
 roomLight: P => ({
  min: 0, max: 500, step: 5, initial: P.luminance.room_lux,
  format: lux => lux + ' lx · ' + (lux === 0 ? 'dark room' : lux < 200 ? 'dim room' : lux < 400 ? 'lit room' : 'office lighting'),
  apply: (renderer, lux) => renderer.setRoomLux(lux)
 }),
 roomNote: 'The lines make their own light; the room only greys the glass. Vector games were played in dim rooms, where the lines glow on black.',
 temperatureNote: '',
 lightNote: 'The light moves the bezel shadow and the glare on the glass.',


 // ---- Info tab -----------------------------------------------------------------

 driveNote: () => 'No raster: the beam draws each line directly, 50 times a second. Every line has the same brightness per millimetre, '
  + 'with a brighter dot where the beam stops at its end. Draw too many lines and the refresh slows: the picture dims and flickers.',

 facts(P, renderer) {
  const n = renderer.vectorCount ?? 0, hz = refreshHz(P, n);
  return [
   ...P.facts,
   ['This frame', n + ' vectors: ' + (hz >= 49.9 ? 'within the 1/50 s round' : 'over the round: refresh ' + hz.toFixed(1) + ' Hz, dimmer and flickering')],
   ['Per vector (derived)', (P.timing.vector_s * 1e6).toFixed(1) + ' µs: the 1/50 s round over the middle of the 200-400 budget'],
   ['Beam (assumed)', 'one speed for every line, ' + (P.beam.speed_mm_per_s / 1e6).toFixed(2) + ' mm/µs on the tube; spot σ ' + P.beam.sigma_mm + ' mm; end dot = ' + (P.beam.dwell_s * 1e6).toFixed(2) + ' µs of a stopped beam'],
   ['Phosphor (assumed)', P.phosphor.type + '; ' + P.phosphor.persistence],
   ['Picture (assumed)', P.picture.width_mm + ' × ' + P.picture.height_mm + ' mm: ' + P.picture.note],
   ['Not modelled', 'colour overlays, halation, the integrator\'s drift and the beam\'s moves between objects'],
  ];
 }
});

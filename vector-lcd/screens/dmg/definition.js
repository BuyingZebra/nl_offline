/* DMG-01 STN, as the app presents it. No logic: the device's one picture
 * control, the notes, and where every number on the Info tab comes from. */

import {shadowKernel} from '../../optics/room.js';

/** @type {import('../../app/screens.js').ScreenDefinition} */
export const definition = Object.freeze({
 tiles: 'fourTone',               // four drive levels: the 4-tone tiles
 usesElectrodes: false,           // a dot matrix drives every point

 prepare() {},


 // ---- On the device --------------------------------------------------------

 device: P => [{
  key: 'contrast', label: 'Contrast wheel', min: P.contrast.min, max: P.contrast.max, step: .01, initial: P.contrast.value,
  format: v => '×' + v.toFixed(2) + ' drive',
  apply: (renderer, v) => renderer.setContrast(v)
 }],
 deviceNote: () => 'The DMG-01\'s only picture control: its contrast wheel sets the LCD drive voltage.',


 // ---- Surroundings ---------------------------------------------------------

 /** A reflective panel shows only the room's own light: a brighter or dimmer
  * room changes nothing your adapting eye sees, so there is no room control. */
 roomLight: () => null,
 roomNote: '',

 temperatureRange: P => P.temperature.range_C,
 temperatureNote: 'Cold crystal is slower and smears more; warm crystal is faster. Valid 10–30 °C, the range of the source model.',
 /** An inspection switch for the reflector shadow (not a property of the device or the room). */
 shadowSwitch: true,
 lightNote: 'Light at an angle crosses the crystal at one point on the way in and another on the way out, so each shape casts a shadow away from the light. '
  + 'The light also moves the bezel shadow and the glare.',


 // ---- Info tab -----------------------------------------------------------------

 driveNote: () => 'Four shades on one STN panel. Moving pieces smear and fade as the crystal catches up, like the original screen. '
  + 'The contrast wheel changes the drive voltage.',

 facts(P, renderer) {
  const R = P.retention, A = P.attribution, G = P.sources.geometry, i = renderer.info();
  const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  const k = shadowKernel(P, renderer.lighting), offset = Math.hypot(k.mean.x, k.mean.y);
  return [
   ['Model', P.name],
   ['Data', 'Retro Display Lab (' + A.license + ', ' + A.copyright + '); used without changing any value'],
   ['Shades', '4 drive levels; art is quantized by brightness (white, light, dark, black)'],
   ['Panel dots (adapted)', i.dotsPerPixel + ' × ' + i.dotsPerPixel + ' per screen pixel, ' + Math.round(i.dotPitchUm) + ' µm apart, '
    + 'finer than the DMG\'s 160 × 144 so modern vector art stays clean. Every dot is driven at one of the four real levels; '
    + 'a screen pixel shows the average light of its dots'],
   ['Palette (measured)', 'BGB DMG reality samples: ' + P.palette.srgb8.shades.map(hex).join(', ')],
   ['Drive', '1/' + P.panel.dots[1] + ' duty passive matrix, ' + P.panel.refresh_hz + ' Hz frames; rms reconstruction (' + P.drive.nonselect_rms_V + ' V nonselect, nominal)'],
   ['Response', 'STN director drift per frame from a Frank–Oseen/Ericksen–Leslie reduction; about ' + Math.round(P.stn.t90_s.darkening * 1000) + ' ms to 90% at 20 °C'],
   ['Contrast wheel', '×' + P.contrast.min.toFixed(2) + ' to ×' + P.contrast.max.toFixed(2) + ' drive, the range measured at the ends of a real '
    + 'DMG wheel (one board: −11 V and −14 V against −13 V for good contrast). Solved every 0.01 with the source\'s own solver '
    + '(tools/dmg01_wheel.mjs; the source tabulates 0.88, 1.00 and 1.08): the picture fades in from ×0.92 to ×1.00, and turning it up darkens '
    + 'every shade while they stay distinct, beyond the measured palette by the solver\'s luminance'],
   ['Temperature', P.temperature.range_C.join('–') + ' °C; viscosity activation ' + P.temperature.activation_K + ' K'],
   ['Sticking', 'ions charge under dark drive (~' + Math.round(1 / (R.charge_per_frame * P.panel.refresh_hz)) + ' s) and release slowly (~'
    + Math.round(1 / (R.release_per_frame * P.panel.refresh_hz) / 60) + ' min), leaving a faint image'
    + (i.retention ? '' : ' (off: needs 32-bit float targets)')],
   ['Reflector shadow', 'light crosses the crystal twice, entering ' + (offset * 1000).toFixed(0) + ' µm from where it leaves at this light angle '
    + '(refraction through ' + G.glass_mm + ' mm glass and a ' + G.rear_polarizer_mm + ' mm polarizer, assumed), softened by the light\'s size; '
    + 'each pass carries the square root of the measured colour'],
   ['Not used', 'the 160×144 dot grid, its row/column crosstalk and row-latch timing (they need the grid); '
    + 'the source\'s shadow strength and offset, which it fitted to an idealized drawing'],
   ['Glare', 'glossy front surface, Fresnel n = ' + P.oblique.front_index + ' (assumed)'],
   ['Bezel (assumed)', renderer.bezelLipMm + ' mm lip; front glass ' + G.glass_mm + ' mm (DMG value not published)'],
   ['Limits', P.limitations[0]]
  ];
 }
});

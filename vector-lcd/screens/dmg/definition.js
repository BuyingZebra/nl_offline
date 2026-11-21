/* DMG-01 STN, as the app presents it. No logic: the device's one picture
 * control, the notes, and where every number on the Info tab comes from. */

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

 temperatureRange: P => P.temperature.range_C,
 temperatureNote: 'Cold crystal is slower and smears more; warm crystal is faster. Valid 10–30 °C, the range of the source model.',
 lightNote: 'The light moves the bezel shadow and the glare. The DMG\'s reflector shadow keeps its measured offset (light from the upper left).',


 // ---- Info tab -----------------------------------------------------------------

 driveNote: () => 'Four shades on one STN panel. Moving pieces smear and fade as the crystal catches up, like the original screen. '
  + 'The contrast wheel changes the drive voltage.',

 facts(P, renderer) {
  const off = P.shadow.offset_dots, R = P.retention, A = P.attribution;
  const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  const um = (dots, i) => (dots * P.panel.active_mm[i] / P.panel.dots[i] * 1000).toFixed(0);
  return [
   ['Model', P.name],
   ['Data', 'Retro Display Lab (' + A.license + ', ' + A.copyright + '); used without changing any value'],
   ['Shades', '4 drive levels; art is quantized by brightness (white, light, dark, black)'],
   ['Palette (measured)', 'BGB DMG reality samples: ' + P.palette.srgb8.shades.map(hex).join(', ')],
   ['Drive', '1/' + P.panel.dots[1] + ' duty passive matrix, ' + P.panel.refresh_hz + ' Hz frames; rms reconstruction (' + P.drive.nonselect_rms_V + ' V nonselect, nominal)'],
   ['Response', 'STN director drift per frame from a Frank–Oseen/Ericksen–Leslie reduction; about ' + Math.round(P.stn.t90_s.darkening * 1000) + ' ms to 90% at 20 °C'],
   ['Contrast wheel', '×' + P.contrast.min + ' to ×' + P.contrast.max + ' drive; the source tabulates ' + P.contrast.conditions.join(', ')],
   ['Temperature', P.temperature.range_C.join('–') + ' °C; viscosity activation ' + P.temperature.activation_K + ' K'],
   ['Sticking', 'ions charge under dark drive (~' + Math.round(1 / (R.charge_per_frame * P.panel.refresh_hz)) + ' s) and release slowly (~'
    + Math.round(1 / (R.release_per_frame * P.panel.refresh_hz) / 60) + ' min), leaving a faint image'
    + (renderer.info().retention ? '' : ' (off: needs 32-bit float targets)')],
   ['Reflector shadow (measured)', Math.round(P.shadow.strength * 100) + '% strength, offset ' + off[0] + ' × ' + off[1] + ' dot = ' + um(off[0], 0) + ' × ' + um(off[1], 1) + ' µm'],
   ['Not used', 'the 160×144 dot grid, its row/column crosstalk and row-latch timing (they need the grid)'],
   ['Glare', 'glossy front surface, Fresnel n = ' + P.oblique.front_index + ' (assumed)'],
   ['Bezel (assumed)', renderer.bezelLipMm + ' mm lip; front glass ' + P.sources.geometry.glass_mm + ' mm (DMG value not published)'],
   ['Limits', P.limitations[0]]
  ];
 }
});

/* Reflective TN, as the app presents it. No logic: what the device's controls
 * are, what the notes say, and where every number on the Info tab comes from.
 * The app builds its control panel from this (see app/controls.js).
 *
 * One definition covers both TN profiles: the multiplexed one has a contrast
 * trim (VLCD); the static one has no controls of its own. */

const isMultiplexed = P => Boolean(P.drive.uses_electrode_map);


/** @type {import('../../app/screens.js').ScreenDefinition} */
export const definition = Object.freeze({
 tiles: 'original',               // one ink colour: the art as authored, darker than 50% switches on
 usesElectrodes: true,

 /** Every TN profile starts from the datasheet's own drive. */
 prepare(renderer) {
  renderer.setMode('static');
  renderer.setDriveGain(1);
 },


 // ---- On the device --------------------------------------------------------

 device(P) {
  if (!isMultiplexed(P)) return [];
  // Both rms voltages are fixed fractions of VLCD (1/4 duty, 1/3 bias), so the
  // trim scales the whole drive; the cell, crystal and optics stay as profiled.
  const d = P.derived, kOn = d.on_rms_V / d.vlcd_V, kOff = d.off_rms_V / d.vlcd_V;
  return [{
   key: 'vlcd', label: 'Contrast trim (VLCD)', min: 2.6, max: 4.2, step: .01, initial: d.vlcd_V,
   format: v => v.toFixed(2) + ' V · ' + (v * kOn).toFixed(2) + ' / ' + (v * kOff).toFixed(2) + ' V rms',
   apply: (renderer, v) => renderer.setDriveGain(v / d.vlcd_V)
  }];
 },

 deviceNote(P) {
  if (!isMultiplexed(P)) return 'The VI-402 is bare glass on a fixed 3.0 V static drive. It has no controls of its own.';
  const d = P.derived;
  return 'Multiplexed panels run from one supply, VLCD, which products expose as a contrast trimmer. On and off voltages both scale with it ('
   + (d.on_rms_V / d.vlcd_V).toFixed(3) + ' and ' + (d.off_rms_V / d.vlcd_V).toFixed(3) + ' × VLCD). Default '
   + d.vlcd_V.toFixed(2) + ' V, this cell\'s contrast optimum.';
 },


 // ---- Surroundings ---------------------------------------------------------

 /** A reflective panel shows only the room's own light: a brighter or dimmer
  * room changes nothing your adapting eye sees, so there is no room control. */
 roomLight: () => null,
 roomNote: '',

 temperatureRange: P => P.temperature?.range_C ?? [15, 40],
 temperatureNote: 'Cold liquid crystal is slower; warm crystal is faster and shifts the panel\'s colour.',
 lightNote: 'Light at an angle enters the glass at one point and leaves at another, casting a shadow under each shape. '
  + 'The bezel frame above the glass also shades the edges that face the light.',


 // ---- Info tab -----------------------------------------------------------------

 driveNote(P) {
  const d = P.derived;
  return isMultiplexed(P)
   ? 'One ink colour, multiplexed: every electrode point gets ' + d.on_rms_V.toFixed(2) + ' V rms when on and ' + d.off_rms_V.toFixed(2)
    + ' V rms when off, so unlit segments stay faintly visible. Areas with no electrode get no voltage.'
   : 'One ink colour, as on the datasheet panel: every point is fully on (3.0 V) or off. Art darker than 50% switches on.';
 },

 facts(P, renderer) {
  const src = P.sources, der = P.derived, mux = isMultiplexed(P);
  const cone = P.oblique.viewing_cone_CR2_deg;
  const facts = [
   ['Panel', mux ? src.panel_multiplexed.part + '; cell and response from the ' + src.panel.part.split(' (')[0] : src.panel.part],
   ['Response (datasheet)', src.panel.rise_ms_typ + ' ms on, ' + src.panel.decay_ms_typ + ' ms off' + (mux ? ' (static drive)' : '')],
   ['Contrast', mux ? der.contrast_final.toFixed(1) + ':1 (computed for this drive)' : src.panel.contrast_typ + ':1 (datasheet)'],
   ['Drive', mux
    ? '1/4 duty, 1/3 bias (Lumex datasheet), ' + der.vlcd_V.toFixed(2) + ' V AC: ' + der.on_rms_V.toFixed(2) + ' V rms on, ' + der.off_rms_V.toFixed(2) + ' V rms off (computed)'
    : src.panel.Vop_typ + ' V, static: one ink colour, each point on or off (datasheet)'],
   ['Liquid crystal', src.liquid_crystal.material],
   ['Cell gap (derived)', der.cell_gap_um + ' µm, first transmission maximum'],
   ['Threshold (derived)', der.Vth_theory_V.toFixed(2) + ' V'],
   ['Polarizer', src.polarizer.part],
   ['Reflectance (computed)', Math.round(der.luminance_off * 100) + '% unlit, ' + (der.luminance_on * 100).toFixed(1) + '% driven'
    + (mux ? ', ' + (der.luminance_off_segment * 100).toFixed(1) + '% unlit segment' : '')],
   ['Unlit colour (computed)', der.color_off_hex],
   ['Front-surface reflection', (der.front_surface_reflectance * 100).toFixed(1) + '%, solved to match the datasheet contrast'],
   ['Rear glass', src.geometry.glass_mm + ' mm' + (mux ? ', confirmed by the Lumex drawing' : ', inferred from panel depth')],
   ['Pretilt (assumed)', src.geometry.pretilt_deg + '°, typical value'],
   ['Viewing cone (computed)', 'contrast ≥ 2 to ' + cone.bottom + '° below, ' + cone.top + '° above, ' + cone.left + '° sides'],
   ['Viewing cone (datasheet)', '70° below, 35° above, 70° sides'],
   ['Glare', 'glossy front surface, Fresnel n = ' + P.oblique.front_index + ' (assumed untreated polarizer)'],
   ['Temperature', '15–40 °C from measured E7 viscosity (Merck) and refractive indices (Li, Wu et al.)'],
   ['Room light (fixed)', '15° wide, as a typical lamp; normal room brightness'],
   ['Viewing (fixed)', 'straight on, eye 300 mm away'],
   ['Bezel (assumed)', renderer.bezelLipMm + ' mm above the front polarizer; front glass ' + src.geometry.glass_mm + ' mm']
  ];
  if (mux) facts.splice(4, 0,
   ['Drive sources', src.drive.refs.join('; ')],
   ['Supply (computed)', der.vlcd_V.toFixed(2) + ' V, the contrast optimum for this cell. The Lumex part\'s ' + der.vlcd_datasheet_V.toFixed(1)
    + ' V suits its own crystal; on this one it under-drives the ink (bluish, contrast ' + der.contrast_at_datasheet_V.toFixed(1) + ':1)']);
  return facts;
 }
});

/* IBM 5151 CRT, as the app presents it. No logic: the monitor's two front
 * knobs, the notes, and where every number on the Info tab comes from.
 *
 * A new phosphor is a new profile of this kind: its colours, decay and Info
 * facts all come from the profile (phosphor.layers, .impulse, .facts). */

/** @type {import('../../app/screens.js').ScreenDefinition} */
export const definition = Object.freeze({
 tiles: 'fourTone',               // four TTL levels: the 4-tone tiles
 usesElectrodes: false,           // a raster reaches every point

 prepare() {},


 // ---- On the device --------------------------------------------------------

 device: P => [
  {
   key: 'brightness', label: 'Brightness knob', min: P.controls.brightness.min, max: P.controls.brightness.max, step: .005,
   initial: P.controls.brightness.value,
   format: v => v === 0 ? 'raster off' : Math.round(v * 100) + '% beam',
   apply: (renderer, v) => renderer.setBrightness(v)
  },
  {
   key: 'contrast', label: 'Contrast knob', min: P.controls.contrast.min, max: P.controls.contrast.max, step: .01,
   initial: P.controls.contrast.value,
   format: v => Math.round(v * 100) + '% video',
   apply: (renderer, v) => renderer.setContrast(v)
  }
 ],
 deviceNote: () => 'The IBM 5151\'s two front knobs. Brightness lights the whole raster; contrast sets the video signal.',


 // ---- Surroundings ---------------------------------------------------------

 temperatureRange: () => null,    // the phosphor's decay does not depend on room temperature here

 /** Room brightness: a CRT makes its own light, so the room only adds its
  * reflection. A dark room shows the afterglow that a lit room drowns. */
 roomLight: P => ({
  min: 0, max: 500, step: 5, initial: P.luminance.room_lux,
  format: lux => lux + ' lx · ' + (lux === 0 ? 'dark room' : lux < 50 ? 'dim, as radar rooms were' : lux < 200 ? 'dim room' : lux < 400 ? 'lit room' : 'office lighting'),
  apply: (renderer, lux) => renderer.setRoomLux(lux)
 }),
 roomNote: 'A dark room lets the afterglow show: the room\'s reflection off the glass no longer hides it. '
  + 'The phosphor\'s own light is the same in any room; your eye adapts to the screen.',
 temperatureNote: '',
 lightNote: 'The screen makes its own light. The room light only greys the glass and the phosphor behind it, '
  + 'and the bezel shades the edges that face it.',


 // ---- Info tab -----------------------------------------------------------------

 driveNote: P => 'The beam sweeps ' + P.timing.lines_visible + ' lines ' + Math.round(P.timing.refresh_hz) + ' times a second. '
  + 'The phosphor glows long after the beam passes, so moving pieces leave fading trails. Brightness lights the whole raster; contrast sets the signal.',

 /** The monitor's facts, then the phosphor's own (from its profile). */
 facts(P) {
  const T = P.timing, F = P.faceplate, R = P.raster;
  return [
   ['Monitor', 'IBM 5151: 11.5 in, 90° CRT, etched anti-glare face, brightness and contrast knobs'],
   ['Scan (MDA)', (T.horizontal_hz / 1000).toFixed(3) + ' kHz lines, ' + T.refresh_hz.toFixed(2) + ' Hz frames, ' + T.lines_visible + ' of ' + T.lines_total + ' lines shown; the panel height is the 350 lines'],
   ['Signal', 'TTL: video 2/3 + intensity 1/3 of the luminance, 4 levels; free to switch anywhere along a line (no pixels)'],
   ...P.phosphor.facts,
   ['Spot (measured, similar tube)', 'σ ' + (P.spot.sigma_mm * 1000).toFixed(0) + ' µm from 1300-line resolution of Philips 31 cm 90° tubes; scanlines ' + (R.pitch_mm * 1000).toFixed(0) + ' µm apart'],
   ['Picture (assumed)', R.height_mm + ' mm tall raster (Philips 31 cm useful height); the 5151\'s own size is not published'],
   ['Faceplate', '~50% transmission (Philips); n ' + F.n + '; ' + F.thickness_mm + ' mm thick (assumed); halation returns ' + (F.halation.total * 100).toFixed(1) + '% of the light 18 mm and more away'],
   ['Room light', 'screen reflectance ' + F.screen_reflectance + ' (assumed) through the glass twice, plus the etched surface: ' + Math.round(F.ambient_reflectance * 100) + '% of a white card'],
   ['Brightness (assumed)', P.luminance.full_drive_cd_m2 + ' cd/m² at full drive (20 fL, the level the Philips and P39 measurements use)'],
   ['Room light', 'set by Room brightness, 0 to 500 lx (default ' + P.luminance.room_lux + ' lx). Only the glass\'s reflection scales with it; the phosphor\'s light does not'],
   ['Exposure', 'set so the brightest line core at full drive just reaches the display\'s maximum, as your eye adapts to a lit screen; all brightness ratios are kept'],
   ['Not modelled', 'screen curvature and geometry, focus and spot growth with beam current, retrace, burn-in']
  ];
 }
});

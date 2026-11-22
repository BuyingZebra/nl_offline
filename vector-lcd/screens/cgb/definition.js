/* Game Boy Color CGB-001, as the app presents it. No logic: the device has no
 * picture control, so only the notes and where every number on the Info tab
 * comes from. */

/** @type {import('../../app/screens.js').ScreenDefinition} */
export const definition = Object.freeze({
 tiles: 'colour',                 // RGB555 art: the colour tiles
 usesElectrodes: false,           // an active matrix drives every pixel

 prepare() {},


 // ---- On the device --------------------------------------------------------

 device: () => [],
 deviceNote: () => 'The Game Boy Color has no contrast or brightness control: what you see is the panel and the room light.',


 // ---- Surroundings ---------------------------------------------------------

 /** A reflective panel shows only the room's own light: a brighter or dimmer
  * room changes nothing your adapting eye sees, so there is no room control. */
 roomLight: () => null,
 roomNote: '',

 temperatureRange: () => null,     // no temperature data for this panel
 temperatureNote: '',
 lightNote: 'The light moves the bezel shadow and the glare. The reflector is inside the panel, so there is no drop shadow; '
  + 'the colours are measured with the light at 45° and do not change with its angle here.',


 // ---- Info tab -----------------------------------------------------------------

 driveNote: () => 'A reflective colour TFT with no light of its own: pale, low-contrast colours from the room light, '
  + 'red, green and blue stripes in every pixel, and a short smear as moving pieces settle.',

 facts(P) {
  const A = P.attribution, Y = xyz => Math.round(xyz[1] * 100), ms = P.response.t10to90_ms, B = P.response.bounds_ms;
  return [
   ['Model', P.name],
   ['Data', 'Retro Display Lab (' + A.license + ', ' + A.copyright + '); used without changing any value'],
   ['Colour (measured)', 'spectral reflectance of a real GBC (' + A.measurement + '), as a 32³ table for every RGB555 colour; D65 light at 45°, viewed straight on'],
   ['Range', 'black reflects ' + Y(P.colour.black_xyz) + '% and white ' + Y(P.colour.white_xyz) + '% of what a white card does: about ' + (P.colour.white_xyz[1] / P.colour.black_xyz[1]).toFixed(1) + ':1'],
   ['Pixels', P.panel.pixels.join(' × ') + ' over ' + P.panel.active_mm.join(' × ') + ' mm: ' + P.panel.pitch_mm.map(v => (v * 1000).toFixed(0)).join(' × ') + ' µm pitch, R G B stripes of equal width'],
   ['Drive', 'RGB555: 32 codes per channel, the raw values a game writes; ' + (1 / P.panel.frame_s).toFixed(4) + ' Hz frames'],
   ['Response (bounded)', 'each channel settles at a first-order rate: ' + ms.onAndOffT10To90Milliseconds + ' ms (black↔white) to ' + ms.grayT10To90Milliseconds
    + ' ms (small steps), 10–90%. The midpoint of Sharp\'s HR-TFT family bounds (' + B.fast.onAndOffT10To90Milliseconds + '–' + B.slow.grayT10To90Milliseconds + ' ms), not a GBC measurement'],
   ['Reflector', 'inside the cell (Sharp HR-TFT): no reflector shadow'],
   ['Stripes on screen', 'drawn when this display has 2 or more pixels per stripe (fewer would alias into rainbow bands), fading out toward 1; a stripe carries three times its channel, softened where that would pass the display\'s white. Each pixel keeps its colour either way'],
   ['Not modelled', 'pixel gaps, reflector grain, the plastic lens, image sticking and temperature (no measured values)'],
   ['Glare', 'glossy front surface, Fresnel n = ' + P.oblique.front_index + ' (assumed)'],
   ['Bezel (assumed)', '1 mm lip; front glass ' + P.sources.geometry.glass_mm + ' mm (not published)'],
   ['Limits', P.limitations[0]]
  ];
 }
});

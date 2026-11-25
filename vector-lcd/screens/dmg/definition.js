/* DMG-01 STN, as the app presents it. No logic: the device's one picture
 * control, the notes, and where every number on the Info tab comes from. */

import {shadowKernel} from '../../optics/room.js';
import {lensReflectance, powerTauS} from './model.js';

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
 powerSwitch: true,               // the LCD on/off (a real device state: the DMG's LCD enable)
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
   ['Data', 'Retro Display Lab (' + A.license + ', ' + A.copyright + '); every value used as published except the response speed (below)'],
   ['Shades', '4 drive levels; art is quantized by brightness (white, light, dark, black)'],
   ['Panel dots (adapted)', i.dotsPerPixel + ' × ' + i.dotsPerPixel + ' per screen pixel, ' + Math.round(i.dotPitchUm) + ' µm apart, '
    + 'finer than the DMG\'s 160 × 144 so modern vector art stays clean. Every dot is driven at one of the four real levels; '
    + 'a screen pixel shows the average light of its dots'],
   ['Palette (measured)', 'BGB DMG reality samples (colour-accurate light, ColorChecker-corrected to true colour and brightness, whole pixels with their gaps): '
    + P.palette.srgb8.shades.map(hex).join(', ') + '; LCD disabled ' + hex(P.palette.srgb8.disabled)],
   ['Colours', 'the solver decides each dot\'s crystal state and how bright it is; the colour is BGB\'s measured path at that brightness: '
    + 'lighter than white tends to the LCD-disabled colour and stops there, darker than black is black dimmed (BGB\'s description of the real wheel). '
    + 'The solver\'s own hue is not used: fitted to BGB\'s five colours it invents lime and navy that no photo of a real DMG shows'],
   ['Drive', '1/' + P.panel.dots[1] + ' duty passive matrix, ' + P.panel.refresh_hz + ' Hz frames; rms reconstruction (' + P.drive.nonselect_rms_V + ' V nonselect, nominal)'],
   ['Response (matched to the era)', 'STN director drift per frame from a Frank–Oseen/Ericksen–Leslie reduction, slowed ×'
    + (1 / P.temperature.response_scale).toFixed(2) + ' to about ' + P.sources.response.target_ms + ' ms per change (10–90%, 25 °C), '
    + 'the published STN figures of the time (Sharp and Hitachi: 300 ms rise plus fall; Sharp LM32019T: 190/210 ms). '
    + 'No DMG panel has been measured; the source alone gives about 91 ms'],
   ['Contrast wheel', '×' + P.contrast.min.toFixed(2) + ' to ×' + P.contrast.max.toFixed(2) + ' drive, the range measured at the ends of a real '
    + 'DMG wheel (one board: −11 V and −14 V against −13 V for good contrast). Solved every 0.01 with the source\'s own solver '
    + '(tools/dmg01_wheel.mjs; the source tabulates 0.88, 1.00 and 1.08): the picture fades in from ×0.92 to ×1.00, and turning it up darkens '
    + 'every shade while they stay distinct; turned down, every shade settles to the unpowered colour, as BGB describes'],
   ['Two resting states (fade assumed)', 'below the normal drive some shades can rest relaxed or part-switched; the solver\'s free energy says which is stable. '
    + 'Turn the wheel down and dark areas first rest part-switched (lighter, yellower: a ghost), then give way point by point as the stable state spreads '
    + 'from defects, in about ' + Math.round(P.stn.metastable.tau_s * 1000) + ' ms (assumed: the middle of the 0.1–1 s published for metastable twisted textures). '
    + 'The solver alone, one column of crystal, would keep the ghost forever; BGB and videos of real DMGs show none lasting'],
   ['Temperature', P.temperature.range_C.join('–') + ' °C; viscosity activation ' + P.temperature.activation_K + ' K'],
   ['Sticking', 'ions charge under dark drive (~' + Math.round(1 / (R.charge_per_frame * P.panel.refresh_hz)) + ' s) and release slowly (~'
    + Math.round(1 / (R.release_per_frame * P.panel.refresh_hz) / 60) + ' min), leaving a faint image'
    + (i.retention ? '' : ' (off: needs 32-bit float targets)')],
   ['Reflector shadow', 'light crosses the crystal twice, entering ' + (offset * 1000).toFixed(0) + ' µm from where it leaves at this light angle '
    + '(refraction through ' + G.glass_mm + ' mm glass and a ' + G.rear_polarizer_mm + ' mm polarizer, assumed), softened by the light\'s size; '
    + 'each pass carries the square root of the measured colour'],
   ['LCD power (relaxation assumed)', 'switched off, the panel has no drive and relaxes to its unpowered rest, the measured disabled colour ('
    + hex(P.palette.srgb8.disabled) + '), with a time constant of about ' + Math.round(powerTauS(P, renderer.temperature, false) * 1000) + ' ms at this temperature; switched on, it returns in about '
    + Math.round(powerTauS(P, renderer.temperature, true) * 1000) + ' ms. Both are the source\'s clearing and darkening times at the era\'s response speed; '
    + 'no relaxation of an unpowered DMG has been published'],
   ['Not used', 'the 160×144 dot grid, its row/column crosstalk and row-latch timing (they need the grid); '
    + 'the source\'s shadow strength and offset, which it fitted to an idealized drawing'],
   ['Screen lens (assumed)', P.lens.thickness_mm + ' mm clear plastic (n = ' + P.lens.n + ') ' + P.lens.gap_mm + ' mm above the LCD, its frame printed on the underside. '
    + 'The room light mirrors off the lens front, the lens back and the LCD (n = ' + P.oblique.front_index + '): ' + Math.round(100 * lensReflectance(P, Math.cos(renderer.lighting.angleDeg * Math.PI / 180)) * 10) / 10
    + '% at this light angle, against ' + Math.round(100 * lensReflectance({...P, lens: null}, Math.cos(renderer.lighting.angleDeg * Math.PI / 180)) * 10) / 10 + '% for the bare LCD'],
   ['Printed frame', 'shades the edges facing the light across the ' + renderer.bezelLipMm + ' mm gap; front glass ' + G.glass_mm + ' mm, the thickest common small-STN glass (0.4–1.1 mm; DMG value not published)'],
   ['Limits', P.limitations[0]]
  ];
 }
});

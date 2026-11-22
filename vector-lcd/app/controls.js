/* The control panel, built from the screen's definition.
 *
 *   On the device   only the controls the real hardware has (definition.device)
 *   Surroundings    the room light, and the panel's temperature where it matters
 *
 * Settings live here, not in the renderer, so they survive switching screens:
 * the room is shared by every screen; each device keeps its own knob positions. */

import {kindOf} from './screens.js';

const DIRECTIONS = ['top', 'top right', 'right', 'bottom right', 'bottom', 'bottom left', 'left', 'top left'];
const describeDirection = v => DIRECTIONS[Math.round(v / 45) % 8] + ' (' + Math.round(v) + '°)';


// ===========================================================================
// Settings
// ===========================================================================

const defaults = () => ({
 // Room light: 45 degrees from straight on, from the top-left corner,
 // 15 degrees wide (a typical lamp), at normal room brightness.
 lighting: {angleDeg: 45, azimuthDeg: 315, sourceDeg: 15, exposure: 1},
 celsius: 25,
 /** room illuminance (lux); null until a screen that uses it sets its default */
 roomLux: null,
 /** glare inside the viewer's eye */
 viewer: {glare: false},
 /** knob positions per screen id: {screenId: {key: value}} */
 knobs: {}
});

const settings = defaults();

/** Every control back to its default: the room, the eye, and this device's knobs. */
export function resetSettings(screen) {
 const {knobs, ...room} = defaults();
 Object.assign(settings, room);
 delete settings.knobs[screen.id];
}

/** A device's knob positions, starting from the profile's own values. */
function knobsFor(screen, profile) {
 settings.knobs[screen.id] ??= Object.fromEntries(
  kindOf(screen).definition.device(profile).map(c => [c.key, c.initial]));
 return settings.knobs[screen.id];
}

const clampTo = ([lo, hi], v) => Math.min(hi, Math.max(lo, v));


// ===========================================================================
// Applying settings to a renderer
// ===========================================================================

/** Give a renderer the room and its device's knob positions. */
export function applySettings(screen, profile, renderer) {
 const def = kindOf(screen).definition;
 def.prepare(renderer);
 renderer.setLighting(settings.lighting);
 const range = def.temperatureRange(profile);
 if (range) renderer.setTemperature(clampTo(range, settings.celsius));
 const room = def.roomLight(profile);
 if (room) room.apply(renderer, settings.roomLux ??= room.initial);
 renderer.setViewer(settings.viewer);
 const knobs = knobsFor(screen, profile);
 for (const control of def.device(profile)) control.apply(renderer, knobs[control.key]);
}


// ===========================================================================
// Building the panel
// ===========================================================================

/** One labelled slider row: name and value on top, the slider below. */
function slider({label, min, max, step, value, format, onInput}) {
 const row = document.createElement('label');
 row.className = 'row';
 const name = Object.assign(document.createElement('span'), {textContent: label});
 const input = Object.assign(document.createElement('input'), {type: 'range', min, max, step, value});
 const out = document.createElement('output');
 const show = () => {
  out.textContent = format(Number(input.value));
  input.style.setProperty('--fill', ((input.value - min) / (max - min) * 100) + '%');
 };
 input.addEventListener('input', () => { onInput(Number(input.value)); show(); });
 show();
 row.append(name, input, out);
 return row;
}

/**
 * @param {Object<string, HTMLElement>} el  device, deviceNote, lighting, lightNote, room, roomNote, environment, envNote, eyeGlare
 * @param {() => Object} currentRenderer   the stage's renderer at the time of the input
 */
export function createControls(el, currentRenderer) {

 // ---- Viewer ----
 el.eyeGlare.addEventListener('click', () => {
  settings.viewer.glare = !settings.viewer.glare;
  currentRenderer().setViewer(settings.viewer);
  el.eyeGlare.setAttribute('aria-checked', String(settings.viewer.glare));
 });

 /** Rebuild the panel for one screen, from the current settings. */
 function show(screen, profile) {
  const def = kindOf(screen).definition, knobs = knobsFor(screen, profile);

  // ---- Room light: the same for every screen
  el.lighting.replaceChildren(
   slider({label: 'Light angle', min: 0, max: 75, step: 1, value: settings.lighting.angleDeg,
    format: v => v + '° from straight on',
    onInput: v => { settings.lighting.angleDeg = v; currentRenderer().setLighting({angleDeg: v}); }}),
   slider({label: 'Light from', min: 0, max: 359, step: 1, value: settings.lighting.azimuthDeg,
    format: describeDirection,
    onInput: v => { settings.lighting.azimuthDeg = v; currentRenderer().setLighting({azimuthDeg: v}); }}));
  el.eyeGlare.setAttribute('aria-checked', String(settings.viewer.glare));

  // ---- On the device
  el.device.replaceChildren(...def.device(profile).map(control => slider({
   ...control, value: knobs[control.key],
   onInput: v => { knobs[control.key] = v; control.apply(currentRenderer(), v); }
  })));
  el.deviceNote.textContent = def.deviceNote(profile);

  // ---- Surroundings
  el.lightNote.textContent = def.lightNote;
  const room = def.roomLight(profile);
  el.room.replaceChildren();
  if (room) el.room.append(slider({
   ...room, label: 'Room brightness', value: settings.roomLux ?? room.initial,
   onInput: v => { settings.roomLux = v; room.apply(currentRenderer(), v); }
  }));
  el.roomNote.textContent = def.roomNote;
  el.roomNote.hidden = !room;
  const range = def.temperatureRange(profile);
  el.environment.replaceChildren();
  if (range) el.environment.append(slider({
   label: 'Panel temperature', min: range[0], max: range[1], step: 1, value: clampTo(range, settings.celsius),
   format: v => v + ' °C',
   onInput: v => { settings.celsius = v; currentRenderer().setTemperature(v); }
  }));
  el.envNote.textContent = def.temperatureNote;
  el.envNote.hidden = !range;
 }

 return Object.freeze({show});
}

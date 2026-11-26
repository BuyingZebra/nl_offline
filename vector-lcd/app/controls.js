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
 // Room light: 19 degrees from straight on (a lamp above and a little behind the
 // viewer; at 45 degrees the DMG-01's reflector shadow doubled thin lines), from
 // 307 degrees (top left, a little toward the left), 15 degrees wide (a typical
 // lamp), at normal room brightness.
 lighting: {angleDeg: 19, azimuthDeg: 307, sourceDeg: 15, exposure: 1},
 celsius: 25,
 /** reflector shadow on screens that offer the inspection switch; off is not physical */
 shadow: true,
 /** the lens's condition on screens that offer it: false = in the box, true = used (scratches) */
 used: false,
 /** the LCD switched on, on screens that have a power switch */
 power: true,
 /** room illuminance (lux); null until a screen that uses it sets its default */
 roomLux: null,
 /** knob positions per screen id: {screenId: {key: value}} */
 knobs: {}
});

const settings = defaults();

/** The settings in use for a screen, for the diagnostic report. */
export function currentSettings(screen) {
 return {lighting: {...settings.lighting}, celsius: settings.celsius, shadow: settings.shadow, used: settings.used, power: settings.power, knobs: {...settings.knobs[screen.id]}};
}

/** Every control back to its default: the room and this device's knobs. */
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

/** The device's shadow on the page falls away from the room light: as long as
 * the old fixed shadow at 45 degrees, none with the light straight on, at most twice. */
function castShadow({angleDeg, azimuthDeg}) {
 const length = Math.min(2, Math.tan(angleDeg * Math.PI / 180)), az = azimuthDeg * Math.PI / 180;
 const root = document.documentElement.style;
 root.setProperty('--shadow-x', (-Math.sin(az) * length).toFixed(3));
 root.setProperty('--shadow-y', (Math.cos(az) * length).toFixed(3));
}


// ===========================================================================
// Applying settings to a renderer
// ===========================================================================

/** Give a renderer the room and its device's knob positions. */
export function applySettings(screen, profile, renderer) {
 const def = kindOf(screen).definition;
 def.prepare(renderer);
 renderer.setLighting(settings.lighting);
 castShadow(settings.lighting);
 const range = def.temperatureRange(profile);
 if (range) renderer.setTemperature(clampTo(range, settings.celsius));
 if (def.shadowSwitch) renderer.setShadow(settings.shadow);
 if (def.powerSwitch) renderer.setPower(settings.power);
 if (def.conditionSwitch) renderer.setCondition(settings.used ? 'used' : 'box');
 const room = def.roomLight(profile);
 if (room) room.apply(renderer, settings.roomLux ??= room.initial);
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

/** An on/off switch: its state, its label for that state, and what a click does. */
function toggle(get, text, flip) {
 const button = Object.assign(document.createElement('button'), {type: 'button', className: 'switch'});
 button.setAttribute('role', 'switch');
 const label = document.createElement('span');
 button.append(Object.assign(document.createElement('span'), {className: 'track'}), label);
 const showState = () => { button.setAttribute('aria-checked', String(get())); label.textContent = text(get()); };
 button.addEventListener('click', () => { flip(); showState(); });
 showState();
 return button;
}

/**
 * @param {Object<string, HTMLElement>} el  device, deviceNote, lighting, lightNote, room, roomNote, environment, envNote
 * @param {() => Object} currentRenderer   the stage's renderer at the time of the input
 */
export function createControls(el, currentRenderer) {

 /** Rebuild the panel for one screen, from the current settings. */
 function show(screen, profile) {
  const def = kindOf(screen).definition, knobs = knobsFor(screen, profile);

  // ---- Room light: the same for every screen
  el.lighting.replaceChildren(
   slider({label: 'Light angle', min: 0, max: 75, step: 1, value: settings.lighting.angleDeg,
    format: v => v + '° from straight on',
    onInput: v => { settings.lighting.angleDeg = v; currentRenderer().setLighting({angleDeg: v}); castShadow(settings.lighting); }}),
   slider({label: 'Light from', min: 0, max: 359, step: 1, value: settings.lighting.azimuthDeg,
    format: describeDirection,
    onInput: v => { settings.lighting.azimuthDeg = v; currentRenderer().setLighting({azimuthDeg: v}); castShadow(settings.lighting); }}));

  // Inspection only: the reflector shadow off (light leaves where it entered).
  if (def.shadowSwitch) el.lighting.append(toggle(() => settings.shadow,
   on => on ? 'Reflector shadow' : 'Reflector shadow off · inspection, not physical',
   () => { settings.shadow = !settings.shadow; currentRenderer().setShadow(settings.shadow); }));

  // The lens's condition: in the box (as new), or used (procedural scratches; wear varies by unit).
  if (def.conditionSwitch) el.lighting.append(toggle(() => settings.used,
   on => on ? 'Used · scratches on the lens (typical, not measured)' : 'In the box · lens as new',
   () => { settings.used = !settings.used; currentRenderer().setCondition(settings.used ? 'used' : 'box'); }));

  // ---- On the device
  el.device.replaceChildren(...def.device(profile).map(control => slider({
   ...control, value: knobs[control.key],
   onInput: v => { knobs[control.key] = v; control.apply(currentRenderer(), v); }
  })));
  if (def.powerSwitch) el.device.append(toggle(() => settings.power, on => on ? 'LCD on' : 'LCD off · relaxing to the unpowered panel',
   () => { settings.power = !settings.power; currentRenderer().setPower(settings.power); }));
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

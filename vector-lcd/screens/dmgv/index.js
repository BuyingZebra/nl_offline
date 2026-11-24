/* Nintendo DMG-01 reflective STN, fed vector shapes: the kind's public entry.
 *
 * Experimental. The physics is the DMG-01's own (screens/dmg/model.js): the
 * same measured data and controls. The input is shapes in the four drive
 * levels (vector/), each point's level looked up, never derived from
 * brightness; and the memory is per screen pixel, so the panel is as sharp
 * enlarged as small (renderer.js). */

export * from '../dmg/model.js';
export {createRenderer, VERSION} from './renderer.js';
export {definition} from './definition.js';

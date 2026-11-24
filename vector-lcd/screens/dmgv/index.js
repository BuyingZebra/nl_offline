/* Nintendo DMG-01 reflective STN, fed vector shapes: the kind's public entry.
 *
 * Experimental. The processor is the DMG-01's own (screens/dmg/): the same
 * measured data, the same physics, the same controls. Only its input differs:
 * shapes in the four drive levels, drawn on the GPU at the dot size
 * (vector/), so each dot's level is looked up, never derived from brightness. */

import {createRenderer as createDmgRenderer} from '../dmg/renderer.js';

export * from '../dmg/model.js';
export {VERSION} from '../dmg/renderer.js';
export {definition} from './definition.js';

export const createRenderer = (canvas, options) => createDmgRenderer(canvas, {...options, input: 'vector'});

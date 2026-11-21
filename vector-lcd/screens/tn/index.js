/* Reflective twisted-nematic LCD (static and multiplexed): the kind's public entry.
 * The app and the tests import from here, never from the files behind it. */

export * from './model.js';
export {createRenderer, VERSION} from './renderer.js';
export {definition} from './definition.js';

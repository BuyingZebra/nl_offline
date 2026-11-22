/* What every screen must provide, so the app can treat them alike.
 *
 * A screen kind lives in screens/<kind>/ as four files:
 *   model.js       the physics, as pure functions (tested in node)
 *   shaders.js     the same physics on the GPU (GLSL)
 *   renderer.js    runs the shaders each frame: the ScreenRenderer below
 *   definition.js  what the app shows: device controls, notes, the Info list
 * and index.js, the kind's public entry, which gathers them. */


/**
 * Every renderer returns a frozen object with at least these members.
 *
 * @typedef {Object} ScreenRenderer
 * @property {Object}   profile                       the screen profile in use
 * @property {() => CanvasRenderingContext2D} beginContent  blank content, in millimetres
 * @property {(now?:number) => void} frame            advance the physics to `now` and draw
 * @property {(cssW:number, cssH:number, dpr?:number) => {width:number, height:number, pxPerMm:number}} resize
 * @property {() => void} reset                       panel back to its starting state
 * @property {(xMm:number, yMm:number) => any} sample state at a point, for tests
 * @property {(profile:Object) => void} setProfile    switch to another profile of the same kind
 * @property {(draw:(ctx:CanvasRenderingContext2D)=>void) => void} setElectrodes  where the glass can switch
 * @property {Object}   lighting                      the room light
 * @property {(next:Object) => void} setLighting
 * @property {number}   bezelLipMm                    bezel height above the glass
 * @property {() => Object} info                      version, formats, size and fps
 * @property {Object}   viewer                        the viewer's eye: glare, age, iris pigmentation
 * @property {(next:Object) => void} setViewer
 * @property {() => void} dispose                     release the GPU
 */
export const RENDERER_INTERFACE = Object.freeze([
 'profile', 'beginContent', 'frame', 'resize', 'reset', 'sample', 'setProfile',
 'setElectrodes', 'lighting', 'setLighting', 'viewer', 'setViewer', 'bezelLipMm', 'info', 'dispose'
]);

/** Members of RENDERER_INTERFACE that a renderer is missing. */
export function missingMembers(renderer) {
 return RENDERER_INTERFACE.filter(name => !(name in renderer));
}


// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const valueAt = (object, path) => path.split('.').reduce((o, key) => o?.[key], object);

/** Throw a TypeError naming every listed field ('a.b.c') the profile lacks. */
export function requireFields(profile, fields, label) {
 if (!profile || typeof profile !== 'object') throw new TypeError(label + ': no profile given');
 const missing = fields.filter(path => valueAt(profile, path) === undefined);
 if (missing.length) throw new TypeError(label + ' profile "' + (profile.profile ?? '?') + '" is missing: ' + missing.join(', '));
 return profile;
}

/** Fields every screen's room optics read (optics/room.js). */
export const ROOM_FIELDS = Object.freeze([
 'profile', 'name',
 'sources.geometry.glass_mm', 'sources.geometry.n_glass',
 'sources.geometry.rear_polarizer_mm', 'sources.geometry.n_polarizer'
]);

/* The stage: the canvas, the renderer behind it, and the content drawn on it.
 *
 * Profiles of the same kind share a renderer (setProfile). A different kind
 * needs a different renderer, and a fresh canvas, because a canvas keeps the
 * GPU context it was first given. */

import {kindOf} from './screens.js';
import {PANEL} from '../content/tetris.js';

const STAGE_MARGIN_PX = 24;


/**
 * @param {{stage:HTMLElement, bezel:HTMLElement, canvas:HTMLCanvasElement}} elements
 * @param {ReturnType<import('../content/tetris.js').createTetrisContent>} content
 * @param {import('../content/tiles.js').Tiles} tiles
 */
export function createStage({stage, bezel, canvas}, content, tiles) {
 let renderer = null, screen = null, fittedRatio = 0;


 // ---- Which screen is shown -------------------------------------------------

 /** Show a screen with its (already loaded) profile. */
 function show(next, profile) {
  const kind = kindOf(next);
  if (renderer && screen.kind === next.kind) {
   renderer.setProfile(profile);
  } else {
   if (renderer) {
    renderer.dispose();
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    canvas = fresh;
   }
   renderer = kind.createRenderer(canvas, {profile, widthMm: PANEL.w, heightMm: PANEL.h});
   fit();
  }
  renderer.setElectrodes(kind.definition.usesElectrodes ? content.drawElectrodes : null);
  screen = next;
 }


 // ---- Size ----------------------------------------------------------------------

 /** Fit the panel inside the stage. A hidden stage (Info tab) keeps its last size. */
 function fit() {
  if (!renderer || !stage.clientWidth || !stage.clientHeight) return;
  fittedRatio = window.devicePixelRatio || 1;
  const s = getComputedStyle(bezel);
  const padX = parseFloat(s.paddingLeft) + parseFloat(s.paddingRight);
  const padY = parseFloat(s.paddingTop) + parseFloat(s.paddingBottom);
  renderer.resize(
   Math.max(40, stage.clientWidth - STAGE_MARGIN_PX - padX),
   Math.max(40, stage.clientHeight - STAGE_MARGIN_PX - padY),
   window.devicePixelRatio || 1);
 }
 new ResizeObserver(fit).observe(stage);


 // ---- Drawing -------------------------------------------------------------------

 /** Draw the content as it is now and let the panel advance to `now`. */
 function draw(now) {
  // Browser zoom and moving to another monitor change the pixel density
  // without changing the layout: re-fit then too, so the panel stays sharp.
  if ((window.devicePixelRatio || 1) !== fittedRatio) fit();
  const def = kindOf(screen).definition, profile = renderer.profile;
  const set = typeof def.tiles === 'function' ? def.tiles(profile) : def.tiles;
  const paper = def.paper?.(profile);
  const ctx = renderer.beginContent();
  if (paper) { ctx.fillStyle = paper.paper; ctx.fillRect(0, 0, PANEL.w, PANEL.h); }
  content.draw(ctx, tiles[set], paper?.ink);
  renderer.frame(now);
 }

 return Object.freeze({
  show, fit, draw,
  get renderer() { return renderer; },
  get screen() { return screen; },
  get canvas() { return canvas; }
 });
}

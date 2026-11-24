/* DMG-01 STN with vector input, as the app presents it. Everything about the
 * panel is the DMG-01's (screens/dmg/definition.js); this adds the input. */

import {definition as dmg} from '../dmg/definition.js';

/** @type {import('../../app/screens.js').ScreenDefinition} */
export const definition = Object.freeze({
 ...dmg,
 scene: true,                     // content as shapes in drive levels (renderer.setScene), not a picture

 driveNote: P => dmg.driveNote(P) + ' Experimental: the content arrives as vector shapes in the four drive levels, '
  + 'so nothing about it is read from brightness or rounded.',

 facts(P, renderer) {
  const rows = dmg.facts(P, renderer), i = renderer.info();
  const input = ['Input (experimental)', 'vector shapes, drawn on the GPU at points inside each screen pixel with no smoothing: each point takes the drive level '
   + 'of the shape under it, last shape on top. Paints must be one of 255, 170, 85, 0 at full opacity; they are looked up, never rounded, '
   + 'and a file with any other paint is refused. Curves are flattened to within 0.2 dot at whatever size the panel is drawn'];
  const content = ['Content', 'Tetris: one solid square per cell, each piece in one drive level (content/scenes.js PIECE_LEVELS); '
   + 'counters as outlines of the bundled bold font. Test cards: content/test-card.svg (tools/vector_test_cards.py)'];
  const memory = ['Memory (experimental)', 'per point, not per screen pixel: ' + i.pointsPerPixel + ' × ' + i.pointsPerPixel + ' points inside each pixel ('
   + Math.round(i.dotPitchUm) + ' µm apart), each with its own crystal state (16 bits) and drive level, like a dot of the panel; one ion charge per pixel. '
   + 'A moving edge leaves every point its own history, so nothing is averaged. The cost grows with the points, not with the panel\'s size'];
  const shades = rows.findIndex(r => r[0] === 'Shades');
  rows.splice(shades, 1, input, content);
  const dots = rows.findIndex(r => r[0] === 'Panel dots (adapted)');
  rows.splice(dots, 1, memory);
  return rows;
 }
});

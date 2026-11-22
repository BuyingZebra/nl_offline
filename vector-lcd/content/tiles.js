/* The real NOMAD Tetris tile art, loaded as images.
 *
 * J L O S T Z come as authored (tetris/assets/tiles/vector/); I comes as
 * per-cell fragments from the game's own generator (position along the strip,
 * piece rotation). Every tile also comes in its 4-tone and colour versions. */

import {fourToneSVG} from './four-tone.js';
import {colourSVG, PIECE_COLOURS} from './colour.js';
import {renderIFragmentSVG} from '../../tetris/assets/tiles/smooth-geometry.mjs';

export const SHAPED_PIECES = Object.freeze(['J', 'L', 'O', 'S', 'T', 'Z']);
const TILE_DIR = new URL('../../tetris/assets/tiles/vector/', import.meta.url);

/**
 * @typedef {{J,L,O,S,T,Z: HTMLImageElement, I: HTMLImageElement[][]}} TileSet  I[sourceIndex][rotation]
 * @typedef {{original: TileSet, fourTone: TileSet, colour: TileSet}} Tiles
 */

function loadImage(src) {
 return new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Could not load ' + src));
  image.src = src;
 });
}

const svgImage = svg => loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));

/** Every version of one piece's SVG: [as authored, 4-tone, colour]. */
const versions = (svg, kind) => Promise.all([svgImage(svg), svgImage(fourToneSVG(svg)), svgImage(colourSVG(svg, PIECE_COLOURS[kind]))]);


/** @returns {Promise<Tiles>} */
export async function loadTiles() {
 const tiles = {original: {I: []}, fourTone: {I: []}, colour: {I: []}};

 await Promise.all(SHAPED_PIECES.map(async kind => {
  const svg = await (await fetch(new URL(kind + '.svg', TILE_DIR))).text();
  [tiles.original[kind], tiles.fourTone[kind], tiles.colour[kind]] = await versions(svg, kind);
 }));

 for (let index = 0; index < 4; index++) {
  for (const set of Object.values(tiles)) set.I[index] = [];
  for (let rotation = 0; rotation < 4; rotation++) {
   const svg = renderIFragmentSVG({sourceOffset: index, length: 1, rotation});
   [tiles.original.I[index][rotation], tiles.fourTone.I[index][rotation], tiles.colour.I[index][rotation]] = await versions(svg, 'I');
  }
 }
 return tiles;
}

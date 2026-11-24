/* Vector input, the browser part: an SVG file as shapes the processor can take.
 *
 *   readSVG(text) -> {width, height, shapes, problems}
 *
 * Each shape: {fill: {subpaths, rule, value} | null, stroke: {subpaths, width,
 * cap, join, miterLimit, value} | null}, in the SVG's viewBox units with every
 * transform applied. The browser resolves styles, inheritance and transforms;
 * geometry.js turns the outlines into exact geometry.
 *
 * Nothing is interpreted. Every paint must be one of the four drive greys at
 * full opacity; anything else (another grey, a colour, a gradient, partial
 * opacity, text not yet converted to outlines) is listed in `problems`, and
 * the processor refuses the whole file rather than guess. */

import {parsePath, shapePath, transformSubpaths, driveIndex, meanScale} from './geometry.js';

const GEOMETRY = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const CONTAINERS = new Set(['svg', 'g', 'a', 'switch']);
/** Never drawn directly: definitions, and paint servers (refused where used). */
const SKIPPED = new Set(['defs', 'title', 'desc', 'metadata', 'style', 'linearGradient', 'radialGradient', 'stop',
 'symbol', 'clipPath', 'mask', 'marker', 'pattern', 'filter']);
/** Drawn, but not supported here: refused by name so the art can be prepared. */
const REFUSED = {
 text: 'text: convert it to outlines first', tspan: 'text: convert it to outlines first',
 image: 'bitmap images have no shapes', use: '<use>: expand it first', foreignObject: 'HTML inside SVG'
};

const describe = el => '<' + el.localName + (el.id ? ' id="' + el.id + '"' : '') + '>';

/** A computed paint: null for none, {value} for a drive grey, {problem} otherwise. */
function paint(computed, opacity) {
 if (!computed || computed === 'none') return null;
 if (computed.startsWith('url(')) return {problem: 'a gradient or pattern (' + computed.replace(/\s.*$/, '') + ')'};
 const m = computed.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
 if (!m) return {problem: 'an unreadable paint ' + computed};
 const [r, g, b] = [m[1], m[2], m[3]].map(Number);
 let alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]);
 alpha *= opacity;
 if (alpha === 0) return null;
 const hex = '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
 if (alpha !== 1) return {problem: hex + ' at ' + Math.round(alpha * 100) + '% opacity'};
 const value = driveIndex(r, g, b);
 return value === null ? {problem: hex + ', not one of the four drive greys (255, 170, 85, 0)'} : {value};
}

/** Opacity of an element and every group around it (opacity is not inherited, it multiplies). */
function groupOpacity(el, root) {
 let o = 1;
 for (let e = el; e && e !== root.parentNode; e = e.parentNode) o *= Number(getComputedStyle(e).opacity);
 return o;
}

/** @returns {{width:number, height:number, shapes:Object[], problems:string[]}} */
export function readSVG(text) {
 const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
 const source = doc.documentElement;
 if (source.localName !== 'svg' || doc.querySelector('parsererror')) return {width: 0, height: 0, shapes: [], problems: ['not a readable SVG file']};

 // The viewBox sets the units; without one, the width and height do.
 const vb = (source.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
 const [minX, minY, width, height] = vb.length === 4 && vb.every(Number.isFinite)
  ? vb : [0, 0, parseFloat(source.getAttribute('width')) || 0, parseFloat(source.getAttribute('height')) || 0];
 if (!(width > 0) || !(height > 0)) return {width: 0, height: 0, shapes: [], problems: ['the SVG has no size (no viewBox, width or height)']};

 // Let the browser resolve styles and transforms: lay the file out, hidden,
 // at exactly its viewBox size, so the root maps viewBox units 1:1.
 const host = document.createElement('div');
 // Off screen, not hidden: visibility is inherited, and the shapes' own visibility must be read.
 host.style.cssText = 'position:absolute;left:-100000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
 const root = document.importNode(source, true);
 root.setAttribute('width', width);
 root.setAttribute('height', height);
 root.setAttribute('preserveAspectRatio', 'none');
 host.append(root);
 document.body.append(host);

 const shapes = [], problems = [];
 try {
  const walk = el => {
   const tag = el.localName;
   if (SKIPPED.has(tag)) return;
   const style = getComputedStyle(el);
   if (style.display === 'none') return;
   if (REFUSED[tag]) { problems.push(describe(el) + ': ' + REFUSED[tag]); return; }
   if (el !== root && (el.getAttribute('clip-path') || style.clipPath !== 'none' && style.clipPath)) problems.push(describe(el) + ': clipping is not supported yet');
   if (style.mask && style.mask !== 'none') problems.push(describe(el) + ': masks are not supported yet');
   if (CONTAINERS.has(tag)) { for (const child of el.children) walk(child); return; }
   if (!GEOMETRY.has(tag)) { problems.push(describe(el) + ': not a shape this reader knows'); return; }
   if (style.visibility === 'hidden') return;

   const at = Object.fromEntries([...el.attributes].map(a => [a.name, a.value]));
   let subpaths;
   try { subpaths = parsePath(shapePath(tag, at)); }
   catch (error) { problems.push(describe(el) + ': ' + error.message); return; }
   if (!subpaths.length) return;

   const ctm = el.getCTM(), m = [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f];
   const placed = transformSubpaths(subpaths, m);
   const opacity = groupOpacity(el, root);
   const shape = {fill: null, stroke: null};

   const fill = paint(style.fill, opacity * Number(style.fillOpacity));
   if (fill?.problem) problems.push(describe(el) + ' fill: ' + fill.problem);
   else if (fill && tag !== 'line' && tag !== 'polyline' || fill && tag === 'polyline')
    shape.fill = {subpaths: placed, rule: style.fillRule === 'evenodd' ? 'evenodd' : 'nonzero', value: fill.value};

   const stroke = paint(style.stroke, opacity * Number(style.strokeOpacity));
   const strokeWidth = parseFloat(style.strokeWidth);
   if (stroke?.problem) problems.push(describe(el) + ' stroke: ' + stroke.problem);
   else if (stroke && strokeWidth > 0) {
    if (style.strokeDasharray && style.strokeDasharray !== 'none') problems.push(describe(el) + ': dashed strokes are not supported yet');
    if (style.vectorEffect === 'non-scaling-stroke') problems.push(describe(el) + ': non-scaling strokes are not supported yet');
    shape.stroke = {subpaths: placed, width: strokeWidth * meanScale(m), cap: style.strokeLinecap, join: style.strokeLinejoin,
     miterLimit: Number(style.strokeMiterlimit) || 4, value: stroke.value};
   }
   if (shape.fill || shape.stroke) shapes.push(shape);
  };
  walk(root);
 } finally {
  host.remove();
 }

 // getCTM maps to the root's viewport, so the viewBox origin is already at (0, 0).
 return {width, height, shapes, problems};
}

/* Vector input, the GPU part: shapes drawn straight into the processor's input,
 * at the panel's dot size, with no smoothing.
 *
 *   createVectorPainter(gl) -> {draw(framebuffer, [w, h], items)}
 *   item = {shape, matrix}: a shape from svg.js (or built in code), and the
 *          matrix from its units to panel dots (x right, y down)
 *
 * Each dot takes the drive level of the shape at its centre, last shape on top.
 * The GPU samples dot centres and the target has no multisampling, so no dot
 * ever gets a value between two shapes: there is nothing to round.
 *
 * Fills: a convex outline is drawn directly; any other outline (holes,
 * overlaps, self-crossing, either fill rule) by stencil-then-cover: count the
 * windings at each dot in the stencil buffer, then paint where the rule says
 * inside. Strokes: triangles from geometry.js, all of one value.
 * Curves are flattened to within a fifth of a dot, so the shapes stay exact at
 * any panel resolution. Output: r = drive level / 3 (0 white .. 1 black).
 *
 * Speed: each shape's triangles are built once, in the shape's own units, and
 * kept on the GPU; the matrix is applied there, per shape. A shape is rebuilt
 * only when its flattening tolerance crosses a power of two (the panel enlarged
 * or shrunk about two-fold), and dropped after SWEEP_DRAWS draws unused. The
 * triangles are the same ones, moved by the same matrix: strokes keep their
 * width under rotation and even scaling, and under uneven scaling are drawn
 * as SVG specifies (the outline transformed with the shape). */

import {flatten, fanTriangles, convexTriangles, strokeTriangles, maxScale} from './geometry.js';

/** Largest distance (dots) between a curve and its flattened outline. */
const TOLERANCE_DOTS = .2;
/** Draws a stored shape may go unused before its GPU copy is released. */
const SWEEP_DRAWS = 120;

const VERT = `#version 300 es
in vec2 aPos;uniform vec2 uSize,uT;uniform vec4 uM;
void main(){
 vec2 d=vec2(uM.x*aPos.x+uM.z*aPos.y,uM.y*aPos.x+uM.w*aPos.y)+uT;
 gl_Position=vec4(d.x/uSize.x*2.0-1.0,1.0-d.y/uSize.y*2.0,0.0,1.0);
}`;
const FRAG = `#version 300 es
precision highp float;uniform float uValue;out vec4 o;
void main(){o=vec4(uValue/3.0,0.0,0.0,1.0);}`;

/** The shape's triangles in its own units, at a tolerance (own units):
 * {fill: [x0,y0,...] or null, stencil (true: fill is a winding fan, then cover),
 *  cover: the outline's bounding box, stroke: [x0,y0,...]}. */
export function shapeTriangles(shape, tolerance) {
 const out = {fill: null, stencil: false, cover: [], stroke: []};
 if (shape.fill) {
  const polys = flatten(shape.fill.subpaths, tolerance), convex = convexTriangles(polys);
  if (convex) out.fill = convex;
  else {
   out.fill = fanTriangles(polys);
   out.stencil = true;
   let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
   for (const p of polys) for (const [x, y] of p.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
   if (x0 <= x1) out.cover = [x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1];
  }
 }
 if (shape.stroke) out.stroke = strokeTriangles(flatten(shape.stroke.subpaths, tolerance), shape.stroke, tolerance);
 return out;
}

export function createVectorPainter(gl) {
 const compile = (type, src) => {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Vector input shader: ' + gl.getShaderInfoLog(s));
  return s;
 };
 const program = gl.createProgram();
 gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
 gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
 gl.bindAttribLocation(program, 0, 'aPos');
 gl.linkProgram(program);
 if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Vector input program: ' + gl.getProgramInfoLog(program));
 const u = name => gl.getUniformLocation(program, name);
 const uSize = u('uSize'), uM = u('uM'), uT = u('uT'), uValue = u('uValue');

 /** shape -> {tolerance, vao, buffer, fill: [first, count], stencil, cover, stroke, used} */
 const stored = new Map();
 let draws = 0;
 let stats = {shapes: 0, stencilled: 0, triangles: 0, stored: 0, built: 0};

 /** The shape's GPU copy at this tolerance, building it if needed. */
 function copyOf(shape, tolerance) {
  let e = stored.get(shape);
  if (e && e.tolerance === tolerance) { e.used = draws; return e; }
  if (!e) {
   e = {vao: gl.createVertexArray(), buffer: gl.createBuffer()};
   gl.bindVertexArray(e.vao);
   gl.bindBuffer(gl.ARRAY_BUFFER, e.buffer);
   gl.enableVertexAttribArray(0);
   gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
   stored.set(shape, e);
  }
  const t = shapeTriangles(shape, tolerance), all = [...(t.fill ?? []), ...t.cover, ...t.stroke];
  const range = (from, list) => [from / 2, list.length / 2];
  e.fill = range(0, t.fill ?? []);
  e.cover = range(e.fill[1] * 2, t.cover);
  e.stroke = range((e.fill[1] + e.cover[1]) * 2, t.stroke);
  e.stencil = t.stencil;
  e.tolerance = tolerance;
  e.used = draws;
  gl.bindVertexArray(e.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, e.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(all), gl.STATIC_DRAW);
  stats.built++;
  return e;
 }

 function send([first, count]) {
  if (!count) return;
  gl.drawArrays(gl.TRIANGLES, first, count);
  stats.triangles += count / 3;
 }

 /** Paint the items into a framebuffer of w x h dots that has a stencil buffer.
  * The panel starts unlit (drive level 0) wherever nothing is drawn. */
 function draw(framebuffer, [w, h], items) {
  draws++;
  stats = {shapes: 0, stencilled: 0, triangles: 0, stored: 0, built: 0};
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
  gl.colorMask(true, true, true, true);
  gl.stencilMask(0xff);
  gl.clearColor(0, 0, 0, 1);
  gl.clearStencil(0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniform2f(uSize, w, h);

  for (const {shape, matrix: m} of items) {
   stats.shapes++;
   // Tolerance in the shape's own units, kept to a power of two so a steady size keeps its copy.
   const tolerance = Math.pow(2, Math.floor(Math.log2(TOLERANCE_DOTS / Math.max(maxScale(m), 1e-9))));
   const e = copyOf(shape, tolerance);
   gl.bindVertexArray(e.vao);
   gl.uniform4f(uM, m[0], m[1], m[2], m[3]);
   gl.uniform2f(uT, m[4], m[5]);
   if (shape.fill) {
    gl.uniform1f(uValue, shape.fill.value);
    if (!e.stencil) send(e.fill);
    else {
     // Stencil-then-cover: count windings, then paint the inside and clear the count.
     stats.stencilled++;
     gl.enable(gl.STENCIL_TEST);
     gl.colorMask(false, false, false, false);
     gl.stencilFunc(gl.ALWAYS, 0, 0xff);
     if (shape.fill.rule === 'evenodd') {
      gl.stencilMask(0x01);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
     } else {
      gl.stencilMask(0xff);
      gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
      gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
     }
     send(e.fill);
     gl.colorMask(true, true, true, true);
     gl.stencilMask(0xff);
     gl.stencilFunc(gl.NOTEQUAL, 0, shape.fill.rule === 'evenodd' ? 0x01 : 0xff);
     gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
     send(e.cover);
     gl.disable(gl.STENCIL_TEST);
    }
   }
   if (shape.stroke) {
    gl.uniform1f(uValue, shape.stroke.value);
    send(e.stroke);
   }
  }
  // Release shapes no longer shown.
  for (const [shape, e] of stored) if (draws - e.used > SWEEP_DRAWS) {
   gl.deleteBuffer(e.buffer); gl.deleteVertexArray(e.vao); stored.delete(shape);
  }
  stats.stored = stored.size;
  gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
 }

 return Object.freeze({draw, get stats() { return {...stats}; }});
}

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
 * any panel resolution. Output: r = drive level / 3 (0 white .. 1 black). */

import {flatten, fanTriangles, convexTriangles, strokeTriangles, maxScale, apply} from './geometry.js';

/** Largest distance (dots) between a curve and its flattened outline. */
const TOLERANCE_DOTS = .2;

const VERT = `#version 300 es
in vec2 aPos;in float aValue;uniform vec2 uSize;out float vValue;
void main(){vValue=aValue;gl_Position=vec4(aPos.x/uSize.x*2.0-1.0,1.0-aPos.y/uSize.y*2.0,0.0,1.0);}`;
const FRAG = `#version 300 es
precision highp float;in float vValue;out vec4 o;
void main(){o=vec4(vValue/3.0,0.0,0.0,1.0);}`;

/** Flattened outlines of some subpaths at a tolerance, cached on the subpaths
 * (the tolerance is kept to a power of two so a steady size keeps its cache). */
function outlines(part, tolerance) {
 const t = Math.pow(2, Math.floor(Math.log2(tolerance)));
 if (part._t !== t) { part._polys = flatten(part.subpaths, t); part._t = t; }
 return part._polys;
}

const toDots = (polys, m) => polys.map(p => ({closed: p.closed, points: p.points.map(q => apply(m, q[0], q[1]))}));

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
 gl.bindAttribLocation(program, 1, 'aValue');
 gl.linkProgram(program);
 if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Vector input program: ' + gl.getProgramInfoLog(program));
 const uSize = gl.getUniformLocation(program, 'uSize');
 const vao = gl.createVertexArray(), buffer = gl.createBuffer();
 gl.bindVertexArray(vao);
 gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
 gl.enableVertexAttribArray(0);
 gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
 gl.enableVertexAttribArray(1);
 gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
 gl.bindVertexArray(null);

 let stats = {shapes: 0, stencilled: 0, triangles: 0};

 /** Triangles [x0,y0,x1,y1,...] with one value, as interleaved vertices. */
 const push = (out, tris, value) => { for (let i = 0; i < tris.length; i += 2) out.push(tris[i], tris[i + 1], value); };

 function send(vertices) {
  if (!vertices.length) return;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 3);
  stats.triangles += vertices.length / 9;
 }

 /** Paint the items into a framebuffer of w x h dots that has a stencil buffer.
  * The panel starts unlit (drive level 0) wherever nothing is drawn. */
 function draw(framebuffer, [w, h], items) {
  stats = {shapes: 0, stencilled: 0, triangles: 0};
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
  gl.colorMask(true, true, true, true);
  gl.stencilMask(0xff);
  gl.clearColor(0, 0, 0, 1);
  gl.clearStencil(0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniform2f(uSize, w, h);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  // Shapes that need no stencil are batched; triangles keep their order within a draw.
  let batch = [];
  const flush = () => { send(batch); batch = []; };

  for (const {shape, matrix: m} of items) {
   stats.shapes++;
   const tolerance = TOLERANCE_DOTS / Math.max(maxScale(m), 1e-9);
   if (shape.fill) {
    const polys = toDots(outlines(shape.fill, tolerance), m);
    const convex = convexTriangles(polys);
    if (convex) push(batch, convex, shape.fill.value);
    else {
     // Stencil-then-cover: count windings, then paint the inside and clear the count.
     flush();
     stats.stencilled++;
     const fan = [];
     push(fan, fanTriangles(polys), 0);
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
     send(fan);
     let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
     for (const p of polys) for (const [x, y] of p.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
     const cover = [];
     push(cover, [x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1], shape.fill.value);
     gl.colorMask(true, true, true, true);
     gl.stencilMask(0xff);
     gl.stencilFunc(gl.NOTEQUAL, 0, shape.fill.rule === 'evenodd' ? 0x01 : 0xff);
     gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
     send(cover);
     gl.disable(gl.STENCIL_TEST);
    }
   }
   if (shape.stroke) {
    const s = shape.stroke, polys = toDots(outlines(s, tolerance), m);
    push(batch, strokeTriangles(polys, {...s, width: s.width * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))}, TOLERANCE_DOTS), s.value);
   }
  }
  flush();
  gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
 }

 return Object.freeze({draw, get stats() { return {...stats}; }});
}

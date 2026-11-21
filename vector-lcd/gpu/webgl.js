/* WebGL2 plumbing shared by every screen renderer.
 *
 *   createGPU      context, programs, textures, render targets, drawing, readback,
 *                  context loss and recovery
 *   createSurface  the panel's content canvas and its size in device pixels
 *   createMeter    frames per second
 *
 * None of this knows any physics; the renderers in screens/ do. */

import {FULLSCREEN_VERT} from './glsl.js';


/**
 * @typedef {{internal:number, format?:number, type:number, name:string}} TargetFormat
 * @typedef {{tex:WebGLTexture, fb:WebGLFramebuffer, ok?:boolean}} Target
 * @typedef {{p:WebGLProgram, u:(name:string)=>WebGLUniformLocation}} Program
 */

const CONTEXT_OPTIONS = Object.freeze({alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));


// ===========================================================================
// GPU kit
// ===========================================================================

/** @param {HTMLCanvasElement} canvas @param {string} name used in error messages */
export function createGPU(canvas, name) {
 const gl = canvas.getContext('webgl2', CONTEXT_OPTIONS);
 if (!gl) throw new Error('This browser does not provide WebGL2, which the ' + name + ' renderer needs.');

 let vao = null, lost = false, onRestored = () => {};


 // ---- Programs -----------------------------------------------------------

 function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(name + ' shader: ' + gl.getShaderInfoLog(shader));
  return shader;
 }

 /** A fullscreen program for one fragment shader; uniform locations are cached. @returns {Program} */
 function program(fragmentSource) {
  const p = gl.createProgram();
  const v = compile(gl.VERTEX_SHADER, FULLSCREEN_VERT), f = compile(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ' program: ' + gl.getProgramInfoLog(p));
  const cache = new Map();
  const u = uniform => {
   if (!cache.has(uniform)) cache.set(uniform, gl.getUniformLocation(p, uniform));
   return cache.get(uniform);
  };
  return {p, u};
 }


 // ---- Textures and render targets ----------------------------------------

 /** Empty texture, clamped at the edges. NEAREST for exact state, LINEAR to filter. */
 function texture(filter = gl.NEAREST) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
 }

 /** Texture with a framebuffer to draw into. ok = the browser can render to this format. @returns {Target} */
 function target(w, h, format) {
  const tex = texture();
  gl.texImage2D(gl.TEXTURE_2D, 0, format.internal, w, h, 0, format.format ?? gl.RGBA, format.type, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return {tex, fb, ok};
 }

 /** Delete targets (or any {tex, fb, t0, t1} records). */
 function release(...targets) {
  for (const t of targets) {
   if (!t) continue;
   if (t.fb) gl.deleteFramebuffer(t.fb);
   for (const tex of [t.tex, t.t0, t.t1]) if (tex) gl.deleteTexture(tex);
  }
 }

 /** The first format in the list this browser can render to. @returns {TargetFormat} */
 function firstRenderable(formats, message) {
  for (const format of formats) {
   const probe = target(1, 1, format);
   release(probe);
   if (probe.ok) return format;
  }
  throw new Error(message);
 }

 /** Upload a 2D canvas into a texture, top row first (canvas rows run down, GL rows run up). */
 function upload(tex, source) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
 }

 /** Copy one texture into another of the same format, rescaling (nearest).
  * Used to carry a panel's state across a resize. */
 function copy(src, srcSize, dst, dstSize) {
  const read = gl.createFramebuffer(), draw = gl.createFramebuffer();
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
  gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, src, 0);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
  gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
  gl.blitFramebuffer(0, 0, srcSize[0], srcSize[1], 0, 0, dstSize[0], dstSize[1], gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.deleteFramebuffer(read);
  gl.deleteFramebuffer(draw);
 }


 // ---- Drawing --------------------------------------------------------------

 /** Bind a texture to a sampler uniform. */
 function bind(prog, unit, uniform, tex) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(prog.u(uniform), unit);
 }

 /** Run a program over a whole target (null = the screen). setUniforms(prog) runs first. */
 function draw(prog, fb, [w, h], setUniforms) {
  vao ??= gl.createVertexArray();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog.p);
  setUniforms(prog);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
 }

 /** Four values at one texel of a target: float targets as floats, 8-bit ones scaled to [0, 1]. */
 function readTexel(fb, x, y, isFloat = true) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  let out;
  if (isFloat) {
   out = new Float32Array(4);
   gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, out);
  } else {
   const bytes = new Uint8Array(4);
   gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
   out = Float32Array.from(bytes, b => b / 255);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return out;
 }


 // ---- Context loss -----------------------------------------------------------
 // The browser may drop the GPU context (backgrounding, driver reset). Every
 // GPU object is then gone; the renderer rebuilds them when it comes back.

 const handleLost = event => { event.preventDefault(); lost = true; };
 const handleRestored = () => { lost = false; vao = null; onRestored(); };
 canvas.addEventListener('webglcontextlost', handleLost);
 canvas.addEventListener('webglcontextrestored', handleRestored);

 function dispose() {
  canvas.removeEventListener('webglcontextlost', handleLost);
  canvas.removeEventListener('webglcontextrestored', handleRestored);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
 }

 return Object.freeze({
  gl, program, texture, target, release, firstRenderable, upload, copy, bind, draw, readTexel, dispose,
  get lost() { return lost; },
  /** Called after the context comes back; rebuild every GPU resource. */
  set onRestored(fn) { onRestored = fn; },
  get maxTextureSize() { return gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096; }
 });
}


// ===========================================================================
// Panel surface: what the content is drawn on, and the panel's pixel size
// ===========================================================================

/** The panel is widthMm x heightMm; content is drawn in millimetres onto a 2D
 * canvas of the panel's device-pixel size, then uploaded each frame. */
export function createSurface(canvas, {widthMm, heightMm, maxPixelRatio = 2}) {
 if (!(widthMm > 0) || !(heightMm > 0)) throw new TypeError('Panel size must be positive millimetres');

 const content = document.createElement('canvas');
 const ctx = content.getContext('2d');
 const size = {W: 0, H: 0, pxPerMm: 1};

 /** Clears the content to unlit (white) and returns it, scaled to millimetres. */
 function beginContent() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size.W, size.H);
  ctx.setTransform(size.pxPerMm, 0, 0, size.pxPerMm, 0, 0);
  return ctx;
 }

 /** Fit the panel inside cssWidth x cssHeight. Returns the CSS size and
  * whether the device-pixel size changed (the renderer then reallocates). */
 function fit(cssWidth, cssHeight, dpr, maxTextureSize) {
  const scale = Math.max(1e-6, Math.min(cssWidth / widthMm, cssHeight / heightMm));
  const outW = Math.max(1, Math.floor(widthMm * scale)), outH = Math.max(1, Math.floor(heightMm * scale));
  const ratio = Math.max(1, Math.min(maxPixelRatio, dpr || 1, maxTextureSize / outW, maxTextureSize / outH));
  const pw = Math.round(outW * ratio), ph = Math.round(outH * ratio);
  canvas.style.width = outW + 'px';
  canvas.style.height = outH + 'px';
  const changed = pw !== size.W || ph !== size.H;
  if (changed) {
   size.W = pw;
   size.H = ph;
   canvas.width = content.width = pw;
   canvas.height = content.height = ph;
   size.pxPerMm = pw / widthMm;
  }
  return {width: outW, height: outH, pxPerMm: size.pxPerMm, changed};
 }

 /** Device pixel (GL rows, bottom up) for a point in panel millimetres. */
 function texelAt(xMm, yMm) {
  return [
   clamp(Math.floor(xMm * size.pxPerMm), 0, size.W - 1),
   clamp(size.H - 1 - Math.floor(yMm * size.pxPerMm), 0, size.H - 1)
  ];
 }

 return Object.freeze({
  content, beginContent, fit, texelAt, widthMm, heightMm,
  get W() { return size.W; },
  get H() { return size.H; },
  get pxPerMm() { return size.pxPerMm; },
  /** Panel size in millimetres at the current pixel scale. */
  get panelMm() { return [size.W / size.pxPerMm, size.H / size.pxPerMm]; }
 });
}


// ===========================================================================
// Frame meter
// ===========================================================================

export function createMeter() {
 let value = 0, clock = 0, frames = 0;
 return {
  tick(dtMs) {
   frames++;
   clock += dtMs;
   if (clock >= 1000) {
    value = Math.round(frames * 1000 / clock);
    frames = 0;
    clock = 0;
   }
  },
  get fps() { return value; }
 };
}

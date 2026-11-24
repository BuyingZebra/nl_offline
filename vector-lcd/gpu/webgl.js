/* WebGL2 plumbing shared by every screen renderer.
 *
 *   createGPU      context, programs, textures, render targets, drawing, readback,
 *                  context loss and recovery, and a per-pass timer for diagnostics
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

 /** Delete targets: {fb, tex} records, where tex may be a list (multiple render targets). */
 function release(...targets) {
  for (const t of targets) {
   if (!t) continue;
   if (t.fb) gl.deleteFramebuffer(t.fb);
   for (const tex of [t.tex].flat()) if (tex) gl.deleteTexture(tex);
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


 // ---- Pass timing, for the diagnostic report ------------------------------------
 // A renderer marks its passes with section(name) and ends the frame with
 // section(null). Each pass gets the CPU time of its calls (JavaScript and
 // driver submission) and, where the browser offers EXT_disjoint_timer_query_webgl2,
 // the GPU time the pass really took, read back a few frames later.

 const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
 let open = null, pending = [], spare = [], totals = new Map(), disjoint = 0;

 function total(name) {
  if (!totals.has(name)) totals.set(name, {count: 0, cpuMs: 0, gpuCount: 0, gpuMs: 0});
  return totals.get(name);
 }

 function poll() {
  if (!timerExt) return;
  if (gl.getParameter(timerExt.GPU_DISJOINT_EXT)) {
   // The GPU was interrupted (power state, another app): these timings are not trustworthy.
   disjoint++;
   for (const p of pending) spare.push(p.query);
   pending = [];
   return;
  }
  while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
   const p = pending.shift(), t = total(p.name);
   t.gpuCount++;
   t.gpuMs += gl.getQueryParameter(p.query, gl.QUERY_RESULT) / 1e6;
   spare.push(p.query);
  }
 }

 /** End the open pass (if any) and start the named one; null ends the frame's passes. */
 function section(name) {
  const now = performance.now();
  if (open) {
   const t = total(open.name);
   t.count++;
   t.cpuMs += now - open.start;
   if (open.query) { gl.endQuery(timerExt.TIME_ELAPSED_EXT); pending.push({name: open.name, query: open.query}); }
   open = null;
  }
  if (name === null) { poll(); return; }
  let query = null;
  if (timerExt && !lost && pending.length < 64) {
   query = spare.pop() ?? gl.createQuery();
   gl.beginQuery(timerExt.TIME_ELAPSED_EXT, query);
  }
  open = {name, start: performance.now(), query};
 }

 /** Average CPU and GPU milliseconds per pass since the last call, then start again. */
 function takeTimings() {
  poll();
  const out = {gpuTimer: Boolean(timerExt), disjoint, passes: {}};
  for (const [name, t] of totals) out.passes[name] = {
   count: t.count, cpuMs: t.count ? t.cpuMs / t.count : null, gpuMs: t.gpuCount ? t.gpuMs / t.gpuCount : null
  };
  totals = new Map();
  disjoint = 0;
  return out;
 }


 // ---- Context loss -----------------------------------------------------------
 // The browser may drop the GPU context (backgrounding, driver reset). Every
 // GPU object is then gone; the renderer rebuilds them when it comes back.

 const handleLost = event => { event.preventDefault(); lost = true; };
 const handleRestored = () => { lost = false; vao = null; open = null; pending = []; spare = []; onRestored(); };
 canvas.addEventListener('webglcontextlost', handleLost);
 canvas.addEventListener('webglcontextrestored', handleRestored);

 function dispose() {
  canvas.removeEventListener('webglcontextlost', handleLost);
  canvas.removeEventListener('webglcontextrestored', handleRestored);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
 }

 return Object.freeze({
  gl, program, texture, target, release, firstRenderable, upload, copy, bind, draw, readTexel, dispose, section, takeTimings,
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
 * canvas, then uploaded each frame.
 *
 * By default the content has one point per device pixel. A screen can ask for
 * a finer panel (dotBudget): each device pixel then covers dotsPerPixel ×
 * dotsPerPixel panel dots, the most that fit within dotBudget dots in all
 * (at most MAX_DOTS_PER_PIXEL), and the content is drawn at the dot size. */
export const MAX_DOTS_PER_PIXEL = 4;

export function createSurface(canvas, {widthMm, heightMm, maxPixels = 3e6, dotBudget = 0, canvasContent = true}) {
 if (!(widthMm > 0) || !(heightMm > 0)) throw new TypeError('Panel size must be positive millimetres');

 const content = document.createElement('canvas');
 const ctx = content.getContext('2d');
 const size = {W: 0, H: 0, pxPerMm: 1, dots: 1};

 /** Clears the content to unlit (white) and returns it, scaled to millimetres. */
 function beginContent() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, content.width, content.height);
  const k = size.pxPerMm * size.dots;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  return ctx;
 }

 /** Dots per device pixel (each way) for a pw x ph panel. */
 function dotsFor(pw, ph, maxTextureSize) {
  if (!(dotBudget > 0)) return 1;
  const fit = Math.floor(Math.sqrt(dotBudget / (pw * ph)));
  return clamp(Math.min(fit, Math.floor(maxTextureSize / pw), Math.floor(maxTextureSize / ph)), 1, MAX_DOTS_PER_PIXEL);
 }

 /** Fit the panel inside cssWidth x cssHeight. Returns the CSS size and
  * whether the device-pixel or dot size changed (the renderer then reallocates). */
 function fit(cssWidth, cssHeight, dpr, maxTextureSize) {
  const scale = Math.max(1e-6, Math.min(cssWidth / widthMm, cssHeight / heightMm));
  const outW = Math.max(1, Math.floor(widthMm * scale)), outH = Math.max(1, Math.floor(heightMm * scale));
  // The display's full pixel density (zooming in spends the same screen area on
  // fewer page pixels), within a pixel budget and the texture limit.
  const ratio = Math.max(1, Math.min(dpr || 1, Math.sqrt(maxPixels / (outW * outH)), maxTextureSize / outW, maxTextureSize / outH));
  const pw = Math.round(outW * ratio), ph = Math.round(outH * ratio), dots = dotsFor(pw, ph, maxTextureSize);
  canvas.style.width = outW + 'px';
  canvas.style.height = outH + 'px';
  const changed = pw !== size.W || ph !== size.H || dots !== size.dots;
  if (changed) {
   size.W = pw;
   size.H = ph;
   size.dots = dots;
   canvas.width = pw;
   canvas.height = ph;
   // A renderer that draws its content on the GPU keeps no 2D canvas of it.
   content.width = canvasContent ? pw * dots : 1;
   content.height = canvasContent ? ph * dots : 1;
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

 /** Panel dot (GL rows, bottom up) for a point in panel millimetres. */
 function dotAt(xMm, yMm) {
  const k = size.pxPerMm * size.dots, w = size.W * size.dots, h = size.H * size.dots;
  return [clamp(Math.floor(xMm * k), 0, w - 1), clamp(h - 1 - Math.floor(yMm * k), 0, h - 1)];
 }

 return Object.freeze({
  content, beginContent, fit, texelAt, dotAt, widthMm, heightMm,
  get W() { return size.W; },
  get H() { return size.H; },
  get pxPerMm() { return size.pxPerMm; },
  /** Panel dots per device pixel, each way (1 unless the screen asked for a finer panel). */
  get dotsPerPixel() { return size.dots; },
  /** The content and panel-state size in dots. */
  get dotSize() { return [size.W * size.dots, size.H * size.dots]; },
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

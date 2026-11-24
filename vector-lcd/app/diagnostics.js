/* The diagnostic report: what the Info tab's Copy report button copies.
 *
 *   createPerfMonitor()   rolling 2-second samples of the frame loop
 *   formatReport(facts)   the plain-text report
 *   copyText(text)        clipboard, with a selection fallback (Safari, older browsers)
 *
 * The report is for diagnosing performance: device and graphics card, the
 * screen and its settings, panel size and memory, and recent samples with the
 * time each pass takes. Nothing personal is collected. */

const WINDOW_MS = 2000;
const KEEP = 8;
const SLOW_MS = 25;               // a frame interval longer than this is a visible stutter at 60 Hz

const percentile = (values, p) => {
 if (!values.length) return null;
 const sorted = [...values].sort((a, b) => a - b);
 return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/**
 * Feed it every frame: frame(now, {updateMs, sceneMs, frameMs}, takeTimings).
 * takeTimings: the renderer's pass timer (or undefined), read once per sample.
 */
export function createPerfMonitor() {
 const samples = [];
 let start = null, last = null, intervals = [], cpu = [], parts = {updateMs: [], drawMs: [], rendererMs: []};

 function frame(now, {updateMs, drawMs, rendererMs}, takeTimings, context = {}) {
  if (last !== null) intervals.push(now - last);
  last = now;
  start ??= now;
  cpu.push(updateMs + drawMs);
  parts.updateMs.push(updateMs); parts.drawMs.push(drawMs); parts.rendererMs.push(rendererMs);
  if (now - start < WINDOW_MS) return;
  samples.push({
   seconds: (now - start) / 1000, frames: cpu.length,
   fps: intervals.length ? 1000 / mean(intervals) : null,
   intervalAvg: mean(intervals), intervalP95: percentile(intervals, .95), intervalMax: intervals.length ? Math.max(...intervals) : null,
   slow: intervals.filter(v => v > SLOW_MS).length,
   cpuAvg: mean(cpu), cpuP95: percentile(cpu, .95), cpuMax: Math.max(...cpu),
   updateAvg: mean(parts.updateMs), drawAvg: mean(parts.drawMs), rendererAvg: mean(parts.rendererMs),
   passes: takeTimings?.() ?? null, ...context
  });
  if (samples.length > KEEP) samples.shift();
  start = now; intervals = []; cpu = []; parts = {updateMs: [], drawMs: [], rendererMs: []};
 }

 /** A pause (Info open, tab hidden) is not a stutter: the next interval is not counted. */
 function pause() { last = null; }

 return Object.freeze({frame, pause, get samples() { return [...samples]; }});
}


// ---------------------------------------------------------------------------
// The device
// ---------------------------------------------------------------------------

/** The graphics card and what it can do, from the panel's own WebGL2 context. */
export function describeGPU(canvas) {
 const gl = canvas?.getContext('webgl2');
 if (!gl) return {renderer: 'no WebGL2 context'};
 const info = gl.getExtension('WEBGL_debug_renderer_info');
 const has = name => Boolean(gl.getSupportedExtensions()?.includes(name));
 return {
  vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
  renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  floatTargets: has('EXT_color_buffer_float'), halfFloatTargets: has('EXT_color_buffer_half_float'),
  gpuTimer: has('EXT_disjoint_timer_query_webgl2'), lost: gl.isContextLost()
 };
}


// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const v = (x, unit = '', digits = 1) => x === null || x === undefined || Number.isNaN(x) ? 'n/a'
 : typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(digits)) + unit : String(x) + unit;

export function formatReport({appVersion, captured, userAgent, viewport, gpu, screen, settings, renderer, samples = [], paused}) {
 const rows = [
  'VECTOR LCD / DIAGNOSTIC REPORT',
  'App version: ' + v(appVersion) + ' / renderer ' + v(renderer?.kind) + ' ' + v(renderer?.version),
  'Captured: ' + v(captured),
  'Browser: ' + v(userAgent),
  'GPU: ' + v(gpu?.renderer) + ' (' + v(gpu?.vendor) + ') / max texture ' + v(gpu?.maxTexture)
   + ' / float targets ' + (gpu?.floatTargets ? 'yes' : 'no') + ' / half-float targets ' + (gpu?.halfFloatTargets ? 'yes' : 'no')
   + ' / GPU timer ' + (gpu?.gpuTimer ? 'yes' : 'no') + (gpu?.lost ? ' / CONTEXT LOST' : ''),
  'Viewport: window ' + v(viewport?.width) + 'x' + v(viewport?.height) + ' CSS px / device pixel ratio ' + v(viewport?.dpr, '', 2)
   + ' / pinch zoom ' + v(viewport?.pinch, '', 2) + ' / rendering at ' + v(viewport?.renderRatio, '', 2) + ' px per CSS px',
  '',
  'SCREEN',
  'Screen: ' + v(screen?.id) + ' (' + v(screen?.label) + ') / content ' + v(screen?.content) + (paused ? ' / simulation paused' : ''),
  'Panel: ' + v(renderer?.width) + 'x' + v(renderer?.height) + ' px / ' + v(renderer?.pxPerMm, ' px per mm') + ' / '
   + (renderer?.pointsPerPixel ? v(renderer.pointsPerPixel) + 'x' + v(renderer.pointsPerPixel) + ' points per pixel (memory per point)'
    : renderer?.dotsPerPixel ? v(renderer.dotsPerPixel) + 'x' + v(renderer.dotsPerPixel) + ' dots per pixel' : 'one point per pixel')
   + ' / state ' + v(renderer?.stateFormat) + ' / GPU memory about ' + v(renderer?.gpuMemoryMB, ' MB', 0),
  'Settings: light ' + v(settings?.lighting?.angleDeg, '°', 0) + ' from ' + v(settings?.lighting?.azimuthDeg, '°', 0)
   + ' / reflector shadow ' + (settings?.shadow === false ? 'off (inspection)' : 'on') + ' / LCD ' + (settings?.power === false ? 'off' : 'on') + ' / temperature ' + v(settings?.celsius, ' °C', 0)
   + ' / device ' + (Object.entries(settings?.knobs ?? {}).map(([k, x]) => k + ' ' + v(x, '', 2)).join(', ') || 'none'),
  'Shapes (vector input, last frame): ' + (renderer?.vector ? v(renderer.vector.shapes) + ' shapes / ' + v(renderer.vector.stencilled)
   + ' through the stencil / ' + v(renderer.vector.triangles) + ' triangles' : 'n/a'),
  '',
  'RECENT SAMPLES (2-second windows, newest last; the screen does not draw while Info is open)',
  'fps = frames shown per second. interval = time between frames (16.7 ms at 60 Hz); slow = intervals over ' + SLOW_MS + ' ms (visible stutter).',
  'JS = JavaScript time per frame: game update + drawing (scene building and the renderer\'s calls). It is not GPU time.',
  'PASSES: CPU = time issuing each pass (JavaScript and driver); GPU = time the graphics card took for it, where the browser allows measuring it.'
 ];
 if (!samples.length) rows.push('No complete sample yet. Leave the demo running for a few seconds, then copy again.');
 samples.forEach((s, i) => {
  rows.push('Sample ' + (i + 1) + ': ' + v(s.screen) + ' / ' + v(s.content) + ' / ' + v(s.width) + 'x' + v(s.height) + ' px'
   + ' | fps ' + v(s.fps, '', 0) + ' | interval avg/p95/max ' + v(s.intervalAvg, '', 1) + '/' + v(s.intervalP95, '', 1) + '/' + v(s.intervalMax, ' ms', 1)
   + ' | slow ' + v(s.slow) + ' of ' + v(s.frames)
   + ' | JS avg/p95/max ' + v(s.cpuAvg, '', 2) + '/' + v(s.cpuP95, '', 2) + '/' + v(s.cpuMax, ' ms', 2)
   + ' (update ' + v(s.updateAvg, '', 2) + ', scene ' + v(s.drawAvg - s.rendererAvg, '', 2) + ', renderer ' + v(s.rendererAvg, ' ms', 2) + ')');
  if (s.passes?.passes && Object.keys(s.passes.passes).length) {
   rows.push('  PASSES (avg ms per frame, CPU/GPU): ' + Object.entries(s.passes.passes)
    .map(([name, t]) => name + ' ' + v(t.cpuMs, '', 2) + '/' + v(t.gpuMs, '', 2)).join(' | ')
    + (s.passes.gpuTimer ? '' : ' (no GPU timer in this browser)') + (s.passes.disjoint ? ' (GPU timing interrupted ' + s.passes.disjoint + 'x)' : ''));
  } else rows.push('  PASSES: this screen does not report pass timings (only the DMG-01 screens do)');
 });
 return rows.join('\n');
}


// ---------------------------------------------------------------------------
// Clipboard (the same approach as NOMAD Tetris's Copy Debug)
// ---------------------------------------------------------------------------

function selectAndCopy(text) {
 const field = document.createElement('textarea');
 const prior = document.activeElement;
 field.value = text;
 field.setAttribute('readonly', '');
 field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
 try {
  document.body.append(field);
  field.focus(); field.select(); field.setSelectionRange?.(0, text.length);
  return Boolean(document.execCommand('copy'));
 } catch { return false; }
 finally {
  field.remove();
  try { prior?.focus?.({preventScroll: true}); } catch {}
 }
}

/** Copy text; must be called inside the click. Resolves true when copied. */
export function copyText(text) {
 try {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => selectAndCopy(text));
 } catch {}
 return Promise.resolve(selectAndCopy(text));
}

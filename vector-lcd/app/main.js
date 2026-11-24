/* Vector LCD: NOMAD Tetris shown through physically computed screens.
 *
 * This file only wires the parts together and runs the frame loop:
 *   screens.js   the screens on offer          stage.js   canvas, renderer, content
 *   controls.js  the control panel             info.js    the Info tab
 *   view.js      tabs, switches, card heading  content/   the Tetris game and its tiles */

import {FAMILIES, SCREENS, screenById, loadProfile, kindOf} from './screens.js';
import {createStage} from './stage.js';
import {createControls, applySettings, resetSettings, currentSettings} from './controls.js';
import {createPerfMonitor, describeGPU, formatReport, copyText} from './diagnostics.js';
import {createInfo} from './info.js';
import {createView} from './view.js';
import {loadTiles} from '../content/tiles.js';
import {createTetrisContent, PANEL, BOARD, CELL, COUNTER_FONT} from '../content/tetris.js';
import {readSVG} from '../vector/svg.js';

/** Vector test cards for the vector-input screens (tools/vector_test_cards.py). */
const CARD_FILES = {card: 'test-card.svg', 'off-palette': 'test-card-off-palette.svg', star: 'test-star.svg'};
async function loadCards() {
 const entries = await Promise.all(Object.entries(CARD_FILES).map(async ([name, file]) =>
  [name, readSVG(await (await fetch(new URL('../content/' + file, import.meta.url))).text())]));
 return Object.fromEntries(entries);
}

export const APP_VERSION = '0.28.1';

const $ = id => document.getElementById(id);
const store = {
 get: key => { try { return localStorage.getItem('vector-lcd-' + key); } catch { return null; } },
 set: (key, value) => { try { localStorage.setItem('vector-lcd-' + key, value); } catch {} }
};
const showError = error => { $('error').hidden = false; $('error').textContent = error.message; };


// ===========================================================================
// Start
// ===========================================================================

let stage, controls, info, view, content;
let shown = null;              // the screen on show and its profile
try {
 const first = screenById(store.get('screen'));
 // The counters are drawn on the panel with the bundled font: load it before the first frame.
 const [tiles, profile, cards] = await Promise.all([loadTiles(), loadProfile(first), loadCards(), document.fonts.load(COUNTER_FONT, '0123456789LINES')]);
 content = createTetrisContent(tiles);
 stage = createStage({stage: $('stage'), bezel: $('bezel'), canvas: $('panel'), error: $('error')}, content, tiles, cards);
 controls = createControls({
  device: $('device'), deviceNote: $('deviceNote'), lighting: $('lighting'), lightNote: $('lightNote'),
  room: $('room'), roomNote: $('roomNote'),
  environment: $('environment'), envNote: $('envNote')
 }, () => stage.renderer);
 info = createInfo({title: $('infoTitle'), driveNote: $('driveNote'), facts: $('facts'), status: $('status')});
 view = createView({
  tabDemo: $('tabDemo'), tabInfo: $('tabInfo'), demoView: $('demoView'), infoView: $('infoView'),
  familyButtons: [...document.querySelectorAll('[data-family]')],
  title: $('title'), subtitle: $('subtitle'), iconLcd: $('iconLcd'), iconCrt: $('iconCrt'),
  profileLabel: $('profileLabel'), profiles: $('profiles')
 }, {onScreen: selectScreen, onFamily: selectFamily, onTab: setInfoOpen});
 present(first, profile);
} catch (error) {
 showError(error);
 throw error;
}


// ===========================================================================
// Choosing a screen
// ===========================================================================

/** Put a screen with its loaded profile on the stage and in every panel. */
function present(screen, profile) {
 shown = {screen, profile};
 stage.show(screen, profile);
 // The content switch is for screens that take shapes (vector input).
 $('contentField').hidden = !kindOf(screen).definition.scene;
 applySettings(screen, profile, stage.renderer);
 controls.show(screen, profile);
 info.show(screen, profile, stage.renderer);
 view.show(screen);
}

// Choices are queued, so quick taps cannot interleave two profile loads.
let choosing = Promise.resolve();

function selectScreen(id) {
 choosing = choosing.then(async () => {
  const screen = screenById(id);
  if (screen === stage.screen) return;
  try {
   present(screen, await loadProfile(screen));
   store.set('screen', screen.id);
   store.set('last-' + screen.family, screen.id);
  } catch (error) { showError(error); }
 });
 return choosing;
}

/** The LCD / CRT switch returns to the last screen chosen in that family. */
function selectFamily(family) {
 const remembered = screenById(store.get('last-' + family));
 return selectScreen(remembered.family === family ? remembered.id : SCREENS.find(s => s.family === family).id);
}


// ===========================================================================
// Frame loop
// ===========================================================================

let running = false, paused = false, infoOpen = false;
let lastNow = null;

const perf = createPerfMonitor();

function tick(now) {
 if (!running) return;
 const dt = lastNow === null ? 16 : Math.min(100, now - lastNow);
 lastNow = now;
 // Paused stops the game, not the screen: the panel keeps showing the still picture.
 const t0 = performance.now();
 if (!paused) content.update(dt);
 const t1 = performance.now();
 const rendererMs = stage.draw(now) ?? 0;
 const t2 = performance.now();
 const r = stage.renderer, i = r.info();
 perf.frame(now, {updateMs: t1 - t0, drawMs: t2 - t1, rendererMs}, r.timings,
  {screen: stage.screen.id, content: kindOf(stage.screen).definition.scene ? stage.content : 'tetris', width: i.width, height: i.height});
 requestAnimationFrame(tick);
}

function start() {
 if (running || infoOpen) return;
 running = true;
 lastNow = null;
 requestAnimationFrame(tick);
}

/** The screen stops drawing while Info covers it. */
function setInfoOpen(open) {
 infoOpen = open;
 perf.pause();
 if (open) running = false;
 else { stage.fit(); start(); }
}

document.addEventListener('visibilitychange', () => { perf.pause(); if (document.hidden) running = false; else start(); });


// ===========================================================================
// Simulation buttons, status, offline
// ===========================================================================

$('pause').addEventListener('click', event => {
 paused = !paused;
 const button = event.currentTarget;
 button.setAttribute('aria-checked', String(!paused));
 button.lastElementChild.textContent = paused ? 'Paused' : 'Running';
});
$('reset').addEventListener('click', () => {
 resetSettings(shown.screen);
 applySettings(shown.screen, shown.profile, stage.renderer);
 controls.show(shown.screen, shown.profile);
});

for (const button of document.querySelectorAll('[data-content]')) button.addEventListener('click', () => {
 stage.showContent(button.dataset.content);
 for (const other of document.querySelectorAll('[data-content]')) other.setAttribute('aria-pressed', String(other === button));
});

/** Copy report: everything needed to diagnose performance, as plain text. */
function report() {
 const r = stage.renderer, i = r.info();
 return formatReport({
  appVersion: APP_VERSION, captured: new Date().toISOString(), userAgent: navigator.userAgent,
  viewport: {width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1, pinch: window.visualViewport?.scale ?? 1, renderRatio: stage.pixelRatio},
  gpu: describeGPU(stage.canvas), screen: {...stage.screen, content: kindOf(stage.screen).definition.scene ? stage.content : 'tetris'},
  settings: currentSettings(stage.screen), renderer: {...i, kind: stage.screen.kind}, samples: perf.samples, paused
 });
}
$('copyReport').addEventListener('click', () => {
 const text = report(), status = $('reportStatus'), box = $('reportText');
 // The clipboard call must start inside the click.
 copyText(text).then(ok => {
  status.textContent = ok ? 'Copied ' + text.split('\n').length + ' lines. Paste it into the chat.' : 'Could not copy: select the text below and copy it.';
  box.hidden = ok;
  if (!ok) { box.value = text; box.focus(); box.select(); }
 });
});

$('version').textContent = 'v' + APP_VERSION;
setInterval(() => info.status(stage.screen, stage.renderer), 1000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

/** For tests and the console. */
window.vectorLCD = Object.freeze({
 get renderer() { return stage.renderer; },
 get canvas() { return stage.canvas; },
 get screen() { return stage.screen; },
 get content() { return stage.content; }, showContent: name => stage.showContent(name), report,
 game: content.game, PANEL, BOARD, CELL, FAMILIES, selectScreen
});

start();

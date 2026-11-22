/* Vector LCD: NOMAD Tetris shown through physically computed screens.
 *
 * This file only wires the parts together and runs the frame loop:
 *   screens.js   the screens on offer          stage.js   canvas, renderer, content
 *   controls.js  the control panel             info.js    the Info tab
 *   view.js      tabs, switches, card heading  content/   the Tetris game and its tiles */

import {FAMILIES, SCREENS, screenById, loadProfile} from './screens.js';
import {createStage} from './stage.js';
import {createControls, applySettings, resetSettings} from './controls.js';
import {createInfo} from './info.js';
import {createView} from './view.js';
import {loadTiles} from '../content/tiles.js';
import {createTetrisContent, PANEL, BOARD, CELL} from '../content/tetris.js';

export const APP_VERSION = '0.23.0';

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
 const [tiles, profile] = await Promise.all([loadTiles(), loadProfile(first)]);
 content = createTetrisContent(tiles);
 stage = createStage({stage: $('stage'), bezel: $('bezel'), canvas: $('panel')}, content, tiles);
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

function tick(now) {
 if (!running) return;
 const dt = lastNow === null ? 16 : Math.min(100, now - lastNow);
 lastNow = now;
 // Paused stops the game, not the screen: the panel keeps showing the still picture.
 if (!paused) content.update(dt);
 stage.draw(now);
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
 if (open) running = false;
 else { stage.fit(); start(); }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) running = false; else start(); });


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

$('version').textContent = 'v' + APP_VERSION;
setInterval(() => info.status(stage.screen, stage.renderer), 1000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

/** For tests and the console. */
window.vectorLCD = Object.freeze({
 get renderer() { return stage.renderer; },
 get canvas() { return stage.canvas; },
 get screen() { return stage.screen; },
 game: content.game, PANEL, BOARD, CELL, FAMILIES, selectScreen
});

start();

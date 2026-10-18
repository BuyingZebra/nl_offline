# Tetris System — PixiJS renderer migration

This is one migration on `main` in the canonical `tetris/` application, not a fork of the game.

## Non-negotiable invariants

- Preserve `core.js` gameplay rules, queues, scoring, movement, sounds, and local high scores.
- Preserve actual phone-responsive CSS layout and geometry (including portrait/landscape).
- Preserve existing native button, slider, keyboard, touch and menu behaviour.
- Keep source content **grayscale luminance**: original `--bg`, `--panel`, `--bright`, `--weak`, `--border` values. Never bake green or amber into individual elements.
- Phosphor colour remains applied exactly once at the display layer.
- Do not migrate or redesign CRT effects as part of the content-renderer parity milestone.
- Do not replace the existing live renderer unless source and GPU parity is confirmed on an actual iPhone, WebKit, and Chromium. Fall back to original DOM if WebGL cannot initialize.

## Current code

- The **original** `tetris/index.html`, `ui.js`, `core.js`, `scores.js` and modal semantics remain authoritative.
- Pinned, offline-bundled PixiJS v8.22.0: `tetris/vendor/pixi.min.js`.
- `tetris/renderer-pixi.js` mirrors measured native DOM geometry, computed grayscale colour values, text nodes, live game canvases and input state as a Pixi GPU scene. The canvas does not intercept pointer events. Native CRT effects remain unchanged.
- The canonical app defaults to the approved native renderer for now. GPU content renderer on the **same page**, only for parity testing: `/tetris/?renderer=pixi`; `?renderer=dom` is the native baseline.
- `tests/test_tetris_pixi_parity.py` compares independently loaded native and Pixi pages in Chromium and WebKit using identical random seeds. The browser QA suite must remain green.

## Parity findings (2026-10-18)

- Chromium approximate mean RGB screenshot error: ready 1.63, settings 3.09, playing 1.24.
- WebKit approximate mean RGB screenshot error: ready 1.68, settings 3.74, playing 1.31.
- Thus the renderer is **not** a pixel-perfect drop-in and **must not** become default solely because tests run.
- The largest remaining discrepancies are in settings: text rasterization, bright key/border behaviour, and small control glyphs.
- A WebKit comparison bug from toggling compositor layers mid-dialog was resolved by comparing independent pages.
- Native game functionality and display QA continue to pass with the optional migration code present.

## Next before promotion

1. Finish menu, leaderboard, high-score entry and landscape visual/interaction parity on iPhone-sized Chromium and WebKit.
2. Prove acceptable device-frame-rate, memory and text/shader fidelity on an actual iPhone, and verify no broken touches or IME.
3. Reduce remaining settings and other pixel differences without modifying grayscale luminance values.
4. When approved, enable the Pixi renderer by default in canonical `index.html` and retain automatic native fallback. Update the service-worker cache and release label together.
5. Only then begin native GPU compositor development. No more screenshot-based WebGL DOM-capture experiments.


# NOMAD Tetris — current architecture (V089)

This describes the current implementation rather than retaining a diary of every iteration. The authoritative build number is the `tetris-build` HTML meta tag.

## System ownership

| Module | Responsibility |
| --- | --- |
| `core.js` | Game rules, gravity, collision, scoring and gameplay status |
| `scores.js` | Top-five ranking, migration and persistence |
| `action-controller.js` | Gameplay commands, saved-score events and menu action routing |
| `screen-manager.js` | Screen/navigation state and pause-before-menu rules |
| `settings-manager.js` | Preferences, original storage keys and resets |
| `display-settings-catalog.js` | CRT defaults, effect choices and slider conversion |
| `platform-manager.js` | Viewport, DPR limit, safe areas, background/resume, update checks |
| `input-controller.js`, `ui-controls.js` | Pointer/keyboard input and shared hitbox geometry |
| `layout.js` | Responsive layout in CSS pixels |
| `modal-ui.js`, `hud-drawing.js`, `canvas-ui.js`, `tile-face.js` | Menu and HUD drawing; shared block artwork |
| `render-invalidation.js` | Repaint requests and dirty-layer tracking |
| `graphics-health.js` | WebGL loss/recovery lifecycle, bounded error/event history |
| `compositor.js` | GPU CRT effects and processing order |
| `three-v027.js` | Scene/canvas allocation, renderer, game-frame scheduling and diagnostics |

## Non-negotiable behaviour

- Preserve the approved game rules, grayscale source artwork, square-corner interface, font roles and beveled block faces.
- Preserve saved settings and high-score keys; do not discard user preferences on releases.
- Keep the CRT effect ordering and the 2x render-DPR cap; upload only changed source textures.
- Preserve Safari `100dvh` and the `ios-standalone` `100vh` exception; safe-area insets come from CSS.
- Menu close and app foreground events must not silently resume gameplay.
- Build checks fetch uncached HTML and must never reload active/paused/completed games or open menus.

## Terminal and legacy service workers

The terminal is developed separately at `dev/nomad-terminal`, with its V083 original reference at `archive/nomad-tetris-v083-terminal`. It is not present or loaded on main. The `tetris/sw.js` file is deliberately kept as an **unregistration tombstone** for older PixiJS installations; it is not offline caching for the current game.

## Technical tests

The GitHub Actions workflow `.github/workflows/test-field-atlas-tetris-browser.yml` runs a curated Node test suite on relevant pushes. It covers hard-to-reproduce game rules, storage corruption, screen/action/platform races, layout and hitbox boundaries, shader-pass configuration, diagnostics and module references.

Browser smoke tests (Chromium and WebKit) run only when manually triggered from GitHub Actions. They check actual startup, JS errors, non-blank output, viewport resize and, when supported, simulated WebGL context loss/restoration. Neither test suite replaces real-device visual, gameplay-feel or GPU performance testing.

Current focused tests live in `tetris/tests/`. Selected legacy technical tests remain at `tetris/*.test.cjs` until their behaviour-oriented coverage can be consolidated. Obsolete tests tied to earlier source locations or to the archived terminal were removed rather than retained on main.

## Remaining engineering

- Replace the renderer's direct `game.lockPiece` override with an explicit game event interface.
- Verify WebGL restoration on physical devices and investigate long-session resource growth. The existing Copy Debug report includes bounded WebGL events, failure counts, and recent resource-count trends (not measured GPU memory bytes).
- Review graphics-resource teardown without breaking iOS Home Screen resume.
- Plan future install/offline packaging (manifest, icons and dependable local assets).
- Update this description when boundaries change; use Git history for older revisions.

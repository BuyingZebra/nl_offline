# NOMAD Tetris — current architecture (V094)

This describes the current implementation rather than retaining a diary of every iteration. The authoritative build number is the `tetris-build` HTML meta tag.

## System ownership

| Module | Responsibility |
| --- | --- |
| `core.js` | Game rules, gravity, collision, scoring, gameplay status and read-only game events |
| `scores.js` | Top-five ranking, migration and persistence |
| `action-controller.js` | Gameplay commands, saved-score events and menu action routing |
| `screen-manager.js` | Screen/navigation state and pause-before-menu rules |
| `settings-manager.js` | Preferences, original storage keys and resets |
| `display-settings-catalog.js` | CRT defaults, effect choices and slider conversion |
| `platform-manager.js` | Viewport, DPR limit, safe areas, pagehide/pageshow, background/resume and update checks |
| `input-controller.js`, `ui-controls.js` | Pointer/keyboard input, hitboxes, and disposable event listeners/repeat timers |
| `layout.js` | Responsive layout in CSS pixels |
| `modal-ui.js`, `hud-drawing.js`, `canvas-ui.js`, `tile-face.js` | Menu and HUD drawing; shared block artwork |
| `render-invalidation.js` | Repaint requests and dirty-layer tracking |
| `graphics-health.js` | WebGL loss/recovery lifecycle, bounded error/event history |
| `app-lifecycle.js` | Suspension/bfcache preservation, final-page teardown and idempotent owned graphics-resource cleanup |
| `compositor.js` | GPU CRT effects and processing order |
| `three-v027.js` | Scene/canvas allocation, renderer, game-frame scheduling and diagnostics |

## Core gameplay event contract (V090)

The game engine offers `game.onEvent(listener)`, returning an unsubscribe function.
Subscribers receive synchronous, read-only events and cannot affect deterministic rules by throwing.
The renderer listens to `lines-cleared` to preserve the exact approved line-flash effect without replacing `game.lockPiece()`.

- `piece-locked`: kind, position, rotation, cleared count and final score/status
- `lines-cleared`: count, original row indices and frozen landed-board snapshot **before removal** (only allocated for actual clears with subscribers)
- `level-changed`: previous and new levels
- `game-over`: reason (`top-out` or `spawn-blocked`)
- `reset`: fresh ready-state information

A locking move emits these in game-rule order: piece locked, lines cleared (if applicable), level changed (if applicable), then game over (if the next piece cannot spawn). Event observation does not replace existing sound/score/UI state transitions. Rendering never mutates core methods.

## Application lifecycle contract (V091)

- `visibilitychange` or a `pagehide` with `persisted=true` **suspends**, without freeing WebGL resources, canvas textures, scene materials, or the game state. A running game pauses before being hidden.
- Returning via visibility or a cached `pageshow` remeasures viewport/safe areas, invalidates drawing, resets frame pacing, and **does not resume gameplay automatically**.
- A final `pagehide` with `persisted=false` performs one-time teardown: cancels RAF and pointer-repeat timers, unregisters listeners and the game event subscription, stops the platform observer and polling, detaches WebGL lifecycle events, disposes compositor render targets and **every added compositor pass** (including bloom render targets), plus owned textures/materials/geometries/renderer, releases backing canvases, and closes audio. Independent cleanup steps continue if one fails.
- Hidden, disposed, or still-recovering pages do not accept gameplay or settings input.
- The existing **Copy Debug** report includes suspension/resume counts and recent page lifecycle transitions. No background telemetry, persistence, or remote reporting was added.
- Full browser history restoration and actual iOS Home Screen behaviour still require physical device verification. Never dispose only because a page is hidden.

## Offline support and installation contract (V092)

- The Tetris app now bundles **Three.js r180** (both `three.module.js` and its required `three.core.js`) and all required post-processing modules in `tetris/vendor/three/`, retaining the MIT license. The same shader source and pass order run online and offline.
- `tetris/manifest.webmanifest` and local PNG/SVG Home Screen icons enable standalone installation; the existing Safari/iOS standalone viewport rules remain unchanged.
- `tetris/sw.js` is now an actual **Tetris-scoped offline worker**, not the former PixiJS unregistration tombstone. After one successful online install, its installation phase precaches a fixed list of all essential Tetris HTML, scripts, modules, icons and Three.js dependencies. **Incomplete essential precaches reject installation.**
- Starting with V093, **same-origin Tetris assets are cache-first and release-pinned**: the active worker serves one complete install generation, even if newer network files appear. Ephemeral `?live=` query parameters resolve to canonical keys. Only `?update-check=` HTML requests go directly to the network, **without modifying the pinned cache**; offline checks fail harmlessly.
- Existing Google Fonts CSS/fonts are opportunistically cached when reachable. A failed font download must never prevent the essential offline game from installing; system font fallbacks remain available offline.
- The worker touches only its own `nomad-tetris-offline-*` caches and retired Pixi arcade caches, never NOMAD map caches, Tetris high scores or settings. It does not unregister itself or call `skipWaiting()`, which could replace a running game's version.
- Each future release MUST update the HTML `tetris-build` marker and the worker `CACHE_VERSION` together and review the precache allowlist. Installation rejects a precached HTML build that does not match the worker version, deletes the staged cache on failure, and waits for old clients to close before activating. Automatic published-version reload is disabled while a pinned service worker controls the page. Restart the installed app after closing existing tabs to switch generations safely; active/paused games are never force-reloaded.
- **Copy Debug** includes online/offline connectivity and service-worker control state (indicators, not guarantees against browser storage eviction). Actual installed iOS offline behaviour still needs physical-device verification.

## V093 integration and resource audit

- Fixed a backgrounding race: `createAppLifecycle.suspend()` marks the page suspended before invoking its callback, so the action controller correctly rejects UI input. The callback must pause the **game core directly**, not call the guarded UI pause action. Returning to the foreground never resumes gameplay automatically.
- Finished WebAudio oscillators and gain nodes disconnect after playback. Rejected Safari AudioContext resume promises are handled without unhandled rejections; the audio context closes at final teardown.
- Copy Debug's late asynchronous clipboard completion cannot redraw an already disposed page.
- Node integration tests run **real game rules, action controller, score persistence, settings, screens, graphics health, and lifecycle together**, including scoring/line-clear events, menu-induced pause, browser suspension and resumed interaction. The browser smoke checks actual canvas boot, menu/input response, bfcache-like suspension, an offline reload and WebGL restoration.
- V093 completed architectural cleanup without changing the approved visuals. V094 begins **visual cohesion**, adding one opt-in-duration button response pass within the otherwise unchanged CRT processing order and calibrated monochrome tile values; technical fixes reopen only for demonstrated failures.

## V094 — visual cohesion: tactile response and piece luminance

- A temporary **button response shader** is composited after the board popup and before the unchanged phosphor, bloom, CRT and vignette passes. It restores the historical press brightness and fading phosphor footprint on ALL Canvas2D buttons, including overlay and menu controls. Pointer and keyboard input use the same feedback; gestures on the board do not trigger button reactions.
- The pulse peaks for about 90ms and decays smoothly over 410ms. Up to eight recent button footprints are tracked; completed feedback and suspended-page remnants are discarded. During the afterglow, shader uniforms are updated without continuously repainting or re-uploading large UI canvases.
- The established tetromino identities use familiar canonical RGB reference colours, converted to **Rec.709 relative luminance in linear sRGB**, then re-encoded as neutral grayscale for the existing beveled tile renderer. This preserves the meaningful bright yellow/cyan versus darker blue/purple visual hierarchy without injecting coloured pixels. Game board, HOLD and NEXT use the same module.
- All button spacing, typography, touch-region geometry, gameplay mechanics, settings, high scores, and pre-existing CRT shader settings remain unchanged. Real iPhone intensity and animation timing can be tuned during visual polish without reopening the architecture.

## Non-negotiable behaviour

- Preserve the approved game rules, grayscale source artwork, square-corner interface, font roles and beveled block faces.
- Preserve saved settings and high-score keys; do not discard user preferences on releases.
- Keep the CRT effect ordering and the 2x render-DPR cap; upload only changed source textures.
- Preserve Safari `100dvh` and the `ios-standalone` `100vh` exception; safe-area insets come from CSS.
- Menu close and app foreground events must not silently resume gameplay.
- Build checks fetch uncached HTML and must never reload active/paused/completed games or open menus.

## Terminal and legacy service workers

The terminal is developed separately at `dev/nomad-terminal`, with its V083 original reference at `archive/nomad-tetris-v083-terminal`. It is not present or loaded on main. The former PixiJS worker and its caches are retired; V092's `tetris/sw.js` provides the active, scoped offline cache.

## Technical tests

The GitHub Actions workflow `.github/workflows/test-field-atlas-tetris-browser.yml` runs a curated Node test suite on relevant pushes. It covers hard-to-reproduce game rules, storage corruption, screen/action/platform races, layout and hitbox boundaries, shader-pass configuration, diagnostics and module references.

Browser smoke tests (Chromium and WebKit) are available by manual GitHub Actions trigger; tagged `[pwa-smoke]` pushes also run Chromium. They check actual startup, inputs/menus, non-blank output, viewport resize, offline reload and simulated WebGL loss/restoration. Neither suite replaces real-device visual, gameplay-feel or GPU performance testing.

Current focused tests live in `tetris/tests/`. Selected legacy technical tests remain at `tetris/*.test.cjs` until their behaviour-oriented coverage can be consolidated. Obsolete tests tied to earlier source locations or to the archived terminal were removed rather than retained on main.

## Remaining engineering

- Verify WebGL restoration on physical devices and investigate long-session resource growth. The existing Copy Debug report includes bounded WebGL events, failure counts, and recent resource-count trends (not measured GPU memory bytes).
- Validate installed offline launch and update-generation switching on actual iPhone and Android devices, including Home Screen mode, font availability, browser storage eviction, and background/resume.
- Update this description when boundaries change; use Git history for older revisions.

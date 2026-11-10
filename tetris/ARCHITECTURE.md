# NOMAD Tetris

| Script | Owns |
| --- | --- |
| `game.js` | Board, movement, gravity, scoring, sessions, settings, action dispatch and personal-best logic |
| `render.js` | Visual layout, hitbox geometry, Canvas/Three.js scene ownership, CRT effects, WebGL recovery, disposal and GPU diagnostics |
| `platform.js` | Application coordination, input, clipboard, page lifecycle, storage and private Apple/Android/generic device adapters |
| `three-v027.js` | Tiny stable browser entry that starts the platform coordinator |
| `sw.js` | Versioned offline installation |

Rendering observes read-only game events. The engine scores line clears before checking whether a locking piece ends the run. The renderer owns the visible line flash and delays presenting game over until that flash completes.

The three device adapters are internal compartments of platform.js, sharing one viewport listener. Input event handling belongs to platform.js, visible hitboxes belong to render.js, and frame/GPU instrumentation belongs to render.js. This eliminates five redundant standalone JavaScript files without changing any SVGs, SVG generators, tile art, gameplay rules, or high-score storage.

The gameplay is identical across devices. Apple Home Screen compatibility stays behind an iOS adapter; the Android adapter observes supported viewport resize events. Device detection does not determine game rules.

The layout works in CSS pixels and caps render DPR at 2. The installed app requests portrait. Short landscape screens with a coarse pointer show the rotation prompt and pause an active run. Backgrounding also pauses active play and preserves graphics resources for a return from the browser's page cache. Final page exit releases owned resources. Resuming play requires explicit input.

## The supporting scripts and the graphics resource inventory

The three main engines remain the primary source-code structure. Think of `game.js` as the simulation, `render.js` as Blender's collection of display objects, and `platform.js` as the operator coordinating them.

- **`game.js`**: pieces, rules, score, menus, user settings and the device-local best record. It does not create graphics.
- **`render.js`**: seven Canvas2D sources, seven GPU CanvasTextures, scene planes, established Three.js compositor, WebGL context recovery and final resource cleanup. A single frozen resource inventory now supplies both texture restoration and disposal.
- **`platform.js`**: app startup, browser events, keyboard/touch, animation scheduling, storage access, platform adapters and offline update checks. It requests resources from the renderer rather than constructing Three.js objects.
- **`three-v027.js`**: tiny compatibility entry for the established game URL.
- **`sw.js`**: independent service worker that pins a complete offline release. It is not gameplay or graphics code and must remain its own script.
- **`tools/build-tetris-release.mjs`**: development-only generator ensuring the release marker and offline asset list match.
- **`tools/build-tetris-vendor.mjs`**: development-only tool assembling the pinned Three.js dependency bundle. The shipped bundle/license are separate.

The platform still coordinates individual drawing operations; the remaining rendering orchestration can be untangled later. This pass changes only resource ownership and its inventory, **not** the compositor implementation, shader logic, SVG source, sprites, or gameplay.

## Offline releases

Run `node tools/build-tetris-release.mjs <build>` to regenerate the HTML build marker and worker allowlist. `--check` verifies the generated worker. The public shell stays at `tetris/three-v027.html`.

The worker activates a complete generation after the previous generation's clients close. After the online installation completes, close all Tetris tabs and the installed app, then reopen to switch generations. Scores and settings use their existing storage keys. Keep the repository-root `sw.js` in place to retire former site-wide installations.

`vendor/three/three.bundle.js` packages the required Three.js r180 exports and postprocessing passes. Rebuild it with `node tools/build-tetris-vendor.mjs`. The generated bundle and MIT license ship together. Pixel artwork and the tile comparison page are development references. The game keeps its procedural pixel fallback.

## Engine ownership

Only the three main modules own application behaviour. The small three-v027.js entry, offline service worker, vendored Three.js and procedural SVG/art data remain separate by design.

- Game: board state, gravity, scores, screen actions and settings
- Render: artwork, layout, control hitbox geometry, Canvas/WebGL, CRT and diagnostics
- Platform: initialization, frame scheduling, touch/keyboard, device adapters and lifecycle

The renderer does not import platform.js, and game rules do not depend on the renderer.

## Checks

The visual layout, artwork, Canvas UI and compositor now share `render.js`, partitioned into private subsystems. The application coordinator now resides inside `platform.js` as a browser-only startup function. The long-lived `three-v027.js` URL remains a very small compatibility entry.

The gameplay rules, session controller and personal-best system now share one internally compartmentalized `game.js`. Runtime imports the game module directly; the legacy global integration hooks remain available for diagnostic tests.

Run `node --test tests/*.test.mjs` from the repository root.

| Test file | What it catches |
| --- | --- |
| `gameplay` | Broken movement, locks, line clears, scoring, menus, or saved data |
| `controls-layout` | Misplaced controls, incorrect hitboxes, or layout breakage on small screens |
| `artwork` | Missing sprites, broken piece fragments, or incorrect shadows |
| `display` | Regressions in CRT effects, button lighting, or which layers redraw |
| `platform` | Unsafe reloads, broken offline installs, or failed graphics recovery |
| `diagnostics-terminal` | Missing performance data, broken Copy Debug, or terminal drawing errors |

GitHub Actions also runs the browser smoke test in Chromium and WebKit on manual dispatch or with `[pwa-smoke]` in the commit message. It opens the game, plays inputs, changes the viewport, and exercises offline launch. Physical iPhone Home Screen behavior is a separate check.

## Frame scheduling and allocation discipline (v186)

An active game still drives `requestAnimationFrame` continuously and uses the
unchanged Three.js CRT compositor. With phosphor persistence enabled, the
original continuous temporal history is retained. When continuous rendering is
not needed, a single terminal timer wakes a frame at the next terminal event;
no competing timeout is repeatedly created/cancelled during an active RAF loop.

The button-feedback hot path now compares quantized luminance samples in place,
using the exact old 8-bit rounding rather than rebuilding an array of strings.
The no-button state returns a shared immutable empty array. The visual output
and settings are unchanged. Browser smoke instrumentation reports idle RAF and
timer counts for regression tracking; headless software-rendered browser counts
are **not** valid phone battery or frame-rate benchmarks.

The [v186 rendering-efficiency case study](./PWA_ENGINEERING_CASE_STUDY.md)
records the measured browser callback counts, code changes, regression tests,
and limits on interpreting software-rendered benchmarks.

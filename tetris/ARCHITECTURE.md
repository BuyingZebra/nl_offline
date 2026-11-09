# NOMAD Tetris

| Script | Owns |
| --- | --- |
| `game.js` | Board, movement, gravity, scoring, sessions, settings, action dispatch and personal-best logic |
| `input.js` | Control geometry, keyboard and pointer dispatch |
| `render.js` | Visual layout, UI, art, shadows, CRT compositor, lighting and render invalidation |
| `platform.js` | Shared viewport, build updates and WebGL/page lifecycle; selects the platform adapter |
| `platform/ios.js` | Home Screen sizing mode and visual viewport events on Apple devices |
| `platform/android.js` | Android standalone mode and visual viewport events |
| `platform/generic.js` | Standards-first browser fallback |
| `diagnostics.js` | Timing, debug reports and clipboard |
| `three-v027.js` | Tiny stable browser entry that starts the platform coordinator |
| `platform.js` runtime | Application orchestration: frame scheduling, scene ownership and shared browser lifecycle |
| `sw.js` | Versioned offline installation |

Rendering observes read-only game events. The engine scores line clears before checking whether a locking piece ends the run. The renderer owns the visible line flash and delays presenting game over until that flash completes.

The gameplay is identical across devices. Apple Home Screen compatibility stays behind an iOS adapter; the Android adapter observes supported viewport resize events. Device detection does not determine game rules.

The layout works in CSS pixels and caps render DPR at 2. The installed app requests portrait. Short landscape screens with a coarse pointer show the rotation prompt and pause an active run. Backgrounding also pauses active play and preserves graphics resources for a return from the browser's page cache. Final page exit releases owned resources. Resuming play requires explicit input.

## Offline releases

Run `node tools/build-tetris-release.mjs <build>` to regenerate the HTML build marker and worker allowlist. `--check` verifies the generated worker. The public shell stays at `tetris/three-v027.html`.

The worker activates a complete generation after the previous generation's clients close. After the online installation completes, close all Tetris tabs and the installed app, then reopen to switch generations. Scores and settings use their existing storage keys. Keep the repository-root `sw.js` in place to retire former site-wide installations.

`vendor/three/three.bundle.js` packages the required Three.js r180 exports and postprocessing passes. Rebuild it with `node tools/build-tetris-vendor.mjs`. The generated bundle and MIT license ship together. Pixel artwork and the tile comparison page are development references. The game keeps its procedural pixel fallback.

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

# NOMAD Tetris

| Script | Owns |
| --- | --- |
| `core.js` | Board, movement, gravity, scoring rules and game events |
| `scores.js` | High-score ranking, migration and persistence |
| `layout.js` | Responsive layout in CSS pixels |
| `session.js` | Screens, gameplay commands and display settings |
| `input.js` | Control geometry, keyboard and pointer dispatch |
| `ui.js` | Canvas controls, overlays, sidebar and terminal |
| `art.js` | Piece sprites, tile fallback, fragments and shadows |
| `crt.js` | Compositor passes, button lighting and layer invalidation |
| `platform.js` | Viewport, build updates and WebGL/page lifecycle |
| `diagnostics.js` | Timing, debug reports and clipboard |
| `three-v027.js` | Scene and canvas ownership, game loop and frame scheduling |
| `sw.js` | Versioned offline installation |

Rendering observes read-only game events. The engine scores line clears before checking whether a locking piece ends the run. The renderer owns the visible line flash and delays presenting game over until that flash completes.

The layout works in CSS pixels and caps render DPR at 2. The installed app requests portrait. Short landscape screens with a coarse pointer show the rotation prompt and pause an active run. Backgrounding also pauses active play and preserves graphics resources for a return from the browser's page cache. Final page exit releases owned resources. Resuming play requires explicit input.

## Offline releases

Run `node tools/build-tetris-release.mjs <build>` to regenerate the HTML build marker and worker allowlist. `--check` verifies the generated worker. The public shell stays at `tetris/three-v027.html`.

The worker activates a complete generation after the previous generation's clients close. After the online installation completes, close all Tetris tabs and the installed app, then reopen to switch generations. Scores and settings use their existing storage keys. Keep the repository-root `sw.js` in place to retire former site-wide installations.

`vendor/three/three.bundle.js` packages the required Three.js r180 exports and postprocessing passes. Rebuild it with `node tools/build-tetris-vendor.mjs`. The generated bundle and MIT license ship together. Pixel artwork and the tile comparison page are development references. The game keeps its procedural pixel fallback.

## Checks

Run `node --test tetris/tests/*.test.mjs tetris/tests/*.test.cjs tetris/*.test.cjs`. GitHub Actions also runs Chromium and WebKit on manual dispatch or when the commit message includes `[pwa-smoke]`. Browser emulation covers layout and offline release switching. Home Screen behavior on physical iPhones is a separate check.

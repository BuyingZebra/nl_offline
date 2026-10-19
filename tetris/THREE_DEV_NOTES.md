# FIELD ATLAS · Three.js CRT Lab & Tetris V027 rebuild

## Stable development entry points
- **CRT effects laboratory:** `tetris/three-effects-lab.html` — preserved snapshot of the working standalone Three.js shader test. **Keep for experimenting** with future artifact layers. The earlier `three-crt-test.html` is still present.
- **V027 re-creation in Three.js:** `tetris/three-v027.html` + `tetris/three-v027.js` — experimental full-game recreation. Do not replace the canonical `tetris/index.html` / Pixi build before visual and functional approval.
- **Shared engine and local scores:** `tetris/core.js` and `tetris/scores.js`. Their rules and storage schema are unchanged.

## Approved visual baseline (from iPhone screenshots)
| Effect | Enabled | Values |
|---|---|---|
| Phosphor | yes | monochrome green; derived from source grayscale luminance |
| Bloom | yes | threshold 0.21, strength 0.30 |
| Ghosting | yes | X +2 px, Y 0 px, strength 22% |
| Noise | no | amount 20%, size 2 logical px, rate 15 Hz |
| Edge softness | yes | blur strength 0.64, radius 3.0 logical px |
| Vignette | yes | darkening 0.39, fade spread 0.57 |
| Vertical roll | no | speed 20%/s, offset 0% |
| Scanlines, flicker, horizontal tearing, raster sweep, persistence | removed | Do not reintroduce by default |

Processing order: **grayscale Canvas2D source → vertical roll (optional) → ghosting → luminance-gated noise → phosphor → thresholded GPU bloom → Gaussian edge softness → vignette → final output**.

## Architecture and implementation boundaries
- Draw all of the app (board, previews, controls, score, dialogs) as **one high-density grayscale Canvas2D texture** at device pixel density. Three.js post-processing samples that screen as a coherent framebuffer, like a Blender compositor.
- Maintain full-resolution text and pointer interaction; do not use SVG filters to simulate whole-screen effects.
- A temporary input field is allowed for iOS initials entry, but the composited dialog itself is drawn as grayscale source content.
- Effect settings for the experimental full game are stored under `fieldAtlasThreeV027FX01`, separate from the legacy Pixi settings. Game scores continue using `fieldAtlasTetrisTopFiveV01`.
- The Three.js prototype currently imports libraries from CDN and is therefore **not offline-ready yet**. Vendor/bundle Three.js and addon modules locally, update service-worker caching and validate offline/iOS performance **before promoting to the real PWA**.
- Current Pixi `tetris/index.html` stays unchanged during the experiment. Avoid branching/maintaining duplicate production versions after approval.

## Validation
- JavaScript module syntax was checked.
- A mocked startup/render check initialized the Canvas2D UI, legacy engine, Three.js passes, and first render with no exception.
- Real iPhone screenshot/interaction, renderer performance, colour and font parity against original V027 remain for user approval.

## Migration interpretation and interaction contract
- V027 is the **visual/layout and gameplay behaviour reference**, not a mandate to carry its older renderer or interface code forward. The new application draws a unified grayscale screen to Canvas2D and performs **all CRT post-processing in Three.js**. The shared pure-JavaScript `core.js` game rules and `scores.js` format remain reusable.
- Continue iterating on `three-v027.html` / `three-v027.js` using small, testable changes. **Never replace the effects laboratory** or the current production Tetris without explicit approval.
- The October 18 gesture refinement uses **one pointer recognizer**: menu actions activate on touch-up, vertical swipes scroll even when starting over switches or sliders, horizontal drags change sliders, long-running scrolls ease out with momentum, and repeated game movement buttons continue to act immediately.
- Geometry hit testing and on-screen drawing must use the same logical-pixel coordinates. Test menu input on real iPhones and Android phones; mocked input tests do not substitute for device verification.

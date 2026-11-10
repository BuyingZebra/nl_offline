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


## Performance observability (v187)

The existing user-initiated Copy Debug report now includes CPU frame p50/p95/p99
percentiles from a bounded `Float32Array(512)` ring. It is sampled in the
existing RAF recorder; sorting occurs only when generating a report or the
regular two-second sample, not during a frame.

The renderer estimates the uncompressed RGBA8-equivalent size of its seven
Canvas source backing stores **only when Copy Debug is selected**. This
estimate is not measured RAM use, GPU memory or compositor render-target
memory. It introduces no telemetry, background worker, or new runtime library.
See [PWA performance study](./PWA_PERFORMANCE_STUDY.md).


## Directional drop shadows (v188 integrated preview)

The approved v06 shadow-laboratory algorithm now lives in the reusable shadows.js.
Each piece contributes a filled alpha silhouette; a direction-aware two-pass
Gaussian blur (standard perpendicular, weighted downstream along the shadow)
operates on a 0.5-CSS-pixel mask. Angle, Gaussian directional bias, distance,
and opacity match the approved v06 defaults, scaled from a 35px block size.

The result is cached by normalized silhouette and tile size. Translation reuses
the bitmap; rotation and row clears retain existing per-piece metadata. The
board's previous clip and draw order remain unchanged. The shadow is painted
into the same Canvas2D board source, so this preview introduces zero additional
CanvasTextures, GPU passes, or per-frame GPU uploads. Copy Debug now reports
shadow cache misses, bitmap estimates and per-stamp generation times.

This is a fidelity/integration comparison, not a claim that CPU rasterization
is the final fastest architecture. Review its visual output and worst
cache-build latency on a physical phone before selecting any GPU replacement.


## Window-style separated bloom (v189)

The board is a recessed luminous window; exterior controls live on the cover.
The approved v188 shadows and phosphor response remain unchanged. The existing
five-scale UnrealBloomPass is retained without new GPU passes or textures.

Its brightness extraction packs exterior light into red and board-origin light
into green. Before phosphor tint the source scene is grayscale, so the
unaltered underlying scene remains in the blue channel after additive bloom.
The existing phosphor tint pass reconstructs original + cover glow + board
 glow * inside-window. The full interior bloom is masked after Gaussian blur;
exterior bloom can still visually overlap the window.

The existing ghost and edge-softness passes now avoid cross-aperture sampling.
For a same-build comparison append ?shadowbox=off to temporarily restore the
old unrestricted global bloom. This opt-out is not saved in user settings.


## Interactive directional-shadow controls (v190)

The Display System properties page now has Drop Shadows: enable/disable,
angle (0–360°), distance (0–35 CSS px), Gaussian blur (0–30 CSS px),
directional bias (0–100%), and opacity (0–100%). Default values are
exactly the approved v188 / v06 profile (55°, 13px, 14px, 100%, 80%).
Settings share the existing persisted effects object, including restoring
historical preferences and Restore Defaults. Their slider percentages are
translated into normalized renderer fractions.

The menu thumbnail is a live miniature rendered through the actual v06
shadow engine. Since Display System covers the playfield, board repainting
is deferred until the page closes; this avoids a costly all-piece shadow
rebuild for every pointermove. Only direction/distance/blur/bias invalidate
cached silhouette rasters. Enabling/disabling and opacity are applied on
draw, without new convolution or texture resources. Shadow caches remain
bounded and all graphics resources are disposed on page exit.


## True-black visible shadow opacity (v191)

Shadow colour remains #000000. The v190 Gaussian generated alpha lower than
one even at 100% user opacity because convolution diluted the coverage.
The v191 shadow engine subtracts the original opaque silhouette at its own
half-resolution alpha mask, then normalizes the remaining *visible* Gaussian
coverage per cached piece silhouette. A 100% opacity setting now produces a
black core with a smooth, proportional soft edge (including at 6 CSS px blur).
The opacity slider remains a linear draw-only Canvas globalAlpha multiplier;
zero and all settings still behave normally. This avoids extra GPU passes,
Canvas textures, extra allocations, and the former destination-out stamp pass.
Game rules, piece artwork, screen colours, and shadow-box bloom isolation
remain unchanged.


## Unified board-wall and piece shadow settings (v192)

The recessed game board's black inside-wall shadow and its restrained sharp
copy on the paused/overlaid board now both read the same DROP SHADOWS controls
as the piece silhouettes. The previous fixed Canvas gradients are replaced by
one shared, clipped Canvas painter. The board remains an *inset* window rather
than an exterior silhouette: angle rotates the wall shading, bias balances
opposing walls, distance adjusts directional occlusion and depth, blur adjusts
gradient width (0px is a crisp band), and opacity scales darkness. Disabling
Drop Shadows removes both inset layers and the individual piece shadows.

At the approved default angle 55°, distance 13px, blur 14px, bias 100%,
opacity 80%, the old normal wall intensities (.58/.42/.24/.24) and sharp
popup wall intensities (.36/.27/.15/.15), along with original width, are
preserved. Existing stored settings migrate unchanged. No new GPU passes,
Canvas textures or settings pages. Canvas repaint remains deferred during
settings adjustment; changing these controls redraws the board on menu exit.


## Double-height directional board inset (v193)

The v192 four-gradient inset has been replaced by a cached, analytical
black-alpha shadow for the recessed board aperture. It reads the exact same
saved Drop Shadows angle, toggle, distance, blur, bias and opacity as pieces.
The board is twice as deep: its throw and Gaussian softness each use **2x**
the piece profile's resolved CSS-pixel values. Neither doubles nor attenuates
opacity. The darkest visible interior sample is normalized to alpha 1, so the
opacity slider still controls peak darkness, independent of blur width.

The board frame is the occluder; rotating the light direction moves the
interior shadow to the opposite rim (rightward cast shades the LEFT rim,
downward shades the TOP, etc.). The rectangular-aperture Gaussian is evaluated
with an O(width+height) normal CDF and composed into a cached Canvas stamp.
Directional anisotropy/bias uses projected Gaussian variance and mean rather
than a full-size directional convolution, minimizing CPU cost on phones.

The regular game board and the sharp pause/game-over overlay use the *same*
cached stamp; the secondary overlay retains its existing restrained 62%
intensity. Opacity/toggle changes reuse the stamp; changing orientation,
blur, distance or bias rebuilds it once. No new WebGL pass, CanvasTexture,
viewport, user setting, gameplay logic or tile artwork has been introduced.


## Recessed edge shadow scale correction (v194)

The board inset shares the piece renderer's resolved shadow distance and
Gaussian blur at **1×** rather than the v193 2× multipliers. Angle, bias,
enable and opacity remain shared; the analytical inset mask remains distinct
from the piece silhouette algorithm, so identical inputs need not yield
identical-looking fields. The deliberate late inset shadow over nearby pieces,
including its separate sharp pause-overlay copy, stays in the same rendering
order. No compositing, masks, brightness, gameplay or artwork changes.


## Directional Light Control laboratory (v195)

The Drop Shadows row now exposes LIGHT CONTROL alongside its existing angle,
distance, Gaussian blur, bias and opacity controls. LIGHT CONTROL enters a
separate paused-light modal. The rules engine remains paused after entry and
on exit; it must never advance while a user adjusts a shadow. This is a
**directional** controller, NOT a point-light simulation: the dragged marker
changes only the global shadow angle using the vector from the marker toward
the centre of the fixed playfield. Distance from the marker to the centre
has no bearing on the shadow's cast distance or opacity.

The user may drag anywhere within the board aperture. A bright marker and
subtle halo are clipped to the board while the faint crosshair extends to
both axes of the entire phone screen. A DONE button returns to the scrolled
Display System and Escape does the same. Touch input never reaches Tetris
controls while the light view is active. A 55 degree saved angle is initially
shown at its corresponding position; returning saves the new angle.

Shadow Gaussian blur is temporarily set to zero **for painting only**; the
saved blur setting is not changed. The normal popup blur and settings scrim
are suppressed while the light view is present, and optional edge softness
and phosphor persistence are temporarily disabled. The board-aperture bloom
mask is retained despite the transparent modal, preserving the existing
light/shadow-box separation. All original values return on DONE. No changes
to piece art, ghost logic, scoring, buttons, or ordinary game controls.


## Live shadow parity in Light Control (v196)

The lighting laboratory no longer replaces the saved shadowBlur with zero.
The normal piece and recessed-board rendering engines directly read the
same persisted `settings.effects` object in Light Control as in gameplay,
including Gaussian blur, shadow distance, angle, bias and opacity.
The laboratory remains a *directional input mechanism*, not a second shadow
renderer or point light. There is exactly one piece-shadow painter and one
board-inset painter in the board stage, with the existing overlap, occlusion,
clipping, compositing and dark-core normalization unchanged.

The pause/game-over popup blur and modal scrim remain hidden to make the board
visible, but ordinary saved edge-softness and Gaussian shadow settings are
honoured. Phosphor persistence alone is temporarily bypassed for responsive
dragging and returns unchanged on DONE. Gameplay remains paused throughout.

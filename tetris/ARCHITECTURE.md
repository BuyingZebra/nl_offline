# Tetris System architecture (V081)

## Runtime
- `build-version.js`: pure build-version parser and safe update decision. The **only authoritative release number** is the `tetris-build` HTML metadata in `three-v027.html`; the renderer derives the footer, document title, aria label and debug build number from it.
- `core.js`: deterministic Tetris state, gravity, collisions, scoring and locking. No WebGL dependency.
- `scores.js`: high-score persistence.
- `layout.js`: responsive geometry in CSS pixels; source and GPU use a capped render DPR of 2.
- `input-controller.js`: touch/keyboard events and auto-repeat. Calls actions; does not paint or submit WebGL.
- `three-v027.js`: application composition, scene resources, lifecycle and render scheduling.
- `render-invalidation.js`: the single owner of layer dirty flags, pending composites and redraw reasons. Call `mark(layer...)` for changed source data; `reason(kind)` for attribution/input; call `consume(layer)` once when a layer is actually painted. Never directly upload textures on every animation callback.
- `hud-drawing.js`: reusable rendering for the sidebar and controls, supplied live state and Canvas primitives by the app; preserves established key order and touch geometry.
- `display-settings-catalog.js`: display-effect defaults, slider definitions, preset choices and value conversions, separate from UI painting.
- `modal-ui.js`: owns settings thumbnail generation, settings rows and sliders, modal bounds, in-board Top Five leaderboard, Restart, initials entry, and all menu-specific scroll/picker/debug-label state. It receives Canvas primitives and live state through injected callbacks. It performs no WebGL rendering and does not own game state.
- `three-v027.js` retains modal canvas allocation/texture upload, the WebGL scrim and visibility ordering, debug-report generation, and application-level action routing. `input-controller.js` reads menu hitboxes and scroll state from the modal module.
- `ui-controls.js`: pure shared geometry contract for buttons and sliders, including complete hitboxes, clipping-aware reverse-order hit-testing and slider input values. No DOM, Canvas, WebGL or game dependencies.
- `canvas-ui.js`: draws button descriptors from `makeButtonControl` and registers their exact model hitboxes; its generic `region()` delegates to `makeRegion`.
- `modal-ui.js`: draws each slider from `makeSliderControl` and registers the same model's track/hit-region geometry.
- `input-controller.js`: consumes `findRegionAt` and `sliderValueAt`; no independent slider-track or hit-test geometry calculations.
- `cropped-ui-layers.js`: device-pixel-aligned crop and orthographic-plane positioning.
- `game-visual-state.js`: compares visually observable game state to avoid unnecessary redraws.
- `compositor.js`: existing full-screen ordered Three.js CRT pipeline. Independent of gameplay rules.
- `perf-monitor.js`, `debug-report.js`, `compositor-pass-profiler.js`, `texture-upload-profiler.js`: opt-in diagnostics available via the existing debug-copy action. CPU submission times are not GPU shader execution times.

## Rendering contracts
1. Game logic runs independently from drawing.
2. The **base** CanvasTexture covers the complete screen. It should update on layout or relevant status/UI changes, not for each falling block.
3. The **board** CanvasTexture is cropped and updates when visible pieces change or lines flash.
4. The **sidebar** texture updates when queue/hold/piece stats change.
5. The **controls** texture updates for scores and button feedback.
6. Popup and modal textures retain their established ordering and interaction priority. The `modal-ui.js` painter registers the same hit regions; the app's `paintModalOverlay` keeps the original clear/compose/upload sequence.
   - `modalUI.reset()` on opening/changing a modal resets menu scroll, expanded picker, view and debug-copy status.
   - `modalUI.resetSettings()` when restoring defaults clears scroll and scanline expansion without affecting other app state.
   - During options momentum scrolling, only the modal canvas must be repainted and uploaded.
7. The scene layers are composed **before** bloom, phosphor, vignette, scanlines and output. Effects still process the combined full screen.
8. `mark('board')` must not implicitly mark `base`. Keep redraw causes in one place.
9. Every button shares one geometry record for painting and hit registration; sliders use their track and hitbox from one model. Reverse draw order still determines touch priority, and settings controls remain clipped to their scroll view.
10. Preserve exact grayscale appearance, approved spacing, text, icon sizes and the user-defined effect settings.

## Performance baseline
V062 iPhone 393×852, render DPR2:
- No base uploads across seven ordinary-play 2-second samples.
- Draw calls can be ~21 per submitted frame with current enabled FX.
- Small uploads and skipped unchanged compositor frames are more important than raw requestAnimationFrame callback count.
- `renderer.initTexture` elapsed time includes CPU/driver waits, and is **not** direct GPU execution time.

## Development and verification
- Keep the permanent URL: https://buyingzebra.github.io/nl_offline/tetris/
- **Release versioning:** edit only `<meta name="tetris-build" content="NNN">` in `three-v027.html` to advance the displayed build. `three-v027.js` derives `THREE_BUILD_VERSION` from that meta marker, so do not add a second hard-coded version. `document.title`, accessible title and debug report update automatically. The game at `/tetris/` remains the same stable link.
- Run tests using `node --test tetris/*.test.cjs`. V064 checks settings, scores and restart. V065 checks unified touch geometry. V066 adds `build-version-v066.test.cjs` (meta parsing, update gate, offline/malformed responses, foreground safety) and `module-contract-v066.test.cjs` (ESM imports and bootstrap).
- The running app checks the published `three-v027.html` with `cache:'no-store'` on reactivation and while idle; it **must not reload** during gameplay, pause, completed games, or any open modal. A failure/offline response must not interrupt a working game.
- New functional tests should exercise the public APIs with representative values, not inspect incidental source formatting or require a hard-coded release number. Treat GPU frame timings as on-device checks.
- Keep tests for menu drawing in `modal-ui-v064.test.cjs`; do not reintroduce menu-painter assertions against `three-v027.js`. Avoid brittle source-string checks where a behavioral test is possible.
- Verify touch controls, pressed/released feedback, hold/next, READY/PAUSED/OVER popups, menu scrolling, and both device orientations.
- Confirm current rendering costs on an actual iPhone via the copied debug report; automated checks alone cannot establish visual equivalence.
- Work in small reviewable changes; preserve the V062 behavior/appearance benchmark.

## Deliberately deferred
- Extracting the remaining application-owned menu actions and debug-report gathering (drawing and menu-local state are separated in V064).
- Refine declarative toggle/row component definitions as future screens need them (buttons, sliders, regions and hit-testing already share a model in V065).
- Continue migrating old source-inspection assertions toward behavioral tests as features are touched. Version metadata is centralized as of V066.
These are sensible follow-up cleanups, not prerequisites for adding gameplay features.

## V067 score display
- Top Five is a compact five-row table inside the portrait gameplay board, with rank, name, score, level and lines, plus PLAY AGAIN and BACK actions.
- Unusually narrow landscape board geometry uses a wider centered fallback for readable records and touch controls.
- Device-local high-score persistence, qualification, initials entry, game rules and CRT effects remain unchanged.
- The dark scrim is removed only for the Top Five display, preserving the surrounding live HUD.

## V068: pause-style score backdrop and UI borders
- Top Five artwork is painted into the sharp board-popup CanvasTexture, after the same horizontal and vertical Gaussian board blur/fade used for READY, PAUSED and GAME OVER. The background remains visible through transparent score rows.
- The pause/game-over popup is not drawn underneath scores. A single secondary RETURN button closes to the prior game status; score view has no restart action.
- Entering and leaving the score view explicitly dirties the base/popup once; ordinary gravity still doesn't upload the fullscreen base.
- Standard outlines brighten 12% (#6a6a6a -> #777777), while the subtle Top Five outlines lift #292929 -> #2e2e2e; gameplay grid and controls retain previous fill luminance.
- Narrow-landscape fallback extends Gaussian board blur bounds to the expanded score panel.

## V069 Top Five chart
- The ranking numbers remain, but their # column label is removed. The remaining four headers and all corresponding values use identical column center positions.
- A single transparent table frame rounds only the four outside corners; four hard straight internal rules give every row a complete outline. All standard grayscale and blur settings remain.
- RETURN is now a solid-filled button using the existing shared button drawing and action.

## V070 typography trial
- Teko Bold (700) is the display face, falling back to the previous monospace if it is unavailable. Screen geometry, 14/16/18px control labels/icons, settings, CRT effects, and score persistence are unchanged.
- Icon-only labels use the prior monospace font. Font selection happens inside the existing Canvas2D `text()` primitive, so measuring and drawing use the same font.
- The Google Fonts stylesheet loads before the main entrypoint; a successful `document.fonts.load()` triggers one paint of the screen layers, without blocking first render. This first trial uses remote Teko, not a locally hosted font.

## V071 — Fallout 4 font roles
- Replace Teko with Roboto Condensed Bold (700) for headings, gameplay UI labels, menus and buttons.
- Share Tech Mono Regular (400) is used for numeric statistics, top-five entries, settings values, score entry readout and Program/Version metadata. Column centers and sizing remain unchanged.
- Icons still use the original system monospace font. The role switch is handled by the Canvas2D text function before wrapping and measuring.
- Google Fonts supplies the two faces with the system monospace as an offline fallback; font readiness triggers redraw without blocking gameplay. Fonts are stylistically accurate substitutes, not copied game assets.

## V072 vertical typographic centering
- The shared Canvas text routine uses `actualBoundingBoxAscent` and `actualBoundingBoxDescent` to center the painted glyph bounds on the preexisting text anchors. The role-based font families, alignment, button dimensions and touch hitboxes remain unchanged.
- Older Canvas implementations exposing only width fall back to the previous `middle` baseline. Three focused tests cover fonts, buttons and compatibility.


## V073: user-approved CRT defaults
- The October 26 Display System screenshot is the new baseline: phosphor ON (green default theme); CRT scanlines ON, APERTURE pattern at 49%; screen vignette ON at 57%; phosphor bloom ON at 22%.
- Signal ghosting OFF, retained X 2px / Y 0px / intensity 22%; edge softness OFF, retained strength 64% / radius 3.0px.
- Defaults apply to first-time visitors and the existing Restore Defaults action. Previously saved user adjustments remain intact until manually restored. Ghost-piece and sound defaults are unchanged; no screen layout or compositor changes.

## V074: boot-to-CRT transition
- The `boot-sequence.js` classic script runs before engine imports and types a longer fictional ROM/diagnostic transcript over an opaque DOM overlay, so unfinished WebGL canvases and font reloads remain unseen.
- The terminal briefly collapses to a bright horizontal trace, then powers off to black; there is **no rolling of the terminal text**.
- Only a successful `compositor.render()` after a complete source-layer paint signals initial readiness. After boot text finishes, a callback starts an already-offset vertical CRT roll in the finished GPU image; the black cover is removed only after the **first rolled GPU frame** is submitted.
- `boot.rollTurns(t)` integrates constant initial speed followed by smooth deceleration through exactly two whole signal revolutions, returning to a zero-offset static image. The optional `compositor.setStartupRoll()` GPU pass is inserted after the approved CRT mask and before Output and is disabled outside the handoff.
- No saved effects, score/game logic, layout, normal CRT settings, or gameplay textures are changed. A slow init leaves the boot terminal visible, rather than revealing uninitialized content. Boot animation is one-shot per navigation, not per modal/game session.
- Run `boot-sequence.test.cjs`, `compositor.test.cjs` and existing regressions. Confirm signal appearance/timing on a real phone; CPU tests cannot certify GPU rendering.


## V075: approved first-concept NOMAD terminal
- The original full-screen diagnostic concept (not the later two-column framed UI) is now an actual generated Canvas2D surface: a large NOMAD // TETRIS SYSTEM masthead, eight-plus diagnostic checks, deterministic hex/ASCII dump, small board illustration, modules/memory/signal readouts, READY prompt and square cursor.
- `terminal-screen.js` produces **only grayscale pixels**. The scene uses that same source canvas as the loading cover and, after Three.js initializes, as the fullscreen scene texture. The native game compositor applies saved green/amber phosphor tint, bloom, CRT mask, vignette and optional effects. The before-WebGL fallback uses CSS approximation only until a real GPU terminal frame appears.
- `FieldAtlasTerminal.tileFace` is the exact eight-layer shared drawing function for game cells, small-piece previews and terminal artwork; preserve its per-kind luminance, inset cap and top/bottom bevel.
- `boot-sequence.js` coordinates startup typing/progressive reveal, the completed GPU terminal frame, terminal snap-off, and the rolling game pop-on. Existing gameplay uses the normal source canvas again once rolling starts, and its input is disabled until the game is revealed.
- The saved V073 CRT controls, UI fonts, display settings, game layout, scores and physics are not changed. The terminal is transitory, rendered only during a cold navigation.
- `boot-sequence.test.cjs` and `terminal-screen.test.cjs` verify readiness, luminance, shared blocks and terminal hierarchy; browser/phone visual validation remains necessary.


## V076: extended terminal hold, black pause and faster roll
- The original first-concept terminal is allowed to finish its type-on/reveal (~2.8s), then its **complete content remains on screen another four seconds**. GPU readiness is still mandatory before transition.
- The 145ms terminal snap-off is followed by precisely **1000ms of opaque black**; only then does the fully rendered game snap on already rolling.
- Startup roll now completes **four full revolutions in 1350ms** (was two in 1550ms), with constant initial velocity for 28% of the animation and a smooth continuous deceleration to zero offset.
- Grayscale artwork, shared bevelled block renderer, existing compositor settings, fonts and saved gameplay states remain untouched.


## V077: CRT-limited phosphor colour and touch-gated terminal
- The terminal remains on screen indefinitely after its ~2.8s diagnostics reveal; there is **no automatic transition**. Once the GPU has rendered the terminal and content is fully populated, its prompt changes to TOUCH SCREEN TO CONTINUE. A captured touchscreen pointer event triggers the handoff; it is consumed so the same tap cannot act on game controls. Touches before readiness do nothing.
- The immediate pre-WebGL canvas fallback remains grayscale (0% phosphor); the former CSS sepia/saturation/hue filters are removed. Once the real CRT composer renders the terminal, the phosphor mix ramps from 0% to **at most 100% of the chosen fixed green/amber tint** in 160ms. No colour tint may exceed full strength.
- A 40ms, single-episode 16% voltage flicker briefly increases luminance around 75–115ms after the GPU terminal appears, independently of colour tint. All stronger brightness is clamped to 1.2 in the shader; saved FX settings and theme colour remain unchanged.
- Power-off collapses the **actual live GPU phosphor display** in 145ms instead of re-showing an alternate CSS-coloured fallback image. After collapse, an opaque black cover holds for the previous 1000ms, then the game snaps on into the previous rapid four-turn roll.
- Both terminal and game footer, as well as accessible title labels, spell the build prefix as `version: 077`, not abbreviated `v077` or `V077`.
- No change to gameplay, board geometry, tiles, saved settings, score persistence or the established 1.35s rolling deceleration.


## V078: reference-led CRT startup choreography
- The October 28 user-uploaded vintage terminal reference establishes an explicit **visual timeline**: signal power-on as a horizontal beam, typed masthead, progressively checked diagnostics, character-by-character hexadecimal memory dump, staggered tetromino drawing, peripheral telemetry readout, final command status, then a user-tap hold. The first-concept panel geometry, Roboto Condensed / Share Tech Mono roles and grayscale brightness hierarchy are unchanged.
- The timed startup begins only after the **first completed GPU terminal frame**, not while remote Three.js resources are loading. `FieldAtlasTerminal.durationMs=6100` controls when the completed terminal becomes tappable. No automatic transition is ever scheduled.
- Deterministic, brief voltage pulses (28–40 ms) raise **only luminance** by at most 17%, while the chosen green/amber phosphor blending remains clamped to 0–100%. Sync disturbances animate horizontal tearing for <120 ms at specific points in the boot sequence, passed to the **existing GPU boot-roll ShaderPass**, which remains disabled during normal gameplay.
- No alternate hue or CSS saturation is used. The HTML loading cover is near-black `#080808` until a real CRT-composed frame exists. The one-second post-power-off blackout also uses `#080808`, not `#000000`.
- Touching once the final instructions are visible snaps the CRT off with the existing 145 ms collapse, holds near-black for 1000 ms, and snaps on the gameplay screen already rolling four revolutions to a still image. Touch input remains consumed during startup.
- The authoritative HTML build marker updates to `078`; the terminal/game displays use `version: 078`. No saved scores, core gameplay, settings, or tile-face calculations change.


## V079: no startup beam; source-only shutdown; square UI corners
- The V078 startup beam is deliberately removed. The grayscale source now begins completely off (0 luminance), smoothly fades toward the established near-black `#080808` over approximately 620ms, and the terminal's staged lettering begins after 720ms. The uploaded reference still guides typewriter/diagnostic/glitch rhythm.
- The user meant **beveled/rounded CORNERS of containers and buttons**, not the Tetris block shading. The exact original eight-layer tetromino tile-face (top-left highlight, inset face and dark lower-right edges) was restored from the prior release and remains shared by the game and terminal. Common `panel()` uses a corner radius of **zero** for all game containers/buttons. Modal effect thumbnails clip squarely; colour/luminance, fills, outlines and hitbox positions remain unchanged.
- Power-off transforms the **terminal's grayscale Canvas2D content before the GPU renderer**. On tap, it contracts vertically toward the middle of a stable `#080808` source over 145ms and then remains near-black for 1000ms. Crucially, `compositor.js` was restored byte-for-byte to the V078 implementation. Phosphor colour, bloom, scanline mask sampling, ghosting and vignette are unchanged and remain fixed as the source collapses. No CSS screen scaling/animation, no DOM blackout cover, and no new compositor passes or uniforms.
- The first rolled game frame re-marks all underlying HUD/board textures dirty, preventing old hidden-planes from remaining invisible when the display changes source. Manual tap-to-continue remains in effect.
- Build is `079` and the terminal/game footer display `version: 079`.


## V080: preserve glitches for later; remove two startup flicker risks
- V078 timed sync-fault schedules and the existing shader remain intact. The explicit `SIGNAL_GLITCH_ENABLED=false` flag suppresses all horizontal tearing during boot. The short voltage/luminance flicker pulses are independent and remain active. No saved theme/CRT settings are changed.
- For startup stability, the opaque loading cover matches the initial unlit source at `#000000` while the compositor warms up. The terminal is uncovered **only after two completed GPU-rendered terminal frames** (the second is requested explicitly), then the original source fades toward `#080808` before the first diagnostic letters. The one-second power-off intermission remains `#080808` and the screen compositor/scanline mask remains stationary.
- The `/tetris/` entry page previously contained both a zero-second HTML meta refresh and a JavaScript `location.replace`. The redundant meta refresh is removed to prevent two competing navigations. The permanent bookmarked URL remains unchanged and the redirect continues to work.
- These changes address plausible startup flashing sources, but do not establish that caching/memory was the root cause. Browser/WebGL first presentation and obsolete service-worker state remain device-specific possibilities. No automatic clearing of site data or scores is performed.
- A later *game-reveal* animation could stage existing UI and board source layers after tap, while preserving their positions, the original cell bevels, and the current CRT effects. It is not introduced in V080 without visual approval.


## V081: simplify handoff to matching content fades
- The V080 full terminal remains the same including tap-to-continue, saved phosphor themes, luminance-only voltage flickers and disabled archived sync glitches. Tap now triggers a **450ms smooth grayscale source fade to near-black `#080808`**; the source no longer collapses vertically, and **no CSS screen transform or compositor shader changes** occur.
- The terminal then holds at `#080808` for **1000ms** with the same CRT pipeline/scanline sampling as always.
- Instead of rolling or staged section-by-section assembly, the real finished gameplay screen now appears under a **single fullscreen, smooth 850ms grayscale/alpha mask fade**. It covers header, board, pieces, controls, and footer together. The mask is a scene layer *upstream* of the same phosphor/CRT effects; scanlines and optics remain static while luminance is revealed.
- The prior V074/V076 vertical-roll shader, curve and V081 staged regional reveal remain recoverable from Git history. The roll pass is explicitly reset to zero on handoff and no section mask is scheduled.
- Input is unavailable until the **entire game-screen fade completes**. All square-corner containers, shared beveled tetromino faces, saved settings and gameplay remain unchanged.

# Tetris System architecture (V072)

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

# Tetris System architecture (V063)

## Runtime
- `core.js`: deterministic Tetris state, gravity, collisions, scoring and locking. No WebGL dependency.
- `scores.js`: high-score persistence.
- `layout.js`: responsive geometry in CSS pixels; source and GPU use a capped render DPR of 2.
- `input-controller.js`: touch/keyboard events and auto-repeat. Calls actions; does not paint or submit WebGL.
- `three-v027.js`: application composition, scene resources, lifecycle and render scheduling.
- `render-invalidation.js`: the single owner of layer dirty flags, pending composites and redraw reasons. Call `mark(layer...)` for changed source data; `reason(kind)` for attribution/input; call `consume(layer)` once when a layer is actually painted. Never directly upload textures on every animation callback.
- `hud-drawing.js`: reusable rendering for the sidebar and controls, supplied live state and Canvas primitives by the app; preserves established key order and touch geometry.
- `display-settings-catalog.js`: display-effect defaults, slider definitions, preset choices and value conversions, separate from UI painting.
- `canvas-ui.js`: low-level reusable Canvas2D drawing and current hit-region registration.
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
6. Popup and modal textures retain their established ordering and interaction priority.
7. The scene layers are composed **before** bloom, phosphor, vignette, scanlines and output. Effects still process the combined full screen.
8. `mark('board')` must not implicitly mark `base`. Keep redraw causes in one place.
9. Preserve exact grayscale appearance, approved spacing, text, icon sizes and the user-defined effect settings.

## Performance baseline
V062 iPhone 393×852, render DPR2:
- No base uploads across seven ordinary-play 2-second samples.
- Draw calls can be ~21 per submitted frame with current enabled FX.
- Small uploads and skipped unchanged compositor frames are more important than raw requestAnimationFrame callback count.
- `renderer.initTexture` elapsed time includes CPU/driver waits, and is **not** direct GPU execution time.

## Development and verification
- Keep the permanent URL: https://buyingzebra.github.io/nl_offline/tetris/
- Bump `THREE_BUILD_VERSION` and keep the version visible in the UI before publishing.
- Run tests using `node --test tetris/*.test.cjs`. Avoid brittle source-string checks where a behavioral test is possible.
- Verify touch controls, pressed/released feedback, hold/next, READY/PAUSED/OVER popups, menu scrolling, and both device orientations.
- Confirm current rendering costs on an actual iPhone via the copied debug report; automated checks alone cannot establish visual equivalence.
- Work in small reviewable changes; preserve the V062 behavior/appearance benchmark.

## Deliberately deferred
- Separating every menu painter from the app coordinator.
- Fully declarative hitbox descriptors shared between drawing and input.
- Consolidating version metadata used by the HTML bootstrap and JS module reload checks.
These are sensible follow-up cleanups, not prerequisites for adding gameplay features.

# NOMAD Tetris v209 — high-priority consolidation comparison

Baseline: **v208** (`6ed8ccf`). Candidate: **v209** (`refactor/v209-high-priority`).

This update addresses the three high-priority audit findings as ONE coordinated, behaviour-preserving cleanup. Medium and lower-priority findings (default effect settings, menu close action consolidation, settings-schema validation, idle-GPU optimization, old compatibility symbols) are intentionally postponed.

## 1. Reliability / the quality gate

- Updated outdated source-text assertions to match the current documented behaviour and modules.
- New regression checks compare the real control-painter button dimensions against the independent hitbox-only registrar, for portrait, small portrait and landscape layouts.
- New regression checks require HIGH SCORE to be painted into the post-blur popup **only once**.
- The normal CI gate now runs `node tools/build-tetris-release.mjs --check` before Node tests, and also responds to pull requests.
- All **385 Node tests** pass on the v209 candidate; the original v208 gate had **375 of 383 passing**. The source-text test cleanup is not a proof of unchanged screenshots.

## 2. Single visual owner

| Display region | v208 | v209 |
| --- | --- | --- |
| Gameboard | Drawn on base and again on the cropped board plane | Cropped board plane only |
| Sidebar | Drawn on base and again on the cropped sidebar plane | Cropped sidebar plane only |
| Gameplay controls | Drawn on base and again on the cropped controls plane | Cropped controls plane only; the base registers geometry/hitboxes without painting |
| HIGH SCORE | Sharp popup texture **and** modal texture | Sharp popup texture only; modal plane hidden |
| Inset shadow | Single cached inset after optional board blur | Unchanged |
| Piece shadows, pieces and blur | Board background → piece shadows → pieces → optional blur | Unchanged |

The game buttons' exact geometry is computed by a single `visitControlButtons` helper. It feeds `drawControls` for visible pixels and `registerControlHitboxes` for input. This removes a previous dependency where drawing otherwise-hidden controls was required just to register their touch bounds.

**Visual caveat:** High Score was double-composited in v208; removing one copy can reduce its apparent brightness. That is a correction to accidental duplication, not a change in user-selected luminance settings.

## 3. Module ownership

- `render.js` retains the scene, artwork, layout, compositing and UI rendering. CPU-side diagnostics/reporting moved to `diagnostics.js`.
- `platform.js` retains startup, game integration, scheduling and browser lifecycle. Touch/keyboard input moved to `input.js`.
- Both public module exports remain accessible through `render.js` and `platform.js` for compatibility.
- `game.js`, `shadows.js`, the Three.js bundle, shaders, scoring rules, layouts, fonts and stored preference keys are unchanged.

## 4. Actual size comparison

Repository blob sizes (not gzip/Brotli transfer sizes or measured browser/GPU memory):

| Metric | v208 | v209 |
| --- | ---: | ---: |
| Repository files | 55 | 57 |
| `render.js` | 153,349 bytes | 130,103 bytes |
| `platform.js` | 78,565 bytes | 71,359 bytes |
| `diagnostics.js` | — | 23,811 bytes |
| `input.js` | — | 7,953 bytes |
| Combined `game` + `shadows` + `render` + `platform` + extracted modules | 276,392 bytes | 277,704 bytes |
| Offline precache runtime assets | 25 | 27 |
| Offline precache raw bytes | 884,898 | 891,709 |

The total JS source actually **grows ~0.5%** because it now has cleaner boundaries. The offline payload grows by approximately 6.8 KB in uncompressed assets. This is an organizational and redundant-work reduction, **not** a measured speedup or download-size optimization. Do not interpret lower file sizes for individual modules as evidence of lower runtime memory or GPU work.

## 5. Regression study checklist

1. Compare v208 and v209 on the same phone and effect settings: READY → START → PAUSE → HIGH SCORE → RETURN.
2. Inspect HIGH SCORE for a now-single, appropriately luminous title/scoreboard/button; compare the same board inset shadow and blur as PAUSED.
3. Toggle green/amber from PAUSED, HIGH SCORE and LIGHT CONTROL.
4. Test the ✓ close controls; verify that LIGHT CONTROL still returns to Display System.
5. Confirm NEXT and HOLD retain the three-block I glyph while the live I has four blocks.
6. Exercise touch, hold-repeat, keyboard, pause, app background/foreground, screen rotation and the installed PWA offline.
7. Use Copy Debug to compare actual base paint count, texture uploads and CPU p95 on a physical phone. Compare equivalent states and time windows, not single frames.

No physical-device performance or battery benchmark was performed as part of this cleanup.

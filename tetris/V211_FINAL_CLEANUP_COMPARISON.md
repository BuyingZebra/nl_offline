# NOMAD v211 — final audit cleanup and A/B study

Baseline: **v210**, commit `e4976bb`. Experiment: **v211** (`refactor/v211-low-priority` until promotion).

This update concludes the three-stage reliability and modularity audit. It targets idle main-thread scheduling and provably unused layout configuration without modifying board artwork, piece graphics, shadow geometry, shader passes, saved preferences, gameplay timing or scoreboards.

## 1. Reduced idle animation work

Before v211, having phosphor persistence enabled requested browser `requestAnimationFrame` continuously even when gameplay was READY/PAUSED/GAME OVER. The actual phosphor-history redraw was gated to roughly one new GPU render per 33 milliseconds; continuous RAFs in between consumed JavaScript work without changing the picture.

v211's `needsContinuousFrame` now reserves continuous RAF for gameplay, active scroll, line-clearing, held buttons and queued redraws. While the display is stationary, a **single timed wake** schedules the next animation frame just before the existing phosphor ~30 Hz target, or earlier if the terminal's current character or cursor blink needs an update. Pointer and keyboard events still immediately request RAF. The same phosphor shader and input/output textures remain active, and the elapsed time between actual GPU submissions is still sent to the phosphor integration function.

This is an intended **callback scheduling reduction**, not a deliberate change in glow, persistence time, active-game frame rate or pixel quality. Actual performance depends on device and OS scheduling; the timer-to-RAF delay is not guaranteed to be an exact 33 ms.

## 2. Removed dead configuration hints

Three old `UI_SPACE` fields (`holdHeight`, `nextHeight`, `statsHeight`) were no longer used by responsive layout or drawing. They have been removed. Tests verify identical computed layout on small, normal and landscape viewports with or without those historical hints.

Do **not** remove the historical `fieldAtlas*` keys or initials migration APIs merely for aesthetics: users' existing preference/score compatibility relies on retaining those identifiers. The actual source/vector assets remain in place, because deleting artwork used as a fallback cannot be justified as a safe optimization.

## 3. Same-build A/B measurement

The new optional query parameter `?idlepacing=off` activates the **v210 idle-RAF scheduler** *inside v211*, without changing graphics, game rules or stored preferences. This is for comparative testing only. Ordinary links use the improved paced scheduler.

- **Paced idle (v211 default):** https://buyingzebra.github.io/nl_offline/tetris/three-v027.html
- **Legacy idle (v210 scheduling A/B):** https://buyingzebra.github.io/nl_offline/tetris/three-v027.html?idlepacing=off

The Copy Debug output now includes `Idle scheduling: paced idle timer` or `Idle scheduling: legacy continuous RAF`. The same shader processing, static texture passes and user-defined effects are present in either mode.

**Study procedure on the same physical phone:** close all existing NOMAD tabs and launch **one** link; keep the same device brightness, phosphor colour, effect sliders and battery state. Remain on READY for ~8–12 seconds, then use Display System → Copy Debug. Save that output. Repeat for PAUSED (without moving pieces), then repeat with the other link. Compare the samples' `frames`, `draws`, `RAF avg/max`, `CPU avg/max` and `PASS CPU` at equivalent states. Visually check the terminal cursor, piece afterglow, UI button light decay and input responsiveness. Do not use a hidden/inactive tab to compare: browsers deliberately throttle hidden tabs.

**Interpretation:** an idle-RAF reduction is expected; an actual GPU-time, FPS, memory, device-temperature or battery improvement is **not established** until measured on a real phone. Phosphor updates during continuous gameplay remain tied to the same compositor. Idle headless browser timings are affected by throttling, so test passes cannot establish a reliable real-phone percent improvement.

## 4. Source sizes (uncompressed Git blobs, not actual downloaded bytes)

| Code | v210 | v211 |
| --- | ---: | ---: |
| `platform.js` | 71,311 bytes | 72,456 bytes |
| `render.js` | 130,103 bytes | 130,103 bytes |
| `diagnostics.js` | 23,811 bytes | 23,863 bytes |
| `input.js` | 7,891 bytes | 7,891 bytes |
| Core 6-module source total | 278,535 bytes | 279,732 bytes |

The additional source consists chiefly of a small pure scheduler helper, a measurable A/B override, and documentation. The runtime *source bytes* increased about 1.2 KB; no additional GPU pass, texture, artwork file, or canvas is created.

## 5. Regression / shipping gate

- Verify `node tools/build-tetris-release.mjs --check` and all Node tests pass.
- Run Chromium's two-tab offline upgrade and graphics smoke tests and WebKit's gameplay/offline smoke tests.
- Require the browser idle probe to confirm **bounded** idle RAF and timer creation; the old `<=8 timeouts` assertion corresponded to the obsolete scheduler, not to the new one-shot timer policy.
- Compare identical screenshots across READY/PAUSED/HIGH SCORE/LIGHT CONTROL and check board blur → ONE inset shadow → menus is maintained.
- Keep old v210 public until branch tests are green, then promote to main and verify GitHub Pages.

## 6. Not changed / next experiment

We did not compress/downsample native-resolution phosphor history, resize the board-popup texture, change the compositor's 12-pass graph, or delete artwork fallbacks. Such work could affect image fidelity or cross-screen shadows; it should be driven by reproducible physical-device measurements rather than assumptions.

If you later supply two Copy Debug reports (paced vs legacy), the frame/draw counts and per-pass CPU times can guide a next, much narrower optimization if warranted.

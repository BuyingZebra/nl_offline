# NOMAD Tetris v210 — Medium-priority reliability update

Baseline: **v209** (`c1641f6`). Candidate: **v210** (`refactor/v210-medium-priority`).

This release addresses the medium-priority issues identified in the architecture audit: unified menu navigation, complete display-effect validation, and safer version-coherent offline publishing. **The default display values, gameplay, vector artwork, geometry, board blur, shadows and compositor ordering are unchanged.** This is not an optimization of shader quality, brightness, or frame rate.

## 1. One contextual close action

- Display System, High Score and Light Control now invoke the **same `close` action**.
- `createScreenManager.close()` owns the destination: closing Light Control returns to its parent Display System without resetting its scroll state, and closing Display System/High Score returns to the paused or ready game.
- The checkmark glyph and its location are unchanged. The obsolete `lightDone` dispatch and the keyboard-specific `onLightExit` callback are removed. Escape and the checkmark share the contextual close route.
- Closing a menu never implicitly resumes a paused game; existing score persistence and button geometry are unaffected.

## 2. One finite settings schema

- `normalizeEffectValue` provides one validation path for persisted settings, legacy migrations and new slider changes.
- Numeric effects are bounded by `EFFECT_NUMBER_RANGES`; all values must be finite. The existing persistence-decay 10 ms step/120 ms cap remains.
- Booleans must remain actual booleans and the scanline preset must be one of the five supported renderer presets.
- Unsupported and malformed saved fields safely fall back to the **existing** defaults, preserving the old storage key and valid historical preferences.
- Unsupported scanline selections are rejected without overwriting the current preset. Restore Defaults remains unchanged and does not reset phosphor colour.

## 3. Safe offline updates

- The release generator checks and regenerates the critical versioned module links: entry → platform, platform → input/render, input → render, render → diagnostics.
- The service worker validates those same links **from the actual cached files** during installation after checking the shell version. A partially published Pages deployment with a new HTML shell but stale critical JavaScript fails installation, deletes only its incomplete staged cache, and leaves the previous release available.
- Existing rules remain: no mixed network/runtime fallback, no premature `skipWaiting`, no unrelated cache deletion, and no forced gameplay interruption.
- Regression tests simulate a stale module and verify that the old offline cache survives.

## 4. Source comparison (uncompressed Git blobs)

| File | v209 | v210 |
| --- | ---: | ---: |
| `game.js` | 30,691 B | 31,632 B |
| `input.js` | 7,953 B | 7,891 B |
| `platform.js` | 71,359 B | 71,311 B |
| `render.js` | 130,103 B | 130,103 B |
| `sw.js` | 6,080 B | 6,765 B |
| Release generator | 2,457 B | 3,458 B |
| Total of these files | 248,643 B | 251,160 B |

Reliability work adds approximately 2.5 KB of uncompressed source across these files. It does not introduce a new GPU pass, visual asset, render target, effect default or font. Do not interpret the source-size difference as a memory/battery measurement.

## 5. What to study on your phone

1. Start a game, PAUSE, open Display System, enter Light Control, adjust a slider, then tap ✓. You should return to **Display System** with its existing scroll position, and the game still paused.
2. Tap ✓ again: you should return to PAUSED, not silently resume. Repeat using Escape on a keyboard.
3. Open HIGH SCORE and tap RETURN; the game should remain paused. Test the green/amber toggle there and in Light Control.
4. Change the sliders, relaunch offline, and confirm valid settings persist. Restore Defaults should retain the same initial baseline and the currently selected phosphor colour.
5. Compare v209/v210 Ready, Playing, Paused and High Score screenshots; no intended luminance, board-shadow or menu geometry changes exist.
6. For a realistic upgrade test, close **all** old NOMAD tabs/the installed PWA and reopen; a waiting worker activates only after old clients leave.
7. If you compare Copy Debug numbers, use equivalent device, settings and gameplay states. This update is not expected to make a measurable speed difference.

## 6. Next release scope

The third/low-priority update may investigate idle GPU/persistence scheduling, GPU memory and source crop efficiency on real phones, legacy symbols, leftover configuration fields and documentation cleanup. Those require measured evidence before visual-quality-affecting changes.

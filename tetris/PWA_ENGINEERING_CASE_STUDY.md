# NOMAD v186 — A PWA rendering-efficiency case study

**Status:** Tested in GitHub Actions (Chromium and WebKit); physical iPhone and Android measurements remain outstanding.

## The engineering objective

Improve **CPU allocation discipline** and **scheduling efficiency** while retaining
NOMAD's Three.js r180 compositor, phosphor persistence, sprite/SVG artwork, visible
button luminance, gameplay rules, offline update design, and original storage keys.

This is intentionally a focused intervention, not a renderer rewrite or a file-count
exercise. All application code still lives in `game.js`, `render.js`, and `platform.js`.

## 1. Diagnose: work in a frequently executed code path

The old `platform.js` frame loop, during a paused or ready state, created a
`setTimeout` to wake the terminal cursor and **also** requested another
animation frame if phosphor persistence was enabled. Because the continuous
animation frame arrived before the timeout, the next frame cancelled and
re-created that timeout.

The result: more timer registration and cancellation than the UI needed.
There was no need for two simultaneous wake-up mechanisms.

The same loop converted every button-lighting sample into nested arrays and
a combined string, solely to compare it with the previous frame. This was
especially wasteful on frames with no pressed buttons.

## 2. Make the smallest responsible changes

### A. Choose exactly one wake-up mechanism

`platform.js` now uses the pure, directly testable
`needsContinuousFrame(...)` policy. While animation work exists, only
`requestAnimationFrame` advances the frame and terminal. When continuous
frames are not required, a single terminal timer wakes the next required
frame. The frame scheduler cancels pending old timers before making the
decision, preserving lifecycle behaviour.

The compositor's existing render cadence and phosphor parameters **have not
been changed**. This work eliminates timer churn; it does **not** solve the
separate problem of unnecessary full-screen GPU updates in a fully idle
phosphor-enabled application.

### B. Compare button samples without temporary strings

`render.js` now uses `buttonFeedbackChanged(previous, current)`, a
zero-allocation comparison over the samples and their same prior quantized
8-bit brightness values:

```js
Math.round(sample.power * 49)
```

The `createButtonFeedback().sample()` function also returns a shared
immutable empty array whenever no buttons are active. Non-empty snapshots
retain their original data format and immutability.

No pixel calculations, shader constants, bloom settings, button appearance,
or piece artwork were adjusted.

## 3. Measure honestly

The optional Playwright smoke test counts browser callbacks over **two seconds**
after a **three-second settled ready-state period**. Instrumentation wraps
`requestAnimationFrame`, `setTimeout`, and `clearTimeout`, then restores
the original browser functions. The tests use local HTTP serving, a real WebGL
canvas, and GitHub-hosted headless browsers.

| Observed calls over 2 s | v185 | v186 |
| --- | ---: | ---: |
| WebKit — RAF callbacks | 20 | 17 |
| WebKit — timeouts scheduled | 21 | **0** |
| WebKit — timeouts cancelled | 21 | **0** |
| Chromium — RAF callbacks | 1 | 3 |
| Chromium — timeouts scheduled | 2 | **0** |
| Chromium — timeouts cancelled | 0 | **0** |

**Interpretation:** The extraneous timeout churn is eliminated in this test.
The RAF counts are **not** a valid speed comparison. Software WebGL, frame
scheduling and CI machine load vary substantially between browser runs.

No mobile-battery, GPU-time, memory-usage or frames-per-second improvement is
claimed from this measurement. Reduced hot-path allocations are established
by comparing the code paths; browser heap savings are not yet measured.

## 4. Prevent regressions

- The browser suite asserts a small upper bound on unintended idle timer
  operations in its known persistence-enabled test profile.
- Unit tests compare `buttonFeedbackChanged` against the former string
  signature for the same combinations of button locations and luminance
  values, and verify reuse of the immutable empty sample.
- Unit tests verify the pure frame-work decision across running, paused,
  pending line-clear, scrolling, button and persistence states.
- The established image-based smoke checks still exercise button afterglow,
  viewport/rotation behaviour, touch capture, WebGL recovery, offline
  reopening and version transitions in Chromium and WebKit.
- **333 Node tests and both browser smoke suites passed** on the v186
  candidate before this documentation and test-assertion refinement.

## 5. Architectural lessons

A **platform** owns the wake-up policy, input events and browser lifecycle.
The **renderer** owns visual feedback samples and their exact luminance
comparison. Neither needs a new library to make those responsibilities clearer.

Professional optimization should follow this cycle:

```text
Observe → form a narrow hypothesis → modify one responsibility
       → test invariants → measure again → document limitations
```

A smaller file count, smaller JavaScript source file, or synthetic benchmark
alone is not evidence of an improved mobile experience.

## 6. Valuable next experiments

**Priorities for a separate, carefully measured release:**

1. Study whether CRT history can safely become quiescent in an idle window,
   including blinking terminal pixels, without altering the approved
   phosphor decay. Capture before/after pixel comparisons first.
2. Record browser texture-upload counts, WebGL draw calls, frame-phase
   timings, and graphics resource counts during gameplay, modal use, and
   resume. The existing performance recorder already exposes much of this.
3. On real iPhone Home Screen and Android PWA installations, test long
   pauses, context loss, visibility/bfcache, input repeat cancellation,
   storage durability, version handoff, and device heat/battery.
4. Establish per-feature performance budgets only after repeatable device
   measurements, especially at 60 Hz and 120 Hz.

**Out of scope for v186:** SVG edits, new rendering libraries, native wrappers,
major gameplay changes, and unverified visual optimizations.

### Related material

- [RequestAnimationFrame — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [Performance fundamentals — MDN](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Fundamentals)
- [NOMAD architecture](./ARCHITECTURE.md)
- [NOMAD browser smoke harness](../tests/test_tetris_browser.py)

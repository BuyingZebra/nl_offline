# NOMAD experimental phosphor history — V097

**Status: research-informed prototype, not a calibrated measurement of a physical CRT.**

## Primary references

- Compton, "Selecting phosphors for displays," *Information Display* (1989), https://doi.org/10.1002/j.2637-496X.1989.tb05327.x — P39's low-intensity 0.1% tail reaches whole seconds; 10%, 1%, and 0.1% decay points are not interchangeable.
- "A video terminal's no better than its CRT's readability," archival display-engineering article, Computer History Museum, https://archive.computerhistory.org/resources/access/text/2024/05/102734460-05-0001-acc.pdf — P39 yellow-green with approximately 150 ms to 10%, P31 green approximately 38 microseconds to 10%. The P4 figure in the extracted table may contain typography/OCR errors; cross-check HP AN 115.
- Hewlett-Packard *Application Note 115*, https://hpmemoryproject.org/an/pdf/an_115.pdf — comparative registered phosphor characteristics, including P39, P31, P4.
- Di Lollo et al., "Phosphor persistence of oscilloscopic displays: a comparison of four phosphors," *Spatial Vision* 10(4) (1997), https://doi.org/10.1163/156856897x00276 — perception depends on intensity, ambient light, and task.

## Model and limitations

The numerical V097 prototype uses two exponential components:

`I(t) = A_fast exp(-t/tau_fast) + A_slow exp(-t/tau_slow)`

For P39 we choose A_fast=0.98, tau_fast=60 ms; A_slow=0.02, tau_slow=1.2 s. This predicts 9.8% residual at 150 ms and ~0.16% at 3 s. **Only the approximate 10% reference and the qualitative seconds-long faint tail are sourced.** This is *not* a measured multiexponential fit.

P31, P1, and P4 similarly use historical 10%-time checkpoints and *illustrative* weak tails. The sub-frame fast decay of P31 and P4 cannot be temporally resolved at ordinary smartphone refresh rates; the demo is a frame-averaged representation, not a simulation of beam dwell time.

The pass stores fast and slow histories in two half-resolution GPU render targets (square-root encoded RGBA8), blends *only* residual history over the original sharp grayscale source, and then uses NOMAD's existing bloom and tint. The profile tint triplets are approximate display colours, **not measured spectra, CIE chromaticities, or emitted radiances**. Spatial kernel/beam-spot optics, electron-gun voltage response, raster phase, and verified display gamma are future work.

V096 remains available instantly by switching **PHOSPHOR HISTORY** off in Display System. On navigation, resize, or visibility changes, history resets intentionally to prevent cross-screen ghosts.

# NOMAD V097 — experimental phosphor persistence profiles

V097 models a **frame-averaged phosphor emission envelope**, not a calibrated
simulation of a specific electron gun or screen. It is optional in DISPLAY SYSTEM
under **PHOSPHOR HISTORY**. Toggle it off for the V096 baseline. P39 is the
default experimental profile; tap the profile picker to cycle P31, P1 and P4.

## Published evidence and what it does — and does not — establish

- Compton (1989), *Selecting phosphors for displays*, *Information Display*:
  P39's tail takes whole seconds to reach **0.1%**. A 10%, 1%, or 0.1%
  threshold alone is insufficient to characterize a whole phosphor response.
  https://doi.org/10.1002/j.2637-496X.1989.tb05327.x
- Wolf & Deubel (1997), *P31 phosphor persistence at photopic mean luminance
  level*, *Spatial Vision*: in their photopic grating experiment, residual
  **contrast** was **1.4%** after **50 ms**. It does **not** provide a general
  P31 intensity response; luminance and contrast must not be equated.
  https://pubmed.ncbi.nlm.nih.gov/9176941/
- Di Lollo et al. (1997), *Phosphor persistence of oscilloscopic displays*:
  perception of the P31 afterglow can last several hundred milliseconds
  under some viewing conditions; subjective visibility is not luminance.
  https://pubmed.ncbi.nlm.nih.gov/9176944/
- Andersson, *Phosphor Persistence Plotting*: separate spatial emission
  and temporal persistence; his code targets an **oscilloscope**, not a
  P39 monochrome terminal.
  https://richardandersson.net/?p=350
  https://github.com/RandomDude4/PhosPersPlot

## Model actually implemented

We preserve the grayscale Canvas2D source, the compositor, and existing
optical bloom. V097 inserts one **optional** history pass after button
response and before optical glow / tint.

For a source luminance `S(t)` above the independent #080808 background,
two state channels receive new excitation and fade with exponential
time constants, computed from actual elapsed render time:

```
F_new = max(S, F_old * exp(-dt/tauFast))
B_new = S > B_old
  ? B_old + (S-B_old) * (1-exp(-dt/tauRise))
  : max(S, B_old * exp(-dt/tauSlow))
L_out = prompt*S + fastWeight*F_new + slowWeight*B_new
prompt + fastWeight + slowWeight = 1
```

This is a **heuristic nonlinear charge/decay model**, not a measured
impulse-response fit. Parameters below are **hypotheses**, NOT empirical
time constants from any of the cited sources.

| Profile | prompt | fast weight | fast tau | slow weight | slow tau | rise tau |
|---|---:|---:|---:|---:|---:|---:|
| P39 | 0.48 | 0.28 | 160 ms | 0.24 | 1.1 s | 250 ms |
| P31 | 0.70 | 0.28 | 8 ms | 0.02 | 130 ms | 80 ms |
| P1  | 0.66 | 0.29 | 30 ms | 0.05 | 250 ms | 160 ms |
| P4  | 0.81 | 0.18 | 5 ms | 0.01 | 60 ms | 50 ms |

P39 is classified long persistence. P31 is substantially shorter,
but has a perceptible weak tail under some conditions. P1 and P4 are
illustrative comparisons; P4 has an approximate **white** emission tint.

The state is stored in two low-resolution RGBA8 GPU targets; square-root
encoding improves numerical resolution at faint luminance. The sharp
current source remains full resolution. No source textures are reuploaded
for the decay. The rolling history is **reset on screen navigation,
display resizing, suspend/resume, WebGL context loss and profile changes**.
The app limits follow-up compositing while a profile settles.

## Not yet implemented

- Actual raster electron-beam timing, spot/current dependence,
  and measured scan-line modulation.
- Measured spectral emission profiles for P39/P31/P1/P4 (RGB hues
  are indicative, **not** calibrated wavelengths).
- A measured spatial point-spread function and faceplate scattering
  (existing bloom is left intact for A/B comparison).
- Validated phosphor-response traces from a named tube model.
- P7's wavelength-dependent dual-layer afterglow. Modelling P7 as one
  green luminance channel would be misleading; wait for a spectral model.

This experimental path must not be described as *physically accurate
to a particular CRT* until the constants, luminance and colour can be
validated against published measurements or hardware recordings.

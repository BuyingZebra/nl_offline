# NOMAD V101 — unified canonical phosphor colour

**Experimental luminance-envelope simulation, not a calibrated physical CRT.**

The previous V099 raster simulation has been removed. Its moving beam, 30–120 Hz scan control, scan phase, line footprint and frame-averaged beam integration no longer participate in rendering.

## Model

A single grayscale post-processing pass receives the **entire composed scene** after the game's original opaque board, HUD, controls, text, modal/scores/pause overlays and button response. This is a display effect, not a tile or board effect.

Per location, incoming grayscale video luminance is `drive` and existing phosphor output is `light`.

`lightNext = drive + (lightPrevious - drive) * exp(-dt / tau)`

The time constant `tau` uses:
- **Rise:** 12 ms fixed, modeling prompt excitation for newly illuminated regions.
- **Decay:** user-adjustable **10–2000 ms**, default **190 ms**, for regions where the drive falls.

## Canonical artistic tint

V101 restores the original NOMAD Tetris compositor's fixed colour ratios from V096:

- **Green:** `vec3(0.2, 1.0, 0.2)`
- **Amber:** `vec3(185/255, 79/255, 9/255)`

Both represent final shader tint ratios, not separate coloured UI assets or measured phosphor spectra. The complete screen is composed as neutral luminance first. The selected colour is applied after the phosphor response and bloom. Crucially, the tint selection is independent of whether the phosphor history is enabled, and independent of its decay setting. V098–V100 had inadvertently substituted a greener-blue tint of `vec3(.22,1,.34)` when history was active; V101 eliminates that condition.

The history pass stores sqrt-encoded state and the downsampled current drive in half-resolution RGBA8 ping-pong textures. A second shader combines residual glow with the sharp full-resolution content. The emitted monochrome image is passed to existing bloom and the separately selected artistic green/amber tint.

This is a simple piecewise first-order light-response envelope; real phosphors exhibit intensity-dependent multi-component decay, spectral differences, and tube spot/optical effects. None is claimed to be measured here.

## The pause/menu defect

V099 explicitly called `compositor.resetPersistence()` when pausing, changing game status, and opening/closing menus. These calls discarded the old luminescence, making trails appear limited to gameplay. V100 removes those transition resets. The history keeps evolving through pause, board popups, scores, menus and controls. A genuine GPU context loss, viewport resize, background suspension or toggling the effect can still legitimately reset the buffer.

## User controls

DISPLAY SYSTEM → **PHOSPHOR RESPONSE**:
- Toggle.
- **DECAY** slider 10–2000 ms (10 ms steps).

There is no simulated scan/refresh control. Green/amber tint remains independent. The old separately selectable decorative CRT scanline artwork remains part of the legacy optical effects, and is disabled while the new phosphor response is active; it is not a beam simulation.

## Verification

Unit tests ensure the exponential envelope, slider bounds, pass order and all-scene ordering, and that pause/game transitions and menus do not reset the phosphor history. Chromium and WebKit browser smoke tests verify startup, controls, WebGL image output and offline launch. This is software verification, not CRT photometric calibration.

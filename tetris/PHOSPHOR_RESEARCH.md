# V102 — spatial point-spread plus phosphor persistence

The V101 phosphor response was already a whole-screen temporal field, but its
spread depended entirely on optional artistic bloom. V102 models spatial
spread directly, using a normalized Gaussian point-spread kernel applied to
the *emitted neutral phosphor field* before artistic bloom and tint. Bright
pixels contribute luminance to their neighbours; the field retains the same
decay after the source disappears. Spatial spread is **not** described as
excitation passing from one phosphor particle to its neighbour.

### Published basis

- Knudson (1968), *Experimental evaluation of the resolution capabilities of
  image-transmission systems*, Information Display.
  DOI: 10.1002/j.2637-496X.1968.tb05066.x.
  CRT line-spread measurements approximated by Gaussian profiles.
- Pelli (1997), *Pixel independence: measuring spatial interactions on a CRT
  display*, Spatial Vision. DOI: 10.1163/156856897x00375.
  Image model uses a gamma/drive nonlinearity plus beam-spot PSF.
- Infante (1993), *The use of Lorentzian functions in the analysis of
  non-Gaussian CRT spots*, Journal of the SID.
  DOI: 10.1889/1.1984864. Higher-current spots can have wider tails.
- Compton (1989), *Selecting phosphors for displays*, Information Display.
  DOI: 10.1002/j.2637-496X.1989.tb05327.x.
  Persistence time describes decay after excitation.

### Mathematical structure

`Lout(x,y,t) = (1-a) L(x,y,t) + a [ G_sigma * L(.,.,t) ](x,y)`

where `G_sigma` is a normalized Gaussian (integral 1), `*` denotes
convolution, `a=0.16` is an explicitly artistic light-scatter fraction,
and `L` is the time-evolving emitted phosphor luminance from V100.

For `tau` from the decay slider, the first-order temporal model remains:

`Lnew = drive + (Lold-drive)*exp(-dt/tau)`

with the existing fixed fast excitation time for rising brightness.

For mobile performance the Gaussian is implemented with two separable
5-sample passes on a **quarter-resolution** buffer, while the temporal
history stays at half resolution and crisp source geometry remains at
native size. The kernel's sigma is 1.4 quarter-resolution pixels
(radius two). The 1D samples are normalized; their separable 2D product
is also normalized. This is a tractable approximation and is **not**
fitted to a real display's optical PSF.

Legacy artistic bloom remains a separate optional effect downstream.
Both the independent green / amber tint ratios from V096 and the
10–2000ms persistence slider remain unchanged. Pausing/menus do not
reset light history. No scanning or refresh-rate simulation returns.

The new postcomposition spread is disabled when phosphor simulation is
off, so the established older look remains a fallback.

---

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

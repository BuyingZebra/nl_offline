# NOMAD V098 — experimental scanned CRT light field

**Status: research-informed engineering prototype; not calibrated against a particular CRT.**

## Render sequence
1. Existing Canvas2D grayscale text, controls and game pieces represent the video drive signal.
2. A simulated electron beam traverses **left-to-right, top-to-bottom**, independently of the phone refresh, at selectable **50, 60 or 75 Hz**.
3. Each scanned location excites a neutral phosphor field. The vertical beam footprint itself generates the scanline gaps, so the previous static scanline mask is disabled in this mode.
4. Two sqrt-encoded GPU luminance histories represent rapid and faint/slow decay; a third channel records the downsampled current drive. The full-resolution grayscale signal is used to reconstruct sharp edges, while removed content can linger.
5. Existing optical bloom follows the monochrome simulation. **Colour is applied only afterward** using the existing user-selected green or amber tint, regardless of decay profile.

**CUSTOM / SHORT-MEDIUM** approximates a 5ms fast component and 190ms weak tail. P39, P31, P1 and P4 remain selectable decay comparisons. These weights, beam width, subframe exposure integration and colour mapping are modelling choices, not measurements.

## Evidence and limitations
- Hewlett-Packard, Application Note 115 (historical phosphor decay tables).
- Compton, *Selecting phosphors for displays*, Information Display (1989).
- Di Lollo et al., *Phosphor persistence of oscilloscopic displays*, Spatial Vision (1997).
- Historical CRT terminal readability measurements.

The model uses a beam trajectory and integrated illumination but does **not** yet simulate a measured electron-gun transfer function, individual spectral emission, calibrated point-spread function, beam retrace/blanking or full field-by-field raster physics. Very short excitation pulses are integrated over a smartphone frame to avoid aliasing. The current phosphor curves are illustrative, not validated instrument traces.

## Controls / compatibility
DISPLAY SYSTEM → CRT SIMULATION enables the new model. The two selectors cycle phosphor decay and raster refresh. The user's separate green/amber choice remains untouched. Turning simulation off restores the pre-V097 independent effects, including the legacy scanline texture. Existing game logic, save data and settings storage keys are preserved. Context loss, resizing and screen transitions clear phosphor history.

## Validation
Unit tests cover decay monotonicity, raster direction, scan wrapping, refresh settings and legacy fallback. Chromium/WebKit browser launch, button-response, viewport and offline smoke tests are run as technical gates. Real-device photometric calibration and GPU profiling remain next steps.

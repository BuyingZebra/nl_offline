# NOMAD V099 — continuously adjustable CRT simulator

**Status:** research-informed first-order raster/phosphor simulation. This is not calibrated against a physical tube.

## Independent controls

DISPLAY SYSTEM → CRT SIMULATION contains two touch sliders:
- **RATE: 30–120 Hz**, 1 Hz increments (default 60). This is the simulated electron-beam refresh rate, **not** the phone's display refresh.
- **PERSIST: 10–2,000 ms**, 10 ms increments (default 190). This is the phosphor's exponential decay time constant, `tau`, not a named phosphor material or measured P31/P39 curve.

Colour remains a separate artistic green/amber tint applied only after grayscale light has been calculated. There are **no phosphor presets** in the user interface. Historic P31, P39, P1, P4 names are no longer used as decay selection.

## First-order mathematical model

The grayscale video source drives a beam scanning **left to right, top to bottom**. Between visits a simulated phosphor pixel decays as `L(t)=L0*exp(-t/tau)`. The amount deposited by a visit is proportional to source drive and beam footprint.

To avoid V098's dark, alias-prone snapshots, the shader now accumulates all beam visits within the elapsed display interval. For scan period `T=1/refreshHz`, deposited amount `Q=videoDrive*spot*T/tau` normalizes *steady-state frame-averaged brightness* across refresh and persistence settings.

For `N` visits in the interval and `age` since the latest visit, with `R=(1-exp(-N*T/tau))/(1-exp(-T/tau))`, the state and time-integrated light are:

- `stateEnd=stateStart*exp(-dt/tau)+Q*exp(-age/tau)*R`
- `emissionMean=[stateStart*tau*(1-exp(-dt/tau))+Q*tau*(N-exp(-age/tau)*R)]/dt`

These exact integrations apply to the **idealized single-exponential model** with piecewise-constant video drive over a GPU frame, not to a calibrated multi-component physical phosphor. The GPU stores end-state, interval-average emission and sampled video drive in a half-resolution sqrt-encoded RGBA8 texture, and reconstructs sharp glyph edges using the full-resolution source.

The simulated beam's spatial footprint generates subtle line spacing. NOMAD's existing optical bloom/vignette run afterward, followed by the green/amber tint. The old CRT effect remains available when CRT SIMULATION is off.

## Important limitations

Real phosphors have multi-component intensity-dependent decay, non-instant excitation, measured spectra and optical scattering. This idealized single-parameter model does **not** claim those properties or realistic absolute nits. Tube retrace/blanking, detailed transfer response and calibrated optics are also not yet modeled.

References for future calibration: Hewlett-Packard *Application Note 115*, Compton (1989), and Di Lollo et al. (1997). To validate physical accuracy, compare against measured photodiode curves and a real device. Automated Chromium/WebKit tests verify software behaviour, not absolute physical fidelity.

## Release validation

Unit tests cover refresh/decay ranges, slider hit geometry, raster order and wrap, steady-state brightness across 30–120Hz and 10–2000ms, decay after signal removal, settings migration and legacy fallback. Browser smoke tests cover startup, WebGL output, controls, viewport changes and offline launch.

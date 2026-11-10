# NOMAD — PWA performance study, v187

## Objective

Understand why the game is fast or slow, **before** changing its rendering.
Keep the established Three.js compositor, phosphor response, SVG artwork,
controls, game rules and storage format unchanged.

We are investigating three different costs:

1. **Game simulation / JavaScript:** movement, timers, menu state and input.
2. **Canvas source production:** drawing pixels, marking textures dirty, and
   submitting changed sources to Three.js.
3. **WebGL presentation:** compositing, shaders, phosphor history and GPU work.

These are not interchangeable. A fast JavaScript frame can still be GPU-bound;
a slow compositor submission may also reflect waiting on the graphics driver.

## How to collect a real measurement

NOMAD's existing **Copy Debug** command includes in-memory performance samples,
plus viewport, settings, resource counts and context lifecycle events. No
network telemetry, advertising library or persistent profiler was added.

1. Open the **same build** on the device and let the initial terminal animation
   finish. Record whether it is Safari/Chrome in a tab or an installed PWA.
2. Capture a **ready/idle** report with Copy Debug.
3. Play for at least 10 seconds and capture a **gameplay** report while moving
   pieces, rotating, and using soft drop.
4. Pause, open the settings screen, and capture a **menus/idle** report.
5. Switch away and return, then capture a **resume** report. Check that inputs,
   compositor, personal best and settings remain intact.
6. Repeat the same sequence three times per environment at matching settings
   and power mode. Compare distributions and resource trends, not one number.

First comparison: **physical iPhone Safari, physical iPhone Home Screen PWA,
and physical Android Chrome PWA**. Headless CI runs exercise correctness but
are not substitutes for native hardware-performance measurements.

## New v187 metrics

| Metric | Definition | What it does NOT measure |
| --- | --- | --- |
| CPU p50 | Median measured callback JavaScript CPU duration | GPU duration |
| CPU p95 | 95th percentile measured frame CPU duration | Battery drain |
| CPU p99 | 99th percentile measured frame CPU duration | Visible jank by itself |
| Frame CPU average/max | Average and worst CPU duration in window | Physical display FPS |
| RAF interval | Arrival pacing of requested animation frames | Panel refresh speed |
| Canvas source MiB | Sum of unique canvas `width × height × 4`, in MiB | Actual allocated RAM or GPU VRAM |
| Texture upload timing | CPU time submitting changed source textures | GPU transfer bandwidth |
| Three.js counters | Engine-visible textures, geometries, shader programs | Bytes or proof of a leak |

The CPU percentile sample buffer has **512 fixed entries** (2 KiB of float32
data). It stores only durations, overwriting the oldest entries. Calculating
percentiles sorts a temporary copy **at report/sample time**, never per-frame.
The normal reporting interval is approximately two seconds during activity.
Null percentiles mean no eligible frame has yet been recorded.

The source canvas census is performed **only on explicit Copy Debug** and uses
the seven canvases in the renderer-owned resource registry. It deduplicates
canvas identities and uses their **actual backing pixel dimensions**, not CSS
dimensions. The RGBA8 size is a mathematical estimate: browsers may allocate
differently. It excludes WebGL render targets, persistence history,
compositing buffers, mipmaps, driver allocations and other memory.

## Interpreting the results

- **Low average, high p95:** investigate occasional large repaints, uploads,
  layout calculations and device lifecycle callbacks.
- **Consistently high CPU p50:** identify repeated expensive stage work.
- **Slow RAF intervals, low CPU time:** possible GPU, browser scheduling,
  power-saving or device contention; do not assume a shader problem.
- **More estimated Canvas MiB at higher DPR:** expected because backing pixel
  counts increase approximately with DPR squared; not evidence of leakage.
- **Increasing WebGL resource counts after repeated identical resumes:**
  investigate ownership and disposal. Counts alone are not leak proof.
- **High compositor pass CPU:** may include graphics-driver stalls, but is
  not a direct GPU timer query.

We should not remove phosphor persistence, reduce visual fidelity or replace
Three.js to chase an unverified performance number. First obtain comparable
real-device captures, identify the dominant cost, and optimize only that cost.

## Code changes and regression protection

v187 adds performance observability in the existing renderer diagnostics,
a read-only resource inventory used by Copy Debug, and deterministic tests for
CPU percentiles, bounded sample storage and Canvas pixel estimates.

It does **not** change game mechanics, compositor shaders, texture geometry,
PWA update lifecycle, or display rendering. The build remains an offline PWA.
The automated browser smoke tests remain vital for functional regressions;
these are correctness checks, not hardware performance claims.

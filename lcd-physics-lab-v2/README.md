# NOMAD LCD Verification Lab v2 (independent)
This lab is **not** a NOMAD production-game modification. It lives at `/lcd-physics-lab-v2/` and does not touch the v262 app or the existing `lcd-physics-lab`.

## Engineering changes
- **One geometry pipeline:** `nomad-stimulus.js` paints visible artwork and optical-coverage geometry through exactly the same `paint()` call sequence. Reverse START GAME lettering punches actual holes in the coverage. Original NOMAD SVGs are reused by relative path from v1 rather than redrawn.
- **One electrical source of truth:** the existing five DMG upstream passes are preserved. The fine 320x288 STN history shader retains upstream target/drift/ionic/Simpson integration and receives the already established matrix correction.
- **Independent target pass:** `makeEquilibriumDiagnostic()` reads the effective drive packed by the actual main response pass, then runs the original physical-target and optical equilibrium tables without temporal feedback. It does not compile or rerun the enormous STN integrator a second time. This yields an independent, physically defined comparison rather than arbitrary fade factors.
- **Physical optics:** the continuous-substrate fill correction and original palette/reflector coefficients are retained. New optical debug views show normalized drive, observed state, signed residual, ionic state, coverage contour, reflector overlap, and isolated darkening.
- **Explicitly uncalibrated warm-line experiment:** the original source contains **no** separate red-fringe mechanism. Warm-rim modes are isolated hypotheses and remain outside the normal 1x physical composite. Seeing them does not establish hardware authenticity.
- **Measured probe:** the actual GPU buffer is sampled inside START GAME each frame. The readback graph uses unmodified observed response, equilibrium optical response, normalized drive, and ionic state.
- **On-device audit:** press RUN GPU VALIDATION AUDIT. It tests that the raster coverage is nonempty/nonfull, runs the shadow, shadow-darkening, and contour diagnostics into a float GPU framebuffer, and checks whether each has nonzero numeric output. It also reports whether any drive transition was accompanied by temporal residual. Failed/unsupported readback is **NOT VERIFIED**, never reported as passing.

## Testing
1. Open `https://buyingzebra.github.io/nl_offline/lcd-physics-lab-v2/`, leave 2x material at first, press LOAD PHYSICAL MODEL.
2. Choose `Blinking START GAME` and 18 frames, press RUN, and confirm the numerical drive/target/observed graphs respond over several ON/OFF cycles. The START GAME mask includes knockouts for the text and symbol.
3. Choose `Reflector overlap`, `Reflector shadow visibility 24x` to inspect the geometry without conflating it with the final rendering, then `Isolated reflector darkening`.
4. Select `History residual` and inspect positive/negative differences around transitions, not in a static first frame.
5. Press RUN GPU VALIDATION AUDIT. Read every PASS, FAIL, or PENDING separately; neither presence nor intensity proves calibrated hardware.
6. Return to `Corrected shape-driven LCD` and `1x` to view the unexaggerated composite; compare to the previous lab.

## Validation status
- JavaScript source parses in a V8 syntax check.
- Source routing, JavaScript syntax and independent shader assembly passed static verification; the compact equilibrium shader assembles to one balanced GLSL entry point using upstream lookup data.
- **A successful on-device iPhone WebGL2 compile and GPU output has not been independently observed.** Until the target phone shows results and the audit passes, the correct status is `unverified`.
- A verified model output is **not** a photometric match to a real screen. Spectral/angle-dependent optics, actual nonrectangular electrodes, display-reflector thickness and empirically measured transients are out of scope unless new measurements are available.
- This lab is a re-composed 160×144 fixture using original app assets and typography, **not** a byte-exact picture of the full portrait NOMAD app.

## Original model / licensing
- Original STN and optics reference: JohnnySun/retro-display-lab, Apache-2.0 (see `lcd-response-study/upstream/LICENSE`).
- NOMAD assets are copied from v262 in the existing `lcd-physics-lab/assets/` directory.

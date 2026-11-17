# NOMAD Tetris System v271 — reflective LCD visibility (CURRENT)

**Goal:** make the replica more readable without modifying any source artwork, tile designs, stroke widths, coordinates, board geometry, Tetris gameplay or the original STN dynamic model. The v270 Lab-derived physics stays untouched.

## LCD VISIBILITY — optical viewing conditions only

Two new sliders live on their own **LCD VISIBILITY** Properties page, visible only when the physical LCD material is selected:

- **VIEW CONTRAST:** 100–250%, **default 190%**. A reversible optical-density adjustment in the *final optical-colour shader*: after the original full-resolution grayscale image and Lab response determine the optical darkness, each reflected linear RGB colour is multiplied by `exp(-(contrast/100 - 1)*darkness)`. This preferentially absorbs more light in dark LCD areas while preserving the optical pixel locations, original hues, glass, grid aperture and 5-reference-palette ordering. No altered source image, stroke size, bitmap conversion, cell count or STN dynamics. At **100%**, the original v270 measured/palette response is passed through unmodified.
- **REFLECTED LIGHT:** 75–160%, **default 120%**. Multiplies the resulting **linear-light** panel image *after* aperture coverage/reflector shadows and before the separate front-glass highlight. This simulates the apparent illumination of a reflective panel; it is not a backlight and does not feed the electrical state.

**To reproduce the original v270 colour and brightness exactly, set VIEW CONTRAST = 100%, REFLECTED LIGHT = 100%, and leave INK CONTRAST = 100%.** These viewing controls are intentionally *art-direction adjustments*, not a claim that the revised palette represents a newly measured historical LCD. The original palette samples, drift lookup, director, ionic memory, temperature behaviour, electrical states, physical cell aperture and reflector overlap all remain unchanged.

The base wallpaper/lettering/playfield, original 0.6px LCD board grid, alpha, geometry, original vector tile artwork and game controls are **not changed**. This is an optical-side visibility experiment, not a new image interpreter or a board drawing redesign.

The surrounding region of the virtual LCD contains dark source pixels and therefore receives greater optical absorption, which should make the bright Tetris board distinguish itself more clearly against the field. Actual brightness/contrast and mobile GPU operation need user visual confirmation.

## Previous work — v270 electrical response and full-detail raw presentation

# NOMAD Tetris System v270 — original Lab physics, full-detail artwork (CURRENT)

The Tetris System once again uses the source-derived STN response model from **/lcd-lab/** / v268, but no longer treats its coarse four-electrical-state image as the finished visible artwork. The raw grayscale artwork remains full resolution through the reflective display, its original details are naturally clipped by the optical cell apertures, and the original per-cell STN dynamics are applied as a **temporal optical correction**.

## Architecture

```
Original Canvas2D/Three.js artwork (unchanged native raster resolution)
     ├── DIRECT VISUAL PATH ──> continuous grayscale image
     │                         → natural square-cell aperture / reflector / glass
     │
     └── ELECTRICAL RESPONSE ─> one measured-drive sample per simulated cell
                               → four Lab electrical drive states
                               → original STN director-drift LUT
                               → original ionic-retention and nonlinear optical LUT
                               → observed optical state minus static reference state
                                                        |
                                                        v
                        transient correction added to the DIRECT VISUAL PATH
                                                        |
                                                        v
                                  unchanged physical cell material / OutputPass
```

**What is preserved EXACTLY from the earlier local Lab-style engine (v268):**
- The four reference voltages' director targets `TARGET_Q`, 65-sample/drive `DRIFT_Q`, calibrated `OPTICAL_LUT` and anchor/correction data from Retro Display Lab.
- The same per-logical-cell 16-bit packed director history, slow ionic retention state, measured drift integration, temperature scaling and derived optical state/ionic bias.
- The same square-cell aperture coverage, shifted shadow overlap, five-state reflective colour interpolation, and independent front-glass controls.
- The same density-to-cell-grid rule and existing game artwork.

**What changed to preserve image fidelity:** the final optical shader now reads the **unquantized original image at output-pixel resolution**, not the four-level electrical drive texture as the displayed picture. The per-cell electrical state and its measured optical response still evolve exactly as in v268; however, only their difference from the calibrated settled state influences the full-resolution image. At rest, the transient difference approaches zero, preserving v269's detail. A small ionic residual or RGBA8 precision difference can remain.

The screen is therefore a **hybrid physical simulation**, not an exact historical per-electrode reconstruction: thin details within one simulated cell can be optically visible even if they don't independently change its electrical drive. The Lab itself is a reduced-order adaptation and does not claim all original Retro Display Lab's row/column RC/loading passes.

## Controls and comparison

- **PHYSICAL LCD MATERIAL** — original material optics and optional STN response.
- **LCD RESPONSE** — controls the original per-cell STN history when physical material is enabled; OFF or 0% strength bypasses the electrical state passes and leaves the v269 direct raw-image optics.
- **DECAY / STRENGTH** — 210ms/60% defaults. At 210ms the integration uses the source's original ~59.7275 Hz reference steps; other decay values adjust the integration speed and strength blends the transient difference.
- **TEMPERATURE** — original 5–40°C viscous response model, default 20°C.
- **INK CONTRAST** — optional 75–150% continuous tonal adjustment, default 100%. It affects both the electrical input interpretation and the full-detail optical image. **It is not a four-level image quantizer** and does not add a second grayscale pass.
- **CELL DENSITY / FILL / REFLECTOR SHADOW / DMG REFERENCE COLOUR / FRONT GLASS** — existing presentation controls kept.

The simplest test is to pause on a detailed piece, use **INK CONTRAST 100%**, then compare LCD RESPONSE OFF and ON while moving an active piece. If OFF is clear but ON introduces distorted outlines at rest, check per-cell target/reference interpolation and STN history. In both modes the source image should retain its geometric detail. Compare against the independent /lcd-lab/ STN motion fixture for response direction and timing.

**Performance:** the restored electrical model uses three small-to-medium per-cell RGBA8 render targets (electrical drive plus two director-history buffers) only when LCD RESPONSE is active, and the final optical presentation runs at output framebuffer resolution. It is not the large full-output-pixel history proposed by the discarded early v270 continuous-voltage experiment. Real-device shader compilation and mobile frame pacing still require user verification.

## Historical experiments (v264–v269)

The material history below documents earlier builds; any statement claiming the physical response has been removed applies only to v269.

---


The material history below documents earlier versions; any statement claiming that electrical response is disabled applies **only to v269**, not to the new v270 hybrid.

---

# NOMAD v269 — raw-image optical LCD experiment (CURRENT)

The LCD Properties switch now reads **RAW LCD MATERIAL**. This is a deliberately stripped-back optical test: the existing, full-resolution grayscale Tetris scene is sampled **directly at the final output pixel**, converted continuously through the existing reflective olive/green palette, then shown beneath the same **square-cell aperture lattice, analytic reflector shadows and optional front-glass reflection**. The physical cell count is still controllable with **CELL DENSITY**, but it no longer reduces the artwork to one electrical drive per logical cell.

**Current path:**

```
Original grayscale Canvas2D/Three.js scene (full source resolution)
  → direct continuous grayscale-to-reflectance mapping (NO palette quantization)
  → analytical repeating square aperture / reflector shadow (geometric material)
  → optional virtual glass optics
  → existing OutputPass and game screen
```

**What has intentionally been bypassed:** the four-state per-cell electrical quantization, STN drift/ionic response, director history textures, per-cell source resampling, temporal-response temperature setting and all experimental signal/sampling diagnostic menus. This is **not** a validated historical STN response model; it is an optical material experiment to test the visual preservation of the original Tetris artwork. The original full STN model remains in Git history, notably **v268**.

**What remains:** Tetris and its original art/layout/controls unchanged, LCD/CRT selection, legacy LCD mode when RAW LCD MATERIAL is off, the cell-density slider/presets, CELL FILL, REFLECTOR SHADOW, the DMG REFERENCE COLOUR toggle, and FRONT GLASS with reflection and viewing controls. The general Properties debug-report menu is hidden in this experiment; low-level performance/crash instrumentation can remain available to developers.

**Important caveat:** the source reaching this GPU pass is an already-rasterized Canvas2D/Three.js scene, not SVG paths or editable vector primitives. It retains the original rendered scene's native detail rather than forcing it through a reduced-size electrical-cell texture. A monitor cannot display detail beyond its own output pixel grid; and when the simulated cell lattice is very dense, grid gaps can still visually average away. The output palette converts colour/contrast, so it is not a pixel-exact copy of the source image.

## Historical STN experiments (v264–v268)

The sections below describe the earlier physical STN model and diagnostic experiments for reference. Their previous input sampling, temporal response and signal debug settings are **not active in v269**.

---

# Physical LCD material — Tetris System v264 experiment

The **PHYSICAL LCD MATERIAL** switch in the LCD Properties view routes the entire live Tetris System scene through a separate reflective LCD simulation. The existing v263 LCD colour, screen cells, response, optical bleed, vignette, perimeter tint and blur passes are bypassed while this mode is active. Switching the physical model off restores those original passes. CRT is unchanged.

## Rendering architecture

```
Unmodified game/UI art → grayscale compositor source
                        → physical-cell drive quantization
                        → nominal STN director/optical state feedback (cell-sized RGBA8 textures)
                        → continuous optical states sampled on a physical cell lattice
                        → five-state, linear-light colour interpolation
                        → area-integrated apertures and physical reflector shadows
                        → OutputPass to the phone screen
```

The live board, score, hold/next panels, menus, properties and controls use their **existing** Canvas2D/Three.js layers. No captured screenshot, redraw of the game interface, external iframe or additional input handling is needed. Physical response is rendered on the GPU; there is no CPU framebuffer readback. The renderer allocates state history textures only if this mode is enabled.

### What CELL DENSITY actually changes

This control changes the **number of independent simulated cells per unit of screen area**, NOT the modern display's output resolution or the UI size.

- Nominal 1× uses one logical cell per 2.5 CSS pixels, matching roughly 160 cells across a 400px-wide UI. The aspect ratio is derived from the current device viewport, rather than forcing the portrait UI into a 160×144 landscape panel.
- 1.5× (default when the experimental mode is selected) produces 1.5 times as many cells along each axis; a 400×800 CSS-pixel view becomes roughly 240×480 logical cells.
- 2.5× produces more individual cells, allowing small text and UI details to survive better, but cell gaps necessarily occupy less area on the modern display and can become harder to see.

The aperture fraction, reflector displacement (measured in **cell units**), nominal physical director response and five-state optical treatment retain their meaning as density changes. Grid dimensions and the two small temporal history textures are rebuilt safely when the viewport/density changes.

### Controls

- **PHYSICAL LCD MATERIAL**: turn the physical renderer on/off (opt-in, default off to preserve v263).
- **CELL DENSITY**: 1×–2.5×. The display remains at native GPU output size.
- **CELL FILL**: active transmission area within each logical cell (default 0.875).
- **REFLECTOR SHADOW**: strength of shadow visible in the inactive gap (default 0.18).
- **TEMPERATURE**: nominal thermal scaling of STN director response (default 20°C).
- **DMG REFERENCE COLOUR**: toggle sourced Game Boy reference colours against a separate, experimentally authored NOMAD palette.

## Source attribution and limitations

Based on the independent LCD Material Lab in `/lcd-lab/`, which cites **JohnnySun's Retro Display Lab**, https://github.com/JohnnySun/retro-display-lab (Apache License 2.0). The licence text and provenance are in `/lcd-lab/LICENSE-APACHE-2.0.txt` and `/lcd-lab/CREDITS.md`.

The game uses the **nominal 20°C STN director-drift and optical-state lookup tables**, five reference colours, analytical periodic cell apertures and reflector-shadow overlap. This is a **partially adapted physical model**. It does not contain the complete RetroArch/Vulkan five-pass electrical row-load, common-electrode crosstalk, phase-local drive and calibrated hardware target model. The simulated ionic state currently uses a compact RGBA8 feedback representation and should not be treated as measured long-term image sticking. The temperature slider changes nominal response kinetics only; it is not a full recalibrated temperature/material envelope.

The first integrated version uses exactly **four drive levels**, so small and antialiased content necessarily loses some fine gradients even at high density. Device output is emissive, so the optics remain an approximation of a reflective surface.

## Comparison method

1. Use the existing LCD display mode, leave **PHYSICAL LCD MATERIAL** off, and note the text and controls.
2. Enable physical LCD at **1.5×** and inspect the same live game view.
3. Vary density through **1× / 1.5× / 2× / 2.5×** without changing fonts or game art, noting cell gap visibility and readability.
4. Play a few falling pieces and examine their transitions and response at 5°C, 20°C and 40°C.
5. Switch physical mode off and verify the previous look returns unchanged.

This release has source/static validation. WebGL compilation, actual phone performance and optical aesthetics still require a hands-on device comparison.


## v266: density comparison controls and independent glass optics

In LCD mode, enable **PHYSICAL LCD MATERIAL**, then open the dedicated **CELL DENSITY** Properties entry. Its editor contains:

- A fine **CELL DENSITY** slider remains available from 1× to 2.5×.
- Four quick preset buttons (**1×, 1.5×, 2×, 2.5×**) are interactive and preserve the game's existing settings Confirm/Cancel behaviour.
- A live **PHYSICAL CELLS** readout shows the exact `columns × rows` simulation dimensions for the current CSS viewport and selected density. It uses the exact `physicalLCDGrid()` function that allocates the GPU simulation history, so no duplicated estimation formula can drift.
- **CELL FILL**, **REFLECTOR SHADOW** and **TEMPERATURE** remain independently adjustable in the **PHYSICAL LCD MATERIAL** panel.

With the physical material enabled, the new **FRONT GLASS** Properties entry exposes **REFLECTION** (0–2×), **LIGHT ANGLE** (0–360°) and **VIEW ANGLE** (−45° to +45°). It is separately toggleable, so we can first judge the simulated LCD itself and only then add a virtual surface reflection.

The front-glass contribution is a subtle art-directed highlight/grazing-angle presentation model adapted from our `/lcd-lab/` experiment. It is **not** a validated polarizer/Fresnel glass model and does not alter the physical STN response, optical palette, individually calculated LCD cell apertures, or reflector-shadow geometry.

Recommended controlled comparison: hold glass off and compare 1× → 1.5× → 2× → 2.5× on the same Tetris screen, then hold density fixed and vary glass strength/direction. At high density, inactive pixel gaps may become smaller than host pixels and naturally lose visible definition.


## v267: signal encoder diagnosis — preserve the known-good physical look

**LCD SIGNAL STUDY** is a separate Properties editor visible when PHYSICAL LCD MATERIAL is enabled. It switches what the physical-pass presents, without modifying the Tetris gameplay/asset art. The five modes are:

1. **SOURCE:** exact linear-light source of the existing compositor immediately before the LCD pass, rendered without cell materials.
2. **SAMPLED:** the pre-quantization grayscale input measured once per physical cell; each cell shown as flat brightness, without the aperture/shadow.
3. **4-SHADE:** the *same sampled input* converted to the four real drive codes used by the nominal DMG model. This shows whether tonal differences were destroyed by the four-level quantizer.
4. **SETTLED:** immediate drive equilibrium through the STN optical mapping and physical aperture/reflector shader, **without director lag/ionic memory or glass**.
5. **PHYSICAL:** the full previous reflective STN with response history, cells, reflector and optional glass, as in v266.

**4-TAP AREA SAMPLING** is a separately toggleable comparison (off by default): instead of the previous single sample at each physical cell centre, sample four points at quarter-cell offsets and average incoming **linear RGB before converting to encoded grayscale**. The drive quantizer is deliberately unchanged. Both the diagnostic stages and the physical state pass use the same shared GLSL input encoder. This is a modest spatial sampling experiment, *not* a correct reconstruction of arbitrary thin geometry or a validated anti-aliasing method for every art source; four-point area sampling can still miss very narrow features.

Switching sampling mode or diagnostic stage resets the STN history, ensuring temporal memory does not contaminate the next comparison. Choosing SETTLED suppresses director and ionic memory, and the FRONT GLASS pass is disabled in SETTLED (but retained in PHYSICAL). Switching back to PHYSICAL restarts response history.

### Suggested analysis

Pause the board or choose a stationary menu layout. First compare SOURCE → SAMPLED → 4-SHADE → SETTLED → PHYSICAL at 1.5× cell density. If a detail disappears in SAMPLED, inspect sampling. If present in SAMPLED but absent in 4-SHADE, investigate quantization. If present in 4-SHADE but not SETTLED, inspect optical palette/reflector/aperture. If SETTLED looks clear but PHYSICAL does not, inspect STN history/response or FRONT GLASS. Repeat with 4-TAP AREA SAMPLING on, changing no other parameters.

This does not add more than four electrical levels, and does not change pixel density or the physical model's reference lookup tables. GPU cost of four samples per cell may be significant on high-density phone/desktop settings. Four-tap integration is strictly opt-in.


## v268: prove whether area sampling actually changes the signal

**CELL INPUT SAMPLING** replaces the former 4-TAP AREA SAMPLING toggle, preserving existing four-tap preferences by migrating the saved setting to numeric sampling mode 1. Three mutually exclusive input methods are available:

- **CENTRE** (0; baseline/default): one bilinearly filtered sample at the physical cell's centre.
- **4 TAPS** (1; v267): four symmetric quarter-cell-offset samples, averaged in linear RGB before grayscale encoding. On a bilinearly filtered input these frequently equal the centre sample, so little change may be visible.
- **16 TAPS** (2; new): an experimental stratified 4×4 grid across the full physical cell, averaged in linear RGB before grayscale encoding. This can retain information from lines that the central sample misses, but is not an exact analytical vector coverage rasterizer.

The separate **LCD SIGNAL STUDY** now has six views; **DELTA** (5) shows amplified absolute prequantization grey difference between the selected method and CENTRE. Black = no detected difference; orange indicates measurable change. This exists precisely because **4-SHADE** can remain unchanged even if the sampled grey has changed slightly.

Controlled experiment at 1× cell density: select CELL INPUT SAMPLING → CENTRE and LCD SIGNAL STUDY → DELTA (should be black). Switch to 4 TAPS; see if DELTA reveals any difference. Then switch to 16 TAPS and inspect DELTA, SAMPLED, 4-SHADE and SETTLED. Keep glass and other material settings unchanged. A bright DELTA does **not** itself prove improved fidelity; evaluate whether thin lines and lettering actually become more consistent.

### Performance and limitations

The sampled electrical input is now calculated once per simulated cell in a dedicated GPU `SIGNAL` pass (1, 4, or 16 source taps per cell). That pass writes a compact RGBA8 signal texture: red=prequantization grayscale, green=normalized four-level drive, blue=absolute difference versus centre sampling. The STN state pass and all diagnostic output modes read **the same** signal texture. This prevents redundant 16-tap sampling at monitor output resolution and keeps the diagnostic coherent with the physical response. The signal pass still scales with simulated cell count: begin at 1× for 16 TAPS on phones, and compare higher densities only after checking performance. The encoded input has 8-bit storage precision, so minute changes below roughly 1/255 may vanish from DELTA; this is a diagnostic limitation, not evidence of an unchanged source.

The original STN response tables, physical aperture/shadow geometry, and prior single-sample rendering remain available unchanged. The experiment does not assume four shades are sufficient for all authored grayscale content.

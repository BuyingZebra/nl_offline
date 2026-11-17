# NOMAD v270 — continuous electrical response with raw-image fidelity (CURRENT)

v270 restores time-dependent liquid-crystal dynamics to the full-detail v269 optical material. Crucially, it **does not** restore the damaging four-drive-state image quantizer or cell-centre source resampling. The raw Canvas2D/Three.js grayscale image still drives the reflective panel at its original raster output resolution, while the physical square-cell aperture geometry clips the image and the original reflector and front-glass optics remain intact.

## Exact rendering sequence

```
Original full-resolution artwork (already rasterized Canvas2D/Three.js)
       ↓
Direct continuous grayscale signal (no four-state colour reduction)
       ↓
Optional: per-output-pixel STN-inspired director history, interpolating
the four sourced STN drift curves for continuous drive voltages
       ↓
Difference from calibrated static optical response applied as a
temporary correction to the ORIGINAL grayscale image
       ↓
Full-resolution optical colour pass with physical square-cell aperture,
reflector-gap shadows, independently adjustable glass, ink contrast
       ↓
OutputPass / display
```

**Preservation rule:** when temporal response reaches equilibrium, the transient difference cancels and the original v269 grayscale appearance is retained. Turning **LCD RESPONSE** off (or setting strength to 0%) bypasses the temporal state update entirely and exactly restores v269's one-pass optical path at **INK CONTRAST 100%**.

**Controls:** RAW LCD MATERIAL, CELL DENSITY, CELL FILL, REFLECTOR SHADOW, **TEMPERATURE** (5–40°C), **INK CONTRAST** (75–150%, default 100%), DMG REFERENCE COLOUR and FRONT GLASS remain in Properties. **LCD RESPONSE** (Decay 30–600ms, Strength 0–100%) is visible in the physical view; enabled by default at 210ms/60%. The legacy LCD mode still uses its separate existing grayscale response pass.

**Source data:** the temporal history is based on the same Apache-licensed STN drift tables and nonlinear optical lookup/corrections as the original v264–v268 experiment. A new 256-level 16-bit equilibrium LUT is derived from the four source drift curves by interpolating drive voltage and solving each corresponding equilibrium. Director/optical state history is stored in two full-output-resolution RGBA8 render targets, not downscaled to the simulated cell lattice. Response dynamics follow the reference curves, but are **interpolated between the four originally measured drive settings** and adjusted by the temperature/decay controls.

**Physical-accuracy caveat:** a historical STN LCD's electrodes are discretely addressed. Here, a single *visible* aperture can contain more than one independently simulated full-resolution electrical sample, and continuous-voltage interpolation isn't directly measured historical data. It is a physically informed **hybrid**, not an exact hardware reconstruction. This deliberate compromise preserves detailed artwork while retaining material geometry and STN-based response. The previous discrete-drive hardware-oriented model remains in v268 Git history; the pure static optical baseline is v269.

**Readability:** the source was already converted continuously to luminance before optical colouring. A second grayscale pass would be redundant. INK CONTRAST operates on continuous encoded-grey brightness immediately before mapping to the original five-colour reflective material palette; it introduces **no new bit depth or grid quantization**. The default 100% preserves the existing v269 look.

**Performance:** when response is active, the renderer runs one full-output-resolution STN update pass plus the original optical pass and holds two full-resolution RGBA8 history textures (4 bytes/pixel each). With response OFF it uses the same single optical pass as v269. Mobile performance and WebGL shader compilation still require actual testing.

## Historical experiments (v264–v269)

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

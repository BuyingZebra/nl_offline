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

# Vector LCD

Physically computed LCD screens for digital content. The content is free: any art, anywhere. The way the image forms follows the physics of a real screen type, with every number taken from a datasheet, a measurement or a physical law.

Open it at **https://buyingzebra.github.io/nl_offline/vector-lcd/** and use **Add to Home Screen** to install it. After the first visit it works offline.

The screen types are a **reflective twisted-nematic (TN) LCD**, the calculator and watch kind, the **Nintendo DMG-01's reflective STN** with its four shades, built from Retro Display Lab's measurements on a panel finer than the DMG's own dot grid, and an **IBM 5151 green phosphor CRT** (P39) with a real raster. The test content is the real NOMAD Tetris game (`tetris/game.js`) with its actual tile SVGs (`tetris/assets/tiles/vector/`, and I-piece fragments from the game's own `smooth-geometry.mjs`).

## How an image forms

```
content gray -> drive voltage -> liquid-crystal director (relaxing over time)
            -> light: front polarizer -> crystal (entry point) -> rear polarizer
               -> reflector -> rear polarizer -> crystal (exit point) -> front polarizer -> eye
```

Under angled light, the entry and exit points differ, so the light passes the crystal at two different places. That offset, from refraction through the rear glass, is the reflector shadow. It is not an effect added on top.

A real light has size, so light reaches each exit point through many entry points. The renderer adds those up by blurring the light *entering* the glass, not the crystal state: intensities add, states do not. The blur is a separable Gaussian stretched along the light's direction, with widths set by refraction through the glass (`shadowKernel`). The profile stores the double-pass optics in a separable form (rank 4, within 0.27% of the full table) so that this blur stays exact and cheap.

## Reflective TN: sources

| Quantity | Value | Source |
| --- | --- | --- |
| Panel type, drive | Positive gray TN, reflective, static, 6 o'clock | Varitronix VI-402-DP datasheet |
| Operating voltage | 3.0 V (2.8–3.2) | VI-402 datasheet |
| Response, 10–90% | 30 ms on, 60 ms off, at 25 °C | VI-402 datasheet |
| Contrast | 15:1 | VI-402 datasheet |
| Liquid crystal | E7: K11 11.7, K22 6.8, K33 17.8 pN; ε∥ 19.5, ε⊥ 5.2 | As quoted in arXiv:2003.09706 (Merck; Raynes et al.) |
| Refractive-index dispersion | Cauchy coefficients, 25 °C | Li, Wu et al., J. Appl. Phys. 97, 073501 (2005) |
| Polarizer | Orient Display TP018 reflective: single 44.3%, parallel 38.1%, crossed 1.409%, CIELAB hues, reflectance 36.3% | Orient Display polarizer table |
| Cell design | 90° twist, first transmission maximum | Gooch & Tarry, J. Phys. D 8, 1575 (1975); chosen over the second maximum by the datasheet viewing cone (below) |
| Viewing cone | Contrast ≥ 2 to 70° below, 35° above, 70° to the sides | VI-402 datasheet |
| Oblique optics | Extended Jones matrices | Lien, Appl. Phys. Lett. 57, 2767 (1990) |
| Front surface | Fresnel reflection at n = 1.5 (about 4%; an untreated polarizer reflects "about 5%") | displaymodule.com polarizer surface treatments |
| Viscosity vs temperature | E7 γ1: 422, 224, 126, 74 mPa·s at 10, 20, 30, 40 °C | Merck data, tabulated in koreascience.kr JAKO201136151481811 |
| Refractive index vs temperature | Cauchy coefficients, 15–50 °C | Li, Wu et al. (2005), Table I |
| Rear glass | 1.1 mm | Standard option (0.4/0.55/0.7/1.1 mm); 1.1 mm inferred from the VI-402's 2.80 mm depth |
| Colour | CIE 1931 2° observer, CIE D65 | colour-science datasets |

**Derived by computation, not chosen:**
- **Cell gap:** 2.14 µm.
- **Threshold:** 0.997 V, which matches the Fréedericksz formula.
- **Reflectance:** 28.7% unlit and 1.9% driven.
- **Unlit color:** #8b957e, a gray-green. It comes from the polarizer's measured hue and the crystal's dispersion.
- **Reflector reflectance:** 95.5%, inferred from the polarizer's reflectance.

**Calibrated to the datasheet, and nothing else:**
- **Front-surface reflection:** 1.9%. An ideal panel computes to 1119:1 contrast; real panels reach 15:1 because the front surface reflects some light, and 1.9% is the reflection that reproduces it.
- **Response:** the two time constants are solved so the simulated optical 10–90% times equal 30 ms and 60 ms. Switching on speeds up with voltage by the standard nematic law, `τ_on ∝ 1/((V/V_th)² − 1)`.

**Assumed, and labelled in the app:**
- **Pretilt:** 2°, a typical rubbed-polyimide value.
- **Refractive indices:** glass 1.52, polarizer film 1.50.
- **Liquid crystal:** E7 stands in for the panel's proprietary mixture.

**Viewing angle.** Each pass through the crystal is computed for its own direction with extended Jones matrices: the light's pass for the light direction, the eye's pass for the eye direction. Off-axis the panel loses contrast, and partly switched areas shift toward yellow or blue, as on real TN panels. Tilting the phone moves both directions relative to the glass, because the eye and the room light stay fixed in the room. The rear polarizer sits between the two passes, so the double pass is computed as a product per wavelength, within 1.9% of the exact double pass at normal incidence.

Light measured from the viewing direction, as for a reflective panel, gives contrast ≥ 2 to 75° below, 50° above and 65° to the sides. The datasheet gives 70°, 35° and 70°. The second-maximum design gave 70°, 30° and 45°, a worse total fit, so the first maximum is kept. The remaining difference on the weak side (50° vs 35°) is a known gap. E7 stands in for the panel's own liquid crystal, and the pretilt is assumed.

**Glare.** The front surface is treated as a glossy, untreated polarizer: the room light's mirror image at Fresnel reflectance, from an eye 300 mm away by default. With a large light in the mirror direction the panel washes out, because a 4% reflection of a lamp is brighter than white paper under the same lamp. The liquid-crystal pass uses the eye direction at the panel's centre; only the glare varies across the panel.

**Temperature, 15–40 °C** (where the viscosity and refractive-index data overlap). Response times scale with γ1/K. Elastic constants scale as S² and the threshold as √S, with the order parameter S following the measured birefringence. The optics use the refractive indices measured at each temperature, so the unlit colour shifts too (ΔE ≈ 8 between 15 and 40 °C). From 15 °C to 40 °C the crystal goes from 1.6× slower to 0.58× faster than at 25 °C.

**Bezel shadow.** The frame around the screen sits above the glass, assumed 1 mm above the front polarizer, since the VI-402 itself is bare glass. Light reaching the crystal near an edge must pass that frame first, so the edges facing the light get a soft shadow band. Its width follows from refraction through the front glass and polarizer plus the lip height, and its softness from the light's size. The room has one light and no fill, so the band reaches full darkness at the frame.

**Not modelled, because there is no data for it:**
- **Ionic image retention (burn-in).** The only measurements found are for TFT panels, with fitted time constants.
- **Matte anti-glare haze.** No haze or gloss values were found, so the surface is treated as glossy, a real untreated option.
- **Reflector texture.** No measurements were found for the grain of the reflector film.
- **Per-point eye direction in the crystal optics.** At 300 mm the angle changes by about ±9° across the panel; only the glare uses it.

## Screen models

The app's **Screen** menu switches between computed profiles:

1. **Reflective TN, static drive (VI-402):** everything above. The engine's datasheet reference; not offered in the app since 0.19.0.
2. **Reflective TN, multiplexed 1/4 duty (Lumex):** the drive of the Lumex LCD-S401M16KR (TN, gray, reflective, 6:00; 1/4 duty, 1/3 bias; two 1.10 mm glass plates, from its drawing) on the same cell, glass, crystal and polarizers. The rms voltages follow from the drive formula: on = 0.577 × VLCD and off = 0.333 × VLCD.
   - **Supply voltage.** Lumex specifies 3.0 V AC for its own crystal, which is not published. On the E7 stand-in, 3.0 V under-drives the "on" points (1.73 V rms): the ink stays partly twisted and looks bluish, at 10.2:1 contrast. A multiplexed panel's supply is matched to its crystal, so the profile uses the usual design rule instead, the voltage where this cell's contrast is highest: **3.29 V** (1.90 V rms on, 1.10 V rms off), **12.1:1** contrast, with a more neutral ink.
   - **The cost.** Unlit segments get more voltage too, so they sit about 9% darker than the background instead of 2%. Faint ghost segments are typical of multiplexed calculators. A steeper multiplex-grade crystal would reduce both the blue cast and the ghosts, but no published data was found for one.
   - The Lumex drawing gives no response times or contrast, so the cell's response comes from the VI-402.
3. **Reflective STN, Nintendo DMG-01 (Retro Display Lab):** see below.
4. **Reflective HR-TFT, Nintendo Game Boy Color (Retro Display Lab):** see below.
5. **Green phosphor CRT, IBM 5151 (P39):** see below.
6. **P3 amber CRT on the IBM 5151:** see below.
7. **Colour CRT, Commodore 1084S (P22):** see below.
8. **Vector CRT, Vectrex:** see below.

Ghost segments need electrodes, so the app gives the renderer an **electrode map** (`setElectrodes`). For the Tetris test, the map is the union of every tile design's switchable area in every cell, plus the frame and every digit the counters can show. Points outside the map get no voltage.

## Nintendo DMG-01 STN on a fine panel

`screens/dmg/` with `profiles/dmg-01-stn.json`. Every number comes from [Retro Display Lab](https://github.com/JohnnySun/retro-display-lab) (Apache-2.0, copyright 2026 JohnnySun; see `third_party/retro-display-lab/NOTICE`). `tools/dmg01_profile.mjs` copies the values from a checkout without changing them and records each source file's SHA-256.

What carries over:
- **Four shades.** Art is quantized to the DMG's four drive levels by brightness, using Retro Display Lab's rule: white, light, dark, black.
- **Palette (measured).** BGB's DMG reality samples: #759833, #588f51, #3b7560, #2e615a. The palette is interpolated in linear light.
- **Response.** Each point carries an STN director coordinate. Once per DMG frame (59.7275 Hz), it drifts by Retro Display Lab's generated table, which comes from a Frank–Oseen/Ericksen–Leslie reduction of a 1/144-duty passive matrix. The drift is slowed ×1.56 (`temperature.response_scale` 0.64) so a change takes about 150 ms (10–90%, 117–201 ms depending on the shades, at 25 °C), matched to the era's published STN figures. No DMG panel has been measured, and the source's tables alone give about 91 ms. Sharp (1997) and Hitachi (1996) both give conventional STN as 300 ms for rise plus fall, 10–90%. Sharp's LM32019T STN module lists 190 ms rise and 210 ms fall. Small period modules are quoted at 100–200 ms. Sharp made the DMG's panel, and Game Boy players noticed the ghosting from launch. On a drive change the coordinate is projected onto the nominal optical branch, as in the source. The light the eye sees is the Simpson average across each frame, so moving pieces smear and fade.
- **Frame-rate independence.** The panel advances in whole DMG frames and carries the remainder, so it behaves the same at 60 Hz and at 120 Hz.
- **Contrast wheel** (×0.85 to ×1.08 drive), solved every 0.01 with the source's own solver by `tools/dmg01_wheel.mjs` (run after `tools/dmg01_profile.mjs`). The source tabulates only ×0.88, ×1.00 and ×1.08 and interpolates in a straight line, which skips the region where the crystal switches: the picture blanked at ×0.99, and turning the wheel up flattened every shade to black, because its optical calibration clamps anything outside the four nominal shades. Solved finely, the picture fades in between ×0.92 and ×1.00, its contrast peaks at ×0.99 (just under the nominal drive the white is lightest), and turning the wheel up darkens every shade while they stay distinct.
  - **Range (measured, one board).** A repairer measured −11 V and −14 V at the ends of a real DMG wheel, against −13 V for good contrast (chipmusic.org, 2015): ×0.85 to ×1.08. The source supports ×0.88 to ×1.08.
  - **Beyond the measured palette.** Lighter than nominal white or darker than nominal black, the colour is the end shade's, with its brightness scaled by the solver's luminance (`stn.nominal_luminance`, continued linearly).
  - **No stuck pixels.** The source samples the crystal's motion only between one wheel position's own four shades, so the drift far from them came from interpolation alone and left a false resting point near the fully relaxed state: after the wheel had been turned low, a pixel stayed relaxed when it came back, and pieces drawn on it never appeared. The tool adds real trajectories from the fully relaxed and fully switched states to every shade (4 s each); a relaxed pixel now switches in 0.25 to 0.7 s at ×1.00, and after any history of wheel turns and pictures every shade is back within 2 s (node tests).
  - **Hysteresis near the threshold (from the solver).** Between ×0.85 and ×0.99, a shade whose voltage sits just above the switching threshold has two resting states, relaxed and part-switched; which one a pixel shows depends on where it came from. The solver itself does this (run from the relaxed and the switched state, it settles in different places), as supertwisted crystals can near threshold. Whether the real DMG panel does is not documented.
  - **Settling near the threshold.** Just above the switching voltage the crystal settles slowly, so the tool lets equilibria run up to 60 s instead of the source's 5 s; nothing else in the solver changes.
- **Temperature.** 10–30 °C (the source's range), with an Arrhenius viscosity factor (3800 K).
- **Sticking.** Under a dark drive, ions charge (time constant about 2 minutes) and release slowly (about 40 minutes), leaving a faint image after the stack clears: about 4% of one shade after 3 minutes. It needs 32-bit float render targets and is switched off without them.
- **Fine panel (adapted).** The DMG's 160 × 144 grid is too coarse for modern vector art, so the panel is finer: each screen pixel covers up to 4 × 4 panel dots (about 40 µm apart on a desktop screen), within a budget of 3 million dots, the most screen pixels any screen here already draws. Every dot is driven at one of the four real levels, and a screen pixel shows the average light of its dots, as the eye averages dots too small to see. Edges come out as clean as the art, and the result no longer depends on the viewer's pixel density. On a high-density phone each screen pixel is already about 40 µm, so it gets one dot.
- **Reflector shadow (physical).** Room light crosses the crystal twice: in at one point, off the reflector behind the rear glass, and out at another. Under angled light the two points differ, so a shape shades the area beside it, away from the light. The offset comes from refraction through the rear glass and polarizer (the same geometry as the TN screens, `optics/room.js shadowKernel`), and it moves with the light and the eye. A light of finite size softens it. The measured palette is the colour of a flat area, where both passes cross the same state, so each pass carries the square root of that colour; flat areas keep the measured palette exactly.
  - **Inspection switch.** *Reflector shadow* under Surroundings turns it off: light then leaves where it entered, so every point shows the measured palette (the bezel shadow and glare stay). It is for inspecting the image and is labelled as not physical.
  - Retro Display Lab's shadow strength (18%) and offset (0.11 × 0.13 dot) are not used. Its own notes classify them as matched to BGB's idealized close-up drawing, not measured.
  - The shadow's size rests on the rear glass thickness, which is not published for the DMG: 1.1 mm is assumed, as on the TN panels. At the default 19° light that puts the shadow about 0.3 mm from its shape; at 45° it is about 0.7 mm, which doubles thin lines.

What does not carry over, because it needs the 160 × 144 grid: the pixel aperture, row and column crosstalk, and the row-latch scan-out timing.

Assumed and labelled:
- **Glass.** 1.1 mm, with a 0.18 mm polarizer, as on the TN panels; the DMG's glass thickness is not published. Small STN modules use 0.4, 0.55, 0.7 or 1.1 mm glass and 0.13–0.22 mm polarizers; 1.1 mm is the thickest, which gives the largest shadow. It sets the size of the reflector shadow and the bezel shadow.
- **Glare.** Fresnel reflection with n = 1.5.

Retro Display Lab's own limits apply too. It reconstructs a healthy period DMG, not a measured specimen, and its analogue drive levels and fill material are bounded reconstructions.

## DMG-01 with vector input (experimental)

The **DMG vector** button. The processor is the DMG-01's above: the same measured data, physics and controls. Only the input differs. The content is not a picture read by brightness: it is vector shapes whose paints are the four drive levels, and the processor takes them exactly as they are.

- **Contract.** Any SVG in, behaviour and colour out. Every paint must be one of the greys 255, 170, 85 or 0 at full opacity; each is looked up to its drive level (white, light, dark, black), never rounded. A file with any other paint (another grey, a colour, a gradient, partial opacity) or anything not yet supported (text not converted to outlines, `<use>`, clipping, masks, dashes) is refused as a whole, with the reasons shown on the screen. The design decisions belong before the processor.
- **Drawing** (`vector/`). `svg.js` lets the browser resolve styles, inheritance and transforms, and `geometry.js` turns every outline into exact geometry: path data with every command (arcs as cubics within 1e-7 of the radius), basic shapes, both fill rules, strokes with caps, joins and the miter limit. `draw.js` draws the shapes on the GPU straight into the processor's input at the dot size, with no smoothing: each dot takes the drive level of the shape at its centre, last shape on top. Convex outlines are drawn directly; any other outline by stencil-then-cover (windings counted in a stencil buffer), so holes, overlaps and self-crossing shapes are exact. Curves are flattened to within 0.2 dot at whatever size the panel is drawn, so the input scales with the panel. No 2D canvas is drawn or uploaded.
- **Content** (`content/scenes.js`). Tetris as one solid square per cell, each piece in one drive level (`PIECE_LEVELS`: white is the unlit panel, so pieces use light, dark and black), with the counters as outlines of the bundled bold font (`content/glyphs.js`). Two test cards (`tools/vector_test_cards.py`): `test-card.svg`, deliberately awkward (curves, arcs, rings 0.1–0.8 mm wide, hairlines down to 0.05 mm, both fill rules, a hole, overlaps, 1.6 mm text, and a Siemens star the app turns to show the crystal's response), and `test-card-off-palette.svg`, the same card with a fifth grey and a gradient, which must be refused.
- **Memory per screen pixel** (`screens/dmgv/`). The panel keeps no grid of dots. Each screen pixel is read at n × n points (40 per mm on the panel, at most 4 × 4), where the shapes are drawn each frame, so it knows exactly how much of it each drive level covers. It keeps one crystal state per drive level (the average state of the part of the pixel at that level), one ion charge, and the level at each point (2 bits each). When a point changes level, its state moves into its new level's average, projected onto the optical branch as a dot's is when its drive changes; then the DMG-01's physics runs per level, and the pixel shows each level's light in proportion to its coverage. The memory is a few numbers per pixel at any size, so edges stay fine however far the panel is enlarged. Flat areas follow the DMG-01's model exactly (GPU check, within the half-float precision of the stored light).
  - The approximation: where a moving edge crosses a pixel, points that share a level share one average state, so a just-arrived strip and a long-settled strip of the same level are blended. It affects only pixels on moving edges, for the few frames the crystal takes to settle.
  - The ion charge is one per pixel, driven by the pixel's average level: sticking is faint and slow, so finer detail would not show.
  - On resize the panel settles straight to the current image.
- **Not yet:** strokes under non-uniform transforms use the mean scale.

## Nintendo Game Boy Color (CGB-001)

`profiles/cgb-001-tft.json`, copied by `tools/cgb001_profile.mjs` from Retro Display Lab's CGB-001 model (Apache-2.0; see `third_party/retro-display-lab/NOTICE`). No value is changed.

**How it works.** The Game Boy Color's screen is a Sharp HR-TFT: a reflective colour panel with its reflector inside the cell, so there is no reflector shadow. Each pixel's art is read as the raw RGB555 code a game writes (32 levels per channel). Each channel settles toward its code at a first-order rate, once per GBC frame (59.7275 Hz); the eye sees the frame average of the measured colour along that path. Each pixel is three equal stripes, red, green and blue.

| Quantity | Value | Source |
| --- | --- | --- |
| Panel | 160 × 144, 44 × 40 mm, Sharp HR-TFT | Nintendo; *Game Boy Color Repair Procedures* (1999) |
| Colour | spectral reflectance of a real GBC, as a 32³ XYZ table (D65, light at 45°, viewed straight on) | Handheld Color Space Project (Brankale / Pokefan531), reduced by Retro Display Lab |
| Range | black 20 %, white 59 % of a white card (about 3:1) | same |
| Response | first order, 65 ms black↔white and 115 ms for small steps (10–90 %) | midpoint of Sharp's HR-TFT family bounds (50/80 and 80/150 ms); not a GBC measurement |
| Aperture | three equal stripes, R G B left to right | Retro Display Lab WS6 (minimal assumption) |

**Checked.** In the browser test, the GPU's channel states and frame-average colour match `stepFrame` to 1e-7.

**On screen.** A stripe is a third of a 0.275 mm pixel. Drawn smaller than two display pixels it would alias into rainbow bands, so the stripes appear only where the display resolves them (fading in from 2 to 3 pixels per stripe); each pixel's colour is kept either way. Where a stripe would pass the display's white, the stripes are softened just enough.

**Not modelled** (no measured values): pixel gaps, the reflector's grain, the plastic lens, image sticking, temperature, and the change of colour with the light's angle (the light moves only the glare and the bezel shadow).

**Content.** The pieces take the standard Tetris colours (cyan I, yellow O, purple T, green S, red Z, blue J, orange L), shaded from the same tile art (`content/colour.js`).

## IBM 5151 green phosphor CRT

`crt.js` with `profiles/crt-5151-p39.json`, built by `tools/crt_p39.py` (NumPy and SciPy, about 3 minutes).

**How the image forms**
- **The beam.** It sweeps 370 lines per frame at the MDA's 18.432 kHz, 49.82 Hz, with 350 lines visible. This comes from the IBM BIOS 6845 parameters and the 16.257 MHz dot clock. The panel's height is the 350 lines.
- **The signal.** Along each line the signal is continuous. There are no pixels: the content is free, so the TTL signal can switch anywhere.
- **Four levels.** Video carries 2/3 of the luminance and intensity 1/3. Art is drawn with the 4-tone tiles; dark art drives the beam.
- **The spot.** Each line lands with a Gaussian spot, integrated over each display pixel so no energy is lost between lines.
- **The phosphor.** Each point answers the beam with P39's impulse response, five exponentials stepped exactly at the moment the beam passes that point.
- **What the eye sees.** The light averaged over one refresh period. This removes the 50 Hz ripple instead of aliasing it against the phone's 60 or 120 Hz.
- **Halation.** Light trapped in the faceplate glass lands back on the screen 18 mm and more away, as a faint halo.
- **The room.** Room light reflects off the phosphor behind the tinted glass, shaded by the bezel. The etched front reflects the lamp too: not as a sharp mirror image, and not as an even grey, but as a soft glare that follows the light, like the LCDs' (`faceGlare`).

**Sources**

| Quantity | Value | Source |
|---|---|---|
| Monitor | 11.5 in, 90°, P39, 50 Hz, 350 lines, TTL video + intensity, etched face, brightness and contrast knobs | Wikipedia (IBM 5151); IBM RT PC manual |
| Drive levels | video 2/3, intensity 1/3 | Wikipedia (IBM Monochrome Display Adapter) |
| P39 | Zn₂SiO₄:Mn,As, 525 nm, x 0.205 y 0.715, persistence "long" (100 ms–1 s to 10%) | Philips T16 data book 1987; Jüstel, *CRT Phosphors* |
| Mn²⁺ decay | exponential, 10% at 20 ms (P1, same centre and host) | Jankowiak, *CRT phosphors of interest to the experimenter* |
| Trap release | bimolecular recombination in Zn₂SiO₄:Mn,As | Robbins et al. (IBM), J. Electrochem. Soc. 1985 |
| Flicker | ripple ratio 0.370 at 30 Hz, commercial P39 | US 4,315,190, table 1 |
| Spot | 1300 lines over 201 mm → σ = 77 µm | Philips M31-336/338/350 (31 cm, 90° monitor tubes) |
| Faceplate | ~50% transmission, n = 1.52 | Philips T16 data book 1987 |
| Etched front | gloss 69, specular reflectivity 0.014 of polished glass, rms roughness 75 nm | Nuijs & Horikx (Philips Research), *Applied Optics* 33 (1994) 4058, Table 1 |

**The etched glass (derived).** Gloss 69 means 69 % of polished glass's reflection lands inside a 60° gloss meter's aperture (4.4° × 11.7°; standard geometry assumed). 1.4 % stays a sharp mirror image; the rest is blurred by a Gaussian lobe of σ = 2.2° (FWHM 5.1°), solved so the aperture holds the measured 69 %. Against a 15° lamp the blur is small: the glare is about 90 % as bright at its peak as on polished glass, and slightly wider. Assumed: the 5151's etch is like Philips' etched display glass, and the lobe is Gaussian at every angle. The eye is 600 mm in front of the monitor (assumed).

**The afterglow (derived).**
- **The model.** The light is the Mn²⁺ decay fed by bimolecular trap release, g(t) = 1/t₀ / (1 + t/t₀)².
- **Solving it.** The only unknown, t₀, is solved from the measured 30 Hz ripple: t₀ = 26.9 ms.
- **The check.** The result builds up for 12 ms, falls to 10% at 106 ms and to 1% at 372 ms. That 106 ms sits inside JEDEC's "long" class, which is an independent check.
- **How the ripple is read.** The patent's ripple ratio is read as peak-to-peak over mean. Read as amplitude instead, it would give 61 ms, outside the class.
- **No published curve.** No published P39 decay curve was found (the JEDEC TEP116 tables were not reachable). A measured curve would replace this model.

**Assumed and labelled**
- **The tube.** The 5151's tube behaves like the Philips 31 cm 90° monitor tube, with the raster filling its 201 mm useful height.
- **Faceplate thickness:** 10 mm.
- **Phosphor screen reflectance:** 0.5.
- **Full-drive luminance:** 68.5 cd/m² (20 fL, the level the Philips and patent measurements use).
- **Room light:** 300 lux.

**Display limits**
- **Colour.** P39 lies outside sRGB, so it is shown on the display's green primary at the correct luminance.
- **Exposure.** It is set so the brightest line core at full drive just reaches the display's maximum green, as the eye adapts to a lit screen. One constant, so every brightness ratio is kept.
- **Fine scanlines.** At about 3 display pixels per scanline, lines can look slightly uneven: the screen's pixels sample them.

**Not modelled:** screen curvature and geometry, retrace lines, burn-in. (Spot growth with beam current: see Spot blooming.)

**Controls:** the 5151's **Brightness** knob (a uniform beam on every line, which makes the raster visible) and **Contrast** knob (video gain). The temperature control is hidden for this screen.

## Curved face (IBM 5151 tube)

Philips' M31-336/338/350 data sheet (T16, 1987) gives a **510 mm radius of screen curvature**. The face is taken as a sphere of that radius (spherical: assumed): it bulges toward the eye and its normal tilts outward, up to 11° at the top and bottom of the raster. The glare is computed about that local normal (`sphereNormal` in `optics/room.js`), so the lamp's reflection is a compact highlight that slides across the bulge as the light moves, instead of a broad wash. The 1084S's tube radius is not published, so it is drawn flat.

**Not modelled: softer corners.** Philips specifies dynamic focus for the corners (line parabola 200 V, field parabola 100 V for a 216 × 162 mm field) but gives no figure for how far the spot grows without it, so the corners stay as sharp as the centre. The picture's own small bulge (about 1 % at the edges seen from 600 mm) is not drawn either, because how the deflection yoke shapes the raster on the sphere is not published.

## Spot blooming (all CRT screens)

A harder-driven beam makes a wider spot, so bright lines are thicker than dim ones. This is electron optics, the same for every phosphor on the tube.

| Quantity | Value | Source |
| --- | --- | --- |
| Line width vs anode current | 50, 75, 100, 200 µA curves for M31-336..350 at 12 kV, against cathode cut-off voltage | Philips T16 (1987), Resolution characteristics, Fig. 5, traced into `tools/philips-m31-line-width.json` |
| Typical cathode cut-off | 30 to 60 V | M31-336/338/350 datasheet, typical operating conditions |
| Phosphor efficiency vs P4 | P39 0.75 (Philips survey); P3 45/70 (Tektronix relative luminance) | Philips T16; Jankowiak |

**Derived.** At fixed cut-off voltage the line width follows a power of the current: 0.288 at 45 V (assumed, the middle of 30-60 V; 0.26 to 0.33 over that range), within 2.5 % of all four curves. The measured spot (the 1300-line figure) is for phosphor W (P4) at the test's light output, so a phosphor that gives less light per current needs more current for the same light: its full-drive spot is wider by (1 / efficiency)^power, 9 % for P39 and 14 % for P3. Each point of a scanline gets the spot its own signal makes, so the charge each point deposits is kept exactly.

**Limits.** The curves span a factor of 4 in current, so the spot is held at its quarter-drive width below a quarter of full drive. Philips measures the 1300 lines on a 216 × 162 mm raster without saying which height the count refers to (0.125 mm over 162 mm); the useful height, 201 mm (0.155 mm), is kept.

**Seen in the app.** On the 5151 the lines are 0.57 mm apart, so bright areas mostly fill the gaps between lines. On a phone one scanline is under a pixel, so the effect is subtle unless magnified.

## P3 amber (on the IBM 5151)

`profiles/crt-5151-p3.json`, built by `tools/crt_p3.py` from the 5151 monitor in `crt-5151-p39.json` with a P3 phosphor in place of its P39.

| Quantity | Value | Source |
| --- | --- | --- |
| Phosphor | Zn8BeSi5O19:Mn (zinc beryllium silicate), yellow | JEDEC/EIA, via Jankowiak, *Cathode Ray Tube Phosphors Of Interest To The Experimenter* |
| Emission | peak 602 nm; 10 % of the peak at 504 and 700 nm | Jankowiak |
| Decay | exponential, 13 ms to 10 % | Jankowiak (P3 among the exponential-decay screens); RCA TPM-1508A gives 12.5 ms for zinc beryllium silicate:Mn |

**Derived.** No measured P3 chromaticity was found. The band is taken as a Gaussian in wavelength through the three published points (they are symmetric, so the fit is exact), giving x 0.528, y 0.458, dominant 584 nm. The same band as a Gaussian in photon energy (the usual Mn2+ shape) cannot reach the published 602 nm peak and gives x 0.487, y 0.500; that difference is stored as the colour's uncertainty. The colour lies just outside sRGB (slightly negative blue) and is shown in gamut at its true luminance.

**Assumed.** The full-drive luminance of the P39 profile.

**Context.** Amber monitors are commonly said to use P3; many 1980s amber monitors used P134 (Wyse specifications; a 1989 Samsung-built monitor), whose data is only in the paid EIA TEP-116. P3 is modelled and labelled as P3.

**On screen.** The glow is gone 13 ms after each hit, so moving pieces leave almost no trail. A real tube would ripple visibly at 50 Hz; the app shows the average over each refresh.

## Commodore 1084S colour CRT (P22)

`profiles/crt-1084s-p22.json`, built by `tools/crt_1084s.py`. The same CRT engine as the 5151, with three guns: each lights its own phosphor (red, green, blue) through the slot mask.

| Quantity | Value | Source |
| --- | --- | --- |
| Monitor | 14 in (13 in viewable), 90°, slotted triplet pitch 0.42 mm, PAL 15.625 kHz / 50 Hz, 640 × 256, analogue RGB | Commodore 1084S manual |
| Tube | Philips M34EAQ01X / 10X, 25 kV | Philips CM8833-II and CM11342 service manuals |
| Decay | red: six exponentials, gone within 1–2 ms; green, blue: three exponentials plus a power-law tail | Kuhn, *Optical Time-Domain Eavesdropping Risks of CRT Displays* (IEEE S&P 2002), photomultiplier fits of a P22 monitor |
| Colours | R 0.64, 0.33; G 0.29, 0.60; B 0.15, 0.06; D65 white | EBU Tech 3213 |
| Signal | light ∝ signal^2.4 | ITU-R BT.1886 |

**Derived.**
- **Decay.** The engine holds at most nine exponentials per point. Red is one exponential carrying all of Kuhn's red light (its slowest time constant, 442 µs). Green and blue are one component for the light of the hit's own frame plus three exponentials fitted to Kuhn's tail at log-spaced frames from 1 to 250 (5 s), within 14 % everywhere. Kuhn's tail means the frame after a hit still shows 5.2 % (green) and 4.6 % (blue) of its light: faint green-blue trails in a dark room. Red shows none.
- **Colour.** Each layer's steady light is set to its share of D65 white under the EBU primaries (22 %, 71 %, 7 %), so equal drive is white.
- **Mask.** Each gun lights only its own stripe, three times as bright there, with the average colour kept. The stripes are drawn only where the display gives each one 2 or more pixels (they fade in from 2 to 3), as on the Game Boy Color.

**Assumed.** No spot size is published for the M34EAQ: σ 0.25 mm at full drive. The faceplate, etch, room, knobs and bloom law are the 5151 profile's; full drive is 100 cd/m². The slots' bridges are not modelled. 288 lines fill the 198 mm picture height; the panel shows the 256-line picture.

**Content.** On a colour tube the game draws on black (guns off) with white text, using the colour tiles.

**The engine** now has three state textures per point (nine component charges and each gun's last excitation). The monochrome screens render pixel-identically to before.

## Vectrex vector display

`profiles/vectrex.json`, built by `tools/vectrex.py`; renderer `screens/vector/`. No raster: the beam draws each line of the frame's display list directly, and the game hands the screen lines instead of a picture (`content/vectors.js`: the board frame, a square per occupied cell, the counters in a stroke font).

| Quantity | Value | Source |
| --- | --- | --- |
| Tube | Samsung 240RB40, 9 in (240 mm diagonal), 90°, a black-and-white TV tube with no mask | Vectrex service manual (via the Vectrex wiki and crtgang) |
| Round | 30 000 cycles of the 1.5 MHz 6809 = 1/50 s | Malban, *Vectrex tutorial II* |
| Drawing | strength (speed) × time (scale) = length; slower is brighter; a bright dot at the end of lines | Malban; Vectrex32 manual |
| Budget | about 200–400 vectors per frame before the refresh slows and the picture flickers | Roger Boesch (via crtgang) |

**How it works.** Each line lays down charge in proportion to current / speed per millimetre, spread across the spot (a Gaussian), with spot-wide ends; where the beam stops at a line's end it leaves a dot of dwell × speed over the line's spread (about twice the line's core). Lines add up where they cross. The phosphor is far faster than a round, so each round shows the lines drawn in it. A list longer than the round's budget slows the refresh: the light per second falls with it, and the Info tab says the picture flickers.

**Derived.** 66.7 µs per vector: the 1/50 s round over the middle of the 200–400 budget. The Tetris board draws about 190 vectors with a full stack, within the budget.

**Assumed.** P4 white phosphor (the standard black-and-white TV phosphor); a 144 × 192 mm portrait picture; one beam speed for every line (1.13 mm/µs, half the picture height in 127 cycles); spot σ 0.3 mm; the end dot equal to 2 cycles of a stopped beam; the 5151's room-reflection model with a glossy face. Not modelled: colour overlays, halation, the integrator's drift and the beam's moves between objects.

**Checked.** In the browser test, the GPU's added-up line light matches the model to 7e-4.

## Retired: P7 screens

The P7 cascade screen (on the 5151 raster) and the P7 radar PPI were removed in 0.20.0. A linear model cannot fit P7's measured decay after a single flash (RCA 1961 against MIT 1948), so its trails were not convincing, and a radar sweep does not suit the game engine. Their profiles, builders, the traced RCA curves and the PPI drive remain in the project history (up to 0.19.0). The CRT engine keeps its support for two phosphor layers.

## 4-tone tiles

`four-tone.js` makes a 4-tone version of each tile for the DMG-01 and CRT screens. It keeps the same shapes and snaps each grey to white, light, dark or black:
- the tile's body (its first fill) becomes dark;
- tones lighter than the body become light;
- darker tones become black.

Pieces stand out from the background, and bevels and details keep their order. The TN screens and the NOMAD Tetris game keep the art as authored.

## Drive and controls

On the TN screens the panel shows one ink colour: every point is either 0 V or 3.0 V, exactly as on the VI-402, and content darker than 50% luminance switches on. Design art in two tones. On the DMG-01 screen, design art in four tones.

The controls come in two groups, and the first holds only controls the real device has:
- **On the device:**
  - VI-402: none. It is bare glass on a fixed 3.0 V static drive.
  - Lumex multiplexed TN: **Contrast trim (VLCD)**, 2.6–4.2 V, default 3.29 V (this cell's contrast optimum). Multiplexed products set contrast with their supply; the on and off rms voltages are fixed fractions of VLCD (0.577 and 0.333), so the trim scales the whole drive (`setDriveGain`). The profile is unchanged.
  - DMG-01: **Contrast wheel**, default ×1.00.
  - Game Boy Color: none. The handheld has no picture control.
  - IBM 5151 and Commodore 1084S: **Brightness and Contrast knobs.**
  - Vectrex: **Brightness knob** (the beam current).
- **Surroundings:** light angle and direction (default 19° from straight on, from 307°: top left, a little toward the left; the device's shadow on the page falls away from it), panel temperature (default 25 °C; LCDs only) and **room brightness** (CRTs and the Vectrex only, 0 to 500 lx, default 300 lx). A CRT makes its own light, so the room only adds its reflection off the glass (scaled by lux ÷ the profile's 300 lx; the phosphor's light is unchanged), and a dark room shows the afterglow a lit room drowns. A reflective LCD shows only the room's own light, so a brighter or dimmer room changes nothing an adapting eye sees, and it has no room control.
- **Simulation:** run/pause (stops the game; the screen keeps showing the still picture) and **Reset settings** (every control back to its default: the room and this screen's knobs).

Fixed at realistic defaults:
- **Light:** 15° wide, at normal room brightness.
- **Viewer:** straight on, 300 mm away.

The engine still supports analog grays (`setMode('analog')`, a digital compromise, since the datasheet panel cannot do it), viewing angle and eye distance (`setViewing`), and light size and brightness (`setLighting`) for other uses.

## Code structure

Four layers, each depending only on the ones below it:

```
app/        the page: which screen is shown, its controls, the Info tab
content/    what is shown: NOMAD Tetris and its tile art
screens/    how it is shown: one folder per kind of screen
gpu/ optics/  shared plumbing: WebGL2, common GLSL, room-light geometry
```

Every screen kind has the same five files:

| File | Holds |
| --- | --- |
| `model.js` | the physics, as pure functions; tested in node |
| `shaders.js` | the same physics on the GPU (GLSL) |
| `renderer.js` | runs the shaders each frame; meets the contract in `screens/contract.js` |
| `definition.js` | what the app shows: the device's real controls, notes, the Info list; no logic |
| `index.js` | the kind's public entry; the app and tests import only this |

| Folder | Files |
| --- | --- |
| `app/` | `main.js` (start and frame loop), `screens.js` (the screen list), `stage.js` (canvas and renderer), `controls.js`, `info.js`, `view.js` |
| `gpu/` | `webgl.js` (context, targets, drawing, resize, context loss), `glsl.js` (shared shader chunks) |
| `optics/` | `room.js`: light direction, Fresnel glare (on flat or curved glass), bezel shadow; `aperture.js`: when colour stripes can be drawn; the JS twins of the shared GLSL |
| `reference/` | `reflective-tn.json`: the static-drive TN profile (VI-402), the datasheet reference the tests check the TN engine against; not a screen in the app |
| `screens/tn/` | reflective TN, multiplexed (shown) and static (the engine's datasheet reference, kept for the tests); `profiles/reflective-tn*.json`, built by `tools/reflective_tn.py` (NumPy and SciPy, about 2 minutes; `TN_DESIGN=second` computes the second-maximum design) |
| `screens/cgb/` | the Game Boy Color; `profiles/cgb-001-tft.json`, copied by `tools/cgb001_profile.mjs` from Retro Display Lab |
| `screens/dmg/` | the DMG-01; `profiles/dmg-01-stn.json`, copied by `tools/dmg01_profile.mjs`; licence in `third_party/retro-display-lab/` |
| `screens/crt/` | the IBM 5151; `profiles/crt-5151-p39.json` (`tools/crt_p39.py`),, `profiles/crt-5151-p3.json` (`tools/crt_p3.py`) and the Commodore 1084S `profiles/crt-1084s-p22.json` (`tools/crt_1084s.py`) |
| `screens/vector/` | the Vectrex; `profiles/vectrex.json` (`tools/vectrex.py`); the game as lines in `content/vectors.js` |
| `content/` | `tetris.js` (game, autoplay, electrode map), `tiles.js`, `four-tone.js` |
| `fonts/` | the bundled fonts, so text looks the same on every device: DejaVu Sans Mono (Regular, Bold) for the page and the counters drawn on the screens, Inter (Regular) for notes; Latin subsets, licences beside them |
| `vector/` | vector input (experimental): `geometry.js` (exact shapes, pure), `svg.js` (any SVG, four-level check), `draw.js` (GPU, no smoothing) |
| `concept/` | the earlier hand-tuned concept model; its values were chosen by hand rather than measured |

Profiles are checked when they load: each kind lists the fields it reads (`PROFILE_FIELDS`) and refuses a profile that lacks one, naming it.

A resize carries the panel's state to the new size, so scrolling, rotating or resizing the window never resets the screen.

## Layout

**Zoom.** Browser zoom and a pinch (two fingers on a trackpad or touch screen) both redraw the panel at the enlarged resolution, a moment after the zoom pauses; a pinch otherwise only stretches the picture already drawn.

**Diagnostic report.** The Info tab's *Copy report* button copies a plain-text receipt: device, browser and graphics card, the screen and its settings, panel size and GPU memory, and the last eight 2-second samples (frame rate, frame intervals and stutters, JavaScript time). On the DMG-01 screens each sample also lists every pass with its CPU time and, where the browser offers a GPU timer (`EXT_disjoint_timer_query_webgl2`, most desktop browsers), the time the graphics card took (`app/diagnostics.js`; the timer is `section()` in `gpu/webgl.js`).

One screen at a time. The **LCD / CRT** switch picks the technology; the buttons under the screen pick the panel (TN 1/4 mux, DMG-01, Game Boy Color) or the monitor (P39 green, P3 amber, Colour, Vector). **Info** shows where every number comes from, and the screen stops drawing while it is open. Each switch remembers the last screen chosen under it.

To add a phosphor: build its profile into `profiles/`, add an entry to `SCREENS` in `app/screens.js` with `kind: 'crt'` and `family: 'crt'` (with `short` for its button and `sub` for the two lines beside the title), and list the profile in `sw.js`. Its button appears on its own; the CRT definition reads every number from the profile.

## Releases and tests

`index.html` (`vector-lcd-version`), `app/main.js` (`APP_VERSION`) and `sw.js` (`VERSION`) share one version; bump all three for every release. Each renderer has its own `VERSION` in its `renderer.js`.

- `node --test tests/vector-lcd.test.mjs`: the physics of every screen, the profiles against their datasheets (contrast and response times, the Fréedericksz threshold, the Gooch–Tarry cell design), the structure (every kind complete, every profile valid, only real device controls) and the offline package.
- `python tests/test_vector_lcd_browser.py`: in a real browser, the GPU against each JavaScript model (director state, ions, shown light, steady phosphor light, the Game Boy Color's channel states and colour), every renderer against the contract, state kept across a resize, and every screen opened in the app.

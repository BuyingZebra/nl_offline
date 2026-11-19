# Vector LCD

Physically computed LCD screens for digital content. The content is free: any art, anywhere. The way the image forms follows the physics of a real screen type, with every number taken from a datasheet, a measurement or a physical law.

Open it at **https://buyingzebra.github.io/nl_offline/vector-lcd/** and use **Add to Home Screen** to install it. After the first visit it works offline.

The screen types are a **reflective twisted-nematic (TN) LCD**, the calculator and watch kind, the **Nintendo DMG-01's reflective STN** with its four shades, built from Retro Display Lab's measurements but without the dot grid, and an **IBM 5151 green phosphor CRT** (P39) with a real raster. The test content is the real NOMAD Tetris game (`tetris/game.js`) with its actual tile SVGs (`tetris/assets/tiles/vector/`, and I-piece fragments from the game's own `smooth-geometry.mjs`).

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

1. **Reflective TN, static drive (VI-402):** everything above.
2. **Reflective TN, multiplexed 1/4 duty (Lumex):** the drive of the Lumex LCD-S401M16KR (TN, gray, reflective, 6:00; 1/4 duty, 1/3 bias; two 1.10 mm glass plates, from its drawing) on the same cell, glass, crystal and polarizers. The rms voltages follow from the drive formula: on = 0.577 × VLCD and off = 0.333 × VLCD.
   - **Supply voltage.** Lumex specifies 3.0 V AC for its own crystal, which is not published. On the E7 stand-in, 3.0 V under-drives the "on" points (1.73 V rms): the ink stays partly twisted and looks bluish, at 10.2:1 contrast. A multiplexed panel's supply is matched to its crystal, so the profile uses the usual design rule instead, the voltage where this cell's contrast is highest: **3.29 V** (1.90 V rms on, 1.10 V rms off), **12.1:1** contrast, with a more neutral ink.
   - **The cost.** Unlit segments get more voltage too, so they sit about 9% darker than the background instead of 2%. Faint ghost segments are typical of multiplexed calculators. A steeper multiplex-grade crystal would reduce both the blue cast and the ghosts, but no published data was found for one.
   - The Lumex drawing gives no response times or contrast, so the cell's response comes from the VI-402.
3. **Reflective STN, Nintendo DMG-01 (Retro Display Lab):** see below.
4. **Green phosphor CRT, IBM 5151 (P39):** see below.

Ghost segments need electrodes, so the app gives the renderer an **electrode map** (`setElectrodes`). For the Tetris test, the map is the union of every tile design's switchable area in every cell, plus the frame and every digit the counters can show. Points outside the map get no voltage.

## Nintendo DMG-01 STN without the dot grid

`dmg-stn.js` with `profiles/dmg-01-stn.json`. Every number comes from [Retro Display Lab](https://github.com/JohnnySun/retro-display-lab) (Apache-2.0, copyright 2026 JohnnySun; see `third_party/retro-display-lab/NOTICE`). `tools/dmg01_profile.mjs` copies the values from a checkout without changing them and records each source file's SHA-256.

What carries over:
- **Four shades.** Art is quantized to the DMG's four drive levels by brightness, using Retro Display Lab's rule: white, light, dark, black.
- **Palette (measured).** BGB's DMG reality samples: #759833, #588f51, #3b7560, #2e615a. The palette is interpolated in linear light.
- **Response.** Each point carries an STN director coordinate. Once per DMG frame (59.7275 Hz), it drifts by Retro Display Lab's generated table, which comes from a Frank–Oseen/Ericksen–Leslie reduction of a 1/144-duty passive matrix. About 67 ms to 90% at 20 °C. On a drive change the coordinate is projected onto the nominal optical branch, as in the source. The light the eye sees is the Simpson average across each frame, so moving pieces smear and fade.
- **Frame-rate independence.** The panel advances in whole DMG frames and carries the remainder, so it behaves the same at 60 Hz and at 120 Hz.
- **Contrast wheel** (×0.88 to ×1.08 drive), interpolated between the source's three tabulated conditions. At the extremes the panel washes out or blacks out, like turning the real wheel.
- **Temperature.** 10–30 °C (the source's range), with an Arrhenius viscosity factor (3800 K).
- **Sticking.** Under a dark drive, ions charge (time constant about 2 minutes) and release slowly (about 40 minutes), leaving a faint image after the stack clears: about 4% of one shade after 3 minutes. It needs 32-bit float render targets and is switched off without them.
- **Reflector shadow (measured).** 18% strength, offset 0.11 × 0.13 dot: 32 × 39 µm on the DMG's 47 × 43 mm, 160 × 144 panel. This is small, as on the real screen.
  - Retro Display Lab draws the shadow only in the gaps between pixels. A gridless panel has no gaps, so here it darkens a point wherever the shifted image is darker than the point itself. Flat areas keep the measured palette exactly.
  - The offset stays as measured (light from the upper left); the light controls move only the bezel shadow and the glare.

What does not carry over, because it needs the 160 × 144 grid: the pixel aperture, row and column crosstalk, and the row-latch scan-out timing.

Assumed and labelled:
- **Bezel front stack.** 1.1 mm glass, as on the TN panels; the DMG's glass thickness is not published.
- **Glare.** Fresnel reflection with n = 1.5.

Retro Display Lab's own limits apply too. It reconstructs a healthy period DMG, not a measured specimen, and its analogue drive levels and fill material are bounded reconstructions.

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
- **The room.** Room light reflects off the phosphor behind the tinted glass and off the etched surface, shaded by the bezel.

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

**Not modelled:** screen curvature and geometry, spot growth with beam current, retrace lines, burn-in.

**Controls:** the 5151's **Brightness** knob (a uniform beam on every line, which makes the raster visible) and **Contrast** knob (video gain). The temperature control is hidden for this screen.

## 4-tone tiles

`four-tone.js` makes a 4-tone version of each tile for the DMG-01 and CRT screens. It keeps the same shapes and snaps each grey to white, light, dark or black:
- the tile's body (its first fill) becomes dark;
- tones lighter than the body become light;
- darker tones become black.

Pieces stand out from the background, and bevels and details keep their order. The TN screens and the NOMAD Tetris game keep the art as authored.

## Drive and controls

On the TN screens the panel shows one ink colour: every point is either 0 V or 3.0 V, exactly as on the VI-402, and content darker than 50% luminance switches on. Design art in two tones. On the DMG-01 screen, design art in four tones.

The app's controls are deliberately few:
- **Pause and Reset panel.**
- **Light angle and direction:** default 45° from the top-left corner.
- **Panel temperature:** default 25 °C.
- **Contrast wheel:** DMG-01 only, default ×1.00.
- **Brightness and Contrast knobs:** CRT only.

Fixed at realistic defaults:
- **Light:** 15° wide, at normal room brightness.
- **Viewer:** straight on, 300 mm away.

The engine still supports analog grays (`setMode('analog')`, a digital compromise, since the datasheet panel cannot do it), viewing angle and eye distance (`setViewing`), and light size and brightness (`setLighting`) for other uses.

## Files

- `physical-lcd.js`: the renderer (WebGL2, no dependencies). It loads a profile and does drive, relaxation and double-pass optics. The pure model functions are exported, and the shaders mirror them.
- `profiles/reflective-tn.json`: the computed profile: tables, sources and derived values.
- `tools/reflective_tn.py`: regenerates the profile from first principles (NumPy and SciPy, about 2 minutes). Set `TN_DESIGN=second` to compute the second-maximum design. `tools/cie-1931-d65.json` holds the colour tables it uses.
- `dmg-stn.js`, `profiles/dmg-01-stn.json`, `tools/dmg01_profile.mjs`, `third_party/retro-display-lab/`: the DMG-01 screen, its data, the copy script and the licence and notice.
- `crt.js`, `profiles/crt-5151-p39.json`, `tools/crt_p39.py`: the green phosphor CRT, its profile and the script that builds it.
- `four-tone.js`: the 4-tone tile mapping.
- `tn-demo.js`, `index.html`: the Tetris screen test.
- `concept.html`, `demo.js`, `vector-lcd.js`: the earlier hand-tuned concept model. Its values were chosen by hand rather than measured or derived.

## Releases and tests

`index.html` (`vector-lcd-version`), `tn-demo.js` (`APP_VERSION`) and `sw.js` (`VERSION`) share one version; bump all three for every release. Run `node --test tests/vector-lcd.test.mjs`. The tests include independent checks that the profile reproduces the datasheet contrast and response times, the Fréedericksz threshold and the Gooch–Tarry cell design.

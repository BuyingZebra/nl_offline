# Vector LCD

Physically computed LCD screens for digital content. The content is free: any art, anywhere. The way the image forms follows the physics of a real screen type, with every number taken from a datasheet, a measurement or a physical law.

Open it at **https://buyingzebra.github.io/nl_offline/vector-lcd/** and use **Add to Home Screen** to install it. After the first visit it works offline.

The first screen type is a **reflective twisted-nematic (TN) LCD**, the calculator and watch kind. The test content is the real NOMAD Tetris game (`tetris/game.js`) with its actual tile SVGs (`tetris/assets/tiles/vector/`, and I-piece fragments from the game's own `smooth-geometry.mjs`).

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
| Cell design | 90° twist, first transmission maximum | Gooch & Tarry, J. Phys. D 8, 1575 (1975) |
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

**Not modelled, because there is no data for it:**
- viewing-angle changes (the viewer is assumed straight on)
- temperature
- ionic image retention

## Drive modes

- **Static (datasheet):** every point is either 0 V or 3.0 V, exactly as on the VI-402. Content darker than 50% luminance switches on.
- **Analog grays:** a digital compromise. Each point gets its own voltage, chosen so the static brightness matches the content's gray. On a TN cell, partial voltages come out slightly bluish, because a partly twisted crystal treats wavelengths differently. That tint is real and comes from the optics, not from a setting.

## Files

- `physical-lcd.js`: the renderer (WebGL2, no dependencies). It loads a profile and does drive, relaxation and double-pass optics. The pure model functions are exported, and the shaders mirror them.
- `profiles/reflective-tn.json`: the computed profile: tables, sources and derived values.
- `tools/reflective_tn.py`: regenerates the profile from first principles (NumPy and SciPy, about 90 s). `tools/cie-1931-d65.json` holds the colour tables it uses.
- `tn-demo.js`, `index.html`: the Tetris screen test.
- `concept.html`, `demo.js`, `vector-lcd.js`: the earlier hand-tuned concept model. Its values were chosen by hand rather than measured or derived.

## Releases and tests

`index.html` (`vector-lcd-version`), `tn-demo.js` (`APP_VERSION`) and `sw.js` (`VERSION`) share one version; bump all three for every release. Run `node --test tests/vector-lcd.test.mjs`. The tests include independent checks that the profile reproduces the datasheet contrast and response times, the Fréedericksz threshold and the Gooch–Tarry cell design.

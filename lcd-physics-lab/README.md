# NOMAD — Shape-Driven Physical LCD Laboratory

This is a **standalone experiment**. It does not import, register, cache, or modify the NOMAD Tetris PWA. The original v262 game and its service worker are unchanged.

## Original project source

- Original reference: [JohnnySun/retro-display-lab](https://github.com/JohnnySun/retro-display-lab), Apache-2.0, copied unchanged to `../lcd-response-study/upstream/`, including LICENSE.
- Authenticated NOMAD artwork: `nomad-mark.svg`, `I.svg`, `O.svg`, `T.svg`; copies in `assets/` are byte-identical to the v262 source SVGs.
- Original NOMAD text and LCD panel grayscale values are used in the independent 160 × 144 **recomposed scene fixture**. This fixture is not a complete pixel-accurate reproduction of the portrait app.

## Pipeline

1. **Full artwork** drawn with Canvas2D at 640 × 576 (4× Game Boy coordinates). An independently generated geometry mask encodes active foreground silhouettes, with antialiased coverage.
2. **Native electrical matrix:** artwork is downsampled/quantized to 160 × 144 and fed into the source row loading, crosstalk summary, STN response and panel-matrix passes. The original DMG 4-code / row/column model is unchanged.
3. **Recover native electrical correction:** the original 32-bit response feedback packs effective drive into the fractional part of alpha: `alpha = 2 * driveIndex + 8 * transitionOrigin + effectiveDrive / 4`. Subtract the current quantized drive from the decoded effective drive to isolate the physical row/column correction. Use both current and prior native states.
4. **Fine physical material (default 320 × 288):** apply that RC correction to continuous-valued fine artwork samples, then run the source target/drift lookup, temperature scaling, ionic charge/release, transition canonicalization, Simpson exposure integrator and persistent RGBA32F history per screen-space sample. The 154-line Game Boy scan timing is remapped from the fine material resolution to its 144 native active rows.
5. **Shape optics:** use the measured reference palette and linear-light interpolation. Replace only the square aperture/gap intersection with the same geometric overlap logic applied to the content silhouette mask. Retain the reference shadow offset, reference strength, contrast, brightness and chroma.
6. **Output:** render a 640 × 576 optical image. The original square-aperture reference, untouched artwork, and source silhouette mask remain selectable for comparison.

## Design constraints and limitations

- The original electrical driver still operates on **rectangular 160 × 144 virtual rows and columns**. Its output is smoothly interpolated to the fine material grid. The correct three-dimensional electric field for arbitrary, nonrectangular fabricated electrodes **is not simulated or measured**. This is a hypothetical material model—not an actual hardware-equivalent Nintendo DMG panel.
- The fine physical response and original native response share source material functions, but differ in input drive (continuous vs 4-code) and spatial sampling.
- The fine-response pass preserves the source lookup table calibration and frame integration, rather than substituting user-invented rise/fall constants.
- The shape shadow is a generalized reflective mask overlap using the source parameters; panel geometry/thickness and measured shadow masks for nonrectangular electrodes are unknown.
- iPhone WebGL2 shaders may compile slowly or be rejected by the GPU. The page does not initialize WebGL until requested, has no automatic animation, defaults to 2× material resolution, offers a 3× experimental mode, and automatically pauses slow frames. Hardware/runtime validation must happen on the target device.

## Study controls

1. Open `index.html` from the GitHub Pages website.
2. Leave 2× material resolution selected for the first test.
3. Press **LOAD PHYSICAL MODEL**. It runs exactly one initial physical frame and stays paused.
4. Compare **Shape-driven physical material**, **Original DMG-01 square cells**, **Original NOMAD v262 artwork** and **Active sprite/electrode silhouette**.
5. Press **STEP 1 FRAME** or **RUN**. Try blinking START GAME and moving the actual source SVG tiles. **RESET HISTORY** clears both material and original DMG reference buffers.

## Optical fringes and reflector inspection

The original source palette has yellow-olive inactive glass and blue-green active shades; there is **no independent red chromatic-fringing pass**. The perceived warm edge is a mix of different source-palette colours plus the physical aperture coverage. Do not mistake that for calibrated red spectral dispersion.

The original shadow offset is 0.11 × 0.13 DMG-cell widths, translating to 0.44 × 0.52 pixels at the 4× optical output. At reference strength 0.18 it can be effectively invisible on a downscaled phone display, especially without the original thousands of square aperture boundaries.

- **Shape-driven with aperture fringes:** physical reference value by default
- **Previous cell-less (no aperture fringes):** comparison mode; no longer erroneously routes to the shadow-only diagnostic
- **Reflector overlap:** geometry-only mask (white means shifted sprite coverage not occluded by the original shape)
- **Isolated reflector darkening:** the source linear-light shadow contribution, shown separately
- **Reflector shadow visibility:** 1× = original parameters, 4×/12×/24× = deliberately exaggerated *diagnostic only*. Nothing about the actual electrical matrix, director state, or ionic history changes at these gains.

The shape aperture is a physical-model generalization, not an exact reproduction of a nonexistent DMG panel with letter-shaped electrodes.

## Static verification (Nov 17, 2026)

- Original four NOMAD SVG assets SHA-identical to their live v262 counterparts.
- The source STN physical functions, generated lookup tables, ionic model and original 154-line scanout mapping remain present in the generated response shader.
- CPU reproduction of packed current-drive feedback alpha across all four discrete drives and origins has a worst round-trip error of ~3.1e-6 using Float32.
- No old arbitrary detail fade rates or 0.35 shadow substitute in this laboratory.
- JavaScript syntax, page inputs, shader generator anchors, and separate NOMAD source-tree invariance checked. **A GPU compile/render test has not been confirmed on the target iPhone.**

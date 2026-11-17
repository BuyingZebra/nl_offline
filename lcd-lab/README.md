# LCD Material Lab — STN physical response study

Standalone browser experiment at **[/lcd-lab/](https://buyingzebra.github.io/nl_offline/lcd-lab/)**. This does not import the Tetris runtime, touch its settings or high scores, or install a service worker.

## What this version implements

- Frozen NOMAD Tetris System title/START, moving tetromino, four-shade diagnostic and cell-geometry fixture, sampled onto the original DMG 160 × 144 logical pixel grid.
- Reduced-order **STN director state simulation**, using Retro Display Lab's *nominal 20°C / drive-contrast=1* physical drift LUT, physical optical-response LUT and anchor correction; separate slow ionic-state history; temperature-dependent viscous time scaling.
- Five reference optical states (undriven gaps + four driven shades) from upstream's documented DMG data, colour interpolated in **linear light**.
- Analytic, periodic rectangular LCD cell aperture coverage based on host pixel footprint, with the inactive gap remaining visible through dark letters.
- Displaced, aperture-limited reflector shadow and intersection coverage so shadow darkens gaps without painting black duplicates over active cells.
- Adjustable temperature, aperture fill, footprint, reflector offset, contrast, brightness, chroma and debug views.
- A **separately labelled experimental** front-glass reflection layer. It is not part of the upstream physical STN model.

## What this version is not

This is an **initial source-grounded browser adaptation**, not an exact reproduction of all five passes of Retro Display Lab. In particular, it does **not** implement the original project's row- and column-line RC loading, phase-local common-electrode crosstalk, scanout timing/latching, all contrast material conditions or complete ionic and frame-exposure integration. Inactive cell gaps are geometric; ordinary motion trails arise from the STN director's changing state, not a blur filter.

No image-space crosstalk substitute is enabled. Porting the actual electrical reduction is a later research task and must be verified against upstream reference tests.

See [CREDITS](./CREDITS.md) and the included [Apache 2.0 license](./LICENSE-APACHE-2.0.txt).

## Running

Open `/lcd-lab/` from a GitHub Pages deployment or serve the repository root with any local static HTTP server. Modern WebGL2 is required. The page does not require an Internet connection once loaded, but unlike the Tetris PWA it does **not** pre-cache an offline copy.

For the numerical data/model tests, on Node.js 22:

```sh
cd lcd-lab
npm test
```

## Experiments

1. Set **Optical palette** to DMG reference, **Glass contribution** to 0, and choose **CELL GEOMETRY**. Confirm gaps remain visible inside dark, mid-grey and light cells.
2. Toggle **SHADES**, adjust active aperture fill and compare contrast with the cell mask intact.
3. Select **Falling tetromino**, animate at 20°C, then compare 5°C and 40°C for the director-dynamics time scale.
4. Return to **Tetris System title** and explore reflector offsets and shadow strength.
5. Use **NOMAD experimental colour** and front glass only after studying the baseline.

A physical-device Safari comparison, actual frame timing and GPU compilation diagnostics are still required before treating the look or performance as validated.

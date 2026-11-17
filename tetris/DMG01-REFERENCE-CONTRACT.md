# DMG-01 reference parity contract — 2026-11-17

**Status:** source audit and immutable parameter baseline ONLY. This research branch does not change the playable app, does not implement a source-equivalent renderer, and is not evidence of mobile visual parity.

## Goal and boundary

The reference target is JohnnySun's *Retro Display Lab* best-effort **healthy 1989–1991 Nintendo DMG-01 reflective STN panel reconstruction**, not a generic green LCD aesthetic.

Our NOMAD Tetris content is a full-portrait arbitrary-resolution scene. It cannot **simultaneously** be displayed with unrestricted original subpixel detail and physically behave like the source's fixed **160 × 144** four-drive-electrode LCD. We must preserve both demands in **two explicitly labeled outputs**:

1. **Reference / DMG-01 study:** native 160 × 144 electrical input, four addressable drive levels, upstream source-derived temporal model, five-state optical palette, geometric aperture and reflector, and source-style row/column spatial loading. Present at an exact integer scale for reproducible comparison. Any scene adaptation to that input must be declared and must not be misrepresented as native Tetris artwork.
2. **NOMAD artistic compatibility:** preserve existing original portrait art, geometry, tile vectors, fonts, controls, menus and gameplay; keep the existing v270/v271 hybrid optical presentation as a separate experimental renderer. Do not label it "accurate DMG" or use it to validate the upstream physical model.

Do **not** degrade or change the original Tetris art to make a visual comparison appear closer to a historical console.

## Sources, classifications and reproducibility

- Upstream project: https://github.com/JohnnySun/retro-display-lab
- Evidence policy: https://github.com/JohnnySun/retro-display-lab/blob/main/docs/reference-policy.md
- DMG source evidence: https://github.com/JohnnySun/retro-display-lab/blob/main/models/nintendo-dmg-01/REFERENCES.md
- Reconstruction data: https://github.com/JohnnySun/retro-display-lab/blob/main/models/nintendo-dmg-01/data/reconstruction-v1.json
- Five-pass target reference: https://github.com/JohnnySun/retro-display-lab/blob/main/targets/konkr-gt78-vn/960x640-srgb-neutral/presets/dmg01-reference-v1.slangp
- Original display shader: https://github.com/JohnnySun/retro-display-lab/blob/main/models/nintendo-dmg-01/shaders/dmg01-display-v1.slang
- Original temporal shader: https://github.com/JohnnySun/retro-display-lab/blob/main/models/nintendo-dmg-01/shaders/dmg01-response-v1.slang
- Upstream-inherited BGB source: https://bgb.bircd.org/reality/index.html
- Our earlier source provenance: ../lcd-lab/CREDITS.md; it recorded inspection at commit `b75171026b1f0594a8288232ad532285470dbe08`, but current upstream HEAD must be separately pinned for any final equivalence test.
- Data-only captured baseline (this branch): `./dmg01-upstream-reference.json`.

**Evidence boundaries:** The five palette colours are BGB reference-image matches rather than direct spectrophotometer measurements of an actual surviving unit. Aperture fill **0.875** is the **idealized** BGB 70/80 aperture width; BGB says actual DMG edge width was unknown. The STN model is a literature-constrained physical reconstruction, not recovered exact material constants. The KONKR target brightness/chroma settings apply to that target, **not** iPhone display physics.

## Correct upstream rendering chain

Original reference preset uses **five passes**, rather than one grayscale history plus a decorative texture:

```
DMG 160x144 source + prior frame
  -> pass 0: per-row three-phase load statistics
  -> pass 1: per-column / common-electrode crosstalk statistics
  -> pass 2: DMG drive + scan latch, director/ionic history (RGBA32F feedback)
  -> pass 3: STN optical matrix/presentation
  -> pass 4: original measured 5-state colour, area-integrated apertures,
             geometric displaced reflector shadow
  -> target-specific output calibration (separate, not panel physics)
```

Preserve four logical drive states and physically evolving optical response. Preserve time integration and causal prior-frame latch behavior; temporal interpolation is **not** equivalent to generic whole-frame blur. Source uses generated director drift / optical lookup tables tied to source evidence. The source's row/column crosstalk cannot be replaced by a Gaussian blur or an artistic image-space kernel.

## Upstream model values

| Parameter | Model reference |
|---|---:|
| Native addressed resolution | 160 × 144 |
| Frame reference | 59.7275 Hz |
| Driven states + separate undriven gap | four + one |
| Optical palette sRGB | #948A04 gap, #759833, #588F51, #3B7560, #2E615A |
| Aperture fill, per axis | 0.875 |
| Host-pixel box filter | 1 |
| Reflector shadow | 0.18 |
| Shadow offsets | 0.11 and 0.13 cells |
| Optical contrast / bias | 1.00 / 0.00 |
| Drive contrast | 1.00 |
| Panel temperature | 20 °C |
| Row and column crosstalk scales | 1.00, 1.00 |
| Polarizer aging | 0 |

The source shader default output brightness/chroma is **1.0/1.0**. Its **KONKR-specific** bundled target preset uses **0.68/0.90** with a measured host profile. These are different concepts.

The 4× exact-scale target makes each logical pixel four host output pixels wide: at 0.875 fill, the idealized gap is 0.5 host pixels wide before area integration. A small visible gap is therefore *expected*; the source shader explicitly integrates area rather than relying on a point-sampled line.

## Current NOMAD v271 deviations (not defects until controlled comparison)

| Difference | Current implementation | Upstream reference requirement |
|---|---|---|
| Grid dimensions | `ceil(CSS width × density / 2.5)` × height analog; at 1× cell pitch 2.5 CSS px | fixed 160 × 144 addressed states |
| Signal | one per-cell four-level drive, interpreted from arbitrary full-screen brightness | four-level native DMG input and per-row/column model |
| Presentation | full-resolution continuous original art plus per-cell *transient correction* | state-driven pixel optical output, no original-image bypass |
| Dynamic physics | sourced nominal drift/optical tables + ionic history in RGBA8 | multi-condition source model and RGBA32F feedback with scan/latch/crosstalk |
| Spatial loading | missing complete upstream five-pass row/column electrical RC implementation | preserve row/column causal model |
| Phone defaults | view contrast 190%, reflected light 120%, virtual glass on | no such assumptions in panel reference |
| Full-portrait Tetris | preserves all UI details and original graphics | test source at 160 × 144, only then separately adapt |

Source paths: `tetris/physical-lcd.js`, `tetris/render.js`, `tetris/game.js`, and `tetris/PHYSICAL-LCD.md` (v270/v271 hybrid disclosures).

**Important light-mesh mechanism:** In v271 the physical output shader uses `mix(background,opticalColour(s),mask)`; its bright gap background uses `opticalColour(0)` and is **not** subject to the new `uViewContrast` absorption of darker driven content. `uAmbientLight=1.20` multiplies both. Thus increasing contrast can accentuate gap visibility without increasing effective scene readability. This is an engineering inference from our shader, **not** a claim that source BGB undriven gaps ought to be dark.

## Implementation milestones and acceptance gates

1. **Freeze reference inputs:** keep the above data-only manifest, record the exact upstream commit and source suite version. Label measured, literature bounded and art-direction parameters independently.
2. **Stand up an independent native 160×144 reference fixture**, not the full portrait game. Render the BGB optical shade steps, rectangle geometry, individual gap edges and reflector offset. Validate **linear-light** interpolation and area coverage analytically against upstream WS1/WS6 CPU outputs.
3. **Port the original electrical model**, including row-load and column crosstalk, frame latch, STN director and ionic retention and upstream feedback precision. Do not substitute a simplified glow/blur. Where mobile GPU extensions prevent a faithful port, mark as unsupported and document numeric error; **do not** silently substitute.
4. **Frame-driven validation:** compare static states, first/middle/last-row transition phases, darken/clear asymmetry, ionic tails and mixed-tone crosstalk against upstream test vectors at a fixed source frame cadence.
5. **Device validation:** capture fixed-scale comparison screenshots and numeric pixels on iPhone Safari; measure or characterize host brightness/gamma/colour independently. The KONKR correction is not portable.
6. **Then** make an opt-in presentation adapter for the original full-portrait NOMAD graphics. That adapter may use hybrid continuity, but must identify the difference from 160×144 physically addressed hardware.

**Release gate:** Do not mark an output *authentic DMG-equivalent* until the mechanisms and validation above are implemented and checked. Do not modify the live PWA, the game artwork, or the current STN model purely to improve aesthetic visibility before completing the reference comparison.

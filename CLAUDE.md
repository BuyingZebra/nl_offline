# nl_offline — notes for Claude Code

GitHub Pages site (`BuyingZebra/nl_offline`, served from `main`):

- **NOMAD Tetris**: `tetris/` (https://buyingzebra.github.io/nl_offline/tetris/). The shipped game. **Do not change it** unless the owner asks; ideas are proven in Vector LCD first.
- **Vector LCD**: `vector-lcd/` (https://buyingzebra.github.io/nl_offline/vector-lcd/). The technical demonstration and safe space for experiments. Almost all current work happens here.

`vector-lcd/README.md` is the detailed reference: every screen's physics, data sources, assumptions and file layout. Read the relevant section before changing a screen.

## Working with the owner

- Explain things plainly, without jargon. Analogies help. Avoid binary/"0s and 1s" framing unless it is genuinely useful.
- They have no display hardware to measure. Research (datasheets, restoration forums, Japanese and Chinese repair blogs, period press) stands in for measurement.
- **Accuracy over invention.** When a choice is "logical or accurate to the hardware of its time", pick accuracy: whichever option is closest to the real hardware is the answer. Decide by evidence (data, physics, photos and videos of real units), not by what earlier notes kept; the owner set this principle, not specific mechanisms. (Example: v0.32 keeps the solver's two resting states but lets the temporary one fade, because BGB and real DMG videos show no lasting ghost.) Label every assumed value as assumed, in the profile, the Info tab and the README. Never present an estimate as a measurement.
- Viewing-angle effects are an artistic option, not a requirement.
- Be honest when a proposed effect turns out to be negligible or wrong (for example, crosstalk streaking was not added; see below), and correct earlier claims.
- **Flag risks before shipping, not after.** Before a visible change goes live, tell the owner what it will look like at each setting (a table of predicted colours/behaviour) and which parts are physics, which measured, which fitted or assumed, and where it might disagree with the references. v0.32.0 went live with an unflagged colour fit that invented hues.
- They review on a phone and on a laptop (AMD Radeon). The Info tab's **Copy report** button produces the diagnostic report they paste back.

## The Vector LCD idea (the processor, not a renderer)

Modern, clean, high-resolution vector content (NOMAD Tetris style: no visible DMG cells, no pixel art) shown with the authentic look and behaviour of real screens, through physically based processing.

- Content is **designed beforehand** in the screen's own values (the DMG: four drive levels, greys 255/170/85/0 → levels 0/1/2/3). The processor takes it as given: **no interpretation, rounding or redrawing**. Off-palette SVGs (other greys, gradients, opacity, text, clips, dashes) are **refused** with a message, by design (`vector/svg.js`). The "Off-palette" content option is that refusal test.
- Behaviour and colour (voltage, crystal response, persistence, ion sticking, temperature) come from data and physics, not from effects.
- Authentic device controls (contrast wheel, LCD power, temperature) change the processing.
- Modular and robust for arbitrary content. Don't argue from Tetris having simple shapes.
- It must stay clean at any zoom, including pinch zoom (`visualViewport.scale` is honoured).
- Tetris content: one solid square tile per cell, each piece in one of the four levels (`content/scenes.js` `PIECE_LEVELS`).

## Defaults the owner chose

- Light: 19° from straight on, from 307°, source 15° (`app/controls.js`).
- Reflector-shadow switch: keep it (off = inspection only, labelled not physical).
- DMG glass: 1.1 mm (the thickest common small-STN glass; DMG value unpublished).
- DMG response: about 150 ms per change (era STN figures), via `temperature.response_scale` 0.52 (0.64 before v0.32's finer tables).

## DMG-01 state of play (v0.34.0)

The physics comes from Retro Display Lab (Apache-2.0, JohnnySun), checked out at `../rdl` in the old session. Clone https://github.com/JohnnySun/retro-display-lab if you need it. Copied values are in `profiles/dmg-01-stn.json`. The attribution and NOTICE are in `third_party/retro-display-lab/`.

- Two screens share the physics: **DMG-01** (`screens/dmg/`, a picture input on a fine dot panel) and **DMG vector** (`screens/dmgv/`, SVG shapes drawn on the GPU at up to 4×4 points per pixel; every point keeps its own 16-bit crystal state; one ion charge per pixel).
- Contrast wheel ×0.85–×1.08, re-solved every 0.01 by `tools/dmg01_wheel.mjs` (about 9 minutes; run after `tools/dmg01_profile.mjs`, with the rdl path as argument). Extreme-state trajectories prevent the old stuck-pixel trap.
- Colours (v0.32.1): BGB's five measured colours, chosen by the solver's luminance of each crystal state (lighter than white → toward the LCD-disabled colour, clamped; darker than black → black dimmed). `stn.color` (1025 bins), `stn.color_basis`. v0.32.0 used the solver's hue via a 3×3 fit to BGB: it invented lime (×0.90–0.95) and navy/purple (above ×1.03); the owner's screenshots vs real-DMG photos showed it, so it was withdrawn. Read https://bgb.bircd.org/reality/ (ColorChecker-corrected, true brightness; lens not stated). The old "lighter than white → unpowered colour" orange ghost is also gone.
- Two resting states (v0.32): below ×1.00 some shades rest relaxed or part-switched; the solver's free energy picks the stable one (`stn.target_q`), the other is temporary (`stn.meta_q`) and fades per point, τ = 0.3 s assumed (0.1–1 s, US 6,867,836), via a hash shared by GPU and model (`settleTemporary`, `decayDraw`). At ×0.85 everything settles to the unpowered colour (BGB's description; owner's videos show no lasting ghost). The coordinate runs through 116 solved rests (0 = unpowered rest).
- Tables are 257 bins (source: 65) so the closely spaced shades resolve; `temperature.response_scale` re-tuned to 0.52 for 150 ms in shown brightness.
- Two-pass reflective optics (each pass carries the square root of the colour), the reflector shadow from refraction through the rear glass, and the screen lens (1.0 mm acrylic, 1.0 mm air gap assumed, frame printed underneath; glare from three surfaces, about 11% straight on).
- Reflector grain (v0.33): value noise fixed to the panel, 0.118 mm lattice, peak ±3.9% (Brick Boy developer's photo measurement; ± read as peak, assumed), at the reflector point (halfway entry/exit), faded where a pixel is wider than a grain (`reflectorGrain`, `GRAIN`; `setGrain(false)` in flat-colour checks).
- Lens condition (v0.34): Surroundings switch 'In the box' (default, no scratches) / 'Used' (`optics/scratches.js`): seeded vector scratches on the lens front (swirl arcs 2–5 µm, pocket lines 8–30 µm; sizes from published plastic-scratch measurements, counts assumed), circular-groove facets glint via the glare's lamp model, pixel coverage keeps them clean at any zoom, parallax from lens height. `setCondition`, `dmgScratches` GPU check.
- Info tab figures (v0.33): `screens/dmg/figures.js` draws measured colours, dots and gaps (idealised), the wheel grid, the layer stack and a shade-change curve from the profile and model; `app/info.js` renders `definition.figures`.
- Research (v0.33): `reports/DMG01 screen physical data.md` and `research_notes/` hold every sourced value and reliability; labels corrected from it (wheel range rough, −18 V nominal, panel probably Sharp, drivers LH5076/LH5077 per Nintendo's patent US 5,184,830, lens 1.0 mm upper estimate, "high-impact plastic").
- LCD power switch: relaxes to the unpowered colour. Time constants are derived from the source's clearing/darkening times (assumed).
- **Not added, deliberately:** passive-matrix crosstalk (the source's own model gives about 0.01 shade on a healthy panel, which is invisible), the 160×144 grid, and row-latch timing.

## Open items (agreed or suggested, not done)

1. Owner reviewed v0.30 on a phone: performance fine (60 fps); the low wheel's orange ghost was wrong (fixed in v0.32); real DMG video frames show a clipped white lens hotspot like ours. v0.32.0 reviewed: lime and navy were wrong (fixed in v0.32.1). To review: v0.32.1 across the wheel.
2. Laptop performance. Done in v0.31: shapes are triangulated once and kept on the GPU (`vector/draw.js`), and the shadow blur visits only its 3-sigma taps (it used to loop 97 times). Not done, deliberately: half-resolution shadow blur (the blur is about 0.1 mm, only 1 to 2 screen pixels at laptop size, so half resolution would soften the shadow). Still to watch: GPU memory of per-point states, and one draw call per shape (Tetris draws about 200).
3. Merge the DMG-01 picture screen onto the DMG vector processor once DMG vector is accepted.
4. Ion charge per point instead of per pixel (the last averaging shortcut; effect invisible in practice).
5. Unknowns that a real DMG with calipers would settle: lens air gap, glass thickness. Also unknown: how BGB photographed the palette (through the lens?).
6. **8 old Tetris tests fail** (`tests/display.test.mjs` and others: CRT composition, modal repaint regions, the v195–v198 lighting lab). The GitHub quality gate (`.github/workflows/test-tetris.yml`) has been red since about Tetris v0.19, unrelated to Vector LCD. Ask the owner whether to fix or retire them; don't touch Tetris without asking.

## Testing

```
node --test tests/vector-lcd.test.mjs          # physics, profiles vs datasheets, structure, packaging (112 tests)
python3 tests/test_vector_lcd_browser.py       # real browser: every screen, GPU = JS model (tests/vector-lcd-gpu.mjs), report button
node --test tests/*.test.mjs                   # everything, Tetris included (8 known Tetris failures, see above)
```

- The browser test needs Playwright with Chromium. Software rendering is slow, so frame times in its output are not meaningful.
- Every shader has a JS twin in the screen's `model.js`. GPU checks compare them, so change both together.
- When you add a physical effect, add a test that ties it to its source value.

## Releasing Vector LCD

1. Bump the version in **all three** places: `vector-lcd/sw.js` (`VERSION`), `vector-lcd/app/main.js` (`APP_VERSION`), and the `vector-lcd-version` meta in `vector-lcd/index.html`. Bump a renderer's own `VERSION` in its `renderer.js` when it changes.
2. Add any new file to the `ASSETS` list in `vector-lcd/sw.js` (offline package; a test checks this).
3. Run both Vector LCD test commands.
4. Work on a branch (the last one was `feature/dmg-fine-panel`), push, then fast-forward `main` (`git merge-base --is-ancestor origin/main HEAD` first). Pages deploys from `main`. Commit only when the owner asks or has approved the change.
5. Update `vector-lcd/README.md` and the screen's Info facts (`screens/<kind>/definition.js`) with any new value and its source.

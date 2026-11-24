# nl_offline — notes for Claude Code

GitHub Pages site (`BuyingZebra/nl_offline`, served from `main`):

- **NOMAD Tetris**: `tetris/` (https://buyingzebra.github.io/nl_offline/tetris/). The shipped game. **Do not change it** unless the owner asks; ideas are proven in Vector LCD first.
- **Vector LCD**: `vector-lcd/` (https://buyingzebra.github.io/nl_offline/vector-lcd/). The technical demonstration and safe space for experiments. Almost all current work happens here.

`vector-lcd/README.md` is the detailed reference: every screen's physics, data sources, assumptions and file layout. Read the relevant section before changing a screen.

## Working with the owner

- Explain things plainly, without jargon. Analogies help. Avoid binary/"0s and 1s" framing unless it is genuinely useful.
- They have no display hardware to measure. Research (datasheets, restoration forums, Japanese and Chinese repair blogs, period press) stands in for measurement.
- **Accuracy over invention.** When a choice is "logical or accurate to the hardware of its time", pick accuracy. For example, the DMG contrast wheel keeps its physical two-state (hysteresis) behaviour. Label every assumed value as assumed, in the profile, the Info tab and the README. Never present an estimate as a measurement.
- Viewing-angle effects are an artistic option, not a requirement.
- Be honest when a proposed effect turns out to be negligible or wrong (for example, crosstalk streaking was not added; see below), and correct earlier claims.
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
- DMG response: about 150 ms per change (era STN figures), via `temperature.response_scale` 0.64.

## DMG-01 state of play (v0.30.0)

The physics comes from Retro Display Lab (Apache-2.0, JohnnySun), checked out at `../rdl` in the old session. Clone https://github.com/JohnnySun/retro-display-lab if you need it. Copied values are in `profiles/dmg-01-stn.json`. The attribution and NOTICE are in `third_party/retro-display-lab/`.

- Two screens share the physics: **DMG-01** (`screens/dmg/`, a picture input on a fine dot panel) and **DMG vector** (`screens/dmgv/`, SVG shapes drawn on the GPU at up to 4×4 points per pixel; every point keeps its own 16-bit crystal state; one ion charge per pixel).
- Contrast wheel ×0.85–×1.08, re-solved every 0.01 by `tools/dmg01_wheel.mjs` (about 9 minutes; run after `tools/dmg01_profile.mjs`, with the rdl path as argument). Extreme-state trajectories prevent the old stuck-pixel trap.
- Colours: BGB's five measured states (unpowered #948a04 at state 0, then the four shades). Lighter than white blends toward unpowered; darker than black scales by the solver's luminance.
- Two-pass reflective optics (each pass carries the square root of the colour), the reflector shadow from refraction through the rear glass, and the screen lens (1.0 mm acrylic, 1.0 mm air gap assumed, frame printed underneath; glare from three surfaces, about 11% straight on).
- LCD power switch: relaxes to the unpowered colour. Time constants are derived from the source's clearing/darkening times (assumed).
- **Not added, deliberately:** passive-matrix crosstalk (the source's own model gives about 0.01 shade on a healthy panel, which is invisible), the 160×144 grid, and row-latch timing.

## Open items (agreed or suggested, not done)

1. Owner to review v0.30 on a phone: is the lens glare too strong at the default light? Does the low wheel look right?
2. Laptop performance: cache vector shape triangulation on the GPU (about 6 ms/frame rebuilding shapes now), half-resolution shadow blur (about 2 ms), and watch the GPU memory of per-point states.
3. Merge the DMG-01 picture screen onto the DMG vector processor once DMG vector is accepted.
4. Ion charge per point instead of per pixel (the last averaging shortcut; effect invisible in practice).
5. Unknowns that a real DMG with calipers would settle: lens air gap, glass thickness. Also unknown: how BGB photographed the palette (through the lens?).
6. **8 old Tetris tests fail** (`tests/display.test.mjs` and others: CRT composition, modal repaint regions, the v195–v198 lighting lab). The GitHub quality gate (`.github/workflows/test-tetris.yml`) has been red since about Tetris v0.19, unrelated to Vector LCD. Ask the owner whether to fix or retire them; don't touch Tetris without asking.

## Testing

```
node --test tests/vector-lcd.test.mjs          # physics, profiles vs datasheets, structure, packaging (106 tests)
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

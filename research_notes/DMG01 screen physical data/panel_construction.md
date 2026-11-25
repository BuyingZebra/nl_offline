# DMG-01 (1989) LCD module and screen lens: physical construction

Research conditions (read first): in this session web *fetching* was blocked for every site tried
(gameboy.github.io, hackaday.com, handheldlegend.com, chipmusic.org, ifixit.com, zedlabz.com,
embedded-ideas.de, gameboymuseum.com all failed DNS resolution outside the session's allowed network).
Findings below therefore come from (a) search-engine result snippets, which can be taken out of context,
and (b) the Retro Display Lab repository (cloned from GitHub, Apache-2.0), whose `REFERENCES.md` and data
files cite primary sources. Japanese and Chinese searches were run but returned nothing DMG-specific.
Reliability labels used: **measured**, **datasheet/manufacturer**, **informed estimate**, **anecdote**, **derived** (arithmetic from cited values).

## 1. Maker, part number, datasheets, patents

### Takeaway
No LCD-panel part number or datasheet for the DMG glass was found. The LCD *board* is Nintendo's DMG-LCD-01 (early) / DMG-LCD-06 (later, reverse-engineered), carrying Sharp LH5076 (row) and LH5077 (column) driver chips; Sharp is the documented display supplier in Nintendo history accounts, but the glass maker is not proven by a primary document.

### Cited Findings
- LCD board revision DMG-LCD-06 uses a Sharp LH5076 row driver and Sharp LH5077 column driver, per gekkio's reverse-engineered schematic (datasheet-level connectivity, not a panel spec; reliability: measured connectivity) — [gekkio, DMG-LCD-06 schematic](https://github.com/Gekkio/gb-schematics/blob/main/DMG-LCD-06/schematic/DMG-LCD-06.pdf), as recorded in [Retro Display Lab REFERENCES.md, DMG-DRIVE-01](https://github.com/JohnnySun/retro-display-lab)
- No LH5076/LH5077 analogue datasheet has been recovered; DMG-LCD-01 equivalence to DMG-LCD-06 is not established — [Retro Display Lab, data/passive-matrix-crosstalk-evidence-v1.json and REFERENCES.md](https://github.com/JohnnySun/retro-display-lab)
- History: Sharp first proposed a TN display; Yamauchi rejected it as too hard to see; Sharp then proposed STN (better viewing angle and contrast, higher cost). Nintendo R&D1 researched screens from supplier Sharp (anecdote/secondary history) — [Wikipedia, Game Boy](https://en.wikipedia.org/wiki/Game_Boy)
- Display described as a 2.5-inch reflective STN monochrome LCD; another source gives 2.6 inch (sources disagree on diagonal) — [Wikipedia, Game Boy](https://en.wikipedia.org/wiki/Game_Boy); [Fandom, Game Boy](https://list.fandom.com/wiki/Game_Boy)
- Nintendo confirms an STN dot-matrix LCD, 47 x 43 mm, 160 x 144 (manufacturer) — [Nintendo technical data (FR)](https://www.nintendo.com/fr-fr/Assistance/Consoles-plus-anciennes/Donnees-techniques-619585.html), cited as DMG-DIMENSIONS-01 in Retro Display Lab
- iFixit teardown lists Sharp parts on the main board (LR35902 CPU, IR3R40 amplifier) but does not identify the screen (search snippet) — [iFixit Game Boy Teardown](https://www.ifixit.com/Teardown/Game+Boy+Teardown/122657)
- Candidate Nintendo 1989 filings found by title only: JPH02191484A (hand-held electronic game machine, filed 20 Apr 1989) and JPH0277285A (portable liquid-crystal game device, filed 25 May 1989); text not read, so no LCD parameters are claimed from them — Google Patents (search snippet, no fetch possible)

### Inferences
- "Sharp made the panel" is plausible (Sharp drivers on the LCD board, Sharp named as supplier in history accounts) but remains an informed estimate, not a documented fact.

### Gaps
- No Sharp panel part number, panel datasheet, or Nintendo service manual describing the LCD stack was found.
- The two 1989 Nintendo patents and Sharp Technical Journal (シャープ技報) STN articles could not be read (fetch blocked); worth reading on J-PlatPat/Google Patents.

## 2. Panel type: twist, mode, cell gap, mixture, pretilt, polarizers

### Takeaway
STN is confirmed by Nintendo; everything finer (twist, cell gap, Δn·d, pretilt, polarizer angles, mixture) is unpublished for the DMG. The values in use (260° twist, 6 µm, 20° pretilt, polarizers 75°/90°) are Retro Display Lab's period-bounded reconstructions, fitted to BGB colours, not measurements.

### Cited Findings
- STN twist range generally 180–270° — [Wikipedia, STN display](https://en.wikipedia.org/wiki/STN_display)
- DMG = STN; Pocket and Light = FSTN (secondary) — [Wikipedia, Game Boy](https://en.wikipedia.org/wiki/Game_Boy)
- Reconstruction values (informed estimate, labelled by the source as not DMG measurements): twist 260° ("inside the sub-270° commercial-production region described in 1986"), thickness/pitch 0.7, pretilt 20°, anchoring 2e-4 J/m², front polarizer 75° from entrance director, rear 90° from exit director ("BGB-constrained normal-incidence fit ... not DMG polarizer measurements"), reflector amplitude 0.92 — [Retro Display Lab, data/stn-material-ensemble-v1.json](https://github.com/JohnnySun/retro-display-lab)
- Cell gap ensemble: 4 µm (fast bound, Δn 0.238), 6 µm nominal (Δn 0.158, Δn·d 0.95 µm "from 1988 STN measurements"), 7 µm slow bound (Δn 0.136); material constants from published ZLI-2293 (K11 12.5, K22 7.2, K33 17.9 pN, Δε 10, γ1 0.162 Pa·s nominal) as a proxy mixture — same file; ZLI-2293 constants from [Lee, Ge, Wu, APL 90, 201108 (2007)](https://lcd.creol.ucf.edu/people/zge/Papers/APL%20Lee%20VA.pdf)
- 1986 basis for reflective SBE/STN optics, sub-270° production boundary, high-pretilt cells, yellow-mode behaviour — [Scheffer, Japan Display '86, J-STAGE](https://www.jstage.jst.go.jp/article/tvtr/10/21/10_KJ00001966449/_pdf)
- Polarizer type: linear film is used by DMG and Pocket (colour models use circular) (retailer statement) — [Hand Held Legend, Polarization Film](https://handheldlegend.com/products/polarization-film)
- A buyer review calls a replacement film "a great polarizer for DMG – it's green" (anecdote) — same listing
- Forum: with the polarizer in the normal position the screen has a green tint; rotated 90° ("inverted") it goes blue, or toward pink on a DMG; early LCDs used the green position because it works better in ambient light (anecdote) — [chipmusic.org forum post 65502](https://chipmusic.org/forums/post/65502/)

### Inferences
- The green/yellow-green appearance plus the 1986 literature point to a yellow-mode STN (polarizers set so the off state is yellow-green and the on state is dark blue-grey); the green-vs-blue swap on 90° polarizer rotation reported by modders is consistent with that. This is an inference; no DMG-specific source names the mode.
- A 90° rotation of the front polarizer swapping green ↔ blue/pink is a useful qualitative check for any simulated polarizer angles.

### Gaps
- No measured DMG twist angle, cell gap, pretilt, LC mixture or polarizer absorption-axis angles were found in English, Japanese or Chinese sources.
- No polarizer-replacement guide giving the original film's axis angle relative to the screen edge was reachable.

## 3. Physical stack: glass, polarizers, reflector, module thickness

### Takeaway
Structure is the standard reflective "layer cake": front polarizer / front glass / LC / rear glass / rear polarizer / reflector. No measured thicknesses for the DMG were found; 1.1 mm glass and 0.18 mm rear polarizer in the project profile are assumptions.

### Cited Findings
- A reflective LCD is "a layer cake made up of polarizers, two panes of glass, and a reflector" (Hackaday, sunburned-screen repair; search snippet) — [Hackaday 2018-01-26](https://hackaday.com/2018/01/26/repairing-a-sunburned-game-boy-screen)
- Same repair: a colour-filter film between the layers was found to be what gives the green tint; removing it raised contrast (anecdote from snippet; which layer exactly is unclear) — same
- Burned front polarizers must be removed carefully because the thin LCD glass cracks easily (anecdote) — search snippet about DMG polarizer replacement ([eBay listing 196202389189](https://www.ebay.com/itm/196202389189) / Hackaday)
- Replacement front polarizers: some have no adhesive; modders debate air-gapping vs adhering; "air gapping is the preferred method" (anecdote) — [eBay listing 196202389189](https://www.ebay.com/itm/196202389189)
- Only thickness figure found for a Game Boy film: a transflective self-adhesive polarizer at 0.28 mm, sold for the Game Boy Light, not DMG (retailer) — [ZedLabz transflective film](https://www.zedlabz.com/products/transflective-polarising-film-for-game-boy-light-self-adhesive-polarizer-polarizing-70-x-67mm-2-pack-3dlens)
- Chinese GBP repair column: when the polarizing layer is damaged one removes "all polarizing films and the transflective layer" and redoes them (Pocket, not DMG; anecdote) — [gcores article 145839](https://www.gcores.com/articles/145839)
- Project profile (assumed): glass 1.1 mm (thickest common small-STN option among 0.4/0.55/0.7/1.1 mm), n_glass 1.5, rear polarizer 0.18 mm, n 1.5 — `vector-lcd/profiles/dmg-01-stn.json` (`sources.geometry`), labelled "DMG glass thickness not published"

### Inferences
- The DMG has no backlight, so its rear element is a reflector (not transflective as in GB Light); whether it is a diffuse aluminium film laminated to the rear polarizer (the usual 1980s construction) is not confirmed by any source found.

### Gaps
- No caliper measurements of DMG glass, front/rear polarizer, reflector, or total module thickness were found.
- Reflector type (diffuse Al vs silver) and lamination unconfirmed.

## 4. Screen lens/window

### Takeaway
The original lens is a thin clear plastic window with printed frame; acrylic is claimed by sellers only. No measured thickness or air gap for an original lens was found; the 1.0 mm thickness and 1.0 mm gap in the profile remain assumptions.

### Cited Findings
- Hand Held Legend's (now discontinued) DMG plastic screen lens listed as 1.0 mm thick, self-adhesive (retailer; reproduction part, not original) — [Hand Held Legend, Game Boy DMG Plastic Screen Lens](https://handheldlegend.com/products/game-boy-dmg-cover-screen)
- A seller guide says the original DMG lens is injection-moulded acrylic (unverified secondary claim) — [AliExpress wiki article](https://www.aliexpress.com/s/wiki-ssr/article/gameboy-original-screen-replacement)
- Glass reproduction lenses are sold as alternatives to "original and replacement plastic types" (retailer) — [ZedLabz glass lens](https://zedlabz.com/en-ax/collections/retro-nintendo-game-boy-series/products/glass-screen-lens-for-game-boy-dmg-01-zero-projects-gbz-cover-replacement-black-zedlabz)
- A measured DMG window of 47.6 x 43.8 mm (±0.5 mm) was reported in a search summary, consistent with the 47 x 43 mm active area (source page not identified with certainty; treat as anecdote) — search result set incl. [Gametrog specs](https://gametrog.com/nintendo-game-boy-information-specs/)
- Project profile (assumed): lens n 1.49 (PMMA), 1.0 mm thick, 1.0 mm air gap, frame printed on underside — `vector-lcd/profiles/dmg-01-stn.json` (`lens`)

### Inferences
- Printing on the underside is standard for such windows (protects the print from wear) and matches how reproductions are made, but no original-part source confirmed the side.

### Gaps
- Original lens material (PMMA vs PC), thickness, coatings and air gap to the LCD: no primary or measured source found.

## 5. Dot geometry

### Takeaway
160 x 144 dots on 47 x 43 mm (manufacturer) gives a pitch of about 0.29 x 0.30 mm (derived). The only gap figure is BGB's idealised close-up (aperture 70 of 80 units, fill 0.875), giving a gap of roughly 37 µm (derived, not measured).

### Cited Findings
- Active area 47 x 43 mm, 160 x 144 dots (manufacturer) — [Nintendo technical data](https://www.nintendo.com/fr-fr/Assistance/Consoles-plus-anciennes/Donnees-techniques-619585.html)
- BGB's DMG LCD close-up is an idealised drawing with a 70/80 one-axis aperture (PixelFill 0.875), a separate inter-pixel background in the LCD-disabled colour and a reflector-shadow offset (reference image, not a micrograph) — [BGB DMG LCD close-up](https://bgb.bircd.org/reality/dmglcd-closeup.png), [BGB reality page](https://bgb.bircd.org/reality/), via Retro Display Lab DMG-APERTURE-01
- Gaps are the undriven areas: BGB states the lightest shade equals the LCD-disabled colour, so the gaps show that colour whether the LCD is on or off — [BGB reality page](https://bgb.bircd.org/reality/)

### Inferences
- Derived: pitch 47/160 = 0.294 mm, 43/144 = 0.299 mm; gap ≈ 0.125 x 0.294 ≈ 0.037 mm per axis; aperture area 0.875² ≈ 0.766 of a cell (Retro Display Lab's 0.765625).

### Gaps
- No macro/microscope photograph with a scale was found to measure the real gap width; aftermarket "pixel grid" options are rendering effects, not evidence.

## Summary table (for the simulation)

| Quantity | Value | Reliability | Source |
|---|---|---|---|
| Panel type | reflective STN, monochrome | manufacturer | Nintendo tech data |
| Active area / dots | 47 x 43 mm, 160 x 144 | manufacturer | Nintendo tech data |
| Dot pitch | 0.294 x 0.299 mm | derived | from above |
| Dot fill / gap | 0.875 / ~37 µm | derived from idealised drawing | BGB close-up |
| Drivers | Sharp LH5076 row, LH5077 column (DMG-LCD-06) | measured connectivity | gekkio schematic |
| Panel maker | Sharp (probable) | anecdote/secondary | Wikipedia history |
| Twist | 260° | informed estimate (fit) | Retro Display Lab |
| Cell gap | 6 µm (4–7) | informed estimate | Retro Display Lab, 1988 STN data |
| Pretilt | 20° | informed estimate | Retro Display Lab |
| Polarizer angles | 75° front, 90° rear (vs director) | fit to BGB colours | Retro Display Lab |
| Polarizer type | linear, green-position | anecdote/retailer | HHL, chipmusic |
| Glass | 1.1 mm each | assumed | project profile |
| Rear polarizer | 0.18 mm | assumed | project profile |
| Lens | 1.0 mm, PMMA n 1.49, 1.0 mm gap | assumed (1.0 mm from reproduction listing) | HHL listing, profile |

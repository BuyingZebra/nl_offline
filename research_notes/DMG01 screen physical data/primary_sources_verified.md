# DMG-01 screen: primary sources read in full (second round)

Research date 2026-11-25. In this round the pages themselves were downloaded with curl and read in full, instead of relying on search-engine excerpts. Read in full: BGB reality, Pan Docs (LCDC, Rendering, STAT), both chipmusic.org pages of topic 15931, gbdev forum topics 55 and pid 967, the NESdev archive of topic 12568, daid's dmg-lcd-damage README, both of Thomas Spurden's LCD-capture posts, and the Hackaday sunburn article with its comments. BGB's palette and illustration PNGs were downloaded and their pixel values read with PIL. Reddit (old.reddit.com, www.reddit.com, api.reddit.com) returned a "Blocked" page or a verification page, so no Reddit thread could be read. forums.nesdev.org returned a Cloudflare JavaScript challenge, so the NESdev thread was read from its 2019 archive (nesdev.nes.science). Labels used: **measured** (someone took a reading or photograph), **anecdote** (an observation without a number or method), **documentation** (a spec or reference text), and **emulator design** (a choice made in software).

## 1. BGB "reality": measurement method, lens, contrast wheel, MGB, frame blend

### Takeaway
BGB describes its method precisely: colour-accurate lighting, ColorChecker correction to true colour and brightness, a 1/60 s defocused photo, reflections avoided, and several photos averaged. It does **not** say whether the photos were taken through the lens, which unit was used, or where the contrast wheel was set. The frame-blend and contrast-wheel sections are described only in words, with no published numbers. One of BGB's own illustration images shows its simulated wheel going to deep navy at the top end. That is BGB's own extrapolation, not a measurement.

### Cited Findings
- Exact wording on the palette: "It has the 4 shades and LCD disabled color, sampled accurately from a real gameboy." — [BGB reality](https://bgb.bircd.org/reality/index.html)
- Exact wording on the method (measured): "For all photos and color measurements for this project, the gameboys are illuminated by highly color accurate light, and photos are corrected, using a colorchecker, to true colors and brightness in sRGB gamma 2.2 space." and "To sample LCD colors, a photo is taken at 1/60th second shutter speed (so one frame is sampled, to average out scanning) and enough out of focus that a color patch blends to its average color without visible pixels." and "With care, avoiding reflections, and averaging from multiple photos, The following colorscheme (with LCD disabled color) was derived" — [BGB reality](https://bgb.bircd.org/reality/index.html)
- The ColorChecker photo on the page is captioned "(picture is for illustration only and not used in measurements)". — [BGB reality](https://bgb.bircd.org/reality/index.html)
- **Lens, unit and wheel position: not stated.** The full page never uses the words "lens" (except for the GBC border: "GBC border (lens made lighter)"), "screen cover", "serial", or a contrast-wheel position for the palette photos. The word "gameboys" is plural in the method sentence, and no number of units is given. — [BGB reality](https://bgb.bircd.org/reality/index.html) (whole-page text search)
- Pixel values read from the palette image `dmg-reality-colorscheme.png`, in the page's order: LCD disabled **#948A04**, then shades 0–3 **#759833, #588F51, #3B7560, #2E615A** (each a flat patch about 50 px wide). — [dmg-reality-colorscheme.png](https://bgb.bircd.org/reality/dmg-reality-colorscheme.png)
- The MGB comparison exists only as a palette image, with no commentary: "For BGB 1.6.3, the gameboy pocket (MGB) colors were also sampled". Pixel values: LCD disabled **#C2CFA8**, shades **#ADBF92, #96A67C, #727E64, #5A635C**. — [BGB reality](https://bgb.bircd.org/reality/index.html); [mgb-reality-colorscheme.png](https://bgb.bircd.org/reality/mgb-reality-colorscheme.png)
- MGB response (anecdote, no number): "The 'MGB reality' frame blend simulates the response of the gameboy pocket LCD, which is a bit faster than the DMG LCD." — [BGB reality](https://bgb.bircd.org/reality/index.html)
- Exact frame-blend wording: "The DMG reality frame blend accurately simulates the motion blur of the original gameboy (DMG) LCD based on research/test roms." **No time constants, rise/fall times or blend coefficients are published.** The only tuning described is an ini setting: "DmgLcdBlendReduceBlur, default 0, can be set to 1 to make the blur faster, for example to compensate for a slow LCD monitor. on fast (gaming or IPS with overdrive) LCD monitors the default is correct." — [BGB reality](https://bgb.bircd.org/reality/index.html)
- How the frame blend works (emulator design): "The 5 configured GB LCD colors (top left, 4 + the LCD disabled color) are turned into a smooth gradient ... analogous to the continuous range of shades of an LCD pixel. Then these shades are used for blending, so for example an in between shade made by flickering will look correctly as on the real LCD." — [BGB reality](https://bgb.bircd.org/reality/index.html)
- Pixel values read from `dmgblend-shades.png`: the gradient runs #948A04 → #888F21 → #7C952D → #6F963A → #649247 → #578E51 → #4D8457 → #41795D → #38705F → #32685C → #2E615A. BGB places the LCD-disabled colour at the light end, *beyond* shade 0. The middle of a lightest/darkest flicker is **#4A8259** taken from the gradient, compared with **#588047** for a naive average. — [dmgblend-shades.png](https://bgb.bircd.org/reality/dmgblend-shades.png)
- Exact contrast-wheel wording (emulator design, said to match reality): "As in reality, the lightest shade is the 'LCD disabled' color, and darkest shade if the contrast is darker than normal, is darker than the darkest shade with normal contrast." No numbers and no wheel range are given. — [BGB reality](https://bgb.bircd.org/reality/index.html)
- Pixel values read from `contrastwheel.png`, which shows five screenshots from low to high wheel through BGB's dot-matrix filter. The most common pixel colours in each:
  - lowest: #6F9B37, #7F952D, #869124, #8E8D1B (everything near the LCD-disabled yellow)
  - second: #489355, #6D9044, #639B41, #799534
  - middle (normal): #006D6D, #457957, #35915C, #699C3A
  - fourth: #005767, #346E53, #007968, #528054
  - highest: #00564B and **#00005E (deep navy)**, plus #536D3D, so the whole screen reads as dark blue

  This is BGB's own simulated wheel, not a photo. — [contrastwheel.png](https://bgb.bircd.org/reality/contrastwheel.png)
- Close-up drawing (idealised, explicitly not measured): "I don't have a way to actually zoom in like this and found nothing on internet (except for a gameboy pocket) so i don't know how wide the edges actually are. Because the edge is yellow, and the average color is a certain green, the pixel square is more bluish. Also the pixels cast a shadow on the background, this is not simulated." Pixel values read from the image: the gap is #948A04, 10 px wide; each dot square is 70 px; the dot squares are #699C3A, #35915C, #006D6D and #004F66, all bluer than the palette averages. — [BGB reality](https://bgb.bircd.org/reality/index.html); [dmglcd-closeup.png](https://bgb.bircd.org/reality/dmglcd-closeup.png)
- The dot-matrix filter keeps each pixel's average: "The average color of a pixel in the output (square + edge) is the color of that pixel in the input." The default edge width is configurable (DotMatrixIntensity, e.g. "0.1 makes the edge 10% of the total width"). — [BGB reality](https://bgb.bircd.org/reality/index.html)

### Inferences
- The BGB shade colours are dot-plus-gap averages, because the photos were defocused. BGB's own close-up implies that the colour of a pure dot is bluer than its palette entry. This matters for the project: a renderer that draws dots and gaps separately should draw dots bluer than BGB's palette, so that the area average matches.
- The contrast-wheel sentence "the lightest shade is the 'LCD disabled' color" is ambiguous. At normal contrast, BGB's own palette has shade 0 (#759833) different from LCD-disabled (#948A04), so the sentence most likely means "the light end of the range is the LCD-disabled colour" (the gradient end), or "at low contrast, shade 0 becomes the LCD-disabled colour". This reading is consistent with the lowest wheel screenshot.
- **Risk flag for the owner.** BGB's simulated wheel at its maximum goes to deep navy (#00005E). The project withdrew navy above ×1.03 in v0.32.1 because of the owner's real-DMG photos. BGB's screenshot is BGB's extrapolation, not evidence of real colour, so it does not overturn that decision. Still, the project's notes describe BGB's colours as "measured", and the owner should know that only the five palette patches are measured. BGB's wheel extremes are a design choice.
- "Through the lens" remains unknown. "Avoiding reflections" suggests the photographer dealt with a glossy surface, which the lens has, but the LCD's front polarizer is also glossy. This cannot be settled from the page.

### Gaps
- BGB's method gives no unit count or serial, no contrast-wheel position, no lens on/off, no light angle, and no illuminance.
- Frame-blend coefficients and the test ROMs are unpublished. Only "MGB is a bit faster" is given.
- No archived older version could be fetched to check for page changes (web.archive.org timed out or failed in this session).

## 2. Pan Docs: LCD disabled colour, first frame, the turn-off warning, physical response

### Takeaway
Pan Docs confirms the wording "whiter than color #0", that the first frame after re-enabling stays blank, and the black-line warning. The older "may damage the hardware" claim has since been backed by a 2021 chat log about a crash. Pan Docs says nothing about the LCD's optical response time.

### Cited Findings
- Exact LCDC.7 caution (documentation): "Stopping LCD operation (Bit 7 from 1 to 0) may be performed during VBlank ONLY, disabling the display outside of the VBlank period may damage the hardware by burning in a black horizontal line similar to that which appears when the GB is turned off. This appears to be a serious issue. Nintendo is reported to reject any games not following this rule." — [Pan Docs LCDC](https://gbdev.io/pandocs/LCDC.html)
- Exact wording on the disabled screen: "When the display is disabled the screen is blank, which on DMG is displayed as a white “whiter” than color #0." and "On SGB, the screen doesn’t turn white, it appears that the previous picture sticks to the screen. (TODO: research this more.)" — [Pan Docs LCDC](https://gbdev.io/pandocs/LCDC.html)
- First frame after enabling: "When re-enabling the LCD, the PPU will immediately start drawing again, but the screen will stay blank during the first frame." — [Pan Docs LCDC](https://gbdev.io/pandocs/LCDC.html)
- With LCDC.0 cleared, "both background and window become blank (white)". This is colour 0 in the data, not the LCD-off state. — [Pan Docs LCDC](https://gbdev.io/pandocs/LCDC.html)
- Timing (documentation): 154 lines of 456 dots, "@ 59.7 fps"; STAT reports mode 0 when the PPU is disabled. — [Pan Docs Rendering](https://gbdev.io/pandocs/Rendering.html); [Pan Docs STAT](https://gbdev.io/pandocs/STAT.html)
- Nintendo's own manual, as quoted on the gbdev forum: "2.1.1 Setting the LCDC to OFF (Recommended) Covers: DMG and CGB. In early DMGs, a black horizontal line appears on the screen if the LCDC is stopped (LCDC register bit 7 <- 0) at any time other than during vertical blanking. Therefore, the LCDC should be set to OFF during V-blanking. If the occurrence of V-blanking cannot be confirmed, the LCDC should be set to OFF when the value of the LY register is 145 (0x91) or greater. These restrictions do not apply in CGB." — Game Boy Programming Manual v1.0 (1999), quoted in [gbdev forum pid 967](https://gbdev.gg8.se/forums/viewtopic.php?pid=967)
- The older Pan Docs wording that was quoted there: "...disabeling the display outside of the V-Blank period may damage the hardware. This appears to be a serious issue..." (without "burning in a black horizontal line"). — [gbdev forum pid 967](https://gbdev.gg8.se/forums/viewtopic.php?pid=967)

### Inferences
- "Whiter than color #0" matches BGB's separate LCD-disabled colour (#948A04, yellower and lighter than shade 0 #759833).
- Pan Docs is the documentation side only. Its damage claim now rests on daid's archived chat (section 4).

### Gaps
- Pan Docs gives no optical response time, no fade time for the LCD-off transition, and no description of the colour beyond "whiter".

## 3. Contrast voltage threads (chipmusic.org 2015, gbdev 2009)

### Takeaway
The -11 V/-14 V figures were measured "at the contrast wheel" (pin and ground point not stated), with an analog meter, on a **faulty** DMG, in the 2015 "stuck on max contrast" thread. A helper reported about -13 V "for good contrast" on his own unit. The supply is described as about -19 V, and -18 V was read. The 30 kΩ pot reads about 17 kΩ: the gbdev administrator explained this as something wired in parallel, but the original poster then says the pots were already desoldered when he measured them.

### Cited Findings
- The thread was started (Jan 17 2015) by "powersupply" about a DMG whose screen showed only one image and whose wheel "barely does anything". He later found the problem was "only with the front PCB" (swap test). — [chipmusic.org topic 15931, post 1](https://chipmusic.org/forums/topic/15931/dmg-screen-stuck-on-max-contrast/)
- BennVenn (anecdote, from memory): "check the LCD bias voltage is present and correct on the LCD board. -19v I think it was. ... you can check the individual pixel shade voltages at the IC labeled IR3E02". — [post 3](https://chipmusic.org/forums/post/224740/#p224740)
- After cleaning the wheel (anecdote): "When I turn the contrast wheel it consistently changes color for about 90 seconds after the system is powered on." — [post 4](https://chipmusic.org/forums/post/224811/#p224811)
- Power board (measured, analog meter, faulty unit): "(~-18v and ~4v is what my multimeter said)". BennVenn: the four wires are "GND ..., a Battery line (battery voltage anywhere from around 4-6v) a -19v line (-18 was fine) and a 5volt line." He then asked for "the voltage on the contrast wheel". — [posts 9–10](https://chipmusic.org/forums/topic/15931/dmg-screen-stuck-on-max-contrast/)
- **The -11/-14 V measurement**, exact wording (measured, faulty unit, analog needle meter, leads reversed for negative): "Here's what I got on the first board: Contrast wheel at minimum (Turned counter-clockwise): -11v Maximum (clockwise): -14v". Which pin of the pot (wiper or end) and which ground point are **not stated**. — [post 11](https://chipmusic.org/forums/post/224828/#p224828)
- Reference value (measured on a working unit, single reading): "The voltage at the contrast pot should read -13v (for good contrast on my GB)." — BennVenn, [post 12](https://chipmusic.org/forums/post/224830/#p224830)
- The five capacitors and the drive-level chain (anecdote/explanation): "Those 5 black caps on the back of the pcb are responsible for the 'shades' of the pixel." and "the -19volts is divided into a range of voltages (labelled as V1 to V5 in the schematic) These voltages set the drive voltage of the LCD, the greater the voltage the darker the shade. These are set by IC IR3E02 and are varied by the voltage from the contrast wheel. These 5 voltages are fed into the LCD driver chip (located on the flexible cable). The logic level on DATAOUT0 and DATAOUT1 sets the pixel intensity (selects which of the voltages to gate through to the pixel)". — [posts 13 and 15](https://chipmusic.org/forums/topic/15931/dmg-screen-stuck-on-max-contrast/)
- Capacitor voltages (measured, the wheel fully clockwise, ground on "the metal bit labeled e2"): BennVenn's annotated photo had "-12.5" (top-left of bottom row) and "-9.9" (bottom right). The faulty unit read -6.2 and -4.4, and reached "-9.9 by turning the contrast wheel all the way in the other direction". The other three capacitors "seemed normal"; their values are only in the photo, which is not available. — [post 16](https://chipmusic.org/forums/post/224872/#p224872)
- gbdev 2009 (measured resistance, then an explanation): "On the PCB and in the schematics it says 30K for the contrast pot, but when I test it it's about 17." The administrator nitro2k01 replied: "The 17k value is no error; you're measuring the resistance of any other component that is connected in parallell with the pot ... Use 30k. ... 33k or even 47k or 50k should work fine too." The original poster then wrote: "The pots where desoldered from the PCB when I tested them, I tested two and they gave the same value." Another user: "i replaced the pot for the screen with a 25k pot, and all is well with that". — [gbdev forum topic 55](https://gbdev.gg8.se/forums/viewtopic.php?id=55)

### Inferences
- The -11 V to -14 V span is the wiper range on one *faulty* unit, measured with an analog meter. It is a rough indication only: the wheel sweeps about a 3 V window, and a working unit sits at about -13 V at "good contrast" (both readings are single anecdotal measurements). If those numbers are taken at face value, the project's wheel range of ×0.85–×1.08 around normal (about 23% of span) is the same order as -11/-13 ≈ 0.85 and -14/-13 ≈ 1.08. **This match is a coincidence of rough numbers, not a calibration.** The pot voltage is the IR3E02 reference, not the cell voltage itself.
- nitro2k01's "parallel component" explanation is contradicted by the poster's own follow-up (he measured desoldered pots). Two desoldered pots reading about 17 kΩ suggests the marked 30 k is nominal and the real parts differ, or that the meter was misread. This is unresolved.

### Gaps
- No source states which pot pin or ground point gives the -11/-14 V. No V1–V5 table for a working DMG was found in text; BennVenn's annotated photo was not linked in the archived text.
- No other chipmusic thread with measured DMG contrast voltages was found in this round.

## 4. LCD burn-in from stopped scans (daid/dmg-lcd-damage, kevtris, PinoBatch, NESdev)

### Takeaway
A primary chat log (Discord, 15 June 2021, archived by daid) documents a DMG whose game crashed with the scan stopped for about 10 minutes. It left a dark horizontal line that partly faded in the first few minutes and then faded slowly over the following day. kevtris attributes it to DC across the LCD. Earlier forum posts describe the normal turn-off line as appearing "for a second and then fades".

### Cited Findings
- Event (anecdote with photos, unmodded DMG): "I was playing game and watch gallery 2, and somehow the game crashed, leaving the scanline beam in place for, maybe 10 minutes. Now I have this seemingly permanent horizontal dark line burned into my screen." — Cavencruiser, [daid/dmg-lcd-damage README](https://github.com/daid/dmg-lcd-damage)
- kevtris: "LCDs don't like DC on them. if it doesn't go away after a few hours of use it most likely is permanent", "that is what happens if the LCD scan stops and DC is left on there. it can happen to any LCD", "bad connection to the LCD, or the crystal is intermittent is pretty much the only things that can cause it on a gb I'd think", "bad power, now that could do it", "this is a chemical process that happened ... it physically changed the LCD material and electrodes ... I don't think it's reversible but it might fade with time". kevtris also said "I don't think it can happen that way, since it powers down the LCD when you turn it off" when another user suggested wild code had disabled the LCD. — [daid/dmg-lcd-damage](https://github.com/daid/dmg-lcd-damage)
- Fading (anecdote): "It was much worse at first, but in the first 4 minutes, it started to fade, and just stopped there"; after running a demo all night "it may seem like the line isnt as visable"; "See how only certain angles make it more visible?". Also: "My brothers gameboy pocket had this same issue 4 years ago, and its completely gone now". — Cavencruiser, [daid/dmg-lcd-damage](https://github.com/daid/dmg-lcd-damage)
- PinoBatch: "So YES turning off rendering at the wrong time can and does damage DMG and MGB LCDs." Daid: "Thanks for confirming a long standing discussion on this being a real risk of damage." and "I plan on updating the pandocs to reflect this." — [daid/dmg-lcd-damage](https://github.com/daid/dmg-lcd-damage)
- Note: the crash case is a stopped scan; kevtris doubted it came from a software LCD-off. PinoBatch's conclusion about turning off rendering is a step beyond what kevtris said.
- NESdev 2015, tepples (anecdote): "I've seen it too: a black line appears for a second and then fades." lidnariq gave the DC-bias explanation and quoted LCD vendors on electroplating ("Elevated temperature will accelerate this effect"). Shonumi (anecdote) saw the line on a Game Boy Pocket at power-off. — [NESdev archive t12568](https://nesdev.nes.science/f20/t12568.xhtml)

### Inferences
- There are two separate behaviours. (a) A normal power-off or LCD-off gives a black line on the row being driven, which fades in about a second (anecdote). (b) A stopped scan held for minutes gives a dark line that partly fades over minutes to a day, with residue that depends on viewing angle. Both fit ion/DC effects. Neither has a measured time constant.
- These anecdotes could support the project's "ion sticking" behaviour qualitatively, but no number in them can be used as a value.

### Gaps
- The photos (20210614_*.jpg) are in the repository but were not examined here. There are no measured fade times.

## 5. Thomas Spurden: FPGA capture of the LCD signals

### Takeaway
The posts cover digital capture only: signal names, pins, latching and shift-register behaviour. They say **nothing** about the FR (polarity-reversal) period, drive voltages or levels.

### Cited Findings
- Signals and pins (measured with a logic analyser): "Pixel data D0 and D1 (50: LD0 / DATA0, 51: LD1 / DATA1)", "Pixel clock CLK (53: CP / CLOCK)", "Line latch CPL (55: CPL / DATALCH)", "Horizontal sync HSYNC (54: ST / HORSYNC)", "Vertical sync VSYNC (57: S / VERTSYN)". The Game Boy is "5 volt TTL". — [Spurden part 1](https://thomas.spurden.name/blog/capturing-gb-lcd/)
- Timing behaviour (measured): "Frame starts on the rising edge of VSYNC, which is held high for the first line of the frame." "Pixel data is shifted into a 159 pixel (159x2 bits) shift register ... on the rising edge of CLK." "CLK does not run at a constant rate, some pixels are generated but the corresponding pulse of CLK is suppressed ... This is how the Gameboy implements fine (1-7) pixel background and window offsets". "A whole line of pixels is latched into the LCD drivers on the rising edge of CPL." "At the end of each frame there are a few lines with no CLK pulses but a CPL pulse". — [Spurden part 1](https://thomas.spurden.name/blog/capturing-gb-lcd/)
- Data rate: "60 * 160 * 144 * 2 = 2764800 bits per second". — [Spurden part 1](https://thomas.spurden.name/blog/capturing-gb-lcd/); part 2 covers only compression. — [Spurden part 2](https://thomas.spurden.name/blog/capturing-gb-lcd-part2/)
- The FR signal is not captured or named in either post. — [Spurden part 1](https://thomas.spurden.name/blog/capturing-gb-lcd/)

### Inferences
- A whole row is latched at once and held while the next row shifts in, which means the panel is driven a row at a time (line-at-a-time addressing). This agrees with the project's decision not to model row-latch timing as a visible effect.

### Gaps
- FR period, common/segment voltage waveforms and the number of drive levels are not covered by Spurden. They would need the schematic or an oscilloscope source, which was not found in this round.

## 6. Hackaday: layers, polarizers, reflector

### Takeaway
The Hackaday article gives only the general layer order. The first-round note that it contains a "colour-filter film giving the green tint" is wrong: that is a reader comment, probably about a different model, and it says the opposite.

### Cited Findings
- Article text: "A reflective LCD is a layer cake made up of polarizers, two panes of glass, and a reflector. The burns often seen on Game Boy screens usually are in the polarizer and the optically clear glue which attaches the plastic polarizer to the glass. ... Between the sun rays directly striking the top polarizer and the rays bounced back from the reflector at the rear of the screen..." and "one false move could crack the thin LCD glass". — [Hackaday 2018-01-26](https://hackaday.com/2018/01/26/repairing-a-sunburned-game-boy-screen/)
- No polarizer angles, film thicknesses or glass thickness are given. — same
- Reader comment (anecdote, 28 Jan 2018; model not stated): "The contrast is affected and the screen looks like a DMG’s green screen. Seems that this happens because that second film you removed (the most difficult one) is a color filter film that removes the green tint and improves the contrast." — [Hackaday comments](https://hackaday.com/2018/01/26/repairing-a-sunburned-game-boy-screen/)

### Inferences
- The comment implies that the commenter's handheld (likely a Pocket or Light, since it "looks like a DMG's green screen" afterwards) has an extra compensation or colour film. It does not show that the DMG has one. **Correction to panel_construction.md**: treat that line as being about a non-DMG unit, as an anecdote.

### Gaps
- No Hackaday article with DMG polarizer angles or reflector type was found.

## 7. Reddit and other measured values (lens, glass, heat, cold)

### Takeaway
Reddit was not reachable from this session (blocked on every endpoint tried). Web search found no caliper measurement of the original DMG lens; only sellers' figures and fit anecdotes.

### Cited Findings
- Reddit search JSON (old.reddit.com, www.reddit.com, api.reddit.com) returned a "Blocked" page or a JS verification page. — [r/Gameboy search](https://old.reddit.com/r/Gameboy/search.json?q=lens+thickness&restrict_sr=1&limit=50)
- The Reddit thread referenced in daid's log about the line burned in when the LCD loses power at the wrong moment (not read): [r/Gameboy fx7vmx](https://www.reddit.com/r/Gameboy/comments/fx7vmx/why_does_the_lcd_losing_power_at_the_wrong_time/)
- Seller figure (replacement part, not the original): "At 1.0mm thick, this screen will fit nicely on your DMG" (search excerpt). — [Handheld Legend DMG cover screen](https://handheldlegend.com/products/game-boy-dmg-cover-screen)
- Fit anecdotes (search excerpts, not read in full): a glass lens "a little thicker than the stock lens so didn't sit flush"; another buyer says theirs "seems to be a bit thicker than the original". — [Arcade Otaku forum](https://forum.arcadeotaku.com/viewtopic.php?p=496071); [ZedLabz listing](https://zedlabz.com/en-ro/collections/retro-nintendo-game-boy-series/products/zedlabz-replacement-glass-screen-lens-cover-for-nintendo-game-boy-original-dmg-01-with-adhesive)

### Inferences
- The fit anecdotes suggest the original lens is slightly *thinner* than common 1.0 mm aftermarket glass lenses, so the project's assumed 1.0 mm may be at the upper end. This rests on two anecdotes from search excerpts and is weak.

### Gaps
- No measured original lens thickness, air gap, LCD glass thickness, heat-blackout temperature or cold-ghosting temperature was found from a readable source. Reddit should be retried from a network where it is reachable.

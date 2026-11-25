# Observed dynamic behaviour of the Nintendo Game Boy DMG-01 (1989) LCD

Research method note (read first): this session's network blocked direct page fetches for almost every relevant host (bgb.bircd.org, gbdev.io, gbdev.gg8.se, hackaday.com, chipmusic.org, nesdev, gameboymuseum.com, blogspot; Reddit's JSON API also refused). Findings below therefore come from (a) web-search result extracts, which quote the pages but are filtered through a summariser, and (b) the local checkout of Retro Display Lab (`/home/user/rdl`, upstream https://github.com/JohnnySun/retro-display-lab), read directly. Every claim from (a) should be re-checked against the page itself before it is quoted as fact. Reliability labels used: **measured** (instrument data), **test-ROM study**, **video/photo evidence**, **documentation** (developer reference built from hardware tests), **anecdote** (forum/user report), **general-STN** (not DMG-specific).

## 1. Response time, ghosting, motion blur

### Takeaway
No published instrument measurement (photodiode, high-speed camera) of DMG dot rise/fall time was found in English, Japanese or Chinese sources. The strongest DMG-specific evidence is BGB's "DMG reality" frame blend, built from "research/test roms" and photographs, which treats the DMG as slower than the Pocket and blends flickered shades with the real LCD shades; its coefficients are not published. Numbers in milliseconds come only from general period STN literature (roughly 80-300 ms).

### Cited Findings
- BGB: "The DMG reality frame blend accurately simulates the motion blur of the original gameboy (DMG) LCD based on research/test roms." Works only in DMG mode, not GBC/SGB; separate window/sprite colour schemes are not supported with it. (test-ROM study, method/coefficients unpublished) — [BGB manual](https://bgb.bircd.org/manual.html); [BGB reality page](https://bgb.bircd.org/reality/index.html)
- BGB: an in-between shade made by flickering "will look correctly as on the real LCD", i.e. the blend uses the real five measured shades rather than mixing RGB. (test-ROM study + photo) — [BGB reality page](https://bgb.bircd.org/reality/index.html)
- BGB: the "MGB reality" blend "simulates the response of the gameboy pocket LCD, which is a bit faster than the DMG LCD." (test-ROM study, qualitative ordering only) — [BGB manual](https://bgb.bircd.org/manual.html)
- BGB notes its default blend is correct "on fast (gaming or IPS with overdrive) LCD monitors", i.e. it assumes the viewing monitor adds no blur of its own. (documentation) — [BGB manual](https://bgb.bircd.org/manual.html)
- BGB publishes a blur comparison image and a shade comparison image (`dmgblend-blur.png`, `dmgblend-shades.png`). Retro Display Lab sampled the four midpoints of BGB's gradient as (134,144,36), (104,148,67), (74,130,89), (52,107,93) and found they match linear-light interpolation between neighbouring shades to within 0-1 8-bit code. (photo-derived, independent check) — [RDL docs/research/dmg-01.md](https://github.com/JohnnySun/retro-display-lab/blob/main/docs/research/dmg-01.md); [BGB blur image](https://bgb.bircd.org/reality/dmgblend-blur.png); [BGB shade image](https://bgb.bircd.org/reality/dmgblend-shades.png)
- Retro Display Lab's own evidence map labels BGB's frame-blend material as "behavior/reference-image evidence. It does not identify a unique DMG panel response curve." RDL fits no response time to the DMG; its solver output gives frame-sampled T90 of about 0.067 s for 0->3 and 3->0, explicitly "solver output", not a measurement. (project reconstruction) — [RDL models/nintendo-dmg-01/REFERENCES.md](https://github.com/JohnnySun/retro-display-lab/blob/main/models/nintendo-dmg-01/REFERENCES.md); [RDL dmg-01.md](https://github.com/JohnnySun/retro-display-lab/blob/main/docs/research/dmg-01.md)
- RDL notes that real DMG ghosting "varies with panel unit, temperature, contrast wheel and ageing"; its "Reference" preset is a conservative baseline, and it ships a separate `heavy-ghosting-v1` preset as a "colder/slower panel candidate". (project statement, not measurement) — [RDL dmg-01.md](https://github.com/JohnnySun/retro-display-lab/blob/main/docs/research/dmg-01.md)
- Period STN numbers (general-STN, not DMG): conventional STN about 300 ms, later low-viscosity mixtures 120-130 ms (Takatsu 1999; on/off definition unstated). Citizen's deliberately fast 1988 270° STN prototype reached (ton+toff)/2 ≈ 80 ms at 20 °C, ton ≈ toff, 4 µm cell, 1/200 duty. — [Takatsu 1999 (J-STAGE)](https://www.jstage.jst.go.jp/article/yukigoseikyokaishi1943/57/7/57_7_629/_pdf); [Okada et al. 1988 (J-STAGE)](https://www.jstage.jst.go.jp/article/itej1978/42/10/42_10_1022/_pdf)
- A display vendor page gives "typical" STN response of roughly 250 ms at +25 °C, much longer when cold (general-STN, vendor marketing level) — [Orient Display](https://orientdisplay.com/?p=308463)
- Games exploited the slow panel: sprites flickered every other frame to look transparent; "Since the GameBoy screen had a fairly slow response time the ghosting would effectively blend the sprite with the background." (anecdote/developer comment) — [Hacker News comment](https://news.ycombinator.com/item?id=20960369)
- Hackaday (2023, on IPS replacement screens): "The original LCD was so slow that this flicker would be largely hidden"; modern IPS kits show the flicker. (secondary article) — [Hackaday: why Game Boy IPS screens flicker](https://hackaday.com/2023/10/27/why-game-boy-ips-screens-flicker)
- mGBA 0.8.0 added interframe blending because flicker transparency "only works well on screens with ghosting" (example given is F-Zero: Maximum Velocity on GBA, not DMG). (emulator rationale) — [mGBA 0.8.0 release](https://mgba.io/2020/01/21/mgba-0.8.0)
- SameBoy offers two frame-blending modes; its release notes say the "Accurate" mode tracks each frame's parity and uses "a more realistic blend ratio". No DMG response data is given. (emulator rationale) — [SameBoy features](https://sameboy.github.io/features); [SameBoy releases](https://github.com/LIJI32/SameBoy/releases)
- A homebrew developer reports a flicker effect "looks great" on SameBoy with frame blending on and bad with it off. (anecdote) — [itch.io post](https://itch.io/post/10870564)
- Backlight-mod notes describe original screens as having "severe ghosting issues". (anecdote, modder community) — [makho's Backlight Mod Notes](https://gameboy.github.io/wiki/backlightmods)
- Forum view that many DMG games were designed around the blur (single-screen levels, slow movement). (anecdote/opinion) — [Retro Game Boards thread](https://www.retrogameboards.com/t/playing-gbc-and-early-gba-games-on-a-backlit-screen-looks-wrong-am-i-alone/1623)

### Inferences
- The only DMG-specific temporal facts available are qualitative: (1) a 2-frame (30 Hz) flicker fuses into a steady intermediate shade, so the per-frame change is small relative to one 16.7 ms frame; (2) the intermediate shade sits on the real shade curve (linear-light interpolation between neighbouring BGB colours); (3) DMG is slower than MGB. A response of order 100-300 ms is consistent with all of these but is not measured.
- The project's current 150 ms assumption sits inside the period STN range and is not contradicted by any DMG evidence found; it remains an assumption.

### Gaps
- No rise-vs-fall time for the DMG was found anywhere. BGB's blend coefficients and test-ROM method are unpublished (the page could not be fetched here to check for more detail).
- No high-speed-camera or photodiode study of a DMG found (searched English, Japanese "ゲームボーイ 残像", Chinese "初代GB 残影/拖影"; the Chinese and Japanese results contained only general remarks).
- No public "flicker test ROM" result with a numeric answer for the DMG was found.

## 2. Contrast wheel behaviour

### Takeaway
Hardware: the wheel is a potentiometer setting the negative LCD bias, about -11 V to -14 V on one measured unit. No source was found that documents, with photos, which shades vanish first across the wheel, or any hysteresis/lag. User recollections say finding a comfortable setting was hard; "blank screen" advice centres on faulty pots and ribbon cables rather than wheel position.

### Cited Findings
- A ChipMusic user measured the contrast wheel at about -11 V (minimum) to -14 V (maximum); the shades are set by an IC whose voltage the wheel varies. (measured, single unit, forum) — [ChipMusic: DMG screen stuck on max contrast?](https://chipmusic.org/forums/topic/15931/)
- Flickering, self-changing contrast is attributed to a failing potentiometer; suggested replacement "30k pot, 16mm". (anecdote/repair advice) — [ChipMusic: weird contrast issue](https://chipmusic.org/forums/topic/16981/wierd-contrast-issue-with-dmg-gameboy/)
- iFixit "blank screen" answer: test the contrast pot with a multimeter; also the front ribbon cable joints loosen with age. (repair advice) — [iFixit: Blank Screen when turned on](https://www.ifixit.com/Answers/View/26113/Blank+Screen+when+turned+on)
- Chinese retrospective: "the yellow-green screen and the contrast setting that was always hard to adjust to the most comfortable point" (那黄绿色的屏幕和永远都很难调到最舒适的对比度调节设置). (anecdote, period memory) — [17173 Game Boy retrospective](https://news.17173.com/content/2014-08-06/20140806005438553_1.shtml)
- Retro Display Lab states the wheel changes the optical mapping of the four driven shades and does not add logical shades; BGB's public material is "enough to support the model direction" for the wheel, but RDL cites no DMG photo series across the wheel. (project statement) — [RDL dmg-01.md](https://github.com/JohnnySun/retro-display-lab/blob/main/docs/research/dmg-01.md)

### Inferences
- A -11 to -14 V span is about ±12% around the middle, broadly the same order as the project's ×0.85-×1.08 wheel range (not a like-for-like quantity: bias rail vs RMS pixel voltage).

### Gaps
- No photo/video series with commentary on how the picture fades across the wheel, which shade disappears first, or any lag/hysteresis when turning. Video evidence would need to be found on YouTube directly (not searchable here).

## 3. Temperature

### Takeaway
No DMG-specific temperature measurements found. General LCD guidance: displays go temporarily black around 60 °C and recover on cooling; cold slows STN response and shifts the ideal bias (screen looks faint). Permanent "sun burn" on DMGs is a separate polarizer/adhesive damage, not the reversible clearing-point blackout.

### Cited Findings
- A Game Boy hardware article says the LCD's ideal drive voltage drifts with temperature, so the screen can look faint on a cold morning, and fast objects smear because the crystals lag. (secondary article, unsourced) — [Game Boy Museum: Hardware Explained, Part 3: The Screen](https://www.gameboymuseum.com/single-post/game-boy-hardware-explained-part-3-the-screen)
- Citizen watch FAQ: an LCD "may temporarily become black" at around 60 °C/140 °F and returns to normal at ordinary temperature. (manufacturer guidance, watch LCD, general) — [Citizen FAQ](https://citizenwatch-global.com/faq/detail/9)
- Typical STN response about 250 ms at 25 °C and much longer at low temperature. (general-STN, vendor) — [Orient Display](https://orientdisplay.com/?p=308463)
- RDL cites an SAE paper on wide-temperature multiplexed dot-matrix LCDs for response vs temperature; its runtime only supports 10-30 °C panel temperature. (project reference) — [SAE 930546](https://saemobilus.sae.org/papers/highly-multiplexed-dot-matrix-lcd-suitable-wide-temperature-range-930546); [RDL dmg-01.md](https://github.com/JohnnySun/retro-display-lab/blob/main/docs/research/dmg-01.md)
- Sun-damaged DMG screens: the dark central blotch is usually in the polarizer and its optically clear adhesive; sunlight passes through the polarizer twice (in and back off the reflector). Fixed by replacing the polarizer, not by cooling. (repair article) — [Hackaday: repairing a sunburned Game Boy screen](https://hackaday.com/2018/01/26/repairing-a-sunburned-game-boy-screen)
- A forum user (heating ribbon joints) reports "the screen will discolor (it's LCD after all) but it will come back to normal after a minute or two". (anecdote: reversible heat darkening) — quoted in search extract of [iFixit Game Boy answers](https://www.ifixit.com/Wiki/Nintendo_Game_Boy_Troubleshooting) (exact thread not confirmed)

### Inferences
- The reversible "goes dark when hot" behaviour is consistent with general twisted-nematic physics near the clearing point; the DMG's clearing temperature is unknown.

### Gaps
- No DMG clearing temperature, no recorded "cold DMG ghosting" report with temperatures. Japanese ("ゲームボーイ 液晶 寒い", "黒くなる 暑い") and Chinese ("高温 发黑") searches returned no first-hand DMG reports.

## 4. Image sticking / burn-in from static images

### Takeaway
No report found of DMG image retention from a long static picture. The one documented "burn-in" is a black horizontal line from switching the LCD off outside VBlank (see 5). Laboratory STN sticking exists (1994 Merck Japan study) but is not DMG data.

### Cited Findings
- No DMG static-image retention report found; GBA screens are reported as "somewhat susceptible to image retention" with flickering objects, "not permanent". (anecdote, GBA only) — [makho's Backlight Mod Notes](https://gameboy.github.io/wiki/backlightmods)
- 1994 STN study: after a 30-minute ON/OFF pattern, a residual pattern remained measurable under a common 35 Hz drive; strength correlated with conductivity anisotropy and viscosity. (measured, general-STN) — [Nakazono et al. 1994, DOI](https://doi.org/10.11538/ekitouyokou.20.0_374)
- gbdev wiki: stopping the LCD outside VBlank "may damage hardware by burning in a black horizontal line". (documentation) — [gbdev wiki LCDC](https://gbdev.gg8.se/wiki/articles/LCDC)

### Gaps
- No user reports of DMG ghost images persisting after hours of a static screen (searched English; Japanese/Chinese searches gave nothing relevant).

## 5. LCD disabled by software; power on/off

### Takeaway
Documented: with the LCD disabled by software the DMG shows a blank that is lighter than shade 0 ("whiter than white"), and the first frame after re-enabling is also blank. Turning the LCD off outside VBlank shows a black horizontal line on early DMGs and can damage DMG/MGB panels. No measurement of how fast the screen goes blank was found.

### Cited Findings
- Pan Docs: when disabled, the DMG screen is blank and "displayed as a white 'whiter' than color #0". On SGB the previous picture appears to stick instead. (documentation, hardware-tested) — [Pan Docs LCDC](https://gbdev.io/pandocs/LCDC); [gbdev wiki LCDC](https://gbdev.gg8.se/wiki/articles/LCDC)
- After re-enabling, "the screen will stay blank during the first frame"; on monochrome systems this is the same whiter-than-white shade; Pokémon Pinball uses that frame for setup; one reply says no VSync is generated when the LCD turns on (secondhand). CGB/GBA/GB Player show plain white. (test-ROM study) — [NESdev: The first frame is always white (test ROM)](https://forums.nesdev.org/viewtopic.php?t=18023); [gbdev forum thread](https://gbdev.gg8.se/forums/viewtopic.php?id=579)
- BGB's colour scheme has a distinct fifth "LCD off" colour, sampled by RDL as #948A04 (vs driven shades #759833 ... #2E615A), used for gaps and the undriven panel. (photo, ColorChecker-corrected) — [BGB reality](https://bgb.bircd.org/reality/index.html); [RDL REFERENCES.md](https://github.com/JohnnySun/retro-display-lab/blob/main/models/nintendo-dmg-01/REFERENCES.md)
- Pan Docs (quoted on gbdev forum): early DMG units show a black horizontal line when the LCD is turned off outside VBlank; advice to wait for LY ≥ 145; not applicable to CGB. (documentation) — [gbdev forum](https://gbdev.gg8.se/forums/viewtopic.php?pid=967)
- PinoBatch (dev chat in daid's repo): "turning off rendering at the wrong time can and does damage DMG and MGB LCDs"; Nintendo's manual only "recommends" VBlank and mentions the line, not damage. (anecdote + documentation; disputed) — [daid/dmg-lcd-damage (aggregator page)](https://awesome.ecosyste.ms/projects/github.com%2Fdaid%2Fdmg-lcd-damage); [NESdev archive: turning LCD off outside VBlank](https://nesdev.nes.science/f20/t12568.xhtml)
- A ChipMusic user saw faint dark horizontal lines after repeated power cycling and says you "usually see 1 bright line" across the screen at power-off; another notes similar behaviour on low batteries. (anecdote) — [ChipMusic post 210776](https://chipmusic.org/forums/post/210776); [ChipMusic post 202211](https://chipmusic.org/forums/post/202211)

### Inferences
- The power-switch line (bright or dark, reports vary) is plausibly the same mechanism as the software case: one row left selected/driven with DC as the controller stops. Not confirmed by any source.

### Gaps
- No timing for how long the screen takes to fade blank after LCD-off or power-off. No source describing the boot logo scroll's ghosting. The "bright" vs "dark" line wording conflicts between sources.

## 6. Crosstalk streaking vs ribbon-cable faults

### Takeaway
No source documents visible row/column streaking on healthy DMGs. RDL's own physical reconstruction gives about 0.01 shade of crosstalk (invisible). Missing or dead vertical lines are a well-known separate fault of the column ribbon-cable bond, fixed by reflowing with heat; horizontal-line faults are harder.

### Cited Findings
- RDL passive-matrix crosstalk: checkerboard RMS difference 0.009790 shade; described as a reconstruction, "not an actual pristine DMG crosstalk measurement". Its README shows a Tetris title-screen "crosstalk" comparison on a target device. (reconstruction) — [RDL dmg-01.md](https://github.com/JohnnySun/retro-display-lab/blob/main/docs/research/dmg-01.md); [RDL README](https://github.com/JohnnySun/retro-display-lab)
- Display uses two ribbon cables, one for horizontal and one for vertical lines; degraded joints cause missing vertical lines; fix by heating to reflow. (repair guides) — [Repair: missing vertical lines](https://website-e0c.pages.dev/posts/dmg-gameboy-screen-repair); [Retrofixes: The Gameboy Curse](https://www.retrofixes.com/2013/07/fix-vertical-lines-in-gameboy-screens.html); [iFixit guide](https://www.ifixit.com/Guide/Game+Boy+Display+Lines-Bars/61062)
- Why dead horizontal lines are harder to fix (row side). — [blog.gg8.se](https://blog.gg8.se/wordpress/2011/07/21/why-dead-horizontal-lines-are-harder-to-fix/)
- Chinese repair forums discuss vertical lines, black blocks and grey edges as faults, not ghosting. (anecdote) — [zh.ifixit](https://zh.ifixit.com/Answers/View/925322/Screen+not+displaying+correctly)

### Gaps
- No photographic report of crosstalk shadows on a healthy DMG found.

## 7. Viewing angle

### Takeaway
No DMG viewing-angle measurement or documented inversion-on-tilt was found. Only modder notes on polarizer rotation (deliberate negative image) and unverified play advice.

### Cited Findings
- Rotating the polarizer 90° gives a negative image with slightly higher contrast (backlight-mod context, not tilt). (modder) — [Inspektor Gadjet: inverted screen](https://www.inspektorgadjet.com/inverted-screen/)
- Advice to tilt a non-backlit DMG 15-30° back with light from above and behind to reduce glare (general guide, unverified). — [Poukker](https://poukker.com/game-boy-techniques/)

### Gaps
- No source on contrast/colour change or inversion with tilt for the stock DMG.

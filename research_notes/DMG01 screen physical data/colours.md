# DMG-01 screen colours: measured and calibrated values

Research date 2026-11-25. Network limits in this session: bgb.bircd.org, web.archive.org, community.aseprite.org, gametsukurukun.com, fgame30.hateblo.jp and thegamersalternative.static.app could not be fetched (DNS blocked). Their content is known here only from search-engine excerpts or from the local Retro Display Lab checkout (`/home/user/rdl`). raw.githubusercontent.com was reachable, so emulator source values were read directly.

Reliability labels: **instrument** (spectrophotometer/colorimeter), **calibrated photo** (ColorChecker or similar), **uncalibrated photo**, **by eye / artistic**, **unknown provenance**.

## Are there calibrated measurements beyond BGB's "DMG reality"?

### Takeaway
I found no spectrophotometer, colorimeter, CIE-coordinate or reflectance-spectrum data for a DMG-01 screen anywhere. BGB's "DMG reality" scheme (a ColorChecker-corrected photo) is still the only calibrated source. Every other published DMG palette (SameBoy, Gambatte, Virtual Console, Japanese hobby palettes, "pea soup") is picked by eye, made for artistic effect, or of unknown provenance.

### Cited Findings
- **BGB "DMG reality" (calibrated photo).** BGB states that "for all photos and color measurements for this project, the gameboys are illuminated by highly color accurate light, and photos are corrected, using a colorchecker, to true colors and brightness in sRGB gamma 2.2 space." — [BGB reality page (search excerpt)](https://bgb.bircd.org/reality/index.html)
- BGB's DMG palette was "sampled accurately from a real gameboy" from a photo at a 1/60 s shutter speed, defocused so that each colour patch blends to its average colour (dots and gaps averaged together). — [BGB reality page (search excerpt)](https://bgb.bircd.org/reality/index.html)
- BGB's page describes its GBC method in more detail (photos of every colour in an 8×8×8 cube, then interpolation and hand tuning). Search excerpts showed no equally detailed DMG procedure, so the DMG method is known only as "ColorChecker-corrected, defocused, 1/60 s". — [BGB reality page (search excerpt)](https://bgb.bircd.org/reality/index.html)
- The "DMG reality" scheme first shipped in BGB 1.6. In the same release the default became the lighter BGB 0.3 scheme, and the darker "BGB LCD green" stayed selectable. Those two are older, eye-picked schemes, not measurements. — [Emu-Land BGB 1.6 changelog](https://www.emu-land.net/en/news/bgb_v16)
- Retro Display Lab sampled BGB's five-state image at the centre of each patch: `#948A04` (LCD disabled/unpowered), `#759833`, `#588F51`, `#3B7560`, `#2E615A`. Four midpoints of BGB's smooth gradient match piecewise linear-light interpolation between these states to within one 8-bit code per channel. RDL labels this "reference-image matched, not a spectrophotometer dataset", and says that camera, illumination, specimen and display reproduction still limit absolute accuracy. — local `/home/user/rdl/models/nintendo-dmg-01/REFERENCES.md` (DMG-COLOR-01), upstream [retro-display-lab](https://github.com/JohnnySun/retro-display-lab)
- RDL's only colorimeter dataset is for the GBA (AGS-101: ColorMunki Display, HCFR) and none exists for the DMG. That suggests even a dedicated physics project found no instrument data for the DMG. — local `/home/user/rdl/models/nintendo-ags-101/REFERENCES.md`
- **SameBoy (unknown provenance; likely eye-picked).** `GB_PALETTE_DMG` = `#081810`, `#396139`, `#84A563`, `#C6DE8C`, plus a separate LCD-off colour `#D2E6A6`. The LCD-off colour is *lighter and greener* than shade 0, unlike BGB's olive-yellow #948A04. It also has MGB = `#07100E` / `#3A4C3A` / `#818D66` / `#C2CE93` / off `#CFDAAC` and GBL (Light, teal). The code holds no comment on how the values were obtained. — [SameBoy Core/display.c](https://raw.githubusercontent.com/LIJI32/SameBoy/master/Core/display.c)
- **Gambatte-libretro "Original Game Boy" (unknown provenance).** `#578200`, `#317400`, `#005121`, `#00420C`, a saturated green that is very different from BGB. Pocket: `#A7B19A`, `#86927C`, `#535F49`, `#2A3325`. — [gambatte-libretro gbcpalettes.h](https://raw.githubusercontent.com/libretro/gambatte-libretro/master/libgambatte/libretro/gbcpalettes.h). Libretro says Gambatte's DMG/Pocket palettes are meant for display on a standard TV, not on a GBC LCD. — [libretro Gambatte report](https://www.libretro.com/index.php/category/game-boy/)
- **mGBA**: the default DMG palette is plain grey (`0x7FFF`, `0x56B5`, `0x294A`, `0x0000` in BGR555). It has no green measurement, and users set colours through `gb.pal[n]`. — [mGBA src/gb/video.c](https://raw.githubusercontent.com/mgba-emu/mgba/master/src/gb/video.c), [core.c](https://raw.githubusercontent.com/mgba-emu/mgba/master/src/gb/core.c)
- **libretro `handheld/gameboy` shader** (Harlequin's): a 7-pass dot-matrix shader. Its colours come from a user-chosen palette texture, not from a measurement. — [slang-shaders gameboy.slangp](https://raw.githubusercontent.com/libretro/slang-shaders/master/handheld/gameboy.slangp)
- **Japanese comparison (by eye / emulator survey).** The 3DS Virtual Console uses RGB 128,176,16 among others, and RetroArch/Gambatte uses 123,130,16 among others. The author says KiGB's palette is "almost the same as the real unit, but subtly different", and that the 3DS greyscale option looks slightly yellow and is close to the real unit. These are eye comparisons. — [fgame30.hateblo.jp (search excerpt)](https://fgame30.hateblo.jp/entry/2021/05/30/222824)
- **ゲーム作るくん (by eye).** The page gives a "realistic" set rgb(41,65,57), (57,89,74), (90,121,66), (123,130,16) and the author's own compromise set (15,56,15), (48,98,48), (129,162,5), (175,198,25). It says plainly that LCD colour changes with ageing and lighting, so "there is no single correct answer". — [gametsukurukun.com (search excerpt)](https://gametsukurukun.com/docs/reproduce-original-game-boy-lcd-color/)
- **NESdev (by eye).** One user's palette is 175,203,70 / 121,170,109 / 34,111,95 / 8,41,85. Another reply notes the panel has no "colours", only one tint at about 0/33/66/100% on, and that shades depend on lighting, the contrast dial and battery voltage. — [NESdev "Gameboy RGB colors?"](https://nesdev.nes.science/f20/t12533.xhtml)
- **Aseprite palette survey**: a commenter knew of signal-output measurements for Sega consoles but of no such measurement for the Game Boy, and noted that brightness and age complicate any measurement. — [Aseprite community (search excerpt)](https://community.aseprite.org/t/gameboy-palette-survey/8568)
- **The common "pea soup" palette** (#0F380F, #306230, #8BAC0F, #9BBC0F) has no traceable measurement source. — [pixel-editor.com](https://www.pixel-editor.com/palettes/gameboy-green); Chinese search summary also flagged it as unsourced. Chinese sources (CSDN etc.) only repeat emulator presets. — [CSDN 问答](https://ask.csdn.net/questions/9071239)

### Inferences
- BGB's states are the only ones with a stated calibration chain. Every other palette is noticeably more saturated green (Gambatte, pea soup) or lighter (SameBoy) than BGB's muted olive-teal ramp. The teal-shifted dark shades (#3B7560, #2E615A) appear only in BGB, and they fit what is expected of an STN "yellow-mode" panel (dark states look blue-black).
- SameBoy's LCD-off colour (lighter than shade 0) and BGB's (#948A04, darker and more yellow than shade 0) disagree in direction. Only BGB's comes from a calibrated photo.

### Gaps
- No spectrophotometer readings, CIE xy/Lab values or reflectance spectra for any DMG-01 were found in English, Japanese or Chinese sources.
- I could not search SameBoy's commit history (GitHub API blocked) for the palette's origin. Analogue Pocket's DMG mode and the openfpga palette sets were not checked in detail; the openfpga palettes repo is user-made ([openfpga-palettes](https://github.com/davewongillies/openfpga-palettes)).

## Did BGB photograph through the screen lens?

### Takeaway
I could not confirm either way. Search excerpts and RDL's transcription of the page mention no lens, and the BGB page itself could not be fetched.

### Cited Findings
- RDL's record of the BGB method lists "ColorChecker-corrected to sRGB/gamma 2.2; camera, illumination, specimen and display reproduction" as limits and says nothing about the lens. — local `/home/user/rdl/models/nintendo-dmg-01/REFERENCES.md`
- A search summary of the BGB page found "no details on lens or optics handling". — [BGB reality page](https://bgb.bircd.org/reality/index.html)

### Inferences
- An unopened DMG always has the acrylic lens in front of the LCD, so a photo of an assembled unit would include it unless BGB says otherwise. This is an inference, not a statement from BGB.

### Gaps
- Fetch https://bgb.bircd.org/reality/ directly (allow the host) to check for any statement about the lens, contrast-wheel position, illuminant CCT and unit/age.

## Variation between units, production years, ageing and temperature

### Takeaway
No quantified data exists. The sources only say qualitatively that colour depends on ageing, lighting, contrast and battery voltage. The documented ageing failures are polarizer/adhesive "sunburn" and line faults, not measured colour drift.

### Cited Findings
- Burns on Game Boy screens are usually in the polarizer and the optically clear glue that bonds it to the glass, likely caused by sun exposure. They are repaired by replacing the polarizer. — [Hackaday: repairing a sunburned Game Boy screen](https://hackaday.com/2018/01/26/repairing-a-sunburned-game-boy-screen)
- A burnt polarizer is also documented on a Game Boy Pocket. — [optroodt blog](https://optroodt.github.io/blog/backlighting-a-game-boy-pocket-with-a-burnt-polarizer)
- After replacing the polarizer with generic film, contrast changes, and cheap cellphone polarizers give "less than perfect contrast". So the tint and contrast depend on the specific polarizer. — [search summary of replacement reports](https://hackaday.com/2018/01/26/repairing-a-sunburned-game-boy-screen); [gameboy.github.io wiki](https://gameboy.github.io/consoles/gameboy)
- Colour changes with ageing and lighting ("経年劣化や当たる光で変わる"). — [gametsukurukun.com (search excerpt)](https://gametsukurukun.com/docs/reproduce-original-game-boy-lcd-color/)
- Shades depend on lighting, contrast dial and battery voltage. — [NESdev](https://nesdev.nes.science/f20/t12533.xhtml)
- The green/olive tint comes from the panel's liquid-crystal and polarizer materials, and the screen ghosts and loses lines with age. — [Game Boy Museum guide](https://www.gameboymuseum.com/single-post/original-game-boy-dmg-01-complete-guide)

### Inferences
- Battery voltage probably matters only through the contrast (LCD drive) voltage. A sagging supply shifts the effective contrast-wheel position.

### Gaps
- No early-versus-late production colour comparison, no measured polarizer yellowing, no temperature-versus-colour data for the DMG.

## Gaps between dots versus dots; fully off versus LCD disabled

### Takeaway
BGB treats the undriven gap colour and the LCD-disabled colour as the same state (#948A04). No source measures a fully powered-off unit separately.

### Cited Findings
- RDL reserves `#948A04` "for unpowered aperture gaps"; game data selects only the other four states. BGB's close-up drawing shows a separate inter-pixel background and a reflector shadow, and BGB calls the drawing idealized, with the real edge width unknown. — local `/home/user/rdl/models/nintendo-dmg-01/REFERENCES.md` (DMG-COLOR-01, DMG-APERTURE-01); [BGB close-up](https://bgb.bircd.org/reality/dmglcd-closeup.png)
- BGB's defocused samples average dot and gap together, so the four shade colours are area averages, not pure dot colours. — [BGB reality page (search excerpt)](https://bgb.bircd.org/reality/index.html)

### Inferences
- Physically, LCD-disabled (drive removed) and console-off are both zero-field states, so they should look the same once the crystal has relaxed. No source verifies this.

### Gaps
- No photo or measurement comparing a powered-off DMG with an LCD-disabled one.

## Viewing-angle colour shift

### Takeaway
No DMG-specific data found. Only general STN behaviour is known; it is covered in RDL's literature, not here.

### Gaps
- No off-axis photographs with stated angles or measured colours were found.

## Colour at low/high contrast-wheel settings

### Takeaway
No photos with known wheel positions and calibrated colour exist in the sources found. The one numeric datum is a forum user's drive-voltage reading.

### Cited Findings
- The contrast wheel is a potentiometer that sets the LCD drive voltage; one user measured about −13 V as good contrast on their unit. — [ChipMusic forum](https://chipmusic.org/forums/topic/15931/dmg-screen-stuck-on-max-contrast/)
- A search for a grey, teal or blue high-contrast background found no source. — (negative result, this session)
- An Aseprite palette pack offers "High/Medium/Low contrast" DMG presets, all green, made by eye. — [darkfox6302 itch.io](https://darkfox6302.itch.io/aseprite-gb-palettes)

### Gaps
- No documented colour at a known wheel position. The claim that the background turns grey or blue at high contrast is unsupported by any source found.
- MGB contrast: the Pocket screen is greyer (SameBoy MGB and Gambatte Pocket palettes above). It is mentioned only for comparison.

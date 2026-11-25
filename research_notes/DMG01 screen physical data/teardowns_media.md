# DMG-01 screen: teardowns, measurements, photos and video evidence (second round)

Research conditions (read first). Shell internet worked this round, but several key sources refused automated access:
Reddit (old.reddit.com JSON returned an HTML block page; www.reddit.com returned "Blocked"; the pullpush mirror refused),
Hand Held Legend and ZedLabz product pages (Cloudflare "verify your connection" challenge), and YouTube (one transcript
downloaded, then "Sign in to confirm you're not a bot" for every further video). Pages read in full: Hackaday sunburn
article and comments, BGB reality page, No Starch *Game Boy Modding* ch. 2 sample PDF, ChipMusic threads 15931 and
260182, gameboy.github.io DMG page, optroodt backlight blog, gekkio bivert review, Time Extension Brick Boy article,
daid/dmg-lcd-damage README, nesdev thread t12568, and the auto-transcript of Wompratz "Replacing Front Polarizer on Game
Boy DMG". Product-listing figures below come from search-engine extracts of the listing (not read in full) and are marked so.
Labels: **measured**, **manufacturer/retailer**, **documentation**, **anecdote**, **inference**.

This round adds two corrections to the first-round notes (see section 1 and 4).

## 1. Thicknesses: lens, air gap, glass, polarizer, reflector, module

### Takeaway
Still no caliper measurement of any original DMG part was found in English, Japanese or Chinese sources. The original lens is described in print as "high-impact plastic"; the only lens thickness on record is 1.0 mm for a reproduction plastic lens. The only Game Boy film thickness is 0.28 mm for a transflective film (Game Boy Light / backlight use), not the DMG's original. Correction: the Hackaday "sunburned Game Boy" repair (source of the "green colour-filter film" remark in panel_construction.md) is a Game Boy **Pocket**, not a DMG.

### Cited Findings
- "The LCD is protected by a high-impact plastic lens." (book, modding guide; material named only generically, no thickness) — [No Starch Press, *Game Boy Modding*, ch. 2 sample](https://nostarch.com/download/samples/GameBoyModding_chapter2.pdf)
- Same chapter: the OEM lens is replaced by pushing it out from inside the shell and the new lens is applied "like a sticker" (i.e. the lens is a flat adhesive-mounted window sitting in a recess of the front shell) (book) — same
- Hand Held Legend reproduction DMG plastic lens: "self adhesive ... At 1.0mm thick, this screen will fit nicely on your DMG" (retailer, reproduction part; page not readable directly, quoted via search extract) — [Hand Held Legend, DMG cover screen](https://handheldlegend.com/products/game-boy-dmg-cover-screen)
- No search returned any thickness for an original Nintendo lens, nor any "0.8 mm" or other figure; one search summary explicitly found none (absence of evidence) — [search incl. eBay reproduction listings](https://www.ebay.com/itm/156742320641)
- Glass reproduction lenses are sold as better in "clarity and scratch resistance" than "the original and replacement plastic types"; a buyer reported a glass lens "does not fit well and is far from flush" (retailer + buyer anecdote; suggests glass lenses are not the same thickness as the recess) — [ZedLabz glass lens](https://zedlabz.com/en-ax/collections/retro-nintendo-game-boy-series/products/glass-screen-lens-for-game-boy-dmg-01-zero-projects-gbz-cover-replacement-black-zedlabz)
- Only film thickness found: transflective self-adhesive polarizer "Thickness: 0.28mm", oversized "to allow for rotating the film to find the angle of best performance, which is something around 30 degrees" (retailer; Game Boy Light/backlight product, not DMG original) — [ZedLabz transflective film](https://www.zedlabz.com/products/transflective-polarising-film-for-game-boy-light-self-adhesive-polarizer-polarizing-70-x-67mm-2-pack-3dlens)
- Hand Held Legend's DMG linear film has "a green tint to it closer to the look of the DMG", no adhesive on either side, cut 5 cm x 5 cm; "Simply place polarization film into the front half of the shell and put LCD over top" (retailer, via search extract) — [Hand Held Legend, Polarization Film](https://handheldlegend.com/products/polarization-film)
- Hackaday: "A reflective LCD is a layer cake made up of polarizers, two panes of glass, and a reflector. The burns ... usually are in the polarizer and the optically clear glue which attaches the plastic polarizer to the glass"; repair risks cracking "the thin LCD glass" (secondary article) — [Hackaday 2018-01-26](https://hackaday.com/2018/01/26/repairing-a-sunburned-game-boy-screen)
- Correction: commenters on the same article point out the repaired unit is a Game Boy Pocket in DMG-style colours ("Yeah, but this one's Game Boy Pocket"); the "second film ... is a color filter film that removes the green tint" remark (commenter Rafael) therefore concerns the Pocket, not the DMG (comments, anecdote) — same page
- Front polarizer on the DMG is firmly glued: "These things are really glued down", leaves adhesive residue cleaned with IPA; the presenter placed a non-adhesive replacement taped to the glass, noting the alternative of laying it inside the shell "in between the screen and the glass" [the lens] (video transcript, anecdote, unmeasured) — [Wompratz, Replacing Front Polarizer on Game Boy DMG (YouTube, 2022)](https://www.youtube.com/watch?v=q--apvHPYLY)
- Rear side: "you have to remove the reflective film and polarizer from the LCD screen, which are firmly attached with adhesive"; on the first try "I got just the reflective layer", then the polarizer separately, i.e. reflector and rear polarizer are two separable layers (blog, first-hand) — [optroodt, Game Boy backlight mod (2016)](https://optroodt.github.io/blog/game-boy-backlight-mod)
- Instructables backlight guide (via search extract): if the peeled corner "is a greenish tint, you still have the rear polarized film attached. If it is a light gray, you have removed the rear polarizer as well" (guide, anecdote) — [Instructables, How to Backlight a Game Boy (DMG)](https://instructables.com/How-to-Backlight-a-Game-Boy-DMG)
- Stock screen called 2.4" diagonal by one community page (conflicts with 2.5"/2.6" elsewhere) — [gameboy.github.io, Game Boy](https://gameboy.github.io/consoles/gameboy)

### Inferences
- The lens sits in a recess of the front shell and the LCD module is held from behind; a reproduction lens 1.0 mm thick "fits nicely", so the recess depth is probably about 1 mm (inference from a fit claim, not a measurement). The 1.0 mm lens value in the profile remains assumed, but it is consistent with this.
- That a loose replacement polarizer can be laid "into the front half of the shell" under the LCD shows there is some free space between the lens/shell and the LCD front surface (at least a film's thickness); it does not give the gap size.
- The rear stack is glass / adhesive / rear polarizer / adhesive / reflector film (two peelable films), the usual 1980s construction. The "greenish" rear polarizer remark suggests the rear polarizer film itself is tinted, or looks green against the glass; not resolved.
- Derived: 47 x 43 mm active area gives 63.7 mm = 2.51" diagonal; "2.4"" and "2.6"" are loose figures.

### Gaps
- No caliper value for: original lens, lens-to-LCD gap, LCD glass, front/rear polarizer, reflector, or module total. Searched English ("calipers", "thickness"), Japanese (ゲームボーイ 初代 液晶 偏光板 交換 厚さ), Chinese (初代GB DMG 偏光片 更换 厚度). Reddit, the most likely place for caliper posts, was blocked.
- Original lens material (PMMA vs polycarbonate) is still only "high-impact plastic".

## 2. Macro / microscope photos: dot pitch, gap, reflector texture

### Takeaway
No scaled micrograph of a DMG dot matrix was found. BGB states its dot-matrix gap is a guess. One new data point: the Brick Boy developer measured the reflector's paper-like grain from close-up photos of LCD modules: grains 0.3-0.5 dot, non-directional, reflectance variation about ±3.9%.

### Cited Findings
- BGB author: "I don't have a way to actually zoom in like this and found nothing on internet (except for a gameboy pocket) so i don't know how wide the edges actually are. Because the edge is yellow, and the average color is a certain green, the pixel square is more bluish. Also the pixels cast a shadow on the background, this is not simulated." Edge width is a user setting (DotMatrixIntensity, e.g. 0.1 = 10% edge); the MGB matrix has thinner edges (documentation; explicitly not measured) — [BGB reality](https://bgb.bircd.org/reality/)
- Brick Boy (fugudaro/kathoc, 2026): "the actual panel has a fine pattern like Japanese washi paper"; measured from "close-up images of publicly available LCD modules": "At 1 dot = 12.9px conversion, the grains are 0.3–0.5 dots, non-directional, amplitude total ±3.9%"; applied as a multiplicative reflectance variation, so it shows in bright areas and vanishes in dark ones (developer's own image measurement, quoted in press; which unit/photos not stated) — [Time Extension, Brick Boy article (Aug 2026)](https://www.timeextension.com/news/2026/08/the-most-gorgeous-game-boy-emulation-ive-ever-seen-brick-boy-goes-the-extra-mile-to-copy-the-consoles-nostalgic-display)
- Same: "An LCD that isn't backlit lets external light pass through the LCD, reflect off the back panel, pass through the LCD again ... So the color in bright areas isn't the LCD's color, but the panel's own color itself" (developer statement) — same
- Japanese search (ゲームボーイ 液晶 顕微鏡 ドット 拡大 写真 初代) found no micrographs — [search result set e.g. gdm.or.jp](https://www.gdm.or.jp/crew/2023/1010/508996)

### Inferences
- With pitch about 0.294 mm (derived), Brick Boy's grain of 0.3-0.5 dot is about 0.09-0.15 mm, typical of a diffuse (not brushed) aluminium-on-film reflector. "Non-directional" argues against a brushed texture.
- ±3.9% is small but visible on large flat light areas; it would be static (fixed to the panel, not to the image).

### Gaps
- No scaled micrograph of DMG dots or gaps; gap width remains unknown (BGB's 0.875 fill is a guess by its author's own statement).
- Brick Boy's source photos and unit are not identified; not independently checked.

## 3. Contrast wheel sweep (min to max)

### Takeaway
No video or photo series describing a healthy DMG across the whole wheel was obtainable (YouTube blocked after one video; Reddit blocked). Documentation-level facts: BGB says the lightest shade equals the LCD-off colour and, above normal contrast, the darkest shade becomes darker than normal black. Electronics: a -19 V rail divided into V1-V5 by the IR3E02, set by the wheel; measured wheel voltage -11 V (min) to -14 V (max) on one unit, about -13 V for "good contrast" on another.

### Cited Findings
- BGB: "As in reality, the lightest shade is the 'LCD disabled' color, and darkest shade if the contrast is darker than normal, is darker than the darkest shade with normal contrast." (emulator author's hardware observation, documentation) — [BGB reality](https://bgb.bircd.org/reality/)
- ChipMusic (BennVenn): "the -19volts is divided into a range of voltages (labelled as V1 to V5 in the schematic) ... the greater the voltage the darker the shade. These are set by IC IR3E02 and are varied by the voltage from the contrast wheel"; data bits select which voltage is gated to the pixel; "The voltage at the contrast pot should read -13v (for good contrast on my GB)" (experienced modder, single unit) — [ChipMusic: DMG screen stuck on max contrast?](https://chipmusic.org/forums/topic/15931/)
- Same thread (powersupply): wheel at minimum (counter-clockwise) -11 V, maximum (clockwise) -14 V (measured, single unit) — same
- Faulty-unit observation (not healthy behaviour): on an LCD board fault, at wheel minimum a static faint "noise" pattern appears "in a smooth manner (takes like 2-3 seconds)"; at wheel maximum the screen is evenly black (anecdote, faulty unit) — [ChipMusic: DMG black screen - no contrast adjustment](https://chipmusic.org/forums/post/260182)
- Faulty-unit: a dead column "consistently changes color for about 90 seconds after the system is powered on" when the wheel is turned (anecdote, faulty unit) — [ChipMusic topic 15931](https://chipmusic.org/forums/topic/15931/)
- Wompratz (healthy-ish DMG with a degraded polarizer): blotchy contrast variations are hidden "when you brighten it out, but when you go dark, you can start to see them" (video transcript; polarizer defect becomes visible at high contrast) — [Wompratz video](https://www.youtube.com/watch?v=q--apvHPYLY)
- Healthy behaviour (generic, Pocket-oriented page): image darkens gradually as the wheel turns, with a usable middle (secondary, Pocket) — [finalboss.io](https://finalboss.io/game-boy-pocket-how-to-test-lcd-defects-vs-contrast-problems)

### Inferences
- -13 V "good" inside -11..-14 V puts normal contrast about two thirds up the travel; the range is about -15%/+8% around -13 V, which is very close to the project's ×0.85-×1.08 wheel (coincidental match of proportions, different quantity: bias rail vs RMS pixel voltage). Worth noting to the owner as supporting, not proving, the range.
- The "2-3 seconds" and "90 seconds" slow changes were on faulty boards (capacitor/driver faults), so they are not evidence of LC lag on a healthy panel.

### Gaps
- No description from a healthy unit of which shade vanishes first at low contrast, or any lag/hysteresis when turning. Likely in YouTube restoration videos (e.g. zI3CcFDiMcs "How to Repair the Original GameBoy's Contrast Wheel", 1p7U2z0neOY, ZjoajD88oZs) but transcripts could not be downloaded.

## 4. Heat and cold

### Takeaway
No first-hand report of a DMG going black from heat and recovering, and no cold-ghosting report with a temperature, was found. The documented heat effect on DMGs is permanent polarizer/adhesive "sun burn". A heat-gun remark says the LCD "will discolor ... but it will come back to normal after a minute or two".

### Cited Findings
- Sun burn: "A black splotch in the center of the LCD is the telltale sign of a burned Game Boy"; light hits the polarizer directly and again after the reflector (secondary; the pictured unit is a Pocket) — [Hackaday 2018](https://hackaday.com/2018/01/26/repairing-a-sunburned-game-boy-screen)
- No Starch: screen burn is a fried polarizer, fixable on the Pocket by replacing it; "screen cancer" = pixels deteriorating, usually creeping from the edge on DMG and Pocket, no cure (book) — [No Starch ch. 2](https://nostarch.com/download/samples/GameBoyModding_chapter2.pdf)
- gameboy.github.io: DMG "screen rot" black specks or corner splotches, "NOT mold or water damage", no known repair except replacing the LCD board (community wiki) — [gameboy.github.io](https://gameboy.github.io/consoles/gameboy)
- Heat (repair context, quoted in search extract): screen "will discolor (it's LCD after all) but it will come back to normal after a minute or two" when heating the ribbon with an iron/heat gun (anecdote) — [iFixit Game Boy troubleshooting, via search](https://www.ifixit.com/Answers/View/26113/Blank+Screen+when+turned+on)
- Heat also loosens ribbon bonds: people "would frequently ... expose their Game Boys to sun or other heat sources and these ribbon cable connections, particularly the bottom one, would come apart" (repair site, anecdote) — [iFixit answers history](https://ts.ifixit.com/Answers/History/28673)
- Cold: only a 2003 forum guess ("Might temperature effect ghosting? Like the colder it is the worst"), about the GBA SP, unanswered (anecdote, not DMG) — [Nintendo World Report forum](https://www.nintendoworldreport.com/forums/index.php?topic=6575.msg82231)
- Japanese search (ゲームボーイ 液晶 真っ黒 夏 車内 高温 元に戻った) found no first-hand report — [jp.ifixit result set](https://jp.ifixit.com/Answers/View/850806/Screen+burn+and+not+turning+on,+is+it+fixable)

### Inferences
- "Discolors, back in a minute or two" fits local heating of the panel edge towards the clearing point and recovery on cooling; the minute timescale is the cooling time, not an LC time.

### Gaps
- No DMG clearing temperature, no hot-car blackout with recovery, no cold ghosting with temperatures.

## 5. Power-off / LCD-off appearance

### Takeaway
A first-hand developer report: at power-off "a black line appears for a second and then fades". A line left driven by DC for minutes (crash) can stay as a dark line; kevtris: if it does not fade after a few hours of use it is probably permanent. GBC (not DMG) images can linger several seconds after switch-off (Nintendo).

### Cited Findings
- tepples (nesdev, 2015): "I've seen it too: a black line appears for a second and then fades." Shonumi recalls seeing the line on a Pocket at power-off (developer anecdote) — [nesdev archive t12568](https://nesdev.nes.science/f20/t12568.xhtml)
- Leaked Nintendo programming manual (1999) only says "a black horizontal line appears on the screen" if the LCD is turned off outside VBlank, "recommended" not "required", no damage claim (documentation, quoted) — same
- Game & Watch Gallery 2 crash left "the scanline beam in place for, maybe 10 minutes" producing a "seemingly permanent horizontal dark line"; kevtris: "LCDs don't like DC on them. if it doesn't go away after a few hours of use it most likely is permanent"; "that is what happens if the LCD scan stops and DC is left on there"; the user can reproduce the line by switching "the power half on" (chat log, anecdote + expert opinion) — [daid/dmg-lcd-damage README](https://raw.githubusercontent.com/daid/dmg-lcd-damage/master/README.md)
- Nintendo: on Game Boy Color the image may take several seconds to disappear after switch-off; normal (manufacturer, GBC only) — [Nintendo UK support](https://www.nintendo.co.uk/Support/Game-Boy-Pocket-Color/Troubleshooting/System/Game-image-does-not-disappear-immediately-after-switch-off-Game-Boy-Color-only-/Game-image-does-not-disappear-immediately-after-switch-off-Game-Boy-Color-only--619654.html)

### Inferences
- The power-off line is dark (one row held selected with DC) and lasts about a second: this supports a "one dark row flash, then relax to the unpowered colour" behaviour on power-off. Earlier ChipMusic wording of a "bright line" conflicts; the nesdev and daid wording is "black/dark".

### Gaps
- No video measurement of the fade time; no description of how the rest of the picture fades on DMG power-off.

## 6. Viewing angle and polarizer orientation

### Takeaway
No tilted-DMG photo set with commentary was found. Firm fact: rotating the front polarizer 90° inverts the image (bivert mod relies on it), with a blue look and higher perceived contrast; replacement linear film placed in the green position gives the DMG's green.

### Cited Findings
- gekkio: bivert = invert pixels digitally, then "rotate the screen polarizer 90 degrees"; "widely considered to increase the screen contrast"; "the screen behaves slightly differently" (technical review) — [gekkio, HHL Bivert Module V2 review](https://gekkio.fi/blog/2020/hhl-bivert-v2-technical-review/)
- HHL store text quoted there: after biverting "pixels will have a blue appearance and enhanced gray scale saturation" (retailer) — same
- Wompratz: aftermarket linear polarizers on a Pocket give "that same pea soup green kind of look that you have on the DMG" (video transcript, anecdote) — [Wompratz video](https://www.youtube.com/watch?v=q--apvHPYLY)
- Newton's rings appear when a loose polarizer touches the glass; fix by air gap or full adhesive; "Air gapping is the preferred method" (community wiki) — [gameboy.github.io](https://gameboy.github.io/consoles/gameboy)

### Inferences
- Rings from a film touching glass show that the stock front polarizer is laminated with adhesive (no air gap between polarizer and glass) in the original build; the air gap the project models is between the lens and the polarizer, which this does not contradict.

### Gaps
- No source on how the stock DMG picture changes with tilt (darkening, hue shift, inversion angle).

## Summary for the simulation

| Quantity | Best evidence this round | Reliability |
|---|---|---|
| Lens material | "high-impact plastic" (No Starch) | book, generic |
| Lens thickness | 1.0 mm reproduction "fits nicely"; no original measured | retailer; assumed for original |
| Lens-to-LCD gap | room for a loose film; size unknown | inference |
| Front polarizer | glued with optically clear adhesive, no air gap to glass | multiple first-hand |
| Rear stack | rear polarizer and reflector are separate peelable films | first-hand blog |
| Film thickness | 0.28 mm only for GB Light transflective film | retailer, not DMG |
| Reflector texture | grain 0.3-0.5 dot, non-directional, ±3.9% reflectance | developer image measurement (Brick Boy) |
| Dot gap | unknown; BGB's value is a guess | BGB states so |
| Wheel | -11 V to -14 V; good contrast about -13 V; above normal, black gets darker; lightest = LCD-off colour | measured (1 unit), modder, BGB |
| Power-off | dark row line for about 1 s, then fades | developer anecdote |
| DC-held row | dark line may become permanent if held minutes | anecdote + expert opinion |
| Heat | local heating discolours, recovers in 1-2 min; sun damage permanent (polarizer) | anecdote |

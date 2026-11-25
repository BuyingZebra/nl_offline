# DMG-01 LCD drive electronics and contrast wheel

Research date: 2026-11-25. Reliability tags: **[measured]** (someone measured real hardware), **[schematic]** (traced from a real board: component values were measured by desoldering, per the author), **[datasheet/official]**, **[estimate]** (informed estimate or derived by arithmetic), **[anecdote]** (forum recollection, unverified).

Access note: in this session many hosts were unreachable (gbdev.io, gbdev.gg8.se, chipmusic.org, bgb.bircd.org, hackaday.com, thomas.spurden.name, forums.nesdev.org, consoleartisan.com, forums.futura-sciences.com). Findings from those sites below come from search-engine summaries, not from reading the page, and are marked "(via search summary)". The primary schematic PDFs (Gekkio) were downloaded and their text extracted directly, so those values are first-hand.

## 1. LCD board parts: driver chips, bias generator, V1-V5, negative rail

### Takeaway
The DMG-LCD-06 board carries a Sharp LH5076 row driver, a Sharp LH5077 column driver, an IR3E02 "STN LCD bias generation" chip that makes V1-V5 from the negative rail, a 30 kOhm contrast pot (VR1) and a 2SA933 PNP transistor. The negative rail VEE comes from the DC/DC board and is "roughly -18 V, unregulated"; no published V1-V5 values exist.

### Cited Findings
- **[schematic]** DMG-LCD-06 (Gekkio, KiCad, 2023-07-18, Rev C) blocks: "Contrast adjustment" (VR1 **30k**, C3 10u/25V, J2 to IR3E02 pin 18 "VR") and "STN LCD bias generation" (U1 **IR3E02**; pins VS1-VS5 = 3,4,5,6,7; outputs V1=12, V2=15, V3=16, V4=13, V5=14; V+ = pin 10; V- = pin 1; V1B = pin 11). Bias outputs decoupled by C6-C10 = **1 uF / 50 V** each. Q1 = **2SA933SR** (PNP), C4 = 47 pF, R2 = 100 Ohm, C5 = 1200 pF, C2 = 100 uF/10 V. — [Gekkio gb-schematics, DMG-LCD-06.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DMG-LCD-06/schematic/DMG-LCD-06.pdf)
- **[schematic]** Row driver **LH5076** is wired to VDD, **V1, V4, V5**, DVDD, FR, S, CPL; column driver **LH5077** to VDD, **V2, V3, V5**, DVDD, FR, CP, LD1, LD0, ST, CPL, CPG. — [DMG-LCD-06.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DMG-LCD-06/schematic/DMG-LCD-06.pdf)
- **[schematic]** The author states components were identified by desoldering and measuring a DMG-LCD-06 board, and that several LCD board versions exist; the schematic is accurate only for DMG-LCD-06. — [Gekkio gb-schematics README](https://github.com/Gekkio/gb-schematics)
- **[schematic]** Ribbon cable (21 pins, CPU board to LCD board): 1 GND, 2 VCC, **3 VEE**, 4-9 P11/P14/P13/P12/P10/P15 (buttons), 10 GND, 11 VDD, **12 S, 13 FR, 14 CP, 15 LD1, 16 LD0, 17 ST, 18 CPL, 19 CPG**, 20 SPKOUT, 21 GND. CPU (DMG CPU) pins: LD1=50, LD0=51, CPG=52, CP=53, ST=54, CPL=55, FR=56, S=57. — [DMG-LCD-06.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DMG-LCD-06/schematic/DMG-LCD-06.pdf); [DMG-CPU-06.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DMG-CPU-06/schematic/DMG-CPU-06.pdf)
- **[schematic]** Power nets on DMG-CPU-06: "VDD = main power supply, nominal +5V (regulated)", "**VEE = LCD bias supply, nominal -18V (unregulated)**", "VCC = DC input supply (battery or DC jack), nominal +6V". — [DMG-CPU-06.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DMG-CPU-06/schematic/DMG-CPU-06.pdf)
- **[schematic]** All three DMG DC/DC boards (DC-CONV-DMG-A/B, -C, DC-CONV2-DMG-D): "VOUT+ = +5V regulated", "VOUT- = unregulated negative output, **roughly -18V**". Self-oscillating flyback (2SD1664R switch); feedback regulates only the +5 V winding; on -A/B transformer turns ratios 1-3:2, 2-4:2, 5-6:2, 5-7:8, 8-9:1; -VOUT filter cap C4 33 uF/25 V. DC-CONV2-DMG-D adds an under-voltage lockout (3x DTC143T, 3.3 V zener). — [DC-CONV-DMG-AB.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DC-CONV-DMG-AB/schematic/DC-CONV-DMG-AB.pdf); [DC-CONV-DMG-C.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DC-CONV-DMG-C/schematic/DC-CONV-DMG-C.pdf); [DC-CONV2-DMG-D.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DC-CONV2-DMG-D/schematic/DC-CONV2-DMG-D.pdf)
- **[anecdote]** A chipmusic.org repairer recalled the LCD bias as "-19v I think it was", "divided into a range of voltages (labelled as V1 to V5 in the schematic)", set by IR3E02 and varied by the contrast wheel voltage (via search summary). — [chipmusic.org post 224734](https://chipmusic.org/forums/post/224734)
- **[anecdote]** gbdev wiki "DMG Schematics" lists the screen as "LH5028/LH5077 (Early screen model, 23040 pixels)" and a later model "S890623 (25600 pixels)" (via search summary; not checked against the page). This disagrees with Gekkio's LH5076 for the row driver; Gekkio's tracing of DMG-LCD-06 is the more direct source. — [gbdev wiki DMG Schematics](https://gbdev.gg8.se/wiki/articles/DMG_Schematics)
- **[datasheet]** No IR3E02, LH5076 or LH5077 datasheet was found in searches. Retro Display Lab also reports no datasheet values recovered for LH5076/LH5077, and uses Hitachi HD44100R/HD66100F on-resistances (20 kOhm / 11-30 kOhm max) only as comparable parts. — [RDL REFERENCES.md](https://raw.githubusercontent.com/JohnnySun/retro-display-lab/main/models/nintendo-dmg-01/REFERENCES.md)
- **Pocket comparison [anecdote/hobbyist]:** On the Game Boy Pocket (MGB) the 18-pin LCD cable carries V1-V5 directly (pins 9-11 = V5, V3, V2; 16-18 = V1, V4, V5), i.e. the bias is generated on the mainboard, not the LCD board as on the DMG. — [Palmr/gameboy-vga](https://github.com/Palmr/gameboy-vga)

### Inferences
- **[estimate]** The wiring matches the standard 6-level (V0=VDD, V1..V5) Alt-Pleshko drive used by period STN drivers: rows choose between V0/V5 (selected) and V1/V4 (not selected); columns choose between V0/V5 (on) and V2/V3 (off), swapped every FR half-period. VDD (+5 V) is the top of the ladder and V5 is the most negative level, near the contrast-set voltage.
- **[estimate]** The 2SA933 PNP plus 100 Ohm resistor next to the IR3E02 is likely an emitter-follower buffer for the most negative level (V5), which carries the largest current (row select pulses). Not confirmed by any source.
- **[estimate]** Because VEE is unregulated (only +5 V is fed back), VEE varies with battery voltage and load; the IR3E02 presumably regulates V1-V5 from it, so contrast should stay stable until VEE gets too close to the set level. Consistent with forum advice to check the DC/DC capacitors first.
- **[estimate]** Arithmetic for the ideal bias at N = 144 rows: bias ratio a = sqrt(144)+1 = 13 (i.e. 1/13 bias), and the best possible on/off RMS ratio sqrt((sqrt N+1)/(sqrt N-1)) = sqrt(13/11) = 1.087. The actual DMG bias ratio is unknown.

### Gaps
- No V1-V5 values or ratios (measured or datasheet) found anywhere. A multimeter on C6-C10 of a working DMG at both wheel ends would settle it.
- IR3E02 internals (op-amp ladder? resistor ladder ratio?) unknown; no datasheet.
- Exact VEE on real boards: only "roughly -18 V" (schematic note) and a "-19 V, I think" recollection.

## 2. Contrast potentiometer: value, voltage range, faults

### Takeaway
VR1 is 30 kOhm (traced). The only real-board range found is about -11 V (wheel minimum) to -14 V (maximum), about -13 V for good contrast, from one chipmusic.org user. Contrast faults are usually a worn pot, bad DC/DC capacitors or the IR3E02 supply.

### Cited Findings
- **[schematic]** VR1 = 30k, feeding the IR3E02 VR input (pin 18) through J2; VEE reaches the LCD board on ribbon pin 3. — [DMG-LCD-06.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DMG-LCD-06/schematic/DMG-LCD-06.pdf)
- **[measured, single board]** "Contrast wheel at minimum (turned counter-clockwise): -11v; Maximum (clockwise): -14v", about -13 V gives good contrast (chipmusic.org 2015, "DMG screen stuck on max contrast?"; via search summary and the brief). — [chipmusic.org post 224811](https://chipmusic.org/forums/post/224811/)
- **[anecdote]** chipmusic.org "Wierd contrast issue with DMG gameboy": symptoms "usually mean that the brightness potentiometer is buggered"; replace with a compatible part; poster recalls "30k pot, 16mm" (via search summary). — [chipmusic.org topic 16981](https://chipmusic.org/forums/topic/16981/wierd-contrast-issue-with-dmg-gameboy/)
- **[measured, in-circuit caveat]** gbdev forum "DMG potentiometers": a pot read about 17k in circuit against 30k on the schematic, explained as parallel components; substitutes of 33k, 47k or 50k suggested; "if you put 20k it will never be fully black", while 50k reaches dark sooner (via search summary). — [gbdev forum topic 55](https://gbdev.gg8.se/forums/viewtopic.php?id=55)
- **[anecdote]** Console Artisan repair reference (via search summary): DMG-LCD-06 contrast pot VR1 is 30 kOhm; the Game Boy Color equivalent is 50k, so pots should not be swapped between models; the IR3E02 has no modern drop-in replacement. — [Console Artisan Game Boy reference](https://consoleartisan.com/reference/game-boy/)
- **[anecdote]** Repair advice for blank screen / contrast wheel with no effect: check the pot with a meter and replace it; check for burnt transistors and leaking/dried electrolytics; check LCD bias on the LCD board, IR3E02 shade voltages and its 5 V/ground; the switching-supply capacitors fail most often from ripple current (via search summary of chipmusic and iFixit threads). — [iFixit: Blank Screen when turned on](https://zh.ifixit.com/Answers/View/26113/Blank+Screen+when+turned+on); [chipmusic.org post 224734](https://chipmusic.org/forums/post/224734)
- **[anecdote]** Futura-Sciences repair PDF (Pocket MGB-xCPU schematic, Gekkio) labels a "Contrast adjustment / TN LCD bias generation" block with IR3E02, a 30k VR2, and VEE "nominal -18V (unregulated)" (via search summary). Note this is the Pocket board. — [Futura-Sciences PDF](https://forums.futura-sciences.com/attachments/electronique/481937d1690190109-depannage-gameboy-pocket-mgb-xcpu.pdf)

### Inferences
- **[estimate]** If the -11 V to -14 V reading is the wiper (VR input) or V5, the wheel spans about 3 V out of roughly 16-19 V of total drive (VDD +5 V to V5). Relative span 14/11 = 1.27 if referenced to ground, or (5+14)/(5+11) = 1.19 if referenced to VDD. It is unclear which reference the poster used. The project's wheel ×0.85-×1.08 (span 1.27) is in the same ballpark, but no source ties them directly.
- **[estimate]** "Stuck on max contrast" / all-dark screens are consistent with the wiper open-circuit or VR pin pulled toward VEE; "too light / blank" with VEE collapse (DC/DC capacitors).

### Gaps
- Only one board's wheel range found. No Japanese or Chinese source gave measured voltages (Japanese search: nothing; Chinese search returned only translated iFixit threads).
- Which net the -11/-14 V reading was taken on (wiper, V5, or VEE) is not stated in the summary.
- No source on contrast drift with temperature or age on the DMG.

## 3. Multiplex duty, frame rate, scan order, signals, FR inversion

### Takeaway
144 rows are scanned per frame, with 10 extra line periods of vertical blank, at 59.73 Hz (70224 CPU cycles at 4.194304 MHz); each line is about 108.7 us. Signal names are known from schematics; their roles are known only from hobbyist sniffing. No FR period measurement was found.

### Cited Findings
- **[official/emulator-verified]** "One frame takes 70224 cycles (~59.7275 frames per second)." — [mGBA gbdoc](https://github.com/mgba-emu/gbdoc/blob/gh-pages/index.md). System clock crystal X1 = 4.194304 MHz. — [DMG-CPU-06.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DMG-CPU-06/schematic/DMG-CPU-06.pdf)
- **[official]** Nintendo Game Boy Programming Manual: 59.7 Hz, 160 segments per line, 144 visible lines, 10 vertical-blank lines, line time about 108.7 us (as quoted by RDL). — [RDL REFERENCES.md](https://raw.githubusercontent.com/JohnnySun/retro-display-lab/main/models/nintendo-dmg-01/REFERENCES.md), citing [Game Boy Programming Manual scan](https://files.nekoblog.org/uploads/pdf/39999184-GameBoy-Programming-Manual.pdf)
- **[measured]** Spurden FPGA capture: mean line period **108.724 us**, four stable rising edges per line (RDL notes the CPG identification and the "three equal grayscale dwells" are inferences). — [RDL REFERENCES.md](https://raw.githubusercontent.com/JohnnySun/retro-display-lab/main/models/nintendo-dmg-01/REFERENCES.md), citing [thomas.spurden.name/blog/capturing-gb-lcd](https://thomas.spurden.name/blog/capturing-gb-lcd/)
- **[measured, hobbyist]** Logic-analyser sniffing (DMG, back-board ribbon): contact 12 = V-Sync (S), 14 = Pixel clock (CP), 15 = Data 0 (LD0), 16 = Data 1 (LD1), 17 = H-Sync (ST), 21 = GND. One pixel per negative edge of the pixel clock, 23,040 pixels per frame; 2-bit shade 00 white, 01 light grey, 10 dark grey, 11 black (swapping LD0/LD1 inverts the greys). — [svendahlstrand/game-boy-lcd-sniffing](https://raw.githubusercontent.com/svendahlstrand/game-boy-lcd-sniffing/master/README.md)
- **[measured, hobbyist]** Hackaday 2010 ("Diving deep into the Game Boy LCD protocol"): 5 V logic, about 4 MHz data clock (via search summary). — [Hackaday](https://hackaday.com/2010/11/10/diving-deep-into-the-game-boy-lcd-protocol)
- **[measured, Pocket]** gameboy-vga (MGB cable): 0x3B = 59 VSYNC transitions per second; 0x59FF pixel-clock transitions per VSYNC (23,039). Lists "Alt Sig" (= FR) and "Control" lines. — [Palmr/gameboy-vga](https://github.com/Palmr/gameboy-vga)
- **[derived]** "1/144 Alt-Pleshko selected/nonselected RMS ratio" is a modelling choice in RDL, not a measured duty. — [RDL REFERENCES.md](https://raw.githubusercontent.com/JohnnySun/retro-display-lab/main/models/nintendo-dmg-01/REFERENCES.md)

### Inferences
- **[estimate]** Signal roles, from the wiring (section 1) plus the sniffing: **S** = frame start (vertical sync; goes only to the row driver, which shifts it down the 144 rows); **CPL** = line latch / row shift clock (to both drivers); **ST** = line start / data enable (column driver); **CP** = pixel shift clock (column driver); **LD0/LD1** = 2-bit pixel data; **CPG** = only to the column driver, probably the grey-level (frame-rate/PWM) control clock that turns the 2-bit value into a shade; **FR** = AC polarity inversion signal (both drivers). The CPG role is the least certain.
- **[estimate]** 160 pixels shifted per ~108.7 us line at about 4 MHz (CPU clock or a divided form) fits the observed clock; 160 pixels take about 38 us at 4.19 MHz, so the clock runs only part of each line.
- **[estimate]** Effective row duty: each row is selected for 1 of 154 line periods (144 + 10 blank), i.e. a time fraction of 1/154 even though the panel is a 1/144 multiplex; during vertical blank no row should be selected. Not confirmed by measurement.
- **[estimate]** How the 4 shades are made: the panel and drivers receive only 2 bits per pixel per line; the shades must come from either pulse-width modulation within the line (consistent with Spurden's "four rising edges per line" and "three equal dwells") or frame-rate control. Spurden's data points to in-line PWM, but this is RDL's interpretation.

### Gaps
- **FR period not found.** Typical STN practice is inversion every frame or every N lines; no DMG measurement was reachable. Spurden's page (blocked) is the likeliest source.
- No oscilloscope captures of the analogue row/column waveforms (V0-V5 levels at the glass) found. Only digital logic captures exist.
- No confirmation of what happens on CPG precisely.

## 4. LCD disabled by software (LCDC bit 7) and power on/off

### Takeaway
Turning the LCD off outside vertical blank on a DMG can leave a dark horizontal line, reported by Nintendo for early DMGs and by the community as possible lasting damage, because one row is left driven with DC when the scan stops. At the power switch, the LCD is powered down (kevtris), so a lasting line at power-off is not expected; no source documented a line flash at power-off.

### Cited Findings
- **[official]** Nintendo programming manual (1999, quoted on gbdev forum, via search summary): a black horizontal line appears on the screen if LCDC is stopped at any time other than vertical blank on early DMGs; restriction does not apply to CGB; workaround: turn off in vblank or when LY >= 145. NESdev thread notes the manual says "recommended", not "required". — [gbdev forum pid 967](https://gbdev.gg8.se/forums/viewtopic.php?pid=967); [NESdev: Turning LCD off outside VBlank](https://nesdev.nes.science/f20/t12568.xhtml)
- **[documentation]** Pan Docs / gbdev wiki LCDC: stopping LCD operation (bit 7 from 1 to 0) "may be performed during VBlank ONLY"; disabling at other times may burn in a black horizontal line (via search summary). — [gbdev wiki LCDC](https://gbdev.gg8.se/wiki/articles/LCDC)
- **[official/emulator]** "The PPU can be disabled entirely ... via the LCDC register ... re-enabling it can lead to irregular frame rates, at least transiently." — [mGBA gbdoc](https://github.com/mgba-emu/gbdoc/blob/gh-pages/index.md)
- **[anecdote, photographed]** 2021 incident: a DMG game crashed and left "the scanline beam" frozen about 10 minutes; result: a dark horizontal line near the top, visible mainly at certain angles; fainter next day. A Pocket with a similar line faded within minutes and was later "completely gone". kevtris: "that is what happens if the LCD scan stops and DC is left on there. it can happen to any LCD"; on power-off: "I don't think it can happen that way, since it powers down the LCD when you turn it off"; bad power "could do it". PinoBatch: "turning off rendering at the wrong time can and does damage DMG and MGB LCDs". The owner said he could reproduce it by switching the power partway on. — [daid/dmg-lcd-damage](https://github.com/daid/dmg-lcd-damage)
- **[measured colour]** BGB treats the LCD-off/unpowered look as a fifth colour state (sampled #948A04 in RDL's notes), separate from the four game shades. — [RDL REFERENCES.md](https://raw.githubusercontent.com/JohnnySun/retro-display-lab/main/models/nintendo-dmg-01/REFERENCES.md), citing [BGB reality](https://bgb.bircd.org/reality/index.html)
- **[anecdote]** Vertical missing/dark lines on DMGs are a common ribbon-cable/glue fault (pressing the strip restores them), unrelated to drive timing. — [iFixit Game Boy Screen Replacement](https://www.ifixit.com/Guide/Game%2BBoy+Screen+Replacement/3371)

### Inferences
- **[estimate]** With LCDC bit 7 = 0 the screen shows the lighter-than-white "LCD off" colour, so the drivers must output (near) zero volts on all cells: no row select pulses, which means every cell sees well below threshold. A line appears when the scan freezes mid-frame with one row latched in the select state and FR no longer toggling, giving that row a steady (DC) high voltage: dark line now, ion migration / electrochemical damage if it lasts minutes. This is consistent with kevtris's explanation, but the actual driver outputs while disabled have not been measured.
- **[estimate]** Power switch off: VEE (33 uF on the DC/DC output, 1 uF per bias level) collapses within a short time; whether rows go dark for an instant during the collapse is undocumented.

### Gaps
- No source documents a "line at power-off" flash on the DMG. The only power-related line is the partial-power-on reproduction in the daid thread.
- Pan Docs' exact wording on what colour the disabled screen shows could not be re-checked (gbdev.io blocked).
- No measurement of driver outputs or VEE while LCDC.7 = 0.

## 5. Measured waveforms (oscilloscope captures)

### Takeaway
Only digital logic-analyser captures are public (svendahlstrand, Spurden FPGA, gameboy-vga, Hackaday 2010). No oscilloscope captures of the bias levels or the analogue row/column drive waveforms were found.

### Cited Findings
- Logic captures of LD0/LD1, CP, ST, S (DMG). — [svendahlstrand/game-boy-lcd-sniffing](https://raw.githubusercontent.com/svendahlstrand/game-boy-lcd-sniffing/master/README.md)
- FPGA capture giving 108.724 us line period and four rising edges per line. — [Spurden blog](https://thomas.spurden.name/blog/capturing-gb-lcd/) (via RDL)
- Pocket VSYNC count and pixel-clock count. — [Palmr/gameboy-vga](https://github.com/Palmr/gameboy-vga)
- Student FPGA reports that sniff the Game Boy LCD bus exist but were not read here. — [MIT 6.205 2024 team17](https://fpga.mit.edu/videos/2024/team17/report.pdf); [Columbia BameGoy](https://www.cs.columbia.edu/~sedwards/classes/2024/4840-spring/reports/BameGoy-report.pdf)

### Inferences
- **[estimate]** The project's present model (two-pass optics, 1/144 Alt-Pleshko RMS, wheel ×0.85-×1.08) is not contradicted by anything found, but none of its drive voltages can be checked against a DMG measurement.

### Gaps
- No scope trace of FR, V1-V5, or the segment/common waveforms on the glass. Measuring C6-C10 and FR on a real DMG would close most of the open drive questions.

# DMG-01 LCD: patents, driver datasheets and period STN papers

Research date: 2026-11-25. Tags: **[primary]** (patent text, manufacturer data book, peer-reviewed paper read directly), **[schematic]** (Gekkio's board trace), **[catalogue listing]** (distributor or index entry only), **[estimate]** (inference or arithmetic).

Method note: pages were downloaded with curl and read directly (Google Patents HTML, bitsavers PDFs, a J-STAGE PDF rendered to images and read by eye). Figures read off graphs are marked "read from graph, approximate". Google Patents started returning "Sorry..." (rate limit) near the end, so one patent (JPS6241682A) was seen only as a search-result snippet. Web search engines (DuckDuckGo, Bing) returned nothing usable from this session, and alldatasheet.com sits behind a JavaScript check, so the datasheet hunt relied on direct site searches.

## 1. Nintendo patents JPH02191484A, JPH0277285A and US equivalents: what they say about the LCD

### Takeaway
JPH02191484A (Okada, filed 20 Apr 1989) is the Game Boy layout patent. Its US relatives US5184830A and US5134391A are the only primary documents found that name the panel drivers: "Sharp LH 5076 F" (common, i.e. row) and "Sharp LH 5077 F" (segment, i.e. column), on a "144×160 matrix". They describe the contrast wheel as a "brightness volume" feeding an "LCD buffer amplifier". No optical or electrical panel parameters are given (no twist, gap, polarizer, voltage or duty). JPH0277285A is not about the Game Boy: it describes a segment-type (Game & Watch style) LCD game.

### Cited Findings
- **[primary]** JPH02191484A, "Portable type electronic game machine" (携帯用電子ゲーム機). Inventor Satoshi Okada (岡田 智), Nintendo. Filed 1989-04-20, published 1990-07-27. Family includes US5134391A, US5184830A, EP0378385B1, GB2226768B. — [Google Patents JPH02191484A](https://patents.google.com/patent/JPH02191484A/en)
- **[primary]** Same patent, Field of the invention: a handheld game machine "equipped with a dot matrix liquid crystal display device" (ドツトマトリクス液晶表示装置) with a removable memory cartridge. Embodiment: the LCD controller 38 output passes through "LCD drive signal buffer 44" to "LCD common driver 46" and "LCD segment driver 48" (ＬＣＤコモンドライバ４６, ＬＣＤセグメントドライバ４８). — [Google Patents JPH02191484A](https://patents.google.com/patent/JPH02191484A/en)
- **[primary]** Same patent, contrast control: "a brightness volume 50 is provided (輝度ボリューム５０), and this brightness volume 50 is connected to an LCD buffer amplifier 52 (ＬＣＤバッファアンプ５２), so that by operating the brightness volume 50 the brightness on the LCD panel 14 can be adjusted"; it is on the left side so it "can be operated with fingers other than the thumb of the left hand", and the text equates brightness with contrast: "輝度（コントラスト）を調整できる" (the brightness (contrast) can be adjusted). — [Google Patents JPH02191484A](https://patents.google.com/patent/JPH02191484A/en)
- **[primary]** US5184830A, "Compact hand-held video game system" (Nintendo; Google gives priority 1989-01-10): "the LCD panel may, for example, define a 144×160 matrix of pixels or dots, each having a corresponding unique 'intersecting' common electrode/segment electrode combination. The LCD common driver 46, which drives the lines connected to the common electrodes, may for example, be a **Sharp LH 5076 F**. The LCD segment driver 48, may for example be a **Sharp LH 5077 F**." The same paragraph appears in US5134391A. — [Google Patents US5184830A](https://patents.google.com/patent/US5184830A/en); [Google Patents US5134391A](https://patents.google.com/patent/US5134391A/en)
- **[primary]** US5184830A: "there is an intensity level control 50 which is connected to an LCD buffer amplifier 52 such that the intensity of the LCD panel 14 can be adjusted"; the case has "on/off switch 1, battery power level light 13, contrast adjustment 50, and volume adjustment 66". — [Google Patents US5184830A](https://patents.google.com/patent/US5184830A/en)
- **[primary]** US5184830A on how dots are driven (general description only): "The dots where both the row and column are selected are driven for a short time period ... By repeating such operations in a high speed, sequential manner, the driven dots are 'displayed' by the density or contrast being different from that of other dots." The palette registers give "2 bits identifying 1 of 4 gradations of shaded color". — [Google Patents US5184830A](https://patents.google.com/patent/US5184830A/en)
- **[primary]** JPH0277285A, "Liquid crystal game device" (液晶ゲーム装置). Inventors Gunpei Yokoi (横井 軍平) and Satoshi Okada, Nintendo. Filed 1989-05-25, published 1990-03-16, granted as JPH0512000B2. It describes shaped **segment** electrodes ("one electrode (segment electrode) is formed in the shape of each display area ... the other electrode (common electrode) is made common to the entire surface") and a 4-digit 7-segment score/clock area (日字形セグメント). It is a juggling-type Game & Watch-style device, not a dot-matrix screen. — [Google Patents JPH0277285A](https://patents.google.com/patent/JPH0277285A/en)
- **[primary, snippet only]** A Google Patents search (Nintendo, LCD and game, priority 1985-1992) returned JPS6241682A, "Liquid crystal display game apparatus" (Nintendo, priority 1986-08-04), whose claim snippet reads "includes at least one filter provided on at least one side of the liquid crystal display board". The full text could not be read (rate-limited). Its date puts it before the Game Boy. — [Google Patents JPS6241682A](https://patents.google.com/patent/JPS6241682A/en)
- **[primary]** Full-text Google Patents searches for "LH5076", "LH5077" and "IR3E02" each returned 0 results (the US5184830A text writes "LH 5076 F" with a space, so it is not matched). — [Google Patents search](https://patents.google.com/)

### Inferences
- **[estimate]** The patent's "LCD buffer amplifier 52" matches what Gekkio traced on DMG-LCD-06: the 30k wheel (VR1) drives the IR3E02's VR input, and a 2SA933 PNP transistor sits next to the IR3E02, which looks like a buffer stage. The patent's wording supports reading the wheel as a voltage-setting control buffered into the bias supply, not a direct resistor in the LCD drive path.
- **[estimate]** The "F" suffix in "LH 5076 F" / "LH 5077 F" is most likely Sharp's flat (QFP) package suffix. This is an assumption, not checked against a Sharp numbering guide.
- The US patent naming LH5076/LH5077 independently confirms Gekkio's trace of DMG-LCD-06. It contradicts the gbdev wiki's "LH5028/LH5077" listing (see drive_electronics.md section 1) for the row driver.
- The patent wording "intensity", "brightness (contrast)" means the same control as the "contrast" wheel. The patents give no range for it.

### Gaps
- No Nintendo patent found gives panel optics, cell parameters, bias, duty, frame-inversion scheme or temperature compensation. The patents treat the LCD as a bought-in part.
- The Japanese priority application behind US5184830A's 1989-01-10 priority date was not identified or read.
- JPS6241682A (1986, "filter" on the LCD board) was not read. It may concern colour filters on Game & Watch-type panels; its relevance to the DMG is unknown.
- No Sharp patent specific to the Game Boy panel was found. A broad Sharp search (dot-matrix LCD and game, priority 1986-1992) gave only general LCD-process patents.

## 2. Sharp LH5076 (row) and LH5077 (column) datasheets

### Takeaway
No LH5076 or LH5077 datasheet was found anywhere tried. The nearest primary data are earlier Sharp dot-matrix LCD drivers in Sharp's 1986 MOS data book. The LH5021A is an 80-output common/segment driver rated for a **-17 V (typ.)** LCD supply, with absolute maximum -20 V and a separate -5 V logic supply. This is the same voltage class as the DMG's "nominal -18 V" VEE, but it is a different chip.

### Cited Findings
- **[catalogue listing]** Searches on datasheetarchive.com: "LH5076" and "LH5077" gave no Sharp LCD-driver result (LH5077 matched only an unrelated Pulse "H5077NLT" transformer). alldatasheet.com returned a JavaScript challenge page, and datasheet4u, datasheets360, elcodis and digchip gave no result. archive.org metadata search for LH5076/LH5077/IR3E02: 0 results. — [datasheetarchive LH5076](https://www.datasheetarchive.com/?q=LH5076); [datasheetarchive LH5077](https://www.datasheetarchive.com/?q=LH5077)
- **[primary]** bitsavers holds these Sharp data books: 1986 MOS Semiconductor, 1990 Microcomputers, 1991/1994 Memory, 1994 Application Notes, 1996 Microcomputer, 2002 "LSIs for LCDs", 2006 IC catalogues. None contains LH5076, LH5077 or IR3E02 (full-text grep of all of them). — [bitsavers Sharp data books](https://bitsavers.org/components/sharp/_dataBooks/)
- **[primary]** Sharp 1986 MOS Semiconductor Data Book, LCD driver index (index page, before p.838): LH5030 "Dot matrix display (common), common output: 80 lines", 96QFP, p.892; LH5031 common 32 lines, 44QFP, p.896; LH5035A/LH5036A "Dot matrix display (segment), display RAM 3200 bits, segment output: 80 lines", 96QFP, p.889; LH5006A (40 lines, p.866); LH5021A/LH5022 "common output or segment output: 80 lines", 100QFP, p.870; LH5826 (segment 64 lines, p.884). The LH50xx numbering is the same family naming as LH5076/LH5077. — [1986 Sharp MOS Semiconductor Data Book (PDF)](https://bitsavers.org/components/sharp/_dataBooks/1986_Sharp_MOS_Semiconductor_Data_Book.pdf)
- **[primary]** Same book, LH5021A/LH5022 "LCD Dot Matrix Driver CMOS LSI", pp.870-876:
  - Features: "Power supply voltage: -5V (TYP.)". "Display voltage LH5021A: -17V (TYP.), LH5022: -24V (TYP.)". 80 outputs, 100-pin QFP.
  - Pins: VDD (logic, -5 V), VEE "for liquid crystal drive circuit (LH5021A: -17V, LH5022: -24V)", VSS = GND, and V3, V4 "liquid crystal drive circuit output voltage supply ... during non-select, however VSS > (V3, V4) > VEE".
  - M = "Liquid crystal drive waveform AC conversion signal input".
  - Output truth table. Common mode: non-display → V3 (M low) / V4 (M high); display → VEE (M low) / GND (M high). Segment mode: non-display → V3 / V4; display → GND (M low) / VEE (M high).
  - Absolute maximum: VEE -20 to +0.3 V (LH5021A), -30 to +0.3 V (LH5022). Operating temperature -20 to +70 °C.
  - Output on-resistance spec ("voltage fall between Vi–Yi"): max 1.1 V at 1 mA into one output; max 1.5 V at 0.2 mA into each output (LH5021A, VEE = -17 V ±1 V).
  - Common-driver mode clock cycle min 1000 ns.
  — [1986 Sharp MOS Semiconductor Data Book, pp.870-876](https://bitsavers.org/components/sharp/_dataBooks/1986_Sharp_MOS_Semiconductor_Data_Book.pdf)
- **[schematic]** For comparison, on DMG-LCD-06 the LH5076 row driver takes V1, V4, V5 and the LH5077 column driver takes V2, V3, V5, both with FR. — [Gekkio DMG-LCD-06.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DMG-LCD-06/schematic/DMG-LCD-06.pdf)

### Inferences
- **[estimate]** The LH5021A output table shows how 1986 Sharp drivers worked. The polarity signal (M, called FR on the DMG) swaps each output between a pair of levels. Common: VEE/GND when selected, V3/V4 when not. Segment: GND/VEE when on, V3/V4 when off. This is the standard 6-level (Alt-Pleshko) drive with a frame-inversion signal. The DMG's FR line and its split supply pins (rows on V1/V4/V5, columns on V2/V3/V5) fit the later, dedicated-row/dedicated-column version of the same scheme, where rows and columns each get their own non-select pair. This is consistent with drive_electronics.md section 1, but it is inferred from a sibling part.
- **[estimate]** The LH5021A's -17 V typical rating (max -20 V) matches the DMG DC/DC's "roughly -18 V" VEE. A Sharp driver of this generation would be specified for about a 17 V LCD swing (plus the 5 V logic). This gives a plausible upper bound on the DMG's total drive voltage of about 18-23 V between VDD and VEE, but the actual V5 set by the wheel is lower (see drive_electronics.md section 2).
- **[estimate]** The output on-resistance implied by the LH5021A spec is about 1.1 kΩ (1.1 V / 1 mA) to 7.5 kΩ (1.5 V / 0.2 mA) worst case. These are the only Sharp-era driver resistance figures found and are closer to the source than the Hitachi values RDL used. They describe the LH5021A, not the LH5076/77.

### Gaps
- LH5076/LH5077 datasheets: not found. Their absolute maximum VEE, bias inputs, duty limits and FR options remain unknown.
- The LH5030/LH5035A pages (pp.889-896, the closest common/segment pair) were listed in the index but their text did not extract from the scan. They were not read by image, for lack of time; they may give a recommended bias and duty.
- A Sharp "LCD driver" data book from about 1988-1991 (where LH5076/77 would appear) was not found on bitsavers or archive.org.

## 3. IR3E02 bias generator: levels, ratio, temperature compensation

### Takeaway
No IR3E02 datasheet or application note was found. Sharp's "IR3E" prefix is used, in later catalogues, for LCD drive-voltage (grey-scale/bias) generator ICs with built-in divider resistors. That supports reading IR3E02 as a resistor ladder with buffer amplifiers that makes V1-V5 from the wheel-set voltage. Its ratio and any built-in temperature compensation are undocumented. The DMG-LCD-06 board has no thermistor or other temperature-sensing part.

### Cited Findings
- **[catalogue listing]** datasheetarchive "IR3E0" search: IR3E02 "Sorry, no results found". It lists **IR3E05 / IR3E05A** (Sharp, category "Regulators", 1-page 19 KB PDF) and a distributor description of IR3E05A as "ANALOG CIRCUIT, 5 FUNC, PDSO20". — [datasheetarchive IR3E0](https://www.datasheetarchive.com/?q=IR3E0); [datasheetarchive IR3E02](https://www.datasheetarchive.com/?q=IR3E02)
- **[primary]** Sharp Integrated Circuits catalogue 2006, "Gray-scale ICs for TFT-LCDs": IR3E2015, IR3E2045, IR3E3XX, "γ correction, gray-scale voltage generator for LCD drivers, built-in dividing resistors", 4.5-5.5 V; IR3E11P1/IR3E11A1 for large panels. The same catalogue lists the "Power Supply IC for STN-LCD Drivers" LR3697A with a "built-in bias voltage generation circuit for LCD drive, electronic volume control circuit". — [Sharp Integrated Circuits 2006 (PDF)](https://bitsavers.org/components/sharp/_dataBooks/Sharp_Integrated_Circuits_2006.pdf)
- **[schematic]** DMG-LCD-06 parts read directly from the schematic PDF text: D1 3.6 V and R1 1k (power LED), C2 100u/10V, "Contrast adjustment" VR1 30k with C3 10u/25V, "STN LCD bias generation" U1 IR3E02 (pins VS1-VS5, V1B, VR, V+, V-; outputs V1 = 12, V2 = 15, V3 = 16, V4 = 13, V5 = 14), C4 47p, Q1 2SA933SR, C6-C10 1u/50V, row driver LH5076, column driver LH5077, DA1-DA4 DAN215 (D-pad diodes), LS1 8 Ω speaker, C1 100u/10V. **No thermistor or other temperature-sensing part appears.** — [Gekkio DMG-LCD-06.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DMG-LCD-06/schematic/DMG-LCD-06.pdf)
- **[primary]** A period paper shows that the optimal Alt-Pleshko selection ratio was used in practice. Citizen (1988, below) drove its STN test cells with "the ratio of select voltage Vs to non-select voltage Vns 1.106 at 1/100 duty and 1.073 at 1/200 duty" (選択電圧Vsと非選択電圧Vnsの比が、1/100Dutyで1.106、1/200Dutyで1.073). — [Okada et al., ITE Tech. Rep. 12(6) 7-12 (1988), p.8](https://www.jstage.jst.go.jp/article/tvtr/12/6/12_KJ00001957967/_pdf)

### Inferences
- **[estimate]** The Citizen ratios equal the Alt-Pleshko optimum, sqrt((sqrt N + 1)/(sqrt N - 1)): N = 100 → sqrt(11/9) = 1.1055; N = 200 → 1.0734. So period Japanese STN practice used the optimal bias for the duty. For the DMG's 144 rows the same rule gives 1/13 bias (a = sqrt 144 + 1 = 13) and an on/off ratio of 1.087. Whether the IR3E02 ladder is exactly 1/13 is unknown, but the optimum was standard practice. If the panel used 1/154 timing (144 rows plus 10 blank lines), the bias would still be set by the 144 selected rows.
- **[estimate]** The IR3E02 has five "VS" pins (VS1-VS5) beside its five outputs. This fits five ladder taps that are either brought out for external trimming or bypassed with the C6-C10 capacitors, each buffered to a V output. "V1B" could be a buffered V1. These are guesses from pin names.
- **[estimate]** No temperature-sensing part on the LCD board means any temperature compensation is internal to the IR3E02 (unknown) or absent. Users then compensate by hand with the contrast wheel. The project's temperature model therefore cannot rely on a documented hardware compensation loop.

### Gaps
- No IR3E02 output ratios, buffer capability or temperature coefficient found. IR3E05 is a possible sibling, but its one-page sheet was not retrievable (datasheetarchive detail pages need JavaScript).
- Measuring C6-C10 on a real DMG at both wheel ends would give the ratio directly (same gap as drive_electronics.md).

## 4. Period STN technology papers (Sharp Technical Journal and others)

### Takeaway
CiNii lists no Sharp Technical Journal (シャープ技報) STN article for 1985-1992. The best period source found is Citizen Watch's 1988 "Development of high-speed response supertwisted LCD" (ITE technical report). It gives a complete 270° yellow-mode SBE cell recipe and measured response times versus cell gap. This appears to be the "1988 STN measurements" that Retro Display Lab's Δn·d = 0.95 µm and d/p = 0.7 come from. It is not a Sharp or DMG document.

### Cited Findings
- **[primary]** CiNii searches (1985-1992) for "シャープ技報" with STN, LCD or ドットマトリクス: no STN article. The only Sharp Technical Journal LCD hit was "立体画像と液晶シャッタスコープ" (1988, about 3D shutter glasses). Searches for "ゲームボーイ 液晶", "STN液晶 ゲーム" and "STN 黄色モード": nothing. — [CiNii Research](https://cir.nii.ac.jp/)
- **[primary]** CiNii also lists these period STN papers (affiliations not checked): "D-STNカラーLCDの表示特性" (ITE 1988); "D・STN-LCDの光学的補償効果" (Liquid Crystal Symposium 1988); "STN-LCDの過渡応答特性の動作電圧依存性" (斉藤 進, LC Symposium 1987); "ヒステリシス特性をもたないSTN形液晶ディスプレイの過渡応答特性に与える各種パラメータの影響" (斉藤 進, 神原 満男, 1988); "高速応答STN-LCDの電気光学特性" (LC Symposium 1990). — [CiNii Research](https://cir.nii.ac.jp/)
- **[primary]** Okada K., Koike S., Arai M., Yukinari T., Harada A. (Citizen Watch Co. Technical Laboratory), "高速スーパーツイスト(STN)LCDの開発 / Development of high speed response supertwisted LCD", ITE Technical Report 12(6), pp.7-12, 1988 (ID88-15), DOI 10.11485/tvtr.12.6_7. Facts read from the scanned pages:
  - p.7: STN means twist above 90°. "In 1984 yellow mode and blue mode [SBE] were proposed for multiplexed panels". SBE yellow/blue mode "began to be put to practical use as multiplexed panels". The remaining problems are slow response and difficult greyscale.
  - p.8, cell: "SiO oblique evaporation at 83° incidence as alignment layer, **left-handed 270° twist**" (Fig. 1). Cell gap d = **4-7 µm**. Polarizers **LN-1205T (Arisawa Mfg.)** placed as in Fig. 2, which shows the lower and upper polarizer absorption axes each at **50°** to the horizontal reference, on opposite sides. Measured "as SBE yellow mode".
  - p.8, Table 1: **ZLI-2293** Δn 0.130, η 22.7 cP, TN-I 85 °C, K33/K11 1.43, Δε/ε⊥ 2.35. **RO-TN-403** Δn 0.258, η 66.0 cP, TN-I 82 °C, K33/K11 1.83, Δε/ε⊥ 3.37. **LC-1** Δn 0.259, η 23.7 cP, TN-I 60 °C, K33/K11 1.05, Δε/ε⊥ 1.57. Mixtures were made so that **Δn·d = 950 nm** for each gap, with chiral dopant **S-811 (Merck)** at **d/p = 0.7**.
  - p.8, method: photometer LC-2S (Canon), static drive at 300 Hz for the T-V curve, 1/100 and 1/200 duty multiplex, Vs/Vns ratios as in section 3. Response time is quoted as (ton + toff)/2, with the drive voltage chosen so ton ≈ toff. All measurements at room temperature (**20 °C**).
  - p.9: Vth is defined at 90% relative transmittance and γ = V20/V80. Fig. 5: Vth about 1.32 V (4 µm) rising to about 1.6 V (7 µm) for group A, and about 1.6-1.65 V for group B (read from graph, approximate). Fig. 6: V20/V80 about 1.00-1.05.
  - p.10, Fig. 10, response (ton+toff)/2 against cell gap (read from log graph, approximate): group A (ZLI-2293 + RO-TN-403) about 150 ms at 4 µm, 210 ms at 5 µm, 260 ms at 6 µm, 330 ms at 7 µm. Group B (ZLI-2293 + LC-1) about 65 ms at 4 µm, 95 ms at 5 µm, 165 ms at 6 µm, 290 ms at 7 µm. Fig. 8: response grows steeply with multiplex number N (2 to 400), e.g. group B d = 4 µm about 70 ms at N = 100 and about 90 ms at N = 400; group B d = 7 µm above 300 ms by N = 100. Fig. 9: for group B at 4 µm, response falls from about 77 ms (d/p 0.6) to about 42 ms (d/p 0.9).
  - p.11, Fig. 11, T-V curve, 270° twist yellow mode, d = 4 µm, d/p = 0.7, 300 Hz square wave: off-state transmittance about 0.33-0.35, on-state about 0.02, switching between about 1.7 and 1.9 Vrms, shown at viewing angles 0°, 20°, 40° (read from graph, approximate). Conclusion: "in the 270° twist yellow mode, a sufficient response speed was obtained by thinning the cell"; "Δn·d about 950 nm, and d/p about 0.7 because of constraints from low-order twist and stripe domains".
  — [J-STAGE PDF](https://www.jstage.jst.go.jp/article/tvtr/12/6/12_KJ00001957967/_pdf); [CiNii record](https://cir.nii.ac.jp/crid/1390001204519895040)

### Inferences
- **[estimate]** This paper matches the RDL / project reconstruction closely: ZLI-2293 base, Δn·d 0.95 µm, d/p 0.7, cell gap 4-7 µm, yellow mode. The one difference is the twist: Citizen used 270° and RDL uses 260°. The project's 150 ms per change fits the Citizen data for about a 4-5 µm cell with ZLI-2293-heavy mixtures, or about 5.5 µm for low-viscosity group B, at 20 °C and N around 100-200. A 6 µm cell with mixture A would be about 260 ms. This is a period yellow-mode cell from another maker, not the DMG.
- **[estimate]** Citizen's polarizer layout (absorption axes about ±50° from the horizontal, i.e. crossed at about 80-100° depending on sign convention) is a concrete period yellow-mode example. It can be used as a sanity check for the project's 75°/90° polarizer angles (which are a BGB fit), but it does not establish the DMG angles.
- **[estimate]** Off-state transmittance of about 0.33-0.35 in a two-polarizer cell (single pass) means the DMG's reflective two-pass geometry would return roughly the square of that, times the reflector loss, for the "white" level. This is consistent with the project's two-pass optics, where each pass carries the square root of the colour.

### Gaps
- No Sharp-authored STN paper from 1986-1990 was read. The Sharp Technical Journal archive on sharp.co.jp was not reached. CiNii does not index it fully for that period, so its absence there is not proof that nothing exists.
- The D-STN papers (1988) were not read and their affiliations were not checked. D-STN is a black-and-white double-cell technology, and the DMG's green-yellow look points to single-cell yellow mode instead.
- No source ties any specific period STN recipe to the DMG panel.

## 5. Gekkio's gb-schematics: LCD board confirmation

### Takeaway
The DMG-LCD-06 schematic, re-read directly, confirms the parts list in drive_electronics.md. It adds that the LCD board has no temperature-sensing part. The US patent independently confirms the LH5076/LH5077 pair.

### Cited Findings
- **[schematic]** Parts and blocks as listed in section 3 above. Blocks are labelled "Power LED", "Contrast adjustment", "STN LCD bias generation", "Row driver LH5076" (V1, V4, V5, DVDD, FR, S, CPL) and "Column driver LH5077" (V2, V3, V5, DVDD, FR, CP, LD1, LD0, ST, CPL). The 21-pin ribbon carries GND, VCC, VEE, P10-P15, VDD, S, FR, CP, LD1, LD0, ST, CPL, CPG, SPKOUT. — [Gekkio DMG-LCD-06.pdf](https://github.com/Gekkio/gb-schematics/blob/main/DMG-LCD-06/schematic/DMG-LCD-06.pdf)
- **[primary]** Nintendo's own US patent names the same driver pair (LH 5076 F common, LH 5077 F segment). — [Google Patents US5184830A](https://patents.google.com/patent/US5184830A/en)

### Inferences
- **[estimate]** Because the patent (filed 1989-1990, describing the launch design) and Gekkio's DMG-LCD-06 (a later board revision) name the same drivers, the LH5076/LH5077 pair probably spans the DMG's production. Earlier boards (DMG-LCD-01 etc.) were not traced, so this is not proven.

### Gaps
- No BOM or notes in the repository beyond the schematic. Other LCD board revisions are not traced.

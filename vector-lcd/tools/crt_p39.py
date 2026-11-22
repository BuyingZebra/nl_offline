"""Builds profiles/crt-5151-p39.json: an IBM 5151 green monochrome monitor
(P39 phosphor, MDA timing) for the Vector LCD screen test.

    python3 tools/crt_p39.py          (NumPy and SciPy; a few seconds)

Every number is sourced, derived from sourced numbers, or labelled assumed.

Sources
- IBM 5151: 11.5 in 90 degree CRT, P39 phosphor, 50 Hz, 350 lines, 18.432 kHz,
  digital TTL video + intensity, etched anti-glare face, brightness and contrast
  knobs (Wikipedia "IBM 5151"; IBM RT PC manual 3-5; IBM 5150 tech. ref.).
- MDA timing: 6845 CRTC values from the IBM BIOS video parameter table
  (R0 = 61h -> 98 character clocks of 9 dots = 882 dots per line, 720 shown;
  R4 = 19h, R9 = 0Dh, R5 = 06h -> 26 x 14 + 6 = 370 lines, 350 shown);
  16.257 MHz dot clock -> 18.432 kHz, 49.82 Hz.
- Drive levels: video carries 2/3 and intensity 1/3 of the luminance
  (Wikipedia "IBM Monochrome Display Adapter").
- P39 = Zn2SiO4:Mn,As (JEDEC; Juestel, CRT Phosphors): emission 525 nm,
  persistence class "long" = 100 ms to 1 s to 10 % (Philips T16 1987 p. 20;
  Fivre). Colour x = 0.205, y = 0.715 (Philips T16 1987, survey of screen
  phosphors, GR = P39).
- Decay physics: Mn2+ in willemite decays exponentially; P1 (same centre, no
  arsenic) falls to 10 % in 20 ms (Jankowiak, CRT phosphors of interest to the
  experimenter, after Tektronix/EIA). Arsenic adds electron traps whose
  recombination is bimolecular (Robbins et al., IBM, J. Electrochem. Soc.
  1985): g(t) = 1/t0 / (1 + t/t0)^2. Each recombination excites a Mn2+ centre,
  so the light is g convolved with the Mn2+ decay.
- t0 is solved from one measurement: commercial P39 shows a ripple ratio of
  0.370 under 30 Hz excitation (US 4,315,190, table 1; ripple = variation of
  the fundamental over the mean). Read as peak-to-peak, this gives a time to
  10 % inside JEDEC's "long" class; read as amplitude, it would fall outside,
  so peak-to-peak is used and the check is recorded.
- Spot: Philips 31 cm 90 degree monitor tubes (M31-336..350) resolve about
  1300 lines over the 201 mm useful height (shrinking raster, 68.5 cd/m2):
  line width 0.155 mm; a Gaussian raster looks flat when the pitch reaches
  2 sigma, so sigma = 0.077 mm. Faceplate light transmission about 50 %
  (normal tint), index 1.52 (Philips T16).

Assumed (no 5151 data found; labelled in the profile)
- The 5151 tube behaves like the Philips 31 cm 90 degree monitor tube and its
  raster fills that tube's useful height (201 mm).
- Faceplate glass 10 mm thick; phosphor screen reflectance 0.5 (aluminized).
- Operating luminance at full drive 68.5 cd/m2 (20 fL, the level used by both
  the Philips resolution test and the P39 patent); room 300 lux.
"""
import json, math, os
import numpy as np
from scipy.optimize import brentq, least_squares

HERE = os.path.dirname(os.path.abspath(__file__))
r6 = lambda v: float(round(float(v), 6))

# --- Timing (MDA / IBM 5151) ---
DOT_CLOCK = 16.257e6
DOTS_TOTAL, DOTS_VISIBLE = 98 * 9, 80 * 9
LINES_TOTAL, LINES_VISIBLE = 26 * 14 + 6, 25 * 14
T_LINE = DOTS_TOTAL / DOT_CLOCK
T_FRAME = LINES_TOTAL * T_LINE
T_ACTIVE = DOTS_VISIBLE / DOT_CLOCK

# --- Phosphor decay ---
TAU_MN = 0.020 / math.log(10)             # P1: exponential, 10 % at 20 ms
RIPPLE_30HZ = 0.370                       # US 4,315,190 table 1, commercial P39
t = np.concatenate([np.linspace(0, 2, 200001)[:-1], np.linspace(2, 100, 50000)])
def G(freq, t0):
    g = 1 / t0 / (1 + t / t0) ** 2
    return np.trapezoid(g * np.exp(-2j * np.pi * freq * t), t)
def ripple(t0, k):                        # k = 4: peak-to-peak over mean; k = 2: amplitude
    return k * abs(G(30, t0) / (1 + 2j * np.pi * 30 * TAU_MN)) / abs(G(0, t0))
T0 = brentq(lambda x: ripple(x, 4) - RIPPLE_30HZ, 1e-3, 5)
dt = 1e-5; tt = np.arange(0, 5, dt)
h = np.convolve(1 / T0 / (1 + tt / T0) ** 2, np.exp(-tt / TAU_MN) / TAU_MN)[:len(tt)] * dt
pk, ip = h.max(), int(h.argmax())
t10 = tt[ip + np.argmax(h[ip:] < 0.1 * pk)]; t1 = tt[ip + np.argmax(h[ip:] < 0.01 * pk)]
try:
    T0_amp = brentq(lambda x: ripple(x, 2) - RIPPLE_30HZ, 1e-3, 5)
    h2 = np.convolve(1 / T0_amp / (1 + tt / T0_amp) ** 2, np.exp(-tt / TAU_MN) / TAU_MN)[:len(tt)] * dt
    i2 = int(h2.argmax()); t10_amp = float(tt[i2 + np.argmax(h2[i2:] < 0.1 * h2.max())])
except ValueError:
    t10_amp = None

# Five exponentials reproduce h for the GPU (exact time stepping per component).
K = 5
sel = np.unique(np.concatenate([np.arange(0, 2000, 5), np.geomspace(2000, len(tt) - 1, 600).astype(int)]))
ts, hs = tt[sel], h[sel]; w = 1 / np.maximum(hs, pk * 1e-3)
def model(p, x):
    a = p[:K]; b = np.exp(p[K:]); return (a[:, None] * np.exp(-x[None, :] / b[:, None])).sum(0)
best = None
for s in range(20):
    rng = np.random.default_rng(s)
    b0 = np.sort(np.geomspace(0.005, 1.5, K) * np.exp(rng.normal(0, .3, K)))
    r = least_squares(lambda p: (model(p, ts) - hs) * w, np.concatenate([rng.normal(0, 30, K), np.log(b0)]), max_nfev=20000)
    if best is None or r.cost < best.cost: best = r
amps, taus = best.x[:K], np.exp(best.x[K:])
order = np.argsort(taus); amps, taus = amps[order], taus[order]
amps = amps / float((amps * taus).sum())            # unit light energy per unit excitation
fit = model(np.concatenate([amps, np.log(taus)]), tt)
fit_err = float(np.abs(fit - h).max() / pk)

# --- Colour: P39 chromaticity to linear sRGB ---
X_, Y_ = 0.205, 0.715
XYZ = np.array([X_ / Y_, 1.0, (1 - X_ - Y_) / Y_])
M = np.array([[3.2404542, -1.5371385, -0.4985314], [-0.9692660, 1.8760108, 0.0415560], [0.0556434, -0.2040259, 1.0572252]])
srgb_raw = M @ XYZ

# --- Spot growth with beam current (Philips T16 1987, Fig. 5, traced) ---
# Line width follows a power of the anode current at fixed cathode cut-off
# voltage: fitted over the four measured currents (50-200 uA, a factor of 4)
# at 45 V, the middle of the datasheet's typical 30-60 V (assumed); the range
# of the power over 30-60 V is recorded.
LW = json.load(open(os.path.join(HERE, "philips-m31-line-width.json")))
def bloom_power(vkr):
    I = np.array([50.0, 75.0, 100.0, 200.0])
    w = np.array([np.interp(vkr, LW["curves"][str(int(i))]["vkr_V"], LW["curves"][str(int(i))]["line_width_mm"]) for i in I])
    p, c = np.polyfit(np.log(I), np.log(w), 1)
    return float(p), float(np.max(np.abs(np.log(w) - (p * np.log(I) + c))))
VKR = 45.0
BLOOM_P, BLOOM_MISFIT = bloom_power(VKR)
BLOOM_RANGE = [bloom_power(v)[0] for v in (30.0, 60.0)]
P39_VS_P4 = 0.75                                     # Philips T16 survey of screen phosphors: GR approx. 75 % of WW

# --- Spot and faceplate ---
HEIGHT_MM, WIDTH_MM = 201.0, 254.0                  # Philips 31 cm 90 deg useful screen
LINE_WIDTH_MM = HEIGHT_MM / 1300                    # shrinking-raster resolution
SIGMA_MM = LINE_WIDTH_MM / 2
N_GLASS, T_GLASS, GLASS_MM, R_SCREEN = 1.52, 0.50, 10.0, 0.50
# Halation: light emitted into the glass reflects at the front surface (fully
# beyond the critical angle, Fresnel below it) and lands back on the screen at
# r = 2 d tan(theta), attenuated along the slant path, then is re-emitted with
# the screen reflectance. Lambertian emission inside the glass.
def fresnel_internal(th):
    s = N_GLASS * math.sin(th)
    if s >= 1: return 1.0
    ct = math.sqrt(1 - s * s); ci = math.cos(th)
    rs = (N_GLASS * ci - ct) / (N_GLASS * ci + ct); rp = (N_GLASS * ct - ci) / (N_GLASS * ct + ci)
    return 0.5 * (rs * rs + rp * rp)
R_BINS = np.linspace(0, 60, 61)                     # mm on the monitor
halo = np.zeros(len(R_BINS) - 1)
ths = np.linspace(1e-4, math.pi / 2 - 1e-3, 200000); dth = ths[1] - ths[0]
for th in ths:
    r = 2 * GLASS_MM * math.tan(th)
    if r >= R_BINS[-1]: continue
    wgt = 2 * math.cos(th) * math.sin(th) * dth * fresnel_internal(th) * T_GLASS ** (2 / math.cos(th)) * R_SCREEN
    halo[int(r)] += wgt
halo_total = float(halo.sum())
# Ambient: room light through the glass to the screen and back (diffuse), plus
# the front surface's Fresnel reflection (normal incidence).
surface = ((N_GLASS - 1) / (N_GLASS + 1)) ** 2
ambient = R_SCREEN * T_GLASS ** 2 + surface

# Etched front: the Fresnel reflection is not spread evenly but blurred into a
# narrow lobe around the mirror direction. Philips' etched display glass
# (Nuijs & Horikx 1994, Table 1): gloss 69, specular reflectivity 0.014 of
# polished glass, rms roughness 75 nm. Gloss 69 = 69 % of polished glass's flux
# inside the 60 degree gloss meter's aperture (ASTM D523: 4.4 x 11.7 degrees);
# a Gaussian lobe holding the rest of that flux has sigma:
from scipy.special import erf as _erf
from scipy.optimize import brentq as _brentq
ETCH_GLOSS, ETCH_SPECULAR, ETCH_RMS_NM = 69, 0.014, 75
ETCH_APERTURE_DEG = (4.4, 11.7)
_lobe_in = (ETCH_GLOSS / 100 - ETCH_SPECULAR) / (1 - ETCH_SPECULAR)
ETCH_SIGMA_DEG = _brentq(lambda s: _erf(ETCH_APERTURE_DEG[0] / 2 / (s * 2 ** .5)) * _erf(ETCH_APERTURE_DEG[1] / 2 / (s * 2 ** .5)) - _lobe_in, .05, 30)

ROOM_LUX = 300.0
L_DIFFUSER = ROOM_LUX / math.pi                     # cd/m2 of a white diffuser
L_FULL = 68.5                                       # cd/m2, 20 fL

profile = {
 "profile": "crt-5151-p39", "model": "crt-raster",
 "name": "IBM 5151 monochrome display, P39 green phosphor (MDA raster)",
 "timing": {"dot_clock_hz": DOT_CLOCK, "dots_total": DOTS_TOTAL, "dots_visible": DOTS_VISIBLE,
            "lines_total": LINES_TOTAL, "lines_visible": LINES_VISIBLE,
            "line_s": r6(T_LINE * 1e6) / 1e6, "active_s": T_ACTIVE, "frame_s": T_FRAME,
            "horizontal_hz": r6(1 / T_LINE), "refresh_hz": r6(1 / T_FRAME),
            "ref": "IBM BIOS 6845 parameters for the MDA (R0 61h, R4 19h, R5 06h, R9 0Dh) and the 16.257 MHz dot clock; 5151: 50 Hz, 18.432 kHz, 350 lines (Wikipedia, IBM 5151)"},
 "drive": {"levels": [0, 1 / 3, 2 / 3, 1], "mapping": "level = floor(3 (1 - luma) + 0.5) / 3: dark art drives the beam",
           "ref": "MDA video pin = 2/3, intensity pin = 1/3 of the luminance (Wikipedia, IBM Monochrome Display Adapter). Content is free, so the TTL signal may switch anywhere along a line."},
 "phosphor": {"type": "P39 (GR), Zn2SiO4:Mn,As", "peak_nm": 525, "cie_xy": [X_, Y_],
              "efficiency_vs_P4": P39_VS_P4, "efficiency_ref": "Philips T16 1987 survey of screen phosphors: GR (P39) approx. 75 % of WW (P4) brightness",
              "layers": [{"name": "green", "cie_xy": [X_, Y_], "peak_nm": 525, "share": 1.0,
                          "display_rgb_per_Y": [0.0, 1 / 0.7152, 0.0], "gamut_desaturation": 0.0,
                          "display_note": "outside sRGB: shown on the display's green primary at its true luminance"}],
              "persistence_class": "long: 100 ms to 1 s to 10 %",
              "tau_mn_s": r6(TAU_MN), "trap_t0_s": r6(T0), "ripple_30hz": RIPPLE_30HZ,
              "impulse": {"amplitudes": [r6(a) for a in amps], "taus_s": [r6(b) for b in taus], "layer": [0] * K,
                          "fit_max_error_of_peak": r6(fit_err)},
              "derived": {"peak_after_s": r6(tt[ip]), "t10_s": r6(t10), "t1_s": r6(t1),
                          "t10_if_ripple_were_amplitude_s": None if t10_amp is None else r6(t10_amp),
                          "in_long_class": bool(0.1 <= t10 <= 1.0)},
              "facts": [
               ["Phosphor colour", "P39 (Zn2SiO4:Mn,As), 525 nm, x %s y %s (Philips). Outside sRGB: shown on the display's green primary" % (X_, Y_)],
               ["Afterglow (derived)", "builds up for %d ms, 10%% after %d ms, 1%% after %d ms; JEDEC class long (100 ms-1 s)" % (round(tt[ip] * 1e3), round(t10 * 1e3), round(t1 * 1e3))],
               ["Afterglow model", "Mn2+ decay from P1 (20 ms to 10%) fed by bimolecular trap release (IBM, 1985), its time solved from P39's measured 30 Hz flicker ratio (US 4,315,190)"]],
              "refs": ["Philips T16 1987 survey of screen phosphors (GR = P39: x 0.205, y 0.715; long = 100 ms-1 s)",
                       "Juestel, CRT Phosphors (P39 Zn2SiO4:Mn,As, 525 nm, long)",
                       "Jankowiak, CRT phosphors of interest to the experimenter (P1: 20 ms to 10 %, exponential)",
                       "Robbins, Caswell, Avouris, Giess, Chang, Dove, J. Electrochem. Soc. 1985 (bimolecular trap recombination in Zn2SiO4:Mn,As)",
                       "US 4,315,190 table 1 (commercial P39 ripple ratio 0.370 at 30 Hz)"]},
 "colour": {"srgb_linear_unclipped": [r6(v) for v in srgb_raw],
            "note": "P39 lies outside sRGB (red and blue would be negative). Shown on the sRGB green primary at the correct luminance; above the display's maximum green it clips, keeping the hue: a P39 screen never looks white."},
 "spot": {"sigma_mm": r6(SIGMA_MM), "line_width_mm": r6(LINE_WIDTH_MM),
          "ref": "Philips M31-336/338/350: about 1300 lines over 201 mm (shrinking raster, 68.5 cd/m2, phosphor W); flat-field pitch = 2 sigma",
          "line_count_height_note": "Philips measures the 1300 lines on a 216 x 162 mm raster without saying which height the count refers to; over 162 mm the line width would be 0.125 mm. 201 mm (the useful height) is used.",
          "bloom": {"power": r6(BLOOM_P), "power_range_30_60V": [r6(v) for v in BLOOM_RANGE], "fit_max_log_misfit": r6(BLOOM_MISFIT),
                    "vkr_V": VKR, "vkr_assumed": True, "min_drive_fraction": 0.25,
                    "model": "sigma(drive) = sigma_mm * (drive / efficiency_vs_P4) ** power; drive = beam signal relative to full drive, held at min_drive_fraction or above (the measured currents span a factor of 4)",
                    "ref": "Philips T16 1987, Resolution characteristics, Fig. 5 (M31-336..350, 12 kV): line width at 50, 75, 100, 200 uA, traced into tools/philips-m31-line-width.json"}},
 "raster": {"height_mm": HEIGHT_MM, "width_mm": WIDTH_MM, "pitch_mm": r6(HEIGHT_MM / LINES_VISIBLE), "assumed": True,
            "note": "raster assumed to fill the useful height of a Philips 31 cm 90 degree monitor tube; the 5151's own picture size is not published"},
 "faceplate": {"n": N_GLASS, "transmission": T_GLASS, "thickness_mm": GLASS_MM, "screen_reflectance": R_SCREEN,
               "curvature_radius_mm": 510.0, "curvature_ref": "Philips T16 1987, M31-336/338/350 data sheet: 510 mm radius of screen curvature (spherical, assumed)",
               "assumed": ["thickness_mm", "screen_reflectance"], "etched": True,
               "halation": {"r_mm": [r6(v) for v in R_BINS[:-1] + 0.5], "fraction": [r6(v) for v in halo], "total": r6(halo_total)},
               "ambient_reflectance": r6(ambient), "surface_reflectance": r6(surface),
               "etch": {"gloss": ETCH_GLOSS, "specular_fraction": ETCH_SPECULAR, "rms_roughness_nm": ETCH_RMS_NM,
                        "lobe_sigma_deg": r6(ETCH_SIGMA_DEG),
                        "model": "front reflection = Fresnel x (specular_fraction x mirror image of the room light + the rest blurred by a Gaussian lobe of lobe_sigma_deg)",
                        "derived": "gloss 69 = 69 % of polished glass's flux inside the 60 degree gloss aperture (4.4 x 11.7 degrees); the lobe holds that flux less the specular part",
                        "assumed": ["the gloss is the standard 60 degree geometry (ASTM D523)", "the lobe is Gaussian and the same at every angle", "the 5151's etch is like Philips' etched display glass"],
                        "ref": "Nuijs & Horikx, Diffraction and scattering at antiglare structures for display devices, Applied Optics 33 (1994) 4058, Table 1 (Philips Research; etched glass)"},
               "ref": "Philips T16 1987: light transmission about 50 % (normal tint), etched anti-glare option"},
 "luminance": {"full_drive_cd_m2": L_FULL, "room_lux": ROOM_LUX, "white_diffuser_cd_m2": r6(L_DIFFUSER),
               "full_drive_relative": r6(L_FULL / L_DIFFUSER), "assumed": True},
 "controls": {"contrast": {"min": 0.2, "max": 1, "value": 1, "note": "video gain (IBM: 'increases the brightness of the data')"},
              "brightness": {"min": 0, "max": 0.15, "value": 0, "note": "uniform beam on every line (IBM: 'increases the brightness of the entire screen'); fraction of full drive"}},
 "sources": {"geometry": {"glass_mm": GLASS_MM, "n_glass": N_GLASS, "rear_polarizer_mm": 0, "n_polarizer": 1.5}},
 "oblique": {"front_index": N_GLASS},
}
out = os.path.join(HERE, "..", "profiles", "crt-5151-p39.json")
json.dump(profile, open(out, "w"), separators=(",", ":"))
print("timing: line %.3f us, frame %.3f ms (%.3f Hz)" % (T_LINE * 1e6, T_FRAME * 1e3, 1 / T_FRAME))
print("P39: t0 %.2f ms, peak %.1f ms, t10 %.0f ms (amplitude reading would give %s), t1%% %.0f ms; fit error %.2f%% of peak" %
      (T0 * 1e3, tt[ip] * 1e3, t10 * 1e3, None if t10_amp is None else round(t10_amp * 1e3), t1 * 1e3, fit_err * 100))
print("taus ms", np.round(taus * 1e3, 2), "amps", np.round(amps, 3))
print("sRGB raw", np.round(srgb_raw, 3), "pitch mm", HEIGHT_MM / LINES_VISIBLE, "sigma mm", SIGMA_MM, "sigma/pitch", SIGMA_MM / (HEIGHT_MM / LINES_VISIBLE))
print("halation total %.4f, ambient %.3f, full drive rel %.3f" % (halo_total, ambient, L_FULL / L_DIFFUSER))

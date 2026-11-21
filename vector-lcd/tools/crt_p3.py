"""Builds profiles/crt-5151-p3.json: the IBM 5151 monitor of crt-5151-p39.json
with a P3 amber phosphor in place of its P39.

    python3 tools/crt_p3.py           (NumPy; under a second)

The monitor (MDA timing, spot, faceplate, knobs, room) is taken unchanged from
profiles/crt-5151-p39.json, so build that first. Only the phosphor changes.
Every number is sourced, derived from sourced numbers, or labelled assumed.

P3
- Zinc beryllium silicate with manganese, Zn8BeSi5O19:Mn; yellow fluorescence
  and phosphorescence; emission peak 602 nm, range 504-700 nm (points at 10 %
  of the peak); 13 ms to 10 % (Jankowiak, Cathode Ray Tube Phosphors Of
  Interest To The Experimenter, after JEDEC/EIA and Tektronix).
- Decay shape: exponential. Jankowiak lists P3 among the exponential-decay
  screens (P1, P3, P12, P13); Mn2+ emission is a single forbidden transition.
  RCA's zinc beryllium silicate with manganese (33-Z-5C) falls to 10 % in
  12.5 ms (RCA TPM-1508A, 1961, p. 8), which agrees.
- "Amber monochrome" monitors are commonly said to use P3 (Wikipedia,
  Monochrome monitor). Many 1980s amber monitors used P134 instead (Wyse
  specifications; a 1989 Samsung-built monitor); no P134 data is published
  outside the paid EIA TEP-116, so P3 is modelled and labelled as P3.

Derived
- Colour: no measured P3 chromaticity was found. The emission band is taken as
  a Gaussian in wavelength through the three published points (peak 602 nm,
  10 % at 504 and 700 nm: symmetric, so the fit is exact), and its CIE 1931
  2-degree chromaticity is computed. The same band as a Gaussian in photon
  energy (the usual shape of an Mn2+ band) through the two 10 % points gives
  a second colour; the difference is stored as the colour's uncertainty.

Assumed
- Luminance at full drive as for the P39 profile (68.5 cd/m2): no P3 screen
  luminance under these conditions was found.
"""
import json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
r7 = lambda v: float("%.7g" % float(v))

BASE = json.load(open(os.path.join(HERE, "..", "profiles", "crt-5151-p39.json")))
CIE = json.load(open(os.path.join(HERE, "cie-1931-d65.json")))

PEAK_NM, LO_NM, HI_NM = 602.0, 504.0, 700.0          # Jankowiak: peak and 10 % points
T10_S = 0.013                                         # Jankowiak: time to 10 %
TAU = T10_S / math.log(10)


# ===========================================================================
# Colour from the emission band
# ===========================================================================

wl = np.arange(360.0, 831.0, 0.5)
cmf = np.array([np.interp(wl, CIE["wavelengths_nm"], np.array(CIE["cmf_xyz"])[:, k]) for k in range(3)])

def chromaticity(spectrum):
    X, Y, Z = (cmf * spectrum).sum(1)
    return np.array([X, Y]) / (X + Y + Z)

# Gaussian in wavelength through peak and both 10 % points (exact: the points are symmetric)
sigma_nm = (HI_NM - LO_NM) / 2 / math.sqrt(2 * math.log(10))
band_wl = np.exp(-0.5 * ((wl - PEAK_NM) / sigma_nm) ** 2)
xy = chromaticity(band_wl)

# Gaussian in photon energy through the two 10 % points (peak follows from them)
e = 1239.84 / wl
e_lo, e_hi = 1239.84 / HI_NM, 1239.84 / LO_NM
e0 = (e_lo + e_hi) / 2
sigma_e = (e_hi - e_lo) / 2 / math.sqrt(2 * math.log(10))
band_e = np.exp(-0.5 * ((e - e0) / sigma_e) ** 2) * e ** 2 / 1239.84   # per unit wavelength
xy_energy = chromaticity(band_e)
peak_energy_nm = 1239.84 / e0
xy_spread = float(np.hypot(*(xy - xy_energy)))

# Dominant wavelength: where the line from illuminant C through the colour meets the spectrum locus
locus = np.array([chromaticity(np.where(np.abs(wl - w) < 0.25, 1.0, 0.0)) for w in wl[(wl >= 480) & (wl <= 700)]])
white = np.array([0.3101, 0.3162])
direction = (xy - white) / np.linalg.norm(xy - white)
to_locus = locus - white
angle = np.abs(np.arctan2(to_locus[:, 1], to_locus[:, 0]) - math.atan2(direction[1], direction[0]))
dominant_nm = float(wl[(wl >= 480) & (wl <= 700)][int(np.argmin(angle))])

M = np.array([[3.2404542, -1.5371385, -0.4985314], [-0.9692660, 1.8760108, 0.0415560], [0.0556434, -0.2040259, 1.0572252]])
rgb = M @ np.array([xy[0] / xy[1], 1.0, (1 - xy[0] - xy[1]) / xy[1]])


# ===========================================================================
# Profile
# ===========================================================================

profile = {k: v for k, v in BASE.items()}
profile.update({
 "profile": "crt-5151-p3",
 "name": "IBM 5151 monochrome display with a P3 amber phosphor (MDA raster)",
 "phosphor": {
  "type": "P3: Zn8BeSi5O19:Mn (zinc beryllium silicate)",
  "peak_nm": PEAK_NM, "range_10pct_nm": [LO_NM, HI_NM],
  "cie_xy": [r7(xy[0]), r7(xy[1])],
  "persistence_class": "medium: 13 ms to 10 %",
  "layers": [{"name": "amber", "cie_xy": [r7(xy[0]), r7(xy[1])], "peak_nm": PEAK_NM, "share": 1.0,
              "display_rgb_per_Y": [r7(v) for v in rgb]}],
  "impulse": {"amplitudes": [r7(1 / TAU)], "taus_s": [r7(TAU)], "layer": [0]},
  "derived": {"t10_s": T10_S, "tau_s": r7(TAU), "band_sigma_nm": r7(sigma_nm),
              "colour_if_energy_gaussian": [r7(xy_energy[0]), r7(xy_energy[1])], "energy_gaussian_peak_nm": r7(peak_energy_nm),
              "colour_uncertainty_xy": r7(xy_spread), "dominant_wavelength_nm": dominant_nm},
  "facts": [
   ["Phosphor", "P3: zinc beryllium silicate with manganese (Zn8BeSi5O19:Mn); yellow fluorescence and phosphorescence (JEDEC/EIA, via Jankowiak)"],
   ["Emission (measured)", "peak 602 nm; 10 % of the peak at 504 and 700 nm"],
   ["Decay (measured)", "exponential (one Mn2+ transition), 13 ms to 10 %; RCA's zinc beryllium silicate gives 12.5 ms"],
   ["Colour (derived)", "x %.3f y %.3f, dominant %.0f nm: CIE 1931 colour of a band through the three published points. As a band in photon energy instead: x %.3f y %.3f" % (xy[0], xy[1], dominant_nm, xy_energy[0], xy_energy[1])],
   ["Display", "just outside sRGB: moved toward grey at its true luminance where needed"],
   ["Afterglow", "short: a moving piece leaves almost no trail; the light ripples at 50 Hz on a real tube (not visible here: the display shows the average over each refresh)"],
   ["Context", "amber monitors are commonly said to use P3; many 1980s amber monitors used P134, which has no published data"],
   ["Brightness (assumed)", "the same full-drive luminance as the P39 profile; none published for P3"]
  ],
  "refs": ["Jankowiak, Cathode Ray Tube Phosphors Of Interest To The Experimenter (P3: 602 nm, 504-700 nm, 13 ms, Zn8BeSi5O19:Mn; exponential-decay screens P1, P3, P12, P13)",
           "RCA TPM-1508A Phosphors for Cathode-Ray Tubes (Oct 1961): zinc beryllium silicate:Mn, 12.5 ms to 10 %",
           "Wikipedia, Monochrome monitor (P3 amber)"]
 },
 "colour": {"note": "One layer; its true linear-sRGB colour per unit luminance (blue slightly negative: just outside the display), brought into the gamut per pixel."}
})
out = os.path.join(HERE, "..", "profiles", "crt-5151-p3.json")
json.dump(profile, open(out, "w"), separators=(",", ":"))

print("P3 band: sigma %.1f nm; colour x %.4f y %.4f, dominant %.0f nm" % (sigma_nm, *xy, dominant_nm))
print("as an energy Gaussian: peak %.0f nm, colour x %.4f y %.4f (spread %.4f)" % (peak_energy_nm, *xy_energy, xy_spread))
print("linear sRGB per Y:", np.round(rgb, 4), " tau %.2f ms" % (TAU * 1e3))

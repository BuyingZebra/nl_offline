"""Builds profiles/crt-1084s-p22.json: a Commodore 1084S colour monitor (Philips
M34EAQ slot-mask tube, P22 phosphors, PAL 50 Hz) for the Vector LCD screen test.

    python3 tools/crt_1084s.py          (NumPy and SciPy; a few seconds)

Every number is sourced, derived from sourced numbers, or labelled assumed.

Sources
- Commodore 1084S: 14 in (13 in viewable) tube, slotted triplet pitch 0.42 mm,
  90 degree deflection, 640 x 256 (PAL) at 50 Hz, 15 625 Hz lines, analogue RGB
  0.7 V p-p (Commodore 1084S manual, technical specifications).
- Tube: Philips M34EAQ01X / 10X, slot triplet pitch 0.42 mm, 25 kV (Philips
  CM8833-II and CM11342 service manuals; Commodore part lists).
- P22 impulse responses: Kuhn, Optical Time-Domain Eavesdropping Risks of CRT
  Displays (IEEE S&P 2002), fitted to photomultiplier measurements of a P22
  monitor: red six exponentials; green and blue three exponentials plus a
  power-law tail.
- Colours: EBU Tech 3213 phosphor primaries (the European P22 set):
  R 0.64, 0.33; G 0.29, 0.60; B 0.15, 0.06; white D65.
- Video: a CRT's light follows the signal to the power 2.4 (ITU-R BT.1886).
- PAL timing: 64 us lines, 52 us active, 312 lines per 50 Hz field; about 288
  lines fill the picture height, of which a 256-line Amiga picture is shown.

Assumed (labelled in the profile)
- Spot size: no M34EAQ figure is published; sigma 0.25 mm at full drive.
- The faceplate (tint, thickness, etch), room, brightness and bloom law are the
  5151 profile's (crt-5151-p39.json); the full-drive luminance is 100 cd/m2.
"""
import json, math, os
import numpy as np
from scipy.optimize import least_squares

HERE = os.path.dirname(os.path.abspath(__file__))
base = json.load(open(os.path.join(HERE, "..", "profiles", "crt-5151-p39.json")))
r6 = lambda v: float(f"{v:.7g}")

# --- PAL timing (Amiga low resolution, non-interlaced) ---
LINE_S, ACTIVE_S, LINES_TOTAL, LINES = 64e-6, 52e-6, 312, 256
FRAME_S = LINE_S * LINES_TOTAL
PICTURE_H_MM, PICTURE_LINES = 13 * 25.4 * 3 / 5, 288      # 13 in 4:3 viewable: 198 mm tall
PITCH_MM = PICTURE_H_MM / PICTURE_LINES

# --- P22 impulse responses (Kuhn 2002), per volt of drive ---
w = lambda f: 2 * math.pi * f
EXPS = {
    "red": [(4, w(360)), (1.75, w(1.6e3)), (2, w(8e3)), (2.25, w(25e3)), (15, w(700e3)), (29, w(7e6))],
    "green": [(37, w(150e3)), (100, w(700e3)), (90, w(5e6))],
    "blue": [(75, w(100e3)), (1000, w(1.1e6)), (1100, w(4e6))],
}
TAIL = {"green": (210e-6, 5.5e-6, 1.1), "blue": (190e-6, 5e-6, 1.11)}

def energy(colour, t0, t1):
    """Light emitted between t0 and t1 after one hit (exact)."""
    e = sum(a / k * (math.exp(-k * t0) - math.exp(-k * t1)) for a, k in EXPS[colour])
    if colour in TAIL:
        a, s, b = TAIL[colour]
        e += a / (b - 1) * ((t0 + s) ** (1 - b) - (t1 + s) ** (1 - b))
    return e

FAST_TAU = 1e-5          # a component this fast lands its light in the hit's own frame
components = {}
for colour in ("red", "green", "blue"):
    if colour == "red":
        # Practically all red light is gone within 1-2 ms: one exponential carrying
        # all of it, at the slowest measured time constant (442 us).
        total = energy("red", 0, math.inf)
        k = w(360)
        components[colour] = [(total * k, 1 / k)]
        continue
    # Slow tail: three exponentials fitted to the light in later frames, at
    # log-spaced frames from 1 to 250 (5 s), so the first frames weigh as much as the late ones.
    frames = np.unique(np.round(np.logspace(0, np.log10(250), 40)).astype(int))
    later = np.array([energy(colour, n * FRAME_S, (n + 1) * FRAME_S) for n in frames])
    def model(p):
        q, n = np.exp(p), frames
        win = lambda a, t: a * t * (np.exp(-n * FRAME_S / t) - np.exp(-(n + 1) * FRAME_S / t))
        return sum(win(q[2 * j], q[2 * j + 1]) for j in range(3))
    fit = least_squares(lambda p: np.log(model(p)) - np.log(later), np.log([1e-2, .03, 1e-3, .3, 1e-4, 3.0]))
    q = np.exp(fit.x)
    slow = sorted([(q[2 * j], q[2 * j + 1]) for j in range(3)], key=lambda c: c[1])
    misfit = float(np.max(np.abs(fit.fun)))
    # Fast part: whatever the hit's own frame holds beyond the slow terms.
    first = energy(colour, 0, FRAME_S) - sum(a * t * (1 - math.exp(-FRAME_S / t)) for a, t in slow)
    components[colour] = [(first / FAST_TAU, FAST_TAU)] + slow
    components[colour + "_misfit"] = misfit

# --- Colours and white balance: equal drive gives D65 at full luminance ---
XY = {"red": (.64, .33), "green": (.29, .60), "blue": (.15, .06)}
W = (.3127, .3290)
xyz = lambda x, y: np.array([x / y, 1, (1 - x - y) / y])
M = np.column_stack([xyz(*XY[c]) for c in ("red", "green", "blue")])
Y_share = np.linalg.solve(M, xyz(*W))                    # luminance of each primary in white
SRGB = np.array([[3.2404542, -1.5371385, -.4985314], [-.969266, 1.8760108, .041556], [.0556434, -.2040259, 1.0572252]])

layers, amps, taus, of = [], [], [], []
for i, colour in enumerate(("red", "green", "blue")):
    comps = components[colour]
    steady = sum(a * t for a, t in comps)                 # light per frame under steady unit drive
    scale = Y_share[i] / steady
    for a, t in comps:
        amps.append(r6(a * scale)); taus.append(r6(t)); of.append(i)
    rgb = SRGB @ (xyz(*XY[colour]))
    layers.append({"name": colour, "cie_xy": list(XY[colour]), "share": r6(Y_share[i]),
                   "display_rgb_per_Y": [r6(v) for v in rgb]})

# Second-frame light relative to the hit's frame (the trail a still screen does not show).
trail = {c: r6(energy(c, FRAME_S, 2 * FRAME_S) / energy(c, 0, FRAME_S)) for c in ("red", "green", "blue")}

profile = {k: base[k] for k in ("faceplate", "sources", "oblique")}
profile["faceplate"] = {**base["faceplate"], "curvature_radius_mm": None,
                        "curvature_ref": "no M34EAQ figure: drawn flat (assumed)"}
profile.update({
 "profile": "crt-1084s-p22", "model": "crt-raster",
 "name": "Commodore 1084S colour monitor, P22 slot-mask tube (PAL RGB)",
 "timing": {"line_s": LINE_S, "active_s": ACTIVE_S, "frame_s": FRAME_S, "lines_total": LINES_TOTAL,
            "lines_visible": LINES, "horizontal_hz": 1 / LINE_S, "refresh_hz": 1 / FRAME_S,
            "ref": "PAL: 64 us lines, 52 us active, 312 lines per 50 Hz field; Amiga 640 x 256 (Commodore 1084S manual)"},
 "drive": {"mode": "rgb", "gamma": 2.4, "levels": None,
           "mapping": "each gun's beam current = (signal)^2.4, signal = the art's sRGB channel (analogue RGB 0.7 V p-p)",
           "ref": "ITU-R BT.1886 (CRT reference: gamma 2.4); Commodore 1084S manual (analogue RGB input)"},
 "phosphor": {
  "type": "P22 (EBU set): Y2O2S:Eu red, ZnS:Cu,Al green, ZnS:Ag blue",
  "efficiency_vs_P4": 1.0, "efficiency_ref": "assumed: no per-tube figure",
  "layers": layers,
  "impulse": {"amplitudes": amps, "taus_s": taus, "layer": of},
  "derived": {"next_frame_light": trail, "tail_fit_max_log_misfit": {c: r6(components[c + "_misfit"]) for c in ("green", "blue")},
              "luminance_shares": {c: r6(v) for c, v in zip(("red", "green", "blue"), Y_share)}},
  "facts": [
   ["Phosphors", "P22: red Y2O2S:Eu, green ZnS:Cu,Al, blue ZnS:Ag"],
   ["Colours", "EBU Tech 3213: red 0.64, 0.33; green 0.29, 0.60; blue 0.15, 0.06; balanced to D65 white"],
   ["Decay (measured)", "Kuhn 2002, photomultiplier fits of a P22 monitor: red gone within 1-2 ms; green and blue have a slow power-law tail"],
   ["Afterglow", "the frame after a hit still shows %.1f %% (green) and %.1f %% (blue) of its light: faint trails in a dark room; red none"
    % (trail["green"] * 100, trail["blue"] * 100)],
  ],
  "refs": ["Kuhn, Optical Time-Domain Eavesdropping Risks of CRT Displays, IEEE Symposium on Security and Privacy 2002",
           "EBU Tech 3213, Chromaticity tolerances for studio monitors"]},
 "colour": {"note": "Three layers in linear light, balanced so equal drive gives D65 white."},
 "spot": {"sigma_mm": .25, "line_width_mm": .5, "assumed": True,
          "note": "no spot size is published for the M34EAQ; sigma 0.25 mm at full drive (assumed)",
          "bloom": base["spot"]["bloom"]},
 "raster": {"height_mm": r6(LINES * PITCH_MM), "width_mm": r6(PICTURE_H_MM * 4 / 3), "pitch_mm": r6(PITCH_MM),
            "note": "288 lines fill the 198 mm picture height of a 13 in viewable 4:3 tube; the panel shows the 256-line picture"},
 "mask": {"type": "slot", "triplet_pitch_mm": .42, "order": ["red", "green", "blue"],
          "note": "vertical R G B phosphor stripes of equal width; the slots' bridges are not modelled",
          "ref": "Commodore 1084S manual; Philips CM8833-II service manual (M34EAQ, slot triplet pitch 0.42 mm)"},
 "luminance": {**base["luminance"], "full_drive_cd_m2": 100.0,
               "full_drive_relative": r6(100.0 / base["luminance"]["white_diffuser_cd_m2"]), "assumed": True},
 "controls": base["controls"],
 "monitor": {"facts": [
  ["Monitor", "Commodore 1084S: 14 in (13 in viewable), 90°, Philips M34EAQ slot-mask tube, 25 kV"],
  ["Scan (PAL)", "15.625 kHz lines, 50 Hz frames, 256-line picture (Amiga) within 288 visible lines"],
  ["Signal", "analogue RGB 0.7 V p-p; each gun's beam follows the signal to the power 2.4 (BT.1886)"],
  ["Mask", "slot mask, 0.42 mm triplet pitch: vertical red, green and blue stripes, drawn where this display gives each stripe 2 or more pixels"],
  ["Faceplate and room (assumed)", "the 5151 profile's glass, etch and room; full drive 100 cd/m2"],
 ]},
})
out = os.path.join(HERE, "..", "profiles", "crt-1084s-p22.json")
json.dump(profile, open(out, "w"), separators=(",", ":"))
print("frame %.2f ms, pitch %.3f mm, shares %s" % (FRAME_S * 1e3, PITCH_MM, np.round(Y_share, 4)))
print("components", [(c, [(r6(a), r6(t)) for a, t in components[c]]) for c in ("red", "green", "blue")])
print("next-frame light", trail, "misfit", components["green_misfit"], components["blue_misfit"])

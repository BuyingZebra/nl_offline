"""Builds profiles/crt-5151-p7.json: the IBM 5151 monitor of crt-5151-p39.json
with a P7 screen in place of its P39 phosphor.

    python3 tools/crt_p7.py           (NumPy and SciPy; a few seconds)

The monitor (MDA timing, spot, faceplate, knobs, room) is taken unchanged from
profiles/crt-5151-p39.json, so build that first. Only the phosphor changes.
Every number is sourced, derived from sourced numbers, or labelled assumed.

P7: a cascade (two-layer) screen
- Layers: purplish-blue ZnS:Ag (RCA 33-Z-20C) cascaded on yellowish-green
  (Zn,Cd)S:Cu (RCA 33-Z-21B). The beam excites the blue layer; the yellow
  layer is excited mainly by the blue light (RCA TPM-1508A, 1961, pp. 6, 18;
  Dyall, MIT RLE TR 56, 1948).
- Colours: blue x 0.151, y 0.032, peak 435 nm; yellow-green x 0.357, y 0.537,
  peak 555 nm (RCA TPM-1508A p. 7 and p. 13).
- Persistence: blue 25 to 75 us to 10 %; yellow-green 400 ms to 10 %
  (RCA p. 6). Curve shapes: RCA p. 13 persistence chart (tube 5ABP7, 3 kV),
  traced into tools/rca-p7-persistence.json.

Derived
- Each layer's decay after steady excitation is fitted with exponentials:
  S(t) = sum w_i exp(-t / tau_i). For a linear screen this is the step-off
  response, so the impulse response is h(t) = sum (w_i / tau_i) exp(-t / tau_i),
  with unit light per unit excitation.
- Beyond 400 ms (the end of RCA's chart), the yellow-green decay continues at
  the chart's own final log-log slope (fitted over 200 ms to the end), to
  60 s. RCA: the screen "persists for several minutes" (assumed shape).
- Colour balance: RCA's per-layer brightness (p. 7) is measured on each
  powder alone, not through a finished screen. RCA describes the finished
  screen's light during excitation as white (p. 18). The blue and yellow-green
  chromaticities mix closest to white (illuminant C, the reference white of
  the time, in the CIE 1960 UCS) at one luminance ratio; that ratio is used.

Known gaps (recorded in the profile)
- P7 is not linear. A linear screen with RCA's steady-excitation decay
  matches MIT's single-flash decay from 10 to 100 ms, but after 100 ms MIT's
  single flashes fade much more slowly (about one decade per decade to 10 s);
  no linear screen fits both, and MIT also finds that repeated flashes build
  up more than they add. The renderer is linear, so it follows RCA, which
  matches a raster that hits each point steadily. The comparison is stored.
- P7 was a radar phosphor; here it is driven like the 5151's raster.
"""
import json, math, os
import numpy as np
from scipy.optimize import least_squares

HERE = os.path.dirname(os.path.abspath(__file__))
r6 = lambda v: float("%.7g" % float(v))      # 7 significant figures: the blue time constant is ~2e-5 s

BASE = json.load(open(os.path.join(HERE, "..", "profiles", "crt-5151-p39.json")))
TRACE = json.load(open(os.path.join(HERE, "rca-p7-persistence.json")))

BLUE_XY, YELLOW_XY = (0.151, 0.032), (0.357, 0.537)
WHITE_C = (0.3101, 0.3162)                          # CIE illuminant C
RCA_T10_S = 0.400


# ===========================================================================
# Decay fits
# ===========================================================================

def fit_exponentials(t, s, k, tau_range, seeds=24):
    """Non-negative weights w and time constants tau with sum(w) = 1 that fit
    S(t) in relative (log) error."""
    def model(p, x):
        w = np.exp(p[:k]); tau = np.exp(p[k:])
        return (w[:, None] * np.exp(-x[None, :] / tau[:, None])).sum(0) / w.sum()
    best = None
    for seed in range(seeds):
        rng = np.random.default_rng(seed)
        tau0 = np.sort(np.geomspace(*tau_range, k) * np.exp(rng.normal(0, .25, k)))
        p0 = np.concatenate([rng.normal(0, 1, k), np.log(tau0)])
        r = least_squares(lambda p: np.log(model(p, t)) - np.log(s), p0, max_nfev=40000,
                          bounds=(np.concatenate([np.full(k, -30), np.full(k, np.log(1e-4))]),
                                  np.concatenate([np.full(k, 30), np.full(k, np.log(600))])))
        if best is None or r.cost < best.cost: best = r
    w = np.exp(best.x[:k]); tau = np.exp(best.x[k:])
    order = np.argsort(tau)
    w, tau = w[order] / w.sum(), tau[order]
    err = float(np.max(np.abs(np.log(model(best.x, t) / s))))
    return w, tau, err

# Yellow-green: RCA trace 0-400 ms (100 % at t = 0), then the late-time slope to 60 s.
yt = np.array(TRACE["yellow_green_B"]["t_ms"]) / 1000
ys = np.array(TRACE["yellow_green_B"]["relative"]) / 100
late = yt >= 0.2
LATE_SLOPE = float(-np.polyfit(np.log10(yt[late]), np.log10(ys[late]), 1)[0])   # the chart's own final slope
t_end, s_end = float(yt[-1]), float(ys[-1])
tail_t = np.geomspace(t_end * 1.25, 60, 25)
tail_s = s_end * (t_end / tail_t) ** LATE_SLOPE
Yt = np.concatenate([[0.0], yt, tail_t])
Ys = np.concatenate([[1.0], ys, tail_s])
wY, tauY, errY = fit_exponentials(Yt, Ys, 6, (0.005, 30))

# Purplish-blue: RCA trace, one exponential (it is over long before one line is drawn).
bt = np.array(TRACE["purplish_blue_A"]["t_ms"]) / 1000
bs = np.array(TRACE["purplish_blue_A"]["relative"]) / 100
t10_blue = float(np.interp(0.1, bs[::-1], bt[::-1]))
tauB = t10_blue / math.log(10)

def step_off(w, tau, t):
    return (w[:, None] * np.exp(-np.atleast_1d(t)[None, :] / tau[:, None])).sum(0)

t10_yellow = float(np.interp(-1, np.log10(step_off(wY, tauY, np.geomspace(1e-3, 60, 4000)))[::-1], np.geomspace(1e-3, 60, 4000)[::-1]))


# ===========================================================================
# Colour balance: closest to white during steady excitation
# ===========================================================================

def uv(x, y):                                        # CIE 1960 UCS
    d = -2 * x + 12 * y + 3
    return np.array([4 * x / d, 6 * y / d])

def mix_xy(y_blue, y_yellow):
    X = y_blue * BLUE_XY[0] / BLUE_XY[1] + y_yellow * YELLOW_XY[0] / YELLOW_XY[1]
    Z = y_blue * (1 - sum(BLUE_XY)) / BLUE_XY[1] + y_yellow * (1 - sum(YELLOW_XY)) / YELLOW_XY[1]
    Y = y_blue + y_yellow
    return X / (X + Y + Z), Y / (X + Y + Z)

fractions = np.linspace(0.001, 0.5, 20000)            # blue share of the luminance
distance = [np.linalg.norm(uv(*mix_xy(f, 1 - f)) - uv(*WHITE_C)) for f in fractions]
SHARE_BLUE = float(fractions[int(np.argmin(distance))])
SHARE_YELLOW = 1 - SHARE_BLUE
steady_xy = mix_xy(SHARE_BLUE, SHARE_YELLOW)


# ===========================================================================
# Display colours: linear sRGB per unit luminance
# ===========================================================================

M = np.array([[3.2404542, -1.5371385, -0.4985314], [-0.9692660, 1.8760108, 0.0415560], [0.0556434, -0.2040259, 1.0572252]])

def linear_srgb(xy):
    """Linear sRGB of unit luminance; negative channels lie outside the display.
    Layers are mixed in this space, and only the mixed colour of each pixel is
    brought into the gamut (screens/crt/model.js intoGamut)."""
    x, y = xy
    return M @ np.array([x / y, 1.0, (1 - x - y) / y])

rgb_blue, rgb_yellow = linear_srgb(BLUE_XY), linear_srgb(YELLOW_XY)
steady_rgb = SHARE_BLUE * rgb_blue + SHARE_YELLOW * rgb_yellow


# ===========================================================================
# The renderer's components: luminance per unit excitation, per layer
# ===========================================================================

# Impulse h(t) = sum a_i exp(-t / tau_i) with sum a_i tau_i = layer share.
amps = [SHARE_BLUE / tauB] + list(SHARE_YELLOW * wY / tauY)
taus = [tauB] + list(tauY)
layer = [0] + [1] * len(tauY)

# Single-flash check against MIT (1/60 s raster): light 10 ms vs 100 ms after it ends.
def flash(t, dur=1 / 60):
    return sum(a * tau * (math.exp(-t / tau) - math.exp(-(t + dur) / tau)) for a, tau in zip(amps[1:], taus[1:]))
MIT_D = {0.01: 541.5, 0.1: 440.0, 1.0: 354.5, 10.0: 264.0}   # cb, mean of the two 5FP7 tubes, Table 3
single_flash = [{"from_s": a, "to_s": b, "model_decades": r6(math.log10(flash(a) / flash(b))), "mit_decades": r6((MIT_D[a] - MIT_D[b]) / 100)}
                for a, b in [(0.01, 0.1), (0.1, 1.0), (1.0, 10.0)]]


profile = {k: v for k, v in BASE.items()}
profile.update({
 "profile": "crt-5151-p7",
 "name": "IBM 5151 monochrome display with a P7 screen (MDA raster)",
 "phosphor": {
  "type": "P7: ZnS:Ag cascaded on (Zn,Cd)S:Cu",
  "efficiency_vs_P4": r6(45 / 70), "efficiency_ref": "Tektronix relative luminance (via Jankowiak): P7 45, P4 70",
  "cie_xy": [r6(steady_xy[0]), r6(steady_xy[1])],
  "persistence_class": "blue: medium short (25-75 us); yellow-green: long (400 ms to 10 %)",
  "layers": [
   {"name": "purplish-blue", "cie_xy": list(BLUE_XY), "peak_nm": 435, "share": r6(SHARE_BLUE),
    "display_rgb_per_Y": [r6(v) for v in rgb_blue]},
   {"name": "yellowish-green", "cie_xy": list(YELLOW_XY), "peak_nm": 555, "share": r6(SHARE_YELLOW),
    "display_rgb_per_Y": [r6(v) for v in rgb_yellow]}
  ],
  "impulse": {"amplitudes": [r6(a) for a in amps], "taus_s": [r6(t) for t in taus], "layer": layer,
              "fit_max_log_error": {"yellow_green": r6(errY)}},
  "derived": {"t10_blue_s": r6(t10_blue), "t10_s": r6(t10_yellow),
              "steady_xy": [r6(steady_xy[0]), r6(steady_xy[1])],
              "steady_linear_srgb_per_Y": [r6(v) for v in steady_rgb],
              "late_slope_after_chart": r6(LATE_SLOPE), "single_flash_vs_mit": single_flash},
  "facts": [
   ["Phosphor", "P7 cascade screen: purplish-blue ZnS:Ag on yellowish-green (Zn,Cd)S:Cu; the beam excites the blue layer, the blue light excites the yellow (RCA 1961; MIT 1948)"],
   ["Colours (measured)", "blue x 0.151 y 0.032, 435 nm; yellow-green x 0.357 y 0.537, 555 nm (RCA TPM-1508A)"],
   ["Decay (measured)", "blue 10 %% after %.0f us; yellow-green 10 %% after %.0f ms (RCA 5ABP7 persistence chart, traced)" % (t10_blue * 1e6, t10_yellow * 1e3)],
   ["Late afterglow (assumed)", "past the end of RCA's chart, the yellow-green continues at the chart's final slope (%.2f decades per decade)" % LATE_SLOPE],
   ["Colour balance (derived)", "blue %.1f %% of the luminance during excitation: the mix closest to white (illuminant C), as RCA describes the screen's fluorescence" % (SHARE_BLUE * 100)],
   ["Display", "the layers mix in linear light; the steady colour lies inside sRGB. Only a colour outside it (the bare blue flash) is moved toward grey at its true luminance"],
   ["Known gap", "P7 is not linear: after 100 ms, a single flash glows longer (MIT 1948), and repeated flashes build up more, than this linear model shows; it follows RCA's steady-excitation decay, which fits a raster"],
   ["Context", "P7 was a radar phosphor; here it is driven by the 5151's raster and spot"]
  ],
  "refs": ["RCA TPM-1508A Phosphors for Cathode-Ray Tubes (Oct 1961): pp. 6-7, 13, 18",
           "W. T. Dyall, A Study of the Persistence Characteristics of Various Cathode Ray Tube Phosphors, MIT RLE Technical Report 56 (1948): Table 3, sections VI-VII"]
 },
 "colour": {"note": "Two layers, each with its true linear-sRGB colour per unit luminance (phosphor.layers; negative = outside the display). Mixed per pixel, then brought into the gamut."}
})
out = os.path.join(HERE, "..", "profiles", "crt-5151-p7.json")
json.dump(profile, open(out, "w"), separators=(",", ":"))

print("yellow-green: taus ms", np.round(tauY * 1e3, 2), "weights", np.round(wY, 4), "max log error %.3f" % errY)
print("t10: blue %.1f us, yellow-green %.0f ms (RCA 400 ms)" % (t10_blue * 1e6, t10_yellow * 1e3))
print("balance: blue %.2f %% of luminance, steady colour x %.4f y %.4f" % (SHARE_BLUE * 100, *steady_xy))
print("linear sRGB per Y: blue", np.round(rgb_blue, 3), "yellow", np.round(rgb_yellow, 3), "steady", np.round(steady_rgb, 3))
print("late slope after the chart: %.3f" % LATE_SLOPE)
for f in single_flash: print("single flash %.2f-%.2f s: model %.2f decades, MIT %.2f" % (f["from_s"], f["to_s"], f["model_decades"], f["mit_decades"]))

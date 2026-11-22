"""Builds profiles/vectrex.json: the Vectrex's built-in vector display, for the
Vector LCD screen test.

    python3 tools/vectrex.py

Every number is sourced, derived from sourced numbers, or labelled assumed.

Sources
- Tube: Samsung 240RB40, 9 in (240 mm diagonal), 90 degree, an off-the-shelf
  black-and-white TV tube; continuous phosphor, no mask (Vectrex service manual,
  via the Vectrex wiki and crtgang).
- A display round is 30 000 cycles of the 1.5 MHz 6809: exactly 1/50 s; the
  BIOS waits for it (Malban, Vectrex tutorial II).
- A vector is drawn at a set strength (beam speed) for a set time (the scale,
  VIA timer cycles); its length is their product. Drawing slower is brighter;
  the beam leaves a bright dot at the end of lines (Malban; Vectrex32 manual).
- Budget: roughly 200 to 400 vectors per 1/50 s frame before the refresh slows
  and the picture flickers (Roger Boesch, via crtgang).

Derived
- Per-vector time: 1/50 s over the middle of that budget (300 vectors), 66.7 us,
  covering the drawing, the BIOS's per-vector work and the beam's moves.

Assumed (labelled in the profile)
- Phosphor: P4 (white), the standard black-and-white TV phosphor; much faster
  than a frame, so each frame shows the lines drawn in it.
- Picture 144 x 192 mm (portrait 3:4 within the 240 mm diagonal).
- Beam speed: every line drawn at one speed, 1.13 mm/us on the tube (strength
  127 for scale 127 crossing half the picture height); spot sigma 0.3 mm; the
  end-of-line dot equals 2 cycles of a stopped beam.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
CLOCK_HZ, ROUND_CYCLES = 1.5e6, 30000
FRAME_S = ROUND_CYCLES / CLOCK_HZ
VECTORS_PER_FRAME = 300                                  # middle of 200..400
PICTURE_MM = (144.0, 192.0)
SPEED_MM_PER_S = (PICTURE_MM[1] / 2) / (127 / CLOCK_HZ)   # half the height in 127 cycles
DWELL_S = 2 / CLOCK_HZ

profile = {
 "profile": "vectrex", "model": "vector-xy", "name": "Vectrex built-in vector display (Samsung 240RB40)",
 "timing": {"frame_s": FRAME_S, "clock_hz": CLOCK_HZ, "round_cycles": ROUND_CYCLES,
            "vector_s": FRAME_S / VECTORS_PER_FRAME, "budget_vectors": [200, 400],
            "ref": "Malban, Vectrex tutorial II (30 000-cycle round, 1/50 s); Roger Boesch via crtgang (200-400 vectors per frame)"},
 "beam": {"speed_mm_per_s": SPEED_MM_PER_S, "dwell_s": DWELL_S, "sigma_mm": .3, "assumed": ["speed_mm_per_s", "dwell_s", "sigma_mm"],
          "model": "charge per mm of line = beam current / speed; a stopped beam at each line end for dwell_s",
          "ref": "Malban: drawing slower is brighter, length = strength x time; Vectrex32 manual: a bright dot at the end of lines"},
 "picture": {"width_mm": PICTURE_MM[0], "height_mm": PICTURE_MM[1], "assumed": True,
             "note": "portrait 3:4 within the 240RB40's 240 mm diagonal (assumed)"},
 "phosphor": {"type": "P4 (white, assumed: the standard black-and-white TV phosphor)", "cie_xy": [.27, .30],
              "display_rgb_per_Y": None, "persistence": "medium short: each frame shows only the lines drawn in it"},
 "faceplate": {"surface_reflectance": .0426, "screen_reflectance": .5, "transmission": .5, "assumed": True,
               "note": "a black-and-white TV tube behind the Vectrex's screen bezel; glossy front (assumed)"},
 "luminance": {"room_lux": 300.0, "white_diffuser_cd_m2": 300 / 3.14159265, "full_drive_cd_m2": 100.0, "assumed": True},
 "controls": {"brightness": {"min": 0, "max": 1, "value": .75,
              "note": "the knob on the back of the display: the beam current at full intensity, relative to its maximum"}},
 "sources": {"geometry": {"glass_mm": 10.0, "n_glass": 1.52, "rear_polarizer_mm": 0, "n_polarizer": 1.5}},
 "oblique": {"front_index": 1.52},
 "facts": [
  ["Tube", "Samsung 240RB40: 9 in (240 mm diagonal), 90°, a black-and-white TV tube with no mask (Vectrex service manual)"],
  ["Round", "30 000 cycles of the 1.5 MHz 6809 = 1/50 s (Malban)"],
  ["Drawing", "each line at a strength (speed) for a time (scale); slower = brighter, a bright dot at each end (Malban; Vectrex32 manual)"],
  ["Budget", "about 200-400 vectors per frame before the refresh slows and the picture flickers (Roger Boesch)"],
 ],
}
# P4 at x 0.27, y 0.30 in linear sRGB per unit luminance
x, y = profile["phosphor"]["cie_xy"]
X, Y, Z = x / y, 1.0, (1 - x - y) / y
rgb = [3.2404542 * X - 1.5371385 * Y - .4985314 * Z, -.969266 * X + 1.8760108 * Y + .041556 * Z, .0556434 * X - .2040259 * Y + 1.0572252 * Z]
profile["phosphor"]["display_rgb_per_Y"] = [float(f"{v:.7g}") for v in rgb]
json.dump(profile, open(os.path.join(HERE, "..", "profiles", "vectrex.json"), "w"), separators=(",", ":"))
print("frame %.1f ms, %.1f us per vector, speed %.2f mm/us, rgb %s" % (FRAME_S * 1e3, FRAME_S / VECTORS_PER_FRAME * 1e6, SPEED_MM_PER_S / 1e6, profile["phosphor"]["display_rgb_per_Y"]))

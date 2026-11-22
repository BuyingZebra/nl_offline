"""Builds profiles/crt-ppi-p7.json: the P7 screen of crt-5151-p7.json driven as
a radar PPI (plan position indicator) instead of a raster.

    python3 tools/crt_ppi_p7.py       (under a second; build crt-5151-p7.json first)

Drive (CAA Technical Development Report 211, Randall & McIntire, 1953:
P7 and magnesium fluoride phosphors for radar PPI; trail test, Table I)
- 12DP7 indicator; antenna scan 15 rpm; PRF 1400 pulses per second;
  1.0 us pulse; 60-mile sweep. Decay tests in a dark room.
- Trail length on the 12DP7 under those conditions: 8 scans.

How a PPI draws (derived)
- Each pulse starts a radial sweep from the centre; the sweep line turns with
  the antenna. A point at azimuth phi is passed once per rotation, at phi/2pi
  of the rotation period.
- At 1400 sweeps per 4 s rotation, sweeps are 2 pi / 5600 rad apart: at
  radius r they are r * 1.12e-3 apart, far closer than the spot over the whole
  screen, so a pass deposits charge like one continuous sweep, and the charge
  per area per pass falls as 1/r (the same sweeps cover a longer arc). Capped
  at one spot width from the centre.
- The radial sweep (60 statute miles: 0.64 ms) and a pass over one spot
  (about 1 ms at mid range) are far shorter than the yellow-green decay, so
  each pass is one hit; the blue flash is shown as the light of that hit.

Kept from the P7 raster profile
- The phosphor (RCA 1961), the spot, faceplate, knobs and room: the 12DP7's
  own optics are not modelled (assumed like the 5151's tube).

Units
- Excitation per pass: E = drive * r_ref / max(r, spot), r_ref = half the
  sweep radius. The eye sees the light of the last 1/60 s; brightness is
  expressed so that a point at r_ref at full drive, averaged over one
  rotation, is the profile's full-drive luminance (assumed).
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = json.load(open(os.path.join(HERE, "..", "profiles", "crt-5151-p7.json")))

RPM, PRF, PULSE_US, SWEEP_MILES = 15.0, 1400.0, 1.0, 60.0
ROTATION_S = 60.0 / RPM
MILE_M, C = 1609.344, 299792458.0
SWEEP_S = 2 * SWEEP_MILES * MILE_M / C               # radar range time for the sweep length
SWEEPS_PER_ROTATION = PRF * ROTATION_S
SWEEP_SPACING_RAD = 2 * math.pi / SWEEPS_PER_ROTATION
TRAIL_SCANS_12DP7 = 8
EYE_WINDOW_S = 1 / 60

profile = json.loads(json.dumps(BASE))
profile.update({
 "profile": "crt-ppi-p7",
 "name": "P7 radar PPI (12DP7 indicator drive: 15 rpm, 1400 pps, 60-mile sweep)",
})
profile["timing"] = dict(profile["timing"], frame_s=ROTATION_S, refresh_hz=1 / ROTATION_S,
                         ref="PPI: one pass per antenna rotation (CAA TDR 211: 15 rpm); raster fields kept from the 5151 profile are unused")
profile["drive"] = dict(profile["drive"], mode="ppi", ppi={
 "rpm": RPM, "rotation_s": ROTATION_S, "prf_pps": PRF, "pulse_us": PULSE_US, "sweep_miles": SWEEP_MILES,
 "sweep_s": SWEEP_S, "sweeps_per_rotation": SWEEPS_PER_ROTATION, "sweep_spacing_rad": SWEEP_SPACING_RAD,
 "r_ref_fraction_of_sweep": 0.5, "eye_window_s": EYE_WINDOW_S,
 "trail_scans_12dp7": TRAIL_SCANS_12DP7, "tube": "12DP7",
 "ref": "CAA Technical Development Report 211 (Randall & McIntire, 1953), Characteristics of Magnesium Fluoride and P7 Phosphors for Radar PPI Applications: trail test 60-mile sweep, 15 rpm, PRF 1400 pps, 1.0 us pulse; 12DP7 trail 8 scans; dark room",
 "model": "E per pass = drive * r_ref / max(r, spot sigma); hit at azimuth / 2 pi of the rotation (clockwise from the top); light averaged over the last 1/60 s",
 "assumed": ["sweep radius reaches the panel's corners, centred on the panel", "12DP7 optics as the 5151 profile's tube", "full-drive luminance = rotation-average at r_ref"]})
profile["phosphor"] = dict(profile["phosphor"], facts=profile["phosphor"]["facts"] + [
 ["Radar drive (measured)", "CAA 1953 trail test: 15 rpm scan, 1400 pulses/s, 1 µs pulse, 60-mile sweep, 12DP7 tube, dark room"],
 ["PPI physics (derived)", "each point is passed once per 4 s rotation; %d sweeps per rotation overlap everywhere, so the charge per pass falls as 1/radius" % SWEEPS_PER_ROTATION],
 ["Trail (measured)", "a moving target's trail stayed visible for %d scans (%d s) on the 12DP7" % (TRAIL_SCANS_12DP7, TRAIL_SCANS_12DP7 * ROTATION_S)],
 ["What you see", "the light of the last 1/60 s (the raster screens average over their refresh instead)"]])
out = os.path.join(HERE, "..", "profiles", "crt-ppi-p7.json")
json.dump(profile, open(out, "w"), separators=(",", ":"))
print("rotation %.1f s, sweep %.3f ms, %d sweeps/rotation, spacing %.2e rad" % (ROTATION_S, SWEEP_S * 1e3, SWEEPS_PER_ROTATION, SWEEP_SPACING_RAD))

#!/usr/bin/env python3
"""Reflective twisted-nematic (TN) LCD optics from first principles.

Writes ../profiles/reflective-tn.json, which the renderer loads. Nothing in the
output is hand-tuned: every input below names its source, and the only two
calibrations (response times and front-surface reflection) are solved so the
simulated panel reproduces the datasheet's measured response times and
contrast ratio.

Pipeline
 1. Director profile vs voltage: minimize the Frank-Oseen elastic energy plus
    the dielectric energy at fixed voltage (1-D, tilt and twist through the cell).
 2. Optics: Jones calculus through the layered director, per wavelength,
    with E7 refractive-index dispersion.
 3. Reflective stack: front polarizer -> LC (entry point) -> rear polarizer ->
    polarization-preserving reflector -> rear polarizer -> LC (exit point) ->
    front polarizer. Entry and exit points differ under oblique light; that
    offset is the reflector shadow, so the result is a 2-D table R(a_in, a_out).
 4. Colour: CIE 1931 2-degree observer under CIE D65, to linear sRGB, relative
    to a perfect white diffuser under the same light.
 5. Dynamics: single-mode director relaxation. tau_on scales with
    1/((V/Vth)^2 - 1) (standard nematic switching law); both time constants are
    solved so the optical 10-90% times equal the datasheet values.

Run: python3 reflective_tn.py
"""
import json, math, os
import numpy as np
from scipy.optimize import minimize, least_squares

HERE = os.path.dirname(os.path.abspath(__file__))
EPS0 = 8.8541878128e-12
K_REF = 1e-11

SOURCES = {
 "liquid_crystal": {
  "material": "E7 (reference nematic mixture; the panel's own mixture is proprietary)",
  "K11_pN": 11.7, "K22_pN": 6.8, "K33_pN": 17.8,
  "eps_parallel": 19.5, "eps_perpendicular": 5.2,
  "cauchy_25C": {"Ae": 1.6933, "Be_um2": 0.0078, "Ce_um4": 0.0028,
                 "Ao": 1.4994, "Bo_um2": 0.0070, "Co_um4": 0.0004},
  "refs": [
   "Elastic constants and permittivities as quoted in arXiv:2003.09706 (citing Merck Licristal brochure 1994; Raynes et al. 2003; Yang et al. 1999; Raynes, Tough & Davies 1979)",
   "Cauchy coefficients: J. Li, S.-T. Wu, S. Brugioni, R. Meucci, S. Faetti, J. Appl. Phys. 97, 073501 (2005), Table I, 25 C"
  ]
 },
 "polarizer": {
  "part": "Orient Display TP018 (reflective, neutral gray)",
  "single_T": 0.443, "parallel_T": 0.381, "crossed_T": 0.01409,
  "hue_ab": {"single": [-1.6, -0.6], "parallel": [-2.4, 3.9], "crossed": [-2.6, -15.8]},
  "reflectance": 0.363,
  "ref": "https://www.orientdisplay.com/wp-content/uploads/2022/10/TP.pdf"
 },
 "panel": {
  "part": "Varitronix VI-402-DP (positive gray TN, reflective, static drive, 6 o'clock)",
  "Vop_typ": 3.0, "Vop_min": 2.8, "Vop_max": 3.2,
  "rise_ms_typ": 30, "decay_ms_typ": 60, "contrast_typ": 15,
  "depth_mm": 2.80,
  "ref": "https://assets.jaycar.com.au/ZD1886_datasheetMain_41155.pdf"
 },
 "geometry": {
  "twist_deg": 90,
  "pretilt_deg": 2.0,
  "pretilt_note": "assumed typical rubbed-polyimide value; not in the datasheet",
  "design": "first transmission maximum, Gooch & Tarry (J. Phys. D 8, 1575, 1975): 2 d dn / lambda = sqrt(3) at 550 nm",
  "glass_mm": 1.1,
  "glass_note": "standard ITO glass option (0.4/0.55/0.7/1.1 mm, santechnology.com); 1.1 mm inferred from the VI-402's 2.80 mm depth",
  "rear_polarizer_mm": 0.18,
  "rear_polarizer_note": "polarizer film thickness from the Orient Display polarizer table",
  "n_glass": 1.52, "n_polarizer": 1.50,
  "index_note": "typical soda-lime glass and polarizer film indices (assumed)"
 },
 "colorimetry": "CIE 1931 2-degree observer and CIE D65 from colour-science/colour datasets (BSD-3-Clause)"
}

LC = SOURCES["liquid_crystal"]; POL = SOURCES["polarizer"]; PANEL = SOURCES["panel"]; GEO = SOURCES["geometry"]
cie = json.load(open(os.path.join(HERE, "cie-1931-d65.json")))
WL = np.array(cie["wavelengths_nm"], float)            # 380..780 nm, 5 nm
CMF = np.array(cie["cmf_xyz"], float)
D65 = np.array(cie["d65"], float)
W_XYZ = (CMF * D65[:, None]) / np.sum(CMF[:, 1] * D65)  # reflectance spectrum -> XYZ (white diffuser Y=1)
M_SRGB = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
WHITE = np.array([0.95047, 1.0, 1.08883])

lam_um = WL / 1000
c = LC["cauchy_25C"]
NE = c["Ae"] + c["Be_um2"] / lam_um**2 + c["Ce_um4"] / lam_um**4
NO = c["Ao"] + c["Bo_um2"] / lam_um**2 + c["Co_um4"] / lam_um**4
dn550 = float(np.interp(550, WL, NE - NO))
CELL_GAP_UM = math.sqrt(3) * 0.550 / (2 * dn550)

k11, k22, k33 = (LC[k] * 1e-12 / K_REF for k in ("K11_pN", "K22_pN", "K33_pN"))
EPAR, EPERP = LC["eps_parallel"], LC["eps_perpendicular"]
DEPS = EPAR - EPERP
TWIST = math.radians(GEO["twist_deg"]); PRETILT = math.radians(GEO["pretilt_deg"])
N = 48                                     # interior nodes through the cell
H = 1.0 / (N + 1)
K_EFF = (LC["K11_pN"] + (LC["K33_pN"] - 2 * LC["K22_pN"]) / 4) * 1e-12
VTH = math.pi * math.sqrt(K_EFF / (EPS0 * DEPS))   # TN Freedericksz threshold

def unpack(x):
    th = np.concatenate([[PRETILT], x[:N], [PRETILT]])
    ph = np.concatenate([[0.0], x[N:], [TWIST]])
    return th, ph

def energy(x, V):
    th, ph = unpack(x)
    dth = np.diff(th) / H; dph = np.diff(ph) / H
    tm = 0.5 * (th[1:] + th[:-1])
    c2 = np.cos(tm) ** 2; s2 = 1 - c2
    elastic = 0.5 * ((k11 * c2 + k33 * s2) * dth**2 + (k22 * c2 + k33 * s2) * c2 * dph**2) * H
    eps = EPERP + DEPS * s2
    return elastic.sum() - 0.5 * (EPS0 * V * V / K_REF) / np.sum(H / eps)

def solve_profile(V, x0):
    r = minimize(energy, x0, args=(V,), method="L-BFGS-B", options={"maxiter": 4000, "ftol": 1e-15, "gtol": 1e-10})
    return r.x

def tilt_amount(x):
    th, _ = unpack(x)
    return float((th.max() - PRETILT) / (math.pi / 2 - PRETILT))

# 1. Equilibrium curve a*(V). A small symmetric tilt bump seeds the
#    deformation so the solver leaves the unstable undeformed state above Vth.
z = np.linspace(H, 1 - H, N)
x = np.concatenate([np.full(N, PRETILT), TWIST * z])
V_GRID = np.round(np.arange(0, PANEL["Vop_max"] + 1e-9, 0.02), 4)
profiles, curve = [], []
for V in V_GRID:
    seed = x.copy(); seed[:N] += 0.02 * np.sin(np.pi * z)
    x = solve_profile(V, seed if V > 0 else x)
    profiles.append(x.copy()); curve.append(tilt_amount(x))
curve = np.maximum.accumulate(np.array(curve))
A_OP = float(np.interp(PANEL["Vop_typ"], V_GRID, curve))
A_MAX = float(curve[-1])

# 2. Jones matrices per profile and wavelength.
def jones(x):
    th, ph = unpack(x)
    tm = 0.5 * (th[1:] + th[:-1]); pm = 0.5 * (ph[1:] + ph[:-1])
    J = np.broadcast_to(np.eye(2, dtype=complex), (len(WL), 2, 2)).copy()
    slab = H * CELL_GAP_UM
    for t, p in zip(tm, pm):
        neff = NE * NO / np.sqrt(NE**2 * math.sin(t)**2 + NO**2 * math.cos(t)**2)
        d = 2 * np.pi * (neff - NO) * slab / lam_um
        cp, sp = math.cos(p), math.sin(p)
        R = np.array([[cp, sp], [-sp, cp]]); Ri = R.T
        D = np.zeros((len(WL), 2, 2), complex); D[:, 0, 0] = np.exp(-0.5j * d); D[:, 1, 1] = np.exp(0.5j * d)
        J = (Ri @ D @ R) @ J
    return J

# 3. Polarizer spectra fitted to the measured luminance and CIELAB hue.
xn = (WL - 550) / 150
def lab(XYZ):
    f = lambda t: np.where(t > (6 / 29)**3, np.cbrt(t), t / (3 * (6 / 29)**2) + 4 / 29)
    fx, fy, fz = f(XYZ[0] / WHITE[0]), f(XYZ[1] / WHITE[1]), f(XYZ[2] / WHITE[2])
    return np.array([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)])
def from_lab(Y, a, b):
    L = 116 * (Y ** (1 / 3) if Y > (6 / 29)**3 else Y / (3 * (6 / 29)**2) + 4 / 29) - 16
    fy = (L + 16) / 116; fx = fy + a / 500; fz = fy - b / 200
    inv = lambda t: t**3 if t > 6 / 29 else 3 * (6 / 29)**2 * (t - 4 / 29)
    return lab(np.array([inv(fx) * WHITE[0], Y, inv(fz) * WHITE[2]]))
TARGETS = [from_lab(POL["single_T"], *POL["hue_ab"]["single"]),
           from_lab(POL["parallel_T"], *POL["hue_ab"]["parallel"]),
           from_lab(POL["crossed_T"], *POL["hue_ab"]["crossed"])]
def pol_spectra(p):
    k1 = 1 / (1 + np.exp(-(p[0] + p[1] * xn + p[2] * xn**2)))
    k2 = np.exp(p[3] + p[4] * xn + p[5] * xn**2)
    return k1, k2
def pol_residual(p):
    k1, k2 = pol_spectra(p)
    meas = [(k1 + k2) / 2, (k1**2 + k2**2) / 2, k1 * k2]
    return np.concatenate([lab(W_XYZ.T @ m) - t for m, t in zip(meas, TARGETS)])
fit = least_squares(pol_residual, [1.9, 0, 0, math.log(0.016), 0, 0])
K1, K2 = pol_spectra(fit.x)
POL_FIT_DE = [float(np.linalg.norm(fit.fun[i * 3:(i + 1) * 3])) for i in range(3)]
T_PAR_Y = float(W_XYZ[:, 1] @ ((K1**2 + K2**2) / 2))
R_REFLECTOR = POL["reflectance"] / T_PAR_Y   # polarization-preserving reflector behind the rear polarizer

# 4. Double-pass reflectance R(a_in, a_out) -> XYZ.
GRID = 49
a_grid = np.linspace(0, A_MAX, GRID)
def profile_at(a):
    if a <= 0: return profiles[0]
    Va = float(np.interp(a, curve, V_GRID))
    i = int(np.argmin(np.abs(V_GRID - Va)))
    return solve_profile(Va, profiles[i])
LUT_PROFILES = [profile_at(a) for a in a_grid]
JS = np.array([jones(p) for p in LUT_PROFILES])        # (GRID, L, 2, 2)
sk1, sk2 = np.sqrt(K1), np.sqrt(K2)
xyz = np.zeros((GRID, GRID, 3))
for i in range(GRID):
    total = np.zeros((GRID, len(WL)))
    for e in (np.stack([sk1, 0 * sk1], -1), np.stack([0 * sk2, sk2], -1)):  # two incoherent input states
        f = np.einsum("lab,lb->la", JS[i], e)                                 # through LC at the entry point
        g = np.stack([K2 * f[:, 0], K1 * f[:, 1]], -1) * math.sqrt(R_REFLECTOR)  # rear polarizer (y), mirror, rear polarizer
        h = np.einsum("jlba,lb->jla", JS, g)                                  # back through LC at the exit point (reciprocity: J^T)
        out = np.stack([sk1 * h[..., 0], sk2 * h[..., 1]], -1)                # front polarizer (x)
        total += 0.5 * np.sum(np.abs(out)**2, -1)
    xyz[i] = total @ W_XYZ

# 5. Contrast: add the neutral front-surface reflection needed to match the datasheet.
Y_on = float(np.interp(A_OP, a_grid, np.array([xyz[k, k, 1] for k in range(GRID)])))
Y_off = float(xyz[0, 0, 1])
CR_SIM = Y_off / Y_on
CR_TARGET = PANEL["contrast_typ"]
R_SURFACE = max(0.0, (Y_off - CR_TARGET * Y_on) / (CR_TARGET - 1))
xyz_total = xyz + R_SURFACE * WHITE[None, None, :]
rgb = np.einsum("ij,abj->abi", M_SRGB, xyz_total)
Y_diag = np.array([xyz_total[k, k, 1] for k in range(GRID)])

# 5b. Separable form for soft shadows. Light from an extended source adds up
#     incoherently over entry points, so the renderer must average the light
#     *entering* the glass, not the director state. A rank-4 factorization
#     R_c(a_in, a_out) = sum_k entry_k(a_in) * exit_k,c(a_out) makes that average a
#     plain blur of four entry fields. Per wavelength the double pass is close
#     to a product (the rear polarizer sits between the passes), so few terms
#     are needed; the error is reported.
RANK = 4
U, S, Vt = np.linalg.svd(rgb.reshape(GRID, GRID * 3), full_matrices=False)
ENTRY = U[:, :RANK] * np.sqrt(S[:RANK])                 # (GRID, RANK)
EXIT = (Vt[:RANK].T * np.sqrt(S[:RANK])).reshape(GRID, 3, RANK)  # (GRID, 3, RANK)
FACTOR_ERR = float(np.max(np.abs(np.einsum("ik,jck->ijc", ENTRY, EXIT) - rgb)) / np.max(rgb))

# 6. Dynamics: solve both time constants against the datasheet 10-90% times.
def ten_ninety(curve_y):
    y0, y1 = curve_y[0], curve_y[-1]
    frac = (curve_y - y0) / (y1 - y0)
    t = np.linspace(0, 12, len(curve_y))
    return float(np.interp(0.9, frac, t) - np.interp(0.1, frac, t))
ts = np.linspace(0, 12, 6000)
on_curve = np.interp(A_OP * (1 - np.exp(-ts)), a_grid, Y_diag)
off_curve = np.interp(A_OP * np.exp(-ts), a_grid, Y_diag)
TAU_ON_OP = PANEL["rise_ms_typ"] / ten_ninety(on_curve)
TAU_OFF = PANEL["decay_ms_typ"] / ten_ninety(off_curve)

# 7. Drive tables, indexed by the content's 8-bit sRGB gray value.
srgb_decode = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055)**2.4
Y_of_V = np.interp(np.interp(V_GRID, V_GRID, curve), a_grid, Y_diag)
V_op = PANEL["Vop_typ"]; mask = V_GRID <= V_op + 1e-9
Yb, Yd = float(Y_of_V[0]), float(np.interp(V_op, V_GRID, Y_of_V))
analog, static = [], []
for code in range(256):
    L = srgb_decode(code / 255)
    target = Yd + (Yb - Yd) * L
    analog.append(float(np.interp(target, Y_of_V[mask][::-1], V_GRID[mask][::-1])))
    static.append(V_op if L < 0.5 else 0.0)

to_hex = lambda v: "#" + "".join("%02x" % round(255 * (12.92 * c if c <= 0.0031308 else 1.055 * c**(1 / 2.4) - 0.055)) for c in np.clip(v, 0, 1))
r6 = lambda v: float("%.6g" % v)
out = {
 "profile": "reflective-tn",
 "name": "Reflective TN (positive gray, static drive)",
 "sources": SOURCES,
 "derived": {
  "cell_gap_um": r6(CELL_GAP_UM), "dn_550": r6(dn550),
  "Vth_theory_V": r6(VTH), "a_at_Vop": r6(A_OP), "a_max": r6(A_MAX),
  "reflector_reflectance": r6(R_REFLECTOR),
  "polarizer_fit_deltaE": [r6(v) for v in POL_FIT_DE],
  "contrast_simulated_without_surface": r6(CR_SIM),
  "front_surface_reflectance": r6(R_SURFACE),
  "contrast_final": r6(Y_off / Y_on if R_SURFACE == 0 else (Y_off + R_SURFACE) / (Y_on + R_SURFACE)),
  "tau_on_at_Vop_ms": r6(TAU_ON_OP), "tau_off_ms": r6(TAU_OFF),
  "luminance_off": r6(Yb), "luminance_on": r6(Yd),
  "color_off_hex": to_hex(rgb[0, 0]),
  "color_on_hex": to_hex(np.array([np.interp(A_OP, a_grid, np.diagonal(rgb[:, :, k])) for k in range(3)]))
 },
 "drive": {"Vop": V_op, "voltages": [r6(v) for v in V_GRID], "a_equilibrium": [r6(v) for v in curve],
           "static_by_gray": static, "analog_by_gray": [r6(v) for v in analog]},
 "lut": {"size": GRID, "a_max": r6(A_MAX), "linear_srgb": [r6(v) for v in rgb.reshape(-1)]},
 "factor": {"rank": RANK, "max_relative_error": r6(FACTOR_ERR),
            "entry": [r6(v) for v in ENTRY.reshape(-1)],
            "exit": [r6(v) for v in EXIT.reshape(-1)]},
 "dynamics": {"tau_on_at_Vop_ms": r6(TAU_ON_OP), "tau_off_ms": r6(TAU_OFF), "Vth": r6(VTH), "Vop": V_op}
}
json.dump(out, open(os.path.join(HERE, "..", "profiles", "reflective-tn.json"), "w"), separators=(",", ":"))
print(json.dumps(out["derived"], indent=1))
# Single-pass check at 550 nm with ideal crossed polarizers: should be near 1 at 0 V.
J0 = jones(profiles[0]); i550 = int(np.argmin(abs(WL - 550)))
print("ideal single-pass T(0 V, 550 nm) =", round(float(abs(J0[i550, 1, 0])**2), 4))
print("a*(V):", ", ".join("%.1fV:%.3f" % (v, a) for v, a in zip(V_GRID[::10], curve[::10])))

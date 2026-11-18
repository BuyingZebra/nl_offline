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
  "design": "Gooch & Tarry (J. Phys. D 8, 1575, 1975) transmission maximum at 550 nm: first (2 d dn / lambda = sqrt 3) or second (sqrt 15); chosen by which reproduces the datasheet viewing cone (see derived)",
  "design_comparison_cone_CR2_deg": {"datasheet": {"bottom": 70, "top": 35, "left": 70, "right": 70},
    "first_maximum": {"bottom": 75, "top": 50, "left": 65, "right": 65},
    "second_maximum": {"bottom": 70, "top": 30, "left": 45, "right": 45}},
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
# Both standard designs were computed against the datasheet cone (bottom 70,
# top 35, sides 70; contrast >= 2): first maximum gave 75/50/65/65 (total
# miss 30 deg), second gave 70/30/45/45 (55 deg). The first is kept.
DESIGN = os.environ.get("TN_DESIGN", "first")
U_DESIGN = {"first": math.sqrt(3), "second": math.sqrt(15)}[DESIGN]
CELL_GAP_UM = U_DESIGN * 0.550 / (2 * dn550)

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
V_GRID = np.round(np.arange(0, 4.0 + 1e-9, 0.02), 4)
profiles, curve = [], []
for V in V_GRID:
    seed = x.copy(); seed[:N] += 0.02 * np.sin(np.pi * z)
    x = solve_profile(V, seed if V > 0 else x)
    profiles.append(x.copy()); curve.append(tilt_amount(x))
curve = np.maximum.accumulate(np.array(curve))
A_OP = float(np.interp(PANEL["Vop_typ"], V_GRID, curve))
A_MAX = float(np.interp(PANEL["Vop_max"], V_GRID, curve))
A_MAX_ALL = float(curve[-1])

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


# ---------------------------------------------------------------------------
# 8. Oblique light and viewing (extended Jones matrices, Lien, Appl. Phys.
#    Lett. 57, 2767 (1990)). Each pass is computed for light arriving from a
#    direction (polar angle from the normal, azimuth 0 = from the top,
#    clockwise). The rear polarizer sits between the two passes, so the double
#    pass is very nearly a product per wavelength (checked below):
#        R(lambda) = 2 * R_reflector * T(lambda; a_in, light) * T(lambda; a_out, view)
#    where T is the single-pass transmission for unpolarized light and "view"
#    means light arriving from the viewer's direction (reciprocity).
# ---------------------------------------------------------------------------
import base64
r6 = lambda v: float("%.6g" % v)
SOURCES["obliquity"] = {
 "method": "extended Jones matrices (Lien 1990); polarizers as dichroic absorbers with transmitted field along k x absorption axis",
 "front_surface_index": 1.5,
 "front_surface_note": "Fresnel loss at the front surface relative to normal incidence; an untreated polarizer reflects about 5% (displaymodule.com), consistent with n = 1.5",
 "viscosity_vs_temperature": {"temps_C": [10, 20, 30, 40], "gamma1_mPa_s": [422, 224, 126, 74],
   "ref": "E7 rotational viscosity, experimental values supplied by Merck Korea, as tabulated in koreascience.kr JAKO201136151481811 (Table 2)"},
 "temperature_scaling": "elastic constants scale as S^2 and dielectric anisotropy as S (mean-field), with order parameter S proportional to birefringence; birefringence from the Li-Wu Cauchy table at each temperature"
}
LAM_O = np.arange(400.0, 701.0, 10.0); lo = LAM_O / 1000
sel = np.array([int(np.argmin(abs(WL - l))) for l in LAM_O])
W_O = (CMF[sel] * D65[sel, None]) / np.sum(CMF[sel, 1] * D65[sel])
RGBW_O = (M_SRGB @ W_O.T)                                  # (3, L): linear sRGB weights
NE_O, NO_O = NE[sel], NO[sel]
K1_O, K2_O = K1[sel], K2[sel]
GRID_O = 25
A_O = np.linspace(0, A_MAX, GRID_O)
PROF_O = [profile_at(a) for a in A_O]
TH = np.array([0.5 * (unpack(p)[0][1:] + unpack(p)[0][:-1]) for p in PROF_O])   # (A, layers)
PH = np.array([0.5 * (unpack(p)[1][1:] + unpack(p)[1][:-1]) for p in PROF_O])
DZ = H * CELL_GAP_UM
N_FRONT = 1.5

def fresnel_t(theta):
    ci = math.cos(theta); st = math.sin(theta) / N_FRONT; ct = math.sqrt(1 - st * st)
    rs = (ci - N_FRONT * ct) / (ci + N_FRONT * ct); rp = (N_FRONT * ci - ct) / (N_FRONT * ci + ct)
    return 1 - 0.5 * (rs * rs + rp * rp)
def fresnel_r(theta):
    return 1 - fresnel_t(theta)

def single_pass(polar_deg, azimuth_deg, psi, th=TH, ph=PH, ne=NE_O, no=NO_O):
    """Unpolarized transmission front polarizer -> LC -> rear polarizer, (A, L)."""
    s = math.sin(math.radians(polar_deg))
    az = math.radians(azimuth_deg)
    src = np.array([math.sin(az), -math.cos(az)])           # toward the source, screen axes (y down)
    prop = -src * s                                          # transverse propagation
    phi_k = math.atan2(prop[1], prop[0]) if s > 1e-9 else 0.0
    rot = lambda ang: ang + psi - phi_k                      # lab azimuth -> incidence-plane frame
    def polarizer(trans_az):                                 # transmission axis azimuth (lab)
        a = np.array([math.cos(rot(trans_az) + math.pi / 2), math.sin(rot(trans_az) + math.pi / 2), 0.0])
        kz = math.sqrt(N_FRONT**2 - s * s)
        k = np.array([s, 0.0, kz]) / N_FRONT
        t = np.cross(k, a); t /= np.linalg.norm(t)
        u = np.cross(k, t); u /= np.linalg.norm(u)
        B = np.array([[t[0], u[0]], [t[1], u[1]]]); Bi = np.linalg.inv(B)
        P = np.zeros((len(LAM_O), 2, 2), complex)
        for li in range(len(LAM_O)):
            P[li] = B @ np.diag([math.sqrt(K1_O[li]), math.sqrt(K2_O[li])]) @ Bi
        return P
    P1 = polarizer(0.0); P2 = polarizer(TWIST)
    nA = th.shape[0]
    J = np.broadcast_to(np.eye(2, dtype=complex), (nA, len(LAM_O), 2, 2)).copy()
    d = ne**2 - no**2                                        # (L,)
    for l in range(th.shape[1]):
        t, p = th[:, l][:, None], rot(ph[:, l])[:, None]     # (A,1)
        cx, cy, cz = np.cos(t) * np.cos(p), np.cos(t) * np.sin(p), np.sin(t) * np.ones_like(p)
        exx = no**2 + d * cx**2; exz = d * cx * cz; ezz = no**2 + d * cz**2     # (A, L)
        koz = np.sqrt(no**2 - s * s) * np.ones_like(exx)
        kez = (-exz * s + np.sqrt(exz**2 * s * s - ezz * (exx * s * s - no**2 * ne**2))) / ezz
        c = np.stack(np.broadcast_arrays(cx, cy, cz), -1)  # (A, L, 3)
        def unit(v):
            n = np.linalg.norm(v, axis=-1, keepdims=True); return v / np.maximum(n, 1e-12)
        ko = np.stack(np.broadcast_arrays(s * np.ones_like(koz), 0 * koz, koz), -1)
        ke = np.stack(np.broadcast_arrays(s * np.ones_like(kez), 0 * kez, kez), -1)
        Eo = np.cross(ko, c)
        small = np.linalg.norm(Eo, axis=-1) < 1e-9
        Eo[small] = np.array([0.0, 1.0, 0.0])
        Eo = unit(Eo)
        De = unit(np.cross(np.cross(ke, c), ke))
        cdotD = np.sum(c * De, -1, keepdims=True)
        Ee = De / no[None, :, None]**2 + (1 / ne[None, :, None]**2 - 1 / no[None, :, None]**2) * cdotD * c
        Ee = unit(Ee)
        S = np.stack([np.stack([Ee[..., 0], Eo[..., 0]], -1), np.stack([Ee[..., 1], Eo[..., 1]], -1)], -2)
        k0 = 2 * np.pi / lo
        D = np.zeros_like(S, dtype=complex)
        D[..., 0, 0] = np.exp(1j * k0 * kez * DZ); D[..., 1, 1] = np.exp(1j * k0 * koz * DZ)
        J = S @ D @ np.linalg.inv(S) @ J
    T = 0.5 * np.sum(np.abs(P2[None] @ J @ P1[None])**2, axis=(-1, -2))
    return T * fresnel_t(math.radians(polar_deg)) / fresnel_t(0.0)

# Orientation: rotate the cell so the mid-plane director lies vertical, and pick
# the sense that matches the datasheet's 6 o'clock viewing direction.
R_SURF_TMP = R_SURFACE
def cone_same(psi, azimuth):
    last = 0; i_on = int(round(A_OP / A_MAX * (GRID_O - 1)))
    for polar in range(0, 81, 5):
        Tv = single_pass(polar, azimuth, psi)
        cr = (2 * R_REFLECTOR * float(W_O[:, 1] @ (Tv[0] * Tv[0])) + R_SURF_TMP) / (2 * R_REFLECTOR * float(W_O[:, 1] @ (Tv[i_on] * Tv[i_on])) + R_SURF_TMP)
        if cr < 2: return last
        last = polar
    return 80
# Datasheet cones are for a reflective panel, so light and eye share a direction.
cones_same = {d: {k: cone_same(math.radians(d), a) for k, a in (("top", 0), ("right", 90), ("bottom", 180), ("left", 270))} for d in (45, 225)}
print("design", DESIGN, "gap", CELL_GAP_UM, "viewing cones (CR>=2, light from the viewing direction):", cones_same)
PSI_DEG = 45 if cones_same[45]["bottom"] >= cones_same[45]["top"] else 225   # 6 o'clock: wide from below
cones = cones_same
PSI = math.radians(PSI_DEG)

POLARS = [0] + list(range(10, 81, 10)); AZS = list(range(0, 360, 45))
cauchy_T = {15: (1.7055, .0087, .0028, 1.5006, .0065, .0004), 20: (1.6993, .0085, .0027, 1.4998, .0067, .0004),
            25: (1.6933, .0078, .0028, 1.4994, .0070, .0004), 30: (1.6846, .0090, .0025, 1.4989, .0072, .0004),
            35: (1.6761, .0091, .0025, 1.4987, .0071, .0004), 40: (1.6662, .0091, .0024, 1.5033, .0049, .0008)}
DIRS = [(0, 0)] + [(p, a) for p in POLARS[1:] for a in AZS]
TABLE_TEMPS = [15, 25, 40]
def indices_at(T):
    Ae, Be, Ce, Ao, Bo, Co = cauchy_T[T]
    return Ae + Be / lo**2 + Ce / lo**4, Ao + Bo / lo**2 + Co / lo**4
TABLES = []
for Tc in TABLE_TEMPS:
    ne_T, no_T = indices_at(Tc)
    TABLES.append([single_pass(p, a, PSI, ne=ne_T, no=no_T) for p, a in DIRS])
TABLE_ALL = np.array(TABLES, dtype=np.float32)        # (temps, dirs, A, L)
TABLE = TABLE_ALL[TABLE_TEMPS.index(25)]

# Check the product model against the exact double pass at normal incidence.
T0 = TABLE[0]
prod_xyz = np.einsum("il,jl,lc->ijc", T0, T0, W_O) * 2 * R_REFLECTOR
exact_idx = [int(round(a / A_MAX * (GRID - 1))) for a in A_O]
exact_xyz = xyz[np.ix_(exact_idx, exact_idx)]
PRODUCT_ERR = float(np.max(np.abs(prod_xyz[..., 1] - exact_xyz[..., 1])) / np.max(exact_xyz[..., 1]))
# Recalibrate on the product model so the runtime and the datasheet agree exactly.
Y0 = float(prod_xyz[0, 0, 1]); i_on = int(np.argmin(abs(A_O - A_OP)))
Yon = float(np.interp(A_OP, A_O, np.diagonal(prod_xyz[..., 1])))
R_SURFACE = max(0.0, (Y0 - CR_TARGET * Yon) / (CR_TARGET - 1))
Ydiag_O = np.diagonal(prod_xyz[..., 1]) + R_SURFACE
on_c = np.interp(A_OP * (1 - np.exp(-ts)), A_O, Ydiag_O); off_c = np.interp(A_OP * np.exp(-ts), A_O, Ydiag_O)
TAU_ON_OP = PANEL["rise_ms_typ"] / ten_ninety(on_c); TAU_OFF = PANEL["decay_ms_typ"] / ten_ninety(off_c)
Y_of_V = np.interp(np.interp(V_GRID, V_GRID, curve), A_O, Ydiag_O)
Yb, Yd = float(Y_of_V[0]), float(np.interp(V_op, V_GRID, Y_of_V))
analog = [float(np.interp(Yd + (Yb - Yd) * srgb_decode(code / 255), Y_of_V[mask][::-1], V_GRID[mask][::-1])) for code in range(256)]
cones_final = cones[PSI_DEG]

# Temperature (15-40 C: where the viscosity and refractive-index data overlap).
TEMPS = [15, 20, 25, 30, 35, 40]
def dn_at(T, l=0.55):
    Ae, Be, Ce, Ao, Bo, Co = cauchy_T[T]
    return (Ae + Be / l**2 + Ce / l**4) - (Ao + Bo / l**2 + Co / l**4)
gT = SOURCES["obliquity"]["viscosity_vs_temperature"]
inv = 1 / (np.array(gT["temps_C"]) + 273.15); slope, icpt = np.polyfit(inv, np.log(gT["gamma1_mPa_s"]), 1)
gamma = lambda T: math.exp(icpt + slope / (T + 273.15))
S_ratio = [dn_at(T) / dn_at(25) for T in TEMPS]
temperature = {"temps_C": TEMPS, "order_ratio": [r6(v) for v in S_ratio],
 "tau_scale": [r6((gamma(T) / gamma(25)) / (S_ratio[i]**2)) for i, T in enumerate(TEMPS)],
 "voltage_scale": [r6(math.sqrt(1 / S_ratio[i])) for i in range(len(TEMPS))],
 "arrhenius_activation_eV": r6(slope * 8.617333e-5)}
# Optical effect of birefringence change alone at normal incidence (reported).
def offcolor(T):
    sc = dn_at(T) / dn_at(25)
    Tt = single_pass(0, 0, PSI, ne=NO_O + (NE_O - NO_O) * sc)
    return lab(2 * R_REFLECTOR * (W_O.T @ (Tt[0] * Tt[0])) + R_SURFACE * WHITE)
TEMP_DE = float(np.linalg.norm(offcolor(15) - offcolor(40)))
temperature["unlit_colour_change_deltaE_15_to_40C"] = r6(TEMP_DE)
print("product model error", PRODUCT_ERR, "temp dE", TEMP_DE, "tau scale", temperature["tau_scale"])

to_hex = lambda v: "#" + "".join("%02x" % round(255 * (12.92 * c if c <= 0.0031308 else 1.055 * c**(1 / 2.4) - 0.055)) for c in np.clip(v, 0, 1))
r6 = lambda v: float("%.6g" % v)
out = {
 "profile": "reflective-tn",
 "name": "Reflective TN (positive gray, static drive)",
 "sources": SOURCES,
 "derived": {
  "viewing_cone_CR2_deg": cones_final, "cell_rotation_deg": PSI_DEG,
  "cell_gap_um": r6(CELL_GAP_UM), "dn_550": r6(dn550),
  "Vth_theory_V": r6(VTH), "a_at_Vop": r6(A_OP), "a_max": r6(A_MAX),
  "reflector_reflectance": r6(R_REFLECTOR),
  "polarizer_fit_deltaE": [r6(v) for v in POL_FIT_DE],
  "contrast_simulated_without_surface": r6(CR_SIM),
  "front_surface_reflectance": r6(R_SURFACE),
  "contrast_final": r6((Y0 + R_SURFACE) / (Yon + R_SURFACE)), "product_model_error": r6(PRODUCT_ERR),
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
 "dynamics": {"tau_on_at_Vop_ms": r6(TAU_ON_OP), "tau_off_ms": r6(TAU_OFF), "Vth": r6(VTH), "Vop": V_op},
 "oblique": {"a_grid": [r6(v) for v in A_O], "wavelengths_nm": LAM_O.tolist(),
   "rgb_weights": [[r6(v) for v in row] for row in RGBW_O], "reflector": r6(R_REFLECTOR),
   "surface_diffuse": r6(R_SURFACE), "front_index": N_FRONT,
   "polars_deg": POLARS, "azimuths_deg": AZS, "cell_rotation_deg": PSI_DEG,
   "table_float32_base64": base64.b64encode(TABLE_ALL.astype("<f4").tobytes()).decode(),
   "table_shape": list(TABLE_ALL.shape), "table_temps_C": TABLE_TEMPS, "product_model_error": r6(PRODUCT_ERR),
   "viewing_cone_CR2_deg": cones_final,
   "viewing_cone_note": "contrast >= 2 with light arriving from the viewing direction (reflective measurement); datasheet typ: bottom 70, top 35, left 70, right 70"},
 "temperature": temperature
}
json.dump(out, open(os.path.join(HERE, "..", "profiles", "reflective-tn.json"), "w"), separators=(",", ":"))

# ---------------------------------------------------------------------------
# 9. The same cell, multiplexed: 1/4 duty, 1/3 bias (standard segment drive,
#    e.g. ROHM BU9795 / ON LC75814). Every point is selected 1/4 of the frame;
#    rms voltages for supply VLCD with bias 1/b and duty 1/N:
#      on^2  = VLCD^2 (1/N + (N-1)/(N b^2))
#      off^2 = VLCD^2 (((b-2)/b)^2/N + (N-1)/(N b^2))
#    VLCD is set where contrast is highest (the usual design rule). Points
#    outside every electrode receive 0 V; off points inside electrodes receive
#    the off voltage, which is what makes unlit segments faintly visible.
# ---------------------------------------------------------------------------
import copy
N_DUTY, B_BIAS = 4, 3
k_on = math.sqrt(1 / N_DUTY + (N_DUTY - 1) / (N_DUTY * B_BIAS**2))
k_off = math.sqrt(((B_BIAS - 2) / B_BIAS)**2 / N_DUTY + (N_DUTY - 1) / (N_DUTY * B_BIAS**2))
a_of = lambda V: float(np.interp(V, V_GRID, curve))
Y_of_a = lambda a: float(np.interp(a, A_O, Ydiag_O))
v_try = np.arange(2.0, 4.0 / k_on + 1e-9, 0.01)
crs = [Y_of_a(a_of(k_off * v)) / Y_of_a(a_of(k_on * v)) for v in v_try]
VLCD = float(v_try[int(np.argmax(crs))]); V_ON, V_OFF = k_on * VLCD, k_off * VLCD
mux = copy.deepcopy(out)
mux["profile"] = "reflective-tn-mux4"
mux["name"] = "Reflective TN (VI-402 cell, multiplexed 1/4 duty, 1/3 bias)"
mux["sources"]["drive"] = {
 "scheme": "1/4 duty, 1/3 bias multiplexed segment drive",
 "refs": ["ROHM BU9795AFV segment driver datasheet (1/3 bias, 1/4 duty; frame 53-80 Hz)",
          "ON Semiconductor LC75814V 1/4-duty driver datasheet (1/2 or 1/3 bias)"],
 "rms_formula": "on^2 = VLCD^2 (1/N + (N-1)/(N b^2)); off^2 = VLCD^2 (((b-2)/b)^2/N + (N-1)/(N b^2))",
 "supply_rule": "VLCD chosen for maximum contrast with this cell",
 "note": "same glass, crystal and polarizers as the VI-402 profile; only the drive differs. The liquid crystal responds to rms voltage because its response (tens of ms) is slower than the frame (12-19 ms)."}
mux["drive"]["static_by_gray"] = [V_ON if v > 0 else V_OFF for v in static]
mux["drive"]["off_voltage"] = r6(V_OFF); mux["drive"]["on_voltage"] = r6(V_ON); mux["drive"]["vlcd"] = r6(VLCD)
mux["drive"]["uses_electrode_map"] = True
mux["drive"]["analog_by_gray"] = [V_OFF + (V_ON - V_OFF) * (v / V_op) for v in analog]
cr_mux = max(crs)
mux["derived"] = {**mux["derived"], "contrast_final": r6(cr_mux), "vlcd_V": r6(VLCD), "on_rms_V": r6(V_ON), "off_rms_V": r6(V_OFF),
 "off_state_a": r6(a_of(V_OFF)), "luminance_on": r6(Y_of_a(a_of(V_ON))), "luminance_off_segment": r6(Y_of_a(a_of(V_OFF)))}
json.dump(mux, open(os.path.join(HERE, "..", "profiles", "reflective-tn-mux4.json"), "w"), separators=(",", ":"))
print("MUX: VLCD %.2f V, on %.3f V rms, off %.3f V rms, contrast %.2f, off-segment state %.3f, luminance off-seg %.4f vs unlit %.4f" %
      (VLCD, V_ON, V_OFF, cr_mux, a_of(V_OFF), Y_of_a(a_of(V_OFF)), Y_of_a(0)))
print(json.dumps(out["derived"], indent=1))
# Single-pass check at 550 nm with ideal crossed polarizers: should be near 1 at 0 V.
J0 = jones(profiles[0]); i550 = int(np.argmin(abs(WL - 550)))
print("ideal single-pass T(0 V, 550 nm) =", round(float(abs(J0[i550, 1, 0])**2), 4))
print("a*(V):", ", ".join("%.1fV:%.3f" % (v, a) for v, a in zip(V_GRID[::10], curve[::10])))

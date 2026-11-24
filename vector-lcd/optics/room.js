/* Room optics shared by every screen: where the room light comes from, how
 * the front surface mirrors it, and how the bezel frame above the glass
 * shades the edges that face it. The GLSL twins live in gpu/glsl.js.
 *
 * Screen axes throughout: x right, y down, z out of the glass.
 * Azimuth 0 = light from the top, increasing clockwise. */


/**
 * @typedef {{angleDeg:number, azimuthDeg:number, sourceDeg:number, exposure?:number}} Lighting
 * @typedef {{x:number, y:number}} Vec2Mm
 */

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Unit helpers. Written in the same operation order as the original model, so
// every number stays bit-for-bit identical.
export const rad = deg => deg * Math.PI / 180;

/** Gaussian width (radians, one standard deviation) for a full width at half maximum in degrees. */
export const fwhmToSigmaRad = fwhmDeg => fwhmDeg / (2 * Math.sqrt(2 * Math.LN2)) * Math.PI / 180;


// ---------------------------------------------------------------------------
// Directions
// ---------------------------------------------------------------------------

/** Unit vector toward a direction given as polar angle from the normal and azimuth. */
export function directionVector(polarDeg, azimuthDeg) {
 const t = rad(polarDeg), a = rad(azimuthDeg);
 return [Math.sin(t) * Math.sin(a), -Math.sin(t) * Math.cos(a), Math.cos(t)];
}

/** Sideways travel (mm) of light crossing the rear glass and polarizer at angleDeg,
 * refracting into each layer. */
export function refractionOffsetMm(geometry, angleDeg) {
 const s = Math.sin(rad(angleDeg));
 const through = (t, n) => t * Math.tan(Math.asin(clamp(s / n, -1, 1)));
 return through(geometry.glass_mm, geometry.n_glass) + through(geometry.rear_polarizer_mm, geometry.n_polarizer);
}


// ---------------------------------------------------------------------------
// Reflector shadow: where light enters the crystal (TN and DMG-01)
// ---------------------------------------------------------------------------

/** Entry-point offset (mm) for light arriving at lightAngleDeg from the normal.
 * Light from the top enters further up than where it exits. */
export function entryOffsetMm(profile, lightAngleDeg, azimuthDeg) {
 const d = refractionOffsetMm(profile.sources.geometry, lightAngleDeg);
 const az = rad(azimuthDeg);
 return {x: Math.sin(az) * d, y: -Math.cos(az) * d};
}

/** Where the light entering the glass comes from, for a room light of full
 * width sourceDeg: the mean entry offset and the spread along (radial) and
 * across (tangential) the light's direction, in millimetres. */
export function shadowKernel(profile, {angleDeg, azimuthDeg, sourceDeg}) {
 const g = profile.sources.geometry;
 const mean = entryOffsetMm(profile, angleDeg, azimuthDeg);
 const sigma = fwhmToSigmaRad(sourceDeg);
 const h = .01, theta = rad(angleDeg);
 // mm per radian, along the light's direction and across it
 const slope = (refractionOffsetMm(g, angleDeg + h) - refractionOffsetMm(g, Math.max(0, angleDeg - h)))
  / rad(angleDeg + h - Math.max(0, angleDeg - h));
 const across = theta > 1e-3 ? refractionOffsetMm(g, angleDeg) / Math.sin(theta) : slope;
 const az = rad(azimuthDeg);
 return {
  mean,
  radial: {x: Math.sin(az), y: -Math.cos(az)},
  sigmaRadialMm: slope * sigma,
  sigmaTangentialMm: across * sigma
 };
}


// ---------------------------------------------------------------------------
// Front-surface glare
// ---------------------------------------------------------------------------

/** Unpolarized Fresnel reflectance of the front surface. */
export function fresnelReflectance(thetaRad, n = 1.5) {
 const ci = Math.cos(thetaRad), st = Math.sin(thetaRad) / n, ct = Math.sqrt(Math.max(0, 1 - st * st));
 const rs = (ci - n * ct) / (ci + n * ct), rp = (n * ci - ct) / (n * ci + ct);
 return .5 * (rs * rs + rp * rp);
}

/** Angular spread (radians, one standard deviation) of a room light of full
 * width sourceDeg at half maximum; never sharper than 0.5 degrees. */
export function glareSigma(sourceDeg) {
 return fwhmToSigmaRad(Math.max(.5, sourceDeg));
}

/** Normalization of the mirrored light, relative to a white diffuser under the same light. */
export function glareNorm(sigma, angleDeg) {
 return 1 / (2 * sigma * sigma * Math.max(.05, Math.cos(rad(angleDeg))));
}

/** Glare seen along the unit vector toward the eye: the front surface mirrors a
 * room light with a Gaussian angular profile, blurred by a rough surface's lobe
 * (blurRad, one standard deviation; 0 for polished glass). The surface's local
 * normal tilts the mirror (a curved face). Relative to a white diffuser. */
export function glare(profile, toEye, {angleDeg, azimuthDeg, sourceDeg}, blurRad = 0, normal = [0, 0, 1]) {
 const L = directionVector(angleDeg, azimuthDeg), c = toEye.reduce((s, v, i) => s + v * normal[i], 0);
 const m = normal.map((n, i) => 2 * c * n - toEye[i]);                       // the eye ray, mirrored
 const dot = clamp(m[0] * L[0] + m[1] * L[1] + m[2] * L[2], -1, 1), delta = Math.acos(dot);
 const sigma = Math.hypot(glareSigma(sourceDeg), blurRad);
 const n = profile.oblique?.front_index ?? 1.5;
 return fresnelReflectance(Math.acos(clamp(c, -1, 1)), n) * Math.exp(-delta * delta / (2 * sigma * sigma))
  / (2 * sigma * sigma * Math.max(.05, Math.cos(rad(angleDeg))));
}

/** Outward normal of a spherical face of radius R (mm) at (x, y) mm from its
 * centre; a flat face (no radius) has the axis. */
export function sphereNormal(R, x, y) {
 if (!(R > 0)) return [0, 0, 1];
 const z = Math.sqrt(Math.max(0, R * R - x * x - y * y));
 return [x / R, y / R, z / R];
}


// ---------------------------------------------------------------------------
// Bezel shadow
// ---------------------------------------------------------------------------

/** Where light that reaches the crystal at a point crossed the bezel's plane:
 * the shift toward the light (mm). Light passes the bezel lip (air), then the
 * polarizer and glass, refracting in each. */
export function bezelShiftMm(profile, {angleDeg, azimuthDeg}, lipMm) {
 const d = refractionOffsetMm(profile.sources.geometry, angleDeg) + lipMm * Math.tan(rad(Math.min(89, angleDeg)));
 const az = rad(azimuthDeg);
 return {x: Math.sin(az) * d, y: -Math.cos(az) * d};
}

/** Width (mm, one standard deviation) of the bezel shadow's soft edge, from the
 * room light's angular size. */
export function bezelPenumbraMm(profile, lighting, lipMm) {
 const h = .05, a = lighting.angleDeg;
 const mag = deg => {
  const v = bezelShiftMm(profile, {angleDeg: deg, azimuthDeg: 0}, lipMm);
  return Math.hypot(v.x, v.y);
 };
 const slope = (mag(a + h) - mag(Math.max(0, a - h))) / rad(a + h - Math.max(0, a - h));
 return fwhmToSigmaRad(slope * lighting.sourceDeg);
}

const erf = x => {
 const t = 1 / (1 + .3275911 * Math.abs(x));
 const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x);
 return Math.sign(x) * y;
};

/** Fraction of the room light reaching the crystal at pointMm, inside a
 * viewing window panelMm = {w, h} framed by the bezel. */
export function bezelLight(profile, pointMm, panelMm, lighting, lipMm) {
 const shift = bezelShiftMm(profile, lighting, lipMm);
 const sigma = Math.max(1e-4, bezelPenumbraMm(profile, lighting, lipMm));
 const q = {x: pointMm.x + shift.x, y: pointMm.y + shift.y};
 const step = d => .5 * (1 + erf(d / (sigma * Math.SQRT2)));
 return step(q.x) * step(panelMm.w - q.x) * step(q.y) * step(panelMm.h - q.y);
}

/* The viewer's eye: light scattered inside it (disability glare).
 *
 * The general glare (straylight) function gives the veil a point source adds
 * at angle theta from it, as equivalent luminance per illuminance at the eye:
 *
 *   Psi(theta) = 10/theta^3 + (5/theta^2 + 0.1 p/theta) (1 + (A/62.5)^4) + 2.5e-3 p   [sr^-1]
 *
 * theta in degrees, valid from 0.1 to about 100 degrees; A the viewer's age in
 * years; p the iris pigmentation (0 dark, 0.5 brown, 1 blue-green).
 * van den Berg, Franssen & Coppens (2010), Ocular Media Clarity and Straylight;
 * the simplified form of the CIE general disability glare equation (CIE 146:2002).
 *
 * A screen region of luminance L subtending dOmega gives illuminance L dOmega,
 * so the veil at a point is the integral of Psi L dOmega over what is shown.
 * The light scattered past 0.1 degrees leaves the direct image. The GPU pass
 * (gpu/eye-glare.js) sums the same integral over rings. */


export const THETA_MIN_DEG = 0.1;
export const THETA_MAX_DEG = 100;
/** The eye the demo uses: an average adult (assumed). The viewer is not simulated. */
export const STANDARD_EYE = Object.freeze({age: 35, pigment: .5});

const rad = deg => deg * Math.PI / 180;


/** Straylight function Psi (sr^-1) at theta degrees from a point source. */
export function straylight(thetaDeg, age, pigment) {
 const t = thetaDeg;
 return 10 / t ** 3 + (5 / t ** 2 + .1 * pigment / t) * (1 + (age / 62.5) ** 4) + 2.5e-3 * pigment;
}

/** Share of a point source's light scattered between two angles (default: all of it, 0.1-100 deg). */
export function scatteredFraction(age, pigment, fromDeg = THETA_MIN_DEG, toDeg = THETA_MAX_DEG, steps = 4000) {
 // Log-spaced trapezoids in theta: integral of Psi 2 pi sin(theta) dtheta (radians)
 let sum = 0, prevT = fromDeg, prevF = straylight(fromDeg, age, pigment) * 2 * Math.PI * Math.sin(rad(fromDeg));
 for (let i = 1; i <= steps; i++) {
  const t = fromDeg * (toDeg / fromDeg) ** (i / steps);
  const f = straylight(t, age, pigment) * 2 * Math.PI * Math.sin(rad(t));
  sum += .5 * (f + prevF) * rad(t - prevT);
  prevT = t; prevF = f;
 }
 return sum;
}

/**
 * Rings for the GPU: n log-spaced angles from 0.1 degrees to maxDeg, each with
 * the solid-angle weight of its band (Psi times 2 pi sin(theta) dtheta), so
 * that veil = sum of weight * mean luminance on the ring.
 * @returns {{thetaDeg:number[], weight:number[]}}
 */
export function glareRings(maxDeg, age, pigment, n) {
 const thetaDeg = [], weight = [], top = Math.max(maxDeg, THETA_MIN_DEG * 1.01);
 const edge = i => THETA_MIN_DEG * (top / THETA_MIN_DEG) ** (i / n);
 for (let i = 0; i < n; i++) {
  const lo = edge(i), hi = edge(i + 1), mid = Math.sqrt(lo * hi);
  thetaDeg.push(mid);
  weight.push(scatteredFraction(age, pigment, lo, hi, 40));
 }
 return {thetaDeg, weight};
}

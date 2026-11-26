/* Scratches on the front of a screen lens: geometry from a seed, and the light
 * they catch.
 *
 * A scratch is a shallow groove in the lens's front surface. Its walls tilt
 * across the groove (never along it), so they mirror the room light toward the
 * eye where a flat surface does not: a scratch lights up where its direction is
 * crosswise to the half-way direction between the light and the eye, which
 * draws the familiar arcs of glinting scratches around a lamp's reflection.
 *
 * Geometry is vector, in lens millimetres (the panel's x right, y down): lines
 * (pocket scratches) and circular arcs (wiping swirls), each with a width and a
 * depth. The groove's cross-section is a circular segment of that width and
 * depth, so its walls run from flat to an edge slope phiMax. A screen pixel
 * takes each scratch by how much of the pixel it covers across its width (it
 * stays a clean line at any zoom, and a faint one when narrower than a pixel).
 *
 * Light: the glare's own model (optics/room.js glareSigma, glareNorm): a lamp
 * of angular spread sigma, mirrored by facets. For facets spread over one
 * angle phi (across the groove), the radiance toward the eye is
 *   R(facet) * norm * exp(-delta^2 / (2 sn^2)) * rho(phiH) * sqrt(2 pi) sn,
 * with sn = sigma / 2 (a facet turns the mirrored ray twice as far), delta the
 * half-way vector's tilt along the scratch (the facets cannot match it),
 * phiH its tilt across, and rho the share of the groove's width per radian of
 * facet slope (R cos(phi) / width for a circular groove of radius R). Covered
 * pixels lose that share of the flat surface's own front-surface glare.
 *
 * scratchGlint is the JS twin of SCRATCH_GLSL. */

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** A small deterministic random generator (mulberry32): the same seed, the same lens. */
function random(seed) {
 let a = seed >>> 0;
 return () => {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
 };
}

/** Scratches for a lens of w x h mm, from a spec {seed, swirl, pocket} (see the
 * profile's lens.scratches): [{type: 0 line | 1 arc, ...geometry, width, depth}] in mm. */
export function generateScratches(spec, [w, h]) {
 const rnd = random(spec.seed), range = ([lo, hi]) => lo + (hi - lo) * rnd(), out = [];
 const count = density => Math.round(density * w * h / 100);
 // Wiping swirls: arcs of a cloth's circular strokes.
 for (let i = 0, n = count(spec.swirl.per_cm2); i < n; i++) {
  const R = range(spec.swirl.radius_mm), len = range(spec.swirl.length_mm), span = len / R;
  const cx = rnd() * w + (rnd() - .5) * R, cy = rnd() * h + (rnd() - .5) * R, a0 = rnd() * 2 * Math.PI;
  out.push({type: 1, cx, cy, r: R, a0, span, width: range(spec.swirl.width_um) / 1000, depth: range(spec.swirl.depth_um) / 1000});
 }
 // Pocket scratches: straight, any direction.
 for (let i = 0, n = count(spec.pocket.per_cm2); i < n; i++) {
  const len = range(spec.pocket.length_mm), a = rnd() * Math.PI, x = rnd() * w, y = rnd() * h;
  const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
  out.push({type: 0, x0: x - dx, y0: y - dy, x1: x + dx, y1: y + dy, width: range(spec.pocket.width_um) / 1000, depth: range(spec.pocket.depth_um) / 1000});
 }
 return out;
}

/** Bounding box of a scratch, widened by half its width. */
function bounds(s) {
 const m = s.width / 2;
 if (s.type === 0) return [Math.min(s.x0, s.x1) - m, Math.min(s.y0, s.y1) - m, Math.max(s.x0, s.x1) + m, Math.max(s.y0, s.y1) + m];
 let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
 for (let i = 0; i <= 32; i++) {
  const a = s.a0 + s.span * i / 32, x = s.cx + s.r * Math.cos(a), y = s.cy + s.r * Math.sin(a);
  x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
 }
 const pad = m + s.r * (1 - Math.cos(s.span / 64));
 return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

/** Scratches as GPU tables: data (two RGBA texels each), a grid of cells
 * (start, count) and the list of scratch indices per cell. */
export function packScratches(list, [w, h], cellMm = 2, origin = [0, 0]) {
 list = list.map(s => s.type === 0 ? {...s, x0: s.x0 - origin[0], y0: s.y0 - origin[1], x1: s.x1 - origin[0], y1: s.y1 - origin[1]} : {...s, cx: s.cx - origin[0], cy: s.cy - origin[1]});
 const cols = Math.max(1, Math.ceil(w / cellMm)), rows = Math.max(1, Math.ceil(h / cellMm));
 const cells = Array.from({length: cols * rows}, () => []);
 list.forEach((s, k) => {
  const [x0, y0, x1, y1] = bounds(s);
  for (let j = Math.max(0, Math.floor(y0 / cellMm)); j <= Math.min(rows - 1, Math.floor(y1 / cellMm)); j++)
   for (let i = Math.max(0, Math.floor(x0 / cellMm)); i <= Math.min(cols - 1, Math.floor(x1 / cellMm)); i++) cells[j * cols + i].push(k);
 });
 const grid = new Float32Array(cols * rows * 4), index = [];
 cells.forEach((c, i) => { grid[i * 4] = index.length; grid[i * 4 + 1] = c.length; index.push(...c); });
 const data = new Float32Array(Math.max(1, list.length) * 8);
 list.forEach((s, k) => {
  const v = s.type === 0 ? [0, s.x0, s.y0, s.x1, s.y1, 0, s.width, s.depth] : [1, s.cx, s.cy, s.r, s.a0, s.span, s.width, s.depth];
  data.set(v, k * 8);
 });
 return {cols, rows, cellMm, origin, list, grid, index: Float32Array.from(index.length ? index : [0]), data, count: list.length,
  maxPerCell: Math.max(0, ...cells.map(c => c.length))};
}


// ---------------------------------------------------------------------------
// Light (JS twin of SCRATCH_GLSL)
// ---------------------------------------------------------------------------

/** Unpolarized Fresnel reflectance from air into index n at incidence cosine ci. */
function fresnelN(ci, n) {
 const st = Math.sqrt(Math.max(0, 1 - ci * ci)) / n, ct = Math.sqrt(Math.max(0, 1 - st * st));
 const rs = (ci - n * ct) / (ci + n * ct), rp = (n * ci - ct) / (n * ci + ct);
 return .5 * (rs * rs + rp * rp);
}

/** Distance (mm) from a point to a scratch's centre line, and the unit tangent there. */
export function nearest(s, x, y) {
 if (s.type === 0) {
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
  const t = Math.min(1, Math.max(0, ((x - s.x0) * dx + (y - s.y0) * dy) / Math.max(L2, 1e-12)));
  return {dist: Math.hypot(x - s.x0 - t * dx, y - s.y0 - t * dy), tx: dx / L, ty: dy / L};
 }
 const ax = x - s.cx, ay = y - s.cy, rho = Math.hypot(ax, ay);
 let a = Math.atan2(ay, ax) - s.a0;
 a -= 2 * Math.PI * Math.floor(a / (2 * Math.PI));
 if (a <= s.span) return {dist: Math.abs(rho - s.r), tx: -ay / Math.max(rho, 1e-12), ty: ax / Math.max(rho, 1e-12)};
 // Beyond the arc: the nearer end.
 const ends = [s.a0, s.a0 + s.span].map(e => ({e, x: s.cx + s.r * Math.cos(e), y: s.cy + s.r * Math.sin(e)}));
 const d = ends.map(p => Math.hypot(x - p.x, y - p.y)), k = d[0] <= d[1] ? 0 : 1;
 return {dist: d[k], tx: -Math.sin(ends[k].e), ty: Math.cos(ends[k].e)};
}

/** Share of a pixel (width pixelMm, centred on the line at distance dist) that a
 * groove of the given width covers, across the groove. */
function coverage(dist, width, pixelMm) {
 const lo = Math.max(dist - width / 2, -pixelMm / 2), hi = Math.min(dist + width / 2, pixelMm / 2);
 return Math.max(0, hi - lo) / pixelMm;
}

/** Glare added by one scratch at a lens point, relative to the flat lens there
 * (linear, the glare's units). v: unit vector to the eye; l: unit vector to the
 * light (both x right, y down, z out of the screen); sigma, norm: the glare's. */
export function scratchGlint(s, x, y, pixelMm, v, l, sigma, norm, n) {
 const {dist, tx, ty} = nearest(s, x, y), cov = coverage(dist, s.width, pixelMm);
 if (cov <= 0) return 0;
 let hx = v[0] + l[0], hy = v[1] + l[1], hz = v[2] + l[2];
 const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
 const px = -ty, py = tx, sn = sigma / 2;
 const delta = Math.asin(Math.max(-1, Math.min(1, hx * tx + hy * ty)));
 const phiH = Math.atan2(hx * px + hy * py, hz);
 // Circular groove: radius from width and depth; walls up to phiMax.
 const Rg = (s.width * s.width / 4 + s.depth * s.depth) / (2 * s.depth), phiMax = Math.asin(Math.min(1, s.width / (2 * Rg)));
 const rho = Math.abs(phiH) < phiMax ? Rg * Math.cos(phiH) / s.width : 0;
 const facet = fresnelN(Math.max(0, v[0] * hx + v[1] * hy + v[2] * hz), n) * norm * Math.exp(-delta * delta / (2 * sn * sn)) * rho * Math.sqrt(2 * Math.PI) * sn;
 // The flat front surface this replaces: its mirror glare toward the eye.
 const mx = -v[0], my = -v[1], mz = v[2], d = Math.acos(Math.max(-1, Math.min(1, mx * l[0] + my * l[1] + mz * l[2])));
 const flat = fresnelN(v[2], n) * Math.exp(-d * d / (2 * sigma * sigma)) * norm;
 return cov * (facet - flat);
}

/** Every scratch at a lens point (the twin of the shader's loop over the point's cell). */
export function scratchesGlint(pack, x, y, pixelMm, v, l, sigma, norm, n) {
 x -= pack.origin[0]; y -= pack.origin[1];
 const list = pack.list, i = Math.floor(x / pack.cellMm), j = Math.floor(y / pack.cellMm);
 if (i < 0 || j < 0 || i >= pack.cols || j >= pack.rows) return 0;
 const c = (j * pack.cols + i) * 4, start = pack.grid[c], count = pack.grid[c + 1];
 let g = 0;
 for (let k = 0; k < count; k++) g += scratchGlint(list[pack.index[start + k]], x, y, pixelMm, v, l, sigma, norm, n);
 return g;
}


// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

/** Most scratches one cell may list (the shader's loop bound). */
export const MAX_PER_CELL = 48;

/** Needs fresnelN (screens/dmg/shaders.js LENS). Uniforms: uScratchData (RGBA32F,
 * two texels per scratch, 1024 wide), uScratchGrid (RGBA32F, cols x rows),
 * uScratchIndex (R32F, 1024 wide), uScratchCell, uScratchOrigin, uScratchOn. */
export const SCRATCH_GLSL = `
uniform sampler2D uScratchData,uScratchGrid,uScratchIndex;uniform float uScratchCell;uniform vec2 uScratchOrigin;uniform bool uScratchOn;
vec4 scratchTexel(int k){return texelFetch(uScratchData,ivec2(k%1024,k/1024),0);}
float scratchCover(float dist,float w,float pix){float lo=max(dist-0.5*w,-0.5*pix),hi=min(dist+0.5*w,0.5*pix);return max(0.0,hi-lo)/pix;}
float scratchesGlint(vec2 at,float pix,vec3 v,vec3 l,float sigma,float norm,float n){
 if(!uScratchOn)return 0.0;
 at-=uScratchOrigin;
 ivec2 gs=textureSize(uScratchGrid,0),c=ivec2(floor(at/uScratchCell));
 if(c.x<0||c.y<0||c.x>=gs.x||c.y>=gs.y)return 0.0;
 vec4 cell=texelFetch(uScratchGrid,c,0);int start=int(cell.x+0.5),count=int(cell.y+0.5);
 vec3 h=normalize(v+l);float sn=0.5*sigma,g=0.0;
 vec3 m=vec3(-v.x,-v.y,v.z);float dd=acos(clamp(dot(m,l),-1.0,1.0));
 float flat0=fresnelN(v.z,n)*exp(-dd*dd/(2.0*sigma*sigma))*norm;
 for(int i=0;i<${MAX_PER_CELL};i++){
  if(i>=count)break;
  int idx=start+i,k=int(texelFetch(uScratchIndex,ivec2(idx%1024,idx/1024),0).r+0.5);
  vec4 a=scratchTexel(2*k),b=scratchTexel(2*k+1);
  float dist;vec2 t;
  if(a.x<0.5){
   vec2 p0=a.yz,d=vec2(a.w,b.x)-p0;float L2=max(dot(d,d),1e-12);
   float s=clamp(dot(at-p0,d)/L2,0.0,1.0);dist=length(at-p0-s*d);t=d/sqrt(L2);
  } else {
   vec2 ax=at-a.yz;float rho=max(length(ax),1e-12),ang=atan(ax.y,ax.x)-b.x;
   ang-=6.28318530718*floor(ang/6.28318530718);
   if(ang<=b.y){dist=abs(rho-a.w);t=vec2(-ax.y,ax.x)/rho;}
   else{
    vec2 e0=a.yz+a.w*vec2(cos(b.x),sin(b.x)),e1=a.yz+a.w*vec2(cos(b.x+b.y),sin(b.x+b.y));
    float d0=length(at-e0),d1=length(at-e1);
    if(d0<=d1){dist=d0;t=vec2(-sin(b.x),cos(b.x));}else{dist=d1;t=vec2(-sin(b.x+b.y),cos(b.x+b.y));}
   }
  }
  float w=b.z,dep=b.w,cov=scratchCover(dist,w,pix);
  if(cov<=0.0)continue;
  vec2 p=vec2(-t.y,t.x);
  float delta=asin(clamp(dot(h.xy,t),-1.0,1.0)),phiH=atan(dot(h.xy,p),h.z);
  float Rg=(w*w*0.25+dep*dep)/(2.0*dep),phiMax=asin(min(1.0,w/(2.0*Rg)));
  float rhoF=abs(phiH)<phiMax?Rg*cos(phiH)/w:0.0;
  float facet=fresnelN(max(0.0,dot(v,h)),n)*norm*exp(-delta*delta/(2.0*sn*sn))*rhoF*2.50662827463*sn;
  g+=cov*(facet-flat0);
 }
 return g;
}`;


// ---------------------------------------------------------------------------
// GPU tables
// ---------------------------------------------------------------------------

/** Upload a pack to three float textures (created if needed); returns them. */
export function uploadScratches(gl, pack, tex = {}) {
 const make = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return t; };
 tex.data ??= make(); tex.grid ??= make(); tex.index ??= make();
 const rows1024 = (n, per) => { const w = Math.min(1024, n), h = Math.ceil(n / 1024); const a = new Float32Array(w * h * per); return {w, h, a}; };
 // Data: two RGBA texels per scratch, 1024 texels a row.
 const texels = pack.data.length / 4, d = rows1024(texels, 4); d.a.set(pack.data);
 gl.bindTexture(gl.TEXTURE_2D, tex.data);
 gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, d.w, d.h, 0, gl.RGBA, gl.FLOAT, d.a);
 gl.bindTexture(gl.TEXTURE_2D, tex.grid);
 gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, pack.cols, pack.rows, 0, gl.RGBA, gl.FLOAT, pack.grid);
 const ix = rows1024(pack.index.length, 1); ix.a.set(pack.index);
 gl.bindTexture(gl.TEXTURE_2D, tex.index);
 gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, ix.w, ix.h, 0, gl.RED, gl.FLOAT, ix.a);
 return tex;
}

/** The lens's scratches for a condition, as a pack over the panel plus a margin
 * (the eye's ray crosses the lens beside the image when the view is tilted). */
export function lensScratches(profile, condition, [w, h], margin = 3) {
 const spec = profile.lens?.scratches?.[condition];
 if (!spec) return null;
 const list = generateScratches(spec, [w + 2 * margin, h + 2 * margin]).map(s => s.type === 0
  ? {...s, x0: s.x0 - margin, y0: s.y0 - margin, x1: s.x1 - margin, y1: s.y1 - margin}
  : {...s, cx: s.cx - margin, cy: s.cy - margin});
 return packScratches(list, [w + 2 * margin, h + 2 * margin], 2, [-margin, -margin]);
}

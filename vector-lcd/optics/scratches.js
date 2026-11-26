/* Marks on the front of a screen lens: geometry from a seed, and the light
 * they catch.
 *
 * Four kinds, all vector geometry in lens millimetres (the panel's x right, y down):
 *   0 line   a straight groove (pocket scratches)
 *   1 arc    a circular groove (cleaning swirls; long careless scratches)
 *   2 dig    a small round dimple (surface imperfections)
 *   3 scuff  an elliptical patch of dense, nearly parallel micro-grooves
 *
 * A groove's walls tilt across it (never along it), so it mirrors the room
 * light toward the eye where the flat surface does not: a groove lights up
 * where it runs crosswise to the half-way direction between the light and the
 * eye, which draws the familiar glinting arcs around a lamp's reflection. A
 * dimple's walls tilt every way, so it sparkles from any direction while its
 * slopes reach the half-way direction. A scuff is many grooves too fine and too
 * close to see one by one: a haze whose direction wanders slowly and whose
 * density varies in streaks.
 *
 * Light: the glare's own model (optics/room.js glareSigma, glareNorm), a lamp
 * of angular spread sigma mirrored by facets (sn = sigma / 2: a facet turns the
 * mirrored ray twice as far). Per unit of a mark's area, the radiance toward the eye:
 *   groove: F * norm * exp(-delta^2 / 2 sn^2) * rho(phiH) * sqrt(2 pi) sn,
 *           rho = R cos(phi) / width (circular cross-section of radius R),
 *           delta, phiH = the half-way vector's tilt along and across the groove
 *   dimple: F * norm * rhoOmega(thetaH) * 2 pi sn^2,
 *           rhoOmega = Rc^2 cos(theta) / (pi r^2) (spherical cap of radius Rc)
 * A pixel takes each mark by how much of it the mark covers (clean at any zoom),
 * and loses that share of the flat front surface's own mirror glare.
 *
 * scratchGlint / scratchesGlint are the JS twins of SCRATCH_GLSL. */

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

/** Marks for a lens of w x h mm from a spec (the profile's lens.scratches.<condition>). */
export function generateScratches(spec, [w, h]) {
 const rnd = random(spec.seed), range = ([lo, hi]) => lo + (hi - lo) * rnd(), out = [];
 const count = density => Math.round(density * w * h / 100);
 // Cleaning swirls: arcs of a cloth's circular strokes.
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
 // Careless use: a few long, deeper, gently curved scratches (keys, coins).
 for (let i = 0, n = spec.careless?.count ?? 0; i < n; i++) {
  const R = range(spec.careless.radius_mm), len = range(spec.careless.length_mm), span = len / R, a0 = rnd() * 2 * Math.PI;
  const mx = rnd() * w, my = rnd() * h, am = a0 + span / 2;          // the arc's middle lands on the lens
  out.push({type: 1, cx: mx - R * Math.cos(am), cy: my - R * Math.sin(am), r: R, a0, span,
   width: range(spec.careless.width_um) / 1000, depth: range(spec.careless.depth_um) / 1000});
 }
 // Surface imperfections: small dimples ("digs").
 for (let i = 0, n = spec.digs ? count(spec.digs.per_cm2) : 0; i < n; i++)
  out.push({type: 2, cx: rnd() * w, cy: rnd() * h, r: range(spec.digs.radius_um) / 1000, depth: range(spec.digs.depth_um) / 1000});
 // A light scuff: a patch of fine, nearly parallel micro-grooves.
 for (let i = 0, n = spec.scuff?.count ?? 0; i < n; i++) {
  const S = spec.scuff;
  out.push({type: 3, cx: w * (.2 + .6 * rnd()), cy: h * (.15 + .7 * rnd()), a: range(S.half_length_mm), b: range(S.half_width_mm),
   angle: rnd() * Math.PI, spread: S.spread_deg * Math.PI / 180, density: S.density,
   width: S.width_um / 1000, depth: S.depth_um / 1000, streak: S.streak_mm, seed: Math.floor(rnd() * 65536)});
 }
 return out;
}

/** Bounding box of a mark, widened by half its width. */
function bounds(s) {
 if (s.type === 2) return [s.cx - s.r, s.cy - s.r, s.cx + s.r, s.cy + s.r];
 if (s.type === 3) { const m = Math.max(s.a, s.b); return [s.cx - m, s.cy - m, s.cx + m, s.cy + m]; }
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

const shift = (s, [ox, oy]) => s.type === 0 ? {...s, x0: s.x0 - ox, y0: s.y0 - oy, x1: s.x1 - ox, y1: s.y1 - oy} : {...s, cx: s.cx - ox, cy: s.cy - oy};

/** Twelve floats per mark (three RGBA texels): the shader's layout. */
function packed(s) {
 if (s.type === 0) return [0, s.x0, s.y0, s.x1, s.y1, 0, s.width, s.depth, 0, 0, 0, 0];
 if (s.type === 1) return [1, s.cx, s.cy, s.r, s.a0, s.span, s.width, s.depth, 0, 0, 0, 0];
 if (s.type === 2) return [2, s.cx, s.cy, s.r, 0, 0, 0, s.depth, 0, 0, 0, 0];
 return [3, s.cx, s.cy, s.a, s.b, s.angle, s.width, s.depth, s.spread, s.density, s.streak, s.seed];
}

/** Marks as GPU tables: data (three RGBA texels each), a grid of cells
 * (start, count) and the list of mark indices per cell. */
export function packScratches(list, [w, h], cellMm = 2, origin = [0, 0]) {
 list = list.map(s => shift(s, origin));
 const cols = Math.max(1, Math.ceil(w / cellMm)), rows = Math.max(1, Math.ceil(h / cellMm));
 const cells = Array.from({length: cols * rows}, () => []);
 list.forEach((s, k) => {
  const [x0, y0, x1, y1] = bounds(s);
  for (let j = Math.max(0, Math.floor(y0 / cellMm)); j <= Math.min(rows - 1, Math.floor(y1 / cellMm)); j++)
   for (let i = Math.max(0, Math.floor(x0 / cellMm)); i <= Math.min(cols - 1, Math.floor(x1 / cellMm)); i++) cells[j * cols + i].push(k);
 });
 const grid = new Float32Array(cols * rows * 4), index = [];
 cells.forEach((c, i) => { grid[i * 4] = index.length; grid[i * 4 + 1] = c.length; index.push(...c); });
 const data = new Float32Array(Math.max(1, list.length) * 12);
 list.forEach((s, k) => data.set(packed(s), k * 12));
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

/** A number in [-1, 1] for two integers (the shader's scratchHash). */
function hash(a, b) {
 let h = (Math.imul(a >>> 0, 0x8da6b343) ^ Math.imul(b >>> 0, 0xd8163841) ^ Math.imul(0x9e37, 0xcb1ab31f) ^ Math.imul(0x5c0ff, 0x165667b1)) >>> 0;
 h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
 h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
 h = (h ^ (h >>> 16)) >>> 0;
 return (h >>> 8) / 16777216 * 2 - 1;
}

/** Smooth 1-D value noise in [-1, 1] (the shader's scratchNoise). */
function noise(x, seed) {
 const c = Math.floor(x), f = x - c, s = f * f * (3 - 2 * f);
 return hash(c | 0, seed) + (hash((c + 1) | 0, seed) - hash(c | 0, seed)) * s;
}

/** Distance (mm) from a point to a groove's centre line, and the unit tangent there. */
export function nearest(s, x, y) {
 if (s.type === 0) {
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
  const t = Math.min(1, Math.max(0, ((x - s.x0) * dx + (y - s.y0) * dy) / Math.max(L2, 1e-12)));
  return {dist: Math.hypot(x - s.x0 - t * dx, y - s.y0 - t * dy), tx: dx / L, ty: dy / L};
 }
 const ax = x - s.cx, ay = y - s.cy, rho = Math.hypot(ax, ay);
 let a = Math.atan2(ay, ax) - s.a0;
 a -= 2 * Math.PI * Math.floor(a / (2 * Math.PI));
 // |rho - r| as (rho^2 - r^2) / (rho + r): no cancellation of two large, nearly equal lengths (the shader's float).
 if (a <= s.span) return {dist: Math.abs((ax * ax + ay * ay - s.r * s.r) / (rho + s.r)), tx: -ay / Math.max(rho, 1e-12), ty: ax / Math.max(rho, 1e-12)};
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

/** Radiance a groove's walls send to the eye, per unit of its area (see the header). */
function grooveFacet(tx, ty, w, dep, h, v, sn, norm, n) {
 const px = -ty, py = tx;
 const delta = Math.asin(Math.max(-1, Math.min(1, h[0] * tx + h[1] * ty)));
 const phiH = Math.atan2(h[0] * px + h[1] * py, h[2]);
 const Rg = (w * w / 4 + dep * dep) / (2 * dep), phiMax = Math.asin(Math.min(1, w / (2 * Rg)));
 const rho = Math.abs(phiH) < phiMax ? Rg * Math.cos(phiH) / w : 0;
 return fresnelN(Math.max(0, v[0] * h[0] + v[1] * h[1] + v[2] * h[2]), n) * norm * Math.exp(-delta * delta / (2 * sn * sn)) * rho * Math.sqrt(2 * Math.PI) * sn;
}

/** Glare added by one mark at a lens point, relative to the flat lens there
 * (linear, the glare's units). v: unit vector to the eye; l: unit vector to the
 * light (both x right, y down, z out of the screen); sigma, norm: the glare's. */
export function scratchGlint(s, x, y, pixelMm, v, l, sigma, norm, n) {
 let hx = v[0] + l[0], hy = v[1] + l[1], hz = v[2] + l[2];
 const hl = Math.hypot(hx, hy, hz), h = [hx / hl, hy / hl, hz / hl], sn = sigma / 2;
 // The flat front surface a mark replaces: its mirror glare toward the eye.
 const mx = -v[0], my = -v[1], mz = v[2], d = Math.acos(Math.max(-1, Math.min(1, mx * l[0] + my * l[1] + mz * l[2])));
 const flat = fresnelN(v[2], n) * Math.exp(-d * d / (2 * sigma * sigma)) * norm;
 if (s.type === 2) {
  const dist = Math.hypot(x - s.cx, y - s.cy), r = s.r;
  // Small: its area share, fading out over its own width as it leaves the pixel. Large: a soft-edged disc.
  const cov = 2 * r <= pixelMm ? Math.PI * r * r / (pixelMm * pixelMm) * Math.min(1, Math.max(0, (pixelMm / 2 - dist) / (2 * r) + .5)) : Math.min(1, Math.max(0, (r - dist) / pixelMm + .5));
  if (cov <= 0) return 0;
  const Rc = (r * r + s.depth * s.depth) / (2 * s.depth), thetaMax = Math.asin(Math.min(1, r / Rc)), theta = Math.acos(Math.min(1, h[2]));
  const rhoO = theta < thetaMax ? Rc * Rc * Math.cos(theta) / (Math.PI * r * r) : 0;
  const facet = fresnelN(Math.max(0, v[0] * h[0] + v[1] * h[1] + v[2] * h[2]), n) * norm * rhoO * 2 * Math.PI * sn * sn;
  return cov * (facet - flat);
 }
 if (s.type === 3) {
  const c = Math.cos(s.angle), si = Math.sin(s.angle), u = (x - s.cx) * c + (y - s.cy) * si, w = -(x - s.cx) * si + (y - s.cy) * c;
  const q = Math.sqrt((u / s.a) ** 2 + (w / s.b) ** 2);
  if (q >= 1) return 0;
  const edge = q <= .6 ? 1 : 1 - (q - .6) / .4, env = edge * edge * (3 - 2 * edge);
  // Streaks across the grooves (faded where a pixel spans several), and a slowly wandering direction.
  const streak = 1 + .8 * Math.min(1, s.streak / pixelMm) * noise(w / s.streak, s.seed);
  const ang = s.angle + s.spread * noise(u / 1.5, s.seed + 1), tx = Math.cos(ang), ty = Math.sin(ang);
  const cov = s.density * env * streak;
  return cov * (grooveFacet(tx, ty, s.width, s.depth, h, v, sn, norm, n) - flat);
 }
 const {dist, tx, ty} = nearest(s, x, y), cov = coverage(dist, s.width, pixelMm);
 if (cov <= 0) return 0;
 return cov * (grooveFacet(tx, ty, s.width, s.depth, h, v, sn, norm, n) - flat);
}

/** Every mark at a lens point (the twin of the shader's loop over the point's cell). */
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

/** Most marks one cell may list (the shader's loop bound). */
export const MAX_PER_CELL = 48;

/** Needs fresnelN (screens/dmg/shaders.js LENS). Uniforms: uScratchData (RGBA32F,
 * three texels per mark, 1024 wide), uScratchGrid (RGBA32F, cols x rows),
 * uScratchIndex (R32F, 1024 wide), uScratchCell, uScratchOrigin, uScratchOn. */
export const SCRATCH_GLSL = `
uniform sampler2D uScratchData,uScratchGrid,uScratchIndex;uniform float uScratchCell;uniform vec2 uScratchOrigin;uniform bool uScratchOn;
vec4 scratchTexel(int k){return texelFetch(uScratchData,ivec2(k%1024,k/1024),0);}
float scratchCover(float dist,float w,float pix){float lo=max(dist-0.5*w,-0.5*pix),hi=min(dist+0.5*w,0.5*pix);return max(0.0,hi-lo)/pix;}
float scratchHash(int a,int b){
 uint h=(uint(a)*0x8da6b343u)^(uint(b)*0xd8163841u)^(0x9e37u*0xcb1ab31fu)^(0x5c0ffu*0x165667b1u);
 h=(h^(h>>16u))*0x7feb352du;h=(h^(h>>15u))*0x846ca68bu;h^=h>>16u;
 return float(h>>8u)/16777216.0*2.0-1.0;
}
float scratchNoise(float x,int seed){float c=floor(x),f=x-c,s=f*f*(3.0-2.0*f);int i=int(c);return scratchHash(i,seed)+(scratchHash(i+1,seed)-scratchHash(i,seed))*s;}
float grooveFacet(vec2 t,float w,float dep,vec3 h,vec3 v,float sn,float norm,float n){
 vec2 p=vec2(-t.y,t.x);
 float delta=asin(clamp(dot(h.xy,t),-1.0,1.0)),phiH=atan(dot(h.xy,p),h.z);
 float Rg=(w*w*0.25+dep*dep)/(2.0*dep),phiMax=asin(min(1.0,w/(2.0*Rg)));
 float rho=abs(phiH)<phiMax?Rg*cos(phiH)/w:0.0;
 return fresnelN(max(0.0,dot(v,h)),n)*norm*exp(-delta*delta/(2.0*sn*sn))*rho*2.50662827463*sn;
}
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
  vec4 a=scratchTexel(3*k),b=scratchTexel(3*k+1),e=scratchTexel(3*k+2);
  if(a.x>1.5&&a.x<2.5){
   // A dimple: covers its area of the pixel; sparkles while its slopes reach the half-way direction.
   float r=a.w,dist=length(at-a.yz);
   float cov=2.0*r<=pix?3.14159265359*r*r/(pix*pix)*clamp((0.5*pix-dist)/(2.0*r)+0.5,0.0,1.0):clamp((r-dist)/pix+0.5,0.0,1.0);
   if(cov<=0.0)continue;
   float Rc=(r*r+b.w*b.w)/(2.0*b.w),thetaMax=asin(min(1.0,r/Rc)),theta=acos(min(1.0,h.z));
   float rhoO=theta<thetaMax?Rc*Rc*cos(theta)/(3.14159265359*r*r):0.0;
   g+=cov*(fresnelN(max(0.0,dot(v,h)),n)*norm*rhoO*6.28318530718*sn*sn-flat0);
   continue;
  }
  if(a.x>2.5){
   // A scuff: a patch of fine grooves, streaked across and wandering slowly in direction.
   float cs=cos(b.y),si=sin(b.y);vec2 dx=at-a.yz;float u=dx.x*cs+dx.y*si,w=-dx.x*si+dx.y*cs;
   float q=sqrt((u/a.w)*(u/a.w)+(w/b.x)*(w/b.x));
   if(q>=1.0)continue;
   float edge=q<=0.6?1.0:1.0-(q-0.6)/0.4,env=edge*edge*(3.0-2.0*edge);
   int seed=int(e.w+0.5);
   float streak=1.0+0.8*min(1.0,e.z/pix)*scratchNoise(w/e.z,seed);
   float ang=b.y+e.x*scratchNoise(u/1.5,seed+1);
   float cov=e.y*env*streak;
   g+=cov*(grooveFacet(vec2(cos(ang),sin(ang)),b.z,b.w,h,v,sn,norm,n)-flat0);
   continue;
  }
  float dist;vec2 t;
  if(a.x<0.5){
   vec2 p0=a.yz,d=vec2(a.w,b.x)-p0;float L2=max(dot(d,d),1e-12);
   float s=clamp(dot(at-p0,d)/L2,0.0,1.0);dist=length(at-p0-s*d);t=d/sqrt(L2);
  } else {
   vec2 ax=at-a.yz;float rho=max(length(ax),1e-12),ang=atan(ax.y,ax.x)-b.x;
   ang-=6.28318530718*floor(ang/6.28318530718);
   // |rho - r| without cancelling two large lengths (long arcs have far centres; sqrt is approximate on GPUs).
   if(ang<=b.y){dist=abs((dot(ax,ax)-a.w*a.w)/(rho+a.w));t=vec2(-ax.y,ax.x)/rho;}
   else{
    vec2 e0=a.yz+a.w*vec2(cos(b.x),sin(b.x)),e1=a.yz+a.w*vec2(cos(b.x+b.y),sin(b.x+b.y));
    float d0=length(at-e0),d1=length(at-e1);
    if(d0<=d1){dist=d0;t=vec2(-sin(b.x),cos(b.x));}else{dist=d1;t=vec2(-sin(b.x+b.y),cos(b.x+b.y));}
   }
  }
  float cov=scratchCover(dist,b.z,pix);
  if(cov<=0.0)continue;
  g+=cov*(grooveFacet(t,b.z,b.w,h,v,sn,norm,n)-flat0);
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
 const rows1024 = (n, per) => { const w = Math.min(1024, n), h = Math.ceil(n / 1024); return {w, h, a: new Float32Array(w * h * per)}; };
 // Data: three RGBA texels per mark, 1024 texels a row.
 const d = rows1024(pack.data.length / 4, 4); d.a.set(pack.data);
 gl.bindTexture(gl.TEXTURE_2D, tex.data);
 gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, d.w, d.h, 0, gl.RGBA, gl.FLOAT, d.a);
 gl.bindTexture(gl.TEXTURE_2D, tex.grid);
 gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, pack.cols, pack.rows, 0, gl.RGBA, gl.FLOAT, pack.grid);
 const ix = rows1024(pack.index.length, 1); ix.a.set(pack.index);
 gl.bindTexture(gl.TEXTURE_2D, tex.index);
 gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, ix.w, ix.h, 0, gl.RED, gl.FLOAT, ix.a);
 return tex;
}

/** The lens's marks for a condition, as a pack over the panel plus a margin
 * (the eye's ray crosses the lens beside the image when the view is tilted). */
export function lensScratches(profile, condition, [w, h], margin = 3) {
 const spec = profile.lens?.scratches?.[condition];
 if (!spec) return null;
 const list = generateScratches(spec, [w + 2 * margin, h + 2 * margin]).map(s => shift(s, [margin, margin]));
 return packScratches(list, [w + 2 * margin, h + 2 * margin], 2, [-margin, -margin]);
}

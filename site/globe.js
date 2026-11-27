// World at War — the globe. An orthographic projection drawn on canvas.
//
// Geometry comes from data/atoms.topo.json in longitude and latitude. Every
// vertex is kept as a unit vector, so projecting a point is three dot
// products. Points on the far side are pushed out to the horizon circle along
// their direction from the centre. That keeps a polygon that crosses the
// horizon closed and filled correctly, provided no polygon is larger than a
// hemisphere: the atoms are regions, and tools/build-geo.mjs cuts the world
// land into 30° tiles.

export const R = 6371.0088; // km, as in tools/projection.mjs
const LAEA_CENTER = [10, 52]; // the authoring projection (tools/projection.mjs)
const RAD = Math.PI / 180;
// Vertices whose Visvalingam area is under this many square pixels are left
// out: a coarser cut while the globe moves, a finer one once it settles.
const AREA_MOVING = 0.6, AREA_SETTLED = 0.12;

export function unit(lon, lat) {
  const l = lon * RAD, p = lat * RAD, c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}
export function lonLat(x, y, z) {
  return [Math.atan2(y, x) / RAD, Math.asin(Math.max(-1, Math.min(1, z))) / RAD];
}
/** A frame at a point: forward (out of the globe), east and north unit vectors. */
function frame(lon, lat) {
  const l = lon * RAD, p = lat * RAD, cl = Math.cos(l), sl = Math.sin(l), cp = Math.cos(p), sp = Math.sin(p);
  return { f: [cp * cl, cp * sl, sp], e: [-sl, cl, 0], n: [-sp * cl, -sp * sl, cp] };
}
const LAEA = frame(...LAEA_CENTER);

/**
 * A view is {lon, lat, k}: the point at the centre and the globe's radius in
 * CSS pixels. North is always up.
 */
export function projector(view, w, h) {
  const { f, e, n } = frame(view.lon, view.lat);
  const k = view.k, cx = w / 2, cy = h / 2;
  const [fx, fy, fz] = f, [ex, ey] = e, [nx, ny, nz] = n;
  return {
    view, w, h, k, cx, cy, f, e, n,
    /** Unit vector -> [x, y, z]: screen pixels, and z > 0 on the near side. */
    vec(x, y, z) { return [cx + k * (x * ex + y * ey), cy - k * (x * nx + y * ny + z * nz), x * fx + y * fy + z * fz]; },
    point(lon, lat) { const v = unit(lon, lat); return this.vec(v[0], v[1], v[2]); },
    /** Screen pixels -> [lon, lat], or null off the globe. */
    invert(sx, sy) {
      const X = (sx - cx) / k, Y = -(sy - cy) / k, r2 = X * X + Y * Y;
      if (r2 > 1) return null;
      const Z = Math.sqrt(1 - r2);
      return lonLat(X * ex + Y * nx + Z * fx, X * ey + Y * ny + Z * fy, Y * nz + Z * fz);
    },
  };
}

/** The view that fits a box [lon, lat, wKm, hKm] into w × h pixels. */
export function fitBox([lon, lat, bw, bh], w, h) {
  return { lon, lat, k: Math.min(w / (bw / R), h / (bh / R)) };
}

/** The authoring projection's km (x east, y south) -> [lon, lat]. */
export function laeaInvert(x, y) {
  const rho = Math.hypot(x, y) / R;
  if (!rho) return LAEA_CENTER.slice();
  const c = 2 * Math.asin(Math.min(1, rho / 2)), s = Math.sin(c) / (rho * R), cc = Math.cos(c);
  const { f, e, n } = LAEA;
  const v = [0, 1, 2].map((i) => cc * f[i] + s * (x * e[i] - y * n[i]));
  return lonLat(v[0], v[1], v[2]);
}

/** Rings of [lon, lat] -> rings of unit vectors (flat Float64Arrays). */
export function vecRings(rings) {
  return rings.map((r) => {
    const out = new Float64Array(r.length * 3);
    r.forEach(([lon, lat], i) => { const v = unit(lon, lat); out[3 * i] = v[0]; out[3 * i + 1] = v[1]; out[3 * i + 2] = v[2]; });
    return out;
  });
}
/** Bounding cap of flat unit-vector rings: [x, y, z, radius in radians]. */
export function capOf(rings) {
  let sx = 0, sy = 0, sz = 0;
  for (const r of rings) for (let i = 0; i < r.length; i += 3) { sx += r[i]; sy += r[i + 1]; sz += r[i + 2]; }
  const l = Math.hypot(sx, sy, sz) || 1;
  sx /= l; sy /= l; sz /= l;
  let min = 1;
  for (const r of rings) for (let i = 0; i < r.length; i += 3) { const d = r[i] * sx + r[i + 1] * sy + r[i + 2] * sz; if (d < min) min = d; }
  return [sx, sy, sz, Math.acos(Math.max(-1, min))];
}
/** 0: hidden or off screen, 1: possibly visible, 2: wholly on the near side and on screen. */
export function capVisible(pj, cap, pad = 0) {
  const [x, y, z, r] = cap;
  const d = x * pj.f[0] + y * pj.f[1] + z * pj.f[2];
  const a = Math.acos(Math.max(-1, Math.min(1, d)));
  if (a - r > Math.PI / 2 + 0.002) return 0;
  if (d <= 0) return 1;
  const [sx, sy] = pj.vec(x, y, z), rr = pj.k * r + pad;
  if (sx + rr < 0 || sx - rr > pj.w || sy + rr < 0 || sy - rr > pj.h) return 0;
  return a + r < Math.PI / 2 && sx - rr >= 0 && sx + rr <= pj.w && sy - rr >= 0 && sy + rr <= pj.h ? 2 : 1;
}
/** Project flat unit-vector rings to screen rings [[x, y], …], far side on the horizon. */
export function screenRings(pj, rings, tol = 0.5) {
  const out = [];
  const { k, cx, cy } = pj, [fx, fy, fz] = pj.f, [ex, ey] = pj.e, [nx, ny, nz] = pj.n;
  for (const r of rings) {
    const ring = [];
    let lx = Infinity, ly = Infinity;
    for (let i = 0; i < r.length; i += 3) {
      const x = r[i], y = r[i + 1], z = r[i + 2];
      let sx = cx + k * (x * ex + y * ey), sy = cy - k * (x * nx + y * ny + z * nz);
      if (x * fx + y * fy + z * fz < 0) { const dx = sx - cx, dy = sy - cy, d = Math.hypot(dx, dy) || 1; sx = cx + dx / d * k; sy = cy + dy / d * k; }
      if (Math.abs(sx - lx) > tol || Math.abs(sy - ly) > tol || i === r.length - 3) { ring.push([sx, sy]); lx = sx; ly = sy; }
    }
    if (ring.length >= 3) out.push(ring);
  }
  return out;
}
/** SVG path data for filled rings (flat unit vectors). */
export function ringsPath(pj, rings) {
  let d = '';
  for (const r of screenRings(pj, rings)) d += 'M' + r.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z';
  return d;
}
/**
 * Open lines (flat unit vectors) cut at the horizon -> pieces of [[x, y], …].
 * A piece that leaves or enters the near side ends on the horizon circle.
 */
export function screenLines(pj, lines) {
  const out = [];
  const { k, cx, cy } = pj, [fx, fy, fz] = pj.f, [ex, ey] = pj.e, [nx, ny, nz] = pj.n;
  for (const l of lines) {
    let piece = null, px = 0, py = 0, pz = 0;
    for (let i = 0; i < l.length; i += 3) {
      const x = l[i], y = l[i + 1], z = l[i + 2];
      const sx = cx + k * (x * ex + y * ey), sy = cy - k * (x * nx + y * ny + z * nz), sz = x * fx + y * fy + z * fz;
      if (i && (sz >= 0) !== (pz >= 0)) {
        // Where the segment crosses the horizon, pushed out onto the circle.
        const t = pz / (pz - sz), hx = px + (sx - px) * t - cx, hy = py + (sy - py) * t - cy, d = Math.hypot(hx, hy) || 1;
        const h = [cx + hx / d * k, cy + hy / d * k];
        if (piece) { piece.push(h); out.push(piece); piece = null; } else piece = [h];
      }
      if (sz >= 0) (piece ||= []).push([sx, sy]);
      px = sx; py = sy; pz = sz;
    }
    if (piece && piece.length > 1) out.push(piece);
  }
  return out;
}
export function linesPath(pj, lines) {
  let d = '';
  for (const p of screenLines(pj, lines)) if (p.length > 1) d += 'M' + p.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L');
  return d;
}

/**
 * Visvalingam's effective area of every vertex, in square radians on the unit
 * sphere, with arc ends kept always. Both sides of a shared border use the
 * same arc, so leaving out the same vertices opens no gaps between them.
 */
function visvalingam(P, start, A) {
  const W = new Float32Array(start[A]).fill(Infinity);
  let max = 0;
  for (let a = 0; a < A; a++) max = Math.max(max, start[a + 1] - start[a]);
  const prev = new Int32Array(max), next = new Int32Array(max), area = new Float64Array(max);
  const heap = new Int32Array(max), pos = new Int32Array(max);
  for (let a = 0; a < A; a++) {
    const s = start[a], n = start[a + 1] - s;
    if (n < 3) continue;
    const tri = (i) => {
      const p = 3 * (s + prev[i]), q = 3 * (s + i), r = 3 * (s + next[i]);
      const ux = P[p] - P[q], uy = P[p + 1] - P[q + 1], uz = P[p + 2] - P[q + 2];
      const vx = P[r] - P[q], vy = P[r + 1] - P[q + 1], vz = P[r + 2] - P[q + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      return Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
    };
    let size = 0;
    const swap = (i, j) => { const t = heap[i]; heap[i] = heap[j]; heap[j] = t; pos[heap[i]] = i; pos[heap[j]] = j; };
    const up = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (area[heap[i]] >= area[heap[p]]) break; swap(i, p); i = p; } };
    const down = (i) => {
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < size && area[heap[l]] < area[heap[m]]) m = l;
        if (r < size && area[heap[r]] < area[heap[m]]) m = r;
        if (m === i) return;
        swap(i, m); i = m;
      }
    };
    for (let i = 1; i < n - 1; i++) { prev[i] = i - 1; next[i] = i + 1; }
    for (let i = 1; i < n - 1; i++) { area[i] = tri(i); heap[size] = i; pos[i] = size; up(size++); }
    let last = 0;
    while (size) {
      const i = heap[0];
      swap(0, --size); down(0);
      // Never less than a vertex removed before it, so a threshold keeps a prefix.
      last = Math.max(area[i], last);
      W[s + i] = last;
      const p = prev[i], q = next[i];
      next[p] = q; prev[q] = p;
      if (p > 0) { area[p] = tri(p); up(pos[p]); down(pos[p]); }
      if (q < n - 1) { area[q] = tri(q); up(pos[q]); down(pos[q]); }
    }
  }
  return W;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hexRgb = (s) => {
  s = s.trim();
  if (s[0] === '#') {
    const h = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = s.match(/\d+(\.\d+)?/g);
  return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
};
const rgbText = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

export class Globe {
  /**
   * base: canvas under the step areas (sea, land, relief, rivers, lakes);
   * lines: canvas above them (borders and coasts).
   */
  constructor(topo, base, lines, polityCount) {
    this.base = base; this.lines = lines;
    this.bctx = base.getContext('2d'); this.lctx = lines.getContext('2d');
    this.polityCount = polityCount;
    const { scale: [kx, ky], translate: [tx, ty] } = topo.transform;
    let n = 0;
    for (const a of topo.arcs) n += a.length;
    const A = topo.arcs.length;
    const P = new Float64Array(n * 3), start = new Int32Array(A + 1), seam = new Uint8Array(A);
    let j = 0;
    topo.arcs.forEach((arc, i) => {
      start[i] = j;
      let x = 0, y = 0, onSeam = arc.length > 1;
      let lon0 = null, lat0 = null, sameLon = true, sameLat = true;
      for (const [dx, dy] of arc) {
        x += dx; y += dy;
        const lon = x * kx + tx, lat = y * ky + ty, v = unit(lon, lat);
        P[3 * j] = v[0]; P[3 * j + 1] = v[1]; P[3 * j + 2] = v[2]; j++;
        // Arcs along the antimeridian, the south pole or a tile edge are cuts in
        // the data, not coasts.
        if (lon0 === null) { lon0 = lon; lat0 = lat; }
        if (Math.abs(lon - lon0) > 1e-4) sameLon = false;
        if (Math.abs(lat - lat0) > 1e-4) sameLat = false;
        if (!(Math.abs(Math.abs(lon) - 180) < 1e-3 || lat < -89.99)) onSeam = false;
      }
      const onTile = (sameLon && Math.abs(lon0 / 30 - Math.round(lon0 / 30)) < 1e-4) || (sameLat && Math.abs(lat0 / 30 - Math.round(lat0 / 30)) < 1e-4);
      seam[i] = onSeam || (onTile && arc.length > 1) ? 1 : 0;
    });
    start[A] = j;
    this.P = P; this.start = start; this.N = n; this.A = A;
    this.W = visvalingam(P, start, A);
    this.thr = 0;
    this.SX = new Float32Array(n); this.SY = new Float32Array(n); this.SZ = new Float32Array(n);

    // Arc caps, for culling lines.
    const arcCap = new Float64Array(A * 4);
    for (let i = 0; i < A; i++) {
      const c = capOf([P.subarray(3 * start[i], 3 * start[i + 1])]);
      arcCap.set(c, 4 * i);
    }
    this.arcCap = arcCap;

    const polys = (g) => (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []);
    const geomCap = (ps) => {
      const pts = [];
      for (const p of ps) for (const r of p) for (const a of r) { const i = a < 0 ? ~a : a; pts.push(P.subarray(3 * start[i], 3 * start[i + 1])); }
      return capOf(pts);
    };
    const shapes = (obj) => obj.geometries.map((g) => { const ps = polys(g).map((p) => p.map((r) => Int32Array.from(r))); return { polys: ps, cap: ps.length ? geomCap(ps) : [0, 0, 1, -1] }; });
    this.atoms = shapes(topo.objects.atoms);
    this.world = shapes(topo.objects.world);
    this.lakes = shapes(topo.objects.lakes);
    this.NA = this.atoms.length;

    // Who uses each arc: atom index, or -2 for the world land.
    const use0 = new Int32Array(A).fill(-1), use1 = new Int32Array(A).fill(-1), uses = new Uint8Array(A);
    const note = (who) => (a) => { const i = a < 0 ? ~a : a; if (uses[i] === 0) use0[i] = who; else if (uses[i] === 1) use1[i] = who; uses[i]++; };
    this.atoms.forEach((s, i) => { const f = note(i); for (const p of s.polys) for (const r of p) r.forEach(f); });
    const fw = note(-2);
    for (const s of this.world) for (const p of s.polys) for (const r of p) r.forEach(fw);
    this.use0 = use0; this.use1 = use1;
    this.coastArcs = Int32Array.from([...Array(A).keys()].filter((i) => uses[i] === 1 && !seam[i]));
    this.sharedArcs = Int32Array.from([...Array(A).keys()].filter((i) => uses[i] === 2 && use0[i] !== use1[i]));

    // Rivers: lines of arcs, split into major and minor by the river's length.
    const lineArcs = (g) => (g.type === 'LineString' ? [g.arcs] : g.type === 'MultiLineString' ? g.arcs : []);
    const lengths = new Map();
    const rivers = topo.objects.rivers.geometries.map((g) => {
      const ls = lineArcs(g);
      let len = 0;
      for (const l of ls) for (const a of l) {
        const i = a < 0 ? ~a : a;
        for (let q = start[i] + 1; q < start[i + 1]; q++) {
          const d = P[3 * q] * P[3 * q - 3] + P[3 * q + 1] * P[3 * q - 2] + P[3 * q + 2] * P[3 * q - 1];
          len += Math.acos(Math.min(1, d)) * R;
        }
      }
      const name = g.properties?.name || '';
      if (name) lengths.set(name, (lengths.get(name) || 0) + len);
      return { name, arcs: ls.flat() };
    });
    this.riverMajor = Int32Array.from(rivers.filter((r) => lengths.get(r.name) >= 500).flatMap((r) => r.arcs.map((a) => (a < 0 ? ~a : a))));
    this.riverMinor = Int32Array.from(rivers.filter((r) => !(lengths.get(r.name) >= 500)).flatMap((r) => r.arcs.map((a) => (a < 0 ? ~a : a))));

    // A ten-degree graticule, as lines of unit vectors.
    const grat = [];
    for (let lon = -180; lon < 180; lon += 10) { const l = []; for (let lat = -80; lat <= 80; lat += 1) l.push(...unit(lon, lat)); grat.push(Float64Array.from(l)); }
    for (let lat = -80; lat <= 80; lat += 10) { const l = []; for (let lon = -180; lon <= 180; lon += 1) l.push(...unit(lon, lat)); grat.push(Float64Array.from(l)); }
    this.graticule = grat;

    // Fill state: a colour code per atom (-1 land, 2o polity o, 2o+1 polity o muted).
    this.code = new Int32Array(this.NA).fill(-1);
    this.fromRGB = new Float32Array(this.NA * 3);
    this.fading = null; // {t0, atoms: Int32Array}
    this.borderArcs = new Int32Array(0);
    this.relief = null;
    this.reliefAlpha = 0;
    this.showGraticule = false;
    this.pj = null; this.dpr = 1;
    this.drawnView = null; this.raf = 0; this.lastDraw = 0;
    this.readColors();
  }

  readColors() {
    const cs = getComputedStyle(document.documentElement), v = (name) => cs.getPropertyValue(name).trim();
    this.colors = {
      space: v('--space'), sea: v('--sea'), seaCenter: v('--sea-center'), seaEdge: v('--sea-edge'), seaInk: v('--sea-ink'),
      land: v('--land'), river: v('--river'), riverMajor: v('--river-major'), bline: v('--bline'), coast: v('--coast'), line: v('--line'),
    };
    const pal = new Array(this.polityCount * 2);
    for (let o = 0; o < this.polityCount; o++) { pal[2 * o] = hexRgb(v(`--p${o}`)); pal[2 * o + 1] = hexRgb(v(`--q${o}`)); }
    this.palette = pal;
    this.landRGB = hexRgb(this.colors.land);
    this.drawnView = null;
  }
  rgb(code) { return code < 0 ? this.landRGB : this.palette[code] || this.landRGB; }

  resize(w, h, dpr) {
    this.dpr = dpr;
    for (const c of [this.base, this.lines]) {
      c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
      c.style.width = w + 'px'; c.style.height = h + 'px';
    }
    this.drawnView = null;
  }

  /** New colour codes per atom; changed atoms fade over 600 ms when `animate`. */
  setFills(codes, animate) {
    const now = performance.now();
    const changed = [];
    for (let i = 0; i < this.NA; i++) if (codes[i] !== this.code[i]) changed.push(i);
    if (!changed.length) return;
    if (animate) {
      // Start from what is on screen now, even halfway through a fade.
      const cur = this.displayRGB(now);
      const fading = new Set(this.fading ? this.fading.atoms : []);
      for (const i of changed) { const c = cur(i); this.fromRGB[3 * i] = c[0]; this.fromRGB[3 * i + 1] = c[1]; this.fromRGB[3 * i + 2] = c[2]; fading.add(i); }
      for (const i of this.fading ? this.fading.atoms : []) if (!changed.includes(i)) { const c = cur(i); this.fromRGB.set(c, 3 * i); }
      this.fading = { t0: now, atoms: Int32Array.from(fading) };
    }
    this.code = Int32Array.from(codes);
    if (!animate && this.fading) this.fading = null;
    this.drawnView = null;
    this.invalidate();
  }
  displayRGB(now) {
    const f = this.fading;
    const t = f ? ease(Math.min(1, (now - f.t0) / 600)) : 1;
    const fading = f && t < 1 ? new Set(f.atoms) : null;
    return (i) => {
      const to = this.rgb(this.code[i]);
      if (!fading || !fading.has(i)) return to;
      return [0, 1, 2].map((c) => this.fromRGB[3 * i + c] + (to[c] - this.fromRGB[3 * i + c]) * t);
    };
  }
  /** Border arcs for owners `own` (atom -> polity index, -1 none). */
  bordersFor(own) {
    const out = [];
    const { use0, use1 } = this;
    for (const i of this.sharedArcs) {
      const a = use0[i] >= 0 ? own[use0[i]] : -1, b = use1[i] >= 0 ? own[use1[i]] : -1;
      if (a !== b) out.push(i);
    }
    return Int32Array.from(out);
  }
  setBorderArcs(arcs) { this.borderArcs = arcs; this.drawnView = null; this.invalidate(); }
  setRelief(img, bounds) {
    // Halved copies, so that a zoomed-out globe samples a raster about as
    // coarse as its pixels instead of picking scattered source pixels.
    const levels = [];
    let src = img, w = img.naturalWidth, h = img.naturalHeight;
    for (let i = 0; i < 5 && w >= 32; i++) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, w, h);
      levels.push({ data: g.getImageData(0, 0, w, h).data, w, h });
      src = c; w = Math.round(w / 2); h = Math.round(h / 2);
    }
    this.relief = { levels, bounds, canvas: document.createElement('canvas') };
    this.drawnView = null;
    this.invalidate();
  }

  setProjector(pj) { this.pj = pj; }
  /** Draw now, unless this view is already on screen. */
  drawIfChanged() {
    const v = this.pj?.view;
    if (!v || (this.drawnView && this.drawnView.lon === v.lon && this.drawnView.lat === v.lat && this.drawnView.k === v.k && this.drawnView.w === this.pj.w && this.drawnView.h === this.pj.h)) return;
    this.draw();
  }
  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (performance.now() - this.lastDraw > 8 || !this.drawnView) this.draw();
      if (this.fading) this.invalidate();
    });
  }
  /** Draw the settled, finer version once nothing has moved for a moment. */
  settleLater() {
    clearTimeout(this.settleT);
    this.settleT = setTimeout(() => {
      if (this.raf || this.fading) return this.settleLater();
      this.draw(true);
    }, 150);
  }

  project() {
    const { P, SX, SY, SZ, N } = this, pj = this.pj;
    const { k, cx, cy } = pj, [fx, fy, fz] = pj.f, [ex, ey] = pj.e, [nx, ny, nz] = pj.n;
    for (let i = 0, q = 0; i < N; i++, q += 3) {
      const x = P[q], y = P[q + 1], z = P[q + 2];
      let sx = cx + k * (x * ex + y * ey), sy = cy - k * (x * nx + y * ny + z * nz);
      const sz = x * fx + y * fy + z * fz;
      if (sz < 0) { const dx = sx - cx, dy = sy - cy, d = Math.hypot(dx, dy) || 1; sx = cx + dx / d * k; sy = cy + dy / d * k; }
      SX[i] = sx; SY[i] = sy; SZ[i] = sz;
    }
  }

  /** Add the rings of shape s to the current path. */
  trace(ctx, s) {
    const { start, SX, SY, W, thr } = this;
    for (const p of s.polys) for (const r of p) {
      let first = true;
      for (let ai = 0; ai < r.length; ai++) {
        const a = r[ai], i = a < 0 ? ~a : a, s0 = start[i], s1 = start[i + 1] - 1;
        const step = a < 0 ? -1 : 1;
        let q = a < 0 ? s1 : s0;
        const end = a < 0 ? s0 : s1;
        if (!first) q += step; // shared with the previous arc
        for (;; q += step) {
          if (first) { ctx.moveTo(SX[q], SY[q]); first = false; }
          else if (W[q] >= thr) ctx.lineTo(SX[q], SY[q]);
          if (q === end) break;
        }
      }
      ctx.closePath();
    }
  }
  /** Stroke arcs, cut at the horizon. */
  strokeArcs(ctx, arcs, vis) {
    const { start, SX, SY, SZ, W, thr } = this;
    for (const i of arcs) {
      if (!vis[i]) continue;
      let pen = false, prev = -1;
      const s0 = start[i], s1 = start[i + 1];
      for (let q = s0; q < s1; q++) {
        if (W[q] < thr) continue;
        if (SZ[q] >= 0) {
          if (!pen) { if (prev >= 0) ctx.moveTo(SX[prev], SY[prev]), ctx.lineTo(SX[q], SY[q]); else ctx.moveTo(SX[q], SY[q]); pen = true; }
          else ctx.lineTo(SX[q], SY[q]);
        } else if (pen) { ctx.lineTo(SX[q], SY[q]); pen = false; }
        prev = q;
      }
    }
  }
  arcVisibility() {
    const vis = new Uint8Array(this.A), pj = this.pj, c = this.arcCap;
    const cap = [0, 0, 0, 0];
    for (let i = 0; i < this.A; i++) { cap[0] = c[4 * i]; cap[1] = c[4 * i + 1]; cap[2] = c[4 * i + 2]; cap[3] = c[4 * i + 3]; vis[i] = capVisible(pj, cap, 2) ? 1 : 0; }
    return vis;
  }

  draw(settled = false) {
    const pj = this.pj;
    if (!pj) return;
    const now = performance.now();
    this.lastDraw = now;
    this.settled = settled;
    this.thr = (settled ? AREA_SETTLED : AREA_MOVING) / (pj.k * pj.k);
    if (!settled) this.settleLater();
    this.drawnView = { ...pj.view, w: pj.w, h: pj.h };
    this.project();
    const C = this.colors, { k, cx, cy, w, h } = pj, dpr = this.dpr;
    const ctx = this.bctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.space;
    ctx.fillRect(0, 0, w, h);
    // The sea: lighter towards the middle of the globe.
    const sea = ctx.createRadialGradient(cx, cy, 0, cx, cy, k);
    sea.addColorStop(0, C.seaCenter); sea.addColorStop(0.75, C.sea); sea.addColorStop(1, C.seaEdge);
    ctx.beginPath(); ctx.arc(cx, cy, k, 0, 2 * Math.PI);
    ctx.fillStyle = sea; ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    if (this.showGraticule) {
      ctx.beginPath();
      for (const piece of screenLines(pj, this.graticule)) { ctx.moveTo(piece[0][0], piece[0][1]); for (let i = 1; i < piece.length; i++) ctx.lineTo(piece[i][0], piece[i][1]); }
      ctx.strokeStyle = C.seaInk; ctx.globalAlpha = 0.23; ctx.lineWidth = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
    }

    const shown = (s) => s.cap[3] >= 0 && capVisible(pj, s.cap, 1);
    // World land, then the atoms grouped by colour. Each fill is also stroked
    // in its own colour so that no seam shows between neighbours.
    const fillGroup = (list, color) => {
      ctx.beginPath();
      for (const s of list) this.trace(ctx, s);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 0.6; ctx.stroke();
    };
    fillGroup(this.world.filter(shown), C.land);
    const groups = new Map();
    const color = this.displayRGB(now);
    const f = this.fading;
    if (f && now - f.t0 >= 600) this.fading = null;
    const fadingSet = this.fading ? new Set(this.fading.atoms) : null;
    for (let i = 0; i < this.NA; i++) {
      const s = this.atoms[i];
      if (!shown(s)) continue;
      const key = fadingSet?.has(i) ? rgbText(color(i)) : this.code[i];
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(s);
    }
    for (const [key, list] of groups) fillGroup(list, typeof key === 'string' ? key : rgbText(this.rgb(key)));

    if (this.relief && this.reliefAlpha > 0) this.drawRelief(ctx);

    const vis = this.arcVisibility();
    ctx.beginPath(); this.strokeArcs(ctx, this.riverMinor, vis);
    ctx.strokeStyle = C.river; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); this.strokeArcs(ctx, this.riverMajor, vis);
    ctx.strokeStyle = C.riverMajor; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.beginPath();
    for (const s of this.lakes) if (shown(s)) this.trace(ctx, s);
    ctx.fillStyle = C.sea; ctx.fill();
    ctx.strokeStyle = C.coast; ctx.lineWidth = 0.78; ctx.stroke();

    // The horizon.
    ctx.beginPath(); ctx.arc(cx, cy, k, 0, 2 * Math.PI);
    ctx.strokeStyle = C.coast; ctx.lineWidth = 0.9; ctx.stroke();

    const lc = this.lctx;
    lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    lc.clearRect(0, 0, w, h);
    lc.lineJoin = 'round'; lc.lineCap = 'round';
    lc.beginPath(); this.strokeArcs(lc, this.borderArcs, vis);
    lc.strokeStyle = C.bline; lc.lineWidth = 0.95; lc.stroke();
    lc.beginPath(); this.strokeArcs(lc, this.coastArcs, vis);
    lc.strokeStyle = C.coast; lc.lineWidth = 0.95; lc.stroke();
  }

  /**
   * The shaded relief is a raster in the authoring projection. Sample it for
   * each pixel of a small canvas, about as fine as the raster itself at this
   * zoom, and let drawImage smooth it up to size.
   */
  drawRelief(ctx) {
    const pj = this.pj, rel = this.relief, { k, cx, cy, w, h } = pj;
    const [bx, by, bw, bh] = rel.bounds;
    const kmPerSource = bw / rel.levels[0].w, kmPerPx = R / k;
    const q = Math.min(this.settled ? 1 : 0.5, kmPerPx / kmPerSource);
    const level = rel.levels[Math.max(0, Math.min(rel.levels.length - 1, Math.floor(Math.log2(kmPerPx / kmPerSource))))];
    const src = level.data, lw = level.w, lh = level.h;
    const ow = Math.max(2, Math.ceil(w * q)), oh = Math.max(2, Math.ceil(h * q));
    const oc = rel.canvas;
    if (oc.width !== ow || oc.height !== oh) { oc.width = ow; oc.height = oh; rel.ctx = oc.getContext('2d'); rel.img = rel.ctx.createImageData(ow, oh); }
    const out = rel.img.data;
    out.fill(0);
    const [fx, fy, fz] = pj.f, [ex, ey] = pj.e, [nx, ny, nz] = pj.n;
    const [Fx, Fy, Fz] = LAEA.f, [Ex, Ey] = LAEA.e, [Nx, Ny, Nz] = LAEA.n;
    const minCos = Math.cos(70 * RAD);
    const sxk = w / ow / k, sw = lw / bw, sh = lh / bh;
    for (let j = 0; j < oh; j++) {
      const Y = -((j + 0.5) * h / oh - cy) / k;
      for (let i = 0; i < ow; i++) {
        const X = (i + 0.5) * sxk - cx / k, r2 = X * X + Y * Y;
        if (r2 >= 1) continue;
        const Z = Math.sqrt(1 - r2);
        const x = X * ex + Y * nx + Z * fx, y = X * ey + Y * ny + Z * fy, z = Y * nz + Z * fz;
        const c = x * Fx + y * Fy + z * Fz;
        if (c < minCos) continue;
        const kk = R * Math.sqrt(2 / (1 + c));
        const u = ((kk * (x * Ex + y * Ey)) - bx) * sw, v = ((-kk * (x * Nx + y * Ny + z * Nz)) - by) * sh;
        if (u < 0 || v < 0 || u >= lw || v >= lh) continue;
        const s = 4 * ((v | 0) * lw + (u | 0)), o = 4 * (j * ow + i);
        out[o] = src[s]; out[o + 1] = src[s + 1]; out[o + 2] = src[s + 2]; out[o + 3] = src[s + 3];
      }
    }
    rel.ctx.putImageData(rel.img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = this.reliefAlpha;
    ctx.drawImage(oc, 0, 0, w, h);
    ctx.restore();
  }
}

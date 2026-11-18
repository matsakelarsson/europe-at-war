// One-off: recover the projection used for sweden-at-war's pre-projected SVG data.
// Control points: planar centroids of old regions that are identical to
// Natural Earth admin-1 regions, compared with the same regions projected by a
// candidate projection plus a similarity transform. Writes .cache/sweden/fit.json.
import { readFileSync, writeFileSync } from 'node:fs';
import * as d3 from 'd3-geo';

const D = JSON.parse(readFileSync('.cache/sweden/D.json', 'utf8'));
const ne = JSON.parse(readFileSync('.cache/ne/admin1.geojson', 'utf8'));
const atomsIdx = JSON.parse(readFileSync('content/borders/atoms.json', 'utf8'));

const CONTROL = {
  scania: ['SE-M'], halland: ['SE-N'], blekinge: ['SE-K'], gotland: ['SE-I'], jh: ['SE-Z'], osel: ['EE-74'],
  sax: ['DE-SN'], hes: ['DE-HE'], wb: ['DE-BW'],
  sui: atomsIdx.filter((a) => a.country === 'CHE').map((a) => a.id),
  ald: atomsIdx.filter((a) => a.country === 'ALD').map((a) => a.id),
};
const idOf = (p) => (/^[A-Z]{2}-[A-Z0-9]{1,4}$/.test(p.iso_3166_2 || '') ? p.iso_3166_2 : p.adm1_code);
const geomById = new Map();
for (const f of ne.features) { const p = f.properties; const id = idOf(p); if (!geomById.has(id)) geomById.set(id, f.geometry); geomById.set(p.adm1_code, f.geometry); }

function parseRings(d) {
  const rings = []; let cur = null;
  for (const [, c, a] of d.matchAll(/([MLZ])([^MLZ]*)/g)) {
    if (c === 'M') { if (cur) rings.push(cur); cur = [a.split(',').map(Number)]; }
    else if (c === 'L') cur.push(a.split(',').map(Number));
    else { if (cur) rings.push(cur); cur = null; }
  }
  if (cur) rings.push(cur);
  return rings;
}
function centroid(rings) {
  let A = 0, cx = 0, cy = 0;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const c = r[j][0] * r[i][1] - r[i][0] * r[j][1]; A += c; cx += (r[j][0] + r[i][0]) * c; cy += (r[j][1] + r[i][1]) * c;
  }
  A /= 2; return { A: Math.abs(A), c: [cx / (6 * A), cy / (6 * A)] };
}
const regions = Object.entries(CONTROL).map(([k, ids]) => {
  const old = centroid(parseRings(D.regions[k]));
  const rings = [];
  for (const id of ids) {
    const g = geomById.get(id); if (!g) throw new Error('missing ' + id);
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polys) for (const r of p) rings.push(r.filter((_, i) => i % 3 === 0 || i === r.length - 1));
  }
  return { k, old, rings, w: Math.sqrt(old.A) };
});
const POINTS = [{ ll: [18.0686, 59.3293], xy: [415.9, 349.8] }, { ll: [12.5683, 55.6761], xy: [277.4, 494.5] }];

function evaluate(proj) {
  const src = [], dst = [], w = [], areas = [];
  for (const r of regions) {
    const pr = r.rings.map((ring) => ring.map((p) => proj(p)));
    const c = centroid(pr);
    src.push(c.c); dst.push(r.old.c); w.push(r.w); areas.push([c.A, r.old.A]);
  }
  for (const p of POINTS) { src.push(proj(p.ll)); dst.push(p.xy); w.push(30); }
  // weighted similarity fit: x' = a u - b v + tx, y' = b u + a v + ty
  let W = 0, mu = [0, 0], mx = [0, 0];
  for (let i = 0; i < src.length; i++) { W += w[i]; mu[0] += w[i] * src[i][0]; mu[1] += w[i] * src[i][1]; mx[0] += w[i] * dst[i][0]; mx[1] += w[i] * dst[i][1]; }
  mu = mu.map((v) => v / W); mx = mx.map((v) => v / W);
  let sab = 0, sbb = 0, suu = 0;
  for (let i = 0; i < src.length; i++) {
    const u = src[i][0] - mu[0], v = src[i][1] - mu[1], x = dst[i][0] - mx[0], y = dst[i][1] - mx[1];
    sab += w[i] * (u * x + v * y); sbb += w[i] * (u * y - v * x); suu += w[i] * (u * u + v * v);
  }
  const a = sab / suu, b = sbb / suu;
  const T = (p) => [a * (p[0] - mu[0]) - b * (p[1] - mu[1]) + mx[0], b * (p[0] - mu[0]) + a * (p[1] - mu[1]) + mx[1]];
  let se = 0, n = 0, max = 0;
  for (let i = 0; i < src.length; i++) { const q = T(src[i]); const e = Math.hypot(q[0] - dst[i][0], q[1] - dst[i][1]); se += e * e; n++; max = Math.max(max, e); }
  return { rms: Math.sqrt(se / n), max, a, b, mu, mx, T, areas: areas.map(([pa, oa]) => oa / (pa * (a * a + b * b))) };
}

const families = {
  conicConformal: (l0, p1, p2) => d3.geoConicConformal().parallels([p1, p2]).rotate([-l0, 0]).scale(1000).translate([0, 0]),
  conicEqualArea: (l0, p1, p2) => d3.geoConicEqualArea().parallels([p1, p2]).rotate([-l0, 0]).scale(1000).translate([0, 0]),
  conicEquidistant: (l0, p1, p2) => d3.geoConicEquidistant().parallels([p1, p2]).rotate([-l0, 0]).scale(1000).translate([0, 0]),
  azimuthalEqualArea: (l0, p0) => d3.geoAzimuthalEqualArea().rotate([-l0, -p0]).scale(1000).translate([0, 0]),
  azimuthalEquidistant: (l0, p0) => d3.geoAzimuthalEquidistant().rotate([-l0, -p0]).scale(1000).translate([0, 0]),
  stereographic: (l0, p0) => d3.geoStereographic().rotate([-l0, -p0]).scale(1000).translate([0, 0]),
  orthographic: (l0, p0) => d3.geoOrthographic().rotate([-l0, -p0]).scale(1000).translate([0, 0]),
  mercator: (l0) => d3.geoMercator().rotate([-l0, 0]).scale(1000).translate([0, 0]),
  transverseMercator: (l0) => d3.geoTransverseMercator().rotate([-l0, 0]).scale(1000).translate([0, 0]),
  equirectangular: (l0) => d3.geoEquirectangular().rotate([-l0, 0]).scale(1000).translate([0, 0]),
};
const results = [];
for (const [name, mk] of Object.entries(families)) {
  let best = null;
  const arity = mk.length;
  const L0 = []; for (let l = 0; l <= 35; l += 1) L0.push(l);
  const P = []; for (let p = 40; p <= 75; p += 2.5) P.push(p);
  const tryIt = (args) => { const r = evaluate(mk(...args)); if (!best || r.rms < best.rms) best = { ...r, args }; };
  for (const l0 of L0) {
    if (arity === 1) tryIt([l0]);
    else if (arity === 2) for (const p0 of P) tryIt([l0, p0]);
    else for (let i = 0; i < P.length; i++) for (let j = i; j < P.length; j++) tryIt([l0, P[i], P[j]]);
  }
  // local refinement
  let step = 1;
  for (let it = 0; it < 60 && step > 0.01; it++) {
    let improved = false;
    for (let d = 0; d < best.args.length; d++) for (const s of [-step, step]) {
      const args = best.args.slice(); args[d] += s;
      const r = evaluate(mk(...args)); if (r.rms < best.rms) { best = { ...r, args }; improved = true; }
    }
    if (!improved) step /= 2;
  }
  results.push({ name, ...best });
  if (process.env.VERBOSE) { const r0 = evaluate(mk(...best.args)); regions.forEach((rg, i) => { const q = r0.T(rg.__src || [0, 0]); }); }
  console.log(name.padEnd(22), 'rms', best.rms.toFixed(3), 'max', best.max.toFixed(3), 'args', best.args.map((v) => +v.toFixed(3)).join(','), 'areaRatios', best.areas.map((v) => v.toFixed(2)).join(' '));
}
results.sort((a, b) => a.rms - b.rms);
const r = results[0];
writeFileSync('.cache/sweden/fit.json', JSON.stringify({ family: r.name, args: r.args, a: r.a, b: r.b, mu: r.mu, mx: r.mx, rms: r.rms }, null, 1));
console.log('best:', r.name, r.args, 'rms', r.rms);

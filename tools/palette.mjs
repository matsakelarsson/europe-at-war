// Recolour polities so that each stands apart from every polity it ever
// borders, keeping all other colours fixed. Run after a build (reads dist/).
//
//   node tools/palette.mjs <polity id | file.yaml | --auto> …  [--region <atom regex>] [--dry]
//
// A file means every polity defined in it (content/polities/<file>.yaml);
// --auto means every automatic polity (content/polities.auto.yaml). Colours
// come from the established range (CIELAB lightness 85–90, chroma 9–19) and
// keep a distance of at least 11 (CIEDE2000) from the sea. Neighbours are
// weighted by how many border states they share, so long neighbours count
// most. Colours are written back into the YAML files in place.
//
// --region also keeps apart polities that are on the map at the same time
// inside the region (atoms whose id matches the regex), even if they never
// touch: they appear side by side in war legends. These pairs count for a
// twentieth of a shared border state each, and real neighbours come first.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { CONTENT, listFiles } from './lib.mjs';
import { loadBuiltBorders } from './built-borders.mjs';
import { oklchToHex } from '../site/colors.js';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const ri = args.indexOf('--region');
const region = ri >= 0 ? new RegExp(args.splice(ri, 2)[1]) : null;
const SEA = '#d2dfe7';

// ---- CIELAB and CIEDE2000
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
const RAD = Math.PI / 180;
function de2000([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a, b) => { const v = Math.atan2(b, a) / RAD; return v < 0 ? v + 360 : v; };
  const h1 = h(a1p, b1), h2 = h(a2p, b2);
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = h2 - h1; if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * RAD);
  const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1 + h2; if (C1p * C2p !== 0) hm = Math.abs(h1 - h2) > 180 ? (h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2) : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * RAD) + 0.24 * Math.cos(2 * hm * RAD) + 0.32 * Math.cos((3 * hm + 6) * RAD) - 0.2 * Math.cos((4 * hm - 63) * RAD);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cmp, SH = 1 + 0.015 * Cmp * T;
  const RT = -Math.sin(2 * dTheta * RAD) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

// ---- Which polities to recolour
const files = {};
for (const f of await listFiles(join(CONTENT, 'polities'), '.yaml')) files[f] = join(CONTENT, 'polities', f);
files.auto = join(CONTENT, 'polities.auto.yaml');
// Where each polity is defined: curated files win over the automatic one,
// as in the build (an automatic polity with a curated id is ignored).
const where = new Map(); // id -> file path
for (const path of [join(CONTENT, 'polities.yaml'), ...Object.values(files)]) for (const p of YAML.parse(readFileSync(path, 'utf8')) || []) if (!where.has(p.id)) where.set(p.id, path);
const targets = new Set();
for (const a of args.filter((a) => a !== '--dry')) {
  const file = a === '--auto' ? files.auto : a.endsWith('.yaml') ? (files[a.split('/').pop()] || a) : null;
  // Only polities defined in that file: an automatic entry with a curated id
  // is not an automatic polity, and its curated colour stays.
  if (file) { for (const p of YAML.parse(readFileSync(file, 'utf8')) || []) if (where.get(p.id) === file) targets.add(p.id); }
  else targets.add(a);
}
if (!targets.size) { console.error('usage: node tools/palette.mjs <polity id | file.yaml | --auto> … [--dry]'); process.exit(1); }

// ---- Neighbours, from the built border timeline
const B = loadBuiltBorders();
const topo = JSON.parse(readFileSync(new URL('../dist/data/atoms.topo.json', import.meta.url)));
const arcAtoms = new Map();
topo.objects.atoms.geometries.forEach((g, i) => {
  const walk = (x) => { if (typeof x === 'number') { const k = x < 0 ? ~x : x; (arcAtoms.get(k) || arcAtoms.set(k, []).get(k)).push(i); } else x.forEach(walk); };
  walk(g.arcs || []);
});
const pairs = [];
for (const list of arcAtoms.values()) if (list.length === 2) pairs.push(list);
const P = B.polities, idx = new Map(P.map((p, i) => [p.id, i]));
const weight = new Map(); // "i,j" -> number of states in which they touch
const own = new Int16Array(B.atoms.length).fill(-1);
const co = new Map(); // "i,j" -> number of states in which both are in the region without touching
const inRegion = region ? B.atoms.map((a) => region.test(typeof a === 'string' ? a : a.id)) : null;
for (const t of B.timeline) {
  for (let j = 0; j < t.c.length; j += 2) own[t.c[j]] = t.c[j + 1];
  const seen = new Set();
  for (const [a, b] of pairs) {
    const p = own[a], q = own[b];
    if (p < 0 || q < 0 || p === q) continue;
    const key = p < q ? `${p},${q}` : `${q},${p}`;
    if (!seen.has(key)) { seen.add(key); weight.set(key, (weight.get(key) || 0) + 1); }
  }
  if (region) {
    const present = [...new Set([...own].filter((p, a) => p >= 0 && inRegion[a]))];
    for (let x = 0; x < present.length; x++) for (let y = x + 1; y < present.length; y++) {
      const [p, q] = present[x] < present[y] ? [present[x], present[y]] : [present[y], present[x]];
      const key = `${p},${q}`;
      if (!seen.has(key)) co.set(key, (co.get(key) || 0) + 1);
    }
  }
}
const nb = P.map(() => []);
for (const [key, w] of weight) { const [p, q] = key.split(',').map(Number); nb[p].push([q, w, true]); nb[q].push([p, w, true]); }
for (const [key, n] of co) {
  if (weight.has(key)) continue;
  const [p, q] = key.split(',').map(Number);
  nb[p].push([q, n / 20, false]); nb[q].push([p, n / 20, false]);
}

// ---- Candidates: OKLCH grid, kept to the established CIELAB range.
const seaLab = lab(SEA);
const cand = [];
for (let L = 0.86; L <= 0.935; L += 0.0125) for (const C of [0.035, 0.045, 0.055, 0.065]) for (let H = 0; H < 360; H += 6) {
  const hex = oklchToHex(L, C, H), l = lab(hex), chroma = Math.hypot(l[1], l[2]);
  if (l[0] < 85 || l[0] > 90 || chroma < 9 || chroma > 19 || de2000(l, seaLab) < 11) continue;
  cand.push({ hex, lab: l });
}
const color = P.map((p) => p.color), labs = color.map(lab);
const fixed = (i) => !targets.has(P[i].id);
const order = [...targets].map((id) => idx.get(id)).filter((i) => i !== undefined)
  .sort((a, b) => nb[b].reduce((s, [, w]) => s + w, 0) - nb[a].reduce((s, [, w]) => s + w, 0));
// Score: the worst neighbour distance counts most, then the weighted average.
const score = (i, l, placed) => {
  let worst = Infinity, sum = 0, tw = 0;
  for (const [j, w, border] of nb[i]) {
    if (!fixed(j) && !placed.has(j)) continue;
    const d = de2000(l, labs[j]);
    // Short contacts matter less; polities that only share the region matter
    // once every real neighbour is at least 6 apart.
    worst = Math.min(worst, border ? d + Math.log10(1 + 1 / w) * 4 : d + 6);
    sum += Math.min(d, 30) * w; tw += w;
  }
  return (worst === Infinity ? 100 : worst) * 10 + (tw ? sum / tw : 0);
};
const placed = new Set();
for (let pass = 0; pass < 3; pass++) {
  for (const i of order) {
    placed.delete(i);
    let best = null, bestScore = -Infinity;
    for (const c of cand) { const s = score(i, c.lab, placed); if (s > bestScore) { bestScore = s; best = c; } }
    color[i] = best.hex; labs[i] = best.lab; placed.add(i);
  }
}
let low = 0, lowRegion = 0;
for (const i of order) for (const [j, , border] of nb[i]) { const d = de2000(labs[i], labs[j]); if (border ? d < 6 : d < 3) border ? low++ : lowRegion++; }
console.log(`recoloured ${order.length} polities; ${low} neighbour pairs still under ΔE 6` + (region ? `, ${lowRegion} pairs in the region under ΔE 3` : ''));

// ---- Write back
if (dry) process.exit(0);
const byFile = new Map();
for (const i of order) { const path = where.get(P[i].id); if (path) (byFile.get(path) || byFile.set(path, []).get(path)).push(i); }
for (const [path, list] of byFile) {
  let text = readFileSync(path, 'utf8');
  for (const i of list) {
    const re = new RegExp(`(^- id: ${P[i].id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n(?:  .*\\n)*?  color: )["']?#[0-9a-fA-F]{6}["']?`, 'm');
    if (!re.test(text)) { console.warn(`${path}: no colour line for ${P[i].id}`); continue; }
    text = text.replace(re, `$1"${color[i]}"`);
  }
  writeFileSync(path, text);
}

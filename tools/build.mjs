// Validates content/ and emits the static site into dist/.
//
//   dist/index.html, app.js, style.css, vendor/…    (copied from site/)
//   dist/data/atoms.topo.json                      (from site-data/, see build-geo.mjs)
//   dist/data/borders.json                         polities + the dates of border changes
//   dist/data/borders/<bucket>.json                those changes and their notes, by date
//   dist/data/wars.json                            catalogue: names, dates, countries
//   dist/data/catalogue/<bucket>.json              summaries and step titles, by start date
//   dist/data/locales/<code>/…                     a language's index, and translated
//                                                  copies of the bucket files
// A bucket is a century, or part of a busy one (site/buckets.js).
//   dist/data/wars/<id>.json                       one per war
//   dist/data/labels.json                          seas, regions, capitals
//
// The site draws a globe, so everything it places is in [lon, lat]. Curves and
// views are worked out here in the authoring projection's km (projection.mjs)
// and then turned back into [lon, lat]: arrows as dense polylines, step views
// as [lon, lat, width km, height km].
//
// Exit code 1 on validation errors; warnings are printed but do not fail.
import { mkdir, writeFile, cp, rm, readFile, stat, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ROOT, CONTENT, readJSON, readYAML, listFiles, exists, loadPolities } from './lib.mjs';
import { loadLocales, prepareLocaleOutput, compileWarTranslations, compileLocaleMaps, emitLocales } from './locales.mjs';
import { bucketOf, bucketStarts } from '../site/buckets.js';
import { compileCapitals } from './capitals.mjs';
import { feature } from 'topojson-client';
import { geoArea } from 'd3-geo';
import { project, DATA_CLIP, FRAME, CENTER, boxView, localProjection, sphericalCenter } from './projection.mjs';
// A YAML string containing ": " without quotes parses as a mapping and would show as "[object Object]".
const NOT_TEXT = 'is not plain text (it contains ": "; put it in quotes)';
const isObj = (v) => v !== null && typeof v === 'object';

const DIST = join(ROOT, 'dist');
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

const INKS = ['blue', 'red', 'purple', 'orange', 'green', 'teal', 'brown', 'magenta', 'gold', 'slate', 'navy', 'olive', 'none'];
const KINDS = ['battle', 'naval', 'siege', 'held', 'taken', 'event', 'treaty', 'toll', 'air', 'capital'];
const AREA_STYLES = ['occupied', 'gained', 'pledged', 'lost', 'outline', 'contested', 'front'];

/** Sortable date key: "1658" -> "1658-00-00", "1658-02" -> "1658-02-00". */
export function dateKey(d) {
  if (d === undefined || d === null) return null;
  const m = String(d).trim().match(/^(-?\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!m) return null;
  return `${m[1].padStart(4, '0')}-${m[2] || '00'}-${m[3] || '00'}`;
}

// ---------------------------------------------------------------- polities
async function buildPolities() {
  const { byId, redirect } = await loadPolities();
  const list = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const index = new Map(list.map((p, i) => [p.id, i]));
  for (const [from, to] of redirect) if (index.has(to)) index.set(from, index.get(to));
  for (const p of list) {
    if (!/^#[0-9a-f]{6}$/i.test(p.color || '')) err(`polity ${p.id}: bad color ${p.color}`);
    if (p.ink && !INKS.includes(p.ink)) err(`polity ${p.id}: unknown ink ${p.ink}`);
    if (p.id === 'none') err('polity id "none" is reserved (it means no state in border events)');
  }
  return { list, index };
}

// ---------------------------------------------------------------- borders
async function buildBorders(pol, topo) {
  const atomsMeta = await readJSON(join(CONTENT, 'borders/atoms.json'));
  const meta = new Map(atomsMeta.map((a) => [a.id, a]));
  const order = topo.objects.atoms.geometries.map((g) => g.properties.id);
  const aidx = new Map(order.map((id, i) => [id, i]));
  const children = new Map();
  for (const a of atomsMeta) if (a.parent) (children.get(a.parent) || children.set(a.parent, []).get(a.parent)).push(a.id);
  /** An atom id means the original region, including any split-off children. */
  const expand = (id, where) => {
    // "X!" means only what is left of X itself, without its split-off children.
    if (id.endsWith('!')) { const x = id.slice(0, -1); if (aidx.has(x)) return [aidx.get(x)]; err(`${where}: unknown atom ${x}`); return []; }
    const out = [];
    const walk = (x) => { if (aidx.has(x)) out.push(aidx.get(x)); for (const c of children.get(x) || []) walk(c); };
    walk(id);
    if (!out.length) err(`${where}: unknown atom ${id}`);
    return out;
  };
  const polIdx = (id, where) => {
    if (id === '-' || id === null) return -1;
    if (!pol.index.has(id)) { err(`${where}: unknown polity ${id}`); return -1; }
    return pol.index.get(id);
  };

  // Curated ranges: keyframe assignments for these atoms inside [from, until) are ignored.
  const curated = [];
  if (await exists(join(CONTENT, 'borders/curated.yaml'))) {
    for (const c of (await readYAML(join(CONTENT, 'borders/curated.yaml'))) || []) {
      const set = new Set((c.atoms || []).flatMap((id) => expand(id, `curated ${c.name}`)));
      curated.push({ from: dateKey(c.from), until: dateKey(c.until), set });
    }
  }
  const isCurated = (i, key) => curated.some((c) => key >= c.from && key < c.until && c.set.has(i));

  const entries = [];
  for (const f of await listFiles(join(CONTENT, 'borders/keyframes'), '.json')) {
    const kf = await readJSON(join(CONTENT, 'borders/keyframes', f));
    const set = new Map();
    for (const [p, ids] of Object.entries(kf.owners)) {
      const pi = polIdx(p, `keyframe ${f}`);
      for (const id of ids) {
        if (!aidx.has(id) && !children.has(id)) { warn(`keyframe ${f}: atom ${id} no longer exists`); continue; }
        // Children inherit from the parent unless they are listed themselves.
        for (const i of expand(id, `keyframe ${f}`)) if (!set.has(i) || order[i] === id) set.set(i, pi);
      }
    }
    const key = dateKey(kf.date);
    const raw = new Map(set);
    for (const i of [...set.keys()]) if (isCurated(i, key)) set.delete(i);
    entries.push({ key, date: String(kf.date), src: kf.source || f, kind: 'keyframe', set, raw });
  }
  for (const f of await listFiles(join(CONTENT, 'borders/events'), '.yaml')) {
    const evs = (await readYAML(join(CONTENT, 'borders/events', f))) || [];
    for (const [k, ev] of evs.entries()) {
      const where = `events ${f} #${k + 1}`;
      if (!dateKey(ev.date)) { err(`${where}: bad date ${ev.date}`); continue; }
      const set = new Map();
      for (const [p, ids] of Object.entries(ev.owners || {})) {
        // "-" in an event means: no curated owner, use the latest keyframe;
        // "none" means: no state (plain land), as for tribal lands.
        const pi = p === '-' ? 'kf' : p === 'none' ? -1 : polIdx(p, where);
        // As in keyframes: an atom listed itself beats one reached through its parent.
        for (const id of ids) for (const i of expand(id, where)) if (!set.has(i) || order[i] === id || `${order[i]}!` === id) set.set(i, pi);
      }
      entries.push({ key: dateKey(ev.date), date: String(ev.date), src: ev.note || f, kind: 'event', war: ev.war, set });
    }
  }
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.kind === 'keyframe' ? -1 : 1));

  // Resolve full states to compute deltas and lint.
  const N = order.length;
  let state = new Int16Array(N).fill(-1);
  const lastKf = new Int16Array(N).fill(-1); // owner per the latest keyframe, ignoring curated ranges
  const timeline = [];
  const history = Array.from({ length: N }, () => []);
  for (const e of entries) {
    const next = state.slice();
    if (e.kind === 'keyframe') for (const [i, p] of e.raw || e.set) lastKf[i] = p;
    for (const [i, p] of e.set) next[i] = p === 'kf' ? lastKf[i] : p;
    const changes = [];
    for (let i = 0; i < N; i++) if (next[i] !== state[i]) { changes.push(i, next[i]); history[i].push({ key: e.key, p: next[i], kind: e.kind }); }
    timeline.push({ d: e.date, k: e.key, s: e.src, c: changes });
    state = next;
  }
  // Flip-flop lint: A -> B -> A within 60 years where a draft keyframe is involved.
  const reviewed = new Set();
  for (const r of (await exists(join(CONTENT, 'borders', 'reviewed.yaml'))) ? (await readYAML(join(CONTENT, 'borders', 'reviewed.yaml'))) || [] : []) {
    const k = dateKey(r.at);
    if (!k) err(`borders/reviewed.yaml: bad date ${r.at}`);
    for (const a of r.atoms || []) reviewed.add(`${a}@${k}`);
  }
  const flips = [];
  const pname = (pi) => (pi < 0 ? '-' : pol.list[pi].id);
  for (let i = 0; i < N; i++) {
    const h = history[i];
    for (let k = 2; k < h.length; k++) {
      if (h[k].p === h[k - 2].p && h[k].p !== h[k - 1].p && (h[k].kind === 'keyframe' || h[k - 1].kind === 'keyframe')) {
        const y0 = +h[k - 1].key.slice(0, 4), y1 = +h[k].key.slice(0, 4);
        if (y1 - y0 <= 60 && (h[k].kind === 'event' || h[k - 1].kind === 'event') && !reviewed.has(`${order[i]}@${h[k - 1].key}`)) flips.push(`${order[i]}: ${pname(h[k - 2].p)} → ${pname(h[k - 1].p)} (${h[k - 1].key.slice(0, 4)}, ${h[k - 1].kind}) → ${pname(h[k].p)} (${h[k].key.slice(0, 4)}, ${h[k].kind})`);
      }
    }
  }
  if (flips.length) warn(`borders: ${flips.length} flip-flop(s) between curated events and draft keyframes, check them:\n    ` + flips.slice(0, process.env.ALL_FLIPS ? Infinity : 12).join('\n    ') + (flips.length > 12 ? `\n    … and ${flips.length - 12} more` : ''));
  return { order, aidx, expand, timeline, meta };
}

// ---------------------------------------------------------------- labels
async function buildLabels(pol, borders, topo) {
  const L = await readYAML(join(CONTENT, 'labels.yaml'));
  const rivers = topo.objects.rivers.geometries;
  const labels = L.labels.map(l => {
    let ll = l.lonlat.map(r4);
    if (l.river) {
      // Put a river's name on the river: its nearest vertex to the given point.
      const lines = rivers.filter(g => g.properties.name === l.river)
        .flatMap(g => { const f = feature(topo, g).geometry; return f.type === 'LineString' ? [f.coordinates] : f.coordinates; });
      const hint = project(l.lonlat);
      let best = Infinity;
      for (const line of lines) for (const point of line) {
        const [x, y] = project(point);
        const d = Math.hypot(x - hint[0], y - hint[1]);
        if (d < best) { best = d; ll = point.map(r4); }
      }
      if (best > 100) err('Missing river near label ' + l.text);
    }
    return { t: l.text, ll, cls: l.class || 'lbl-reg', minZoom: l.min_zoom || 0, from: dateKey(l.from), until: dateKey(l.until), anchor: l.anchor || 'middle' };
  });
  const rows = await readYAML(join(CONTENT, 'capitals.yaml'));
  const {audit, ...seats} = compileCapitals(rows, pol, borders, dateKey, err);
  await emit('data/capital-coverage.json', JSON.stringify(audit, null, 2));
  return {labels, ...seats};
}

// ---------------------------------------------------------------- countries
/**
 * For each country code in the catalogue: its world region and a view
 * [lon, lat, w, h] of its main territory, for the country filter. Far-off
 * islands and territories stay out of the view: starting from the largest
 * atom, atoms are gathered while they lie near what has been gathered.
 */
async function buildCountries(topo, codes) {
  const table = await readJSON(join(CONTENT, 'borders/countries.json'));
  const atomList = await readJSON(join(CONTENT, 'borders/atoms.json'));
  const isoOf = new Map(atomList.map((a) => [a.id, table[a.country]?.[0] || null]));
  // A code's region is that of its territory with the most atoms (France's
  // is Europe's, not Clipperton's).
  const atomCount = {};
  for (const a of atomList) atomCount[a.country] = (atomCount[a.country] || 0) + 1;
  const region = {}, best = {};
  for (const [a3, [iso, r]] of Object.entries(table)) {
    if (!iso || !r || (best[iso] ?? -1) >= (atomCount[a3] || 0)) continue;
    region[iso] = r; best[iso] = atomCount[a3] || 0;
  }
  const byIso = new Map();
  for (const g of topo.objects.atoms.geometries) {
    const iso = isoOf.get(g.properties.id);
    if (iso && codes.has(iso)) (byIso.get(iso) || byIso.set(iso, []).get(iso)).push(g);
  }
  const out = {};
  for (const iso of [...codes].sort()) {
    if (!region[iso]) { warn(`country ${iso}: not in content/borders/countries.json, so not in a region`); continue; }
    const geoms = byIso.get(iso) || [];
    if (!geoms.length) { out[iso] = [region[iso]]; continue; }
    const atoms = geoms.map((g) => {
      const f = feature(topo, g);
      const pts = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flat(2);
      let area = geoArea(f);
      if (area > 2 * Math.PI) area = 4 * Math.PI - area; // ring order
      return { pts, area };
    });
    atoms.sort((a, b) => b.area - a.area);
    const bboxIn = (pr, list) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const ll of list) { const [x, y] = pr.project(ll); if (!Number.isFinite(x) || !Number.isFinite(y)) continue; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return [x0, y0, x1, y1];
    };
    const pr0 = localProjection(sphericalCenter(atoms[0].pts));
    for (const a of atoms) a.box = bboxIn(pr0, a.pts);
    // Group the atoms into clusters of nearby land, largest atoms first, and
    // keep the cluster with the most land (metropolitan France, not Guiana).
    const taken = new Set();
    let main = null;
    for (const seed of atoms) {
      if (taken.has(seed) || !Number.isFinite(seed.box[0])) continue;
      let box = seed.box.slice(), area = seed.area;
      const members = [seed];
      taken.add(seed);
      for (let grew = true; grew;) {
        grew = false;
        const reach = Math.max(400, 0.35 * Math.hypot(box[2] - box[0], box[3] - box[1]));
        for (const a of atoms) {
          if (taken.has(a) || !Number.isFinite(a.box[0])) continue;
          const gap = Math.hypot(Math.max(0, a.box[0] - box[2], box[0] - a.box[2]), Math.max(0, a.box[1] - box[3], box[1] - a.box[3]));
          if (gap > reach) continue;
          taken.add(a); members.push(a); area += a.area; grew = true;
          box = [Math.min(box[0], a.box[0]), Math.min(box[1], a.box[1]), Math.max(box[2], a.box[2]), Math.max(box[3], a.box[3])];
        }
      }
      if (!main || area > main.area) main = { box, area, members };
    }
    const { box, members: chosen } = main;
    // Measure again around the middle of what was gathered.
    const pr = localProjection(pr0.unproject([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]));
    const [x0, y0, x1, y1] = bboxIn(pr, chosen.flatMap((a) => a.pts));
    const w = Math.max(x1 - x0, 300) * 1.15, h = Math.max(y1 - y0, 300) * 1.15;
    out[iso] = [region[iso], ...pr.boxView([(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h])];
  }
  return out;
}

// ---------------------------------------------------------------- wars
const r1 = (v) => Math.round(v * 10) / 10;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
/** Points along a cubic Bézier in km, about one per 10 km (p0 itself excluded). */
function sampleCubic(p0, c1, c2, p1, out) {
  const len = Math.hypot(c1[0] - p0[0], c1[1] - p0[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(p1[0] - c2[0], p1[1] - c2[1]);
  const n = Math.max(4, Math.min(64, Math.ceil(len / 10)));
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]]);
  }
}
/** Straight segments in km, split about every `step` km. */
function densify(pts, step = 20) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
/** A Catmull–Rom spline through points in km, as a dense polyline. */
function catmullRom(pts) {
  if (pts.length === 2) return densify(pts, 10);
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    sampleCubic(p1, c1, c2, p2, out);
  }
  return out;
}
function pathPoint(pts, t) {
  let L = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
  let goal = L * t;
  for (let i = 1; i < pts.length; i++) {
    if (goal <= seg[i - 1]) { const k = seg[i - 1] ? goal / seg[i - 1] : 0; return { p: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k], dir: [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]] }; }
    goal -= seg[i - 1];
  }
  return { p: pts[pts.length - 1], dir: [1, 0] };
}

function validLonLat(ll, where) {
  if (!Array.isArray(ll) || ll.length !== 2 || !ll.every(Number.isFinite) || Math.abs(ll[0]) > 180 || Math.abs(ll[1]) > 90) { err(`${where}: bad lonlat ${JSON.stringify(ll)}`); return false; }
  return true;
}

// Links in content end up in href attributes on the live site. Text is escaped,
// but a `javascript:` or `data:` URL would still run when clicked, so only web
// links (and, for step links, links inside the site) are allowed.
function validLink(u, where, internal = false) {
  const ok = typeof u === 'string' && (/^https?:\/\/[^\s"<>]+$/.test(u) || (internal && /^#\/[^\s"<>]*$/.test(u)));
  if (!ok) err(`${where}: link must be a web link (https://…)${internal ? ' or a link inside the site (#/…)' : ''}, got ${JSON.stringify(u)}`);
}

function buildWar(w, file, ctx) {
  const where = `war ${file}`;
  for (const k of ['id', 'name', 'start', 'tier']) if (w[k] === undefined) err(`${where}: missing ${k}`);
  if (w.id && file !== `${w.id}.yaml` && !file.endsWith(`-${w.id}.yaml`)) warn(`${where}: file name does not match id ${w.id}`);
  if (!dateKey(w.start)) err(`${where}: bad start ${w.start}`);
  if (w.end !== undefined && w.end !== 'ongoing' && !dateKey(w.end)) err(`${where}: bad end ${w.end}`);
  if (!['A', 'B', 'C'].includes(w.tier)) err(`${where}: tier must be A, B or C`);
  if (w.tier !== 'C' && !w.steps?.length) err(`${where}: tier ${w.tier} needs steps (or make it tier C)`);
  if (w.tier === 'C' && !w.summary) err(`${where}: a tier C entry needs a summary`);
  if (!w.sources?.length) err(`${where}: no sources`);
  (w.sources || []).forEach((s, i) => {
    if (!s?.title) err(`${where}: source ${i + 1} has no title`);
    if (s?.url !== undefined) validLink(s.url, `${where}: source ${i + 1}`);
  });
  const sides = (w.sides || []).map((s, i) => {
    for (const p of s.polities || []) if (!ctx.pol.index.has(p)) err(`${where}: side ${s.id}: unknown polity ${p}`);
    const first = ctx.pol.list[ctx.pol.index.get((s.polities || [])[0])];
    const ink = s.ink || first?.ink || ['blue', 'red', 'purple', 'orange'][i % 4];
    if (!INKS.includes(ink)) err(`${where}: side ${s.id}: unknown ink ${ink}`);
    return { id: s.id, name: s.name, ink, polities: (s.polities || []).map((p) => ctx.renumber.get(ctx.pol.index.get(p))).filter((v) => v !== undefined), moves: s.moves || null, success: s.success || null };
  });
  const sideIds = new Set(sides.map((s) => s.id).concat('none'));
  const countries = new Set(w.countries || []);
  for (const s of w.sides || []) for (const p of s.polities || []) for (const c of ctx.pol.list[ctx.pol.index.get(p)]?.countries || []) if (!w.countries) countries.add(c);

  for (const [k, v] of [['name', w.name], ['summary', w.summary], ...(w.notes || []).map((n, i) => [`note ${i + 1}`, n])]) if (isObj(v)) err(`${where}: ${k} ${NOT_TEXT}`);
  const steps = (w.steps || []).map((s, si) => {
    const sw = `${where} step ${si + 1}`;
    // Curves and the view are worked out in kilometres around the step's own
    // centre (its view centre, or the middle of everything it shows), where
    // the projection is true, then turned back into [lon, lat].
    const isLL = (ll) => Array.isArray(ll) && ll.length === 2 && ll.every(Number.isFinite);
    const stepPoints = [
      ...(s.markers || []).map((m) => m.lonlat),
      ...(s.arrows || []).flatMap((a) => [...(a.via || []), ...(a.bezier || []), a.label_at]),
      ...(s.areas || []).flatMap((ar) => [...(ar.polygon || []), ...(ar.polygons || []).flat(), ...(ar.line || []), ...(ar.lines || []).flat(),
        ...(ar.atoms || []).map((id) => ctx.borders.meta.get(String(id).replace(/!$/, ''))?.ll)]),
      ...(Array.isArray(s.view) ? s.view : []),
    ].filter(isLL);
    const { project, unproject, boxView } = localProjection(isLL(s.view?.center) ? s.view.center : sphericalCenter(stepPoints) || CENTER);
    /** km -> [lon, lat], to about 10 m. */
    const toLL = (xy) => unproject(xy).map(r4);
    if (!s.title) err(`${sw}: missing title`);
    if (!s.body?.length && w.tier !== 'C') err(`${sw}: missing body`);
    (s.body || []).forEach((b, k) => { if (typeof b !== 'string') err(`${sw}: body paragraph ${k + 1} ${NOT_TEXT}`); });
    for (const v of [s.title, s.date, ...(s.facts || []).flat(), ...(s.markers || []).flatMap((m) => [m.name, m.text, m.date])]) if (isObj(v)) err(`${sw}: "${Object.keys(v)[0]}…" ${NOT_TEXT}`);
    if (s.link) validLink(s.link.href, `${sw} link`, true);
    const bkey = dateKey(s.borders ?? s.date);
    if (!bkey) err(`${sw}: bad date/borders ${s.borders ?? s.date}`);
    const pts = [];
    const markers = (s.markers || []).map((m, mi) => {
      const mw = `${sw} marker ${m.name || mi + 1}`;
      if (!KINDS.includes(m.kind)) err(`${mw}: unknown kind ${m.kind}`);
      if (!sideIds.has(m.side || 'none')) err(`${mw}: unknown side ${m.side}`);
      validLonLat(m.lonlat, mw);
      pts.push(project(m.lonlat || [0, 0]));
      return { kind: m.kind, side: m.side || 'none', name: m.name, date: m.date || '', text: m.text || '', ll: (m.lonlat || [0, 0]).map(r4), lp: m.lp || 'r' };
    });
    const arrowPhases = new Set();
    const hasArrowPhases = s.arrows?.some((a) => a.phase !== undefined);
    const arrows = (s.arrows || []).map((a, ai) => {
      const aw = `${sw} arrow ${ai + 1}`;
      if (!sideIds.has(a.side || 'none')) err(`${aw}: unknown side ${a.side}`);
      if (hasArrowPhases) {
        if (!Number.isSafeInteger(a.phase) || a.phase < 1) err(`${aw}: phase must be a positive integer on every arrow in a phased step`);
        else arrowPhases.add(a.phase);
      }
      // The curve is drawn in km, as before the globe, and kept as a polyline:
      // the head points along its last segment, which is the curve's tangent.
      let line, poly;
      if (a.bezier) {
        const P = a.bezier.map((ll) => (validLonLat(ll, aw), project(ll)));
        if ((P.length - 1) % 3) err(`${aw}: bezier needs 1 + 3n points`);
        line = [P[0]];
        for (let k = 0; k < ((P.length - 1) / 3 | 0); k++) sampleCubic(P[3 * k], P[1 + 3 * k], P[2 + 3 * k], P[3 + 3 * k], line);
        poly = P.filter((_, k) => k % 3 === 0);
      } else {
        const P = (a.via || []).map((ll) => (validLonLat(ll, aw), project(ll)));
        if (P.length < 2) { err(`${aw}: needs at least two points in via`); return null; }
        line = catmullRom(P);
        poly = P;
      }
      pts.push(...poly);
      let lxy = null;
      if (a.label) {
        if (a.label_at) { validLonLat(a.label_at, aw); lxy = project(a.label_at); }
        else { const { p, dir } = pathPoint(poly, 0.5); const n = Math.hypot(dir[0], dir[1]) || 1; lxy = [p[0], p[1]]; lxy.auto = [-dir[1] / n, dir[0] / n]; }
      }
      return { side: a.side || 'none', phase: a.phase, line: line.map(toLL), label: a.label || null, lxy, auto: lxy?.auto || null };
    }).filter(Boolean);
    if ([...arrowPhases].some((phase) => phase > arrowPhases.size)) err(`${sw}: arrow phases must be consecutive starting at 1`);
    const areas = (s.areas || []).map((ar, ai) => {
      const aw = `${sw} area ${ai + 1}`;
      if (!AREA_STYLES.includes(ar.style)) err(`${aw}: unknown style ${ar.style}`);
      if (ar.side && !sideIds.has(ar.side)) err(`${aw}: unknown side ${ar.side}`);
      const atoms = [...new Set((ar.atoms || []).flatMap((id) => ctx.borders.expand(id, aw)))];
      for (const i of atoms) { const m = ctx.borders.meta.get(ctx.borders.order[i]); if (m) pts.push(project(m.ll)); }
      // Free-form shapes, for lines and zones that do not follow atoms (fronts,
      // occupation zones): polygon (one ring), polygons (several), line(s) (open).
      const ring = (r, what) => {
        if (!Array.isArray(r) || r.length < 2) { err(`${aw}: ${what} needs at least two [lon, lat] points`); return []; }
        return r.map((ll) => { validLonLat(ll, aw); const xy = project(ll); pts.push(xy); return xy; });
      };
      // Edges are straight in km, as they were drawn, so long ones are split
      // into short pieces before going back to [lon, lat].
      const rings = [...(ar.polygon ? [ar.polygon] : []), ...(ar.polygons || [])].map((r) => ring(r, 'polygon')).filter((r) => r.length >= 3)
        .map((r) => densify([...r, r[0]]).map(toLL));
      const lines = [...(ar.line ? [ar.line] : []), ...(ar.lines || [])].map((r) => ring(r, 'line')).filter((r) => r.length >= 2)
        .map((r) => densify(r).map(toLL));
      if (!atoms.length && !rings.length && !lines.length) err(`${aw}: needs atoms, polygon(s) or line(s)`);
      if (ar.style === 'front' && !lines.length) err(`${aw}: a front needs line or lines`);
      return { style: ar.style, side: ar.side || null, label: ar.label || null, atoms, ...(rings.length ? { rings } : {}), ...(lines.length ? { lines } : {}) };
    });
    // View box
    let view;
    if (s.view?.center) { const c = project(s.view.center); const [vw, vh] = s.view.size; view = [c[0] - vw / 2, c[1] - vh / 2, vw, vh]; }
    else if (Array.isArray(s.view) && s.view.length === 2) { const a = project(s.view[0]), b = project(s.view[1]); view = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]; }
    else if (pts.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const w0 = Math.max(x1 - x0, 260), h0 = Math.max(y1 - y0, 260), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      view = [cx - w0 * 0.62, cy - h0 * 0.62, w0 * 1.24, h0 * 1.24];
      // Make room for marker names, which reach out from their markers:
      // measured at the scale the box gets on a typical map (645 × 540 px).
      for (let pass = 0; pass < 2; pass++) {
        const kmPx = Math.max(view[2] / 645, view[3] / 540);
        let [bx0, by0] = view, bx1 = view[0] + view[2], by1 = view[1] + view[3];
        for (const m of markers) {
          const [mx, my] = project(m.ll), w = (m.name || '').length * 6.6 + 8; // 11.5px semibold, plus margin
          const [l, r0, t, b] = m.lp === 'l' ? [-11 - w, 14, -14, 14] : m.lp === 't' ? [-w / 2, w / 2, -26, 14] : m.lp === 'b' ? [-w / 2, w / 2, -14, 28] : [-14, 11 + w, -14, 14];
          const r = r0 + ((my - view[1]) / view[3] < 0.3 ? 48 : 0); // the zoom buttons, top right
          bx0 = Math.min(bx0, mx + l * kmPx); bx1 = Math.max(bx1, mx + r * kmPx); by0 = Math.min(by0, my + t * kmPx); by1 = Math.max(by1, my + b * kmPx);
        }
        view = [bx0, by0, bx1 - bx0, by1 - by0];
      }
    } else view = null;
    if (view) view = view.map(r1);
    for (const a of arrows) if (a.auto && view) { const off = Math.max(view[2], view[3]) * 0.025; a.lxy = [r1(a.lxy[0] + a.auto[0] * off), r1(a.lxy[1] + a.auto[1] * off)]; }
    for (const a of arrows) { if (a.lxy) a.lab = toLL(a.lxy); delete a.lxy; delete a.auto; }
    if (view) view = boxView(view);
    const when = dateKey(s.when ?? (String(s.date ?? '').match(/\d{4}/) || [])[0] ?? w.start);
    if (!when) err(`${sw}: cannot work out a sort date (add when:)`);
    return {
      title: s.title, date: String(s.date ?? ''), when, borders: bkey, countries: s.countries || null,
      body: s.body || [], facts: s.facts || [], link: s.link || null, view, markers, arrows, areas,
      sideNames: s.side_names || null, moveNames: s.move_names || null,
    };
  });
  // A step tagged with a country puts the war in that country's view.
  for (const st of steps) for (const c of st.countries || []) countries.add(c);
  return {
    war: { id: w.id, name: w.name, start: String(w.start), end: w.end !== undefined ? String(w.end) : null, tier: w.tier, summary: w.summary || '', sides, notes: w.notes || [], sources: w.sources || [], steps },
    // What the site needs at once (the timeline, the lists, routing) …
    core: { id: w.id, name: w.name, sk: dateKey(w.start), ek: dateKey(w.end === 'ongoing' ? '9999' : w.end ?? w.start), tier: w.tier, countries: [...countries].sort(), n: steps.length, ...(w.end === 'ongoing' ? { end: 'ongoing' } : {}) },
    // … and what it loads per century when a list, search or country view needs it.
    detail: { summary: w.summary || '', steps: steps.map((s) => ({ t: s.title, d: s.date, c: s.countries, w: s.when })), ...(steps.length ? {} : { sources: w.sources || [] }) },
  };
}

// Bucket files are cut to stay under these sizes (raw JSON, in the largest
// language), so a visit that needs one date loads little.
const CATALOGUE_FILE_LIMIT = 64e3;
const BORDERS_FILE_LIMIT = 80e3;
const textSize = (value) => JSON.stringify(value).length;

// ---------------------------------------------------------------- main
// `--check`: validate only, write nothing (safe to run alongside a dev build).
// A full build writes to a temporary folder and replaces dist/ only when it
// succeeds, so a failed build leaves the served site as it was.
const CHECK = process.argv.includes('--check');
const FIRST_LOAD_BUDGET = 1.2e6;
const OUT = join(ROOT, '.dist-tmp');
const emit = (f, data) => (CHECK ? null : writeFile(join(OUT, f), data));

async function main() {
  const preview = process.argv.includes('--dev') && !CHECK
    ? await (await import('./dev-build.mjs')).previewCache() : null;
  if (preview?.reuseData) {
    console.log('Reusing validated map data for local preview.');
    return;
  }
  if (!CHECK) {
    await rm(OUT, { recursive: true, force: true });
    await mkdir(join(OUT, 'data/wars'), { recursive: true });
    await mkdir(join(OUT, 'data/catalogue'), { recursive: true });
    await mkdir(join(OUT, 'data/borders'), { recursive: true });
    await cp(join(ROOT, 'site'), OUT, { recursive: true });
  }

  const topoText = await readFile(join(ROOT, 'site-data/atoms.topo.json'), 'utf8');
  const topo = JSON.parse(topoText);
  const pol = await buildPolities();
  const borders = await buildBorders(pol, topo);
  const labels = await buildLabels(pol, borders, topo);
  // The site needs only the polities it can draw: owners in the border
  // timeline and the states of capitals. War sides also name armies, rebels
  // and coalitions that never hold land on the base map; the site never shows
  // those (legends list a side's polities only where they are on the map), so
  // they stay out of borders.json and the language indexes, which keeps the
  // first load from growing with every wave's war actors (ROADMAP.md).
  const onMap = new Set();
  for (const t of borders.timeline) for (let j = 1; j < t.c.length; j += 2) if (t.c[j] >= 0) onMap.add(t.c[j]);
  for (const c of labels.capitals) if (c.owner >= 0) onMap.add(c.owner);
  const shipped = pol.list.map((_, i) => i).filter((i) => onMap.has(i));
  const renumber = new Map(shipped.map((old, i) => [old, i]));
  const shipIndex = (v) => (v < 0 ? v : renumber.get(v));
  for (const c of labels.capitals) c.owner = shipIndex(c.owner);

  const locales = await loadLocales(err);
  if (!CHECK) await prepareLocaleOutput(locales, OUT);
  const wars = [];
  const catalogue = [];
  const seen = new Set();
  const files = await listFiles(join(CONTENT, 'wars'), '.yaml');
  for (let start = 0; start < files.length; start += 16) {
    const batch = files.slice(start, start + 16);
    const entries = await Promise.all(batch.map(f => readYAML(join(CONTENT, 'wars', f))));
    const outputs = entries.map((w, i) => {
      const f = batch[i];
      if (seen.has(w.id)) err(`war ${f}: duplicate id ${w.id}`);
      seen.add(w.id);
      const { war, core, detail } = buildWar(w, f, { pol, borders, renumber });
      wars.push(core);
      catalogue.push({ id: core.id, sk: core.sk || '0000', detail });
      return { war, entry: { name: core.name, detail } };
    });
    await Promise.all(outputs.map(async ({ war, entry }) => {
      await compileWarTranslations(locales, war, entry, emit, err);
      await emit(`data/wars/${war.id}.json`, JSON.stringify(war));
    }));
  }
  wars.sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : a.name.localeCompare(b.name)));

  // The border timeline is split by century: borders.json has every change's
  // date, and data/borders/<century>.json the changes themselves (atom index,
  // polity index pairs) and their notes, after a full snapshot of the owners
  // before the century's first change. The site loads the century it shows.
  const timeline = borders.timeline.map((t) => ({ d: t.d, k: t.k, s: t.s, c: t.c.map((v, j) => (j % 2 ? shipIndex(v) : v)) }));
  const bordersOut = {
    home: boxView([FRAME.x0, FRAME.y0, FRAME.x1 - FRAME.x0, FRAME.y1 - FRAME.y0]),
    // site/relief.webp: a raster over DATA_CLIP in the authoring projection.
    relief: { bounds: [DATA_CLIP.x0, DATA_CLIP.y0, DATA_CLIP.x1 - DATA_CLIP.x0, DATA_CLIP.y1 - DATA_CLIP.y0], center: CENTER },
    polities: shipped.map((i) => pol.list[i]).map((p) => {
      const hints = p.label ? (Array.isArray(p.label[0]) ? p.label : [p.label]) : [];
      const names = (p.names || []).map(([until, n]) => [dateKey(until), n]);
      for (const [k] of names) if (!k) err(`polity ${p.id}: bad date in names`);
      // The site builds its colour variables from `color` (site/colors.js).
      return { id: p.id, name: p.name, color: p.color.toLowerCase(), ink: p.ink || null, countries: p.countries || [], auto: !!p.auto, ...(hints.length ? { hints: hints.map((h) => h.map(r4)) } : {}), ...(names.length ? { names } : {}) };
    }),
    keys: timeline.map((t) => t.k),
    // Country code -> [region, lon, lat, w, h] (only the region when the
    // country has no atoms of its own), for the country filter.
    countries: await buildCountries(topo, new Set(wars.flatMap((w) => w.countries))),
  };
  // Translated map strings and border notes, needed to size the buckets.
  // Translations are checked against every polity (a key for a war actor is
  // not an error), then the indexes keep only the names of shipped ones.
  const politiesOut = (list) => list.map((p) => ({ name: p.name, names: (p.names || []).map(([until, n]) => [dateKey(until), n]) }));
  compileLocaleMaps(locales, { polities: politiesOut(pol.list), timeline }, labels, err);
  const shippedNames = new Set(bordersOut.polities.flatMap((p) => [p.name, ...(p.names || []).map(([, n]) => n)]));
  for (const { translatedMap } of locales) if (translatedMap.polities) translatedMap.polities = Object.fromEntries(Object.entries(translatedMap.polities).filter(([k]) => shippedNames.has(k)));
  // Buckets are sized by their largest language, so each language's copy of a
  // file stays under the limit.
  const largestNote = (s) => Math.max(textSize(s ?? null), ...locales.map(({ notes }) => textSize(notes.get(s) ?? s ?? null)));
  const borderStarts = bucketStarts(
    timeline.map((t) => ({ year: t.k.slice(0, 4), size: textSize({ d: t.d, c: t.c }) + largestNote(t.s) })),
    BORDERS_FILE_LIMIT, textSize(new Array(borders.order.length).fill(pol.list.length)));
  catalogue.sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : a.id.localeCompare(b.id)));
  const catalogueStarts = bucketStarts(catalogue.map(({ id, sk, detail }) => ({
    year: sk.slice(0, 4),
    size: id.length + Math.max(textSize(detail), ...locales.map(({ details }) => (details.has(id) ? textSize(details.get(id)) : 0))),
  })), CATALOGUE_FILE_LIMIT);
  bordersOut.buckets = { borders: borderStarts, catalogue: catalogueStarts };

  const borderChunks = new Map();
  {
    const owners = new Array(borders.order.length).fill(-1);
    timeline.forEach((t, i) => {
      const bucket = bucketOf(borderStarts, t.k);
      if (!borderChunks.has(bucket)) borderChunks.set(bucket, { start: i, base: owners.slice(), entries: [] });
      borderChunks.get(bucket).entries.push({ d: t.d, s: t.s, c: t.c });
      for (let j = 0; j < t.c.length; j += 2) owners[t.c[j]] = t.c[j + 1];
    });
  }
  const catalogueFiles = new Map();
  for (const { id, sk, detail } of catalogue) {
    const bucket = bucketOf(catalogueStarts, sk);
    if (!catalogueFiles.has(bucket)) catalogueFiles.set(bucket, []);
    catalogueFiles.get(bucket).push([id, detail]);
  }
  for (const entries of catalogueFiles.values()) entries.sort(([a], [b]) => a.localeCompare(b));
  await emitLocales(locales, borderChunks, catalogueFiles, emit);
  await emit('data/atoms.topo.json', topoText);
  await emit('data/borders.json', JSON.stringify(bordersOut));
  for (const [bucket, chunk] of borderChunks) await emit(`data/borders/${bucket}.json`, JSON.stringify(chunk));
  await emit('data/wars.json', JSON.stringify(wars));
  for (const [bucket, entries] of catalogueFiles) await emit(`data/catalogue/${bucket}.json`, JSON.stringify(Object.fromEntries(entries)));
  await emit('data/labels.json', JSON.stringify(labels));

  // Size report: what a first visit downloads.
  const first = ['index.html', 'app.js', 'globe.js', 'colors.js', 'i18n.js', 'localized-content.js', 'buckets.js', ...(await listFiles(join(ROOT, 'site/locales'), '.js')).map(file => `locales/${file}`), 'style.css', 'relief.webp', 'vendor/topojson-client.min.js', 'data/atoms.topo.json', 'data/borders.json', 'data/wars.json', 'data/labels.json'];
  // A French or Swedish visitor also loads that language's index.
  const size = async (files) => {
    let raw = 0, gz = 0;
    for (const f of files) { try { const b = await readFile(join(OUT, f)); raw += b.length; gz += gzipSync(b).length; } catch {} }
    return { raw, gz };
  };
  console.log(`polities ${pol.list.length} (${shipped.length} on the map), atoms ${borders.order.length}, timeline entries ${borders.timeline.length}, wars ${wars.length}`);
  if (!CHECK) {
    // Showing a year also takes one bucket of borders and one of the
    // catalogue: count the largest of each. Other languages load translated
    // copies of them instead of the English ones.
    const largest = async (dir) => {
      let best = null, bytes = -1;
      for (const f of await listFiles(join(OUT, dir), '.json')) { const n = (await stat(join(OUT, dir, f))).size; if (n > bytes) { bytes = n; best = `${dir}/${f}`; } }
      return best ? [best] : [];
    };
    const largestBuckets = async (prefix) => [...await largest(`${prefix}borders`), ...await largest(`${prefix}catalogue`)];
    const base = await size([...first, ...await largestBuckets('data/')]);
    const perLocale = await Promise.all(locales.map(async ({ code }) => [code, await size([...first, `data/locales/${code}/index.json`, ...await largestBuckets(`data/locales/${code}/`)])]));
    const mb = (b) => (b / 1e6).toFixed(2);
    console.log(`first load: ${mb(base.raw)} MB raw, ${mb(base.gz)} MB gzip` + perLocale.map(([code, s]) => `; ${code} ${mb(s.gz)}`).join(''));
    // The budget that keeps the site fast and inside GitHub Pages' free bandwidth (ROADMAP.md).
    for (const [code, s] of [['en', base], ...perLocale]) if (s.gz > FIRST_LOAD_BUDGET) err(`first load (${code}) is over budget: ${mb(s.gz)} MB gzip > ${mb(FIRST_LOAD_BUDGET)} MB`);
  }
  for (const w of warnings) console.warn('warning:', w);
  for (const e of errors) console.error('ERROR:', e);
  if (errors.length) {
    if (!CHECK) await rm(OUT, { recursive: true, force: true });
    console.error(`${errors.length} error(s)${CHECK ? '' : '; dist/ left unchanged'}`);
    process.exit(1);
  }
  if (!CHECK) {
    await rm(DIST, { recursive: true, force: true });
    await rename(OUT, DIST);
    if (preview) await preview.save();
  }
}

main().catch(async (e) => {
  console.error(e);
  if (!CHECK) await rm(OUT, { recursive: true, force: true }).catch(() => {});
  process.exit(1);
});

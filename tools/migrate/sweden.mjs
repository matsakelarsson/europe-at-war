// One-off migration of ~/projects/sweden-at-war into Europe at War content.
//
//   node tools/migrate/sweden.mjs splits    -> content/borders/splits/sweden-at-war.geojson
//   (then: npm run geo)
//   node tools/migrate/sweden.mjs content   -> border events, curated ranges, labels, war files
//
// Needs .cache/sweden/D.json (the data object from sweden-at-war/index.html, line 368)
// and .cache/sweden/fit.json (from tools/migrate/sweden-fit.mjs).
//
// The migration has been run: the files it wrote are now ordinary content and
// may have been edited by hand. Both phases refuse to overwrite them unless
// --force is given.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import * as d3 from 'd3-geo';
import * as topojson from 'topojson-client';
import polygonClipping from 'polygon-clipping';
import YAML from 'yaml';
import { project, projectRaw, unproject } from '../projection.mjs';

const phase = process.argv[2];
const OUT = phase === 'splits' ? ['content/borders/splits/sweden-at-war.geojson'] : ['content/borders/events/sweden-at-war.yaml', 'content/borders/curated.yaml', 'content/labels.yaml'];
if (!process.argv.includes('--force') && OUT.some((f) => existsSync(f))) {
  console.error(`Refusing to overwrite migrated content (${OUT.filter((f) => existsSync(f)).join(', ')}), which may have hand edits. Pass --force to regenerate it.`);
  process.exit(1);
}
const D = JSON.parse(readFileSync('.cache/sweden/D.json', 'utf8'));
const FIT = JSON.parse(readFileSync('.cache/sweden/fit.json', 'utf8'));
const SRC_HTML = readFileSync(process.env.HOME + '/projects/sweden-at-war/index.html', 'utf8');

// ---------- old SVG coordinates -> lon/lat ----------
const FAM = {
  conicConformal: (l0, p1, p2) => d3.geoConicConformal().parallels([p1, p2]).rotate([-l0, 0]).scale(1000).translate([0, 0]),
};
const oldProj = FAM[FIT.family](...FIT.args);
const { a, b, mu, mx } = FIT;
const det = a * a + b * b;
function oldToLL([x, y]) {
  const X = x - mx[0], Y = y - mx[1];
  const u = (a * X + b * Y) / det + mu[0], v = (-b * X + a * Y) / det + mu[1];
  return oldProj.invert([u, v]);
}
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const LL = (xy) => oldToLL(xy).map(r4);
// km per old unit, measured at the middle of the old map
const kmPerOld = (() => { const p = projectRaw(oldToLL([500, 455])), q = projectRaw(oldToLL([510, 455])); return Math.hypot(q[0] - p[0], q[1] - p[1]) / 10; })();

function parseRings(d) {
  const rings = []; let cur = null;
  for (const [, c, args] of d.matchAll(/([MLZ])([^MLZ]*)/g)) {
    if (c === 'M') { if (cur) rings.push(cur); cur = [args.split(',').map(Number)]; }
    else if (c === 'L') cur.push(args.split(',').map(Number));
    else { if (cur) rings.push(cur); cur = null; }
  }
  if (cur) rings.push(cur);
  return rings;
}
function ringArea(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; }
/** Old path -> polygon-clipping MultiPolygon in projected km (even-odd ring nesting resolved by XOR). */
function oldPathToKm(d) {
  const rings = parseRings(d).map((r) => { const ring = r.map((p) => projectRaw(oldToLL(p))); if (ring.length && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) ring.push(ring[0]); return ring; }).filter((r) => r.length >= 4);
  let acc = [];
  for (const r of rings) acc = acc.length ? polygonClipping.xor(acc, [[r]]) : [[r]];
  return acc;
}
function oldPathToLonLat(d) {
  const km = oldPathToKm(d);
  return km.map((poly) => poly.map((ring) => ring.map((p) => unproject(p).map((v) => Math.round(v * 1e5) / 1e5))));
}
const mpArea = (mp) => mp.reduce((s, poly) => s + poly.reduce((t, r, k) => t + (k ? -1 : 1) * Math.abs(ringArea(r)), 0), 0);
function bboxMP(mp) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of mp) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; }
const overlaps = (p, q) => p[0] <= q[2] && p[2] >= q[0] && p[1] <= q[3] && p[3] >= q[1];

function loadAtoms() {
  const topo = JSON.parse(readFileSync('site-data/atoms.topo.json', 'utf8'));
  const meta = new Map(JSON.parse(readFileSync('content/borders/atoms.json', 'utf8')).map((m) => [m.id, m]));
  return topojson.feature(topo, topo.objects.atoms).features.map((f) => {
    const mp = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    return { id: f.properties.id, mp, bbox: bboxMP(mp), area: mpArea(mp), meta: meta.get(f.properties.id) };
  });
}
/** fraction of each atom inside each shape: Map(atomId -> Map(shapeId -> {frac, area})) */
function overlapTable(shapes, atoms) {
  const table = new Map();
  for (const [sid, mp] of Object.entries(shapes)) {
    const bb = bboxMP(mp);
    for (const at of atoms) {
      if (!overlaps(bb, at.bbox)) continue;
      let inter;
      try { inter = polygonClipping.intersection(at.mp, mp); } catch { continue; }
      const ar = mpArea(inter);
      if (ar <= 0) continue;
      let per = 0; for (const poly of inter) for (const r of poly) for (let i = 1; i < r.length; i++) per += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
      (table.get(at.id) || table.set(at.id, new Map()).get(at.id)).set(sid, { frac: ar / at.area, area: ar, width: (2 * ar) / (per || 1) });
    }
  }
  return table;
}

// Regions whose old owners are imported as curated borders, 1240–1814.
const SKIP_REGIONS = new Set(['other', 'rus', 'ott', 'ottUA', 'fra']);
const REGION_NAMES = { scania: 'Scania', halland: 'Halland', blekinge: 'Blekinge', gotland: 'Gotland', jh: 'Jämtland-Härjedalen', bohus: 'Bohuslän', idre: 'Idre and Särna', se: 'Sweden', ald: 'Åland', fiW: 'Finland Proper', fiT: 'Tavastia', fiOld: 'Old Finland', fiK: 'Karelia', fiO: 'Ostrobothnia', fiN: 'Northern Finland', osel: 'Ösel', eeW: 'West Estonia', eeN: 'North Estonia', eeS: 'South Estonia', liv: 'Livonia', cour: 'Courland', latg: 'Latgale', vib: 'Vyborg', kex: 'Kexholm', ingria: 'Ingria', trond: 'Trøndelag', no: 'Norway', bornholm: 'Bornholm', dk: 'Denmark', sh: 'Schleswig-Holstein', bv: 'Bremen-Verden', pomE: 'Farther Pomerania', bav: 'Bavaria', sax: 'Saxony', bra: 'Brandenburg', dpr: 'Ducal Prussia', warm: 'Warmia', bru: 'Brunswick-Lüneburg', mec: 'Mecklenburg', hes: 'Hesse', rhe: 'Rhineland', wb: 'Württemberg', oger: 'Germany', nl: 'Netherlands', spn: 'Southern Netherlands', als: 'Alsace', lor: 'Lorraine', fra: 'France', sui: 'Switzerland', sil: 'Silesia', hab: 'Austria', habHun: 'Royal Hungary', ottH: 'Ottoman Hungary', trans: 'Transylvania', ott: 'Ottoman', ottUA: 'Ukraine', cos: 'Left-bank Ukraine', cosR: 'Right-bank Ukraine', lit: 'Lithuania', pomerelia: 'Pomerelia', polGP: 'Greater Poland', polMaz: 'Masovia', polLes: 'Lesser Poland', polLub: 'Lublin', polGal: 'Red Ruthenia', polVol: 'Volhynia', smo: 'Smolensk', pomN: 'Western Pomerania', pomO: 'Usedom and Wollin', pomS: 'Hither Pomerania' };

// =====================================================================
if (phase === 'splits') {
  // Round 1 splits atoms along the old regions, round 2 splits the result
  // along the old overlays (occupied areas etc.). Splits are applied in memory
  // between rounds, and written in order: build-geo applies them sequentially,
  // so a later split may cut a child created by an earlier one.
  let atoms = loadAtoms();
  const features = [];
  const substantial = (v) => v.area >= 200 && v.width >= 5;
  const round = (shapes, label) => {
    const table = overlapTable(shapes, atoms);
    const next = [];
    for (const at of atoms) {
      const t = table.get(at.id);
      if (!t) { next.push(at); continue; }
      const parts = [...t.entries()].sort((p, q) => q[1].area - p[1].area);
      const covered = parts.reduce((s, p) => s + p[1].frac, 0);
      const outside = { area: at.area * (1 - covered), width: Infinity };
      // Cut off each substantial share; when shares overlap (overlays) or the
      // atom is fully covered, the largest share stays with the parent.
      let cuts = parts.filter(([, v]) => substantial(v) && v.frac < 0.97);
      if (label === 'region' && covered >= 0.97) cuts = cuts.slice(1);
      if (label === 'region' && covered < 0.97 && !(outside.area >= 200)) cuts = cuts.slice(1);
      let rest = at.mp;
      for (const [sid] of cuts) {
        const inside = polygonClipping.intersection(rest, shapes[sid]);
        const remain = polygonClipping.difference(rest, shapes[sid]);
        if (!inside.length || !remain.length) continue;
        const ia = mpArea(inside), ra = mpArea(remain);
        if (ia < 200 || ra < 200) continue;
        const id = `${at.id}~${sid}`;
        const geomLL = (label === 'region' ? D.regions : D.overlays)[sid];
        features.push({ type: 'Feature', properties: { id, from: at.id, name: `${at.meta?.name || at.id} (${REGION_NAMES[sid] || sid})` }, geometry: { type: 'MultiPolygon', coordinates: oldPathToLonLat(geomLL) } });
        next.push({ id, mp: inside, bbox: bboxMP(inside), area: ia, meta: { name: `${at.meta?.name || at.id} (${REGION_NAMES[sid] || sid})` } });
        rest = remain;
      }
      next.push({ ...at, mp: rest, bbox: bboxMP(rest), area: mpArea(rest) });
    }
    atoms = next;
  };
  const regionShapes = {}, overlayShapes = {};
  for (const [k, d] of Object.entries(D.regions)) if (!SKIP_REGIONS.has(k)) regionShapes[k] = oldPathToKm(d);
  for (const [k, d] of Object.entries(D.overlays)) overlayShapes[k] = oldPathToKm(d);
  round(regionShapes, 'region');
  const n1 = features.length;
  round(overlayShapes, 'overlay');
  mkdirSync('content/borders/splits', { recursive: true });
  writeFileSync('content/borders/splits/sweden-at-war.geojson', JSON.stringify({ type: 'FeatureCollection', features }));
  console.log(`${features.length} splits written (${n1} from regions, ${features.length - n1} from overlays)`);
  for (const f of features) console.log('  ', f.properties.id, '·', f.properties.name);
  process.exit(0);
}

// =====================================================================
if (phase !== 'content') { console.error('usage: sweden.mjs splits|content'); process.exit(1); }

const atoms = loadAtoms();
const regionShapes = {}, overlayShapes = {};
for (const [k, d] of Object.entries(D.regions)) regionShapes[k] = oldPathToKm(d);
for (const [k, d] of Object.entries(D.overlays)) overlayShapes[k] = oldPathToKm(d);
const regTable = overlapTable(regionShapes, atoms);
const ovTable = overlapTable(overlayShapes, atoms);

// Atom -> old region (largest share, at least half the atom)
const regionAtoms = {};
for (const at of atoms) {
  const t = regTable.get(at.id); if (!t) continue;
  const [best] = [...t.entries()].sort((p, q) => q[1].frac - p[1].frac);
  if (best[1].frac >= 0.5) (regionAtoms[best[0]] ||= []).push(at.id);
}
const overlayAtoms = {};
for (const at of atoms) {
  const t = ovTable.get(at.id); if (!t) continue;
  for (const [oid, v] of t) if (v.frac >= 0.5) (overlayAtoms[oid] ||= []).push(at.id);
}
// Report how well overlays are matched by atoms
for (const [oid, mp] of Object.entries(overlayShapes)) {
  const A = mpArea(mp); const ids = overlayAtoms[oid] || [];
  const got = ids.reduce((s, id) => s + atoms.find((x) => x.id === id).area, 0);
  const inter = ids.reduce((s, id) => s + (ovTable.get(id)?.get(oid)?.area || 0), 0);
  const iou = inter / (A + got - inter);
  if (iou < 0.85) console.warn(`overlay ${oid}: IoU ${iou.toFixed(2)} with ${ids.length} atoms`);
}
const regionList = (ids) => [...new Set(ids.flatMap((r) => regionAtoms[r] || []))].sort();
const overlayList = (ids) => [...new Set(ids.flatMap((r) => overlayAtoms[r] || []))].sort();

// ---------- polities used by the old map ----------
const eraYear = (k) => parseInt(k, 10);
const ERA_DATE = { '1814': '1814-01-14', '1814b': '1814-11-04' };
const eraDate = (k) => ERA_DATE[k] || k;
function polity(code, era) {
  const y = eraYear(era);
  switch (code) {
    case 'se': return 'sweden';
    case 'dk': return y < 1397 ? 'denmark' : 'denmark-norway';
    case 'dkl': return 'danish-duchies';
    case 'nor': return 'norway';
    case 'union': return 'norway-union';
    case 'hre': return 'hre';
    case 'teu': return 'teutonic-order';
    case 'rus': return y < 1478 ? 'novgorod' : 'russia';
    case 'pol': return y >= 1807 ? 'duchy-of-warsaw' : 'poland';
    case 'lit': return 'lithuania';
    case 'cos': return 'cossack-hetmanate';
    case 'hab': return 'habsburg';
    case 'hun': return 'hungary';
    case 'ott': return 'ottoman';
    case 'bav': return 'bavaria';
    case 'sax': return 'saxony';
    case 'bra': return 'prussia';
    case 'bru': return 'hanover';
    case 'mec': return 'mecklenburg';
    case 'hes': return 'hesse';
    case 'rhe': return 'rhine-westphalia';
    case 'wb': return 'wurttemberg-baden';
    case 'oger': return 'german-states';
    case 'nl': return 'dutch-republic';
    case 'spn': return y < 1714 ? 'habsburg-netherlands' : 'austrian-netherlands';
    case 'fra': return 'france';
    case 'sui': return 'switzerland';
    case 'other': return null;
    default: throw new Error('unknown owner code ' + code);
  }
}

// ---------- border events from the 34 eras ----------
const curatedRegions = Object.keys(D.regions).filter((k) => !SKIP_REGIONS.has(k));
const curatedAtoms = regionList(curatedRegions);
const events = [];
let prev = {};
for (const era of D.eraOrder) {
  const owners = {};
  for (const r of curatedRegions) {
    const p = polity(D.eras[era][r], era);
    for (const id of regionAtoms[r] || []) {
      const v = p || '-';
      if (prev[id] !== v) (owners[v] ||= []).push(id);
      prev[id] = v;
    }
  }
  const sorted = {}; for (const k of Object.keys(owners).sort()) sorted[k] = owners[k].sort();
  if (Object.keys(sorted).length) events.push({ date: eraDate(era), note: `Sweden at War border state “${era}”`, owners: sorted });
}
mkdirSync('content/borders/events', { recursive: true });
writeFileSync('content/borders/events/sweden-at-war.yaml',
  '# Migrated from Sweden at War (hand-made borders for Scandinavia, the Baltic,\n# Poland–Lithuania and Germany, 1240–1814). Atoms whose old region was left as\n# "other" are set to "-" and fall back to the drafted keyframes.\n' +
  YAML.stringify(events, { lineWidth: 0, flowCollectionPadding: false }).replace(/\n {4}- /g, '\n    - '));
writeFileSync('content/borders/curated.yaml',
  '# Ranges where curated border events take precedence over the drafted keyframes:\n# keyframe assignments for these atoms inside [from, until) are ignored by the build.\n' +
  YAML.stringify([{ name: 'Sweden at War', from: '1240', until: '1815', atoms: curatedAtoms }], { lineWidth: 0 }));
console.log(`events: ${events.length}, curated atoms: ${curatedAtoms.length}`);

// ---------- labels ----------
const SKIP_LABEL = new Set(['SWEDEN', 'NORWAY', 'HOLY ROMAN EMPIRE', 'FRANCE', 'LITHUANIA', 'COSSACK HETMANATE', 'OTTOMAN EMPIRE', 'NOVGOROD', 'TEUTONIC ORDER', 'DUCHY OF WARSAW', 'HUNGARY', 'DUTCH REPUBLIC', 'POLAND', 'RUSSIA',
  'Hanover', 'Prussia', 'Bavaria', 'Saxony', 'Brandenburg', 'Mecklenburg', 'Brunswick-Lüneburg', 'Hesse', 'Württemberg', 'Austria', 'Hungary', 'Ducal Prussia', 'Spanish Netherlands', 'Austrian Netherlands']);
const labels = [];
for (const l of D.labels) {
  if (SKIP_LABEL.has(l.t)) continue;
  const isSea = l.cls.includes('lbl-sea');
  const text = l.t === 'FINLAND' ? 'Finland' : l.t;
  const cls = l.t === 'FINLAND' ? 'lbl-reg' : l.cls;
  const out = { text, lonlat: LL(l.xy), class: cls };
  const mz = isSea ? l.minZoom : Math.max(l.minZoom, 0.8);
  if (mz) out.min_zoom = mz;
  if (l.anchor !== 'middle') out.anchor = l.anchor;
  if (l.from) out.from = eraDate(l.from);
  if (l.until) out.until = eraDate(l.until);
  labels.push(out);
}
const capitals = D.capitals.map((c) => ({ name: c.name, lonlat: LL(c.xy), lp: c.lp, ...(c.from ? { from: eraDate(c.from) } : {}) }));
writeFileSync('content/labels.yaml', '# Geographic labels (seas, regions) and capitals. from/until are dates.\n# min_zoom: shown only when zoomed in at least this far (1 ≈ the Sweden at War map scale).\n' +
  YAML.stringify({ refWidth: Math.round(1000 * kmPerOld), labels, capitals }, { lineWidth: 0 }));

// ---------- sources from the old footer ----------
const sources = [...SRC_HTML.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a><\/li>/g)].map((m) => ({ url: m[1].replace(/&amp;/g, '&'), title: m[2].replace(/&amp;/g, '&') }));

// ---------- wars ----------
const WARS = [
  { id: 'swedish-crusades-finland', name: 'Swedish crusades into Finland', start: '1150', end: '1250', steps: [1], foe: ['novgorod'] },
  { id: 'swedish-novgorodian-wars', name: 'Swedish–Novgorodian wars', start: '1293', end: '1351', steps: [2, 3], foe: ['novgorod'] },
  { id: 'valdemar-atterdag-wars', name: 'Valdemar Atterdag’s wars with Sweden', start: '1360', end: '1361', steps: [4], dk: 'denmark' },
  { id: 'kalmar-union-wars', name: 'Wars of the Kalmar Union', start: '1364', end: '1520', steps: [5, 6, 7, 9], dk: 'denmark-norway' },
  { id: 'russo-swedish-war-1495', name: 'Russo-Swedish War, 1495–1497', start: '1495', end: '1497', steps: [8], foe: ['russia'] },
  { id: 'swedish-war-of-liberation', name: 'Swedish War of Liberation', start: '1521', end: '1523', steps: [10], dk: 'denmark-norway' },
  { id: 'counts-feud', name: 'Count’s Feud and Dacke War', start: '1534', end: '1543', steps: [11] },
  { id: 'russo-swedish-war-1554', name: 'Russo-Swedish War, 1554–1557', start: '1554', end: '1557', steps: [12], foe: ['russia'] },
  { id: 'northern-seven-years-war', name: 'Northern Seven Years’ War', start: '1563', end: '1570', steps: [13, 14], dk: 'denmark-norway' },
  { id: 'livonian-war', name: 'Livonian War', start: '1558', end: '1583', steps: [15], foe: ['russia', 'poland', 'lithuania'] },
  { id: 'russo-swedish-war-1590', name: 'Russo-Swedish War, 1590–1595', start: '1590', end: '1595', steps: [16], foe: ['russia'] },
  { id: 'war-against-sigismund', name: 'War against Sigismund', start: '1597', end: '1599', steps: [17], foe: ['poland'] },
  { id: 'polish-swedish-wars-1600', name: 'Polish–Swedish wars, 1600–1629', start: '1600', end: '1629', steps: [18, 21], foe: ['poland', 'lithuania'] },
  { id: 'ingrian-war', name: 'Ingrian War', start: '1610', end: '1617', steps: [19], foe: ['russia'] },
  { id: 'kalmar-war', name: 'Kalmar War', start: '1611', end: '1613', steps: [20], dk: 'denmark-norway' },
  { id: 'thirty-years-war', name: 'Thirty Years’ War', start: '1618', end: '1648', steps: [22, 23, 24, 25, 26, 27, 29], foe: ['hre', 'habsburg', 'bavaria'] },
  { id: 'torstenson-war', name: 'Torstenson War', start: '1643', end: '1645', steps: [28], dk: 'denmark-norway' },
  { id: 'first-bremen-war', name: 'First Bremen War', start: '1654', end: '1654', steps: [30] },
  { id: 'second-northern-war', name: 'Second Northern War', start: '1655', end: '1660', steps: [31, 32, 33, 34, 35, 36, 37, 38, 39], dk: 'denmark-norway', foe: ['poland', 'lithuania', 'russia', 'habsburg', 'prussia'], nl: true },
  { id: 'second-bremen-war', name: 'Second Bremen War', start: '1665', end: '1666', steps: [40] },
  { id: 'scanian-war', name: 'Scanian War', start: '1674', end: '1679', steps: [41, 42, 43, 44], dk: 'denmark-norway', foe: ['prussia', 'dutch-republic'] },
  { id: 'great-northern-war', name: 'Great Northern War', start: '1700', end: '1721', steps: [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57], dk: 'denmark-norway', foe: ['russia', 'saxony', 'poland', 'prussia', 'hanover'] },
  { id: 'hats-russian-war', name: 'Hats’ Russian War', start: '1741', end: '1743', steps: [58], foe: ['russia'] },
  { id: 'pomeranian-war', name: 'Pomeranian War', start: '1757', end: '1762', steps: [59], foe: ['prussia'] },
  { id: 'russo-swedish-war-1788', name: 'Gustav III’s Russian War', start: '1788', end: '1790', steps: [60, 61], dk: 'denmark-norway', foe: ['russia'] },
  { id: 'napoleonic-wars', name: 'Napoleonic Wars', start: '1803', end: '1815', steps: [62, 65, 66], dk: 'denmark-norway', foe: ['france'] },
  { id: 'finnish-war', name: 'Finnish War', start: '1808', end: '1809', steps: [63, 64], dk: 'denmark-norway', foe: ['russia'] },
  { id: 'swedish-norwegian-war', name: 'Swedish–Norwegian War', start: '1814-07-26', end: '1814-08-14', steps: [67], dk: 'norway', dkName: 'Norway' },
];
const WHEN_FIX = { 4: '1360', 15: '1571' }; // keep Sweden at War's reading order in the Sweden view
const firstYear = (s) => (String(s).match(/\d{4}/) || ['0000'])[0];
function noteFor(y) {
  if (y < 1521) return 'Medieval dates are as given in the chronicles.';
  if (y < 1700) return 'Dates in Germany and Poland are New Style (Gregorian); Scandinavian dates are mostly Old Style (Julian), as usually cited, which ran ten days behind.';
  if (y < 1741) return 'Great Northern War dates are New Style throughout. Sweden itself used a calendar of its own, one day ahead of Old Style, from 1700 to 1712.';
  return 'Dates are New Style.';
}
// Footer sources, in their original order, assigned to wars by hand.
const SOURCE_WARS = [
  ['swedish-crusades-finland', 'swedish-novgorodian-wars'], ['swedish-crusades-finland'], ['swedish-novgorodian-wars'], ['swedish-novgorodian-wars'],
  ['valdemar-atterdag-wars'], ['kalmar-union-wars'], ['kalmar-union-wars'], ['kalmar-union-wars'], ['russo-swedish-war-1495'],
  ['swedish-war-of-liberation'], ['counts-feud'], ['counts-feud'], ['russo-swedish-war-1554'], ['northern-seven-years-war'],
  ['livonian-war'], ['russo-swedish-war-1590'], ['war-against-sigismund'], ['polish-swedish-wars-1600'], ['ingrian-war'],
  ['kalmar-war'], ['polish-swedish-wars-1600'], ['thirty-years-war'], ['thirty-years-war'], ['thirty-years-war'],
  ['thirty-years-war'], ['thirty-years-war'], ['thirty-years-war'], ['thirty-years-war'], ['thirty-years-war'],
  ['thirty-years-war', 'torstenson-war'], ['first-bremen-war', 'second-bremen-war'],
  ['second-northern-war'], ['second-northern-war'], ['second-northern-war'], ['second-northern-war'], ['second-northern-war'],
  ['second-northern-war'], ['second-northern-war'], ['second-northern-war'], ['second-northern-war'], ['second-northern-war'],
  ['second-northern-war'], ['second-northern-war'],
  ['scanian-war'], ['scanian-war'], ['scanian-war'], ['scanian-war'], ['scanian-war'], ['scanian-war'], ['scanian-war'],
  ['great-northern-war'], ['great-northern-war'], ['great-northern-war'], ['great-northern-war'], ['great-northern-war'],
  ['great-northern-war'], ['great-northern-war'], ['great-northern-war'], ['great-northern-war'], ['great-northern-war'],
  ['great-northern-war'], ['great-northern-war'], ['great-northern-war'], ['great-northern-war'], ['great-northern-war'],
  ['great-northern-war', 'hats-russian-war', 'pomeranian-war', 'russo-swedish-war-1788'], ['hats-russian-war'], ['hats-russian-war'],
  ['pomeranian-war'], ['russo-swedish-war-1788'], ['russo-swedish-war-1788'], ['napoleonic-wars'],
  ['finnish-war'], ['finnish-war'], ['finnish-war'], ['napoleonic-wars'], ['napoleonic-wars'],
  ['swedish-norwegian-war'], ['swedish-norwegian-war'],
  ['swedish-war-of-liberation', 'counts-feud', 'russo-swedish-war-1554', 'northern-seven-years-war', 'livonian-war', 'russo-swedish-war-1590', 'war-against-sigismund'],
];
if (SOURCE_WARS.length !== sources.length) throw new Error(`expected ${SOURCE_WARS.length} footer sources, found ${sources.length}`);
const EXTRA_SOURCES = { 'torstenson-war': [{ title: 'Torstenson War (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Torstenson_War' }] };
function sourcesFor(war) {
  return sources.filter((_, i) => SOURCE_WARS[i].includes(war.id)).concat(EXTRA_SOURCES[war.id] || []);
}
const SIDE = {
  se: { id: 'se', name: 'Sweden', polities: ['sweden'], ink: 'blue', moves: 'Swedish and allied moves', success: 'Swedish success' },
  foe: { id: 'foe', name: 'Sweden’s other enemies', ink: 'purple', moves: 'Moves by Sweden’s other enemies', success: 'Success for Sweden’s other enemies' },
  nl: { id: 'nl', name: 'Dutch Republic', polities: ['dutch-republic'], ink: 'orange', moves: 'Dutch fleet', success: 'Dutch success' },
};
const LABELS = { occ: null, ret: 'Won back by Denmark–Norway', pledged: 'Swedish on a 30-year pledge' };
mkdirSync('content/wars', { recursive: true });
const used = new Set();
for (const w of WARS) {
  const stepObjs = [];
  const sidesUsed = new Set();
  for (const n of w.steps) {
    used.add(n);
    const s = D.steps[n - 1];
    const areas = [];
    const add = (style, ids, side, label, fromRegions) => { if (!ids.length) return; const list = fromRegions ? regionList(ids) : overlayList(ids); if (!list.length) { console.warn(`step ${n}: ${style} ${ids} matched no atoms`); return; } const ar = { style }; if (side) ar.side = side; if (label) ar.label = label; ar.atoms = list; areas.push(ar); if (side) sidesUsed.add(side); };
    add('occupied', s.occ, 'se', null);
    add('gained', s.gold, null, s.goldLabel || 'Gained by Sweden in this peace', true);
    add('pledged', s.pledged, null, LABELS.pledged);
    add('occupied', s.ret, 'dk', LABELS.ret);
    add('occupied', s.dko, 'dk', null);
    add('occupied', s.foe, 'foe', s.foeLabel || null);
    add('lost', s.lost, null, s.lostLabel || 'Lost by Sweden in this peace');
    add('outline', s.outline, null, s.outlineLabel || 'Union');
    for (const m of s.markers) sidesUsed.add(m.side);
    for (const ar of s.arrows) sidesUsed.add(ar.side);
    const c = s.box ? [s.box[0] + s.box[2] / 2, s.box[1] + s.box[3] / 2] : null;
    const step = {
      title: s.title,
      date: s.date,
      when: WHEN_FIX[n] || firstYear(s.date),
      borders: eraDate(s.era),
      countries: ['se'],
      ...(c ? { view: { center: LL(c), size: [Math.round(s.box[2] * kmPerOld), Math.round(s.box[3] * kmPerOld)] } } : {}),
      body: s.body,
      ...(s.facts?.length ? { facts: s.facts } : {}),
      ...(s.link ? { link: s.link } : {}),
      markers: s.markers.map((m) => ({ kind: m.kind, side: m.side, name: m.name, date: m.date, lonlat: LL(m.xy), ...(m.lp && m.lp !== 'r' ? { lp: m.lp } : {}), text: m.text })),
      arrows: s.arrows.map((ar) => {
        const nums = ar.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
        const pts = []; for (let i = 0; i < nums.length; i += 2) pts.push(LL([nums[i], nums[i + 1]]));
        return { side: ar.side, ...(ar.label ? { label: ar.label } : {}), ...(ar.lxy ? { label_at: LL(ar.lxy) } : {}), bezier: pts };
      }),
      ...(areas.length ? { areas } : {}),
    };
    if (s.dkSideName) step.side_names = { dk: s.dkSideName };
    if (s.dkMoveName) step.move_names = { dk: s.dkMoveName };
    if (sidesUsed.has('dk') || s.markers.some((m) => m.side === 'dk')) step.countries.push('dk', 'no');
    stepObjs.push(step);
  }
  const sides = [SIDE.se];
  if (sidesUsed.has('dk') || w.dk) {
    const dkPol = w.dk || 'denmark-norway';
    const dkName = w.dkName || (dkPol === 'denmark' ? 'Denmark' : 'Denmark–Norway');
    const adj = dkName === 'Denmark' ? 'Danish' : dkName === 'Norway' ? 'Norwegian' : 'Danish–Norwegian';
    sides.push({ id: 'dk', name: dkName, polities: dkPol === 'denmark-norway' ? ['denmark-norway', 'danish-duchies'] : dkPol === 'norway' ? ['norway', 'norway-union'] : [dkPol], ink: 'red', moves: `${adj} moves`, success: `${adj} success` });
  }
  if (sidesUsed.has('foe') || w.foe) sides.push({ ...SIDE.foe, polities: w.foe || [] });
  if (sidesUsed.has('nl') || w.nl) sides.push(SIDE.nl);
  const y = parseInt(w.start, 10);
  const war = {
    id: w.id, name: w.name, start: w.start, end: w.end, tier: stepObjs.length >= 4 ? 'A' : 'B',
    summary: '',
    sides,
    notes: [noteFor(y), 'Migrated from Sweden at War, so the story is told from Sweden’s side.'],
    sources: sourcesFor(w),
    steps: stepObjs,
  };
  if (!war.sources.length) console.warn(`war ${w.id}: no sources matched`);
  writeFileSync(`content/wars/${w.start.slice(0, 4)}-${w.id}.yaml`, YAML.stringify(war, { lineWidth: 0, aliasDuplicateObjects: false }));
}
const missing = D.steps.map((_, i) => i + 1).filter((n) => !used.has(n));
if (missing.length) console.warn('steps not assigned to a war:', missing);
const usedSources = new Set();
for (const w of WARS) { const f = `content/wars/${w.start.slice(0, 4)}-${w.id}.yaml`; for (const s of YAML.parse(readFileSync(f, 'utf8')).sources) usedSources.add(s.url); }
const unusedSources = sources.filter((s) => !usedSources.has(s.url));
if (unusedSources.length) console.warn('sources not matched to any war:', unusedSources.map((s) => s.title));
console.log(`wars: ${WARS.length}, km per old unit: ${kmPerOld.toFixed(3)}`);

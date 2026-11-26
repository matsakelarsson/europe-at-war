// Builds the base map geometry, in longitude and latitude, for the globe.
//  .cache/ne/*.geojson + content/borders/splits/*.geojson
//    -> site-data/atoms.topo.json   objects: atoms, world, lakes, rivers
//    -> content/borders/atoms.json  (atom index: id, name, country, interior point)
//
// Atoms are Natural Earth admin-1 regions, optionally cut by hand-made splits.
// A split is a GeoJSON polygon (lon/lat) with properties {id, from, name}. The
// part of atom `from` inside the polygon becomes atom `id` (by convention
// `<from>~<suffix>`); the rest keeps the id `from`.
//
// Which regions are atoms is decided in the authoring projection: every
// admin-1 region with land inside DATA_CLIP (see projection.mjs). An atom that
// reaches beyond it is kept whole. `world` is all other land, simplified more,
// with no owner; it is cut into 30° tiles so that no polygon is larger than a
// hemisphere, which the globe's horizon handling relies on (site/globe.js).
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import polygonClipping from 'polygon-clipping';
import { projectRaw, unproject, mapCoords, DATA_CLIP } from './projection.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Natural Earth names that are wrong for the polygon they label.
const NAME_FIX = { 'MD-RE': 'Rîbnița', 'AZ-LAN': 'Lachin' };
const CACHE = join(ROOT, '.cache');
const PREFILTER = [-75, 0, 130, 90]; // lon/lat box that covers DATA_CLIP
// Simplification in metres: atoms and the water near them, the rest of the world.
const DETAIL = 1400, COARSE = 8000;
const TILE = 30;

const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));

function bboxOf(geom) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  mapCoords(geom, (c) => { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; return c; });
  return [x0, y0, x1, y1];
}
const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const toMulti = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const fromMulti = (mp) => (mp.length === 1 ? { type: 'Polygon', coordinates: mp[0] } : { type: 'MultiPolygon', coordinates: mp });
const collection = (features) => ({ type: 'FeatureCollection', features: features.map(({ properties, geometry }) => ({ type: 'Feature', properties, geometry })) });

async function loadSplits() {
  const dir = join(ROOT, 'content/borders/splits');
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.geojson')); } catch {}
  const out = [];
  for (const f of files.sort()) {
    const fc = await readJSON(join(dir, f));
    for (const ft of fc.features) {
      const { id, from } = ft.properties || {};
      if (!id || !from) throw new Error(`${f}: split feature needs properties.id and properties.from`);
      out.push({ ...ft.properties, file: f, geometry: ft.geometry });
    }
  }
  return out;
}

/** Cut polygons into TILE° cells (planar in lon/lat, which is what the cells are). */
function tile(features) {
  const out = [];
  for (const f of features) {
    const [x0, y0, x1, y1] = bboxOf(f.geometry);
    const fits = Math.floor(x0 / TILE) === Math.floor((x1 - 1e-9) / TILE) && Math.floor(y0 / TILE) === Math.floor((y1 - 1e-9) / TILE);
    if (fits) { out.push(f); continue; }
    const poly = toMulti(f.geometry);
    for (let x = Math.floor(x0 / TILE) * TILE; x < x1; x += TILE) {
      for (let y = Math.floor(y0 / TILE) * TILE; y < y1; y += TILE) {
        const cell = [[[x, y], [x + TILE, y], [x + TILE, y + TILE], [x, y + TILE], [x, y]]];
        const part = polygonClipping.intersection(poly, cell);
        if (part.length) out.push({ properties: f.properties, geometry: fromMulti(part) });
      }
    }
  }
  return out;
}

async function main() {
  const ne = await readJSON(join(CACHE, 'ne/admin1.geojson'));
  const seen = new Map();
  let atoms = [];
  for (const ft of ne.features) {
    if (!ft.geometry || !overlaps(bboxOf(ft.geometry), PREFILTER)) continue;
    const p = ft.properties;
    let id = /^[A-Z]{2}-[A-Z0-9]{1,4}$/.test(p.iso_3166_2 || '') ? p.iso_3166_2 : p.adm1_code;
    if (seen.has(id)) id = p.adm1_code;
    if (seen.has(id)) throw new Error('duplicate atom id ' + id);
    seen.set(id, true);
    atoms.push({ id, name: NAME_FIX[id] || p.name_en || p.name || id, country: p.adm0_a3, admin: p.admin, geometry: ft.geometry });
  }

  // Apply splits (in lon/lat).
  const splits = await loadSplits();
  for (const s of splits) {
    const parent = atoms.find((a) => a.id === s.from);
    if (!parent) throw new Error(`split ${s.id}: no atom ${s.from}`);
    const cutter = toMulti(s.geometry);
    const inside = polygonClipping.intersection(toMulti(parent.geometry), cutter);
    const outside = polygonClipping.difference(toMulti(parent.geometry), cutter);
    if (!inside.length) { console.warn(`split ${s.id}: does not overlap ${s.from}`); continue; }
    if (outside.length) parent.geometry = fromMulti(outside);
    else atoms = atoms.filter((a) => a !== parent);
    atoms.push({ id: s.id, name: s.name || s.id, country: parent.country, admin: parent.admin, parent: s.from, geometry: fromMulti(inside) });
  }

  // Which atoms have land inside DATA_CLIP, and their interior points, in km.
  const projected = collection(atoms.map((a) => ({ properties: { id: a.id }, geometry: mapCoords(a.geometry, (c) => projectRaw(c)) })));
  const bbox = `${DATA_CLIP.x0},${DATA_CLIP.y0},${DATA_CLIP.x1},${DATA_CLIP.y1}`;
  const clipped = await mapshaper.applyCommands([
    '-i atoms.json snap', `-clip bbox=${bbox}`, '-simplify interval=1.4 keep-shapes planar',
    '-filter-slivers min-area=4', '-clean', '-o format=geojson atoms.json',
  ].join(' '), { 'atoms.json': projected });
  const kept = new Set(JSON.parse(clipped['atoms.json']).features.filter((f) => f.geometry).map((f) => f.properties.id));
  const ptsOut = await mapshaper.applyCommands('-i atoms.json -points inner -o format=geojson pts.json', { 'atoms.json': projected });
  const pts = new Map(JSON.parse(ptsOut['pts.json']).features.map((f) => [f.properties.id, f.geometry.coordinates]));
  atoms = atoms.filter((a) => kept.has(a.id));

  // Land: the atoms, whole, and the rest of the world (Natural Earth countries,
  // dissolved, minus the atoms), simplified together so that they share edges.
  const admin0 = await readJSON(join(CACHE, 'ne/admin0.geojson'));
  const land = await mapshaper.applyCommands([
    '-i atoms.json world.json combine-files snap',
    '-clean target=atoms',
    '-dissolve target=world',
    '-erase atoms target=world',
    '-explode target=world',
    '-filter-slivers gap-width=1km remove-empty target=world',
    '-filter "this.area > 20e6" target=world',
    '-each "kind=\'w\'" target=world',
    '-merge-layers target=atoms,world force name=land',
    `-simplify variable interval="kind == 'w' ? ${COARSE} : ${DETAIL}" keep-shapes`,
    '-filter-slivers min-area=4km2 keep-shapes',
    // Overlaps left by simplifying go to the first feature, so an atom always
    // beats the world land around it, however small the atom.
    '-clean overlap-rule=min-id',
    '-split kind',
    '-o format=geojson precision=0.000001 land.json',
  ].join(' '), {
    'atoms.json': collection(atoms.map((a) => ({ properties: { id: a.id, kind: 'a' }, geometry: a.geometry }))),
    'world.json': collection(admin0.features.filter((f) => f.geometry).map((f) => ({ properties: {}, geometry: f.geometry }))),
  });
  const layers = Object.values(land).map((text) => JSON.parse(text).features);
  const atomFeatures = layers.find((fs) => fs[0]?.properties.kind === 'a').filter((f) => f.geometry);
  const worldFeatures = layers.find((fs) => fs[0]?.properties.kind === 'w').filter((f) => f.geometry);
  if (atomFeatures.length !== kept.size) { const have = new Set(atomFeatures.map((f) => f.properties.id)); throw new Error(`land: atoms lost: ${[...kept].filter((id) => !have.has(id)).join(' ')}`); }

  // Lakes and rivers: those near the atoms in detail, the rest of the world coarser.
  const near = (g) => overlaps(bboxOf(g), PREFILTER);
  const water = async (file, maxRank, farRank, extra) => {
    const raw = await readJSON(join(CACHE, `ne/${file}.geojson`));
    const fs = raw.features.filter((f) => f.geometry && f.properties.featurecla !== 'Lake Centerline' &&
      f.properties.scalerank <= (near(f.geometry) ? maxRank : farRank))
      .map((f) => ({ properties: { name: f.properties.name || '', far: near(f.geometry) ? 0 : 1 }, geometry: f.geometry }));
    const out = await mapshaper.applyCommands(`-i ${file}.json -simplify variable interval="far ? ${COARSE} : ${DETAIL}" keep-shapes ${extra} -o format=geojson precision=0.000001 ${file}.json`,
      { [`${file}.json`]: collection(fs) });
    return JSON.parse(out[`${file}.json`]).features.filter((f) => f.geometry);
  };
  const lakes = await water('lakes', 5, 3, '-filter "this.area > 30e6"');
  const rivers = await water('rivers', 5, 4, '');

  const strip = (fs, keep) => collection(fs.map((f) => ({ properties: Object.fromEntries(keep.map((k) => [k, f.properties[k]])), geometry: f.geometry })));
  const out = await mapshaper.applyCommands([
    '-i atoms.json world.json lakes.json rivers.json combine-files snap snap-interval=0.000002',
    // Tile edges must come out as shared arcs, or the globe draws them as coast.
    '-clean target=world',
    '-o format=topojson quantization=200000 atoms.topo.json target=*',
  ].join(' '), {
    'atoms.json': strip(atomFeatures, ['id']),
    'world.json': strip(tile(worldFeatures), []),
    'lakes.json': strip(lakes, ['name']),
    'rivers.json': strip(rivers, ['name']),
  });
  const topo = JSON.parse(out['atoms.topo.json']);
  for (const k of ['atoms', 'world', 'lakes', 'rivers']) if (!topo.objects[k]) throw new Error('missing object ' + k);
  for (const g of topo.objects.world.geometries) delete g.properties;

  const index = atoms.map((a) => {
    const xy = pts.get(a.id);
    const ll = unproject(xy);
    return { id: a.id, name: a.name, country: a.country, admin: a.admin, ...(a.parent ? { parent: a.parent } : {}),
      xy: xy.map((v) => Math.round(v * 10) / 10), ll: ll.map((v) => Math.round(v * 1e4) / 1e4) };
  }).sort((a, b) => a.id.localeCompare(b.id));

  await mkdir(join(ROOT, 'site-data'), { recursive: true });
  await writeFile(join(ROOT, 'site-data/atoms.topo.json'), JSON.stringify(topo));
  await writeFile(join(ROOT, 'content/borders/atoms.json'), '[\n' + index.map((a) => JSON.stringify(a)).join(',\n') + '\n]\n');
  const size = Buffer.byteLength(JSON.stringify(topo));
  const count = (k) => topo.objects[k].geometries.length;
  console.log(`atoms: ${index.length} (${splits.length} splits), world: ${count('world')}, lakes: ${count('lakes')}, rivers: ${count('rivers')}`);
  console.log(`atoms.topo.json: ${(size / 1e6).toFixed(2)} MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });

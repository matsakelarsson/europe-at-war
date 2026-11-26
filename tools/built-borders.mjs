// The border timeline from the last build (dist/data/), put back together from
// borders.json and the century files in data/borders/:
//   { atoms: ids in timeline order, polities, keys, timeline: [{ d, k, s, c }] }
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

export function loadBuiltBorders() {
  const data = join(ROOT, 'dist/data');
  const read = (file) => JSON.parse(readFileSync(join(data, file), 'utf8'));
  const borders = read('borders.json');
  const atoms = read('atoms.topo.json').objects.atoms.geometries.map((g) => g.properties.id);
  const timeline = borders.keys.map((k) => ({ k }));
  for (const file of readdirSync(join(data, 'borders')).filter((f) => f.endsWith('.json'))) {
    const chunk = read(`borders/${file}`);
    chunk.entries.forEach((entry, j) => Object.assign(timeline[chunk.start + j], entry));
  }
  return { ...borders, atoms, timeline };
}

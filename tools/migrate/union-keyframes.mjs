// One-off fix (2026-11-18): historical-basemaps lumps the Polish–Lithuanian
// union (and its Moldavian vassal) as "Poland-Lithuania". The site keeps the
// Crown and the Grand Duchy apart until 1795, so outside the curated atoms
// keyframe assignments are re-mapped: Moldavian lands → moldavia, Ukrainian
// lands → lithuania before the Union of Lublin (1569) and poland after it,
// everything else → lithuania.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { CONTENT } from '../lib.mjs';
const curated = YAML.parse(readFileSync(join(CONTENT, 'borders/curated.yaml'), 'utf8'));
const atoms = JSON.parse(readFileSync(join(CONTENT, 'borders/atoms.json'), 'utf8'));
const parent = new Map(atoms.map((a) => [a.id, a.parent]));
const root = (id) => { while (parent.get(id)) id = parent.get(id); return id; };
const inRange = (c, y) => +c.from <= y && y < +String(c.until).slice(0, 4);
for (const y of [1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783]) {
  const p = join(CONTENT, 'borders/keyframes', `${y}.json`);
  const kf = JSON.parse(readFileSync(p, 'utf8'));
  const cur = new Set(curated.filter((c) => inRange(c, y)).flatMap((c) => c.atoms.map((a) => root(a.replace(/!$/, '')))));
  const moved = {};
  kf.owners['poland-lithuania'] = (kf.owners['poland-lithuania'] || []).filter((a) => {
    if (cur.has(root(a))) return true;
    const to = /^(MD|MDA|RO)-|^UA-77/.test(a) ? 'moldavia' : /^UA-/.test(a) && y >= 1569 ? 'poland' : 'lithuania';
    (moved[to] ||= []).push(a);
    return false;
  });
  if (!kf.owners['poland-lithuania'].length) delete kf.owners['poland-lithuania'];
  for (const [to, l] of Object.entries(moved)) kf.owners[to] = [...(kf.owners[to] || []), ...l].sort();
  if (!/hand-corrected/.test(kf.source)) kf.source = kf.source.replace(/\(automatic draft, needs checking\)/, '(automatic draft, partly hand-corrected)');
  const lines = Object.entries(kf.owners).map(([q, a]) => `    ${JSON.stringify(q)}: ${JSON.stringify(a)}`);
  writeFileSync(p, `{\n  "date": ${JSON.stringify(kf.date)},\n  "source": ${JSON.stringify(kf.source)},\n  "owners": {\n${lines.join(',\n')}\n  }\n}\n`);
  console.log(y, Object.entries(moved).map(([k, v]) => `${k}: ${v.join(' ')}`).join(' | ') || '-');
}

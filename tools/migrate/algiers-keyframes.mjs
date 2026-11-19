// One-off fix (2026-11-19): the drafts leave Algiers (DZ-16) without an owner in
// every keyframe before today's map, so the city showed as a hole in 1900–2007.
// Give it the owner of the neighbouring province of Tipaza (DZ-42), or of Blida
// (DZ-09) where Tipaza has none.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT } from '../lib.mjs';
const dir = join(CONTENT, 'borders/keyframes');
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const p = join(dir, f);
  const kf = JSON.parse(readFileSync(p, 'utf8'));
  const ownerOf = (a) => Object.entries(kf.owners).find(([q, l]) => q !== '-' && l.includes(a))?.[0];
  const cur = ownerOf('DZ-16');
  if (cur) continue;
  const to = ownerOf('DZ-42') || ownerOf('DZ-09');
  if (!to) { console.log(f, 'no neighbour owner'); continue; }
  if (kf.owners['-']) { kf.owners['-'] = kf.owners['-'].filter((a) => a !== 'DZ-16'); if (!kf.owners['-'].length) delete kf.owners['-']; }
  kf.owners[to] = [...kf.owners[to], 'DZ-16'].sort();
  const lines = Object.entries(kf.owners).map(([q, a]) => `    ${JSON.stringify(q)}: ${JSON.stringify(a)}`);
  writeFileSync(p, `{\n  "date": ${JSON.stringify(kf.date)},\n  "source": ${JSON.stringify(kf.source)},\n  "owners": {\n${lines.join(',\n')}\n  }\n}\n`);
  console.log(f, 'DZ-16 ->', to);
}

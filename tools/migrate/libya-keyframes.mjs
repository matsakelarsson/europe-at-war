// One-off fix (2026-11-18): the drafts call Italian Libya `libya` (1914, 1938)
// or `libya-it` (1920), and give Ghat and Wadi al Shatii to Algeria in 1914.
// Italian Libya (1912-10-18 to the Paris treaty of 1947) is one polity,
// `libya-it`; `libya` is the independent state from 1951.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT } from '../lib.mjs';
for (const y of [1914, 1938]) {
  const p = join(CONTENT, 'borders/keyframes', `${y}.json`);
  const kf = JSON.parse(readFileSync(p, 'utf8'));
  const moved = [...(kf.owners.libya || [])];
  delete kf.owners.libya;
  for (const [q, l] of Object.entries(kf.owners)) {
    if (q === 'libya-it') continue;
    const keep = l.filter((a) => !(a.startsWith('LY-') && q !== '-'));
    moved.push(...l.filter((a) => a.startsWith('LY-') && q !== '-'));
    if (keep.length) kf.owners[q] = keep; else delete kf.owners[q];
  }
  kf.owners['libya-it'] = [...new Set([...(kf.owners['libya-it'] || []), ...moved])].sort();
  const lines = Object.entries(kf.owners).map(([q, a]) => `    ${JSON.stringify(q)}: ${JSON.stringify(a)}`);
  writeFileSync(p, `{\n  "date": ${JSON.stringify(kf.date)},\n  "source": ${JSON.stringify(kf.source)},\n  "owners": {\n${lines.join(',\n')}\n  }\n}\n`);
  console.log(y, 'libya-it:', moved.join(' '));
}

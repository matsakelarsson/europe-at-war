// One-off hand corrections to the migrated Sweden events (2026-11-18), made
// when the Denmark–Norway and Poland pilot took over those regions.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { ROOT } from '../lib.mjs';
const p = join(ROOT, 'content/borders/events/sweden-at-war.yaml');
const doc = YAML.parseDocument(readFileSync(p, 'utf8'));
const evs = doc.contents.items;
const ev = (d) => evs.find((e) => String(e.get('date')) === d);
const list = (e, pol) => e.get('owners').get(pol);
const take = (e, pol, ids) => { const l = list(e, pol); if (!l) return; l.items = l.items.filter((x) => !ids.includes(String(x.value))); };
const give = (e, pol, ids) => { let l = list(e, pol); if (!l) { e.get('owners').set(pol, doc.createNode([])); l = list(e, pol); } for (const id of ids) if (!l.items.some((x) => x.value === id)) l.items.push(doc.createNode(id)); };

// 1240: only Schleswig was a Danish duchy; Holstein and Lauenburg were imperial
// (Schauenburg counts, Saxe-Lauenburg). Rügen stays a Danish fief (1168–1325).
const e1240 = ev('1240');
take(e1240, 'danish-duchies', ['DE-SH!', 'DE-SH~holstein']);
give(e1240, 'hre', ['DE-SH!', 'DE-SH~holstein']);
take(e1240, 'hre', ['DE-MV~pomN', 'DE-MV~pomN!']);
// 1332: Silesia passed to the Bohemian crown (Trentschin 1335), not just "the Empire".
const e1332 = ev('1332');
const sil = list(e1332, 'hre').items.map((x) => String(x.value)).filter((id) => /^PL-(DS|LB|OP|SL)/.test(id));
take(e1332, 'hre', sil); give(e1332, 'bohemia', sil);
// 1561: Ducal Prussia was a Polish fief (1525–1657), not Brandenburg.
const e1561 = ev('1561');
const dp = list(e1561, 'prussia').items.map((x) => String(x.value)).filter((id) => /^(PL-WN|RU-KGD)/.test(id));
take(e1561, 'prussia', dp); give(e1561, 'ducal-prussia', dp);
// From 1772 on, Polish, Lithuanian, Belarusian, Ukrainian and Latvian lands are
// curated in poland-lithuania.yaml.
const pilot = /^(PL-|LT-|BY-|UA-|LV-|RU-KGD)/;
let dropped = 0;
for (const e of evs) {
  if (String(e.get('date')) < '1772') continue;
  for (const pair of e.get('owners').items) { const before = pair.value.items.length; pair.value.items = pair.value.items.filter((x) => !pilot.test(String(x.value))); dropped += before - pair.value.items.length; }
  e.get('owners').items = e.get('owners').items.filter((pair) => pair.value.items.length);
}
writeFileSync(p, doc.toString({ lineWidth: 0 }));
console.log(`Silesia ${sil.length}, Ducal Prussia ${dp.length}, dropped ${dropped} assignments from 1772 on`);

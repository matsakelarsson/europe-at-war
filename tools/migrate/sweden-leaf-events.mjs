// One-off fix (2026-11-18): the migrated Sweden events list leaf atoms, but the
// build reads a parent id as including its split-off children. Already applied.
// Rewrite the migrated Sweden events to the generator's intent: each id meant
// that leaf atom, plus any part of it split off later (pilot splits).
import { readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';
import { ROOT as R } from "../lib.mjs";
const atoms = JSON.parse(readFileSync(`${R}/content/borders/atoms.json`, 'utf8'));
const old = new Set(JSON.parse(readFileSync(`${R}/content/borders/splits/10-sweden-at-war.geojson`, 'utf8')).features.map((f) => f.properties.id));
const kids = new Map();
for (const a of atoms) if (a.parent) (kids.get(a.parent) || kids.set(a.parent, []).get(a.parent)).push(a.id);
const conv = (id) => {
  const ch = kids.get(id) || [];
  if (!ch.length) return [id];
  return [id + '!', ...ch.filter((c) => !old.has(c))];   // new children follow (with their own children)
};
const p = `${R}/content/borders/events/sweden-at-war.yaml`;
const doc = YAML.parseDocument(readFileSync(p, 'utf8'));
let n = 0;
for (const ev of doc.contents.items) {
  const owners = ev.get('owners');
  for (const pair of owners.items) {
    const ids = pair.value.items.map((x) => String(x.value));
    const out = ids.flatMap(conv);
    if (out.join() !== ids.join()) { n++; pair.value = doc.createNode(out); }
  }
}
writeFileSync(p, doc.toString({ lineWidth: 0 }));
console.log(`${n} owner lists rewritten`);

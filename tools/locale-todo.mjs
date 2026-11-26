// List the source strings a locale has not translated yet, from the last build (dist/).
//   node tools/locale-todo.mjs sv                  everything missing
//   node tools/locale-todo.mjs sv --catalogue      war names, summaries, sides, sources, step titles and dates
//   node tools/locale-todo.mjs sv --map            map strings only
//   node tools/locale-todo.mjs sv --wars           war strings only
// Prints JSON: { map: { <category>: [source…] }, wars: { <war id>: [source…] } }.
// Strings without letters (years, numbers) are left out: they need no translation.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { ROOT, CONTENT } from './lib.mjs';
import { localizeWar, localizeMap } from '../site/localized-content.js';

const args = process.argv.slice(2);
const code = args.find((a) => !a.startsWith('--'));
if (!code) { console.error('usage: node tools/locale-todo.mjs <locale> [--catalogue|--map|--wars]'); process.exit(1); }
const only = (flag) => args.includes(flag);
const wantMap = !only('--wars') && !only('--catalogue') || only('--map') || only('--catalogue');
const wantWars = !only('--map');
const needs = (s) => /\p{L}/u.test(s);
const readYAML = (file) => (existsSync(file) ? YAML.parse(readFileSync(file, 'utf8')) || {} : {});
const folder = join(CONTENT, 'locales', code);
const out = { map: {}, wars: {} };

if (wantMap) {
  const borders = JSON.parse(readFileSync(join(ROOT, 'dist/data/borders.json'), 'utf8'));
  const labels = JSON.parse(readFileSync(join(ROOT, 'dist/data/labels.json'), 'utf8'));
  const have = readYAML(join(folder, 'map.yaml'));
  const seen = {};
  localizeMap(borders, labels, (category, value) => {
    const s = String(value);
    if (needs(s) && !have[category]?.[s] && !(seen[category] ??= new Set()).has(s)) {
      seen[category].add(s);
      (out.map[category] ??= []).push(s);
    }
    return value;
  });
}

if (wantWars) {
  const dir = join(ROOT, 'dist/data/wars');
  for (const f of readdirSync(dir).sort()) {
    const war = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const have = readYAML(join(folder, 'wars', f.replace(/\.json$/, '.yaml')));
    const list = [];
    const add = (v) => { const s = String(v ?? ''); if (s && needs(s) && !have[s] && !list.includes(s)) list.push(s); };
    if (only('--catalogue')) {
      add(war.name); add(war.summary);
      for (const side of war.sides) add(side.name);
      for (const source of war.sources || []) add(source.title);
      for (const step of war.steps) { add(step.title); add(step.date); }
    } else {
      localizeWar(structuredClone(war), (v) => { add(v); return v; });
    }
    if (list.length) out.wars[war.id] = list;
  }
}
console.log(JSON.stringify(out, null, 1));

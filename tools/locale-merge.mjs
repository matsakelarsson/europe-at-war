// Merge translations into a locale's files, keeping only keys that match a source string.
//   node tools/locale-merge.mjs sv todo.json done1.json done2.json …
// todo.json is the output of locale-todo.mjs (it says which war or map category each
// source string belongs to). Each done file is a JSON object { "<source>": "<translation>" }.
// A translation is written to every war or category whose todo list has its source.
// Existing translations are kept. Reports unknown keys and what is still missing.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { CONTENT } from './lib.mjs';

const [code, todoFile, ...doneFiles] = process.argv.slice(2);
if (!code || !todoFile || !doneFiles.length) { console.error('usage: node tools/locale-merge.mjs <locale> <todo.json> <done.json…>'); process.exit(1); }
const todo = JSON.parse(readFileSync(todoFile, 'utf8'));
const done = {};
for (const f of doneFiles) Object.assign(done, JSON.parse(readFileSync(f, 'utf8')));
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(' ');
const used = new Set();
let missing = 0, written = 0, rejected = 0;
const pick = (s) => {
  const t = done[s];
  if (typeof t !== 'string' || !t.trim()) { missing++; return null; }
  if (placeholders(t) !== placeholders(s)) { console.warn(`placeholders differ, skipped: ${s.slice(0, 80)}`); rejected++; return null; }
  used.add(s); written++;
  return t;
};
const yamlOut = (obj) => YAML.stringify(obj, { lineWidth: 0 });
const folder = join(CONTENT, 'locales', code);

if (Object.keys(todo.map || {}).length) {
  const file = join(folder, 'map.yaml');
  const map = existsSync(file) ? YAML.parse(readFileSync(file, 'utf8')) || {} : {};
  for (const [category, list] of Object.entries(todo.map)) {
    for (const s of list) { const t = pick(s); if (t !== null) (map[category] ??= {})[s] ??= t; }
  }
  writeFileSync(file, yamlOut(map));
}
mkdirSync(join(folder, 'wars'), { recursive: true });
for (const [id, list] of Object.entries(todo.wars || {})) {
  const add = {};
  for (const s of list) { const t = pick(s); if (t !== null) add[s] = t; }
  if (!Object.keys(add).length) continue;
  const file = join(folder, 'wars', `${id}.yaml`);
  const have = existsSync(file) ? YAML.parse(readFileSync(file, 'utf8')) || {} : {};
  writeFileSync(file, yamlOut({ ...have, ...Object.fromEntries(Object.entries(add).filter(([k]) => !(k in have))) }));
}
const unknown = Object.keys(done).filter((k) => !used.has(k) && !Object.values(todo.wars || {}).some((l) => l.includes(k)) && !Object.values(todo.map || {}).some((l) => l.includes(k)));
console.log(`written ${written}, missing ${missing}, rejected ${rejected}, unknown keys ${unknown.length}`);
for (const k of unknown.slice(0, 20)) console.log(`  unknown: ${k.slice(0, 100)}`);

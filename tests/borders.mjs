// Run after npm run build: node --test tests/borders.mjs
// The border timeline is split by century. Each century file starts from a
// snapshot that must equal the state the earlier centuries lead to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const DATA = new URL('../dist/data/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, DATA)));
const { keys, polities } = load('borders.json');
const atoms = load('atoms.topo.json').objects.atoms.geometries.length;
const chunks = readdirSync(new URL('borders/', DATA)).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ file: f, ...load('borders/' + f) }));

test('century files cover every change, in order, each in its own century', () => {
  let next = 0;
  for (const c of chunks) {
    assert.equal(c.start, next, c.file);
    c.entries.forEach((_, j) => assert.equal(keys[c.start + j].slice(0, 2) + '00.json', c.file));
    next += c.entries.length;
  }
  assert.equal(next, keys.length);
});

test('each snapshot is the state the changes before it lead to', () => {
  const owners = new Array(atoms).fill(-1);
  for (const c of chunks) {
    assert.equal(c.base.length, atoms, c.file);
    assert.deepEqual(c.base, owners, c.file);
    for (const e of c.entries) for (let j = 0; j < e.c.length; j += 2) {
      assert.ok(e.c[j] >= 0 && e.c[j] < atoms && e.c[j + 1] >= -1 && e.c[j + 1] < polities.length, c.file);
      owners[e.c[j]] = e.c[j + 1];
    }
  }
});

test('translated notes are filed with their century', () => {
  for (const code of readdirSync(new URL('locales/', DATA))) {
    assert.equal(load(`locales/${code}/index.json`).map.borderSources, undefined);
    for (const f of readdirSync(new URL(`locales/${code}/borders/`, DATA))) {
      const notes = new Set(chunks.find((c) => c.file === f).entries.map((e) => e.s));
      for (const note of Object.keys(load(`locales/${code}/borders/${f}`))) assert.ok(notes.has(note), `${code} ${f}: ${note.slice(0, 40)}`);
    }
  }
});

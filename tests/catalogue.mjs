// Run after npm run build: node --test tests/catalogue.mjs
// The catalogue is split: wars.json (loaded at once) and one file of details
// per start century (loaded on demand). Every war must be in exactly one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const DATA = new URL('../dist/data/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, DATA)));
const wars = load('wars.json');
const centuries = readdirSync(new URL('catalogue/', DATA)).filter((f) => f.endsWith('.json'));
const details = new Map(centuries.flatMap((f) => Object.entries(load('catalogue/' + f)).map(([id, d]) => [id, { ...d, file: f }])));

test('every war has its details in its start century file', () => {
  assert.equal(details.size, wars.length);
  for (const w of wars) {
    const d = details.get(w.id);
    assert.ok(d, w.id);
    assert.equal(d.file, w.sk.slice(0, 2) + '00.json', w.id);
    assert.equal(d.steps.length, w.n, w.id);
    assert.equal(typeof d.summary, 'string', w.id);
    if (!w.n) assert.ok(d.sources?.length, `${w.id}: a war without steps lists its sources`);
  }
});

test('wars.json holds no long text', () => {
  for (const w of wars) {
    assert.deepEqual(Object.keys(w).filter((k) => !['id', 'name', 'sk', 'ek', 'tier', 'countries', 'n', 'end'].includes(k)), [], w.id);
    if (w.end !== undefined) assert.equal(w.end, 'ongoing', w.id);
  }
});

test('translated names are in the language index, the rest in century files', () => {
  for (const code of readdirSync(new URL('locales/', DATA))) {
    const index = load(`locales/${code}/index.json`);
    assert.equal(index.index, undefined);
    for (const id of index.stories) assert.ok(existsSync(new URL(`locales/${code}/wars/${id}.json`, DATA)), `${code} ${id}`);
    for (const [id, name] of Object.entries(index.names)) {
      const w = wars.find((war) => war.id === id);
      assert.ok(w, `${code}: unknown war ${id}`);
      assert.equal(load(`locales/${code}/wars/${id}.json`)[w.name], name);
    }
    for (const f of readdirSync(new URL(`locales/${code}/catalogue/`, DATA))) {
      for (const id of Object.keys(load(`locales/${code}/catalogue/${f}`))) assert.equal(details.get(id)?.file, f, `${code} ${f} ${id}`);
    }
  }
});

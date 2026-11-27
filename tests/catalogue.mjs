// Run after npm run build: node --test tests/catalogue.mjs
// The catalogue is split: wars.json (loaded at once) and bucket files of
// details by start date (loaded on demand; site/buckets.js). Every war must be
// in exactly one. Other languages have translated copies of the bucket files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { bucketOf } from '../site/buckets.js';
const DATA = new URL('../dist/data/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, DATA)));
const wars = load('wars.json');
const { buckets } = load('borders.json');
const files = (dir) => readdirSync(new URL(dir, DATA)).filter((f) => f.endsWith('.json')).sort();
const centuries = readdirSync(new URL('catalogue/', DATA)).filter((f) => f.endsWith('.json'));
const details = new Map(centuries.flatMap((f) => Object.entries(load('catalogue/' + f)).map(([id, d]) => [id, { ...d, file: f }])));

test('every war has its details in the bucket file of its start date', () => {
  assert.equal(details.size, wars.length);
  for (const w of wars) {
    const d = details.get(w.id);
    assert.ok(d, w.id);
    assert.equal(d.file, bucketOf(buckets.catalogue, w.sk) + '.json', w.id);
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

test('bucket files are the ones borders.json lists', () => {
  assert.deepEqual(files('catalogue/'), buckets.catalogue.map((b) => b + '.json'));
  assert.deepEqual(files('borders/'), buckets.borders.map((b) => b + '.json'));
  for (const list of Object.values(buckets)) assert.deepEqual(list, [...list].sort());
});

test('translated names are in the language index, details in translated bucket files', () => {
  for (const code of readdirSync(new URL('locales/', DATA))) {
    const index = load(`locales/${code}/index.json`);
    assert.equal(index.index, undefined);
    for (const id of index.stories) assert.ok(existsSync(new URL(`locales/${code}/wars/${id}.json`, DATA)), `${code} ${id}`);
    for (const [id, name] of Object.entries(index.names)) {
      const w = wars.find((war) => war.id === id);
      assert.ok(w, `${code}: unknown war ${id}`);
      assert.equal(load(`locales/${code}/wars/${id}.json`)[w.name], name);
    }
    // Each language has a copy of every bucket file, with the same wars, steps
    // and links; only the text differs.
    assert.deepEqual(files(`locales/${code}/catalogue/`), files('catalogue/'), code);
    for (const f of files('catalogue/')) {
      const english = load('catalogue/' + f), translated = load(`locales/${code}/catalogue/${f}`);
      assert.deepEqual(Object.keys(translated), Object.keys(english), `${code} ${f}`);
      for (const [id, d] of Object.entries(translated)) {
        const e = english[id];
        assert.equal(typeof d.summary, 'string', `${code} ${id}`);
        assert.deepEqual(d.steps.map((s) => [s.c, s.w]), e.steps.map((s) => [s.c, s.w]), `${code} ${id}`);
        assert.deepEqual((d.sources || []).map((s) => s.url), (e.sources || []).map((s) => s.url), `${code} ${id}`);
      }
    }
  }
});

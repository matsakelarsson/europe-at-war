// Run after npm run build: node --test tests/capitals.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const load = name => JSON.parse(readFileSync(new URL('../dist/data/' + name, import.meta.url)));
const {capitals, capitalTimeline} = load('labels.json');
const {polities, timeline} = load('borders.json');

function seats(date, owner) {
  const ids = new Set();
  for (const change of capitalTimeline) {
    if (change.key > date) break;
    for (const i of change.removed) assert.ok(ids.delete(i));
    for (const i of change.added) { assert.ok(!ids.has(i)); ids.add(i); }
  }
  return [...ids].map(i => capitals[i]).filter(c => polities[c.owner].id === owner);
}

test('dates switch the seat and period spelling on the boundary', () => {
  for (const [owner, before, after, oldName, newName] of [
    ['grand-duchy-finland','1812-04-07','1812-04-08','Turku','Helsinki'],
    ['norway','1924-12-31','1925-01-01','Kristiania','Oslo'],
    ['russia','1918-03-11','1918-03-12','Petrograd','Moscow']
  ]) {
    assert.deepEqual(seats(before,owner).map(c => c.name), [oldName]);
    assert.deepEqual(seats(after,owner).map(c => c.name), [newName]);
  }
});

test('point-only city-state and concurrent seats', () => {
  assert.equal(seats('1929-06-06','vatican-city').length, 0);
  assert.equal(seats('1929-06-07','vatican-city')[0].name, 'Vatican City');
  assert.deepEqual(seats('1900-12-31','austria-hungary').map(c => c.name).sort(), ['Budapest','Vienna']);
  assert.equal(seats('1000-12-31','hre').length, 0);
  const prague = seats('1600-12-31','hre').find(c => c.name === 'Prague');
  assert.deepEqual(prague.xy, seats('1600-12-31','habsburg').find(c => c.name === 'Prague').xy);
});

test('coverage audit accounts for every territorial owner and reports gaps', () => {
  const audit = load('capital-coverage.json');
  for (const t of timeline) for (let j=1; j<t.c.length; j+=2) {
    if (t.c[j] >= 0) assert.ok(audit[polities[t.c[j]].id]?.length);
  }
  assert.ok(audit.khazars.some(span => span.status === 'Atil (location unresolved)'));
  assert.equal(seats('0900-12-31','khazars').length, 0);
  assert.ok(Object.values(audit).some(spans => spans.some(s => s.status === 'unresolved')));
});

test('invalid coordinates, dates, source and owner fail validation', async () => {
  const {compileCapitals} = await import('../tools/capitals.mjs');
  const polity = {id:'test'};
  const registry = {list:[polity], index:new Map([['test',0]])};
  const row = {polity:'test', name:'Seat', lonlat:[12,45], source:'https://example.org/seat', from:'1800-01-01'};
  for (const change of [
    {lonlat:[181,45]}, {from:'1900-02-29'}, {until:'1799-12-31'}, {source:''}, {polity:'missing'}
  ]) {
    const errors = [];
    const output = compileCapitals([{...row, ...change}], registry, {timeline:[]}, d => d, message => errors.push(message));
    assert.equal(errors.length, 1);
    assert.equal(output.capitals.length, 0);
  }
});

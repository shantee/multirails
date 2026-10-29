import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, Regions } from './regions.ts';
import { Layout } from './track.ts';

test('le voyage commence toujours par les prés, puis les champignons, puis les hameaux', () => {
  for (const seed of [1, 42, 999]) {
    const r = new Regions(seed);
    assert.deepEqual([0, 1, 2].map((k) => r.def(k).key), ['pres', 'champignons', 'hameaux']);
  }
});

test('jamais deux fois la même région d’affilée, et toutes finissent par apparaître', () => {
  const r = new Regions(7);
  r.rankAt(30000);
  const keys = r.order.map((i) => REGIONS[i].key);
  for (let i = 1; i < keys.length; i++) assert.notEqual(keys[i], keys[i - 1], `répétition au rang ${i}`);
  for (const def of REGIONS) assert.ok(keys.includes(def.key), `${def.key} absente`);
});

test('la voie ne fait que monter, en douceur', () => {
  const r = new Regions(3);
  let prev = r.altitude(0);
  for (let s = 1; s < 8000; s += 1) {
    const y = r.altitude(s);
    assert.ok(y >= prev - 1e-9, `descente à ${s}`);
    assert.ok(y - prev < 0.08, `pente trop raide à ${s}`);
    prev = y;
  }
  assert.ok(prev > 60, 'on est monté haut');
});

test('près d’une frontière, le décor mélange les deux régions', () => {
  const r = new Regions(5);
  const border = r.start(1);
  const before = new Set<number>();
  const after = new Set<number>();
  for (let i = 0; i < 200; i++) {
    before.add(r.pick(border - 80, i / 200));
    after.add(r.pick(border + 40, i / 200));
  }
  assert.deepEqual([...before].sort(), [0, 1]);
  assert.deepEqual([...after].sort(), [0, 1]);
  assert.deepEqual([...new Set(Array.from({ length: 50 }, (_, i) => r.pick(100, i / 50)))], [0]);
});

test('chaque frontière de région tombe sur une longue île de contemplation', () => {
  const l = new Layout(42, 'express');
  l.extend(8000);
  for (let k = 1; k < 6; k++) {
    const b = l.regions.start(k);
    const seg = l.at(b);
    assert.ok(seg && seg.kind === 'island' && seg.calm, `frontière ${k} à ${Math.round(b)}`);
    assert.ok(seg.s1 - b > 140, 'assez de place pour admirer');
  }
});

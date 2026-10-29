import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Layout, TrackPath } from './track.ts';
import { cycleLength } from './model.ts';

test('le plan alterne îles et brèches, sans trou ni chevauchement', () => {
  const l = new Layout(42, 'express');
  l.extend(6000);
  let prev = 0;
  for (const g of l.segments) {
    assert.ok(Math.abs(g.s0 - prev) < 1e-6, `continuité à ${g.s0}`);
    assert.ok(g.s1 > g.s0);
    prev = g.s1;
  }
  assert.ok(l.segments.some((g) => g.style === 'grand'), 'au moins un Grand Pont');
  assert.equal(l.segments[0].kind, 'island');
  assert.ok(l.segments.filter((g) => g.kind === 'gap').every((g) => !g.built));
});

test('un cycle île + brèche correspond au temps de réponse prévu', () => {
  const l = new Layout(7, 'promenade');
  l.extend(3000);
  const segs = l.segments;
  for (let i = 1; i < segs.length - 1; i++) {
    const g = segs[i + 1];
    if (segs[i].kind !== 'island' || g.kind !== 'gap' || g.style === 'grand') continue;
    const len = segs[i].s1 - segs[i].s0 + (g.s1 - g.s0);
    assert.ok(len >= cycleLength('promenade', segs[i].s0) - 1, `cycle trop court à ${segs[i].s0}`);
  }
});

test('la voie est continue et sans virage brusque', () => {
  const p = new TrackPath(3);
  let prev = p.point(0).clone();
  for (let s = 1; s < 3000; s += 1) {
    const q = p.point(s).clone();
    const d = q.distanceTo(prev);
    assert.ok(d > 0.95 && d < 1.05, `pas de ${d} à ${s}`);
    prev = q;
    assert.ok(Math.abs(p.curv(s)) < 0.01);
  }
});

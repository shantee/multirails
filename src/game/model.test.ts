import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QuestionDeck, Run, answerOf, answerPoints, comboMultiplier, cycleLength, factKey, factPool,
  isEntryComplete, mulberry32, recordAnswer, referenceTime, type Mastery, BOIL_COMBO, START_WAGONS,
} from './model.ts';

test('pool sans doublon commutatif', () => {
  assert.equal(factPool([7]).length, 10);
  assert.equal(factPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).length, 55);
  assert.equal(factPool([2, 3]).length, 19); // 2×3 et 3×2 comptent une fois
});

test('une table seule ne pose que des calculs de cette table, dans les deux sens', () => {
  const deck = new QuestionDeck([7], mulberry32(1), {}, 4);
  let reversed = 0;
  for (let i = 0; i < 200; i++) {
    const f = deck.next(0.5);
    assert.ok(f.a === 7 || f.b === 7, `${f.a}×${f.b}`);
    assert.ok(f.a >= 1 && f.a <= 10 && f.b >= 1 && f.b <= 10);
    if (f.b === 7 && f.a !== 7) reversed++;
  }
  assert.ok(reversed > 40, 'les deux écritures apparaissent');
});

test('pas deux fois de suite le même calcul', () => {
  const deck = new QuestionDeck([2, 3, 4, 5, 6, 7, 8, 9], mulberry32(3), {}, 4);
  let prev = '';
  for (let i = 0; i < 300; i++) {
    const f = deck.next(1);
    const k = factKey(f.a, f.b);
    assert.notEqual(k, prev);
    prev = k;
  }
});

test('début de partie : surtout des calculs faciles', () => {
  const deck = new QuestionDeck([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], mulberry32(5), {}, 4);
  let hard = 0;
  for (let i = 0; i < 5; i++) {
    const f = deck.next(0);
    if (Math.min(f.a, f.b) >= 6) hard++;
  }
  assert.ok(hard <= 1);
});

test('un calcul raté revient après deux autres', () => {
  const deck = new QuestionDeck([2, 3, 4, 5, 6, 7, 8, 9, 10], mulberry32(9), {}, 4);
  deck.next(1);
  deck.scheduleRetry({ a: 7, b: 8 });
  const k1 = deck.next(1);
  const k2 = deck.next(1);
  const k3 = deck.next(1);
  assert.notEqual(factKey(k1.a, k1.b), '7x8');
  assert.notEqual(factKey(k2.a, k2.b), '7x8');
  assert.equal(factKey(k3.a, k3.b), '7x8');
});

test('les faits mal connus reviennent plus souvent', () => {
  const m: Mastery = {};
  for (let i = 0; i < 3; i++) recordAnswer(m, { a: 6, b: 7 }, false, 9, 4);
  const deck = new QuestionDeck([6], mulberry32(11), m, 4);
  let count = 0;
  for (let i = 0; i < 400; i++) {
    const f = deck.next(1);
    if (factKey(f.a, f.b) === '6x7') count++;
  }
  assert.ok(count > 400 / 10 * 1.5, `6×7 posé ${count} fois`);
});

test('validation automatique au bon nombre de chiffres', () => {
  assert.equal(isEntryComplete('5', { a: 7, b: 8 }), false);
  assert.equal(isEntryComplete('56', { a: 7, b: 8 }), true);
  assert.equal(isEntryComplete('8', { a: 2, b: 4 }), true);
  assert.equal(isEntryComplete('10', { a: 10, b: 10 }), false);
  assert.equal(isEntryComplete('100', { a: 10, b: 10 }), true);
  assert.equal(answerOf({ a: 9, b: 6 }), 54);
});

test('barème : rapidité et multiplicateur', () => {
  assert.equal(answerPoints(0, 10, 1), 200);
  assert.equal(answerPoints(10, 10, 1), 100);
  assert.equal(answerPoints(20, 10, 1), 100);
  assert.equal(answerPoints(5, 10, 3), 450);
  assert.deepEqual([0, 2, 3, 5, 6, 9, 20].map(comboMultiplier), [1, 1, 2, 2, 3, 4, 4]);
});

test('combo : seules les réponses rapides comptent ; ébullition au 6e éclair', () => {
  const run = new Run('aventure', 'express');
  run.onCorrect(2, 9, 0);
  run.onCorrect(2, 9, 1);
  assert.equal(run.combo, 2);
  run.onCorrect(6, 9, 2); // lente
  assert.equal(run.combo, 0);
  let boil = false;
  for (let i = 0; i < BOIL_COMBO; i++) boil = run.onCorrect(1, 9, 3 + i).startBoil || boil;
  assert.ok(boil);
  assert.ok(run.boiling(9));
  const r = run.onCorrect(1, 9, 9.5);
  assert.equal(r.multiplier, 3 * 2);
});

test('wagons : sacrifiés puis fin de partie ; entraînement sans fin', () => {
  const run = new Run('aventure', 'promenade');
  for (let i = 0; i < START_WAGONS; i++) assert.equal(run.onFail({ a: 3, b: 4 }).gameOver, false);
  assert.equal(run.wagons, 0);
  assert.equal(run.onRescue().newWagon, true);
  assert.equal(run.onFail({ a: 3, b: 4 }).gameOver, false);
  assert.equal(run.onFail({ a: 3, b: 4 }).gameOver, true);
  assert.equal(run.missed.size, 1);
  const training = new Run('entrainement', 'promenade');
  for (let i = 0; i < 10; i++) assert.equal(training.onFail({ a: 3, b: 4 }).gameOver, false);
});

test('le temps disponible reste raisonnable jusqu\'au bout', () => {
  for (const d of ['promenade', 'express', 'bolide'] as const) {
    for (const s of [0, 2000, 10000]) {
      assert.ok(referenceTime(d, s) >= 4.5);
      assert.ok(cycleLength(d, s) > 90 && cycleLength(d, s) < 180, `${d} ${s} ${cycleLength(d, s)}`);
    }
  }
});

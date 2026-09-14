import test from 'node:test';
import assert from 'node:assert/strict';

import { advanceProgress, computeTargetPercent } from '../src/lib/progressLogic.js';

test('progres selalu dimulai dari 1 persen', () => {
  assert.equal(advanceProgress(0, 15, false, 0), 1);
});

test('penyelesaian bergerak satu persen demi satu persen sampai 100', () => {
  let value = 30;
  const seen = [];
  while (value < 100) {
    value = advanceProgress(value, 100, true, 0);
    seen.push(value);
  }

  assert.deepEqual(seen, Array.from({ length: 70 }, (_, index) => index + 31));
});

test('progres aktif bergerak tepat satu persen per tick', () => {
  assert.equal(advanceProgress(1, 15, false, 1), 2);
  assert.equal(advanceProgress(14, 15, false, 2), 15);
});

test('target tahap done tepat 100 persen', () => {
  assert.equal(computeTargetPercent({ stage: 'done', step: 2, max_steps: 6 }), 100);
});

test('progres aktif tidak pernah mundur ketika target tahap berubah', () => {
  assert.equal(advanceProgress(65, 32, false, 1), 65);
});

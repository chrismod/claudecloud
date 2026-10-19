// Jedes Level muss mit seiner Referenzlösung gewinnbar sein,
// und die typischen Fehlversuche dürfen nicht gewinnen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/levels.js';
import { SOLUTIONS } from './solutions.js';
import { play } from './harness.js';

test('jedes Level hat eine eindeutige id und eine Lösung', () => {
  const ids = LEVELS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(SOLUTIONS[id], `Lösung für ${id}`);
  assert.ok(LEVELS.length >= 20);
});

for (const [i, level] of LEVELS.entries()) {
  const sol = SOLUTIONS[level.id];
  test(`Level ${i + 1} (${level.name})`, () => {
    const r = play(level, sol.solve);
    assert.equal(r.state, 'won', `Referenzlösung: ${r.log.join('; ')}`);
    assert.ok(r.used <= level.par + 1e-6, `Lösung verbraucht ${r.used.toFixed(2)} > par ${level.par}`);
    assert.ok(level.par <= level.cheese);
    for (const a of sol.also || []) assert.equal(play(level, a).state, 'won', `Alternative Lösung: ${JSON.stringify(a)}`);
    for (const f of sol.fail || []) assert.notEqual(play(level, f).state, 'won', `Fehlversuch gewinnt: ${JSON.stringify(f)}`);
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClimate, DAYS_PER_SEASON } from '../src/game/climate.js';
import { rng } from '../src/noise.js';
import { createField } from '../src/world/field.js';
import { createStore } from '../src/world/store.js';
import { createSim } from '../src/world/sim.js';

test('Jahreszeiten folgen den Tagen und blenden weich über', () => {
  const c = createClimate(null, rng(1));
  assert.equal(c.seasonWeights(0.3).name, 'Frühling');
  for (let d = 0; d < DAYS_PER_SEASON; d++) c.newDay();
  assert.equal(c.seasonWeights(0.3).name, 'Sommer');
  // kurz vor Ende der Jahreszeit: Mischung
  for (let d = 0; d < DAYS_PER_SEASON - 1; d++) c.newDay();
  const w = c.seasonWeights(0.95).weights;
  assert.ok(w[1] > 0 && w[2] > 0, JSON.stringify(w));
  assert.ok(Math.abs(w.reduce((a, b) => a + b) - 1) < 1e-9);
  for (let d = 0; d < DAYS_PER_SEASON + 1; d++) c.newDay(); // Tag 9 = Winter
  assert.equal(c.seasonWeights(0.3).name, 'Winter');
});

test('Wetter wechselt; im Winter schneit es statt zu regnen, Schnee liegt und taut', () => {
  const c = createClimate({ day: DAYS_PER_SEASON * 3 }, rng(3));
  const seen = new Set();
  for (let k = 0; k < 4000; k++) {
    c.update(0.5, { dayTime: 0.4, night: 0 });
    seen.add(c.state.weather);
  }
  assert.ok(!seen.has('rain') && !seen.has('storm'), [...seen].join());
  assert.ok(seen.has('snow'));
  c.setWeather('snow');
  for (let k = 0; k < 400; k++) c.update(0.5, { dayTime: 0.4, night: 0 });
  assert.ok(c.factors(0.4).snow > 0.5, 'kein Schnee liegt');
  assert.ok(c.factors(0.4).freeze > 0.5, 'Seen frieren nicht');
  // Frühling: taut
  const sp = createClimate({ day: 0, snow: 1 }, rng(4));
  sp.setWeather('clear');
  for (let k = 0; k < 600; k++) sp.update(0.5, { dayTime: 0.4, night: 0 });
  assert.ok(sp.factors(0.4).snow < 0.2);
});

test('Regen lässt schneller wachsen und bremst die Fäulnis; Gewitter bringt Blitze', () => {
  const c = createClimate(null, rng(5));
  c.setWeather('rain');
  const f = c.factors(0.4);
  assert.ok(f.grow > 1.5 && f.rot < 0.8);
  c.setWeather('storm');
  let bolts = 0;
  for (let k = 0; k < 400; k++) bolts += c.update(0.1, { dayTime: 0.9, night: 1 }).filter((e) => e.type === 'lightning').length;
  assert.ok(bolts > 0);
});

test('Simulation: im Regen breitet sich Myzel schneller aus, gefrorene Seen lassen Fäulnis durch', () => {
  const field = createField(9);
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k), key: (i) => [...mem.keys()][i], get length() { return mem.size; } };
  const run = (grow) => {
    const sim = createSim(field, createStore(9, st));
    sim.ensureWindow(3, 3, true);
    sim.climate.grow = grow;
    sim.paint(3 * 32 + 16, 3 * 32 + 16, 4, 1, 0);
    for (let k = 0; k < 600; k++) sim.step(0.2);
    return sim.healedInWindow();
  };
  const dry = run(1);
  const wet = run(1.8);
  assert.ok(wet > dry * 1.15, `${dry} → ${wet}`);
});

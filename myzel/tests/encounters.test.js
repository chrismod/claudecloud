import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createField } from '../src/world/field.js';
import { createStore } from '../src/world/store.js';
import { createSim } from '../src/world/sim.js';
import { createEncounters } from '../src/game/encounters.js';
import { rng } from '../src/noise.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

function world(seed = 2024) {
  const field = createField(seed);
  const sim = createSim(field, createStore(seed, memStorage()));
  sim.ensureWindow(0, 0, true);
  const enc = createEncounters({ field, sim, rand: rng(7) });
  return { field, sim, enc };
}

const ctxOf = (players, extra = {}) => ({
  players,
  focus: { x: players[0].x, z: players[0].z },
  night: 0,
  nights: 0,
  nests: [],
  awakeSites: [{ x: 0, z: 0, id: '0,0' }],
  thread: null,
  ...extra,
});

test('Verirrte Lichter: erscheinen, folgen und kommen heim', () => {
  const { enc } = world();
  const p = { i: 0, x: 0, z: 20, weaving: false };
  const all = [];
  for (let k = 0; k < 60; k++) all.push(...enc.update(0.2, ctxOf([p])));
  const w = enc.wisps[0];
  assert.ok(w, 'kein Licht erschienen');
  assert.ok(Math.hypot(w.x, w.z) > 40);
  // Spieler fliegt hin
  w.state = 'lost';
  p.x = w.x + 1;
  p.z = w.z;
  const ev = enc.update(0.1, ctxOf([p]));
  assert.ok(ev.some((e) => e.type === 'wispJoin'));
  // zurück zum Heimatbaum, das Licht folgt
  let home = false;
  for (let k = 0; k < 400 && !home; k++) {
    const dx = -p.x, dz = 5 - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) (p.x += (dx / d) * 1.5), (p.z += (dz / d) * 1.5);
    home = enc.update(0.1, ctxOf([p])).some((e) => e.type === 'wispHome');
  }
  assert.ok(home, 'Licht kam nicht heim');
});

test('Moderlinge: nachts aus Moderherzen, fressen Myzel, vergehen durch den Puls', () => {
  const { field, sim, enc } = world(21);
  const nest = field.nestsNear(300, 300, 400).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  sim.ensureWindow(Math.floor(nest.x / 32), Math.floor(nest.z / 32), true);
  const p = { i: 0, x: nest.x + 40, z: nest.z, weaving: false };
  sim.paint(nest.x + 15, nest.z, 6, 1, 0);
  const ctx = () => ctxOf([p], { night: 1, nests: [nest], awakeSites: [] });
  let spawned = 0;
  let eaten = 0;
  for (let k = 0; k < 300; k++)
    for (const e of enc.update(0.1, ctx())) {
      if (e.type === 'moderSpawn') spawned++;
      if (e.type === 'moderEat') eaten++;
    }
  assert.ok(spawned >= 2, 'keine Moderlinge');
  assert.ok(eaten > 0, 'nichts gefressen');
  const m = enc.moderlings.find((q) => q.state === 'hunt');
  const ev = enc.pulse(m.x, m.z, 5, 0);
  const ev2 = m.hp > 0 ? enc.pulse(m.x, m.z, 5, 0) : [];
  assert.ok([...ev, ...ev2].some((e) => e.type === 'moderKilled'));
  // bei Tag graben sie sich ein
  for (let k = 0; k < 40; k++) enc.update(0.1, { ...ctx(), night: 0 });
  assert.ok(enc.moderlings.every((q) => q.state !== 'hunt'));
});

test('Sternspore: fällt, landet, lässt sich fangen', () => {
  const { enc } = world();
  const p = { i: 0, x: 0, z: 10, weaving: false };
  enc._forceStar(0);
  let ev = enc.update(0.1, ctxOf([p]));
  assert.ok(ev.some((e) => e.type === 'starIncoming'));
  for (let k = 0; k < 35; k++) ev = enc.update(0.1, ctxOf([p]));
  assert.equal(enc.star.state, 'landed');
  p.x = enc.star.x;
  p.z = enc.star.z;
  ev = enc.update(0.1, ctxOf([p]));
  const c = ev.find((e) => e.type === 'starCaught');
  assert.ok(c && c.power && c.power.name);
  assert.equal(enc.star, null);
});

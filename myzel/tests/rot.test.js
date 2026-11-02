import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createField } from '../src/world/field.js';
import { createStore, encodeChunk, decodeChunk } from '../src/world/store.js';
import { createSim } from '../src/world/sim.js';

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

function setup(seed = 21) {
  const field = createField(seed);
  const nest = field.nestsNear(300, 300, 400).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  assert.ok(nest, 'kein Moderherz gefunden');
  const sim = createSim(field, createStore(seed, memStorage()));
  sim.ensureWindow(Math.floor(nest.x / 32), Math.floor(nest.z / 32), true);
  sim.setSources([nest]);
  return { field, sim, nest };
}

// Größter Radius, in dem die Fäulnis stark ist (B > 0.4), über 8 Richtungen
function reach(sim, nest) {
  let r = 0;
  for (let a = 0; a < 8; a++)
    for (let d = 0; d < 110; d++) {
      const s = sim.sample(nest.x + Math.cos(a * 0.785) * d, nest.z + Math.sin(a * 0.785) * d);
      if (s.B > 0.4) r = Math.max(r, d);
    }
  return r;
}

test('Moderherzen: keines am Heimatbaum, alle trocken', () => {
  const f = createField(3);
  const list = f.nestsNear(0, 0, 900);
  assert.ok(list.length > 10, 'zu wenige Moderherzen: ' + list.length);
  for (const n of list) {
    assert.ok(Math.hypot(n.x, n.z) > 100);
    assert.ok(f.height(n.x, n.z) > 0.5);
  }
});

test('Fäulnis reicht nachts weiter als am Tag und zieht sich am Tag zurück', () => {
  const { sim, nest } = setup();
  sim.night = 0;
  for (let k = 0; k < 300; k++) sim.step(0.2);
  const day = reach(sim, nest);
  sim.night = 1;
  for (let k = 0; k < 900; k++) sim.step(0.2); // 3 Minuten Nacht
  const nightR = reach(sim, nest);
  sim.night = 0;
  for (let k = 0; k < 1500; k++) sim.step(0.2); // 5 Minuten Tag
  const after = reach(sim, nest);
  console.log('Reichweite Tag/Nacht/danach', day, nightR, after);
  assert.ok(day >= 8 && day <= 30, 'Tag: ' + day);
  assert.ok(nightR > day * 1.8, 'Nacht: ' + nightR);
  assert.ok(after < nightR, 'zieht sich nicht zurück: ' + after);
});

test('Fäulnis frisst Myzel; Läutern und Mutterbaum-Schutz helfen', () => {
  const { sim, nest } = setup();
  const x = nest.x + 12, z = nest.z;
  sim.paint(x, z, 4, 1, 0);
  const m0 = sim.sample(x, z).M;
  sim.night = 1;
  for (let k = 0; k < 300; k++) sim.step(0.2);
  const m1 = sim.sample(x, z).M;
  assert.ok(m1 < m0 - 0.3, `Myzel nicht gefressen: ${m0} → ${m1}`);
  const removed = sim.cleanse(x, z, 6, 1);
  assert.ok(removed > 5 && sim.sample(x, z).B < 0.05);
  // Schutz eines erwachten Mutterbaums direkt daneben
  sim.setProtectors([{ x: nest.x + 20, z: nest.z }]);
  for (let k = 0; k < 300; k++) sim.step(0.2);
  assert.ok(sim.sample(nest.x + 20, nest.z).B < 0.05, 'Schutz wirkt nicht');
});

test('Fäulnis wird gespeichert, alte Spielstände ohne Fäulnis bleiben lesbar', () => {
  const L = new Uint8Array(1024).fill(10), M = new Uint8Array(1024), H = new Uint8Array(1024), B = new Uint8Array(1024);
  B[5] = 200;
  assert.equal(decodeChunk(encodeChunk({ L, M, H, B })).B[5], 200);
  // altes Format: nur drei Kanäle
  const old = encodeChunk({ L, M, H, B: new Uint8Array(0) });
  const d = decodeChunk(old);
  assert.equal(d.L[3], 10);
  assert.equal(d.B[5], 0);
});

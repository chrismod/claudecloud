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

test('Welt ist deterministisch', () => {
  const a = createField(42);
  const b = createField(42);
  const c = createField(43);
  for (const [x, z] of [[0, 0], [123.4, -88], [-5000, 7777]]) {
    assert.equal(a.height(x, z), b.height(x, z));
    assert.equal(a.fertility(x, z), b.fertility(x, z));
  }
  assert.notEqual(a.height(500, 500), c.height(500, 500));
});

test('Mutterbäume stehen trocken, Heimatbaum im Ursprung', () => {
  const f = createField(7);
  assert.equal(f.site(0, 0).x, 0);
  for (let gx = -3; gx <= 3; gx++)
    for (let gz = -3; gz <= 3; gz++) {
      const s = f.site(gx, gz);
      assert.ok(f.height(s.x, s.z) > 2, `Baum ${s.id} steht im Wasser`);
    }
});

test('Chunk-Kodierung ist verlustfrei', () => {
  const L = new Uint8Array(1024), M = new Uint8Array(1024), H = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) {
    L[i] = (i * 7) & 255;
    M[i] = i > 500 ? 200 : 0;
    H[i] = 128;
  }
  const d = decodeChunk(encodeChunk({ L, M, H }));
  assert.deepEqual(d.L, L);
  assert.deepEqual(d.M, M);
  assert.deepEqual(d.H, H);
  // gleichförmige Chunks werden klein
  const flat = encodeChunk({ L: new Uint8Array(1024).fill(9), M: new Uint8Array(1024), H: new Uint8Array(1024).fill(128) });
  assert.ok(flat.length < 60, `zu groß: ${flat.length}`);
});

test('Ohne Spieler bleibt die erschöpfte Welt stabil', () => {
  const f = createField(11);
  const sim = createSim(f, createStore(11, memStorage()));
  sim.ensureWindow(10, 10, true);
  const before = Float32Array.from(sim.M);
  for (let k = 0; k < 50; k++) sim.step(0.2);
  let diff = 0;
  for (let i = 0; i < before.length; i++) diff = Math.max(diff, Math.abs(before[i] - sim.M[i]));
  assert.ok(diff < 1e-6, `Myzel entstand von selbst: ${diff}`);
});

test('Gesponnenes Myzel bleibt erhalten, wächst und überlebt das Entladen', () => {
  const f = createField(5);
  const storage = memStorage();
  const sim = createSim(f, createStore(5, storage));
  sim.ensureWindow(4, 4, true);
  const x = 4 * 32 + 16, z = 4 * 32 + 16;
  const cost = sim.paint(x, z, 3, 0.9, 1);
  assert.ok(cost > 5);
  for (let k = 0; k < 100; k++) sim.step(0.2);
  const s = sim.sample(x, z);
  assert.ok(s.M > 0.85 && s.L > 0.5, JSON.stringify(s));
  assert.ok(s.H > 0.9);
  // weit weg, dann zurück
  sim.ensureWindow(40, 40, true);
  sim.persist();
  const sim2 = createSim(f, createStore(5, storage));
  sim2.ensureWindow(4, 4, true);
  const s2 = sim2.sample(x, z);
  assert.ok(Math.abs(s2.M - s.M) < 0.01 && Math.abs(s2.L - s.L) < 0.01, JSON.stringify({ s, s2 }));
});

test('Lichtwelle läuft durchs Myzel und nicht darüber hinaus', () => {
  const f = createField(5);
  const sim = createSim(f, createStore(5, memStorage()));
  sim.ensureWindow(0, 0, true);
  sim.paintLine(-60, 40, -20, 40, 1.5, 1, 0);
  sim.excite(-60, 40, 1);
  let reached = false;
  for (let k = 0; k < 60; k++) {
    sim.stepGlow(1 / 15);
    if (sim.G[sim.idx(-21, 40)] > 0.5) reached = true;
  }
  assert.ok(reached, 'Welle kam nicht an');
  // neben der Linie leuchtet nichts
  assert.equal(sim.G[sim.idx(-40, 30)], 0);
});

test('Ausbreitung: nur fruchtbarer Boden, langsam', () => {
  const f = createField(9);
  const sim = createSim(f, createStore(9, memStorage()));
  sim.ensureWindow(3, 3, true);
  const cx = 3 * 32 + 16, cz = 3 * 32 + 16;
  sim.paint(cx, cz, 4, 1, 0);
  const n0 = sim.healedInWindow();
  for (let k = 0; k < 5 * 60 * 2; k++) sim.step(0.2); // 2 Minuten
  const n1 = sim.healedInWindow();
  console.log('belebt vorher/nachher', n0, n1);
  assert.ok(n1 >= n0);
  assert.ok(n1 < n0 + 4000, 'Ausbreitung zu schnell');
});

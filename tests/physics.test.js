// Physik-Regressionstests
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/physics/world.js';

function draw(world, from, to, seconds = 0.5) {
  const a = world.pickAnchor(from.x, from.y, 0.2);
  assert.ok(a, 'Anker gefunden');
  world.beginStrand(a);
  const frames = Math.round(seconds * 60);
  for (let f = 1; f <= frames; f++) {
    const t = f / frames;
    world.dragTo(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    world.step();
  }
  return world.endStrand(to.x, to.y);
}

function run(world, seconds) {
  for (let f = 0; f < seconds * 60; f++) {
    world.step();
    if (world.olive.state === 'won' || world.olive.state === 'lost') break;
  }
}

test('Fäden ziehen sich beim Abkühlen straff und behalten ihre Form', () => {
  const w = new World({ anchors: [{ x: -2.75, y: 0 }, { x: 2.75, y: 0 }], olive: { x: -8, y: 5 }, cheese: 9 });
  draw(w, w.anchors[0], w.anchors[1]);
  run(w, 12);
  assert.equal(w.strands.length, 1);
  const s = w.strands[0];
  assert.equal(s.T, 0);
  const mid = s.particles[Math.floor(s.particles.length / 2)];
  assert.ok(mid.y > -0.2, `Durchhang ${mid.y}`);
});

test('Käsevorrat begrenzt die Fadenlänge, im Leeren losgelassen gibt es ihn zurück', () => {
  const w = new World({ anchors: [{ x: 0, y: 0 }], olive: { x: -8, y: 5 }, cheese: 2 });
  w.beginStrand(w.anchors[0]);
  for (let f = 1; f <= 30; f++) {
    w.dragTo((6 * f) / 30, 0);
    w.step();
  }
  assert.ok(w.used <= 2 + 1e-9);
  assert.equal(w.cheeseLeft, 0);
  assert.equal(w.endStrand(6, 0).result, 'discarded');
  assert.equal(w.strands.length, 0);
  assert.equal(w.cheeseLeft, 2);
});

test('Schneiden teilt einen Faden', () => {
  const w = new World({ anchors: [{ x: -2, y: 0 }, { x: 2, y: 0 }], olive: { x: -8, y: 5 }, cheese: 9 });
  draw(w, w.anchors[0], w.anchors[1]);
  assert.equal(w.cut(0, 1, 0, -1), 1);
  assert.equal(w.strands.length, 2);
});

test('Schnelles, ruckartiges Ziehen reißt den Faden nicht', () => {
  const w = new World({ anchors: [{ x: -4, y: 2 }, { x: 4, y: -2 }], olive: { x: -8, y: 5 }, cheese: 12 });
  w.beginStrand(w.anchors[0]);
  // Cursor springt in großen Sätzen zum Ziel, teils mehrere Sprünge vor einem Physikschritt
  for (const x of [-3.4, -2.8, -2.2, -1, 0.5, 2, 3, 4]) {
    w.dragTo(x, 2 - (x + 4) / 2);
    if (x !== -2.8 && x !== 0.5) w.step();
  }
  const r = w.endStrand(4, -2);
  assert.equal(r.result, 'anchor');
  assert.equal(w.strands.length, 1);
});

test('Ein abgeschnittenes Fadenstück fällt von der Olive ab', () => {
  const w = new World({ anchors: [{ x: 0, y: 4 }], olive: { x: 0, y: 2 }, strands: [{ from: 0, to: 'olive', T: 0 }], cheese: 0 });
  w.releaseOlive();
  for (let i = 0; i < 30; i++) w.step();
  assert.equal(w.cut(-0.5, 3, 0.5, 3), 1);
  const stuckToOlive = w.strands.filter((s) => s.particles.some((p) => p.pin?.kind === 'olive'));
  assert.equal(stuckToOlive.length, 0);
});

test('Aufgezeichnetes ruckeliges Ziehen im Browser (Level „Il cancello“) reißt die Brücke nicht', async () => {
  const { readFileSync } = await import('node:fs');
  const { LEVELS } = await import('../src/levels.js');
  // Abfolge von Mausbewegungen und Physikschritten, aufgezeichnet bei niedriger Bildrate
  const rec = JSON.parse(readFileSync(new URL('./fixtures/drag-il-cancello.json', import.meta.url), 'utf8'));
  const w = new World(LEVELS.find((l) => l.id === 'il-cancello'));
  for (const [op, a, b, c] of rec) {
    if (op === 'begin') w.beginStrand(w.anchors[a], b, c);
    else if (op === 'drag') w.dragTo(a, b);
    else w.step();
  }
  assert.ok(w.drawing, 'Faden wird noch gezogen');
  // Der Faden besteht aus echtem Käse (nicht nur aus gedehnter Länge) …
  const s = w.drawing;
  const thinnest = Math.min(...s.vol.map((v, i) => v / (s.rest[i] * Math.PI * 0.075 * 0.075)));
  assert.ok(thinnest > 0.8, `dünnste Stelle ${thinnest.toFixed(2)} des Normalquerschnitts`);
  // … und übersteht das Anheften und die ersten Sekunden
  assert.equal(w.endStrand(w.anchors[2].x, w.anchors[2].y).result, 'anchor');
  for (let i = 0; i < 180; i++) w.step();
  assert.ok(!w.drainEvents().some((e) => e.type === 'snap'));
  assert.equal(w.strands.length, 2);
});

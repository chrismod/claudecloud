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

test('Käsevorrat begrenzt die Fadenlänge', () => {
  const w = new World({ anchors: [{ x: 0, y: 0 }], olive: { x: -8, y: 5 }, cheese: 2 });
  draw(w, w.anchors[0], { x: 6, y: 0 });
  assert.ok(w.used <= 2 + 1e-9);
  assert.equal(w.cheeseLeft, 0);
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
  // Cursor springt in drei großen Sätzen zum Ziel
  for (const x of [-1, 2, 4]) {
    w.dragTo(x, 2 - (x + 4) / 2);
    w.step();
  }
  const r = w.endStrand(4, -2);
  assert.equal(r.result, 'anchor');
  assert.equal(w.strands.length, 1);
});

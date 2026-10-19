// Regressionstests für Physik und Level-Lösbarkeit: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/physics/world.js';
import { LEVELS } from '../src/levels.js';

const level = (id) => LEVELS.find((l) => l.id === id);

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

function cutAttached(world) {
  const s = world.strands.find((s) => s.particles.some((p) => p.pin?.kind === 'olive'));
  const k = Math.floor(s.particles.length / 2);
  const m = s.particles[k];
  const a = s.particles[k - 1];
  const dx = m.x - a.x;
  const dy = m.y - a.y;
  const L = Math.hypot(dx, dy);
  return world.cut(m.x - (dy / L) * 0.5, m.y + (dx / L) * 0.5, m.x + (dy / L) * 0.5, m.y - (dx / L) * 0.5);
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

test('Level 1: abgekühlte Brücke trägt, frisch gezogene nicht', () => {
  const lvl = level('primo-filo');
  for (const [wait, expected] of [[0, 'lost'], [3, 'won']]) {
    const w = new World(lvl);
    draw(w, lvl.anchors[0], lvl.anchors[1]);
    run(w, wait);
    w.releaseOlive();
    run(w, 20);
    assert.equal(w.olive.state, expected, `Wartezeit ${wait}s`);
  }
});

test('Level 2: warmer Käse fängt, kalter bricht beim Aufprall', () => {
  const lvl = level('la-rete');
  for (const [wait, expected] of [[0.5, 'won'], [9, 'lost']]) {
    const w = new World(lvl);
    draw(w, lvl.anchors[0], lvl.anchors[1]);
    run(w, wait);
    w.releaseOlive();
    run(w, 20);
    assert.equal(w.olive.state, expected, `Wartezeit ${wait}s`);
  }
});

test('Level 3: Reihenfolge – erst Brücke, dann Netz', () => {
  const lvl = level('due-ponti');
  const good = new World(lvl);
  draw(good, lvl.anchors[0], lvl.anchors[1]);
  run(good, 3);
  draw(good, lvl.anchors[2], lvl.anchors[3]);
  good.releaseOlive();
  run(good, 20);
  assert.equal(good.olive.state, 'won');

  const bad = new World(lvl);
  draw(bad, lvl.anchors[0], lvl.anchors[1]);
  draw(bad, lvl.anchors[2], lvl.anchors[3]);
  run(bad, 9);
  bad.releaseOlive();
  run(bad, 20);
  assert.equal(bad.olive.state, 'lost');
});

test('Level 4: Schaukeln und im richtigen Moment schneiden', () => {
  const lvl = level('altalena');
  const w = new World(lvl);
  const r = draw(w, lvl.anchors[0], { x: lvl.olive.x, y: lvl.olive.y + 0.1 });
  assert.equal(r.result, 'olive');
  run(w, 9);
  w.releaseOlive();
  run(w, 2.4);
  assert.equal(cutAttached(w), 1);
  run(w, 8);
  assert.equal(w.olive.state, 'won');
});

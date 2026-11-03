import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgress, rankInfo, RANKS } from '../src/game/progress.js';

test('Ränge steigen mit Erfahrung, auch über den letzten hinaus', () => {
  assert.equal(rankInfo(0).name, 'Keimling');
  assert.equal(rankInfo(RANKS[2].xp).name, RANKS[2].name);
  const last = RANKS[RANKS.length - 1].xp;
  assert.equal(rankInfo(last + 5000).name, 'Ältester II');
  assert.ok(rankInfo(500).frac > 0 && rankInfo(500).frac < 1);
});

test('Aufträge entstehen, werden erfüllt und belohnt; Fluss vervielfacht', () => {
  const ev = [];
  const p = createProgress(null, (t, d) => ev.push([t, d]));
  p.update(0.1, { dayTime: 0.4, night: 0, players: 2, hasNest: true, hasTree: true });
  const open = p.state.objectives;
  assert.ok(open.length >= 3, 'zu wenige Aufträge');
  assert.ok(open.some((o) => o.timed && o.text.startsWith('Vor Einbruch der Nacht')));
  // Fluss
  for (let i = 0; i < 20; i++) p.healed(20);
  assert.ok(p.multiplier >= 3, 'Fluss ' + p.multiplier);
  const heal = open.find((o) => o.kind === 'heal');
  p.healed(heal.goal);
  assert.ok(ev.some(([t, d]) => t === 'objective' && d.o.kind === 'heal'));
  assert.ok(ev.some(([t]) => t === 'rank'), 'kein Rangaufstieg');
});

test('Zeitgebundene Aufträge laufen bei Einbruch der Nacht ab', () => {
  const ev = [];
  const p = createProgress(null, (t, d) => ev.push([t, d]));
  p.update(0.1, { dayTime: 0.5, night: 0, players: 1, hasNest: false, hasTree: false });
  const timed = p.state.objectives.find((o) => o.timed);
  assert.ok(p.timeLeft(timed, 0.6) > 0.1);
  p.update(0.1, { dayTime: 0.74, night: 0, players: 1 });
  assert.ok(!ev.some(([t]) => t === 'failed'));
  p.update(0.1, { dayTime: 0.76, night: 0.2, players: 1 });
  assert.ok(ev.some(([t]) => t === 'failed'), 'nicht abgelaufen');
  // nachts entsteht der Nacht-Auftrag
  p.update(0.1, { dayTime: 0.9, night: 1, players: 1 });
  assert.ok(p.state.objectives.some((o) => o.timed && (o.kind === 'rot' || o.kind === 'moderling')));
});

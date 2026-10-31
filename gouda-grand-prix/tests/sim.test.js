// Simulation headless prüfen: Streckenformen, komplette KI-Rennen, alle Gegenstände, Runden, Bande
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, WALL } from '../src/sim/track.js';
import { TRACKS } from '../src/sim/tracks.js';
import { DRIVERS, ITEMS } from '../src/sim/config.js';
import { createRace, finalResults, DT } from '../src/sim/race.js';

const allAI = () => DRIVERS.map((d) => ({ driver: d.id, human: -1 }));

test('Strecken kreuzen sich nicht und sind fahrbar', () => {
  for (const def of TRACKS) {
    const t = buildTrack(def);
    assert.ok(t.length > 1000 && t.length < 2000, `${def.name}: Länge ${t.length}`);
    let minSep = Infinity;
    for (let i = 0; i < t.n; i += 3)
      for (let j = 0; j < t.n; j += 3) {
        let gap = Math.abs(i - j);
        gap = Math.min(gap, t.n - gap);
        if (gap < 90) continue;
        minSep = Math.min(minSep, Math.hypot(t.x[i] - t.x[j], t.z[i] - t.z[j]));
      }
    assert.ok(minSep > 2 * WALL + 8, `${def.name}: Abschnitte nur ${minSep.toFixed(1)} m auseinander`);
  }
});

for (const def of TRACKS) {
  test(`KI fährt ${def.name} komplett`, () => {
    const race = createRace({ trackDef: def, entrants: allAI(), seed: 3 });
    let steps = 0;
    while (race.phase !== 'done' && steps < 120 * 360) {
      race.step(DT);
      race.events.length = 0;
      steps++;
      for (const k of race.karts) {
        assert.ok(Number.isFinite(k.x) && Number.isFinite(k.y) && Number.isFinite(k.z), 'Position NaN');
        assert.ok(Math.abs(k.d) < WALL + 0.5, `Kart hinter der Bande: d=${k.d}`);
      }
    }
    assert.equal(race.phase, 'done', 'Rennen nicht beendet');
    assert.ok(race.karts.every((k) => k.finished));
    const res = finalResults(race);
    assert.equal(res.length, 8);
    for (const r of res) assert.equal(r.kart.lapTimes.length, def.laps);
    // Rennen dauert plausibel lange (Rundenzeit 30–75 s)
    for (const r of res) for (const lt of r.kart.lapTimes) assert.ok(lt > 25 && lt < 80, `Rundenzeit ${lt}`);
  });
}

test('alle Gegenstände lassen sich benutzen', () => {
  for (const item of Object.keys(ITEMS)) {
    const race = createRace({ trackDef: TRACKS[0], entrants: [{ driver: 'greta', human: 0 }, ...allAI().slice(1)], seed: 5 });
    for (let i = 0; i < 120 * 8; i++) {
      race.setInput(0, { throttle: 1, steer: 0 });
      race.step(DT);
    }
    const me = race.karts.find((k) => k.human === 0);
    me.item = item;
    me.itemCharges = item === 'turbo' || item === 'triple' ? 3 : 1;
    let fired = 0;
    for (let i = 0; i < 120 * 6; i++) {
      const press = i % 40 < 3;
      race.setInput(0, { throttle: 1, steer: 0, item: press });
      race.step(DT);
      fired += race.events.filter((e) => e.type === 'fire' && e.kart === me).length;
      race.events.length = 0;
    }
    assert.ok(fired > 0 || me.orbit > 0 || !me.item, `${item} wurde nicht benutzt`);
  }
});

test('Rückwärts über die Linie zählt keine Runde', () => {
  const race = createRace({ trackDef: TRACKS[0], entrants: [{ driver: 'greta', human: 0 }], seed: 1 });
  while (race.time < 0) race.step(DT);
  const k = race.karts[0];
  // nach der Linie umdrehen und zurückfahren
  for (let i = 0; i < 120 * 3; i++) {
    race.setInput(0, { throttle: 1, steer: 0 });
    race.step(DT);
  }
  assert.equal(k.lap, 0);
  k.heading += Math.PI;
  k.vx = k.vz = 0;
  for (let i = 0; i < 120 * 8; i++) {
    race.setInput(0, { throttle: 1, steer: 0 });
    race.step(DT);
  }
  assert.ok(k.lap <= 0, `Runde ${k.lap}`);
  assert.ok(k.progress < 0, 'Fortschritt müsste negativ sein');
});

test('Driften lädt Mini-Turbos (KI nutzt sie)', () => {
  const race = createRace({ trackDef: TRACKS[1], entrants: allAI(), seed: 9 });
  const levels = [];
  while (race.time < 60) {
    race.step(DT);
    for (const e of race.events) if (e.type === 'miniTurbo') levels.push(e.level);
    race.events.length = 0;
  }
  assert.ok(levels.length > 5, `nur ${levels.length} Mini-Turbos`);
  assert.ok(levels.some((l) => l >= 2), 'keine orange Stufe erreicht');
});

test('Treffer kosten Käse, der Panzer hält einen ab', () => {
  const race = createRace({ trackDef: TRACKS[0], entrants: [{ driver: 'greta', human: 0 }, { driver: 'emil', human: -1 }], seed: 2 });
  while (race.time < 0.5) race.step(DT);
  const [a, b] = race.karts;
  a.cheese = 5;
  a.shieldT = 5;
  const hitAt = () => race.puddles.push({ id: 999 + race.puddles.length, x: a.x, z: a.z, y: a.y, r: 2.4, life: 10, owner: b, age: 5 });
  hitAt();
  race.step(DT);
  assert.equal(a.cheese, 5);
  assert.equal(a.shieldT, 0);
  a.invulnT = 0;
  hitAt();
  race.step(DT);
  assert.ok(a.cheese < 5 && a.spinT > 0);
});

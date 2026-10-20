import test from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics, replay, Race } from '../shared/sim.js';
import { TRACKS, buildTrack, dailyTrack, trackById } from '../shared/track.js';
import { CHEESES } from '../shared/cheeses.js';
import { encodeInputs, decodeInputs, encodeFrames, decodeFrames } from '../shared/inputs.js';
import { botRun } from './helpers.js';
import { botInput } from '../shared/bot.js';

await initPhysics();

test('Strecken sind reproduzierbar', () => {
  const a = buildTrack(TRACKS['coopers-hill']);
  const b = buildTrack(TRACKS['coopers-hill']);
  assert.deepEqual(a.heights, b.heights);
  assert.deepEqual(a.rocks, b.rocks);
  assert.equal(a.heights.length, (a.nx + 1) * (a.nz + 1));
  assert.ok(a.heightAt(0, 0) > a.heightAt(0, a.finishZ), 'Hang fällt ab');
});

test('Tagesstrecke hängt nur vom Datum ab', () => {
  assert.deepEqual(dailyTrack('2026-10-19'), dailyTrack('2026-10-19'));
  assert.notDeepEqual(dailyTrack('2026-10-19').profile, dailyTrack('2026-10-20').profile);
  assert.equal(trackById('daily-2026-10-19').id, 'daily-2026-10-19');
  assert.equal(trackById('daily-nope'), null);
});

test('Eingaben überstehen Kodierung', () => {
  const ticks = [];
  for (let i = 0; i < 500; i++) ticks.push({ steer: ((i / 37) | 0) % 2 ? -100 + (i % 201) : 0, flags: i % 90 === 0 ? 1 : 0 });
  assert.deepEqual(decodeInputs(encodeInputs(ticks)), ticks);
  assert.throws(() => decodeInputs(encodeInputs(ticks), 100), /zu lang/);
  assert.throws(() => decodeInputs('AAA'), /Ungültig/);
  const frames = [1.5, 2, -3, 0, 0, 0, 1];
  assert.deepEqual([...decodeFrames(encodeFrames(frames))], frames);
});

for (const def of [TRACKS['coopers-hill'], dailyTrack('2026-10-19')]) {
  for (const cheese of Object.keys(CHEESES)) {
    test(`Bot kommt ins Ziel, Nachspielen ist identisch: ${def.id} / ${cheese}`, () => {
      const track = buildTrack(def);
      const run = botRun(track, cheese);
      assert.ok(run.finished, 'im Ziel');
      assert.ok(run.time > 10 && run.time < 60, `plausible Zeit ${run.time}`);
      const r = replay(track, cheese, decodeInputs(encodeInputs(run.inputs)));
      assert.equal(r.time, run.time);
      assert.equal(r.integrity, run.integrity);
      assert.ok(run.integrity > 0.3, `Laib hält: ${run.integrity}`);
    });
  }
}

test('Nichtstun führt nicht schneller ins Ziel als Fahren', () => {
  const track = buildTrack(TRACKS['coopers-hill']);
  const idle = replay(track, 'gloucester', Array.from({ length: 60 * 40 }, () => ({ steer: 0, flags: 0 })));
  const bot = botRun(track, 'gloucester');
  assert.ok(!idle.finished || idle.time >= bot.time - 0.5);
});

test('Harte Stöße kosten Integrität, bei 0 zerbricht der Laib', () => {
  const track = buildTrack(TRACKS['coopers-hill']);
  const race = new Race(track, 'gloucester');
  race.integrity = 0.02;
  let broke = null;
  while (!race.finished && !race.broken && race.tick < 60 * 60) {
    const inp = botInput(race);
    race.step(inp.steer, inp.flags);
    for (const e of race.events) if (e.type === 'break') broke = e;
    race.events.length = 0;
  }
  assert.ok(race.broken && broke, 'zerbrochen');
  assert.equal(race.integrity, 0);
  const t = race.tick;
  race.step(0, 0);
  assert.equal(race.tick, t, 'zerbrochener Laib fährt nicht weiter');
  race.free();
});

test('Seitlicher Aufprall schadet mehr als eine gleich harte Landung', () => {
  const track = buildTrack(TRACKS['coopers-hill']);
  const hit = (vel) => {
    const race = new Race(track, 'parmigiano');
    const b = race.body;
    const p = track.rocks[0];
    if (vel.y) b.setTranslation({ x: p.x + 4, y: track.heightAt(p.x + 4, p.z) + 3, z: p.z }, true);
    else b.setTranslation({ x: p.x, y: p.y + 0.1, z: p.z - p.radius - 1 }, true);
    b.setLinvel(vel, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (let i = 0; i < 40; i++) race.step(0, 0);
    const lost = 1 - race.integrity;
    race.free();
    return lost;
  };
  const lateral = hit({ x: 0, y: 0, z: 22 });
  const landing = hit({ x: 0, y: -22, z: 0 });
  assert.ok(lateral > 0, 'Felsen kostet etwas');
  assert.ok(lateral > landing, `Felsen ${lateral} > Landung ${landing}`);
});

test('Zurücksetzen springt zum letzten Kontrollpunkt', () => {
  const track = buildTrack(TRACKS['coopers-hill']);
  const race = new Race(track, 'gloucester');
  for (let i = 0; i < 300; i++) race.step(0, 0);
  const cp = race.checkpoint;
  race.step(0, 2);
  assert.equal(race.respawns, 1);
  assert.ok(Math.abs(race.transform().p.z - track.checkpoints[cp].z) < 1);
  race.free();
});

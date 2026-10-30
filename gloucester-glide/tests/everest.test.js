import test from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics, Race, replay } from '../shared/sim.js';
import { TRACKS, buildTrack } from '../shared/track.js';
import { encodeInputs, decodeInputs } from '../shared/inputs.js';
import { botRun } from './helpers.js';

await initPhysics();
const track = buildTrack(TRACKS.everest);

test('Everest: Höhen von Gipfel, Basislager und Ziel', () => {
  const alt = (z) => track.altitudeAt(track.heightAt(track.centerAt(z), z));
  assert.ok(Math.abs(alt(0) - 8849) < 30, `Gipfel ${alt(0)}`);
  assert.ok(Math.abs(alt(TRACKS.everest.basecampZ) - 5364) < 80, `Basislager ${alt(TRACKS.everest.basecampZ)}`);
  assert.ok(Math.abs(alt(track.finishZ) - 3440) < 80, `Ziel ${alt(track.finishZ)}`);
});

test('Everest: Schnee und Eis oben, Geröll im Basislager, Gras im Tal', () => {
  const count = (z0, z1) => {
    const n = [0, 0, 0, 0];
    for (let z = z0; z < z1; z += 2) for (let x = -8; x <= 8; x += 2) n[track.surfaceAt(track.centerAt(z) + x, z)]++;
    return n;
  };
  const top = count(50, 1100);
  assert.ok(top[1] > top[2] && top[2] > 0 && top[0] === 0, `oben ${top}`);
  const camp = count(1550, 1750);
  assert.ok(camp[3] > camp[1] && camp[0] === 0, `Basislager ${camp}`);
  const valley = count(3000, 3500);
  assert.ok(valley[0] > 0 && valley[1] + valley[2] === 0, `Tal ${valley}`);
});

test('Everest: drei Gletscherspalten mit Leitern, kein Kontrollpunkt direkt davor', () => {
  assert.equal(track.crevasses.length, 3);
  assert.equal(track.ladders.length, 3);
  for (const cv of track.crevasses) {
    const x = track.centerAt(cv.z);
    assert.ok(track.heightAt(x, cv.z) < cv.rim - 5, 'Spalte ist tief');
    assert.ok(!track.checkpoints.some((cp) => cp.z > cv.z0 - 40 && cp.z < cv.z1 + 4));
  }
});

test('Wer in eine Spalte fällt, landet am letzten Kontrollpunkt', () => {
  const cv = track.crevasses[0];
  const race = new Race(track, 'gloucester');
  const b = race.body;
  // Kontrollpunkt vor der Spalte gilt, der Laib fällt in die Mitte der Spalte
  race.checkpoint = track.checkpoints.findLastIndex((cp) => cp.z < cv.z0);
  const lad = track.ladders[0];
  const x = lad.x + 4;
  b.setTranslation({ x, y: cv.rim - 1, z: cv.z }, true);
  b.setLinvel({ x: 0, y: -2, z: 0 }, true);
  let fell = false;
  for (let i = 0; i < 120 && !fell; i++) {
    race.step(0, 0);
    fell = race.events.some((e) => e.type === 'crevasse');
    race.events.length = 0;
  }
  assert.ok(fell, 'Sturz erkannt');
  assert.ok(race.transform().p.z < cv.z0, 'zurück vor der Spalte');
  race.free();
});

test('Die Leiter trägt den Laib über die Spalte', () => {
  const lad = track.ladders[1];
  const race = new Race(track, 'parmigiano');
  const b = race.body;
  const cv = track.crevasses[1];
  b.setTranslation({ x: lad.x, y: track.heightAt(lad.x, cv.z0 - 2.5) + 0.7, z: cv.z0 - 2.5 }, true);
  b.setLinvel({ x: 0, y: 0, z: 3 }, true);
  b.setAngvel({ x: 3 / 0.62, y: 0, z: 0 }, true);
  let fell = false;
  for (let i = 0; i < 150; i++) {
    race.step(0, 0);
    if (race.events.some((e) => e.type === 'crevasse')) fell = true;
    race.events.length = 0;
  }
  assert.ok(!fell, 'nicht abgestürzt');
  assert.ok(race.transform().p.z > cv.z1 + 1, 'drüben angekommen');
  race.free();
});

test('Everest komplett: Bot kommt ins Ziel, Server-Nachfahrt identisch', () => {
  const run = botRun(track, 'parmigiano', 60 * 480);
  assert.ok(run.finished, 'im Ziel');
  assert.ok(run.time > 150 && run.time < 330, `Zeit ${run.time}`);
  const r = replay(track, 'parmigiano', decodeInputs(encodeInputs(run.inputs), 60 * 480));
  assert.equal(r.time, run.time);
  assert.equal(r.integrity, run.integrity);
  assert.equal(r.frames.length / 7, Math.floor(r.ticks / track.ghostEvery));
});

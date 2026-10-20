import test from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics } from '../shared/sim.js';
import { TRACKS, buildTrack } from '../shared/track.js';
import { encodeInputs, decodeFrames } from '../shared/inputs.js';
import { buildApp, cleanName } from '../server/app.js';
import { botRun } from './helpers.js';

await initPhysics();
const track = buildTrack(TRACKS['coopers-hill']);
const run = botRun(track, 'gloucester');
const inputs = encodeInputs(run.inputs);

const app = await buildApp({ dbFile: ':memory:', now: () => new Date('2026-10-19T12:00:00Z'), runsPerMinute: 5 });
test.after(() => app.close());

const post = (body) => app.inject({ method: 'POST', url: '/api/runs', payload: body });

test('Namen werden bereinigt', () => {
  assert.equal(cleanName('  Käse\u0000  Kurt  '), 'Käse Kurt');
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName('x'.repeat(40)).length, 16);
});

test('Strecken-Liste enthält das Tagesrennen', async () => {
  const res = await app.inject('/api/tracks');
  const body = res.json();
  assert.equal(res.statusCode, 200);
  assert.ok(body.tracks.some((t) => t.id === 'daily-2026-10-19' && t.daily));
  assert.equal(body.cheeses.length, 4);
});

test('Gültiger Lauf wird nachgespielt und eingetragen', async () => {
  const res = await post({ track: 'coopers-hill', cheese: 'gloucester', name: 'Bot', inputs, timeMs: Math.round(run.time * 1000) });
  const body = res.json();
  assert.equal(res.statusCode, 200, JSON.stringify(body));
  assert.equal(body.timeMs, Math.round(run.time * 1000));
  assert.equal(body.rank, 1);
  assert.equal(body.desync, false);
  assert.equal(body.personalBest, true);
  assert.equal(body.integrity, Math.round(run.integrity * 100));

  const lb = (await app.inject('/api/leaderboard/coopers-hill?name=Bot')).json();
  assert.equal(lb.entries.length, 1);
  assert.equal(lb.personalBestMs, body.timeMs);

  const ghost = (await app.inject(`/api/ghost/${body.id}`)).json();
  const frames = decodeFrames(ghost.frames);
  assert.equal(frames.length % 7, 0);
  assert.ok(frames.length / 7 > run.inputs.length / 2 - 2);
  assert.equal((await app.inject('/api/ghost/top/coopers-hill')).json().id, body.id);
});

test('Behauptete Zeit zählt nicht – der Server rechnet selbst', async () => {
  const res = await post({ track: 'coopers-hill', cheese: 'gloucester', name: 'Schummler', inputs, timeMs: 1000 });
  const body = res.json();
  assert.equal(body.timeMs, Math.round(run.time * 1000));
  assert.equal(body.desync, true);
});

test('Lauf ohne Zielankunft wird abgelehnt', async () => {
  const short = encodeInputs(run.inputs.slice(0, 200));
  const res = await post({ track: 'coopers-hill', cheese: 'gloucester', name: 'Bot', inputs: short });
  assert.equal(res.statusCode, 422);
});

test('Ungültige Anfragen werden abgelehnt', async () => {
  assert.equal((await post({ track: 'mond', cheese: 'gloucester', name: 'a', inputs })).statusCode, 400);
  assert.equal((await post({ track: 'coopers-hill', cheese: 'gouda', name: 'a', inputs })).statusCode, 400);
  assert.equal((await post({ track: 'coopers-hill', cheese: 'gloucester', name: ' ', inputs })).statusCode, 400);
  assert.equal((await post({ track: 'daily-2020-01-01', cheese: 'gloucester', name: 'a', inputs })).statusCode, 400);
  assert.equal((await post({ track: 'coopers-hill', cheese: 'gloucester', name: 'a', inputs: '!!' })).statusCode, 400);
});

test('Drosselung greift', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await post({ track: 'coopers-hill', cheese: 'gloucester', name: 'Spam', inputs: 'AAAA' });
  assert.equal(last.statusCode, 429);
});

// Prüft Läufe in einem eigenen Thread: Eingaben nachspielen, Zeit und Ghost berechnen.
import { parentPort } from 'node:worker_threads';
import { initPhysics, replay, MAX_TICKS } from '../shared/sim.js';
import { buildTrack, trackById } from '../shared/track.js';
import { CHEESES } from '../shared/cheeses.js';
import { decodeInputs, encodeFrames } from '../shared/inputs.js';

await initPhysics();
const tracks = new Map();
function getTrack(id) {
  if (!tracks.has(id)) {
    if (tracks.size > 16) tracks.delete(tracks.keys().next().value);
    tracks.set(id, buildTrack(trackById(id)));
  }
  return tracks.get(id);
}

parentPort.on('message', ({ job, trackId, cheese, inputs }) => {
  try {
    if (!trackById(trackId)) throw new Error('Unbekannte Strecke');
    if (!CHEESES[cheese]) throw new Error('Unbekannter Käse');
    const ticks = decodeInputs(inputs, MAX_TICKS);
    const r = replay(getTrack(trackId), cheese, ticks, { recordEvery: 2 });
    parentPort.postMessage({ job, ok: true, finished: r.finished, broken: r.broken, integrity: r.integrity, time: r.time, ticks: r.ticks, respawns: r.respawns, frames: encodeFrames(r.frames) });
  } catch (err) {
    parentPort.postMessage({ job, ok: false, error: err.message });
  }
});
parentPort.postMessage({ ready: true });

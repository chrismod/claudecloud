import { initPhysics, Race, TUNE } from '../shared/sim.js';
import { TRACKS, buildTrack } from '../shared/track.js';
import { botInput } from '../shared/bot.js';
await initPhysics();
if (process.env.TUNE) Object.assign(TUNE, JSON.parse(process.env.TUNE));
const track = buildTrack(TRACKS[process.argv[2] || 'coopers-hill']);
const race = new Race(track, process.argv[3] || 'gloucester');
const fixed = process.env.STEER !== undefined ? +process.env.STEER : null;
for (let i = 0; i < 60 * 8; i++) {
  const inp = fixed === null ? botInput(race) : { steer: fixed, flags: 0 };
  race.step(inp.steer, inp.flags);
  if (i % 20 === 0) {
    const { p, v, q } = race.transform();
    const w = race.body.angvel();
    const ay = 1 - 2 * (q.x * q.x + q.z * q.z);
    console.log(`t=${(i / 60).toFixed(2)} p=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) v=(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}) w=(${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)}) tilt=${ay.toFixed(2)} steer=${inp.steer} center=${track.centerAt(p.z).toFixed(2)} ground=${race.grounded}`);
  }
}

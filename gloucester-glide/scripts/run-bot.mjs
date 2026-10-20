// Bot fährt alle Strecken mit allen Käsesorten: node scripts/run-bot.mjs [track] [cheese]
import { initPhysics, Race, replay, TUNE } from '../shared/sim.js';
if (process.env.TUNE) Object.assign(TUNE, JSON.parse(process.env.TUNE));
import { TRACKS, buildTrack, dailyTrack } from '../shared/track.js';
import { CHEESES } from '../shared/cheeses.js';
import { botInput } from '../shared/bot.js';

await initPhysics();
const [onlyTrack, onlyCheese] = process.argv.slice(2);
const defs = [...Object.values(TRACKS), dailyTrack('2026-10-19')];
for (const def of defs) {
  if (onlyTrack && def.id !== onlyTrack) continue;
  const track = buildTrack(def);
  for (const cheese of Object.keys(CHEESES)) {
    if (onlyCheese && cheese !== onlyCheese) continue;
    const race = new Race(track, cheese);
    const inputs = [];
    let flips = 0;
    while (!race.finished && !race.broken && race.tick < 60 * 120) {
      const inp = botInput(race);
      inputs.push(inp);
      race.step(inp.steer, inp.flags);
      for (const e of race.events) if (e.type === 'flip') flips++;
      race.events.length = 0;
    }
    const p = race.transform().p;
    const r2 = replay(track, cheese, inputs);
    const same = r2.time === race.finishTime;
    console.log(`${def.id.padEnd(18)} ${cheese.padEnd(11)} ${race.finished ? `Ziel ${race.finishTime.toFixed(3)} s` : `NICHT im Ziel (z=${p.z.toFixed(0)})`}  vmax ${(race.maxSpeed * 3.6).toFixed(0)} km/h  Laib ${Math.round(race.integrity * 100)} %  respawns ${race.respawns} aufgestellt ${flips} flach ${((race.flatTicks / race.tick) * 100).toFixed(0)}%  replay ${same ? 'identisch' : 'ABWEICHUNG ' + r2.time}`);
    race.free();
  }
}

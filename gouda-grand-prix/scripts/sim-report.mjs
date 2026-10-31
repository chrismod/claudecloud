// Fährt Rennen nur mit KI und berichtet Zeiten, Treffer und Gegenstände
import { createRace, finalResults, DT } from '../src/sim/race.js';
import { TRACKS } from '../src/sim/tracks.js';
import { DRIVERS } from '../src/sim/config.js';

const diff = process.argv[2] ?? 'mittel';
for (const def of TRACKS) {
  const race = createRace({ trackDef: def, entrants: DRIVERS.map((d) => ({ driver: d.id, human: -1 })), difficulty: diff, seed: 7 });
  const count = {};
  let steps = 0;
  let maxD = 0, walls = 0, air = 0;
  while (race.phase !== 'done' && steps < 120 * 420) {
    race.step(DT);
    steps++;
    for (const e of race.events) { count[e.type] = (count[e.type] ?? 0) + 1; if (e.type === 'fire') count['fire:' + e.item] = (count['fire:' + e.item] ?? 0) + 1; }
    race.events.length = 0;
    for (const k of race.karts) { maxD = Math.max(maxD, Math.abs(k.d)); if (!k.onGround) air++; if (!Number.isFinite(k.x)) throw new Error('NaN'); }
  }
  const res = finalResults(race);
  console.log(`\n${def.name} (${race.track.length.toFixed(0)} m): ${race.phase} nach ${race.time.toFixed(1)} s, max |d| ${maxD.toFixed(1)}, Luft ${(air / 8 / 120).toFixed(1)} s/Kart`);
  for (const r of res) console.log(`  ${r.kart.driver.name.padEnd(18)} ${r.time.toFixed(1).padStart(6)} s ${r.estimated ? '(geschätzt)' : ''} Runden ${r.kart.lapTimes.map((t) => t.toFixed(1)).join(' / ')} Treffer ${r.kart.hits} Käse ${r.kart.cheeseTotal}`);
  console.log('  Ereignisse:', Object.entries(count).filter(([k]) => !['rank'].includes(k)).map(([k, v]) => `${k}=${v}`).join(' '));
}

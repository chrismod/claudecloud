import { Race } from '../shared/sim.js';
import { botInput } from '../shared/bot.js';

// Bot fährt einen Lauf und liefert die Eingaben
export function botRun(track, cheese, maxTicks = 60 * 120) {
  const race = new Race(track, cheese);
  const inputs = [];
  while (!race.finished && !race.broken && race.tick < maxTicks) {
    const inp = botInput(race);
    inputs.push(inp);
    race.step(inp.steer, inp.flags);
    race.events.length = 0;
  }
  const result = { finished: race.finished, time: race.finishTime, integrity: race.integrity, inputs };
  race.free();
  return result;
}

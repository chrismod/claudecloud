// Spielt für jedes Level die Referenzlösung und die Fehlversuche durch: npm run levels [id ...]
import { LEVELS } from '../src/levels.js';
import { SOLUTIONS } from '../tests/solutions.js';
import { play } from '../tests/harness.js';

const only = process.argv.slice(2);
for (const [i, level] of LEVELS.entries()) {
  if (only.length && !only.includes(level.id)) continue;
  const sol = SOLUTIONS[level.id];
  if (!sol) {
    console.log(`${String(i + 1).padStart(2)} ${level.id}: KEINE LÖSUNG`);
    continue;
  }
  const r = play(level, sol.solve);
  const o = r.world.olive;
  const fails = (sol.fail || []).map((f) => play(level, f).state);
  const ok = r.state === 'won' && fails.every((s) => s !== 'won');
  console.log(
    `${ok ? '✓' : '✗'} ${String(i + 1).padStart(2)} ${level.id.padEnd(16)} lösung=${r.state.padEnd(4)} käse=${r.used.toFixed(2)}/${level.cheese} par=${level.par} t=${r.time.toFixed(1)} olive=(${o.x.toFixed(1)},${o.y.toFixed(1)}) fehlversuche=[${fails.join(',')}] ${r.log.join('; ')}`,
  );
}

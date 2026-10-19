// Prüft, wie robust die Level gegen menschliche Ungenauigkeit sind:
// Referenzlösung und Fehlversuche werden mit zufälligen Abweichungen gespielt.
//   node scripts/robustness.mjs [anzahl] [level-id ...]
import { LEVELS } from '../src/levels.js';
import { SOLUTIONS } from '../tests/solutions.js';
import { play } from '../tests/harness.js';

const args = process.argv.slice(2);
const n = Number.isFinite(+args[0]) ? +args.shift() : 12;
for (const [i, level] of LEVELS.entries()) {
  if (args.length && !args.includes(level.id)) continue;
  const sol = SOLUTIONS[level.id];
  let wins = 0;
  for (let k = 1; k <= n; k++) if (play(level, sol.solve, { jitter: k * 7919 }).state === 'won') wins++;
  const failWins = (sol.fail || []).map((f) => {
    let w = 0;
    for (let k = 1; k <= n; k++) if (play(level, f, { jitter: k * 104729 }).state === 'won') w++;
    return w;
  });
  const ok = wins >= n * 0.85 && failWins.every((w) => w <= n * 0.15);
  console.log(`${ok ? '✓' : '✗'} ${String(i + 1).padStart(2)} ${level.id.padEnd(16)} Lösung ${wins}/${n}  Fehlversuche gewinnen ${failWins.map((w) => `${w}/${n}`).join(' ') || '-'}`);
}

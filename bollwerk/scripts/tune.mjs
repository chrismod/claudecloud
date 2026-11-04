// Stimmt den Lebenspunkte-Faktor jeder Karte ab: Der Bot (mit der Forschung, die man bis dahin
// ungefähr hätte) soll im Mittel 30–60 % über das Kartenziel kommen. Schreibt src/game/tuning.js.
//   node scripts/tune.mjs [kartenId …]
import { writeFileSync } from 'node:fs';
import { MAPS } from '../src/game/maps.js';
import { Game } from '../src/game/game.js';
import { runBot } from '../src/game/bot.js';
import { expectedResearch, expectedCrystals } from '../src/game/research.js';
import { HP_SCALE } from '../src/game/tuning.js';

const only = process.argv.slice(2);
// Die echte Saat der Karte (aus ihrer ID) – genau diese Wellen bekommt man im Spiel
const SEEDS = [undefined];
// Einstieg großzügig, später knapper
const target = (i) => (i < 5 ? 1.6 : i < 10 ? 1.45 : 1.3);

function reached(m, scale, research) {
  const waves = SEEDS.map((seed) => {
    const g = new Game({ ...m, hpScale: scale }, { ...(seed != null && { seed }), events: false, research });
    return runBot(g, { maxWave: Math.ceil(m.goal * 1.7) }).wave;
  }).sort((a, b) => a - b);
  return waves[Math.floor(waves.length / 2)];
}

const out = { ...HP_SCALE };
for (const m of MAPS) {
  if (only.length && !only.includes(m.id)) continue;
  const research = expectedResearch(expectedCrystals(MAPS, m.index));
  const want = m.goal * target(m.index);
  let lo = 0.2;
  let hi = 6;
  for (let it = 0; it < 8; it++) {
    const mid = Math.sqrt(lo * hi);
    if (reached(m, mid, research) >= want) lo = mid;
    else hi = mid;
  }
  out[m.id] = Math.round(lo * 100) / 100;
  console.log(`${String(m.index + 1).padStart(2)} ${m.id.padEnd(14)} Ziel ${m.goal} · Faktor ${out[m.id]} · Bot ${reached(m, out[m.id], research)} · Forschung ${Object.values(research).reduce((a, b) => a + b, 0)} Stufen`);
}
const body = MAPS.map((m) => `  ${m.id}: ${out[m.id] ?? 1},`).join('\n');
writeFileSync('src/game/tuning.js', `// Schwierigkeitsfaktor (Lebenspunkte) je Karte – erzeugt von scripts/tune.mjs, nicht von Hand ändern.\nexport const HP_SCALE = {\n${body}\n};\n`);
console.log('→ src/game/tuning.js');

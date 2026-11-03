// Lässt den Bot auf allen Karten spielen und berichtet, wie weit er kommt.
//   node scripts/balance.mjs [kartenId] [--seeds 3]
import { MAPS } from '../src/game/maps.js';
import { Game } from '../src/game/game.js';
import { runBot } from '../src/game/bot.js';

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'));
const seeds = Number(args[args.indexOf('--seeds') + 1]) || 3;
const t0 = Date.now();
for (const m of MAPS) {
  if (only && m.id !== only) continue;
  const res = [];
  for (let s = 0; s < seeds; s++) {
    const g = new Game(m, { seed: 1000 + s, events: false });
    const r = runBot(g, { maxWave: 120, moduleFor: (t) => (t.id + s) % 2 });
    res.push(r);
  }
  const waves = res.map((r) => r.wave);
  console.log(`${m.name.padEnd(10)} Ziel ${String(m.goal).padStart(2)} · Bot erreicht Welle ${waves.join(', ')} · Türme ${res.map((r) => r.towers).join(', ')}`);
}
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);

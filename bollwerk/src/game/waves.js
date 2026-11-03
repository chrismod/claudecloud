// Prozedurale Wellen: Zusammensetzung pro Welle deterministisch aus Kartensaat + Wellennummer.
import { ENEMIES, ENEMY_UNLOCK, BOSS_ROTATION } from './data.js';
import { makeRng } from './rng.js';

// Lebenspunkte wachsen erst linear, dann exponentiell – irgendwann fällt jede Festung.
export function hpMul(n) {
  const k = Math.max(0, n - 1);
  return (1 + 0.12 * k) * Math.pow(1.075, k);
}
export function armorMul(n) {
  return 1 + 0.07 * Math.max(0, n - 1);
}
export function bountyMul(n) {
  return 1 + 0.05 * Math.max(0, n - 1);
}
export function speedMul(n) {
  return 1 + Math.min(0.3, 0.006 * Math.max(0, n - 1));
}
// Bedrohungsbudget (in „Wanderer-Einheiten“)
export function budget(n) {
  return 7 + 1.15 * n;
}
// Grundeinkommen zu Beginn jeder Welle
export function waveIncome(n) {
  return 6 + Math.floor(n * 1.2);
}

const BASE_INTERVAL = { walker: 0.75, runner: 0.45 };

export function isBossWave(n) {
  return n % 10 === 0;
}

// Liefert { n, boss, groups: [{ type, count, interval, delay }] }
export function generateWave(n, seed = 1) {
  const rng = makeRng(seed * 7919 + n * 104729);
  const unlocked = Object.entries(ENEMY_UNLOCK)
    .filter(([, w]) => w <= n)
    .map(([k]) => k);
  const fresh = Object.entries(ENEMY_UNLOCK).find(([, w]) => w === n)?.[0];
  const B = budget(n);
  const groups = [];
  const intervalOf = (type) => (ENEMIES[type].interval ?? BASE_INTERVAL[type] ?? 0.75) / (1 + n * 0.008);
  const add = (type, share, delay) => {
    const count = Math.max(1, Math.round((B * share) / ENEMIES[type].cost));
    groups.push({ type, count, interval: intervalOf(type), delay });
  };

  if (isBossWave(n)) {
    const bossType = BOSS_ROTATION[(n / 10 - 1) % BOSS_ROTATION.length];
    const bosses = 1 + Math.floor(n / 40);
    add(rng() < 0.5 ? 'walker' : 'runner', 0.45, 0);
    groups.push({ type: bossType, count: bosses, interval: 6, delay: 3 });
    return { n, boss: true, groups };
  }

  // Hauptgruppe: neue Art bekommt ihren großen Auftritt
  const weights = unlocked.map((k) => [k, k === 'walker' ? 2.5 : 2]);
  const primary = fresh || rng.weighted(weights);
  if (n >= 4 && rng() < 0.65) {
    const rest = unlocked.filter((k) => k !== primary);
    const secondary = rest.length ? rng.pick(rest) : primary;
    add(primary, 0.62, 0);
    add(secondary, 0.38, rng.range(1.5, 4));
  } else {
    add(primary, 1, 0);
  }
  // Ab und zu ein schneller Schwarm am Ende
  if (n >= 6 && rng() < 0.25) add('runner', 0.15, rng.range(4, 7));
  return { n, boss: false, groups };
}

// Spawnliste mit absoluten Zeiten (relativ zum Wellenstart)
export function waveSchedule(wave, pathCount) {
  const list = [];
  let k = 0;
  for (const g of wave.groups) {
    for (let i = 0; i < g.count; i++) {
      list.push({ t: g.delay + i * g.interval, type: g.type, path: k++ % pathCount });
    }
  }
  list.sort((a, b) => a.t - b.t);
  return list;
}

export function summarizeWave(wave) {
  const map = new Map();
  for (const g of wave.groups) map.set(g.type, (map.get(g.type) || 0) + g.count);
  return [...map].map(([type, count]) => ({ type, count }));
}

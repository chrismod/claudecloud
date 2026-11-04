// Forschungsbaum: dauerhafte Verbesserungen zwischen den Partien, bezahlt mit Kristallen.
// Vier Zweige, jeder eine Kette: ein Knoten setzt Stufe 1 des Knotens darüber voraus.

export const BRANCHES = ['eco', 'arms', 'fort', 'cmd'];

const c = (...costs) => costs;

export const RESEARCH = [
  // Wirtschaft
  { id: 'startCoins', branch: 'eco', max: 5, cost: c(3, 5, 8, 12, 18), per: 0.08 },
  { id: 'income', branch: 'eco', max: 3, cost: c(6, 10, 16), per: 0.1 },
  { id: 'bounty', branch: 'eco', max: 4, cost: c(8, 12, 18, 26), per: 0.05 },
  { id: 'refund', branch: 'eco', max: 3, cost: c(8, 12, 18), per: 0.05 },
  { id: 'early', branch: 'eco', max: 2, cost: c(12, 20), per: 0.25 },
  { id: 'interest', branch: 'eco', max: 2, cost: c(25, 40), per: 0.01 },
  // Waffen
  { id: 'kinetic', branch: 'arms', max: 5, cost: c(4, 7, 11, 16, 22), per: 0.06 },
  { id: 'explosive', branch: 'arms', max: 5, cost: c(5, 8, 12, 17, 24), per: 0.06 },
  { id: 'energy', branch: 'arms', max: 5, cost: c(6, 9, 13, 18, 26), per: 0.06 },
  { id: 'elemental', branch: 'arms', max: 5, cost: c(7, 10, 14, 20, 28), per: 0.06 },
  { id: 'range', branch: 'arms', max: 3, cost: c(12, 18, 26), per: 0.03 },
  { id: 'rate', branch: 'arms', max: 3, cost: c(20, 30, 45), per: 0.03 },
  // Festung
  { id: 'lives', branch: 'fort', max: 5, cost: c(3, 5, 8, 12, 18), per: 2 },
  { id: 'buildCost', branch: 'fort', max: 3, cost: c(8, 12, 18), per: 0.04 },
  { id: 'xp', branch: 'fort', max: 3, cost: c(6, 10, 15), per: 0.2 },
  { id: 'upgradeCost', branch: 'fort', max: 3, cost: c(10, 15, 22), per: 0.04 },
  { id: 'veteran', branch: 'fort', max: 2, cost: c(20, 35), per: 1 },
  { id: 'barrier', branch: 'fort', max: 2, cost: c(30, 50), per: 1 },
  // Kommando
  { id: 'cooldown', branch: 'cmd', max: 4, cost: c(5, 8, 12, 18), per: 0.06 },
  { id: 'meteor', branch: 'cmd', max: 3, cost: c(6, 10, 16), per: 0.2 },
  { id: 'blizzard', branch: 'cmd', max: 3, cost: c(6, 10, 16), per: 0.5 },
  { id: 'overdrive', branch: 'cmd', max: 3, cost: c(8, 12, 18), per: 3 },
  { id: 'bossDmg', branch: 'cmd', max: 5, cost: c(10, 14, 18, 24, 30), per: 0.08 },
  { id: 'medic', branch: 'cmd', max: 2, cost: c(20, 35), per: 1 },
];

export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

// Vorgänger in der Kette (oder null für den ersten Knoten eines Zweigs)
export function parentOf(id) {
  const r = RESEARCH_BY_ID[id];
  const list = RESEARCH.filter((x) => x.branch === r.branch);
  const i = list.indexOf(r);
  return i > 0 ? list[i - 1].id : null;
}

export function canResearch(levels, crystals, id) {
  const r = RESEARCH_BY_ID[id];
  const lv = levels[id] || 0;
  if (lv >= r.max) return { ok: false, reason: 'max' };
  const p = parentOf(id);
  if (p && !(levels[p] > 0)) return { ok: false, reason: 'locked' };
  if (crystals < r.cost[lv]) return { ok: false, reason: 'crystals' };
  return { ok: true, cost: r.cost[lv] };
}

export function spentOn(levels) {
  let sum = 0;
  for (const r of RESEARCH) for (let i = 0; i < (levels[r.id] || 0); i++) sum += r.cost[i];
  return sum;
}

// Modifikatoren für eine Partie
export function researchMods(levels = {}) {
  const L = (id) => Math.min(levels[id] || 0, RESEARCH_BY_ID[id].max);
  const P = (id) => L(id) * RESEARCH_BY_ID[id].per;
  const dmg = {
    kinetic: 1 + P('kinetic'),
    explosive: 1 + P('explosive'),
    energy: 1 + P('energy'),
    fire: 1 + P('elemental'),
    cold: 1 + P('elemental'),
    toxic: 1 + P('elemental'),
  };
  return {
    startCoins: 1 + P('startCoins'),
    income: 1 + P('income'),
    bounty: 1 + P('bounty'),
    sellRate: P('refund'),
    early: 1 + P('early'),
    interest: L('interest'),
    dmg,
    range: 1 + P('range'),
    rate: 1 + P('rate'),
    lives: P('lives'),
    buildCost: 1 - P('buildCost'),
    upgradeCost: 1 - P('upgradeCost'),
    xp: 1 + P('xp'),
    veteran: L('veteran'),
    barrier: L('barrier'),
    cooldown: 1 - P('cooldown'),
    meteor: 1 + P('meteor'),
    blizzard: L('blizzard'),
    overdrive: P('overdrive'),
    bossDmg: 1 + P('bossDmg'),
    medic: L('medic'),
  };
}

// Kristalle für eine Partie: mehr für weiter, schwerere Karten und Siege
export function crystalsFor(mapIndex, wavesSurvived, won, firstWin) {
  const w = Math.max(0, wavesSurvived);
  let n = w * (1 + 0.05 * mapIndex) + (w * w) / 60;
  if (won) n += 10 + 2 * mapIndex;
  if (firstWin) n += 10 + 2 * mapIndex;
  return Math.round(n);
}

// Forschung, die ein Spieler mit diesem Kristallbudget ungefähr hätte (für Bot und Abstimmung):
// immer der günstigste verfügbare nächste Schritt.
export function expectedResearch(budget) {
  const levels = {};
  let left = Math.floor(budget);
  for (;;) {
    let best = null;
    for (const r of RESEARCH) {
      const chk = canResearch(levels, left, r.id);
      if (chk.ok && (!best || chk.cost < best.cost)) best = { id: r.id, cost: chk.cost };
    }
    if (!best) return levels;
    left -= best.cost;
    levels[best.id] = (levels[best.id] || 0) + 1;
  }
}

// Kristalle, die man bis vor Level i erspielt hätte (jedes Level einmal gewonnen, mit Abschlag)
export function expectedCrystals(maps, i) {
  let sum = 0;
  for (let j = 0; j < i; j++) sum += crystalsFor(j, maps[j].goal, true, true);
  return sum * 0.75;
}

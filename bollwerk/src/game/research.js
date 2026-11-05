// Forschungsbaum: ein großer Graph wie in Infinitode 2.
//  · Globale Zweige (Wirtschaft, Arsenal, Festung, Kommando) – bezahlt mit Kristallen
//  · Je Turm eine eigene Kette: Schaden, Ausbau-Obergrenze, Reichweite, Feuerrate, Spezialwert,
//    Kosten, Erfahrung, Erfahrungs-Obergrenze, Ultimate
//  · Endlose Forschung ohne Obergrenze – bezahlt mit Sternenstaub aus dem Endlosmodus
// Knoten: { id, x, y, max (null = endlos), cost(level), cur ('c' Kristalle | 'd' Sternenstaub), req: [[id, Stufe]], kind, per, tower? }
import { TOWERS, TOWER_ORDER, BASE_MAX_LEVEL, MAX_LEVEL, BASE_MAX_XP, HARD_MAX_XP } from './data.js';

export const BRANCHES = ['eco', 'arms', 'fort', 'cmd'];

const list = (...costs) => (l) => costs[l];
const nodes = [];
const add = (n) => (nodes.push({ cur: 'c', req: [], ...n }), n.id);

// Wurzel: immer erforscht
add({ id: 'hub', x: 0, y: 0, max: 1, cost: () => 0, kind: 'hub' });

// Globale Zweige: je eine Kette, links vom Zentrum
const GLOBAL = {
  eco: [
    ['startCoins', 5, list(3, 5, 8, 12, 18), 0.08],
    ['income', 3, list(6, 10, 16), 0.1],
    ['bounty', 4, list(8, 12, 18, 26), 0.05],
    ['refund', 3, list(8, 12, 18), 0.05],
    ['early', 2, list(12, 20), 0.25],
    ['interest', 2, list(25, 40), 1],
    ['crystalGain', 5, list(20, 30, 45, 65, 90), 0.05],
  ],
  arms: [
    ['kinetic', 5, list(4, 7, 11, 16, 22), 0.06],
    ['explosive', 5, list(5, 8, 12, 17, 24), 0.06],
    ['energy', 5, list(6, 9, 13, 18, 26), 0.06],
    ['elemental', 5, list(7, 10, 14, 20, 28), 0.06],
    ['range', 3, list(12, 18, 26), 0.03],
    ['rate', 3, list(20, 30, 45), 0.03],
    ['tileBonus', 3, list(15, 25, 40), 0.25],
  ],
  fort: [
    ['lives', 5, list(3, 5, 8, 12, 18), 2],
    ['buildCost', 3, list(8, 12, 18), 0.04],
    ['xp', 3, list(6, 10, 15), 0.2],
    ['upgradeCost', 3, list(10, 15, 22), 0.04],
    ['veteran', 2, list(20, 35), 1],
    ['barrier', 2, list(30, 50), 1],
  ],
  cmd: [
    ['cooldown', 4, list(5, 8, 12, 18), 0.06],
    ['meteor', 3, list(6, 10, 16), 0.2],
    ['meteorRadius', 3, list(8, 12, 18), 0.2],
    ['blizzard', 3, list(6, 10, 16), 0.5],
    ['overdrive', 3, list(8, 12, 18), 3],
    ['bossDmg', 5, list(10, 14, 18, 24, 30), 0.08],
    ['bossBounty', 3, list(10, 16, 24), 0.25],
    ['medic', 2, list(20, 35), 1],
  ],
};
BRANCHES.forEach((br, bi) => {
  const x = -4.5 + bi;
  let prev = 'hub';
  GLOBAL[br].forEach(([id, max, cost, per], i) => {
    prev = add({ id, branch: br, x, y: 1 + i, max, cost, per, kind: id, req: [[prev, 1]] });
  });
});

// Turmketten rechts vom Zentrum. Forschung für teure Türme kostet etwas mehr.
export const TOWER_NODES = ['dmg', 'upg', 'range', 'rate', 'special', 'cost', 'xp', 'xpcap', 'ult'];
TOWER_ORDER.forEach((t, ti) => {
  const x = 1 + ti;
  const f = 0.8 + TOWERS[t].cost / 200;
  const c = (fn) => (l) => Math.round(f * fn(l));
  const id = (k) => `${t}.${k}`;
  const T = { tower: t, branch: 'tower' };
  add({ ...T, id: id('dmg'), x, y: 1, max: 10, cost: c((l) => 5 + 3 * l), per: 0.04, kind: 'tdmg', req: [['hub', 1]] });
  add({ ...T, id: id('upg'), x, y: 2, max: MAX_LEVEL - BASE_MAX_LEVEL, cost: c(list(12, 22, 38, 60)), per: 1, kind: 'tupg', req: [[id('dmg'), 1]] });
  add({ ...T, id: id('range'), x: x - 0.28, y: 3, max: 5, cost: c((l) => 6 + 4 * l), per: 0.02, kind: 'trange', req: [[id('upg'), 1]] });
  add({ ...T, id: id('rate'), x: x + 0.28, y: 3, max: 5, cost: c((l) => 8 + 5 * l), per: 0.03, kind: 'trate', req: [[id('upg'), 1]] });
  add({ ...T, id: id('special'), x, y: 4, max: 5, cost: c((l) => 8 + 5 * l), per: 1, kind: `ts.${t}`, req: [[id('range'), 1], [id('rate'), 1]] });
  add({ ...T, id: id('cost'), x: x - 0.28, y: 5, max: 5, cost: c((l) => 5 + 4 * l), per: 0.03, kind: 'tcost', req: [[id('special'), 1]] });
  add({ ...T, id: id('xp'), x: x + 0.28, y: 5, max: 5, cost: c((l) => 5 + 3 * l), per: 0.1, kind: 'txp', req: [[id('special'), 1]] });
  add({ ...T, id: id('xpcap'), x, y: 6, max: 5, cost: c(list(20, 32, 48, 70, 100)), per: 2, kind: 'txpcap', req: [[id('xp'), 1], [id('cost'), 1]] });
  add({ ...T, id: id('ult'), x, y: 7, max: 1, cost: c(() => 160), per: 1, kind: 'tult', req: [[id('xpcap'), 5], [id('dmg'), 10]] });
});

// Endlose Forschung (Sternenstaub), unter den globalen Zweigen
const ENDLESS = [
  ['e.dmg', (l) => 3 * 1.12 ** l, null, 0.01],
  ['e.rate', (l) => 4 * 1.13 ** l, null, 0.005],
  ['e.range', (l) => 4 * 1.13 ** l, null, 0.005],
  ['e.coins', (l) => 3 * 1.12 ** l, null, 0.03],
  ['e.bounty', (l) => 3 * 1.12 ** l, null, 0.01],
  ['e.lives', (l) => 4 * 1.14 ** l, 30, 1],
  ['e.xpcap', (l) => 6 * 1.16 ** l, HARD_MAX_XP - 20, 1],
  ['e.dust', (l) => 5 * 1.15 ** l, null, 0.02],
];
// Zwei Reihen: die erste ist eine Kette, die zweite hängt jeweils am Knoten darüber
ENDLESS.forEach(([id, cost, max, per], i) => {
  const col = i % 4;
  const row = Math.floor(i / 4);
  const req = row ? [[ENDLESS[i - 4][0], 1]] : col ? [[ENDLESS[i - 1][0], 1]] : [['hub', 1]];
  add({ id, branch: 'endless', x: -4.5 + col, y: 9.5 + row, max, cost: (l) => Math.round(cost(l)), cur: 'd', per, kind: id, req });
});

export const RESEARCH = nodes;
export const RESEARCH_BY_ID = Object.fromEntries(nodes.map((n) => [n.id, n]));

export const levelOf = (levels, id) => (id === 'hub' ? 1 : levels[id] || 0);

export function reqsMet(levels, id) {
  return RESEARCH_BY_ID[id].req.every(([r, l]) => levelOf(levels, r) >= l);
}

// wallet: { c: Kristalle, d: Sternenstaub } oder eine Zahl (nur Kristalle)
export function canResearch(levels, wallet, id) {
  const r = RESEARCH_BY_ID[id];
  const lv = levelOf(levels, id);
  if (r.max != null && lv >= r.max) return { ok: false, reason: 'max' };
  if (!reqsMet(levels, id)) return { ok: false, reason: 'locked' };
  const cost = r.cost(lv);
  const have = typeof wallet === 'number' ? (r.cur === 'c' ? wallet : 0) : wallet[r.cur] || 0;
  if (have < cost) return { ok: false, reason: 'funds', cost };
  return { ok: true, cost };
}

export function spentOn(levels) {
  const out = { c: 0, d: 0 };
  for (const r of nodes) for (let i = 0; i < (levels[r.id] || 0); i++) out[r.cur] += r.cost(i);
  return out;
}

// Modifikatoren für eine Partie
export function researchMods(levels = {}) {
  const L = (id) => {
    const r = RESEARCH_BY_ID[id];
    return Math.min(levels[id] || 0, r.max ?? Infinity);
  };
  const P = (id) => L(id) * RESEARCH_BY_ID[id].per;
  const all = 1 + P('e.dmg');
  const dmg = {
    kinetic: (1 + P('kinetic')) * all,
    explosive: (1 + P('explosive')) * all,
    energy: (1 + P('energy')) * all,
    fire: (1 + P('elemental')) * all,
    cold: (1 + P('elemental')) * all,
    toxic: (1 + P('elemental')) * all,
  };
  const tower = {};
  for (const t of TOWER_ORDER) {
    const T = (k) => P(`${t}.${k}`);
    tower[t] = {
      dmg: 1 + T('dmg'),
      rate: 1 + T('rate'),
      range: 1 + T('range'),
      cost: 1 - T('cost'),
      xp: 1 + T('xp'),
      special: L(`${t}.special`),
      maxLevel: BASE_MAX_LEVEL + L(`${t}.upg`),
      maxXp: Math.min(HARD_MAX_XP, BASE_MAX_XP + T('xpcap') + L('e.xpcap')),
      ult: L(`${t}.ult`) > 0,
    };
  }
  return {
    startCoins: 1 + P('startCoins') + P('e.coins'),
    income: 1 + P('income'),
    bounty: 1 + P('bounty') + P('e.bounty'),
    sellRate: P('refund'),
    early: 1 + P('early'),
    interest: L('interest'),
    crystalGain: 1 + P('crystalGain'),
    dustGain: 1 + P('e.dust'),
    dmg,
    range: 1 + P('range') + P('e.range'),
    rate: 1 + P('rate') + P('e.rate'),
    tileBonus: 1 + P('tileBonus'),
    lives: P('lives') + P('e.lives'),
    buildCost: 1 - P('buildCost'),
    upgradeCost: 1 - P('upgradeCost'),
    xp: 1 + P('xp'),
    veteran: L('veteran'),
    barrier: L('barrier'),
    cooldown: 1 - P('cooldown'),
    meteor: 1 + P('meteor'),
    meteorRadius: 1 + P('meteorRadius'),
    blizzard: L('blizzard'),
    overdrive: P('overdrive'),
    bossDmg: 1 + P('bossDmg'),
    bossBounty: 1 + P('bossBounty'),
    medic: L('medic'),
    tower,
  };
}

// Kristalle für eine Partie: mehr für weiter, schwerere Karten und Siege
export function crystalsFor(mapIndex, wavesSurvived, won, firstWin, gain = 1) {
  const w = Math.max(0, wavesSurvived);
  let n = w * (1 + 0.05 * mapIndex) + (w * w) / 60;
  if (won) n += 10 + 2 * mapIndex;
  if (firstWin) n += 10 + 2 * mapIndex;
  return Math.round(n * gain);
}

// Sternenstaub nur für Wellen über dem Kartenziel (Endlosmodus)
export function dustFor(mapIndex, wavesSurvived, goal, gain = 1) {
  const extra = Math.max(0, wavesSurvived - goal);
  let n = 0;
  for (let k = 1; k <= extra; k++) n += 1 + k * 0.15;
  return Math.round(n * (1 + 0.04 * mapIndex) * gain);
}

// Forschung, die ein Spieler mit diesem Kristallbudget ungefähr hätte (für Bot und Abstimmung):
// immer der günstigste verfügbare nächste Schritt.
export function expectedResearch(budget) {
  const levels = {};
  let left = Math.floor(budget);
  for (;;) {
    let best = null;
    for (const r of nodes) {
      if (r.cur !== 'c' || r.id === 'hub') continue;
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

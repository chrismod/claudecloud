// Spieldaten: Schadensarten, Türme, Gegner, Fähigkeiten, Feldboni. Texte stehen in src/lang/.
// Alle Längen in Feldern, Zeiten in Sekunden, Raten pro Sekunde.

export const DAMAGE_TYPES = {
  kinetic: { color: '#9fd8ff' },
  explosive: { color: '#ffb35c' },
  fire: { color: '#ff7a3d' },
  cold: { color: '#9ae6ff' },
  energy: { color: '#c99bff' },
  toxic: { color: '#a6e85a' },
};

export const TARGETING = [
  { key: 'first' },
  { key: 'last' },
  { key: 'strong' },
  { key: 'weak' },
  { key: 'near' },
];

export const MAX_LEVEL = 10;
export const MODULE_LEVEL = 5; // ab dieser Stufe wird ein Modul gewählt
export const SELL_RATE = 0.7;

// Feldboni auf Sonderplattformen
export const TILE_BONUS = {
  D: { color: '#ff6b6b' },
  R: { color: '#6bb8ff' },
  X: { color: '#b48cff' },
  C: { color: '#ffc94d' },
};

// Erfahrungsränge: Schwelle (XP) je Rang, Bonus pro Rang
export const RANKS = [0, 10, 28, 55, 95, 150, 225, 320, 440, 590, 770];
export const RANK_DMG = 0.04;
export const RANK_RANGE = 0.015;

const S = (o) => o; // nur zur Lesbarkeit

// Türme --------------------------------------------------------------------
// kind: projectile | lob | homing | hitscan | chain | pulse | cone | beam | support | economy
// grow: dmg und rate wachsen multiplikativ (×/Stufe), Felder in growMul ebenfalls, alle anderen additiv (+/Stufe)
export const TOWERS = {
  bolt: {
    cost: 30,
    color: '#3fb7a6',
    accent: '#7ff5e4',
    dmgType: 'kinetic',
    kind: 'projectile',
    air: true,
    ground: true,
    base: S({ dmg: 7, range: 2.6, rate: 1.8, projSpeed: 14 }),
    grow: { dmg: 1.33, range: 0.06, rate: 1.03 },
    modules: [
      { apply: (s) => ((s.multishot = 2), (s.dmg *= 0.85)) },
      { apply: (s) => ((s.armorPierce = 0.7), (s.dmg *= 1.25)) },
    ],
    master: { apply: (s) => ((s.crit = 0.2), (s.critMul = 2)) },
  },
  mortar: {
    cost: 60,
    color: '#d9824a',
    accent: '#ffb35c',
    dmgType: 'explosive',
    kind: 'lob',
    air: false,
    ground: true,
    base: S({ dmg: 26, range: 4.0, minRange: 1.0, rate: 0.5, splash: 0.95, flight: 0.9 }),
    grow: { dmg: 1.33, range: 0.05, rate: 1.03, splash: 0.03 },
    modules: [
      { apply: (s) => (s.cluster = 4) },
      { apply: (s) => ((s.fireField = 3), (s.fieldFrac = 0.35)) },
    ],
    master: { apply: (s) => ((s.splash *= 1.25), (s.stunChance = 0.15), (s.stunDur = 0.6)) },
  },
  frost: {
    cost: 50,
    color: '#7cc8ef',
    accent: '#c8f3ff',
    dmgType: 'cold',
    kind: 'pulse',
    air: true,
    ground: true,
    base: S({ dmg: 3, range: 1.9, rate: 0.8, slow: 0.3, slowDur: 1.6 }),
    grow: { dmg: 1.3, range: 0.05, rate: 1.0, slow: 0.025 },
    modules: [
      { apply: (s) => ((s.freezeChance = 0.12), (s.freezeDur = 1)) },
      { apply: (s) => (s.brittle = 0.2) },
    ],
    master: { apply: (s) => ((s.slow += 0.1), (s.range += 0.3)) },
  },
  tesla: {
    cost: 70,
    color: '#8a6cf0',
    accent: '#d6c4ff',
    dmgType: 'energy',
    kind: 'chain',
    air: true,
    ground: true,
    base: S({ dmg: 13, range: 2.4, rate: 0.9, chains: 3, chainRange: 1.7, falloff: 0.8 }),
    grow: { dmg: 1.3, range: 0.05, rate: 1.03, chains: 0.25 },
    modules: [
      { apply: (s) => ((s.chains += 3), (s.falloff = 1)) },
      { apply: (s) => ((s.stunEvery = 4), (s.stunDur = 0.7), (s.dmg *= 1.2)) },
    ],
    master: { apply: (s) => ((s.dmg *= 1.25), (s.chainRange += 0.6)) },
  },
  sniper: {
    cost: 90,
    color: '#5f7d9c',
    accent: '#e4f1ff',
    dmgType: 'kinetic',
    kind: 'hitscan',
    air: true,
    ground: true,
    targeting: 'strong',
    base: S({ dmg: 52, range: 5.5, rate: 0.38, crit: 0.1, critMul: 2.5 }),
    grow: { dmg: 1.34, range: 0.1, rate: 1.03 },
    modules: [
      { apply: (s) => ((s.crit = 0.3), (s.critMul = 4)) },
      { apply: (s) => ((s.pierce = true), (s.dmg *= 0.9)) },
    ],
    master: { apply: (s) => ((s.mark = 0.15), (s.markDur = 3)) },
  },
  acid: {
    cost: 65,
    color: '#7fbf3f',
    accent: '#c8ff7a',
    dmgType: 'toxic',
    kind: 'lob',
    air: true,
    ground: true,
    base: S({ dmg: 6, range: 2.8, rate: 0.75, splash: 0.7, flight: 0.45, poisonDps: 6, poisonDur: 4, corrosion: 1 }),
    grow: { dmg: 1.3, range: 0.05, rate: 1.02, poisonDps: 1.32, corrosion: 0.2 },
    growMul: { poisonDps: true },
    modules: [
      { apply: (s) => (s.plague = 1.5) },
      { apply: (s) => ((s.corrosion *= 3), (s.poisonVuln = 0.15)) },
    ],
    master: { apply: (s) => (s.poisonSlow = 0.15) },
  },
  flame: {
    cost: 80,
    color: '#e05a3a',
    accent: '#ffb14d',
    dmgType: 'fire',
    kind: 'cone',
    air: false,
    ground: true,
    base: S({ dmg: 17, range: 1.8, cone: 50, burnDps: 5, burnDur: 3 }),
    grow: { dmg: 1.3, range: 0.04, burnDps: 1.3 },
    growMul: { burnDps: true },
    modules: [
      { apply: (s) => ((s.burnDps *= 2), (s.burnDur = 5)) },
      { apply: (s) => ((s.cone = 100), (s.range += 0.5)) },
    ],
    master: { apply: (s) => (s.dmg *= 1.35) },
  },
  laser: {
    cost: 120,
    color: '#d0459b',
    accent: '#ff9be0',
    dmgType: 'energy',
    kind: 'beam',
    air: true,
    ground: true,
    base: S({ dmg: 20, range: 3.0, ramp: 3, rampTime: 3 }),
    grow: { dmg: 1.3, range: 0.05 },
    modules: [
      { apply: (s) => ((s.ramp = 5), (s.rampTime = 2.5)) },
      { apply: (s) => (s.split = 2) },
    ],
    master: { apply: (s) => ((s.beamBurn = 0.2), (s.burnDur = 2)) },
  },
  missile: {
    cost: 110,
    color: '#d6b13a',
    accent: '#fff07a',
    dmgType: 'explosive',
    kind: 'homing',
    air: true,
    ground: true,
    preferAir: true,
    base: S({ dmg: 18, range: 4.2, rate: 0.6, salvo: 2, splash: 0.6, airMul: 1.6, projSpeed: 5.5 }),
    grow: { dmg: 1.32, range: 0.06, rate: 1.03 },
    modules: [
      { apply: (s) => ((s.salvo = 5), (s.dmg *= 0.7)) },
      { apply: (s) => ((s.salvo = 1), (s.dmg *= 2.6), (s.splash = 1.2)) },
    ],
    master: { apply: (s) => ((s.range += 1), (s.airMul = 2)) },
  },
  amp: {
    cost: 100,
    color: '#c9a24a',
    accent: '#ffe7a3',
    dmgType: null,
    kind: 'support',
    air: false,
    ground: false,
    base: S({ range: 1.5, buffDmg: 0.15, buffRate: 0.08 }),
    grow: { buffDmg: 0.025, buffRate: 0.012 },
    modules: [
      { apply: (s) => (s.buffRange = 0.15) },
      { apply: (s) => (s.buffBounty = 0.3) },
    ],
    master: { apply: (s) => (s.range = 2.3) },
  },
  mint: {
    cost: 80,
    color: '#b8913a',
    accent: '#ffd76a',
    dmgType: null,
    kind: 'economy',
    air: false,
    ground: false,
    upMul: 0.7,
    base: S({ income: 9, range: 2.5 }),
    grow: { income: 1.27 },
    growMul: { income: true },
    modules: [
      { apply: (s) => (s.interest = 0.02) },
      { apply: (s) => (s.killBonus = 2) },
    ],
    master: { apply: (s) => (s.income *= 1.25) },
  },
};

export const TOWER_ORDER = ['bolt', 'mortar', 'frost', 'tesla', 'sniper', 'acid', 'flame', 'amp', 'missile', 'mint', 'laser'];

// Gegner ------------------------------------------------------------------
// hp/armor werden mit der Welle skaliert. resist: Schadensmultiplikator je Art.
export const ENEMIES = {
  walker: { hp: 20, speed: 1.0, bounty: 3, leak: 1, color: '#ff7f6e', size: 0.2, cost: 1 },
  runner: { hp: 10, speed: 1.75, bounty: 2, leak: 1, color: '#f2d14b', size: 0.16, cost: 0.6, interval: 0.45 },
  brute: {
    hp: 58,
    speed: 0.62,
    armor: 3,
    bounty: 7,
    leak: 2,
    color: '#6f7d8f',
    size: 0.27,
    cost: 2.6,
    interval: 1.3,
    resist: { kinetic: 0.85, energy: 1.25 },
  },
  glider: {
    hp: 16,
    speed: 1.15,
    bounty: 4,
    leak: 1,
    color: '#7fd2ff',
    size: 0.2,
    cost: 1.1,
    flying: true,
    interval: 0.9,
  },
  splitter: {
    hp: 42,
    speed: 0.85,
    bounty: 4,
    leak: 2,
    color: '#a76cf0',
    size: 0.23,
    cost: 2.2,
    interval: 1.2,
    splits: { type: 'shard', count: 3 },
  },
  shard: { hp: 9, speed: 1.45, bounty: 1, leak: 1, color: '#c9a3ff', size: 0.12, cost: 0.4, child: true },
  mender: {
    hp: 32,
    speed: 0.9,
    bounty: 6,
    leak: 2,
    color: '#59d39a',
    size: 0.21,
    cost: 1.9,
    interval: 1.3,
    heal: { radius: 1.8, amount: 0.1, every: 2.5 },
    resist: { toxic: 0.6 },
  },
  warden: {
    hp: 26,
    shield: 32,
    speed: 0.88,
    bounty: 6,
    leak: 2,
    color: '#4f8df5',
    size: 0.22,
    cost: 1.9,
    interval: 1.1,
  },
  icebreaker: {
    hp: 46,
    speed: 0.95,
    armor: 1,
    bounty: 6,
    leak: 2,
    color: '#bfe9f2',
    size: 0.23,
    cost: 2.1,
    interval: 1.1,
    noSlow: true,
    resist: { cold: 0.5, fire: 1.5 },
  },
  colossus: {
    hp: 650,
    speed: 0.42,
    armor: 6,
    bounty: 70,
    leak: 8,
    color: '#c24a3c',
    size: 0.42,
    cost: 30,
    boss: true,
    resist: { energy: 1.2 },
    // Stampfer: legt Türme in der Nähe lahm
    stomp: { every: 7, radius: 2.1, stun: 2.2, windup: 0.9 },
  },
  brood: {
    hp: 480,
    speed: 0.5,
    armor: 2,
    bounty: 70,
    leak: 8,
    color: '#d0459b',
    size: 0.4,
    cost: 30,
    boss: true,
    spawns: { type: 'broodling', every: 2.6 },
    // Häutung: bei halbem Leben platzt ein Schwarm Brut heraus
    burst: { at: 0.5, count: 8 },
  },
  phantom: {
    hp: 430,
    speed: 0.55,
    armor: 3,
    bounty: 70,
    leak: 8,
    color: '#7b6cff',
    size: 0.38,
    cost: 30,
    boss: true,
    // Phasensprung: kurz unangreifbar, springt ein Stück nach vorn
    blink: { every: 6.5, dist: 1.5, phase: 1.0 },
  },
  aegis: {
    hp: 420,
    shield: 380,
    speed: 0.45,
    armor: 4,
    bounty: 70,
    leak: 8,
    color: '#e0b84a',
    size: 0.42,
    cost: 30,
    boss: true,
    // Schutzaura: gibt Gegnern in der Nähe regelmäßig einen Schild
    aura: { every: 5, radius: 2.3, amount: 0.35 },
  },
  broodling: { hp: 11, speed: 1.2, bounty: 1, leak: 1, color: '#ff8fd1', size: 0.13, cost: 0.4, child: true },
};

// In dieser Welle tauchen Gegnerarten zum ersten Mal auf
export const ENEMY_UNLOCK = { walker: 1, runner: 3, glider: 5, brute: 7, splitter: 9, mender: 12, warden: 14, icebreaker: 17 };

// Fähigkeiten -------------------------------------------------------------
// Bosse im Wechsel, jede 10. Welle
export const BOSS_ROTATION = ['colossus', 'brood', 'phantom', 'aegis'];

export const ABILITIES = {
  meteor: { key: 'Q', cooldown: 60, radius: 1.6, needsTarget: true, color: '#ff8a3d' },
  blizzard: { key: 'W', cooldown: 50, color: '#8fe3ff' },
  overdrive: { key: 'E', cooldown: 70, duration: 10, color: '#ffd84d' },
};

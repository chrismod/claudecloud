// Fortschritt: Erfahrung, Waldränge mit Vorteilen, Fluss-Kombo und Aufträge des Waldes.
// Reine Logik ohne DOM – meldet Ereignisse über on(type, data).

export const RANKS = [
  { name: 'Keimling', xp: 0, perk: '' },
  { name: 'Sprössling', xp: 350, perk: '+15 Sporen-Vorrat' },
  { name: 'Moosgänger', xp: 1000, perk: 'Der Sporenpuls reicht weiter' },
  { name: 'Hainhüter', xp: 2200, perk: 'Die Fäulnis zehrt weniger an euch' },
  { name: 'Waldweber', xp: 3900, perk: 'Der Fluss hält länger an' },
  { name: 'Myzelweise', xp: 6200, perk: '+25 Sporen-Vorrat' },
  { name: 'Hüter der Tiefe', xp: 9200, perk: 'Schnellere Regeneration' },
  { name: 'Ältester', xp: 13000, perk: 'Der Sporenpuls läutert stärker' },
];

export function rankInfo(xp) {
  let r = 0;
  while (r + 1 < RANKS.length && xp >= RANKS[r + 1].xp) r++;
  // nach dem letzten Rang: alle 5000 XP eine weitere Stufe des Ältesten
  let extra = 0;
  const last = RANKS[RANKS.length - 1].xp;
  if (xp >= last) extra = Math.floor((xp - last) / 5000);
  const lo = extra ? last + extra * 5000 : RANKS[r].xp;
  const hi = r + 1 < RANKS.length ? RANKS[r + 1].xp : last + (extra + 1) * 5000;
  const level = r + extra;
  const name = extra ? `${RANKS[r].name} ${toRoman(extra + 1)}` : RANKS[r].name;
  return { level, name, lo, hi, frac: (xp - lo) / (hi - lo) };
}

function toRoman(n) {
  const m = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, c] of m) while (n >= v) (s += c), (n -= v);
  return s;
}

export function perksFor(level) {
  return {
    maxSpores: (level >= 1 ? 15 : 0) + (level >= 5 ? 25 : 0),
    pulseRadius: level >= 2 ? 1.25 : 1,
    rotDrain: level >= 3 ? 0.6 : 1,
    comboHold: level >= 4 ? 2.6 : 1.6,
    regen: 1 + (level >= 6 ? 0.3 : 0) + Math.max(0, level - 7) * 0.1,
    pulseCleanse: level >= 7 ? 1 : 0.85,
  };
}

const TEMPLATES = {
  heal: (lv) => ({ goal: 700 + lv * 300, text: (n) => `Belebt ${fmt(n)} m² Waldboden` }),
  puff: (lv) => ({ goal: 3 + lv, text: (n) => `Lasst ${n} Boviste platzen` }),
  log: (lv) => ({ goal: 2 + Math.floor(lv / 2), text: (n) => `Zersetzt ${n}× Totholz` }),
  rot: (lv) => ({ goal: 160 + lv * 70, text: (n) => `Läutert ${fmt(n)} m² Fäulnis` }),
  nest: () => ({ goal: 1, text: () => 'Läutert ein Moderherz' }),
  tree: () => ({ goal: 1, text: () => 'Weckt einen Mutterbaum' }),
  thread: (lv) => ({ goal: 120 + lv * 40, text: (n) => `Webt gemeinsam ${fmt(n)} m² mit dem Faden` }),
  animal: (lv) => ({ goal: 2 + lv, text: (n) => `Lockt ${n} Tiere zurück` }),
  wisp: (lv) => ({ goal: 1 + Math.floor(lv / 3), text: (n) => (n === 1 ? 'Bringt ein verirrtes Licht heim' : `Bringt ${n} verirrte Lichter heim`) }),
  moderling: (lv) => ({ goal: 3 + Math.min(lv, 5), text: (n) => `Vertreibt ${n} Moderlinge` }),
  star: () => ({ goal: 1, text: () => 'Fangt eine Sternspore' }),
};
const fmt = (n) => Math.round(n).toLocaleString('de-DE');

export function createProgress(state, on = () => {}) {
  const s = Object.assign({ xp: 0, objectives: [], counters: {}, nextId: 1, firsts: {} }, state || {});
  let combo = 0;
  let comboT = 0;
  let level = rankInfo(s.xp).level;

  function addXP(amount, reason = '', pos = null) {
    if (amount <= 0) return;
    s.xp += amount;
    on('xp', { amount, reason, pos });
    const info = rankInfo(s.xp);
    if (info.level > level) {
      level = info.level;
      on('rank', { ...info, perk: RANKS[Math.min(level, RANKS.length - 1)].perk });
    }
  }

  const multiplier = () => 1 + Math.min(4, Math.floor(combo / 60));

  // frisch belebte Zellen speisen den Fluss
  function healed(cells, pos) {
    if (cells <= 0) return;
    combo += cells;
    comboT = perksFor(level).comboHold;
    s.counters.heal = (s.counters.heal || 0) + cells;
    bump('heal', cells);
    addXP(cells * 0.22 * multiplier(), 'heal', pos);
  }

  function event(kind, n = 1, pos = null) {
    s.counters[kind] = (s.counters[kind] || 0) + n;
    bump(kind, n);
    const xp = { puff: 12, log: 60, nest: 400, tree: 500, animal: 25, rot: 0.1, thread: 0.25, wisp: 160, moderling: 22, star: 70 }[kind] ?? 0;
    if (xp) addXP(xp * n * (kind === 'thread' ? multiplier() : 1), kind, pos);
    if (!s.firsts[kind]) {
      s.firsts[kind] = true;
      on('first', { kind });
    }
  }

  function bump(kind, n) {
    for (const o of s.objectives) {
      if (o.kind !== kind || o.done) continue;
      o.have = Math.min(o.goal, o.have + n);
      if (o.have >= o.goal) complete(o);
    }
  }

  function complete(o) {
    o.done = true;
    const reward = Math.round((140 + level * 45) * (o.timed ? 2 : 1));
    on('objective', { o, reward, spores: o.timed ? 60 : 30 });
    addXP(reward, 'objective');
  }

  function make(kind, lv, timed = null) {
    const t = TEMPLATES[kind](lv);
    const goal = timed ? Math.round(t.goal * 1.4) : t.goal;
    return { id: s.nextId++, kind, goal, have: 0, text: (timed ? timed.prefix : '') + t.text(goal), timed: !!timed, until: timed?.until ?? null, created: timed?.created ?? null, done: false };
  }

  // ctx: { dayTime, night, players, hasNest, hasTree }
  function update(dt, ctx) {
    comboT -= dt;
    if (comboT <= 0) combo = Math.max(0, combo - dt * Math.max(40, combo * 1.5));
    // abgelaufene und erledigte Aufträge entfernen
    const before = s.objectives.length;
    s.objectives = s.objectives.filter((o) => {
      if (o.done) return (o.shownT = (o.shownT ?? 2.5) - dt) > 0;
      if (o.timed && expired(o, ctx.dayTime)) {
        on('failed', { o });
        return false;
      }
      return true;
    });
    if (s.objectives.length !== before) on('changed', {});
    // auffüllen: zwei normale, ein zeitgebundener
    const open = s.objectives.filter((o) => !o.done);
    const kinds = new Set(open.map((o) => o.kind));
    if (!open.some((o) => o.timed)) {
      const night = ctx.night > 0.5 && (ctx.dayTime > 0.7 || ctx.dayTime < 0.2);
      const spec = night
        ? { kind: Math.random() < 0.5 ? 'rot' : 'moderling', prefix: 'Bis zum Morgen: ', until: 0.25, created: ctx.dayTime }
        : ctx.dayTime > 0.28 && ctx.dayTime < 0.62
          ? { kind: 'heal', prefix: 'Vor Einbruch der Nacht: ', until: 0.75, created: ctx.dayTime }
          : null;
      if (spec) {
        s.objectives.push(make(spec.kind, level, spec));
        kinds.add(spec.kind);
        on('changed', {});
      }
    }
    let normal = open.filter((o) => !o.timed).length;
    while (normal < 2) {
      normal++;
      const pool = ['heal', 'puff', 'log', 'rot', 'animal', 'wisp', 'wisp', 'star'];
      if (ctx.night > 0.5) pool.push('moderling', 'moderling');
      if (ctx.hasNest) pool.push('nest', 'nest');
      if (ctx.hasTree) pool.push('tree');
      if (ctx.players > 1) pool.push('thread', 'thread');
      const choices = pool.filter((k) => !kinds.has(k));
      const kind = choices[Math.floor(Math.random() * choices.length)] ?? 'puff';
      kinds.add(kind);
      s.objectives.push(make(kind, level));
      on('changed', {});
    }
  }

  function expired(o, dayTime) {
    // Frist: Abend (0.75) oder Morgen (0.25) – über Mitternacht hinweg vergleichen
    const created = o.created ?? (o.created = dayTime);
    const span = (o.until - created + 1) % 1;
    const passed = (dayTime - created + 1) % 1;
    return passed > span && passed - span < 0.5;
  }

  function timeLeft(o, dayTime) {
    const created = o.created ?? dayTime;
    const span = (o.until - created + 1) % 1;
    const passed = (dayTime - created + 1) % 1;
    return Math.max(0, span - passed);
  }

  return {
    state: s,
    addXP,
    healed,
    event,
    update,
    timeLeft,
    get combo() {
      return combo;
    },
    get multiplier() {
      return multiplier();
    },
    get level() {
      return level;
    },
    get perks() {
      return perksFor(level);
    },
    get info() {
      return rankInfo(s.xp);
    },
  };
}

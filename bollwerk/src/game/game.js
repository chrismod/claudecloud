// Simulationskern: Wellen, Gegner, Türme, Geschosse, Statuseffekte, Wirtschaft.
// Reines JavaScript ohne three.js – läuft im Browser und headless in Node (Tests, Balancing).
import { TOWERS, ENEMIES, ABILITIES, MAX_LEVEL, MODULE_LEVEL, SELL_RATE, RANKS, RANK_DMG, RANK_RANGE } from './data.js';
import { buildMap, posAt } from './maps.js';
import { generateWave, waveSchedule, hpMul, armorMul, bountyMul, speedMul, waveIncome, summarizeWave } from './waves.js';
import { makeRng, hashString } from './rng.js';

const STEP_MAX = 1 / 30;
const MULT_KEYS = new Set(['dmg', 'rate']);
const tmpPos = { seg: 0, x: 0, y: 0, dx: 0, dy: 0 };

export class Game {
  constructor(mapDef, opts = {}) {
    this.def = mapDef;
    this.map = buildMap(mapDef);
    this.seed = opts.seed ?? hashString(mapDef.id);
    this.rng = makeRng(this.seed ^ 0x9e3779b9);
    this.allowed = new Set(opts.towers ?? mapDef.towers);
    this.coins = opts.coins ?? mapDef.coins;
    this.lives = this.maxLives = mapDef.lives;
    this.goal = mapDef.goal;
    this.hpScale = mapDef.hpScale ?? 1;
    this.state = 'ready'; // ready | running | won | lost
    this.endless = false;
    this.wave = 0;
    this.time = 0;
    this.nextWaveT = null;
    this.spawnQueue = [];
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.fields = [];
    this.meteors = [];
    this.events = [];
    this.eventsOn = opts.events ?? true;
    this.towerAt = new Map();
    this.ids = 1;
    this.abilities = { meteor: 0, blizzard: 0, overdrive: 0 }; // verbleibende Abklingzeit
    this.overdriveT = 0;
    this.waveCache = new Map();
    this.stats = { kills: 0, earned: 0, leaked: 0, built: 0, bestWave: 0 };
  }

  emit(e) {
    if (this.eventsOn) this.events.push(e);
  }

  addCoins(n) {
    this.coins += n;
    this.stats.earned += n;
  }

  // Wellen ----------------------------------------------------------------
  waveDef(n) {
    if (!this.waveCache.has(n)) this.waveCache.set(n, generateWave(n, this.seed));
    return this.waveCache.get(n);
  }

  previewWave(n = this.wave + 1) {
    const w = this.waveDef(n);
    return { n, boss: w.boss, list: summarizeWave(w) };
  }

  earlyBonus() {
    if (this.state !== 'running' || this.nextWaveT == null) return 0;
    return Math.round(this.nextWaveT * (0.35 + 0.03 * this.wave));
  }

  canCallWave() {
    if (this.state === 'ready') return true;
    return this.state === 'running' && this.nextWaveT != null;
  }

  callWave() {
    if (!this.canCallWave()) return false;
    if (this.state === 'ready') {
      this.state = 'running';
    } else {
      const bonus = this.earlyBonus();
      if (bonus > 0) {
        this.addCoins(bonus);
        this.emit({ type: 'early', amount: bonus });
      }
    }
    this.startWave();
    return true;
  }

  startWave() {
    const n = ++this.wave;
    const w = this.waveDef(n);
    const sched = waveSchedule(w, this.map.paths.length);
    for (const s of sched) this.spawnQueue.push({ t: this.time + s.t, type: s.type, path: s.path, n });
    this.spawnQueue.sort((a, b) => a.t - b.t);
    const dur = sched.length ? sched[sched.length - 1].t : 0;
    this.nextWaveT = Math.min(45, Math.max(22, dur + 12));
    if (!this.endless && n >= this.goal) this.nextWaveT = null;

    this.addCoins(waveIncome(n));
    for (const t of this.towers) {
      t.fresh = false;
      if (t.def.kind !== 'economy') continue;
      let inc = Math.round(t.stats.income);
      if (t.stats.interest) inc += Math.round(Math.min(40 + 10 * t.level, this.coins * t.stats.interest));
      this.addCoins(inc);
      t.earned = (t.earned || 0) + inc;
      this.emit({ type: 'income', x: t.x, y: t.y, amount: inc, tower: t.id });
    }
    this.emit({ type: 'wave', n, boss: w.boss });
  }

  continueEndless() {
    if (this.state !== 'won') return;
    this.endless = true;
    this.state = 'running';
    this.nextWaveT = 15;
  }

  // Gegner ----------------------------------------------------------------
  spawnEnemy(type, pathIdx, n, dist = 0) {
    const def = ENEMIES[type];
    const path = def.flying ? this.map.airPaths[pathIdx] : this.map.paths[pathIdx];
    const hm = hpMul(n) * this.hpScale;
    const e = {
      id: this.ids++,
      type,
      def,
      n,
      path,
      pathIdx,
      flying: !!def.flying,
      boss: !!def.boss,
      maxHp: def.hp * hm,
      hp: def.hp * hm,
      maxShield: (def.shield || 0) * hm,
      shield: (def.shield || 0) * hm,
      armor: (def.armor || 0) * armorMul(n),
      speed: def.speed * speedMul(n),
      xpScale: 1 / (20 * hm),
      dist: Math.max(0, Math.min(dist, path.total - 0.05)),
      off: def.flying || def.boss ? 0 : this.rng.range(-0.15, 0.15),
      seg: 0,
      x: 0,
      y: 0,
      dx: 1,
      dy: 0,
      slow: 0,
      slowT: 0,
      freezeT: 0,
      burnDps: 0,
      burnT: 0,
      burnSrc: null,
      poisonDps: 0,
      poisonT: 0,
      poisonSrc: null,
      plague: 0,
      poisonVuln: 0,
      poisonSlow: 0,
      corrosion: 0,
      corrosionT: 0,
      brittle: 0,
      brittleT: 0,
      mark: 0,
      markT: 0,
      shieldWait: 0,
      healT: def.heal ? def.heal.every * (0.5 + this.rng() * 0.5) : 0,
      spawnT: def.spawns ? def.spawns.every : 0,
      hitT: 0,
      alive: true,
    };
    this.placeEnemy(e);
    this.enemies.push(e);
    this.emit({ type: 'spawn', id: e.id, enemy: type, x: e.x, y: e.y });
    return e;
  }

  placeEnemy(e) {
    posAt(e.path, e.dist, e);
    if (e.off) {
      e.x -= e.dy * e.off;
      e.y += e.dx * e.off;
    }
  }

  speedOf(e) {
    if (e.freezeT > 0) return 0;
    let slow = e.slowT > 0 ? e.slow : 0;
    if (e.poisonT > 0 && e.poisonSlow) slow = Math.max(slow, e.poisonSlow);
    if (e.boss) slow *= 0.5;
    return e.speed * (1 - slow);
  }

  updateEnemy(e, dt) {
    if (e.burnT > 0) {
      e.burnT -= dt;
      this.damage(e, e.burnDps * dt, 'fire', { src: e.burnSrc, dot: true });
      if (e.burnT <= 0) e.burnDps = 0;
    }
    if (e.poisonT > 0) {
      e.poisonT -= dt;
      this.damage(e, e.poisonDps * dt, 'toxic', { src: e.poisonSrc, dot: true });
      if (e.poisonT <= 0) e.poisonDps = 0;
    }
    if (!e.alive) return;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.freezeT > 0) e.freezeT -= dt;
    if (e.brittleT > 0) e.brittleT -= dt;
    if (e.markT > 0) e.markT -= dt;
    if (e.corrosionT > 0 && (e.corrosionT -= dt) <= 0) e.corrosion = 0;

    const def = e.def;
    if (e.maxShield > 0) {
      e.shieldWait -= dt;
      if (e.shieldWait <= 0 && e.shield < e.maxShield) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.25 * dt);
    }
    if (def.heal && (e.healT -= dt) <= 0) {
      e.healT = def.heal.every;
      const r2 = def.heal.radius * def.heal.radius;
      let healed = false;
      for (const o of this.enemies) {
        if (!o.alive || o.hp >= o.maxHp) continue;
        if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 > r2) continue;
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.heal.amount * (o.boss ? 0.25 : 1));
        healed = true;
      }
      if (healed) this.emit({ type: 'heal', x: e.x, y: e.y, r: def.heal.radius });
    }
    if (def.spawns && (e.spawnT -= dt) <= 0) {
      e.spawnT = def.spawns.every;
      this.spawnEnemy(def.spawns.type, e.pathIdx, e.n, e.dist - 0.3);
    }

    e.dist += this.speedOf(e) * dt;
    if (e.dist >= e.path.total) {
      this.leak(e);
      return;
    }
    this.placeEnemy(e);
  }

  leak(e) {
    e.alive = false;
    this.lives = Math.max(0, this.lives - e.def.leak);
    this.stats.leaked++;
    this.emit({ type: 'leak', id: e.id, enemy: e.type, x: e.x, y: e.y, amount: e.def.leak });
    if (this.lives <= 0 && this.state !== 'lost') {
      this.state = 'lost';
      this.nextWaveT = null;
      this.emit({ type: 'defeat', wave: this.wave });
    }
  }

  // Schaden & Effekte -----------------------------------------------------
  damage(e, amount, type, o = {}) {
    if (!e.alive || !(amount > 0)) return 0;
    let m = e.def.resist?.[type] ?? 1;
    if (e.brittleT > 0) m *= 1 + e.brittle;
    if (e.markT > 0) m *= 1 + e.mark;
    if (e.poisonT > 0 && e.poisonVuln) m *= 1 + e.poisonVuln;
    let dmg = amount * m;
    if (o.direct) {
      const armor = Math.max(0, e.armor - e.corrosion) * (1 - (o.pierce || 0));
      dmg = Math.max(dmg - armor, dmg * 0.2);
    }
    let dealt = 0;
    if (e.maxShield > 0) {
      e.shieldWait = 2.5;
      if (e.shield > 0) {
        const f = type === 'energy' ? 2 : 1;
        const absorb = Math.min(e.shield, dmg * f);
        e.shield -= absorb;
        dmg -= absorb / f;
        dealt += absorb;
      }
    }
    const hpDmg = Math.min(e.hp, dmg);
    e.hp -= dmg;
    dealt += hpDmg;
    if (!o.dot) e.hitT = 0.12;
    const src = o.src;
    if (src && src.alive !== false) {
      src.dealt += dealt;
      this.gainXp(src, dealt * e.xpScale);
    }
    if (e.hp <= 0.0001) this.kill(e, src);
    return dealt;
  }

  kill(e, src) {
    e.alive = false;
    e.hp = 0;
    const def = e.def;
    let mult = 1 + (src?.stats?.bountyBonus || 0);
    let bounty = Math.max(1, Math.round(def.bounty * bountyMul(e.n) * mult));
    for (const t of this.towers) {
      if (t.stats.killBonus && (t.x - e.x) ** 2 + (t.y - e.y) ** 2 <= t.stats.range ** 2) bounty += t.stats.killBonus;
    }
    this.addCoins(bounty);
    this.stats.kills++;
    if (src) src.kills++;
    this.emit({ type: 'death', id: e.id, enemy: e.type, x: e.x, y: e.y, bounty, flying: e.flying, boss: e.boss });
    if (def.splits) {
      for (let i = 0; i < def.splits.count; i++) {
        this.spawnEnemy(def.splits.type, e.pathIdx, e.n, e.dist + (i - (def.splits.count - 1) / 2) * 0.22);
      }
    }
    if (e.plague && e.poisonT > 0) {
      const r2 = e.plague * e.plague;
      for (const o of this.enemies) {
        if (!o.alive || o === e || (o.x - e.x) ** 2 + (o.y - e.y) ** 2 > r2) continue;
        this.poison(o, e.poisonDps, Math.max(2, e.poisonT), e.poisonSrc);
      }
      this.emit({ type: 'plague', x: e.x, y: e.y, r: e.plague });
    }
  }

  slowEnemy(e, amount, dur) {
    if (e.def.noSlow) return;
    if (e.slowT <= 0 || amount >= e.slow) {
      e.slow = amount;
      e.slowT = Math.max(e.slowT, dur);
    }
  }

  freeze(e, dur, stun = false) {
    if (!stun && e.def.noSlow) return;
    if (e.boss) dur *= 0.3;
    e.freezeT = Math.max(e.freezeT, dur);
  }

  burn(e, dps, dur, src) {
    if (dps >= e.burnDps || e.burnT <= 0) {
      e.burnDps = dps;
      e.burnSrc = src;
    }
    e.burnT = Math.max(e.burnT, dur);
  }

  poison(e, dps, dur, src, s = null) {
    const cap = dps * 3;
    e.poisonDps = Math.min(Math.max(cap, e.poisonDps), e.poisonDps + dps);
    e.poisonT = Math.max(e.poisonT, dur);
    e.poisonSrc = src;
    if (s) {
      if (s.plague) e.plague = s.plague;
      if (s.poisonVuln) e.poisonVuln = Math.max(e.poisonVuln, s.poisonVuln);
      if (s.poisonSlow) e.poisonSlow = Math.max(e.poisonSlow, s.poisonSlow);
    }
  }

  // Türme -----------------------------------------------------------------
  canBuild(type, cx, cy) {
    const def = TOWERS[type];
    if (!def) return { ok: false, reason: 'Unbekannt' };
    if (this.state === 'lost') return { ok: false, reason: 'Spiel vorbei' };
    if (!this.allowed.has(type)) return { ok: false, reason: 'Noch nicht freigeschaltet' };
    if (!this.map.isBuildable(cx, cy)) return { ok: false, reason: 'Kein Bauplatz' };
    if (this.towerAt.has(cy * this.map.W + cx)) return { ok: false, reason: 'Belegt' };
    if (this.coins < def.cost) return { ok: false, reason: 'Zu wenig Münzen' };
    return { ok: true };
  }

  build(type, cx, cy) {
    if (!this.canBuild(type, cx, cy).ok) return null;
    const def = TOWERS[type];
    const t = {
      id: this.ids++,
      type,
      def,
      cx,
      cy,
      x: cx + 0.5,
      y: cy + 0.5,
      tile: this.map.tileAt(cx, cy),
      level: 1,
      module: null,
      xp: 0,
      rank: 0,
      kills: 0,
      dealt: 0,
      spent: def.cost,
      fresh: true,
      targeting: def.targeting || 'first',
      cd: 0,
      aim: -Math.PI / 2,
      shots: 0,
      beam: null,
      beamTarget: null,
      beamTime: 0,
      buffedBy: null,
      stats: null,
      alive: true,
    };
    this.coins -= def.cost;
    this.towers.push(t);
    this.towerAt.set(cy * this.map.W + cx, t);
    this.stats.built++;
    this.refreshStats();
    this.emit({ type: 'build', id: t.id, tower: type, x: t.x, y: t.y });
    return t;
  }

  towerAtCell(cx, cy) {
    return this.towerAt.get(cy * this.map.W + cx) || null;
  }

  upgradeCost(t) {
    if (t.level >= MAX_LEVEL) return null;
    return Math.round(t.def.cost * (t.def.upMul ?? 0.6) * Math.pow(1.33, t.level - 1));
  }

  needsModule(t) {
    return t.level >= MODULE_LEVEL && t.module == null;
  }

  canUpgrade(t) {
    const c = this.upgradeCost(t);
    return c != null && !this.needsModule(t) && this.coins >= c && this.state !== 'lost';
  }

  upgrade(t) {
    if (!this.canUpgrade(t)) return false;
    const c = this.upgradeCost(t);
    this.coins -= c;
    t.spent += c;
    t.level++;
    this.refreshStats();
    this.emit({ type: 'upgrade', id: t.id, tower: t.type, level: t.level, x: t.x, y: t.y });
    return true;
  }

  chooseModule(t, idx) {
    if (!this.needsModule(t) || !t.def.modules[idx]) return false;
    t.module = idx;
    this.refreshStats();
    this.emit({ type: 'module', id: t.id, tower: t.type, module: idx, x: t.x, y: t.y });
    return true;
  }

  sellValue(t) {
    return t.fresh ? t.spent : Math.floor(t.spent * SELL_RATE);
  }

  sell(t) {
    const v = this.sellValue(t);
    this.coins += v;
    t.alive = false;
    this.towers.splice(this.towers.indexOf(t), 1);
    this.towerAt.delete(t.cy * this.map.W + t.cx);
    this.refreshStats();
    this.emit({ type: 'sell', id: t.id, tower: t.type, x: t.x, y: t.y, amount: v });
    return v;
  }

  setTargeting(t, mode) {
    t.targeting = mode;
    t.beamTarget = null;
  }

  // Grundwerte einer Stufe ohne Rang/Feld/Buffs – auch für die Vorschau im UI
  levelStats(type, level, module) {
    const d = TOWERS[type];
    const s = { ...d.base };
    const L = level - 1;
    for (const [k, v] of Object.entries(d.grow)) {
      if (MULT_KEYS.has(k) || d.growMul?.[k]) s[k] = (s[k] || 0) * Math.pow(v, L);
      else s[k] = (s[k] || 0) + v * L;
    }
    if (module != null && d.modules[module]) d.modules[module].apply(s);
    if (level >= MAX_LEVEL && d.master) d.master.apply(s);
    if (s.slow) s.slow = Math.min(0.75, s.slow);
    return s;
  }

  computeStats(t) {
    const s = this.levelStats(t.type, t.level, t.module);
    const attacker = t.def.kind !== 'support' && t.def.kind !== 'economy';
    if (attacker) {
      s.dmg *= 1 + RANK_DMG * t.rank;
      s.range *= 1 + RANK_RANGE * t.rank;
    }
    if (t.tile === 'D' && s.dmg) s.dmg *= 1.25;
    if (t.tile === 'R') s.range *= 1.2;
    if (t.tile === 'X') s.xpMul = 2;
    if (t.tile === 'C') s.bountyBonus = (s.bountyBonus || 0) + 0.3;
    return s;
  }

  refreshStats() {
    for (const t of this.towers) t.stats = this.computeStats(t);
    const amps = this.towers.filter((t) => t.def.kind === 'support');
    for (const t of this.towers) {
      t.buffedBy = null;
      if (t.def.kind === 'support' || t.def.kind === 'economy') continue;
      let best = null;
      for (const a of amps) {
        const r = a.stats.range + 0.01;
        if ((a.x - t.x) ** 2 + (a.y - t.y) ** 2 > r * r) continue;
        if (!best || a.stats.buffDmg > best.stats.buffDmg) best = a;
      }
      // Weitere Resonatoren steuern nur Modul-Boni bei, die Grundverstärkung zählt einmal
      const extra = { buffRange: 0, buffBounty: 0 };
      for (const a of amps) {
        const r = a.stats.range + 0.01;
        if ((a.x - t.x) ** 2 + (a.y - t.y) ** 2 > r * r) continue;
        extra.buffRange = Math.max(extra.buffRange, a.stats.buffRange || 0);
        extra.buffBounty = Math.max(extra.buffBounty, a.stats.buffBounty || 0);
      }
      if (!best) continue;
      const s = t.stats;
      t.buffedBy = best.id;
      if (s.dmg) s.dmg *= 1 + best.stats.buffDmg;
      if (s.rate) s.rate *= 1 + best.stats.buffRate;
      s.range *= 1 + extra.buffRange;
      s.bountyBonus = (s.bountyBonus || 0) + extra.buffBounty;
    }
  }

  gainXp(t, amount) {
    t.xp += amount * (t.stats.xpMul || 1);
    let up = false;
    while (t.rank < RANKS.length - 1 && t.xp >= RANKS[t.rank + 1]) {
      t.rank++;
      up = true;
    }
    if (up) {
      this.refreshStats();
      this.emit({ type: 'rank', id: t.id, rank: t.rank, x: t.x, y: t.y });
    }
  }

  canHit(t, e) {
    return e.flying ? t.def.air : t.def.ground;
  }

  score(t, e, d2) {
    let s;
    switch (t.targeting) {
      case 'last':
        s = e.path.total - e.dist;
        break;
      case 'strong':
        s = e.hp + e.shield;
        break;
      case 'weak':
        s = -(e.hp + e.shield);
        break;
      case 'near':
        s = -d2;
        break;
      default:
        s = -(e.path.total - e.dist);
    }
    if (t.def.preferAir && e.flying) s += 1e9;
    return s;
  }

  inRange(t, e, range) {
    const d2 = (e.x - t.x) ** 2 + (e.y - t.y) ** 2;
    if (d2 > range * range) return -1;
    const min = t.stats.minRange || 0;
    if (min && d2 < min * min) return -1;
    return d2;
  }

  bestTarget(t, range = t.stats.range) {
    let best = null;
    let bestScore = -Infinity;
    for (const e of this.enemies) {
      if (!e.alive || !this.canHit(t, e)) continue;
      const d2 = this.inRange(t, e, range);
      if (d2 < 0) continue;
      const sc = this.score(t, e, d2);
      if (sc > bestScore) {
        bestScore = sc;
        best = e;
      }
    }
    return best;
  }

  topTargets(t, k, range = t.stats.range) {
    const list = [];
    for (const e of this.enemies) {
      if (!e.alive || !this.canHit(t, e)) continue;
      const d2 = this.inRange(t, e, range);
      if (d2 < 0) continue;
      list.push([this.score(t, e, d2), e]);
    }
    list.sort((a, b) => b[0] - a[0]);
    return list.slice(0, k).map((x) => x[1]);
  }

  rollCrit(s) {
    return s.crit && this.rng() < s.crit ? s.critMul : 1;
  }

  aimAt(t, e) {
    t.aim = Math.atan2(e.y - t.y, e.x - t.x);
  }

  updateTower(t, dt) {
    const s = t.stats;
    const od = this.overdriveT > 0 ? 1.75 : 1;
    switch (t.def.kind) {
      case 'projectile':
      case 'lob':
      case 'homing':
      case 'hitscan':
      case 'chain':
      case 'pulse':
        t.cd = Math.max(0, t.cd - dt * od);
        if (t.cd > 0) return;
        if (this.fire(t, s)) {
          t.cd += 1 / s.rate;
          t.shots++;
          t.fresh = false;
        }
        return;
      case 'cone':
        return this.updateCone(t, s, dt * od);
      case 'beam':
        return this.updateBeam(t, s, dt, od);
      default:
    }
  }

  fire(t, s) {
    const kind = t.def.kind;
    if (kind === 'pulse') return this.firePulse(t, s);
    if (kind === 'projectile') {
      const n = s.multishot || 1;
      const targets = n > 1 ? this.topTargets(t, n) : [this.bestTarget(t)].filter(Boolean);
      if (!targets.length) return false;
      while (targets.length < n) targets.push(targets[0]);
      this.aimAt(t, targets[0]);
      for (const e of targets) {
        const crit = this.rollCrit(s);
        this.projectiles.push({ id: this.ids++, kind: 'bolt', src: t, x: t.x, y: t.y, target: e, speed: s.projSpeed, dmg: s.dmg * crit, crit: crit > 1, type: t.def.dmgType, pierce: s.armorPierce || 0, alive: true });
      }
      this.emit({ type: 'shot', id: t.id, tower: t.type });
      return true;
    }
    const e = this.bestTarget(t);
    if (!e) return false;
    this.aimAt(t, e);
    if (kind === 'lob') this.fireLob(t, s, e);
    else if (kind === 'homing') this.fireMissiles(t, s, e);
    else if (kind === 'hitscan') this.fireSniper(t, s, e);
    else if (kind === 'chain') this.fireChain(t, s, e);
    this.emit({ type: 'shot', id: t.id, tower: t.type });
    return true;
  }

  predict(e, time) {
    tmpPos.seg = e.seg;
    posAt(e.path, Math.min(e.path.total, e.dist + this.speedOf(e) * time), tmpPos);
    return { x: tmpPos.x - tmpPos.dy * e.off, y: tmpPos.y + tmpPos.dx * e.off };
  }

  fireLob(t, s, e) {
    const d = Math.hypot(e.x - t.x, e.y - t.y);
    const flight = s.flight * (0.55 + 0.45 * Math.min(1, d / s.range));
    const p = this.predict(e, flight);
    this.projectiles.push({
      id: this.ids++,
      kind: t.def.dmgType === 'toxic' ? 'glob' : 'shell',
      src: t,
      x0: t.x,
      y0: t.y,
      x1: p.x,
      y1: p.y,
      x: t.x,
      y: t.y,
      t: 0,
      dur: flight,
      arc: t.def.dmgType === 'toxic' ? 0.6 : 1.4,
      dmg: s.dmg,
      type: t.def.dmgType,
      splash: s.splash,
      cluster: s.cluster || 0,
      alive: true,
    });
  }

  fireMissiles(t, s, e) {
    const n = s.salvo || 1;
    const targets = n > 1 ? this.topTargets(t, n) : [e];
    for (let i = 0; i < n; i++) {
      const tg = targets[i % targets.length];
      const a = t.aim + (i - (n - 1) / 2) * 0.5;
      this.projectiles.push({
        id: this.ids++,
        kind: 'missile',
        src: t,
        x: t.x,
        y: t.y,
        vx: Math.cos(a),
        vy: Math.sin(a),
        speed: 1.5,
        maxSpeed: s.projSpeed,
        target: tg,
        tx: tg.x,
        ty: tg.y,
        life: 4,
        dmg: s.dmg,
        type: 'explosive',
        splash: s.splash,
        airMul: s.airMul || 1,
        delay: i * 0.06,
        alive: true,
      });
    }
  }

  fireSniper(t, s, e) {
    const crit = this.rollCrit(s);
    const dmg = s.dmg * crit;
    let x2 = e.x;
    let y2 = e.y;
    if (s.pierce) {
      const dx = e.x - t.x;
      const dy = e.y - t.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      x2 = t.x + ux * s.range;
      y2 = t.y + uy * s.range;
      for (const o of [...this.enemies]) {
        if (!o.alive || !this.canHit(t, o)) continue;
        const px = o.x - t.x;
        const py = o.y - t.y;
        const along = px * ux + py * uy;
        if (along < 0 || along > s.range) continue;
        if (Math.abs(px * uy - py * ux) > 0.28) continue;
        this.damage(o, dmg, 'kinetic', { direct: true, src: t });
        if (s.mark) ((o.mark = s.mark), (o.markT = s.markDur));
      }
    } else {
      this.damage(e, dmg, 'kinetic', { direct: true, src: t });
      if (s.mark) ((e.mark = s.mark), (e.markT = s.markDur));
    }
    this.emit({ type: 'tracer', id: t.id, x1: t.x, y1: t.y, x2, y2, crit: crit > 1 });
  }

  fireChain(t, s, first) {
    const hits = [first];
    const pts = [[t.x, t.y], [first.x, first.y]];
    let dmg = s.dmg;
    const stun = s.stunEvery && (t.shots + 1) % s.stunEvery === 0;
    this.damage(first, dmg, 'energy', { direct: true, src: t });
    if (stun) this.freeze(first, s.stunDur, true);
    let last = first;
    const n = Math.floor(s.chains);
    const r2 = s.chainRange * s.chainRange;
    for (let k = 0; k < n; k++) {
      let next = null;
      let nd = Infinity;
      for (const o of this.enemies) {
        if (!o.alive || hits.includes(o)) continue;
        const d2 = (o.x - last.x) ** 2 + (o.y - last.y) ** 2;
        if (d2 < r2 && d2 < nd) ((nd = d2), (next = o));
      }
      if (!next) break;
      dmg *= s.falloff;
      hits.push(next);
      pts.push([next.x, next.y]);
      this.damage(next, dmg, 'energy', { direct: true, src: t });
      if (stun) this.freeze(next, s.stunDur, true);
      last = next;
    }
    this.emit({ type: 'zap', id: t.id, pts, stun: !!stun });
  }

  firePulse(t, s) {
    const r2 = s.range * s.range;
    const hit = this.enemies.filter((e) => e.alive && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= r2);
    if (!hit.length) return false;
    for (const e of hit) {
      this.damage(e, s.dmg, 'cold', { src: t });
      if (!e.alive) continue;
      this.slowEnemy(e, s.slow, s.slowDur);
      if (s.brittle && !e.def.noSlow) ((e.brittle = s.brittle), (e.brittleT = s.slowDur));
      if (s.freezeChance && this.rng() < s.freezeChance) this.freeze(e, s.freezeDur);
    }
    this.emit({ type: 'pulse', id: t.id, x: t.x, y: t.y, r: s.range });
    return true;
  }

  updateCone(t, s, dt) {
    const e = this.bestTarget(t);
    if (!e) {
      t.beam = null;
      return;
    }
    this.aimAt(t, e);
    t.fresh = false;
    const half = ((s.cone / 2) * Math.PI) / 180;
    const cos = Math.cos(half);
    const ax = Math.cos(t.aim);
    const ay = Math.sin(t.aim);
    const r2 = s.range * s.range;
    let n = 0;
    for (const o of this.enemies) {
      if (!o.alive || o.flying) continue;
      const dx = o.x - t.x;
      const dy = o.y - t.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2);
      if (d > 0.35 && (dx * ax + dy * ay) / d < cos) continue;
      this.damage(o, s.dmg * dt, 'fire', { src: t, dot: true });
      if (o.alive) this.burn(o, s.burnDps, s.burnDur, t);
      n++;
    }
    t.beam = { kind: 'cone', range: s.range, cone: s.cone, n };
  }

  updateBeam(t, s, dt, od) {
    let e = t.beamTarget;
    if (!e || !e.alive || this.inRange(t, e, s.range) < 0) {
      e = this.bestTarget(t);
      t.beamTarget = e;
      t.beamTime = 0;
    }
    if (!e) {
      t.beam = null;
      return;
    }
    this.aimAt(t, e);
    t.fresh = false;
    t.beamTime += dt;
    const mult = 1 + (s.ramp - 1) * Math.min(1, t.beamTime / s.rampTime);
    const dps = s.dmg * mult * od;
    const list = [e];
    if (s.split) {
      const others = this.enemies
        .filter((o) => o.alive && o !== e && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 2.25)
        .sort((a, b) => (a.x - e.x) ** 2 + (a.y - e.y) ** 2 - ((b.x - e.x) ** 2 + (b.y - e.y) ** 2))
        .slice(0, s.split);
      list.push(...others);
    }
    this.damage(e, dps * dt, 'energy', { src: t, dot: true });
    if (s.beamBurn && e.alive) this.burn(e, s.dmg * s.beamBurn, s.burnDur, t);
    for (let i = 1; i < list.length; i++) this.damage(list[i], dps * 0.5 * dt, 'energy', { src: t, dot: true });
    t.beam = { kind: 'beam', list, mult: mult / s.ramp };
  }

  // Geschosse -------------------------------------------------------------
  explode(x, y, r, dmg, type, src, p = {}) {
    const r2 = r * r;
    const s = src?.stats || {};
    const air = p.air ?? src?.def.air ?? true;
    const ground = p.ground ?? src?.def.ground ?? true;
    for (const e of [...this.enemies]) {
      if (!e.alive) continue;
      if (e.flying ? !air : !ground) continue;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 > r2 + (e.def.size || 0.2) ** 2) continue;
      const m = e.flying && p.airMul ? p.airMul : 1;
      this.damage(e, dmg * m, type, { direct: !p.noArmor, src });
      if (!e.alive) continue;
      if (type === 'toxic' && s.poisonDps) {
        this.poison(e, s.poisonDps, s.poisonDur, src, s);
        e.corrosion = Math.min(e.armor, e.corrosion + s.corrosion);
        e.corrosionT = 4;
      }
      if (s.stunChance && this.rng() < s.stunChance) this.freeze(e, s.stunDur, true);
      if (p.burn) this.burn(e, p.burn, 3, src);
    }
    this.emit({ type: 'explosion', x, y, r, dmgType: type, big: !!p.big });
  }

  updateProjectile(p, dt) {
    if (p.kind === 'bolt') {
      const e = p.target;
      if (!e.alive) return (p.alive = false);
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= step + 0.1) {
        this.damage(e, p.dmg, p.type, { direct: true, src: p.src, pierce: p.pierce });
        this.emit({ type: 'hit', x: e.x, y: e.y, dmgType: p.type, crit: p.crit });
        p.alive = false;
        return;
      }
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      return;
    }
    if (p.kind === 'shell' || p.kind === 'glob' || p.kind === 'bomblet') {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.x0 + (p.x1 - p.x0) * k;
      p.y = p.y0 + (p.y1 - p.y0) * k;
      p.h = Math.sin(Math.PI * k) * p.arc;
      if (k < 1) return;
      p.alive = false;
      const s = p.src.stats;
      this.explode(p.x1, p.y1, p.splash, p.dmg, p.type, p.src, { ground: true, air: p.type === 'toxic' });
      if (p.cluster) {
        for (let i = 0; i < p.cluster; i++) {
          const a = (i / p.cluster) * Math.PI * 2 + this.rng() * 0.8;
          const r = 0.5 + this.rng() * 0.4;
          this.projectiles.push({ id: this.ids++, kind: 'bomblet', src: p.src, x0: p.x1, y0: p.y1, x1: p.x1 + Math.cos(a) * r, y1: p.y1 + Math.sin(a) * r, x: p.x1, y: p.y1, t: 0, dur: 0.35, arc: 0.4, dmg: p.dmg * 0.35, type: p.type, splash: 0.55, cluster: 0, alive: true });
        }
      }
      if (s.fireField && p.kind === 'shell') {
        this.fields.push({ id: this.ids++, x: p.x1, y: p.y1, r: p.splash * 0.85, dps: s.dmg * s.fieldFrac, t: s.fireField, dur: s.fireField, src: p.src });
      }
      return;
    }
    if (p.kind === 'missile') {
      if (p.delay > 0) {
        p.delay -= dt;
        return;
      }
      p.life -= dt;
      let e = p.target;
      if (!e || !e.alive) {
        e = p.target = this.nearestEnemy(p.tx, p.ty, 2.5, p.src);
      }
      if (e) ((p.tx = e.x), (p.ty = e.y));
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.18 || p.life <= 0) {
        p.alive = false;
        this.explode(p.x, p.y, p.splash, p.dmg, 'explosive', p.src, { airMul: p.airMul, air: true, ground: true });
        return;
      }
      const want = Math.atan2(dy, dx);
      let cur = Math.atan2(p.vy, p.vx);
      let diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const turn = 7 * dt;
      cur += Math.max(-turn, Math.min(turn, diff));
      p.vx = Math.cos(cur);
      p.vy = Math.sin(cur);
      p.speed = Math.min(p.maxSpeed, p.speed + 9 * dt);
      const step = Math.min(d, p.speed * dt);
      p.x += p.vx * step;
      p.y += p.vy * step;
    }
  }

  nearestEnemy(x, y, r, src) {
    let best = null;
    let bd = r * r;
    for (const e of this.enemies) {
      if (!e.alive || (src && !this.canHit(src, e))) continue;
      const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d2 < bd) ((bd = d2), (best = e));
    }
    return best;
  }

  // Fähigkeiten -----------------------------------------------------------
  abilityReady(key) {
    return this.state === 'running' && this.abilities[key] <= 0;
  }

  useAbility(key, x = 0, y = 0) {
    if (!this.abilityReady(key)) return false;
    const def = ABILITIES[key];
    this.abilities[key] = def.cooldown;
    if (key === 'meteor') {
      this.meteors.push({ x, y, t: 0.8 });
    } else if (key === 'blizzard') {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        this.freeze(e, 1.5);
        this.slowEnemy(e, 0.5, 6.5);
      }
    } else if (key === 'overdrive') {
      this.overdriveT = def.duration;
    }
    this.emit({ type: 'ability', key, x, y });
    return true;
  }

  // Hauptschleife ---------------------------------------------------------
  step(dt) {
    while (dt > 1e-9) {
      const h = Math.min(dt, STEP_MAX);
      this.tick(h);
      dt -= h;
    }
  }

  tick(dt) {
    if (this.state === 'lost') return;
    this.time += dt;
    for (const k in this.abilities) if (this.abilities[k] > 0) this.abilities[k] = Math.max(0, this.abilities[k] - dt);
    if (this.overdriveT > 0) this.overdriveT -= dt;

    if (this.state === 'running' && this.nextWaveT != null) {
      this.nextWaveT -= dt;
      if (this.nextWaveT <= 0) this.startWave();
    }
    while (this.spawnQueue.length && this.spawnQueue[0].t <= this.time) {
      const s = this.spawnQueue.shift();
      this.spawnEnemy(s.type, s.path, s.n);
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive) this.updateEnemy(e, dt);
    }
    for (const t of this.towers) this.updateTower(t, dt);
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p.alive) this.updateProjectile(p, dt);
    }
    for (const f of this.fields) {
      f.t -= dt;
      const r2 = f.r * f.r;
      for (const e of this.enemies) {
        if (e.alive && !e.flying && (e.x - f.x) ** 2 + (e.y - f.y) ** 2 <= r2) this.damage(e, f.dps * dt, 'fire', { src: f.src, dot: true });
      }
    }
    for (const m of this.meteors) {
      m.t -= dt;
      if (m.t <= 0) this.explode(m.x, m.y, ABILITIES.meteor.radius, 140 * hpMul(Math.max(1, this.wave)), 'explosive', null, { noArmor: true, air: true, ground: true, big: true, burn: 10 * hpMul(this.wave) });
    }

    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
    if (this.projectiles.some((p) => !p.alive)) this.projectiles = this.projectiles.filter((p) => p.alive);
    if (this.fields.length) this.fields = this.fields.filter((f) => f.t > 0);
    if (this.meteors.length) this.meteors = this.meteors.filter((m) => m.t > 0);
    for (const t of this.towers) if (t.beamTarget && !t.beamTarget.alive) t.beamTarget = null;

    if (this.state === 'running' && !this.endless && this.wave >= this.goal && !this.spawnQueue.length && !this.enemies.length) {
      this.state = 'won';
      this.emit({ type: 'victory', wave: this.wave });
    }
    this.stats.bestWave = Math.max(this.stats.bestWave, this.state === 'lost' ? this.wave - 1 : this.wave);
  }
}

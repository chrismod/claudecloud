// Einfacher Autopilot für Tests und Balancing: baut an Stellen mit viel Wegabdeckung,
// rüstet die schwächsten Türme auf und wählt Module nach einem festen Muster.
import { TOWERS } from './data.js';
import { posAt } from './maps.js';

export class Bot {
  constructor(game, opts = {}) {
    this.g = game;
    this.plan = opts.plan || ['bolt', 'mortar', 'frost', 'tesla', 'bolt', 'sniper', 'acid', 'flame', 'missile', 'laser'];
    this.plan = this.plan.filter((k) => game.allowed.has(k));
    this.moduleFor = opts.moduleFor || (() => 0);
    this.maxTowers = opts.maxTowers ?? ((w) => 3 + Math.floor(w * 0.45));
    this.idx = 0;
    this.useAbilities = opts.abilities ?? true;
    this.timer = 0;
    this.samples = { ground: [] };
    const tmp = { seg: 0 };
    for (const p of game.map.paths) {
      tmp.seg = 0;
      for (let d = 0; d < p.total; d += 0.25) {
        posAt(p, d, tmp);
        this.samples.ground.push({ x: tmp.x, y: tmp.y, w: 0.6 + (d / p.total) * 0.8 });
      }
    }
  }

  // Wie oft ist jede Wegprobe schon von bestehenden Türmen abgedeckt?
  covered() {
    const cov = this.samples.ground.map(() => 0);
    for (const t of this.g.towers) {
      const r = t.stats.range;
      if (!r || t.def.kind === 'support' || t.def.kind === 'economy') continue;
      this.samples.ground.forEach((p, i) => {
        if ((p.x - t.x) ** 2 + (p.y - t.y) ** 2 <= r * r) cov[i]++;
      });
    }
    return cov;
  }

  coverage(type, cx, cy, cov = null) {
    const s = this.g.levelStats(type, 1, null);
    const r = s.range * (this.g.map.tileAt(cx, cy) === 'R' ? 1.2 : 1);
    const min = s.minRange || 0;
    const x = cx + 0.5;
    const y = cy + 0.5;
    let score = 0;
    this.samples.ground.forEach((p, i) => {
      const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d2 <= r * r && d2 >= min * min) score += p.w / (1 + 0.8 * (cov ? cov[i] : 0));
    });
    if (this.g.map.tileAt(cx, cy) === 'D') score *= 1.25;
    return score;
  }

  bestSpot(type) {
    const g = this.g;
    let best = null;
    let bs = 0;
    const cov = this.covered();
    for (let y = 0; y < g.map.H; y++) {
      for (let x = 0; x < g.map.W; x++) {
        if (!g.map.isBuildable(x, y) || g.towerAtCell(x, y)) continue;
        const sc = this.coverage(type, x, y, cov);
        if (sc > bs) ((bs = sc), (best = [x, y]));
      }
    }
    return best;
  }

  // Fähigkeiten wie ein vorsichtiger Spieler: Notbremse kurz vor dem Kern, Orbitalschlag auf Bosse und Pulks
  abilities() {
    const g = this.g;
    const late = g.enemies.filter((e) => e.dist / e.path.total > 0.75);
    if (late.length >= 4 || late.some((e) => e.boss)) g.useAbility('blizzard');
    if (g.abilityReady('meteor')) {
      let best = null;
      let bs = 0;
      for (const e of g.enemies) {
        if (e.dist / e.path.total < 0.35) continue;
        let sc = e.boss ? 8 : 0;
        for (const o of g.enemies) if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 2.2) sc += o.hp / o.maxHp;
        if (sc > bs) ((bs = sc), (best = e));
      }
      if (best && bs >= 5) g.useAbility('meteor', best.x, best.y);
    }
    if (g.enemies.length >= 12 || g.enemies.some((e) => e.boss)) g.useAbility('overdrive');
  }

  update(dt) {
    const g = this.g;
    if (g.state === 'ready') g.callWave();
    if (g.state === 'won') g.continueEndless();
    if ((this.timer -= dt) > 0) return;
    this.timer = 0.5;
    if (this.useAbilities) this.abilities();
    for (const t of g.towers) if (g.needsModule(t)) g.chooseModule(t, this.moduleFor(t));
    for (let guard = 0; guard < 10; guard++) {
      const attackers = g.towers.filter((t) => t.def.kind !== 'support' && t.def.kind !== 'economy');
      const next = this.plan[this.idx % this.plan.length];
      if (attackers.length < this.maxTowers(g.wave) && next) {
        if (g.coins < TOWERS[next].cost) return;
        const spot = this.bestSpot(next);
        if (!spot) {
          this.idx++;
          continue;
        }
        g.build(next, spot[0], spot[1]);
        this.idx++;
        continue;
      }
      const up = attackers.filter((t) => g.upgradeCost(t) != null).sort((a, b) => a.level - b.level || a.spent - b.spent)[0];
      if (!up || !g.canUpgrade(up)) return;
      g.upgrade(up);
    }
  }
}

// Spielt eine Karte bis zur Niederlage oder bis maxWave; liefert erreichte Welle
export function runBot(game, opts = {}) {
  const bot = new Bot(game, opts);
  const dt = 1 / 30;
  const maxWave = opts.maxWave ?? 200;
  const maxTime = opts.maxTime ?? 60 * 60 * 3;
  while (game.state !== 'lost' && game.time < maxTime) {
    bot.update(dt);
    game.step(dt);
    game.events.length = 0;
    if (game.wave > maxWave) break;
  }
  return { wave: game.state === 'lost' ? game.wave : game.wave, lost: game.state === 'lost', time: game.time, towers: game.towers.length, lives: game.lives };
}

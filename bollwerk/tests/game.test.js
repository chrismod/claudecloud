import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, pathCells, buildMap } from '../src/game/maps.js';
import { Game } from '../src/game/game.js';
import { runBot } from '../src/game/bot.js';
import { TOWERS, ENEMIES, TOWER_ORDER, MAX_LEVEL } from '../src/game/data.js';
import { generateWave, hpMul } from '../src/game/waves.js';

// Testkarte: gerader Weg, Plattformreihe darüber und darunter
const STRIP = {
  id: 'test',
  name: 'Test',
  goal: 3,
  coins: 100000,
  lives: 20,
  towers: TOWER_ORDER,
  grid: ['##########', 'S========B', '##########'],
  paths: [[[0, 1], [9, 1]]],
};

test('Karten: Raster und Wege stimmen überein', () => {
  for (const m of MAPS) {
    const W = m.grid[0].length;
    for (const row of m.grid) assert.equal(row.length, W, `${m.id}: Zeilenlänge`);
    const road = new Set();
    for (const wp of m.paths) for (const [x, y] of pathCells(wp)) road.add(`${x},${y}`);
    m.grid.forEach((row, y) =>
      [...row].forEach((c, x) => {
        const on = road.has(`${x},${y}`);
        assert.equal(on, '=SB'.includes(c), `${m.id}: Feld ${x},${y} ('${c}')`);
      }),
    );
    const last = m.paths[0][m.paths[0].length - 1];
    for (const p of m.paths) assert.deepEqual(p[p.length - 1], last, `${m.id}: alle Wege enden am Kern`);
    for (const t of m.towers) assert.ok(TOWERS[t], `${m.id}: Turm ${t}`);
    assert.ok(buildMap(m).paths.every((p) => p.total > 10));
  }
});

test('Wellen sind deterministisch und werden stärker', () => {
  assert.deepEqual(generateWave(12, 5), generateWave(12, 5));
  for (let n = 1; n < 60; n++) assert.ok(hpMul(n + 1) > hpMul(n));
  for (let n = 1; n <= 40; n++) {
    const w = generateWave(n, 3);
    for (const g of w.groups) assert.ok(ENEMIES[g.type] && g.count > 0, `Welle ${n}`);
    assert.equal(w.boss, n % 10 === 0);
  }
});

test('Gleiche Saat, gleicher Spielverlauf', () => {
  const play = () => {
    const g = new Game(MAPS[1], { seed: 42, events: false });
    const r = runBot(g, { maxWave: 15 });
    return [r.wave, g.coins, g.lives, g.stats.kills, g.towers.map((t) => `${t.type}${t.level}@${t.cx},${t.cy}`).join()];
  };
  assert.deepEqual(play(), play());
});

test('Bauen, Aufrüsten, Modul, Verkaufen', () => {
  const g = new Game(STRIP);
  assert.equal(g.build('bolt', 1, 1), null, 'nicht auf dem Weg');
  const t = g.build('bolt', 2, 0);
  assert.ok(t);
  assert.equal(g.build('mortar', 2, 0), null, 'Feld belegt');
  const coins0 = g.coins;
  for (let i = 1; i < 5; i++) assert.ok(g.upgrade(t));
  assert.equal(t.level, 5);
  assert.equal(g.upgrade(t), false, 'ohne Modul geht es nicht weiter');
  assert.ok(g.chooseModule(t, 0));
  assert.equal(t.stats.multishot, 2);
  while (g.upgrade(t));
  assert.equal(t.level, MAX_LEVEL);
  assert.equal(t.stats.crit, 0.2, 'Meisterstufe aktiv');
  assert.equal(g.sellValue(t), t.spent, 'noch unbenutzt: volle Erstattung');
  g.callWave();
  assert.ok(g.sellValue(t) < t.spent);
  const before = g.coins;
  g.sell(t);
  assert.ok(g.coins > before && g.coins < coins0 + TOWERS.bolt.cost);
  assert.equal(g.towers.length, 0);
});

test('Resonator verstärkt Nachbarn', () => {
  const g = new Game(STRIP);
  const t = g.build('bolt', 3, 0);
  const dmg = t.stats.dmg;
  g.build('amp', 4, 0);
  assert.ok(t.stats.dmg > dmg * 1.1);
  assert.equal(t.buffedBy != null, true);
});

// Jeder Turm muss allein eine Handvoll Wanderer erledigen können
for (const type of TOWER_ORDER) {
  const kind = TOWERS[type].kind;
  if (kind === 'support' || kind === 'economy' || type === 'frost') continue;
  test(`Turm ${type} besiegt Gegner`, () => {
    const g = new Game(STRIP, { events: false });
    g.build(type, 4, 0);
    g.state = 'running';
    for (let i = 0; i < 4; i++) g.spawnEnemy('walker', 0, 1, -i * 0.6);
    for (let i = 0; i < 30 * 15 && g.enemies.length; i++) g.step(1 / 30);
    assert.equal(g.enemies.length, 0);
    assert.ok(g.lives >= 18, `${type}: ${20 - g.lives} durchgelassen`);
    assert.ok(g.towers[0].dealt > 0);
  });
}

test('Frostkristall verlangsamt alles in Reichweite', () => {
  const g = new Game(STRIP, { events: false });
  g.build('frost', 2, 0);
  g.state = 'running';
  const a = g.spawnEnemy('walker', 0, 1, 1.5);
  const b = g.spawnEnemy('glider', 0, 1, 1.8);
  g.step(0.1);
  assert.ok(g.speedOf(a) < a.speed * 0.75 && g.speedOf(b) < b.speed * 0.75);
});

test('Flieger: Mörser trifft nicht, Schwarm trifft hart', () => {
  const g = new Game(STRIP, { events: false });
  g.build('mortar', 4, 0);
  g.state = 'running';
  g.spawnEnemy('glider', 0, 1);
  for (let i = 0; i < 30 * 20 && g.enemies.length; i++) g.step(1 / 30);
  assert.equal(g.lives, 19, 'Gleiter kommt am Mörser vorbei');
  const g2 = new Game(STRIP, { events: false });
  g2.build('missile', 4, 0);
  g2.state = 'running';
  g2.spawnEnemy('glider', 0, 1);
  for (let i = 0; i < 30 * 20 && g2.enemies.length; i++) g2.step(1 / 30);
  assert.equal(g2.lives, 20);
});

test('Spalter zerfällt, Schild schluckt Schaden, Eisbrecher ignoriert Frost', () => {
  const g = new Game(STRIP, { events: false });
  g.state = 'running';
  const s = g.spawnEnemy('splitter', 0, 1, 3);
  g.damage(s, 1e6, 'kinetic');
  assert.equal(g.enemies.filter((e) => e.alive && e.type === 'shard').length, 3);

  const w = g.spawnEnemy('warden', 0, 1);
  const hp = w.hp;
  g.damage(w, 10, 'energy');
  assert.equal(w.hp, hp, 'Energie trifft zuerst den Schild');
  assert.equal(w.shield, w.maxShield - 20, 'Energie wirkt doppelt auf Schilde');

  const ice = g.spawnEnemy('icebreaker', 0, 1);
  g.slowEnemy(ice, 0.5, 3);
  g.freeze(ice, 2);
  assert.equal(g.speedOf(ice), ice.speed);
});

test('Panzerung bremst kleine Treffer, Säure zersetzt sie', () => {
  const g = new Game(STRIP, { events: false });
  const b = g.spawnEnemy('brute', 0, 1);
  const dealt = g.damage(b, 4, 'explosive', { direct: true });
  assert.ok(dealt < 1.5, `Panzerung: ${dealt}`);
  b.corrosion = b.armor;
  assert.ok(g.damage(b, 4, 'explosive', { direct: true }) > 3.9);
});

test('Ziel erreicht → Sieg, danach Endlosmodus', () => {
  const g = new Game(STRIP, { events: false });
  for (let x = 0; x < 10; x++) g.build('bolt', x, 0);
  g.callWave();
  for (let i = 0; i < 30 * 300 && g.state === 'running'; i++) g.step(1 / 30);
  assert.equal(g.state, 'won');
  assert.equal(g.wave, 3);
  g.continueEndless();
  assert.equal(g.state, 'running');
  g.step(20);
  assert.equal(g.wave, 4);
});

test('Wellen früh rufen bringt Bonus', () => {
  const g = new Game(STRIP, { events: false });
  g.callWave();
  g.step(1);
  const bonus = g.earlyBonus();
  assert.ok(bonus > 0);
  const c = g.coins;
  g.callWave();
  assert.ok(g.coins >= c + bonus);
  assert.equal(g.wave, 2);
});

test('Balance: der Bot erreicht auf jeder Karte das Ziel', () => {
  for (const m of MAPS) {
    const g = new Game(m, { seed: 7, events: false });
    const r = runBot(g, { maxWave: m.goal + 1 });
    assert.ok(r.wave > m.goal || (!r.lost && g.wave >= m.goal), `${m.id}: nur Welle ${r.wave}`);
  }
});

test('Balance: irgendwann fällt jede Festung', () => {
  const g = new Game(MAPS[0], { seed: 7, events: false });
  const r = runBot(g, { maxWave: 150 });
  assert.ok(r.lost && r.wave < 120, `Welle ${r.wave}`);
});

test('Forschung wirkt auf Start, Kosten, Schaden und Kern', async () => {
  const { researchMods, canResearch, crystalsFor, RESEARCH } = await import('../src/game/research.js');
  const plain = new Game(MAPS[0]);
  const g = new Game(MAPS[0], { research: { startCoins: 5, lives: 2, buildCost: 3, kinetic: 2, veteran: 1 } });
  assert.ok(g.coins > plain.coins);
  assert.equal(g.maxLives, plain.maxLives + 4);
  assert.ok(g.costOf('bolt') < TOWERS.bolt.cost);
  const a = plain.build('bolt', 3, 3);
  const b = g.build('bolt', 3, 3);
  assert.ok(b.stats.dmg > a.stats.dmg * 1.15, 'Ballistik + Veteranenrang');
  assert.equal(b.rank, 1);
  // Kette: zweiter Knoten braucht den ersten
  assert.equal(canResearch({}, 999, 'income').reason, 'locked');
  assert.ok(canResearch({ startCoins: 1 }, 999, 'income').ok);
  assert.equal(canResearch({}, 1, 'startCoins').reason, 'crystals');
  assert.ok(crystalsFor(0, 20, true, true) > crystalsFor(0, 20, false, false));
  assert.ok(crystalsFor(4, 20, false, false) > crystalsFor(0, 20, false, false));
  for (const r of RESEARCH) assert.equal(r.cost.length, r.max, r.id);
  assert.equal(researchMods({}).dmg.kinetic, 1);
});

test('Kernbarriere hält Gegner auf, Bosse nicht', () => {
  const g = new Game(STRIP, { events: false, research: { barrier: 1 } });
  g.callWave();
  g.spawnQueue.length = 0;
  const e = g.spawnEnemy('walker', 0, 1, g.map.paths[0].total - 0.05);
  g.step(0.2);
  assert.equal(g.lives, 20);
  assert.ok(!e.alive);
  g.spawnEnemy('walker', 0, 1, g.map.paths[0].total - 0.05);
  g.step(0.2);
  assert.equal(g.lives, 19, 'nur eine Barriere pro Welle');
});

test('Koloss stampft und legt Türme lahm', () => {
  const g = new Game(STRIP, { events: true });
  const t = g.build('bolt', 4, 0);
  g.state = 'running';
  const boss = g.spawnEnemy('colossus', 0, 10, 3.5);
  boss.speed = 0;
  boss.abilityT = 0;
  g.step(1.2);
  assert.ok(t.disabledT > 0, 'Turm lahmgelegt');
  assert.ok(g.events.some((e) => e.type === 'boss' && e.ability === 'stomp'));
  const shots = t.shots;
  g.step(0.5);
  assert.equal(t.shots, shots, 'lahmgelegter Turm schießt nicht');
});

test('Phantom springt und ist dabei unangreifbar', () => {
  const g = new Game(STRIP, { events: false });
  g.state = 'running';
  const p = g.spawnEnemy('phantom', 0, 10, 1);
  p.abilityT = 0;
  const d0 = p.dist;
  g.step(1 / 30);
  assert.ok(p.dist > d0 + 1);
  assert.ok(p.phaseT > 0);
  const hp = p.hp;
  assert.equal(g.damage(p, 100, 'kinetic'), 0);
  assert.equal(p.hp, hp);
  const t = g.build('sniper', 4, 0);
  assert.equal(g.bestTarget(t), null);
});

test('Ägis schirmt Begleiter ab, Brutmutter platzt auf', () => {
  const g = new Game(STRIP, { events: false });
  g.state = 'running';
  const a = g.spawnEnemy('aegis', 0, 10, 4);
  const w = g.spawnEnemy('walker', 0, 10, 4.5);
  a.abilityT = 0;
  g.step(1 / 30);
  assert.ok(w.shield > 0 && w.maxShield > 0);
  const b = g.spawnEnemy('brood', 0, 10, 6);
  const before = g.enemies.length;
  g.damage(b, b.maxHp * 0.6, 'kinetic');
  g.step(1 / 30);
  assert.ok(g.enemies.length >= before + 8);
});

test('Bosse wechseln sich ab', () => {
  const types = [10, 20, 30, 40, 50].map((n) => generateWave(n, 1).groups.find((x) => ENEMIES[x.type].boss).type);
  assert.deepEqual(types, ['colossus', 'brood', 'phantom', 'aegis', 'colossus']);
});

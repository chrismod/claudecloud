// Karten: 30 Level in 6 Kapiteln. Zeichen im Raster:
//   .  Wiese (nicht bebaubar, Deko)      #  Plattform (bebaubar)
//   =  Weg      S  Portal (Weganfang)    B  Kern (Wegende)
//   D R X C  Sonderplattformen (siehe TILE_BONUS)
// Wege werden als Wegpunkte (Zellkoordinaten) angegeben. Die ersten fünf Karten sind von Hand gezeichnet,
// bei den übrigen entstehen Plattformen und Sonderfelder reproduzierbar entlang der Wege (generateGrid).
import { TOWER_ORDER } from './data.js';
import { makeRng, hashString } from './rng.js';
import { HP_SCALE } from './tuning.js';

// Von Hand gezeichnete Karten
const HAND = [
  {
    id: 'lichtung',
    grid: [
      '.................',
      '..###.###.##.....',
      'S============#...',
      '.###.###.###=#...',
      '.##...##.D##=#...',
      '....=========#...',
      '..##=##.R##.##...',
      '..##=#..###..##..',
      '....===========B.',
      '...###.###.###.#.',
      '.................',
    ],
    paths: [
      [[0, 2], [12, 2], [12, 5], [4, 5], [4, 8], [15, 8]],
    ],
  },
  {
    id: 'gabelung',
    grid: [
      '..................',
      'S=====.##.######..',
      '.##.#=#.#.======#.',
      '.#D#.=#.##=####=#.',
      '.###.=#.##=#R##=#.',
      '.....=#..#=####=#.',
      '.##..======.#.#=#.',
      '.##..=#.###.#C#=#.',
      '.#X#.=#.###.###=#.',
      '.###.=#.......#B#.',
      '.....=#.###.###...',
      'S=====.##.........',
    ],
    paths: [
      [[0, 1], [5, 1], [5, 6], [10, 6], [10, 2], [15, 2], [15, 9]],
      [[0, 11], [5, 11], [5, 6], [10, 6], [10, 2], [15, 2], [15, 9]],
    ],
  },
  {
    id: 'spirale',
    grid: [
      '...............',
      'S=============.',
      '.############=.',
      '.#####D######=.',
      '.==========##=.',
      '.=########=##=.',
      '.=###X####=##=.',
      '.=########=##=.',
      '.=##B======##=.',
      '.=###########=.',
      '.=####R######=.',
      '.=============.',
      '...............',
    ],
    paths: [
      [[0, 1], [13, 1], [13, 11], [1, 11], [1, 4], [10, 4], [10, 8], [4, 8]],
    ],
  },
  {
    id: 'kreuzweg',
    grid: [
      '.................',
      '....===========B.',
      '.###=##.###.##...',
      'S============#...',
      '.##.=#D#.##.=##..',
      '.##.=###.##.=#...',
      '..#.=.#R#.#.=#.#.',
      '.##.=###.##.====S',
      '.##.=#X#.##.=###.',
      '....=..###..=....',
      '....=========....',
      '...####.C.####...',
    ],
    paths: [
      [[0, 3], [12, 3], [12, 10], [4, 10], [4, 1], [15, 1]],
      [[16, 7], [12, 7], [12, 10], [4, 10], [4, 1], [15, 1]],
    ],
  },
  {
    id: 'dreiklang',
    grid: [
      '.....................',
      'S========.#.========S',
      '.###.##.=###=.##.###.',
      '.##======.R.======##.',
      '.##=#D##.###.##D#=##.',
      '...=####.#X#.####=...',
      '.##=======B=======##.',
      '...=####.#C#.####....',
      '.##=#X##.###.###.##..',
      '.##======.###.###....',
      '.###.##.=###.........',
      'S========............',
      '.#######.............',
    ],
    paths: [
      [[0, 1], [8, 1], [8, 3], [3, 3], [3, 6], [10, 6]],
      [[20, 1], [12, 1], [12, 3], [17, 3], [17, 6], [10, 6]],
      [[0, 11], [8, 11], [8, 9], [3, 9], [3, 6], [10, 6]],
    ],
  },
];
const HAND_BY_ID = Object.fromEntries(HAND.map((m) => [m.id, m]));

// Kapitel: Landschaft und ab welcher Welle Gegnerarten früher auftauchen
export const CHAPTERS = [
  { id: 'vale', theme: 'meadow', shift: 0 },
  { id: 'woods', theme: 'autumn', shift: 1 },
  { id: 'dunes', theme: 'desert', shift: 2 },
  { id: 'frost', theme: 'snow', shift: 3 },
  { id: 'embers', theme: 'volcano', shift: 4 },
  { id: 'stars', theme: 'night', shift: 5 },
];

// Ab welchem Level (Index) ein Turm verfügbar ist
export const TOWER_UNLOCK = { bolt: 0, mortar: 0, frost: 0, tesla: 0, sniper: 1, acid: 2, flame: 3, amp: 4, missile: 5, mint: 6, laser: 7 };

const GOALS = [20, 20, 25, 25, 25, 25, 25, 30, 30, 30, 30, 30, 30, 30, 35, 30, 30, 35, 35, 35, 35, 35, 35, 35, 40, 35, 35, 40, 40, 40];

// Reihenfolge der Level. size + paths reichen; Besonderheiten:
//   bias: Gewichte für Gegnerarten · bossEvery: Bosswelle alle n Wellen · lives: Kernleben
const LEVELS = [
  // 1 · Grüntal
  { id: 'lichtung' },
  { id: 'bachlauf', size: [17, 11], paths: [[[0, 5], [4, 5], [4, 1], [9, 1], [9, 9], [13, 9], [13, 5], [15, 5]]] },
  { id: 'gabelung' },
  {
    id: 'huegelkamm',
    size: [19, 12],
    paths: [
      [[0, 3], [7, 3], [7, 9], [13, 9], [13, 5], [17, 5]],
      [[16, 0], [16, 2], [10, 2], [10, 6], [13, 6], [13, 5], [17, 5]],
    ],
  },
  { id: 'kreuzweg' },
  // 2 · Bernsteinwald
  { id: 'laubpfad', size: [18, 12], paths: [[[0, 1], [15, 1], [15, 4], [2, 4], [2, 7], [15, 7], [15, 10], [2, 10]]] },
  {
    id: 'zweibaeche',
    size: [18, 13],
    paths: [
      [[0, 2], [10, 2], [10, 6], [16, 6]],
      [[0, 10], [13, 10], [13, 6], [16, 6]],
    ],
  },
  { id: 'spirale' },
  { id: 'wurzelwerk', size: [17, 13], paths: [[[0, 6], [8, 6], [8, 2], [13, 2], [13, 10], [3, 10], [3, 3]]] },
  { id: 'dreiklang' },
  // 3 · Dünenmeer
  {
    id: 'oase',
    size: [17, 11],
    bias: { glider: 2.5 },
    paths: [
      [[0, 1], [6, 1], [6, 4], [2, 4], [2, 8], [8, 8]],
      [[16, 1], [10, 1], [10, 4], [14, 4], [14, 8], [8, 8]],
    ],
  },
  { id: 'karawane', size: [21, 11], bias: { runner: 3 }, paths: [[[0, 1], [3, 1], [3, 9], [7, 9], [7, 1], [11, 1], [11, 9], [15, 9], [15, 1], [19, 1], [19, 9]]] },
  {
    id: 'sandsturm',
    size: [19, 13],
    paths: [
      [[0, 1], [3, 1], [3, 7], [6, 7], [6, 11], [9, 11]],
      [[18, 1], [15, 1], [15, 7], [12, 7], [12, 11], [9, 11]],
      [[9, 0], [9, 11]],
    ],
  },
  { id: 'fatamorgana', size: [19, 13], paths: [[[0, 3], [14, 3], [14, 10], [5, 10], [5, 1], [17, 1], [17, 11]]] },
  {
    id: 'sphinx',
    size: [20, 12],
    bossEvery: 5,
    paths: [
      [[0, 1], [8, 1], [8, 5], [3, 5], [3, 10], [16, 10], [16, 6], [18, 6]],
      [[19, 1], [12, 1], [12, 6], [16, 6], [18, 6]],
    ],
  },
  // 4 · Frostgipfel
  { id: 'gletscher', size: [18, 12], paths: [[[0, 9], [4, 9], [4, 2], [8, 2], [8, 9], [12, 9], [12, 2], [16, 2]]] },
  {
    id: 'lawine',
    size: [18, 13],
    bias: { brute: 3, icebreaker: 2 },
    paths: [
      [[2, 0], [2, 5], [6, 5], [6, 9], [9, 9], [9, 11]],
      [[15, 0], [15, 5], [12, 5], [12, 9], [9, 9], [9, 11]],
    ],
  },
  {
    id: 'eisgrat',
    size: [21, 13],
    paths: [
      [[0, 2], [18, 2], [18, 6], [2, 6], [2, 10], [18, 10]],
      [[10, 12], [10, 10], [18, 10]],
    ],
  },
  {
    id: 'frostbiss',
    size: [19, 13],
    lives: 10,
    paths: [
      [[0, 1], [16, 1], [16, 11], [4, 11], [4, 6], [9, 6]],
      [[18, 8], [12, 8], [12, 4], [9, 4], [9, 6]],
    ],
  },
  {
    id: 'nordlicht',
    size: [21, 13],
    paths: [
      [[0, 1], [5, 1], [5, 7], [10, 7], [10, 11]],
      [[20, 1], [15, 1], [15, 7], [10, 7], [10, 11]],
      [[10, 0], [10, 11]],
    ],
  },
  // 5 · Glutöde
  { id: 'aschefeld', size: [19, 13], paths: [[[0, 6], [4, 6], [4, 1], [14, 1], [14, 11], [8, 11], [8, 5]]] },
  {
    id: 'magmastrom',
    size: [19, 13],
    bias: { splitter: 3 },
    paths: [
      [[0, 2], [12, 2], [12, 10], [9, 10]],
      [[18, 5], [6, 5], [6, 10], [9, 10]],
    ],
  },
  {
    id: 'caldera',
    size: [19, 13],
    paths: [
      [[0, 1], [17, 1], [17, 11], [2, 11], [2, 4], [9, 4], [9, 6]],
      [[18, 6], [9, 6]],
    ],
  },
  {
    id: 'obsidian',
    size: [20, 13],
    bias: { warden: 2.5, mender: 2.5 },
    paths: [
      [[1, 0], [1, 11], [5, 11], [5, 1], [9, 1], [9, 11], [13, 11], [13, 6], [18, 6]],
      [[16, 12], [16, 6], [18, 6]],
    ],
  },
  {
    id: 'feuerprobe',
    size: [21, 13],
    paths: [
      [[0, 1], [6, 1], [6, 6], [10, 6]],
      [[20, 1], [14, 1], [14, 6], [10, 6]],
      [[0, 11], [16, 11], [16, 8], [10, 8], [10, 6]],
    ],
  },
  // 6 · Sternenfall
  { id: 'sternenpfad', size: [19, 13], paths: [[[0, 1], [3, 1], [3, 4], [7, 4], [7, 7], [11, 7], [11, 10], [15, 10], [15, 2], [10, 2]]] },
  {
    id: 'mondsichel',
    size: [19, 13],
    paths: [
      [[18, 1], [3, 1], [3, 11], [15, 11], [15, 6], [9, 6]],
      [[18, 8], [12, 8], [12, 6], [9, 6]],
    ],
  },
  {
    id: 'nebel',
    size: [21, 13],
    bias: { glider: 2 },
    paths: [
      [[0, 3], [17, 3], [17, 10], [4, 10], [4, 6], [12, 6]],
      [[10, 12], [10, 6], [12, 6]],
      [[10, 0], [10, 6], [12, 6]],
    ],
  },
  { id: 'himmelsleiter', size: [19, 13], bias: { glider: 3 }, paths: [[[0, 6], [14, 6], [14, 2], [4, 2], [4, 10], [16, 10], [16, 4]]] },
  {
    id: 'bollwerk',
    size: [23, 15],
    bossEvery: 5,
    paths: [
      [[0, 1], [8, 1], [8, 5], [11, 5], [11, 7]],
      [[22, 1], [14, 1], [14, 7], [11, 7]],
      [[0, 13], [8, 13], [8, 9], [11, 9], [11, 7]],
      [[22, 13], [17, 13], [17, 9], [11, 9], [11, 7]],
    ],
  },
];

export const MAPS = LEVELS.map((d, i) => {
  const chapter = Math.floor(i / 5);
  const m = { ...(HAND_BY_ID[d.id] || {}), ...d };
  m.index = i;
  m.chapter = chapter;
  m.theme = m.theme || CHAPTERS[chapter].theme;
  m.shift = CHAPTERS[chapter].shift;
  m.goal = m.goal || GOALS[i];
  m.coins = m.coins || 130 + i * 6 + (m.paths.length - 1) * 20;
  m.lives = m.lives || 20;
  m.hpScale = HP_SCALE[m.id] ?? 1;
  m.towers = m.only || TOWER_ORDER.filter((t) => TOWER_UNLOCK[t] <= i);
  if (!m.grid) m.grid = generateGrid(m);
  return m;
});

export function getMap(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}

// Zellen eines Wegs aus seinen Wegpunkten (nur waagrecht/senkrecht)
export function pathCells(waypoints) {
  const cells = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [x0, y0] = waypoints[i];
    const [x1, y1] = waypoints[i + 1];
    if (x0 !== x1 && y0 !== y1) throw new Error(`Diagonaler Wegabschnitt ${x0},${y0} → ${x1},${y1}`);
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    let x = x0;
    let y = y0;
    if (i === 0) cells.push([x, y]);
    while (x !== x1 || y !== y1) {
      x += dx;
      y += dy;
      cells.push([x, y]);
    }
  }
  return cells;
}

// Polylinie mit abgerundeten Ecken (Radius 0,5 Felder) durch die Zellmitten
export function smoothPath(waypoints, r = 0.5, steps = 7) {
  const P = waypoints.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }));
  const out = [{ ...P[0] }];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1];
    const b = P[i];
    const c = P[i + 1];
    const la = Math.hypot(b.x - a.x, b.y - a.y);
    const lc = Math.hypot(c.x - b.x, c.y - b.y);
    const ia = { x: (b.x - a.x) / la, y: (b.y - a.y) / la };
    const ic = { x: (c.x - b.x) / lc, y: (c.y - b.y) / lc };
    if (Math.abs(ia.x * ic.y - ia.y * ic.x) < 1e-6) {
      out.push({ ...b });
      continue;
    }
    const s = { x: b.x - ia.x * r, y: b.y - ia.y * r };
    const e = { x: b.x + ic.x * r, y: b.y + ic.y * r };
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push({ x: u * u * s.x + 2 * u * t * b.x + t * t * e.x, y: u * u * s.y + 2 * u * t * b.y + t * t * e.y });
    }
  }
  out.push({ ...P[P.length - 1] });
  return makePath(out);
}

export function makePath(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return { pts: points, cum, total: cum[cum.length - 1] };
}

// Position bei Laufstrecke d. out.seg dient als Suchhinweis (Gegner laufen vorwärts).
export function posAt(path, d, out) {
  const { pts, cum } = path;
  let i = out.seg || 0;
  if (i >= pts.length - 1) i = pts.length - 2;
  while (i > 0 && cum[i] > d) i--;
  while (i < pts.length - 2 && cum[i + 1] < d) i++;
  const a = pts[i];
  const b = pts[i + 1];
  const len = cum[i + 1] - cum[i] || 1;
  const t = Math.max(0, Math.min(1, (d - cum[i]) / len));
  out.seg = i;
  out.dx = (b.x - a.x) / len;
  out.dy = (b.y - a.y) / len;
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  return out;
}

// Karte in eine Laufzeitstruktur übersetzen
export function buildMap(def) {
  const H = def.grid.length;
  const W = def.grid[0].length;
  const cells = def.grid.map((row) => row.split(''));
  const road = new Set();
  for (const wp of def.paths) for (const [x, y] of pathCells(wp)) road.add(y * W + x);
  const spawns = def.paths.map((wp) => ({ x: wp[0][0], y: wp[0][1] }));
  const last = def.paths[0][def.paths[0].length - 1];
  const base = { x: last[0], y: last[1] };
  const paths = def.paths.map((wp) => smoothPath(wp));
  // Flieger folgen demselben Weg (schwebend) – nur manche Türme erreichen sie
  const airPaths = paths;
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '.' : cells[y][x]);
  const isBuildable = (x, y) => '#DRXC'.includes(tileAt(x, y)) && !road.has(y * W + x);
  return { def, W, H, cells, road, spawns, base, paths, airPaths, tileAt, isBuildable };
}

// Plattformen entlang der Wege: alles direkt neben dem Weg, dazu ein Teil der zweiten Reihe.
// Sonderfelder auf Plätzen mit viel Wegabdeckung, mit Abstand zueinander. Reproduzierbar je Karten-ID.
export function generateGrid(def) {
  const [W, H] = def.size;
  const rng = makeRng(hashString(def.id) ^ 0xb011);
  const road = new Set();
  for (const wp of def.paths) for (const [x, y] of pathCells(wp)) road.add(y * W + x);
  const isRoad = (x, y) => x >= 0 && y >= 0 && x < W && y < H && road.has(y * W + x);
  const dist = (x, y) => {
    for (let r = 1; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (isRoad(x + dx, y + dy)) return r;
    }
    return 99;
  };
  const rows = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      if (road.has(y * W + x)) row += '=';
      else {
        const d = dist(x, y);
        // Rand der Insel freilassen, damit Portale und Deko Luft haben
        const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        const keep = d === 1 ? rng() > (edge ? 0.55 : 0.08) : d === 2 ? !edge && rng() < 0.3 : false;
        row += keep ? '#' : '.';
      }
    }
    rows.push(row.split(''));
  }
  // Sonderfelder
  const cand = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (rows[y][x] !== '#') continue;
      let cov = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 6.5 && isRoad(x + dx, y + dy)) cov++;
      cand.push([cov + rng() * 2, x, y]);
    }
  }
  cand.sort((a, b) => b[0] - a[0]);
  const kinds = ['D', 'R', 'X', 'C', 'D', 'R'];
  const count = 3 + Math.floor((W * H) / 110);
  const picked = [];
  for (const [, x, y] of cand) {
    if (picked.length >= count) break;
    if (picked.some(([px, py]) => Math.abs(px - x) + Math.abs(py - y) < 5)) continue;
    picked.push([x, y]);
  }
  const offset = Math.floor(rng() * 4);
  picked.forEach(([x, y], i) => (rows[y][x] = kinds[(i + offset) % kinds.length]));
  for (const wp of def.paths) rows[wp[0][1]][wp[0][0]] = 'S';
  const last = def.paths[0][def.paths[0].length - 1];
  rows[last[1]][last[0]] = 'B';
  return rows.map((r) => r.join(''));
}

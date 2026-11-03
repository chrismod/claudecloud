// Karten: Raster + Wegpunkte. Zeichen im Raster:
//   .  Wiese (nicht bebaubar, Deko)      #  Plattform (bebaubar)
//   =  Weg      S  Portal (Weganfang)    B  Kern (Wegende)
//   D R X C  Sonderplattformen (siehe TILE_BONUS)
// Wege werden als Wegpunkte (Zellkoordinaten) angegeben; Tests prüfen, dass Raster und Wege übereinstimmen.

export const MAPS = [
  {
    id: 'lichtung',
    name: 'Lichtung',
    desc: 'Ein gewundener Pfad über die Waldlichtung. Zum Kennenlernen.',
    goal: 20,
    coins: 130,
    lives: 20,
    towers: ['bolt', 'mortar', 'frost', 'tesla'],
    theme: 'meadow',
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
    name: 'Gabelung',
    desc: 'Zwei Portale, ein Kern. Die Wege vereinen sich und winden sich gemeinsam zum Ziel.',
    goal: 25,
    coins: 150,
    hpScale: 1.1,
    lives: 20,
    towers: ['bolt', 'mortar', 'frost', 'tesla', 'sniper', 'acid'],
    theme: 'autumn',
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
    name: 'Spirale',
    desc: 'Ein langer Weg, der sich zum Kern hinein windet. Platz für große Festungen.',
    goal: 30,
    coins: 150,
    hpScale: 1.25,
    lives: 20,
    towers: ['bolt', 'mortar', 'frost', 'tesla', 'sniper', 'acid', 'flame', 'amp'],
    theme: 'dusk',
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
    name: 'Kreuzweg',
    desc: 'Der Weg kreuzt sich selbst – und ein zweites Portal mischt mit.',
    goal: 30,
    coins: 170,
    hpScale: 1.2,
    lives: 20,
    towers: ['bolt', 'mortar', 'frost', 'tesla', 'sniper', 'acid', 'flame', 'amp', 'missile', 'mint'],
    theme: 'meadow',
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
    name: 'Dreiklang',
    desc: 'Drei Portale, ein Kern in der Mitte. Zwei Wege vereinen sich kurz vor dem Ziel.',
    goal: 30,
    coins: 200,
    hpScale: 0.9,
    lives: 20,
    towers: ['bolt', 'mortar', 'frost', 'tesla', 'sniper', 'acid', 'flame', 'amp', 'missile', 'mint', 'laser'],
    theme: 'dusk',
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

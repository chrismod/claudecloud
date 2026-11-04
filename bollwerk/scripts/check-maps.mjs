// Prüft alle Karten: Rasterlängen, Raster gegen Wege, Wege berühren sich nicht seitlich.
//   node scripts/check-maps.mjs [--show]   (--show zeichnet die Karten als Text)
import { MAPS, pathCells, buildMap } from '../src/game/maps.js';

export function mapProblems(m) {
  const W = m.grid[0].length;
  const errs = [];
  m.grid.forEach((r, y) => r.length !== W && errs.push(`Zeile ${y} hat Länge ${r.length} statt ${W}`));
  const road = new Set();
  const edges = new Set();
  for (const wp of m.paths) {
    const cells = pathCells(wp);
    cells.forEach(([x, y], i) => {
      road.add(`${x},${y}`);
      if (i) {
        const [px, py] = cells[i - 1];
        edges.add(`${px},${py}|${x},${y}`);
        edges.add(`${x},${y}|${px},${py}`);
      }
    });
  }
  m.grid.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const on = road.has(`${x},${y}`);
      if ('=SB'.includes(c) && !on) errs.push(`${c} bei ${x},${y} liegt auf keinem Weg`);
      if (on && !'=SB'.includes(c)) errs.push(`Weg bei ${x},${y} ist '${c}'`);
    }),
  );
  for (const k of road) {
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const n = `${x + dx},${y + dy}`;
      if (road.has(n) && !edges.has(`${k}|${n}`)) errs.push(`Wege berühren sich seitlich bei ${k} / ${n}`);
    }
  }
  return errs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  for (const m of MAPS) {
    const map = buildMap(m);
    console.log(`${String(m.index + 1).padStart(2)} ${m.id}: ${map.W}×${map.H}, Weglängen ${map.paths.map((p) => p.total.toFixed(1)).join(', ')}, Bauplätze ${m.grid.join('').split('').filter((c) => '#DRXC'.includes(c)).length}`);
    if (process.argv.includes('--show')) console.log(m.grid.map((r) => '   ' + r).join('\n'));
    const errs = mapProblems(m);
    if (errs.length) {
      bad++;
      console.log('  ' + errs.join('\n  '));
    }
  }
  process.exit(bad ? 1 : 0);
}

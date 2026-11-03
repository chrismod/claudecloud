// Prüft Raster gegen Wege und zeigt die Karten an
import { MAPS, pathCells, buildMap } from '../src/game/maps.js';
let bad = 0;
for (const m of MAPS) {
  const W = m.grid[0].length;
  const errs = [];
  m.grid.forEach((r, y) => r.length !== W && errs.push(`Zeile ${y} hat Länge ${r.length} statt ${W}`));
  const road = new Set();
  for (const wp of m.paths) for (const [x, y] of pathCells(wp)) road.add(`${x},${y}`);
  m.grid.forEach((row, y) => [...row].forEach((c, x) => {
    const on = road.has(`${x},${y}`);
    if ('=SB'.includes(c) && !on) errs.push(`${c} bei ${x},${y} liegt auf keinem Weg`);
    if (on && !'=SB'.includes(c)) errs.push(`Weg bei ${x},${y} ist '${c}'`);
  }));
  const map = buildMap(m);
  console.log(`${m.name}: ${map.W}×${map.H}, Weglängen ${map.paths.map((p) => p.total.toFixed(1)).join(', ')}, Bauplätze ${m.grid.join('').split('').filter((c) => '#DRXC'.includes(c)).length}`);
  if (errs.length) { bad++; console.log('  ' + errs.join('\n  ')); }
}
process.exit(bad ? 1 : 0);

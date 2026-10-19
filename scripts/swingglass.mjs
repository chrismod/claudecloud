import { World } from '../src/physics/world.js';
import { LEVELS } from '../src/levels.js';
import { drawStrand, run } from './sim.mjs';
const base = LEVELS.find((l) => l.id === 'altalena');
function scan(lvl, wait) {
  const wins = [];
  for (let tc = 0.8; tc <= 3.6; tc += 0.1) {
    const w = new World(lvl);
    drawStrand(w, lvl.anchors[0], { x: lvl.olive.x, y: lvl.olive.y + 0.1 });
    run(w, wait); w.releaseOlive(); run(w, tc);
    const s = w.strands.find((s) => s.particles.some((p) => p.pin?.kind === 'olive'));
    if (!s) continue;
    const k = Math.floor(s.particles.length / 2), m = s.particles[k], a = s.particles[k - 1];
    const dx = m.x - a.x, dy = m.y - a.y, L = Math.hypot(dx, dy);
    w.cut(m.x - dy / L * 0.5, m.y + dx / L * 0.5, m.x + dy / L * 0.5, m.y - dx / L * 0.5);
    run(w, 6);
    if (w.olive.state === 'won') wins.push(tc.toFixed(2));
  }
  return wins;
}
for (const [gx, gy] of JSON.parse(process.argv[2])) {
  const lvl = structuredClone(base);
  lvl.glass = { x: gx, y: gy, depth: 1.0, stem: 0.9 };
  const top = gy - 1.9;
  lvl.statics = [lvl.statics[0], { type: 'box', x: gx, y: top - 3, w: 2.6, h: 6, look: 'cheese' }];
  console.log(`glass ${gx},${gy}`, 'hot:', scan(lvl, 0).join(' '), '| warm:', scan(lvl, 3).join(' '), '| cold:', scan(lvl, 9).join(' '));
}

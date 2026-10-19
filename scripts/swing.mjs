import { World } from '../src/physics/world.js';
import { LEVELS } from '../src/levels.js';
import { drawStrand, run } from './sim.mjs';
const lvl = LEVELS.find((l) => l.id === 'altalena');
const wait = +(process.argv[2] ?? 0);
const res = [];
for (let tc = 0.4; tc <= 5.0; tc += 0.1) {
  const w = new World(lvl);
  const r = drawStrand(w, lvl.anchors[0], { x: lvl.olive.x, y: lvl.olive.y + 0.1 });
  run(w, wait);
  w.releaseOlive();
  run(w, tc);
  // Schnitt quer durch die Fadenmitte
  const s = w.strands.find((s) => s.particles.some((p) => p.pin?.kind === 'olive'));
  let cutOk = false;
  if (s) {
    const m = s.particles[Math.floor(s.particles.length / 2)];
    const a = s.particles[Math.floor(s.particles.length / 2) - 1];
    const dx = m.x - a.x, dy = m.y - a.y, L = Math.hypot(dx, dy);
    cutOk = w.cut(m.x - dy / L * 0.5, m.y + dx / L * 0.5, m.x + dy / L * 0.5, m.y - dx / L * 0.5) > 0;
  }
  const ox = w.olive.x.toFixed(1), oy = w.olive.y.toFixed(1);
  run(w, 6);
  res.push(`${tc.toFixed(1)}:${w.olive.state === 'won' ? 'WON' : w.olive.state}${cutOk ? '' : '(nocut)'}@(${ox},${oy})`);
}
console.log('attach', 'wait', wait, '\n' + res.join('\n'));

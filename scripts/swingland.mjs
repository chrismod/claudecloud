import { World } from '../src/physics/world.js';
import { LEVELS } from '../src/levels.js';
import { drawStrand, run } from './sim.mjs';
const base = LEVELS.find((l) => l.id === 'altalena');
const lvl = structuredClone(base); delete lvl.glass; lvl.statics = [lvl.statics[0]];
const Y = +(process.argv[3] ?? -0.6);
for (const wait of [0, 3, 9]) {
  const out = [];
  for (let tc = 0.8; tc <= 3.6; tc += 0.1) {
    const w = new World(lvl);
    drawStrand(w, lvl.anchors[0], { x: lvl.olive.x, y: lvl.olive.y + 0.1 });
    run(w, wait); w.releaseOlive(); run(w, tc);
    const s = w.strands.find((s) => s.particles.some((p) => p.pin?.kind === 'olive'));
    if (!s) { out.push(`${tc.toFixed(1)}:nostrand`); continue; }
    const k = Math.floor(s.particles.length / 2), m = s.particles[k], a = s.particles[k - 1];
    const dx = m.x - a.x, dy = m.y - a.y, L = Math.hypot(dx, dy);
    w.cut(m.x - dy / L * 0.5, m.y + dx / L * 0.5, m.x + dy / L * 0.5, m.y - dx / L * 0.5);
    const o = w.olive; const at = `(${o.x.toFixed(1)},${o.y.toFixed(1)} v${o.vx.toFixed(1)},${o.vy.toFixed(1)})`;
    let cross = null;
    for (let f = 0; f < 240 && !cross; f++) { const py = o.y; w.step(); if (py >= Y && o.y < Y && o.vy < 0) cross = o.x; }
    out.push(`${tc.toFixed(1)}:${at}->${cross?.toFixed(1)}`);
  }
  console.log('wait', wait, out.join(' '));
}

import { World } from '../src/physics/world.js';
import { drawStrand, run } from './sim.mjs';
const lvl = { statics: [], anchors: [{ x: -2.75, y: 0 }, { x: 2.75, y: 0 }], olive: { x: -8, y: 5 }, cheese: 9 };
const w = new World(lvl);
drawStrand(w, { x: -2.75, y: 0 }, { x: 2.75, y: 0 });
for (let i = 0; i < 24; i++) {
  run(w, 0.5);
  const s = w.strands[0];
  const mid = s.particles[Math.floor(s.particles.length / 2)];
  const len = s.particles.reduce((a, p, i, arr) => i ? a + Math.hypot(p.x - arr[i-1].x, p.y - arr[i-1].y) : 0, 0);
  const avgStrain = s.strain.reduce((a, b) => a + b, 0) / s.strain.length;
  console.log(`t=${w.time.toFixed(1)} T=${s.T.toFixed(2)} n=${s.particles.length} rest=${s.totalRest().toFixed(3)} len=${len.toFixed(3)} mid=${mid.y.toFixed(3)} strain=${avgStrain.toFixed(4)} flow=${s.mat.flow.toFixed(2)} shrink=${s.mat.shrink.toFixed(3)} strands=${w.strands.length}`);
}

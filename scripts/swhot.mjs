import { World } from '../src/physics/world.js';
import { LEVELS } from '../src/levels.js';
import { drawStrand, run } from './sim.mjs';
const lvl = LEVELS.find((l) => l.id === 'altalena');
const w = new World(lvl);
drawStrand(w, lvl.anchors[0], { x: lvl.olive.x, y: lvl.olive.y + 0.1 });
w.releaseOlive();
let f = 0;
run(w, 2, (w) => { if (f++ % 20 === 0) { const s = w.strands[0]; const c = s.particles.filter(p => p.contact).length; const lowest = Math.min(...s.particles.map(p=>p.y)); console.log(w.time.toFixed(2), 'olive', w.olive.x.toFixed(2), w.olive.y.toFixed(2), 'v', w.olive.vx.toFixed(2), 'contacts', c, 'lowestY', lowest.toFixed(2), 'n', s.particles.length, 'strain', Math.max(...s.strain).toFixed(2), 'restTot', s.totalRest().toFixed(2), 'dist', Math.hypot(w.olive.x-lvl.anchors[0].x, w.olive.y-lvl.anchors[0].y).toFixed(2)); } });

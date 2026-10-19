import { World } from '../src/physics/world.js';
import { drawStrand, run } from './sim.mjs';
import { MIN_RADIUS } from '../src/physics/world.js';
const lvl = { statics: [ { type: 'box', x: -6.3, y: -3, w: 7.4, h: 6 }, { type: 'box', x: 4.3, y: -3, w: 3.4, h: 6 }], anchors: [{ x: -2.48, y: -0.06 }, { x: 2.48, y: -0.06 }], olive: { x: -8, y: 0.32, vx: 3.5 }, cheese: 9, killY: -7 };
const wait = +process.argv[2] || 9;
const w = new World(lvl);
drawStrand(w, { x: -2.48, y: -0.06 }, { x: 2.48, y: -0.06 });
run(w, wait);
const orig = w.snap.bind(w);
w.snap = (s, i, cause) => {
  const L = s.segmentLength(i);
  console.log('SNAP', cause, 'seg', i, '/', s.rest.length, 'strain', s.strain[i].toFixed(3), 'base', s.base[i].toFixed(3), 'r', Math.sqrt(s.vol[i]/(Math.PI*L)).toFixed(4), 'min', MIN_RADIUS.toFixed(4), 'brk', s.mat.breakStrain.toFixed(3), 'T', s.T.toFixed(2), 'olive', w.olive.x.toFixed(2), w.olive.y.toFixed(2), 'v', w.olive.vx.toFixed(2), w.olive.vy.toFixed(2));
  orig(s, i, cause);
};
w.releaseOlive();
let f = 0;
run(w, 8, (w) => { if (f++ % 10 === 0) { const s = w.strands[0]; let mx = 0; for (let i=0;i<s.strain.length;i++) mx = Math.max(mx, s.strain[i]-s.base[i]); console.log(`t=${w.time.toFixed(2)} olive=(${w.olive.x.toFixed(2)},${w.olive.y.toFixed(2)}) v=(${w.olive.vx.toFixed(2)},${w.olive.vy.toFixed(2)}) dStrainMax=${mx.toFixed(4)} strands=${w.strands.length}`); } });

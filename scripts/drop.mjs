import { World } from '../src/physics/world.js';
import { drawStrand, run } from './sim.mjs';
const H = +(process.argv[2] ?? 4);
const lvl = { statics: [], anchors: [{ x: -3, y: -1 }, { x: 3, y: -2.2 }], olive: { x: -1.2, y: -1 + H, vx: 0 }, cheese: 12, killY: -7 };
for (const wait of [0, 1, 2, 3, 4, 5, 6, 7, 9]) {
  const w = new World(lvl);
  drawStrand(w, lvl.anchors[0], lvl.anchors[1]);
  run(w, wait);
  const T = w.strands[0].T;
  w.releaseOlive();
  let snaps = [], minY = 9, md = 0;
  run(w, 5, (w) => { minY = Math.min(minY, w.olive.y); for (const e of w.events) if (e.type === 'snap') snaps.push(`${e.cause}@${w.time.toFixed(1)}`); w.events.length = 0; for (const s of w.strands) for (let i=0;i<s.strain.length;i++) md = Math.max(md, s.strain[i]-Math.max(0,s.base[i])); });
  console.log(`H=${H} wait=${wait} T=${T.toFixed(2)} -> ${w.olive.state} snaps=[${snaps}] olive=(${w.olive.x.toFixed(1)},${w.olive.y.toFixed(1)}) minY=${minY.toFixed(2)} maxDelta=${md.toFixed(4)}`);
}

import { World } from '../src/physics/world.js';
import { drawStrand, run } from './sim.mjs';
function measure(lvl, a, b, wait, secs = 5) {
  const w = new World(lvl);
  drawStrand(w, a, b);
  run(w, wait);
  let pre = 0; for (const s of w.strands) for (const f of s.force) pre = Math.max(pre, f);
  const T = w.strands[0]?.T ?? -1;
  w.releaseOlive();
  let mf = 0;
  run(w, secs, (w) => { for (const s of w.strands) for (const f of s.force) mf = Math.max(mf, f); });
  return `T=${T.toFixed(2)} pre=${pre.toFixed(0)} peak=${mf.toFixed(0)} -> ${w.olive.state}`;
}
const bridge = { statics: [ { type: 'box', x: -6.3, y: -3, w: 7.4, h: 6 }, { type: 'box', x: 4.3, y: -3, w: 3.4, h: 6 }], anchors: [{ x: -2.48, y: -0.06 }, { x: 2.48, y: -0.06 }], olive: { x: -8, y: 0.32, vx: 3.5 }, cheese: 9, killY: -7 };
for (const wait of [0, 2, 4, 6, 9]) console.log('roll  ', 'wait', wait, measure(bridge, bridge.anchors[0], bridge.anchors[1], wait));
for (const H of [0.6, 1.5, 3, 5]) {
  const drop = { statics: [], anchors: [{ x: -3, y: -1 }, { x: 3, y: -2.2 }], olive: { x: -1.2, y: -1 + H, vx: 0 }, cheese: 12, killY: -7 };
  for (const wait of [0, 2, 4, 6, 9]) console.log('drop H', H, 'wait', wait, measure(drop, drop.anchors[0], drop.anchors[1], wait, 1.5));
}

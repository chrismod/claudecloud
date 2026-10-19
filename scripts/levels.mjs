import { World } from '../src/physics/world.js';
import { LEVELS } from '../src/levels.js';
import { drawStrand, run } from './sim.mjs';
const L = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
const A = (lvl, i) => lvl.anchors[i];
function play(lvl, script, secs = 14) {
  const w = new World(lvl);
  const events = [];
  script(w);
  run(w, secs, (w) => { for (const e of w.drainEvents()) if (e.type !== 'attach' && e.type !== 'draw-start') events.push(`${e.type}${e.cause ? ':' + e.cause : ''}${e.reason ? ':' + e.reason : ''}@${w.time.toFixed(1)}`); });
  return `${w.olive.state} used=${w.used.toFixed(2)} olive=(${w.olive.x.toFixed(1)},${w.olive.y.toFixed(1)}) [${events.join(' ')}]`;
}
let lvl = L['primo-filo'];
for (const wait of [0, 0.5, 1, 3, 9]) console.log('L1 wait', wait, play(lvl, (w) => { drawStrand(w, A(lvl,0), A(lvl,1)); run(w, wait); w.releaseOlive(); }));
console.log('L1 none', play(lvl, (w) => w.releaseOlive()));
lvl = L['la-rete'];
for (const wait of [0, 1, 2, 3, 4, 6, 9]) console.log('L2 wait', wait, play(lvl, (w) => { drawStrand(w, A(lvl,0), A(lvl,1)); run(w, wait); w.releaseOlive(); }));
lvl = L['due-ponti'];
for (const wait of [0, 2, 4, 6, 9]) console.log('L3 bridge-wait-catch', wait, play(lvl, (w) => { drawStrand(w, A(lvl,0), A(lvl,1)); run(w, wait); drawStrand(w, A(lvl,2), A(lvl,3)); w.releaseOlive(); }));
for (const wait of [0, 3, 9]) console.log('L3 both-wait', wait, play(lvl, (w) => { drawStrand(w, A(lvl,0), A(lvl,1)); drawStrand(w, A(lvl,2), A(lvl,3)); run(w, wait); w.releaseOlive(); }));

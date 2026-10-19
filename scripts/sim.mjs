// Hilfsfunktionen für Headless-Simulationen (Level-Design, Tuning).
// Direkt ausgeführt: Brücken-Experiment mit verschiedenen Wartezeiten.
import { World } from '../src/physics/world.js';

export function drawStrand(world, from, to, seconds = 0.5) {
  const a = world.pickAnchor(from.x, from.y, 0.2);
  world.beginStrand(a);
  const frames = Math.round(seconds * 60);
  for (let f = 1; f <= frames; f++) {
    const t = f / frames;
    world.dragTo(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    world.step();
  }
  return world.endStrand(to.x, to.y);
}

export function run(world, seconds, onFrame) {
  for (let f = 0; f < seconds * 60; f++) {
    world.step();
    onFrame?.(world, f);
    if (world.olive.state === 'won' || world.olive.state === 'lost') break;
  }
}

const bridgeLevel = {
  statics: [
    { type: 'box', x: -6.3, y: -3, w: 7.4, h: 6 },
    { type: 'box', x: 4.3, y: -3, w: 3.4, h: 6 },
    { type: 'box', x: 8, y: -5, w: 4, h: 3.2 },
  ],
  anchors: [{ x: -2.48, y: -0.06 }, { x: 2.48, y: -0.06 }],
  olive: { x: -8, y: 0.32, vx: 3.5 },
  glass: { x: 7.4, y: -0.9 },
  cheese: 9,
  killY: -7,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const wait of [0, 1, 2, 3, 4, 6, 9, 12]) {
    const w = new World(bridgeLevel);
    const r = drawStrand(w, { x: -2.48, y: -0.06 }, { x: 2.48, y: -0.06 });
    let snaps = 0;
    run(w, wait);
    const s = w.strands[0];
    const midY = s ? s.particles[Math.floor(s.particles.length / 2)].y : NaN;
    const T0 = s?.T;
    w.releaseOlive();
    let minY = 99, maxStrain = 0;
    run(w, 10, (w) => {
      minY = Math.min(minY, w.olive.y);
      for (const e of w.events) if (e.type === 'snap') snaps++;
      w.events.length = 0;
      for (const s of w.strands) for (const e of s.strain) maxStrain = Math.max(maxStrain, e);
    });
    console.log(`wait ${wait}s attach=${r.result} T=${T0?.toFixed(2)} midSag=${midY.toFixed(2)} used=${w.used.toFixed(2)} -> ${w.olive.state} minY=${minY.toFixed(2)} snaps=${snaps} maxStrain=${maxStrain.toFixed(3)} olive=(${w.olive.x.toFixed(1)},${w.olive.y.toFixed(1)}) t=${w.time.toFixed(1)}`);
  }
}

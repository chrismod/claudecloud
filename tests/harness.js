// Spielt ein Level headless mit einer Schrittfolge durch.
//
// Schritte:
//   ['draw', a, b]            Faden von Anker a zu Anker b, zur Olive ('olive') oder zu einem Punkt [x, y]
//   ['wait', s]               s Sekunden simulieren
//   ['go']                    Olive loslassen
//   ['cut', 'olive']          den Faden, an dem die Olive hängt, in der Mitte durchschneiden
//   ['cut', x1, y1, x2, y2]   Schnitt entlang einer Strecke
//   ['until', fn, maxS]       simulieren, bis fn(world) wahr ist (höchstens maxS Sekunden)
import { World } from '../src/physics/world.js';

const STEP = 1 / 60;

export function simulate(world, seconds, stop = () => false) {
  for (let f = 0; f < seconds / STEP; f++) {
    if (stop(world)) return true;
    world.step(STEP);
    if (world.olive.state === 'won' || world.olive.state === 'lost') return false;
  }
  return stop(world);
}

export function drawStrand(world, a, b, seconds = 0.4) {
  const from = world.anchors[a];
  // Ziel 'olive' folgt der (evtl. bewegten) Olive
  const target = () =>
    b === 'olive' ? { x: world.olive.x, y: world.olive.y } : Array.isArray(b) ? { x: b[0], y: b[1] } : world.anchors[b];
  if (!from || !target()) throw new Error(`Unbekannter Endpunkt ${a} → ${b}`);
  world.beginStrand(from);
  const frames = Math.max(1, Math.round(seconds / STEP));
  for (let f = 1; f <= frames; f++) {
    const t = f / frames;
    const to = target();
    world.dragTo(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    world.step(STEP);
  }
  const to = target();
  return world.endStrand(to.x, to.y);
}

export function cutOliveStrand(world) {
  const s = world.strands.find((s) => s.particles.some((p) => p.pin?.kind === 'olive'));
  if (!s) return 0;
  const k = Math.max(1, Math.floor(s.particles.length / 2));
  const m = s.particles[k];
  const a = s.particles[k - 1];
  const dx = m.x - a.x;
  const dy = m.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  return world.cut(m.x - (dy / L) * 0.5, m.y + (dx / L) * 0.5, m.x + (dy / L) * 0.5, m.y - (dx / L) * 0.5);
}

// Deterministischer Zufall für Robustheitsprüfungen
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// jitter: simuliert menschliche Ungenauigkeit (Zeichendauer, Endpunkt, Wartezeit)
export function play(level, steps, { maxSeconds = 30, jitter = null } = {}) {
  const world = new World(level);
  const log = [];
  const r = jitter ? rng(jitter) : null;
  const vary = (x, d) => (r ? x + (r() * 2 - 1) * d : x);
  for (const step of steps) {
    const [op, ...args] = step;
    if (world.olive.state === 'won' || world.olive.state === 'lost') break;
    if (op === 'draw') {
      let to = args[1];
      if (r && typeof to === 'number') {
        const a = world.anchors[to];
        to = [vary(a.x, 0.25), vary(a.y, 0.25)];
      }
      const res = drawStrand(world, args[0], to, r ? 0.25 + r() * 0.6 : 0.4);
      log.push(`draw ${args[0]}→${args[1]}: ${res?.result ?? 'abgebrochen'}`);
      continue;
    } else if (op === 'wait' && r) {
      simulate(world, Math.max(0, vary(args[0], 0.25)));
      continue;
    }
    if (op === 'draw') {
      const r = drawStrand(world, args[0], args[1]);
      log.push(`draw ${args[0]}→${args[1]}: ${r?.result ?? 'abgebrochen'}`);
    } else if (op === 'wait') simulate(world, args[0]);
    else if (op === 'go') world.releaseOlive();
    else if (op === 'cut') {
      const n = args[0] === 'olive' ? cutOliveStrand(world) : world.cut(...args);
      log.push(`cut: ${n}`);
    } else if (op === 'until') simulate(world, args[1] ?? 10, args[0]);
    else throw new Error(`Unbekannter Schritt ${op}`);
  }
  simulate(world, maxSeconds);
  return { state: world.olive.state, used: world.used, time: world.time, world, log };
}

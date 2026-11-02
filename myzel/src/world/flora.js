// Deterministische Bepflanzung eines Chunks. Jede Pflanze hat eine Schwelle: Sie wächst, sobald das
// Leben an ihrem Standort darüber steigt. Die tote Welt ist also schon vollständig "angelegt".
import { rng, hash32, smoothstep } from '../noise.js';
import { CHUNK, WATER } from '../config.js';

// Art → { trunk/crown teilen sich Einträge über 'group' }
export const KINDS = [
  'grass', 'flower', 'fern', 'reed', 'mushRed', 'mushBrown', 'mushGlow', 'parasol', 'puff', 'bush', 'rock',
  'oakTrunk', 'oakCrown', 'birchTrunk', 'birchCrown', 'firTrunk', 'firCrown', 'gmStem', 'gmCap', 'log',
];

export function generateFlora(field, cx, cz) {
  const r = rng(hash32(field.seed, cx, cz, 4242));
  const out = {};
  for (const k of KINDS) out[k] = [];
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  const sites = field.sitesNear(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK + 20);
  const nearTree = (x, z, r0) => sites.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < r0 * r0);

  function place(kind, n, opts) {
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * CHUNK;
      const z = z0 + r() * CHUNK;
      const rv = [r(), r(), r(), r(), r(), r()];
      const h = field.height(x, z);
      if (opts.accept && !opts.accept(x, z, h, rv[5])) continue;
      if (opts.clear && nearTree(x, z, opts.clear)) continue;
      const th = opts.th[0] + rv[0] * (opts.th[1] - opts.th[0]);
      const s = opts.scale[0] + rv[1] * (opts.scale[1] - opts.scale[0]);
      const e = { x, y: h - (opts.sink ?? 0.04), z, rot: rv[2] * Math.PI * 2, s, th, phase: rv[3], hue: rv[4], w: opts.w ?? 0 };
      if (opts.kinds) for (const k of opts.kinds) out[k].push(e);
      else out[kind].push(e);
    }
  }

  const dry = (x, z, h) => h > WATER + 0.25;
  const steep = (x, z) => field.slope(x, z);

  place('grass', 640, { th: [0.04, 0.42], scale: [1.1, 2.0], accept: (x, z, h) => dry(x, z, h) && steep(x, z) < 1.1 });
  place('flower', 80, { th: [0.42, 0.9], scale: [1.1, 1.8], accept: (x, z, h) => dry(x, z, h) && h < 15 });
  place('fern', 50, {
    th: [0.32, 0.8],
    scale: [0.8, 1.7],
    accept: (x, z, h, q) => dry(x, z, h) && q < 0.45 + smoothstep(4, 1, h) * 0.4 + field.mushroomness(x, z) * 0.2,
  });
  place('reed', 70, { th: [0.22, 0.6], scale: [0.8, 1.3], accept: (x, z, h) => h > WATER - 0.6 && h < WATER + 0.7 });
  place('mushRed', 11, { th: [0.3, 0.8], scale: [1.2, 2.4], accept: dry });
  place('mushBrown', 14, { th: [0.24, 0.7], scale: [1.2, 2.2], accept: dry });
  place('mushGlow', 16, {
    th: [0.42, 0.9],
    scale: [1.3, 2.6],
    accept: (x, z, h, q) => dry(x, z, h) && q < 0.5 + field.mushroomness(x, z) * 0.5,
  });
  place('parasol', 4, { th: [0.5, 0.9], scale: [0.9, 1.6], accept: (x, z, h, q) => dry(x, z, h) && q < 0.7 });
  place('puff', 5, { th: [0.48, 0.8], scale: [0.9, 1.4], accept: dry, w: -1000 });
  place('bush', 10, { th: [0.4, 0.85], scale: [0.7, 1.4], accept: (x, z, h) => dry(x, z, h) && h < 16 });
  place('rock', 5, { th: [-1, -1], scale: [0.35, 1.9], sink: 0.3, clear: 10, accept: (x, z, h, q) => q < 0.35 + steep(x, z) * 0.6 });

  // Bäume: Gerippe der alten Bäume (Stamm immer da) und Jungbäume (wachsen ganz)
  const treeKinds = (x, z, h, q) => {
    const mush = field.mushroomness(x, z);
    if (q < mush * 0.85) return ['gmStem', 'gmCap'];
    const conifer = smoothstep(7, 12, h);
    if (q > 1 - conifer * 0.85) return ['firTrunk', 'firCrown'];
    if (h < 3 || (q * 7) % 1 < 0.25) return ['birchTrunk', 'birchCrown'];
    return ['oakTrunk', 'oakCrown'];
  };
  for (let i = 0; i < 9; i++) {
    const x = x0 + r() * CHUNK;
    const z = z0 + r() * CHUNK;
    const q = r();
    const rv = [r(), r(), r(), r(), r()];
    const h = field.height(x, z);
    if (!dry(x, z, h) || steep(x, z) > 0.9 || nearTree(x, z, 14)) continue;
    const kinds = treeKinds(x, z, h, q);
    const old = i < 4 && kinds[0] !== 'gmStem';
    const e = {
      x,
      y: h - 0.15,
      z,
      rot: rv[0] * Math.PI * 2,
      s: (old ? 0.95 : 0.75) + rv[1] * 0.5,
      th: old ? 0.38 + rv[2] * 0.35 : 0.62 + rv[2] * 0.32,
      phase: rv[3],
      hue: rv[4],
      w: old ? 0 : 1, // 1 = Stamm wächst mit
    };
    for (const k of kinds) out[k].push(e);
  }

  // Totholz: liegt nur in erschöpften Gegenden
  for (let i = 0; i < 2; i++) {
    const x = x0 + 4 + r() * (CHUNK - 8);
    const z = z0 + 4 + r() * (CHUNK - 8);
    const q = r();
    const rot = r() * Math.PI * 2;
    const h = field.height(x, z);
    if (!dry(x, z, h) || field.baseState(x, z).life > 0.14 || q > 0.55 || nearTree(x, z, 16) || steep(x, z) > 0.6) continue;
    out.log.push({ x, y: h - 0.05, z, rot, s: 0.9 + q * 0.4, th: -1, phase: q, hue: 0.5, w: 1e9, id: `${cx},${cz},${i}` });
  }
  return out;
}

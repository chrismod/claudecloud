// Die Welt als reine Funktion des Seeds: Höhe, Fruchtbarkeit, Biome, Ausgangszustand
// und die Standorte der Mutterbäume. Kein three.js – läuft auch headless in Tests.
import { simplex, fbm, hash32, rng, smoothstep, clamp } from '../noise.js';
import { MOTHER_GRID, WATER, NEST_GRID } from '../config.js';

export function createField(seed) {
  const nH = simplex(hash32(seed, 1));
  const nH2 = simplex(hash32(seed, 2));
  const nR = simplex(hash32(seed, 3));
  const nL = simplex(hash32(seed, 4));
  const nF = simplex(hash32(seed, 5));
  const nO = simplex(hash32(seed, 6));
  const nM = simplex(hash32(seed, 7));
  const nW = simplex(hash32(seed, 8));

  function rawHeight(x, z) {
    // leichte Verwirbelung, damit Hügel nicht nach Raster aussehen
    const wx = x + nW(x / 140, z / 140) * 18;
    const wz = z + nW(z / 140 + 31, x / 140 - 7) * 18;
    let h = fbm(nH, wx / 260, wz / 260, 4) * 10;
    h += fbm(nH2, wx / 64, wz / 64, 3) * 3.2;
    const r = 1 - Math.abs(nR(wx / 170, wz / 170));
    h += r * r * r * 6;
    const lk = nL(x / 190, z / 190);
    h -= smoothstep(0.3, 0.75, lk) * 8.5;
    return h + 3.1;
  }

  // Mutterbäume: einer pro Rasterzelle, der Heimatbaum steht im Ursprung
  const siteCache = new Map();
  function site(gx, gz) {
    const key = gx + ',' + gz;
    let s = siteCache.get(key);
    if (s) return s;
    let x;
    let z;
    if (gx === 0 && gz === 0) {
      x = 0;
      z = 0;
    } else {
      const r = rng(hash32(seed, gx, gz, 77));
      x = gx * MOTHER_GRID + (r() - 0.5) * MOTHER_GRID * 0.5;
      z = gz * MOTHER_GRID + (r() - 0.5) * MOTHER_GRID * 0.5;
    }
    const base = Math.max(rawHeight(x, z), WATER + 2.6);
    const r2 = rng(hash32(seed, gx, gz, 99));
    s = { id: key, gx, gz, x, z, base, variant: Math.floor(r2() * 3), rot: r2() * Math.PI * 2, home: gx === 0 && gz === 0 };
    siteCache.set(key, s);
    return s;
  }

  function nearestSite(x, z) {
    const gx = Math.round(x / MOTHER_GRID);
    const gz = Math.round(z / MOTHER_GRID);
    let best = null;
    let bd = Infinity;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const s = site(gx + dx, gz + dz);
        const d = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
    return { site: best, dist: Math.sqrt(bd) };
  }

  function sitesNear(x, z, radius) {
    const out = [];
    const g0x = Math.floor((x - radius) / MOTHER_GRID) - 1;
    const g1x = Math.ceil((x + radius) / MOTHER_GRID) + 1;
    const g0z = Math.floor((z - radius) / MOTHER_GRID) - 1;
    const g1z = Math.ceil((z + radius) / MOTHER_GRID) + 1;
    for (let gz = g0z; gz <= g1z; gz++)
      for (let gx = g0x; gx <= g1x; gx++) {
        const s = site(gx, gz);
        if ((s.x - x) ** 2 + (s.z - z) ** 2 <= radius * radius) out.push(s);
      }
    return out;
  }

  function height(x, z) {
    let h = rawHeight(x, z);
    const { site: s, dist } = nearestSite(x, z);
    if (dist < 34) {
      // Hügel unter dem Mutterbaum: immer trocken, leicht erhaben
      const w = smoothstep(34, 6, dist);
      h = h + (s.base + 1.4 * w - h) * w;
    }
    return h;
  }

  function slope(x, z) {
    const e = 0.75;
    const dx = height(x + e, z) - height(x - e, z);
    const dz = height(x, z + e) - height(x, z - e);
    return Math.sqrt(dx * dx + dz * dz) / (2 * e);
  }

  // 0…1: wie gut hier Leben gedeiht
  function fertility(x, z, h = height(x, z)) {
    let f = 0.62 + 0.38 * fbm(nF, x / 95, z / 95, 3);
    f += smoothstep(3.5, 0.6, h) * 0.18; // feucht am Wasser
    f -= smoothstep(13, 19, h) * 0.3; // karg in der Höhe
    if (h < WATER - 0.4) f -= 0.25;
    return clamp(f, 0.12, 1);
  }

  // Pilzwald-Regionen (Riesenpilze statt Bäume)
  const mushroomness = (x, z) => smoothstep(0.28, 0.6, nM(x / 330, z / 330));

  // Wie lebendig die Welt am Anfang ist (meist erschöpft) – und das Myzel um den Heimatbaum
  function baseState(x, z) {
    let life = 0.03 + 0.2 * smoothstep(0.1, 0.85, nO(x / 120, z / 120));
    const d = Math.hypot(x, z);
    const homeM = smoothstep(30, 6, d + nO(x / 9, z / 9) * 5);
    life = Math.max(life, smoothstep(36, 8, d) * 0.92);
    return { life, myc: homeM };
  }

  // Moderherzen: Fäulnisnester, etwa eines pro 150-m-Zelle, nie am Heimatbaum
  const nestCache = new Map();
  function nest(gx, gz) {
    const key = gx + ',' + gz;
    if (nestCache.has(key)) return nestCache.get(key);
    const r = rng(hash32(seed, gx, gz, 313));
    let n = null;
    if (r() < 0.82) {
      const x = gx * NEST_GRID + (r() - 0.5) * NEST_GRID * 0.6;
      const z = gz * NEST_GRID + (r() - 0.5) * NEST_GRID * 0.6;
      const h = height(x, z);
      const ms = nearestSite(x, z);
      if (Math.hypot(x, z) > 105 && h > WATER + 0.8 && ms.dist > 22) n = { id: 'n' + key, x, z, y: h, seed: r() };
    }
    nestCache.set(key, n);
    return n;
  }
  function nestsNear(x, z, radius) {
    const out = [];
    const g0x = Math.floor((x - radius) / NEST_GRID) - 1;
    const g1x = Math.ceil((x + radius) / NEST_GRID) + 1;
    const g0z = Math.floor((z - radius) / NEST_GRID) - 1;
    const g1z = Math.ceil((z + radius) / NEST_GRID) + 1;
    for (let gz = g0z; gz <= g1z; gz++)
      for (let gx = g0x; gx <= g1x; gx++) {
        const n = nest(gx, gz);
        if (n && (n.x - x) ** 2 + (n.z - z) ** 2 <= radius * radius) out.push(n);
      }
    return out;
  }

  return { seed, height, rawHeight, slope, fertility, mushroomness, baseState, site, nearestSite, sitesNear, nest, nestsNear };
}

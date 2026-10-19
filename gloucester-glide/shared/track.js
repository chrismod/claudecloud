// Streckengenerator: aus einem Seed und einem Gefällsprofil entsteht ein Hang mit Mulde,
// Bodenwellen, Felsen und Strohballen. Läuft identisch im Browser und auf dem Server.
//
// Koordinaten: y nach oben, der Hang fällt entlang +z ab, x quer (Mitte x = 0).

import { rng, hashString } from './rng.js';
import { noise1, fbm2 } from './noise.js';

export const RES = 0.5; // Rasterweite des Höhenfelds in Metern
export const WIDTH = 44;

const sq = (v) => v * v;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Gefällsprofile: Stützpunkte [z, Gefälle (dy/dz)], dazwischen weich interpoliert
export const TRACKS = {
  'coopers-hill': {
    id: 'coopers-hill',
    name: "Cooper's Hill",
    tagline: 'Das Original: steil, buckelig, gnadenlos.',
    seed: 1826,
    length: 300,
    finish: 262,
    profile: [
      [0, 0.04],
      [10, 0.08],
      [24, 0.55],
      [40, 0.95],
      [78, 0.9],
      [92, 0.45],
      [104, 1.05],
      [150, 0.8],
      [172, 0.4],
      [198, 0.72],
      [232, 0.38],
      [252, 0.12],
      [268, 0.02],
      [300, 0],
    ],
    rocks: 16,
    bales: 9,
    bumps: 1.0,
    meander: 5,
  },
  'brockworth-bowl': {
    id: 'brockworth-bowl',
    name: 'Brockworth Bowl',
    tagline: 'Sanfter Start, dann Wellen wie auf hoher See.',
    seed: 77,
    length: 340,
    finish: 300,
    profile: [
      [0, 0.04],
      [12, 0.2],
      [40, 0.55],
      [70, 0.35],
      [90, 0.75],
      [130, 0.3],
      [150, 0.8],
      [190, 0.55],
      [215, 0.25],
      [245, 0.6],
      [280, 0.15],
      [305, 0.02],
      [340, 0],
    ],
    rocks: 10,
    bales: 14,
    bumps: 1.6,
    meander: 8,
  },
};

// Tägliche Strecke: Profil und Hindernisse aus dem Datum
export function dailyTrack(dateStr) {
  const seed = hashString(`daily:${dateStr}`);
  const r = rng(seed);
  const length = 300 + Math.floor(r() * 4) * 20;
  const profile = [[0, 0.04], [10, 0.1]];
  let z = 10;
  while (z < length - 60) {
    z += 18 + Math.floor(r() * 22);
    profile.push([z, 0.3 + r() * 0.75]);
  }
  profile.push([length - 40, 0.1], [length - 25, 0.02], [length, 0]);
  return {
    id: `daily-${dateStr}`,
    name: `Tagesrennen ${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}.`,
    tagline: 'Jeden Tag ein neuer Hang – für alle derselbe.',
    seed,
    length,
    finish: length - 38,
    profile,
    rocks: 8 + Math.floor(r() * 12),
    bales: 6 + Math.floor(r() * 10),
    bumps: 0.8 + r() * 1.0,
    meander: 3 + r() * 6,
  };
}

export function trackById(id) {
  if (TRACKS[id]) return TRACKS[id];
  const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(id || '');
  return m ? dailyTrack(m[1]) : null;
}

function slopeAt(profile, z) {
  if (z <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    const [z1, s1] = profile[i];
    const [z0, s0] = profile[i - 1];
    if (z <= z1) return s0 + (s1 - s0) * smooth((z - z0) / (z1 - z0));
  }
  return profile[profile.length - 1][1];
}

export function buildTrack(def) {
  const length = def.length;
  const nx = Math.round(WIDTH / RES); // Spalten (x)
  const nz = Math.round(length / RES); // Zeilen (z)
  const seed = def.seed >>> 0;

  // Längsprofil: Höhe je Zeile durch Aufsummieren des Gefälles
  const base = new Float64Array(nz + 1);
  for (let i = 1; i <= nz; i++) base[i] = base[i - 1] - slopeAt(def.profile, (i - 0.5) * RES) * RES;

  // Ideallinie schlängelt sich leicht
  const center = (z) => (noise1(z * 0.012, seed + 11) * 2 - 1) * def.meander * smooth(z / 40);
  const centers = new Float64Array(nz + 1);
  for (let i = 0; i <= nz; i++) centers[i] = center(i * RES);

  const inner = 9;
  const outer = 16;
  const heightRaw = (x, i) => {
    const z = i * RES;
    const dx = Math.abs(x - centers[i]);
    // Mulde: seitliche Wälle halten den Käse (meistens) auf der Strecke
    const t = (dx - inner) / (outer - inner);
    const wall = t <= 0 ? 0 : t <= 1 ? 7 * t * t : 7 + (dx - outer) * 1.4;
    // Bodenwellen – am Start und im Auslauf ruhiger
    const calm = smooth(z / 25) * (1 - smooth((z - def.finish + 10) / 30));
    const bumps = (fbm2(x * 0.07, z * 0.07, seed, 3) * 1.3 + fbm2(x * 0.32, z * 0.32, seed + 5, 2) * 0.22) * def.bumps * calm;
    return base[i] + wall + bumps;
  };

  // Höhenfeld im Rapier-Layout: Index = Spalte * (Zeilen + 1) + Zeile
  const heights = new Float32Array((nx + 1) * (nz + 1));
  for (let c = 0; c <= nx; c++) {
    const x = -WIDTH / 2 + c * RES;
    for (let i = 0; i <= nz; i++) heights[c * (nz + 1) + i] = heightRaw(x, i);
  }

  // Bilineare Höhe an beliebiger Stelle (aus genau den Float32-Werten des Höhenfelds)
  const heightAt = (x, z) => {
    const fc = Math.min(nx - 1e-6, Math.max(0, (x + WIDTH / 2) / RES));
    const fr = Math.min(nz - 1e-6, Math.max(0, z / RES));
    const c = Math.floor(fc);
    const r = Math.floor(fr);
    const u = fc - c;
    const v = fr - r;
    const h = (cc, rr) => heights[cc * (nz + 1) + rr];
    const a = h(c, r) + (h(c + 1, r) - h(c, r)) * u;
    const b = h(c, r + 1) + (h(c + 1, r + 1) - h(c, r + 1)) * u;
    return a + (b - a) * v;
  };
  const centerAt = (z) => centers[Math.max(0, Math.min(nz, Math.round(z / RES)))];

  // Hindernisse
  const r = rng(seed ^ 0x5bd1e995);
  const rocks = [];
  for (let k = 0; k < def.rocks * 4 && rocks.length < def.rocks; k++) {
    const z = 30 + r() * (def.finish - 45);
    const x = centerAt(z) + (r() * 2 - 1) * (inner - 1.5);
    const radius = 0.45 + r() * 0.65;
    if (rocks.some((o) => sq(o.x - x) + sq(o.z - z) < sq(o.radius + radius + 3))) continue;
    rocks.push({ x, z, radius, y: heightAt(x, z) - radius * 0.35 });
  }
  const bales = [];
  for (let k = 0; k < def.bales * 4 && bales.length < def.bales; k++) {
    const z = 40 + r() * (def.finish - 50);
    const x = centerAt(z) + (r() * 2 - 1) * (inner - 2);
    if (rocks.some((o) => sq(o.x - x) + sq(o.z - z) < 16) || bales.some((o) => sq(o.x - x) + sq(o.z - z) < 9)) continue;
    const hx = 0.6;
    const hy = 0.42;
    const hz = 0.42;
    bales.push({ x, z, hx, hy, hz, y: heightAt(x, z) + hy + 0.02, yaw: r() * 3 });
  }

  // Kontrollpunkte für das Zurücksetzen (alle 40 m)
  const checkpoints = [];
  for (let z = 6; z < def.finish; z += 40) checkpoints.push({ z, x: centerAt(z), y: heightAt(centerAt(z), z) });

  const startZ = 5;
  return {
    def,
    id: def.id,
    name: def.name,
    length,
    width: WIDTH,
    res: RES,
    nx,
    nz,
    heights,
    heightAt,
    centerAt,
    inner,
    outer,
    rocks,
    bales,
    checkpoints,
    finishZ: def.finish,
    start: { x: centerAt(startZ), z: startZ, y: heightAt(centerAt(startZ), startZ) },
  };
}

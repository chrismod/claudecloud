// Streckengenerator: aus einem Seed und einem Gefällsprofil entsteht ein Hang mit Mulde,
// Bodenwellen, Felsen und Strohballen. Läuft identisch im Browser und auf dem Server.
//
// Koordinaten: y nach oben, der Hang fällt entlang +z ab, x quer (Mitte x = 0).

import { rng, hashString } from './rng.js';
import { noise1, noise2, fbm2 } from './noise.js';

export const RES = 0.5; // Rasterweite des Höhenfelds in Metern (Standard)
export const WIDTH = 44;
const RES0 = RES;
const WIDTH0 = WIDTH;

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

// Mount Everest: lange Expedition vom Gipfel durch Eis, Eisbruch und Basislager ins grüne Tal.
// Zonen bestimmen Untergrund (Physik), Buckel, Hindernisse und Optik.
TRACKS.everest = {
  id: 'everest',
  name: 'Mount Everest',
  tagline: 'Vom Gipfel durch den Eisbruch, am Basislager vorbei ins grüne Tal.',
  theme: 'everest',
  seed: 8849,
  length: 3600,
  finish: 3520,
  res: 1,
  width: 56,
  meander: 8,
  checkpointEvery: 60,
  ghostEvery: 6,
  damageScale: 0.25, // langer Lauf: einzelne Stöße zählen weniger
  profile: [
    [0, 0.04],
    [12, 0.1],
    [40, 0.65],
    [150, 0.9],
    [300, 0.75],
    [420, 1.0],
    [600, 0.7],
    [700, 0.95],
    [900, 0.8],
    [1050, 0.65],
    [1150, 0.75],
    [1200, 0.5],
    [1490, 0.45],
    [1530, 0.26],
    [1760, 0.26],
    [1810, 0.55],
    [2050, 0.7],
    [2250, 0.6],
    [2450, 0.75],
    [2600, 0.6],
    [2800, 0.65],
    [3000, 0.55],
    [3250, 0.6],
    [3420, 0.3],
    [3490, 0.08],
    [3540, 0.02],
    [3600, 0],
  ],
  // Untergrund: 0 Gras, 1 Schnee, 2 Eis, 3 Geröll; ice = Schwelle für Eisflecken (≥ 1: keine)
  zones: [
    { id: 'summit', from: 0, to: 1200, name: 'Gipfelflanke', wall: 1, bumps: 0.6, surface: 1, ice: 0.63, rocks: 9, boxes: 0 },
    { id: 'icefall', from: 1200, to: 1500, name: 'Khumbu-Eisbruch', wall: 1, bumps: 1.0, surface: 1, ice: 0.5, rocks: 4, boxes: 0, seracs: 14 },
    { id: 'basecamp', from: 1500, to: 1810, name: 'Basislager', wall: 0.45, bumps: 0.5, surface: 3, ice: 2, rocks: 5, boxes: 12, boxKind: 'duffel' },
    { id: 'moraine', from: 1810, to: 2500, name: 'Moräne', wall: 1, bumps: 1.2, surface: 3, ice: 0.78, rocks: 38, boxes: 0 },
    { id: 'alpine', from: 2500, to: 2950, name: 'Almen', wall: 1, bumps: 0.9, surface: 0, ice: 2, rocks: 12, boxes: 4, boxKind: 'hay' },
    { id: 'valley', from: 2950, to: 3600, name: 'Tal', wall: 1, bumps: 0.7, surface: 0, ice: 2, rocks: 5, boxes: 8, boxKind: 'hay' },
  ],
  crevasses: [
    { z: 1290, width: 4, depth: 9 },
    { z: 1380, width: 5, depth: 10 },
    { z: 1465, width: 6, depth: 10 },
  ],
  basecampZ: 1650,
  // Anzeige der Höhe über dem Meer (Gipfel, Basislager, Ziel in Namche Bazar)
  altitude: [
    [0, 8849],
    [1650, 5364],
    [3520, 3440],
  ],
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

const zoneAt = (def, z) => {
  if (!def.zones) return null;
  for (const zn of def.zones) if (z < zn.to) return zn;
  return def.zones[def.zones.length - 1];
};

// Zonenwert weich über die Grenzen geblendet (±30 m)
function zoneBlend(def, z, key) {
  const zs = def.zones;
  for (let i = 0; i < zs.length; i++) {
    const zn = zs[i];
    if (z < zn.to || i === zs.length - 1) {
      const next = zs[i + 1];
      if (next && z > zn.to - 30) return zn[key] + (next[key] - zn[key]) * smooth((z - (zn.to - 30)) / 60);
      const prev = zs[i - 1];
      if (prev && z < zn.from + 30) return prev[key] + (zn[key] - prev[key]) * smooth((z - (zn.from - 30)) / 60);
      return zn[key];
    }
  }
  return 1;
}

export function buildTrack(def) {
  const length = def.length;
  const RES = def.res ?? RES0;
  const WIDTH = def.width ?? WIDTH0;
  const nx = Math.round(WIDTH / RES); // Spalten (x)
  const nz = Math.round(length / RES); // Zeilen (z)
  const seed = def.seed >>> 0;
  const bumpsAt = def.zones ? (z) => zoneBlend(def, z, 'bumps') : () => def.bumps;

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
    let wall = t <= 0 ? 0 : t <= 1 ? 7 * t * t : 7 + (dx - outer) * 1.4;
    if (def.zones) wall *= zoneBlend(def, z, 'wall'); // im Basislager flachere Wände
    // Bodenwellen – am Start und im Auslauf ruhiger
    let calm = smooth(z / 25) * (1 - smooth((z - def.finish + 10) / 30));
    // rund um Gletscherspalten glatt, damit Absprung und Landung sauber sind
    for (const cv of def.crevasses ?? []) calm *= smooth((Math.abs(z - cv.z) - cv.width / 2 - 4) / 12);
    const bumps = (fbm2(x * 0.07, z * 0.07, seed, 3) * 1.3 + fbm2(x * 0.32, z * 0.32, seed + 5, 2) * 0.22) * bumpsAt(z) * calm;
    return base[i] + wall + bumps;
  };

  // Höhenfeld im Rapier-Layout: Index = Spalte * (Zeilen + 1) + Zeile
  const heights = new Float32Array((nx + 1) * (nz + 1));
  for (let c = 0; c <= nx; c++) {
    const x = -WIDTH / 2 + c * RES;
    for (let i = 0; i <= nz; i++) heights[c * (nz + 1) + i] = heightRaw(x, i);
  }

  // Gletscherspalten: Rinne quer über die Bahn, davor eine kleine Sprungkante
  const crevasses = [];
  for (const cv of def.crevasses ?? []) {
    const z0 = cv.z - cv.width / 2;
    const z1 = cv.z + cv.width / 2;
    const iRim0 = Math.max(0, Math.floor(z0 / RES));
    const iRim1 = Math.min(nz, Math.ceil(z1 / RES));
    const rim = Math.min(base[iRim0], base[iRim1]);
    for (let c = 0; c <= nx; c++) {
      const x = -WIDTH / 2 + c * RES;
      for (let i = Math.max(0, Math.floor((z0 - 7) / RES)); i <= iRim1; i++) {
        const z = i * RES;
        if (Math.abs(x - centers[i]) > outer + 3) continue;
        const k = c * (nz + 1) + i;
        if (z > z0 && z < z1) heights[k] = heights[k] - cv.depth;
        else if (z <= z0) heights[k] = heights[k] + 1.0 * smooth((z - (z0 - 7)) / 7);
      }
    }
    crevasses.push({ z0, z1, z: cv.z, rim, depth: cv.depth });
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
  const bales = [];
  const seracs = [];
  const ladders = [];
  // Abstand zu Spalten: dort nichts hinstellen
  const nearCrevasse = (z, before, after) => crevasses.some((cv) => z > cv.z0 - before && z < cv.z1 + after);
  const placeRocks = (count, z0, z1) => {
    for (let k = 0, n = 0; k < count * 4 && n < count; k++) {
      const z = z0 + r() * (z1 - z0);
      const x = centerAt(z) + (r() * 2 - 1) * (inner - 1.5);
      const radius = 0.45 + r() * 0.65;
      if (rocks.some((o) => sq(o.x - x) + sq(o.z - z) < sq(o.radius + radius + 3))) continue;
      if (nearCrevasse(z, 25, 8)) continue;
      rocks.push({ x, z, radius, y: heightAt(x, z) - radius * 0.35 });
      n++;
    }
  };
  const placeBoxes = (count, z0, z1, kind) => {
    for (let k = 0, n = 0; k < count * 4 && n < count; k++) {
      const z = z0 + r() * (z1 - z0);
      const x = centerAt(z) + (r() * 2 - 1) * (inner - 2);
      if (rocks.some((o) => sq(o.x - x) + sq(o.z - z) < 16) || bales.some((o) => sq(o.x - x) + sq(o.z - z) < 9)) continue;
      const hx = 0.6;
      const hy = 0.42;
      const hz = 0.42;
      const b = { x, z, hx, hy, hz, y: heightAt(x, z) + hy + 0.02, yaw: r() * 3 };
      if (kind) b.kind = kind;
      bales.push(b);
      n++;
    }
  };
  if (!def.zones) {
    placeRocks(def.rocks, 30, def.finish - 15);
    placeBoxes(def.bales, 40, def.finish - 10);
  } else {
    // Leitern über die Spalten (der sichere, aber schmale Weg)
    // Schräg von Kante zu Kante; Drehung um die x-Achse nur aus Grundrechenarten und Wurzel
    for (const cv of crevasses) {
      const x = centerAt(cv.z) + (r() * 2 - 1) * 5;
      const za = cv.z0 - 0.6;
      const zb = cv.z1 + 0.6;
      const ya = heightAt(x, za);
      const yb = heightAt(x, zb);
      const dz = zb - za;
      const dy = ya - yb; // Gefälle (positiv = bergab)
      const len = Math.sqrt(dz * dz + dy * dy);
      const cos = dz / len;
      const hy = 0.08;
      // Mitte so, dass die Oberseite auf beiden Kanten aufliegt (Normale = (0, cos, sin))
      const sin = dy / len;
      const qx = Math.sqrt((1 - cos) / 2);
      const qw = Math.sqrt((1 + cos) / 2);
      ladders.push({ x, cz: cv.z, z: (za + zb) / 2 - sin * hy, y: (ya + yb) / 2 - cos * hy, hx: 0.55, hy, hz: len / 2 + 0.5, qx, qw, cos, sin });
    }
    for (const zn of def.zones) {
      const z0 = Math.max(zn.from, 30);
      const z1 = Math.min(zn.to, def.finish - 15);
      placeRocks(zn.rocks, z0, z1);
      if (zn.boxes) placeBoxes(zn.boxes, z0, z1, zn.boxKind);
      // Eistürme (Séracs) im Eisbruch, die Anfahrt zu den Leitern bleibt frei
      for (let k = 0, n = 0; k < (zn.seracs ?? 0) * 6 && n < (zn.seracs ?? 0); k++) {
        const z = z0 + r() * (z1 - z0);
        const x = centerAt(z) + (r() * 2 - 1) * (inner + 2);
        if (nearCrevasse(z, 14, 6)) continue;
        if (ladders.some((l) => Math.abs(l.x - x) < 3.5 && z > l.z - 40 && z < l.z)) continue;
        if (seracs.some((o) => sq(o.x - x) + sq(o.z - z) < 36)) continue;
        const hx = 0.7 + r() * 0.9;
        const hy = 1 + r() * 1.6;
        const hz = 0.7 + r() * 0.9;
        seracs.push({ x, z, hx, hy, hz, y: heightAt(x, z) + hy - 0.4, yaw: r() * 3 });
        n++;
      }
    }
  }

  // Untergrund an einer Stelle (0 Gras, 1 Schnee, 2 Eis, 3 Geröll) – bestimmt Grip und Rollwiderstand
  const surfaceAt = def.zones
    ? (x, z) => {
        const zn = zoneAt(def, z);
        const n = noise2(x * 0.06, z * 0.03, seed + 77);
        if (n > zn.ice) return 2;
        // Moräne: Schneereste
        if (zn.surface === 3 && n > zn.ice - 0.12 && zn.ice < 1) return 1;
        return zn.surface;
      }
    : null;

  // Höhe über dem Meer für die Anzeige (stückweise linear über die Höhe des Längsprofils)
  let altitudeAt = null;
  if (def.altitude) {
    const pts = def.altitude.map(([z, alt]) => [base[Math.min(nz, Math.round(z / RES))], alt]);
    altitudeAt = (y) => {
      for (let i = 1; i < pts.length; i++) {
        const [y0, a0] = pts[i - 1];
        const [y1, a1] = pts[i];
        if (y >= y1 || i === pts.length - 1) return a0 + ((y - y0) / (y1 - y0)) * (a1 - a0);
      }
      return pts[0][1];
    };
  }

  // Strohballenwand im Auslauf, fängt die Laibe hinter dem Ziel auf (liegt hinter der Ziellinie, beeinflusst keine Zeit)
  const catchZ = def.finish + 24;
  const catchBales = [];
  const cc = centerAt(catchZ);
  for (let k = 0, x = cc - inner - 3; x <= cc + inner + 3; k++, x += 1.25) {
    for (let level = 0; level < 2; level++) {
      const xx = x + (level ? 0.62 : 0);
      catchBales.push({ x: xx, z: catchZ, y: heightAt(xx, catchZ) + 0.42 + level * 0.84, hx: 0.6, hy: 0.42, hz: 0.42 });
    }
  }

  // Kontrollpunkte für das Zurücksetzen (nicht direkt vor oder in einer Spalte)
  const checkpoints = [];
  for (let z = 6; z < def.finish; z += def.checkpointEvery ?? 40) {
    if (nearCrevasse(z, 40, 4)) continue;
    checkpoints.push({ z, x: centerAt(z), y: heightAt(centerAt(z), z) });
  }

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
    catchBales,
    seracs,
    ladders,
    crevasses,
    surfaceAt,
    altitudeAt,
    zoneAt: (z) => zoneAt(def, z),
    theme: def.theme ?? 'meadow',
    ghostEvery: def.ghostEvery ?? 2,
    checkpoints,
    finishZ: def.finish,
    start: { x: centerAt(startZ), z: startZ, y: heightAt(centerAt(startZ), startZ) },
  };
}

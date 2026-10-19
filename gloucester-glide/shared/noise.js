// Value-Noise nur aus Ganzzahl-Hashing, + und * – damit liefert es in jeder
// JavaScript-Engine bitgenau dasselbe Ergebnis (wichtig für die Server-Prüfung).

function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

export function noise2(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fy; // 0 … 1
}

// 1D-Variante (entlang einer Achse)
export function noise1(x, seed) {
  return noise2(x, 0.5, seed);
}

// Fraktales Rauschen, Mittelwert 0, grob in [-1, 1]
export function fbm2(x, y, seed, octaves = 4) {
  let v = 0;
  let amp = 1;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    v += (noise2(x * f, y * f, seed + o * 1013) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / norm;
}

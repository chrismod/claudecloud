// Prozedural erzeugte Canvas-Texturen – keine externen Assets nötig.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Kachelbares Value-Noise mit mehreren Oktaven
function makeNoise(seed, size = 64) {
  const r = rng(seed);
  const grid = new Float32Array(size * size).map(() => r());
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const g = (i, j) => grid[(((j % size) + size) % size) * size + (((i % size) + size) % size)];
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * fx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
  return (x, y, octaves = 4) => {
    let v = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      v += sample(x * f, y * f) * amp;
      f *= 2;
      amp *= 0.5;
    }
    return v / (1 - Math.pow(0.5, octaves));
  };
}

function canvasTexture(size, paint, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  paint(img.data, size, ctx);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

const mix = (a, b, t) => a + (b - a) * t;

export function woodTexture() {
  const n = makeNoise(7);
  const n2 = makeNoise(11);
  return canvasTexture(1024, (d, size) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const warp = n(u * 3, v * 12, 3) * 3.2;
        const grain = Math.sin((u * 26 + warp) * Math.PI);
        const fine = n2(u * 90, v * 6, 2);
        const ring = 0.5 + 0.5 * grain;
        let t = ring * 0.55 + fine * 0.45;
        t = Math.pow(t, 1.4);
        const i = (y * size + x) * 4;
        d[i] = mix(150, 205, t);
        d[i + 1] = mix(98, 146, t);
        d[i + 2] = mix(58, 92, t);
        d[i + 3] = 255;
      }
    }
  });
}

export function breadTexture() {
  const n = makeNoise(21);
  const r = rng(5);
  return canvasTexture(512, (d, size, ctx) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const t = n(u * 8, v * 8, 5);
        const blotch = n(u * 3 + 10, v * 3, 3);
        const i = (y * size + x) * 4;
        const dark = Math.max(0, blotch - 0.55) * 1.8;
        d[i] = mix(205, 150, t * 0.7 + dark);
        d[i + 1] = mix(146, 92, t * 0.7 + dark);
        d[i + 2] = mix(78, 44, t * 0.7 + dark);
        d[i + 3] = 255;
      }
    }
    // Mehlstaub
    for (let k = 0; k < 1600; k++) {
      const x = Math.floor(r() * size);
      const y = Math.floor(r() * size);
      const a = 0.15 + r() * 0.35;
      const i = (y * size + x) * 4;
      d[i] = mix(d[i], 255, a);
      d[i + 1] = mix(d[i + 1], 248, a);
      d[i + 2] = mix(d[i + 2], 230, a);
    }
  });
}

export function cheeseBlockTexture() {
  const n = makeNoise(33);
  const r = rng(9);
  return canvasTexture(512, (d, size) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const t = n(u * 10, v * 10, 4);
        const i = (y * size + x) * 4;
        d[i] = mix(250, 226, t);
        d[i + 1] = mix(222, 186, t);
        d[i + 2] = mix(140, 96, t);
        d[i + 3] = 255;
      }
    }
    // Tyrosin-Kristalle
    for (let k = 0; k < 1400; k++) {
      const x = Math.floor(r() * size);
      const y = Math.floor(r() * size);
      const i = (y * size + x) * 4;
      d[i] = 255;
      d[i + 1] = 246;
      d[i + 2] = 214;
    }
  });
}

export function oliveTexture() {
  const n = makeNoise(44);
  const r = rng(3);
  return canvasTexture(
    512,
    (d, size) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const t = n(u * 6, v * 6, 5);
          const i = (y * size + x) * 4;
          d[i] = mix(52, 104, t);
          d[i + 1] = mix(78, 126, t);
          d[i + 2] = mix(18, 34, t);
          d[i + 3] = 255;
        }
      }
      // Lentizellen (helle Pünktchen) – machen die Rollbewegung sichtbar
      for (let k = 0; k < 260; k++) {
        const cx = r() * size;
        const cy = r() * size;
        const rad = 1 + r() * 2.2;
        for (let yy = -3; yy <= 3; yy++) {
          for (let xx = -3; xx <= 3; xx++) {
            if (xx * xx + yy * yy > rad * rad) continue;
            const px = Math.floor(cx + xx);
            const py = Math.floor(cy + yy);
            if (px < 0 || py < 0 || px >= size || py >= size) continue;
            const i = (py * size + px) * 4;
            d[i] = 160;
            d[i + 1] = 172;
            d[i + 2] = 92;
          }
        }
      }
    },
    { repeat: false },
  );
}

// Längsfasern für die Käsefäden (als Bump-Map)
export function fiberTexture() {
  const n = makeNoise(55);
  return canvasTexture(
    256,
    (d, size) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const t = n(u * 2, v * 24, 4);
          const c = Math.floor(mix(70, 255, t));
          const i = (y * size + x) * 4;
          d[i] = d[i + 1] = d[i + 2] = c;
          d[i + 3] = 255;
        }
      }
    },
    { srgb: false },
  );
}

export function softDotTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

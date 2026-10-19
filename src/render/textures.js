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

// Kachelbares Value-Noise mit mehreren Oktaven. Koordinaten in "Zellen";
// px/py geben die Periode der ersten Oktave an (für nahtlose Texturen).
function makeNoise(seed, size = 256) {
  const r = rng(seed);
  const grid = new Float32Array(size * size).map(() => r());
  const smooth = (t) => t * t * (3 - 2 * t);
  const g = (i, j, px, py) => {
    const ii = ((i % px) + px) % px;
    const jj = ((j % py) + py) % py;
    return grid[(jj % size) * size + (ii % size)];
  };
  const sample = (x, y, px, py) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = g(x0, y0, px, py) + (g(x0 + 1, y0, px, py) - g(x0, y0, px, py)) * fx;
    const b = g(x0, y0 + 1, px, py) + (g(x0 + 1, y0 + 1, px, py) - g(x0, y0 + 1, px, py)) * fx;
    return a + (b - a) * fy;
  };
  return (x, y, octaves = 4, px = 1e6, py = px) => {
    let v = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      v += sample(x * f, y * f, Math.round(px * f), Math.round(py * f)) * amp;
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
  const planks = 5;
  return canvasTexture(1024, (d, size) => {
    for (let y = 0; y < size; y++) {
      const v = y / size;
      const plank = Math.floor(v * planks);
      const pv = v * planks - plank;
      const seam = Math.min(pv, 1 - pv) < 0.006 ? 0.78 : 1;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const warp = n(u * 3 + plank * 7.3, pv * 2, 3, 3, 1e6) * 2.4;
        const ring = 0.5 + 0.5 * Math.sin((pv * 9 + warp + plank * 1.7) * Math.PI);
        const fiber = n2(u * 6, v * 160, 3, 6, 160);
        let t = ring * 0.45 + fiber * 0.55;
        t = Math.pow(t, 1.3);
        const tone = 0.92 + 0.12 * ((plank * 0.37) % 1);
        const i = (y * size + x) * 4;
        d[i] = mix(156, 206, t) * tone * seam;
        d[i + 1] = mix(104, 150, t) * tone * seam;
        d[i + 2] = mix(62, 96, t) * tone * seam;
        d[i + 3] = 255;
      }
    }
  });
}

export function breadTexture() {
  const n = makeNoise(21);
  const r = rng(5);
  return canvasTexture(512, (d, size) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const t = n(u * 8, v * 8, 5, 8);
        const blotch = n(u * 3 + 10, v * 3, 3, 3);
        const i = (y * size + x) * 4;
        const dark = Math.max(0, blotch - 0.5) * 1.6;
        const k = Math.min(1, t * 0.65 + dark);
        d[i] = mix(222, 158, k);
        d[i + 1] = mix(164, 96, k);
        d[i + 2] = mix(92, 44, k);
        d[i + 3] = 255;
      }
    }
    // Poren und Mehlstaub
    for (let k = 0; k < 500; k++) {
      const cx = r() * size;
      const cy = r() * size;
      const rad = 1 + r() * 2.5;
      for (let yy = -4; yy <= 4; yy++) {
        for (let xx = -4; xx <= 4; xx++) {
          const q = (xx * xx + yy * yy) / (rad * rad);
          if (q > 1) continue;
          const px = (Math.floor(cx + xx) + size) % size;
          const py = (Math.floor(cy + yy) + size) % size;
          const i = (py * size + px) * 4;
          const a = 0.45 * (1 - q);
          d[i] *= 1 - a;
          d[i + 1] *= 1 - a;
          d[i + 2] *= 1 - a;
        }
      }
    }
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

// Emmentaler: warmes Gelb mit schattierten Löchern
export function cheeseBlockTexture() {
  const n = makeNoise(33);
  const r = rng(9);
  return canvasTexture(512, (d, size) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const t = n(u * 10, v * 10, 4, 10);
        const i = (y * size + x) * 4;
        d[i] = mix(252, 238, t);
        d[i + 1] = mix(222, 196, t);
        d[i + 2] = mix(128, 92, t);
        d[i + 3] = 255;
      }
    }
    const holes = [];
    for (let k = 0; k < 60 && holes.length < 16; k++) {
      const h = { x: r() * size, y: r() * size, rad: 12 + r() * 26 };
      if (holes.every((o) => Math.hypot(o.x - h.x, o.y - h.y) > o.rad + h.rad + 10)) holes.push(h);
    }
    for (const h of holes) {
      const R = Math.ceil(h.rad + 3);
      for (let yy = -R; yy <= R; yy++) {
        for (let xx = -R; xx <= R; xx++) {
          const q = Math.hypot(xx, yy * 1.15) / h.rad;
          if (q > 1.12) continue;
          const px = (Math.floor(h.x + xx) + size) % size;
          const py = (Math.floor(h.y + yy) + size) % size;
          const i = (py * size + px) * 4;
          if (q > 1) {
            // heller Rand
            d[i] = mix(d[i], 255, 0.35);
            d[i + 1] = mix(d[i + 1], 238, 0.35);
            d[i + 2] = mix(d[i + 2], 170, 0.35);
            continue;
          }
          // Mulde: oben dunkler (Schatten), unten heller
          const shade = 0.55 + 0.35 * (yy / h.rad);
          d[i] = mix(200, 246, shade);
          d[i + 1] = mix(150, 206, shade);
          d[i + 2] = mix(52, 104, shade);
        }
      }
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
          const t = n(u * 6, v * 6, 5, 6);
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
          const t = n(u * 2, v * 24, 4, 2, 24);
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

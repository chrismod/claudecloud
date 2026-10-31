// Prozedurale Texturen (Canvas): Asphalt, Gras, Randsteine, Käse, Kisten, Partikel, Schilder
import * as THREE from 'three';

// --- kachelbares Wertrauschen -------------------------------------------------------------------
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const w = (v) => ((v % period) + period) % period;
  const a = hash(w(xi), w(yi), seed);
  const b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed);
  const d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
// fbm über [0,1)² kachelbar
export function fbm(u, v, base = 4, oct = 5, seed = 1) {
  let s = 0;
  let amp = 0.5;
  let p = base;
  for (let o = 0; o < oct; o++) {
    s += vnoise(u * p, v * p, p, seed + o * 17) * amp;
    amp *= 0.5;
    p *= 2;
  }
  return s;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Normalenkarte aus Höhenfeld (Float32Array n×n, kachelbar)
function normalFromHeight(hf, n, strength) {
  const c = canvas(n);
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const l = hf[y * n + ((x - 1 + n) % n)];
      const r = hf[y * n + ((x + 1) % n)];
      const u = hf[((y - 1 + n) % n) * n + x];
      const d = hf[((y + 1) % n) * n + x];
      let nx = (l - r) * strength;
      let ny = (u - d) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * n + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

const cache = new Map();
const memo = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

// --- Asphalt -------------------------------------------------------------------------------------
// Quer über die Fahrbahn (u) mit Randlinien, längs (v) kachelnd
export function roadTextures(style = 'day') {
  return memo('road-' + style, () => {
    const n = 512;
    const c = canvas(n);
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    const hf = new Float32Array(n * n);
    const night = style === 'night';
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const u = x / n;
        const v = y / n;
        const big = fbm(u, v, 3, 3, 3);
        const fine = fbm(u, v, 64, 3, 9);
        const grain = hash(x, y, 5);
        // Fahrspuren etwas dunkler und glatter
        const lane = Math.exp(-(((u - 0.3) / 0.07) ** 2)) + Math.exp(-(((u - 0.7) / 0.07) ** 2));
        let l = 0.26 + big * 0.1 + fine * 0.08 + (grain > 0.93 ? 0.12 : grain < 0.05 ? -0.06 : 0) - lane * 0.04;
        if (night) l *= 0.7;
        const i = (y * n + x) * 4;
        img.data[i] = l * 255 * 0.98;
        img.data[i + 1] = l * 255;
        img.data[i + 2] = l * 255 * 1.04;
        img.data[i + 3] = 255;
        hf[y * n + x] = fine * 0.6 + (grain > 0.9 ? 0.4 : 0);
      }
    g.putImageData(img, 0, 0);
    // Randlinien
    g.fillStyle = night ? 'rgba(255,170,60,0.95)' : 'rgba(245,245,238,0.92)';
    g.fillRect(n * 0.035, 0, n * 0.022, n);
    g.fillRect(n * (1 - 0.057), 0, n * 0.022, n);
    // gestrichelte Mittellinie, abgefahren
    g.fillStyle = night ? 'rgba(255,190,90,0.55)' : 'rgba(250,215,90,0.75)';
    g.fillRect(n * 0.494, 0, n * 0.012, n * 0.42);
    // Gummiabrieb
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(10,10,12,${0.04 + Math.random() * 0.05})`;
      const x = n * (0.25 + Math.random() * 0.5);
      g.fillRect(x, Math.random() * n, 2 + Math.random() * 3, 40 + Math.random() * 200);
    }
    const map = tex(c);
    const normalMap = normalFromHeight(hf, n, 2.2);
    // Rauheit: Fahrspuren glatter
    const rc = canvas(64);
    const rg = rc.getContext('2d');
    const grad = rg.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, '#f0f0f0');
    grad.addColorStop(0.3, '#b8b8b8');
    grad.addColorStop(0.5, '#e0e0e0');
    grad.addColorStop(0.7, '#b8b8b8');
    grad.addColorStop(1, '#f0f0f0');
    rg.fillStyle = grad;
    rg.fillRect(0, 0, 64, 64);
    const roughnessMap = tex(rc, { srgb: false });
    return { map, normalMap, roughnessMap };
  });
}

// --- Bodentexturen (Weltkoordinaten, kachelnd) ---------------------------------------------------
export function groundTexture(kind) {
  return memo('ground-' + kind, () => {
    const n = 512;
    const c = canvas(n);
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    const hf = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const u = x / n;
        const v = y / n;
        const a = fbm(u, v, 8, 4, 11);
        const b = fbm(u, v, 32, 3, 21);
        const h = hash(x, y, 2);
        let r, gg, bb;
        if (kind === 'ash') {
          const l = 0.55 + a * 0.35 + b * 0.2 + (h > 0.96 ? 0.25 : 0);
          r = l * 0.42;
          gg = l * 0.38;
          bb = l * 0.37;
        } else {
          // Grün mit hellen Halmspitzen und dunklen Lücken (Farbe wird mit Vertexfarbe multipliziert)
          const l = 0.62 + a * 0.3 + b * 0.25 + (h > 0.85 ? 0.18 : h < 0.12 ? -0.2 : 0);
          r = l * 0.92;
          gg = l;
          bb = l * 0.8;
        }
        const i = (y * n + x) * 4;
        img.data[i] = Math.min(255, r * 255);
        img.data[i + 1] = Math.min(255, gg * 255);
        img.data[i + 2] = Math.min(255, bb * 255);
        img.data[i + 3] = 255;
        hf[y * n + x] = b + h * 0.3;
      }
    g.putImageData(img, 0, 0);
    if (kind !== 'ash') {
      // kurze Halmstriche, kachelnd
      for (let k = 0; k < 9000; k++) {
        const x = Math.random() * n;
        const y = Math.random() * n;
        const l = 4 + Math.random() * 7;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
        const light = Math.random() < 0.5;
        g.strokeStyle = light ? `rgba(235,255,200,${0.12 + Math.random() * 0.12})` : `rgba(20,40,10,${0.1 + Math.random() * 0.12})`;
        g.lineWidth = 1;
        for (const ox of [0, -n, n])
          for (const oy of [0, -n, n]) {
            g.beginPath();
            g.moveTo(x + ox, y + oy);
            g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
            g.stroke();
          }
      }
    }
    return { map: tex(c), normalMap: normalFromHeight(hf, n, kind === 'ash' ? 3 : 1.5) };
  });
}

// --- Randsteine: Käsegelb / Wachsrot ------------------------------------------------------------
export function curbTexture(a = '#e4352b', b = '#f6d04a') {
  return memo('curb' + a + b, () => {
    const c = canvas(128, 64);
    const g = c.getContext('2d');
    g.fillStyle = a;
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = b;
    g.fillRect(0, 0, 128, 32);
    // leichte Verschmutzung
    for (let k = 0; k < 300; k++) {
      g.fillStyle = `rgba(40,30,20,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * 128, Math.random() * 64, 2, 2);
    }
    const t = tex(c);
    return t;
  });
}

// --- Käse mit Löchern (Emmentaler) --------------------------------------------------------------
export function cheeseTexture(holes = true, base = '#f4c542') {
  return memo('cheese' + holes + base, () => {
    const n = 256;
    const c = canvas(n);
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    const img = g.getImageData(0, 0, n, n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const f = fbm(x / n, y / n, 6, 3, 41) - 0.5;
        const i = (y * n + x) * 4;
        img.data[i] += f * 40;
        img.data[i + 1] += f * 34;
        img.data[i + 2] += f * 10;
      }
    g.putImageData(img, 0, 0);
    if (holes) {
      for (let k = 0; k < 14; k++) {
        const x = Math.random() * n;
        const y = Math.random() * n;
        const r = 6 + Math.random() * 16;
        for (const ox of [0, -n, n])
          for (const oy of [0, -n, n]) {
            const gr = g.createRadialGradient(x + ox - r * 0.2, y + oy - r * 0.3, r * 0.1, x + ox, y + oy, r);
            gr.addColorStop(0, '#b07d14');
            gr.addColorStop(0.75, '#d9a326');
            gr.addColorStop(1, 'rgba(255,230,140,0.9)');
            g.fillStyle = gr;
            g.beginPath();
            g.ellipse(x + ox, y + oy, r, r * 0.85, 0, 0, Math.PI * 2);
            g.fill();
          }
      }
    }
    return tex(c);
  });
}

// --- Käsekiste: leuchtendes Fragezeichen auf Käse ------------------------------------------------
export function boxTexture() {
  return memo('box', () => {
    const n = 256;
    const c = canvas(n);
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, n, n);
    gr.addColorStop(0, '#ffe680');
    gr.addColorStop(0.5, '#ffb52e');
    gr.addColorStop(1, '#ff7a1a');
    g.fillStyle = gr;
    g.fillRect(0, 0, n, n);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 14;
    g.strokeRect(10, 10, n - 20, n - 20);
    g.font = '900 170px "Barlow Condensed", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(120,50,0,0.35)';
    g.fillText('?', n / 2 + 6, n / 2 + 14);
    g.fillStyle = '#fff';
    g.fillText('?', n / 2, n / 2 + 8);
    return tex(c, { repeat: false });
  });
}

// --- Partikel-Sprite (weicher Kreis) -------------------------------------------------------------
export function softSprite() {
  return memo('soft', () => {
    const n = 64;
    const c = canvas(n);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, n, n);
    return tex(c, { srgb: false, repeat: false });
  });
}

// Rauchwolke mit etwas Struktur
export function puffSprite() {
  return memo('puff', () => {
    const n = 128;
    const c = canvas(n);
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = x / n - 0.5;
        const dy = y / n - 0.5;
        const r = Math.hypot(dx, dy) * 2;
        const f = fbm(x / n, y / n, 4, 4, 77);
        const a = Math.max(0, 1 - r * (0.8 + f * 0.6)) ** 1.5;
        const i = (y * n + x) * 4;
        const l = 200 + f * 55;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = l;
        img.data[i + 3] = a * 255;
      }
    g.putImageData(img, 0, 0);
    return tex(c, { srgb: false, repeat: false });
  });
}

// --- Grasbüschel (Alpha) ------------------------------------------------------------------------
export function grassBladeTexture() {
  return memo('blades', () => {
    const w = 128;
    const h = 128;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    for (let k = 0; k < 34; k++) {
      const x = 10 + Math.random() * (w - 20);
      const bend = (Math.random() - 0.5) * 30;
      const top = 10 + Math.random() * 50;
      const gr = g.createLinearGradient(0, h, 0, top);
      gr.addColorStop(0, '#3d5a1c');
      gr.addColorStop(1, Math.random() < 0.5 ? '#b7d36a' : '#94bd4c');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x - 3, h);
      g.quadraticCurveTo(x + bend * 0.3, (h + top) / 2, x + bend, top);
      g.quadraticCurveTo(x + bend * 0.3 + 1, (h + top) / 2, x + 3, h);
      g.fill();
    }
    return tex(c, { repeat: false });
  });
}

// --- Schild mit Text ---------------------------------------------------------------------------
export function signTexture(text, { bg = '#1b1b24', fg = '#ffd23f', w = 1024, h = 192, font = 'italic 900 132px "Barlow Condensed", Impact, sans-serif', stripe = '#e8582a' } = {}) {
  return memo('sign' + text + bg + fg + w + h, () => {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (stripe) {
      g.fillStyle = stripe;
      g.fillRect(0, 0, w, h * 0.08);
      g.fillRect(0, h * 0.92, w, h * 0.08);
    }
    // Schrift verkleinern, bis der Text passt (auch mit Ersatzschrift)
    let size = parseFloat(font.match(/(\d+)px/)[1]);
    g.font = font;
    while (g.measureText(text).width > w * 0.9 && size > 10) {
      size -= 4;
      g.font = font.replace(/\d+px/, size + 'px');
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.fillText(text, w / 2, h / 2 + 6);
    return tex(c, { repeat: false });
  });
}

export function checkerTexture() {
  return memo('checker', () => {
    const c = canvas(256, 64);
    const g = c.getContext('2d');
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 16; x++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
        g.fillRect(x * 16, y * 16, 16, 16);
      }
    const t = tex(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  });
}

// Boost-Feld: Pfeile
export function padTexture() {
  return memo('pad', () => {
    const c = canvas(128, 256);
    const g = c.getContext('2d');
    g.fillStyle = '#ff9a1a';
    g.fillRect(0, 0, 128, 256);
    for (let k = 0; k < 3; k++) {
      const y = 200 - k * 80;
      g.fillStyle = k % 2 ? '#fff4c2' : '#ffe14a';
      g.beginPath();
      g.moveTo(14, y);
      g.lineTo(64, y - 56);
      g.lineTo(114, y);
      g.lineTo(114, y + 26);
      g.lineTo(64, y - 30);
      g.lineTo(14, y + 26);
      g.closePath();
      g.fill();
    }
    return tex(c, { repeat: false });
  });
}

// Holz / Planken
export function woodTexture() {
  return memo('wood', () => {
    const n = 256;
    const c = canvas(n);
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const f = fbm(x / n, (y / n) * 0.1, 8, 4, 5);
        const grain = Math.sin((y / n) * 80 + f * 12) * 0.5 + 0.5;
        const l = 0.5 + grain * 0.18 + f * 0.25 - ((y % 64) < 2 ? 0.25 : 0);
        const i = (y * n + x) * 4;
        img.data[i] = l * 170;
        img.data[i + 1] = l * 112;
        img.data[i + 2] = l * 64;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return tex(c);
  });
}

// Lava: Krusten mit glühenden Rissen (Emissive-Karte)
export function lavaTexture() {
  return memo('lava', () => {
    const n = 512;
    const c = canvas(n);
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const u = x / n;
        const v = y / n;
        const f = fbm(u, v, 6, 5, 91);
        const cr = Math.abs(fbm(u, v, 4, 4, 13) - 0.5);
        const glow = Math.max(0, 1 - cr * 9) ** 2 + Math.max(0, f - 0.55) * 2;
        const i = (y * n + x) * 4;
        img.data[i] = Math.min(255, glow * 255 + 20);
        img.data[i + 1] = Math.min(255, glow * glow * 150 + 8);
        img.data[i + 2] = Math.min(255, glow * glow * glow * 40);
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return tex(c);
  });
}

// Wassernormalen
export function waterNormals() {
  return memo('water', () => {
    const n = 256;
    const hf = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) hf[y * n + x] = fbm(x / n, y / n, 8, 4, 33);
    return normalFromHeight(hf, n, 6);
  });
}

// Felle der Mäuse: leicht fleckig
export function furTexture() {
  return memo('fur', () => {
    const n = 128;
    const c = canvas(n);
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const f = fbm(x / n, y / n, 16, 3, 7);
        const l = 200 + f * 55 - (hash(x, y, 4) > 0.8 ? 25 : 0);
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = l;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return tex(c);
  });
}

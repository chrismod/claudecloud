// Prozedurale Modelle: Gras, Farne, Blumen, Pilze, Sträucher, Bäume, Totholz, Felsen.
// Alle Geometrien haben dieselben Attribute: position, normal, color, aMask (x = Tönung, y = Leuchten).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../noise.js';

const C = (hex) => new THREE.Color(hex);

function finish(geo, color, mask = [0, 0]) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const msk = new Float32Array(n * 2);
  const p = g.attributes.position;
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const c = typeof color === 'function' ? color(p.getX(i), p.getY(i), p.getZ(i), tmp) : color;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    const m = typeof mask === 'function' ? mask(p.getX(i), p.getY(i), p.getZ(i)) : mask;
    msk[i * 2] = m[0];
    msk[i * 2 + 1] = m[1];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMask', new THREE.BufferAttribute(msk, 2));
  return g;
}

const merge = (list) => {
  const g = mergeGeometries(list);
  g.computeBoundingSphere();
  return g;
};

// Röhre entlang Punkten mit Radien (für Stämme, Äste, Wurzeln, Halme)
export function tube(points, radii, radial = 7, capEnd = true) {
  const pos = [];
  const idx = [];
  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const ref = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    fwd.subVectors(b, a).normalize();
    if (Math.abs(fwd.dot(ref)) > 0.9) ref.set(1, 0, 0);
    side.crossVectors(fwd, ref).normalize();
    up.crossVectors(side, fwd).normalize();
    for (let k = 0; k < radial; k++) {
      const t = (k / radial) * Math.PI * 2;
      const r = radii[i];
      pos.push(
        points[i].x + (Math.cos(t) * side.x + Math.sin(t) * up.x) * r,
        points[i].y + (Math.cos(t) * side.y + Math.sin(t) * up.y) * r,
        points[i].z + (Math.cos(t) * side.z + Math.sin(t) * up.z) * r,
      );
    }
  }
  for (let i = 0; i < points.length - 1; i++)
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      const c = (i + 1) * radial + k;
      const d = (i + 1) * radial + ((k + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  if (capEnd) {
    const last = points[points.length - 1];
    const ci = pos.length / 3;
    pos.push(last.x, last.y, last.z);
    const base = (points.length - 1) * radial;
    for (let k = 0; k < radial; k++) idx.push(base + k, ci, base + ((k + 1) % radial));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Unregelmäßiger Klumpen (Laub, Moos, Fels)
export function blob(r, detail, seed, rough = 0.25) {
  const ico = new THREE.IcosahedronGeometry(r, detail);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico); // weiche Normalen statt Facetten
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const s = seed * 13.7;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d =
      Math.sin(n.x * 3.1 + s) * Math.cos(n.y * 2.7 - s) +
      Math.sin(n.z * 4.3 + s * 0.7) * 0.6 +
      Math.sin((n.x + n.z) * 7.0 + s) * 0.25;
    v.addScaledVector(n, d * rough * r);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Gekrümmtes, spitz zulaufendes Blatt / Halm als Streifen
function blade(height, width, lean, dir, segs = 4, bend = 0.6) {
  const pos = [];
  const idx = [];
  const dx = Math.cos(dir);
  const dz = Math.sin(dir);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = height * t;
    const off = lean * t * t * bend + lean * t * (1 - bend);
    const w = width * (1 - t) * (0.6 + 0.4 * Math.sin(t * Math.PI + 0.3));
    const cx = dx * off;
    const cz = dz * off;
    pos.push(cx - dz * w, y, cz + dx * w, cx + dz * w, y, cz - dx * w);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // weiche, nach oben zeigende Normalen: Gras wirkt dann flauschig statt flach
  const n = [];
  for (let i = 0; i < pos.length / 3; i++) n.push(dx * 0.25, 0.95, dz * 0.25);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  return g;
}

export function grass() {
  const r = rng(11);
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const h = 0.45 + r() * 0.45;
    const dir = r() * Math.PI * 2;
    const g = blade(h, 0.055 + r() * 0.03, 0.12 + r() * 0.28, dir);
    g.translate((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3);
    parts.push(finish(g, (x, y, z, c) => c.copy(C('#1d3a0c')).lerp(C('#8fb33a'), Math.min(1, y / 0.8)), [1, 0]));
  }
  return merge(parts);
}

export function reed() {
  const r = rng(12);
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const h = 1.3 + r() * 1.0;
    const g = blade(h, 0.04, 0.15 + r() * 0.2, r() * Math.PI * 2, 5);
    g.translate((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4);
    parts.push(finish(g, (x, y, z, c) => c.copy(C('#30481a')).lerp(C('#a3b864'), y / 2.2), [1, 0]));
  }
  // Rohrkolben
  for (let i = 0; i < 2; i++) {
    const g = new THREE.CapsuleGeometry(0.06, 0.32, 2, 6);
    const x = (r() - 0.5) * 0.3;
    const z = (r() - 0.5) * 0.3;
    g.translate(x + 0.08, 1.9 + i * 0.3, z);
    parts.push(finish(g, C('#4a2e1a'), [0, 0]));
  }
  return merge(parts);
}

export function fern() {
  const r = rng(13);
  const parts = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const dir = (i / n) * Math.PI * 2 + r() * 0.4;
    const len = 0.7 + r() * 0.4;
    const pos = [];
    const idx = [];
    const segs = 8;
    const dx = Math.cos(dir);
    const dz = Math.sin(dir);
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const out = len * t;
      const y = Math.sin(t * Math.PI * 0.85) * 0.55 * len - t * t * 0.15;
      // gefiederte Kante: abwechselnd breit und schmal
      const w = (0.16 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.01) * (k % 2 ? 1 : 0.55);
      pos.push(dx * out - dz * w, y, dz * out + dx * w, dx * out + dz * w, y, dz * out - dx * w);
      if (k < segs) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nn = g.attributes.normal;
    for (let k = 0; k < nn.count; k++) nn.setXYZ(k, nn.getX(k) * 0.3, 0.95, nn.getZ(k) * 0.3);
    parts.push(finish(g, (x, y, z, c) => c.copy(C('#1e4214')).lerp(C('#5f9a2a'), Math.min(1, Math.hypot(x, z) / len)), [1, 0]));
  }
  return merge(parts);
}

export function flower() {
  const r = rng(14);
  const parts = [];
  for (let f = 0; f < 3; f++) {
    const h = 0.35 + r() * 0.3;
    const ox = (r() - 0.5) * 0.35;
    const oz = (r() - 0.5) * 0.35;
    const stem = blade(h, 0.02, 0.05, r() * 6.28, 3, 0.3);
    stem.translate(ox, 0, oz);
    parts.push(finish(stem, C('#3a6a1c'), [0, 0]));
    const petals = 6;
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * Math.PI * 2;
      const pg = new THREE.PlaneGeometry(0.07, 0.12);
      pg.translate(0, 0.07, 0);
      pg.rotateX(-1.1);
      pg.rotateY(a);
      pg.translate(ox, h, oz);
      parts.push(finish(pg, C('#ffffff'), [1, 0.15]));
    }
    const c = new THREE.SphereGeometry(0.035, 6, 4);
    c.translate(ox, h + 0.02, oz);
    parts.push(finish(c, C('#f2c230'), [0, 0.2]));
  }
  return merge(parts);
}

function mushroom({ stemH, stemR, capR, capH, capColor, stemColor = C('#efe6d4'), glow = 0, tint = 1, flat = 0.25 }) {
  const parts = [];
  const sp = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    sp.push(new THREE.Vector2(stemR * (1.25 - 0.4 * t + 0.25 * Math.sin(t * 3)), stemH * t));
  }
  const stem = new THREE.LatheGeometry(sp, 9);
  parts.push(finish(stem, stemColor, [0, glow * 0.2]));
  const cp = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * Math.PI * 0.5;
    // Unterseite (Lamellen) → Kappenrand → Kuppe
    cp.push(new THREE.Vector2(Math.max(0.001, capR * Math.cos(a)), stemH - capH * flat + capH * Math.sin(a)));
  }
  // Profil: Unterseite am Stiel → Rand → Kuppe
  cp.unshift(new THREE.Vector2(stemR * 0.9, stemH - capH * flat - 0.01));
  const cap = new THREE.LatheGeometry(cp, 12);
  const under = stemH - capH * flat + 0.02;
  parts.push(
    finish(
      cap,
      (x, y, z, c) => (y < under ? c.copy(C('#d8cbb0')) : c.copy(capColor)),
      (x, y) => (y < under ? [0, glow] : [tint, glow * 0.7]),
    ),
  );
  return parts;
}

export function mushRed() {
  const parts = mushroom({ stemH: 0.32, stemR: 0.045, capR: 0.2, capH: 0.13, capColor: C('#ffffff'), flat: 0.15 });
  const r = rng(15);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const rad = 0.04 + r() * 0.11;
    const d = new THREE.SphereGeometry(0.018 + r() * 0.012, 5, 3);
    d.scale(1, 0.5, 1);
    const y = 0.32 + 0.13 * 0.85 * Math.cos((rad / 0.2) * 1.2) - 0.005;
    d.translate(Math.cos(a) * rad, y, Math.sin(a) * rad);
    parts.push(finish(d, C('#fff8ec'), [0, 0]));
  }
  return merge(parts);
}

export function mushBrown() {
  const r = rng(16);
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const s = 0.6 + r() * 0.5;
    const m = mushroom({ stemH: 0.2 * s, stemR: 0.04 * s, capR: 0.13 * s, capH: 0.08 * s, capColor: C('#ffffff') });
    m.forEach((g) => g.translate((r() - 0.5) * 0.35, 0, (r() - 0.5) * 0.35));
    parts.push(...m);
  }
  return merge(parts);
}

export function mushGlow() {
  const r = rng(17);
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const s = 0.6 + r() * 0.6;
    const m = mushroom({ stemH: 0.35 * s, stemR: 0.018 * s, capR: 0.08 * s, capH: 0.1 * s, capColor: C('#ffffff'), glow: 1, flat: 0.7, stemColor: C('#cfe8e4') });
    m.forEach((g) => {
      g.rotateZ((r() - 0.5) * 0.4);
      g.translate((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3);
    });
    parts.push(...m);
  }
  return merge(parts);
}

export function puffball() {
  const g = blob(0.28, 2, 3, 0.06);
  g.scale(1, 0.8, 1);
  g.translate(0, 0.2, 0);
  const g2 = blob(0.14, 1, 5, 0.08);
  g2.scale(1, 0.8, 1);
  g2.translate(0.3, 0.1, 0.12);
  return merge([
    finish(g, (x, y, z, c) => c.copy(C('#efe4c8')).lerp(C('#b8a57e'), Math.max(0, 0.2 - y) * 4), [0, 0.35]),
    finish(g2, C('#e8dcc0'), [0, 0.25]),
  ]);
}

export function bush() {
  const r = rng(18);
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const rad = 0.35 + r() * 0.35;
    const g = blob(rad, 1, i + 1, 0.3);
    const a = r() * Math.PI * 2;
    const d = r() * 0.45;
    g.translate(Math.cos(a) * d, rad * 0.8 + r() * 0.3, Math.sin(a) * d);
    parts.push(finish(g, (x, y, z, c) => c.copy(C('#24481a')).lerp(C('#5d8f2c'), Math.min(1, y / 1.2)), [1, 0]));
  }
  // Beeren
  for (let i = 0; i < 10; i++) {
    const b = new THREE.SphereGeometry(0.05, 5, 4);
    const a = r() * Math.PI * 2;
    b.translate(Math.cos(a) * 0.6, 0.5 + r() * 0.6, Math.sin(a) * 0.6);
    parts.push(finish(b, C('#c0182c'), [0, 0.3]));
  }
  return merge(parts);
}

export function rock() {
  const g = blob(1, 1, 7, 0.22);
  g.scale(1.2, 0.7, 1);
  g.translate(0, 0.25, 0);
  return merge([finish(g, (x, y, z, c) => c.copy(C('#6f6a63')).lerp(C('#9a948a'), Math.max(0, y)), [0, 0])]);
}

// --- Bäume: Stamm und Krone teilen sich denselben Ursprung ------------------------------

function trunkGeo(seed, height, radius, bend, branches, barkA, barkB, birch = false) {
  const r = rng(seed);
  const parts = [];
  const pts = [];
  const rad = [];
  const segs = 8;
  const bx = (r() - 0.5) * bend;
  const bz = (r() - 0.5) * bend;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(new THREE.Vector3(bx * Math.sin(t * 2.2) + (r() - 0.5) * 0.08, t * height, bz * Math.sin(t * 1.7)));
    rad.push(radius * (1 - t * 0.78) * (i === 0 ? 1.5 : 1));
  }
  const color = (x, y, z, c) => {
    if (birch) {
      const band = Math.sin(y * 7.3 + Math.sin(x * 9) * 2) > 0.82;
      return c.copy(band ? C('#2a2622') : C('#e9e4d8'));
    }
    return c.copy(barkA).lerp(barkB, 0.5 + 0.5 * Math.sin(y * 3.1 + x * 8));
  };
  parts.push(finish(tube(pts, rad, 8), color));
  const tips = [pts[segs]];
  for (let b = 0; b < branches; b++) {
    const t0 = 0.45 + r() * 0.4;
    const i0 = Math.floor(t0 * segs);
    const start = pts[i0].clone();
    const a = (b / branches) * Math.PI * 2 + r();
    const len = height * (0.22 + r() * 0.18);
    const bp = [];
    const br = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      bp.push(new THREE.Vector3(start.x + Math.cos(a) * len * t, start.y + len * (0.6 * t + 0.25 * t * t), start.z + Math.sin(a) * len * t));
      br.push(rad[i0] * 0.55 * (1 - t * 0.85));
    }
    parts.push(finish(tube(bp, br, 6), color));
    tips.push(bp[4]);
  }
  return { geo: merge(parts), tips };
}

function crownBlobs(tips, seed, size, colA, colB) {
  const r = rng(seed);
  const parts = [];
  for (const tip of tips) {
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const rad = size * (0.7 + r() * 0.5);
      const g = blob(rad, 1, r() * 100, 0.28);
      g.scale(1, 0.75, 1);
      g.translate(tip.x + (r() - 0.5) * size, tip.y + (r() - 0.2) * size * 0.6, tip.z + (r() - 0.5) * size);
      parts.push(finish(g, (x, y, z, c) => c.copy(colA).lerp(colB, Math.min(1, Math.max(0, (y - tip.y + size) / (size * 2)))), [1, 0]));
    }
  }
  return merge(parts);
}

export function oak(seed = 21) {
  const t = trunkGeo(seed, 6.5, 0.38, 1.2, 5, C('#3b2c22'), C('#5a4636'));
  return { trunk: t.geo, crown: crownBlobs(t.tips, seed + 1, 1.7, C('#1d3d14'), C('#5f8f2a')) };
}

export function birch(seed = 31) {
  const t = trunkGeo(seed, 8, 0.2, 0.6, 4, null, null, true);
  return { trunk: t.geo, crown: crownBlobs(t.tips, seed + 1, 1.15, C('#3d6a1c'), C('#a8c84a')) };
}

export function fir(seed = 41) {
  const r = rng(seed);
  const pts = [];
  const rad = [];
  for (let i = 0; i <= 6; i++) {
    pts.push(new THREE.Vector3((r() - 0.5) * 0.06, i * 1.6, (r() - 0.5) * 0.06));
    rad.push(0.32 * (1 - i / 6.6));
  }
  const trunk = merge([finish(tube(pts, rad, 7), (x, y, z, c) => c.copy(C('#3a2a1e')).lerp(C('#56402c'), 0.5 + 0.5 * Math.sin(y * 4)))]);
  // kahle Astquirle für den toten Zustand sind Teil des Stamms
  const parts = [];
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const h = 2.2 + t * 7;
    const rr = 2.4 * (1 - t * 0.8);
    const g = new THREE.ConeGeometry(rr, 2.6 - t * 0.6, 10, 2, true);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      if (y < 0) {
        const a = Math.atan2(p.getZ(k), p.getX(k));
        const j = 1 + Math.sin(a * 5 + i) * 0.12 + (r() - 0.5) * 0.1;
        p.setXYZ(k, p.getX(k) * j, y - Math.abs(Math.sin(a * 5)) * 0.25, p.getZ(k) * j);
      }
    }
    g.computeVertexNormals();
    g.translate(0, h, 0);
    parts.push(finish(g, (x, y, z, c) => c.copy(C('#123020')).lerp(C('#3f6b2e'), Math.min(1, (y - h + 1.3) / 2.6)), [1, 0]));
  }
  const crown = merge(parts);
  const twigs = [];
  for (let i = 0; i < 12; i++) {
    const h = 2 + (i / 12) * 7;
    const a = i * 2.4;
    const len = 1.8 * (1 - i / 14);
    twigs.push(finish(tube([new THREE.Vector3(0, h, 0), new THREE.Vector3(Math.cos(a) * len, h - 0.3, Math.sin(a) * len)], [0.07, 0.015], 4), C('#3a2d22')));
  }
  return { trunk: merge([trunk, ...twigs]), crown };
}

export function giantMushroom() {
  const sp = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    sp.push(new THREE.Vector2(0.45 * (1.6 - t * 0.7 + 0.25 * Math.sin(t * 5)), t * 6.5));
  }
  const stem = finish(new THREE.LatheGeometry(sp, 14), (x, y, z, c) => c.copy(C('#d9d0c0')).lerp(C('#f4efe4'), y / 6.5), (x, y) => [0, y > 5.8 ? 0.4 : 0]);
  const cp = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * Math.PI * 0.5;
    cp.push(new THREE.Vector2(Math.max(0.01, 4 * Math.cos(a) * (1 + 0.08 * Math.sin(t * 9))), 6.0 + 1.9 * Math.sin(a)));
  }
  cp.push(new THREE.Vector2(0.01, 7.9));
  const under = [new THREE.Vector2(0.4, 6.2), new THREE.Vector2(4.0, 6.0)];
  const cap = finish(new THREE.LatheGeometry(cp, 22), (x, y, z, c) => c.copy(C('#ffffff')), [1, 0.15]);
  const gills = finish(new THREE.LatheGeometry(under, 22), C('#f2d9ff'), [0, 1]);
  // Lamellen nach unten sichtbar machen: Normalen umdrehen
  const gn = gills.attributes.normal;
  for (let i = 0; i < gn.count; i++) gn.setXYZ(i, -gn.getX(i), -gn.getY(i), -gn.getZ(i));
  return { stem: merge([stem]), cap: merge([cap, gills]) };
}

export function deadLog() {
  const r = rng(51);
  const pts = [];
  const rad = [];
  for (let i = 0; i <= 6; i++) {
    pts.push(new THREE.Vector3(-2.2 + i * 0.75, 0.35 + Math.sin(i) * 0.05, (r() - 0.5) * 0.15));
    rad.push(0.42 * (1 - i * 0.04) * (0.9 + r() * 0.2));
  }
  const parts = [finish(tube(pts, rad, 9), (x, y, z, c) => c.copy(C('#4a4038')).lerp(C('#6d6256'), 0.5 + 0.5 * Math.sin(x * 5 + z * 9)))];
  // Baumpilze (Konsolen) – glimmen leicht, damit man Totholz nachts findet
  for (let i = 0; i < 6; i++) {
    const g = new THREE.CylinderGeometry(0.22, 0.24, 0.05, 10, 1, false, 0, Math.PI);
    const x = -1.8 + r() * 3.4;
    const a = r() > 0.5 ? 0 : Math.PI;
    g.rotateY(a + Math.PI / 2);
    g.translate(x, 0.45 + r() * 0.3, a === 0 ? 0.42 : -0.42);
    parts.push(finish(g, C('#d9822b'), [0, 0.8]));
  }
  // abgebrochener Aststumpf
  parts.push(finish(tube([new THREE.Vector3(0.4, 0.6, 0), new THREE.Vector3(0.7, 1.4, 0.3)], [0.13, 0.05], 6), C('#4a4038')));
  return merge(parts);
}

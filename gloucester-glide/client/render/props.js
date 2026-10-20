// Kulisse: Bäume, Dorf mit Kirche im Tal, Festzelte, Wimpelketten, Strohballenwand im Ziel
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise2 } from '../../shared/noise.js';
import { createBale } from './cheese.js';

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();

// Laubkrone aus mehreren verbeulten Kugeln
function crownGeometry() {
  const parts = [];
  const offs = [
    [0, 0, 0, 1.6],
    [0.9, 0.5, 0.3, 1.15],
    [-0.8, 0.6, -0.4, 1.2],
    [0.1, 1.2, 0.2, 1.05],
    [-0.3, 0.1, 1.0, 1.0],
  ];
  for (const [x, y, z, r] of offs) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.85 + noise2(p.getX(i) * 1.7 + x * 3, p.getY(i) * 1.7 + p.getZ(i) * 1.3, 11) * 0.3;
      p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k + y, p.getZ(i) * k + z);
    }
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function coniferGeometry() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.ConeGeometry(1.7 - i * 0.35, 2.2, 7, 1, true);
    c.translate(0, 1.2 + i * 1.15, 0);
    parts.push(c.toNonIndexed());
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function prismGeometry(w, h, d) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(0, h);
  sh.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

function stripes(a, b, n = 8) {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 4;
  const g = cv.getContext('2d');
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect((i * 64) / n, 0, 64 / n, 4);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function buildProps(group, track, { groundAt, fenceX, rng: r, startZ, quality }) {
  const L = track.length;
  const half = track.width / 2;
  const seed = track.def.seed >>> 0;
  const minX = (z) => {
    const zc = Math.min(L, Math.max(0, z));
    return Math.max(half + 4, Math.abs(track.centerAt(zc)) + track.outer + 9);
  };
  const village = { z0: L + 70, z1: L + 230 };

  // --- Bäume ---
  const maxTrees = Math.round(1100 * quality);
  const crown = new THREE.InstancedMesh(crownGeometry(), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), maxTrees);
  const fir = new THREE.InstancedMesh(coniferGeometry(), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), maxTrees);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.3, 2.4, 6), new THREE.MeshLambertMaterial({ color: '#5a4332' }), maxTrees * 2);
  const leaf = ['#4a7f30', '#58902f', '#6b9a3a', '#3f6f2c', '#7d9a3a', '#4f8a3a'].map((h) => new THREE.Color(h));
  const needle = ['#2f5a2e', '#28502b', '#355f33'].map((h) => new THREE.Color(h));
  let nc = 0;
  let nf = 0;
  let nt = 0;
  for (let k = 0; k < maxTrees * 8 && nc + nf < maxTrees; k++) {
    const side = r() < 0.5 ? -1 : 1;
    const z = -180 + r() * (L + 480);
    const x = side * (minX(z) + 2 + r() * r() * 220);
    // Waldstücke und Baumreihen, aber das Dorf frei lassen
    const n = noise2(x * 0.02, z * 0.02, seed + 21);
    const hedgeRow = Math.abs(((x * 0.94 + z * 0.34) % 46) + 46) % 46 < 2.5 && r() < 0.5;
    if (n < 0.52 && !hedgeRow) continue;
    if (z > village.z0 - 10 && z < village.z1 && Math.abs(x) < 110) continue;
    const y = groundAt(x, z);
    const sc = 0.75 + r() * 1.0;
    const conifer = n > 0.72 && r() < 0.6;
    trunk.setMatrixAt(nt++, m4.compose(v.set(x, y + 1.1 * sc, z), q.identity(), s.set(sc, sc, sc)));
    e.set(r() * 0.3 - 0.15, r() * 6.28, r() * 0.3 - 0.15);
    q.setFromEuler(e);
    if (conifer) {
      fir.setMatrixAt(nf, m4.compose(v.set(x, y + 0.8 * sc, z), q, s.set(sc, sc * (1 + r() * 0.4), sc)));
      fir.setColorAt(nf++, needle[Math.floor(r() * needle.length)]);
    } else {
      crown.setMatrixAt(nc, m4.compose(v.set(x, y + 3.1 * sc, z), q, s.set(sc, sc * (0.9 + r() * 0.3), sc)));
      crown.setColorAt(nc++, leaf[Math.floor(r() * leaf.length)]);
    }
  }
  crown.count = nc;
  fir.count = nf;
  trunk.count = nt;
  // Bäume stehen weit verteilt – im Schattenpass würden alle gezeichnet, daher ohne Schatten
  group.add(crown, fir, trunk);

  // --- Dorf im Tal (Cotswold-Stein, Schiefer- und Ziegeldächer) ---
  const houses = 46;
  const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), houses + 1);
  const roof = new THREE.InstancedMesh(prismGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), houses);
  const chimney = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), new THREE.MeshLambertMaterial({ color: '#8a6a4a' }), houses);
  const stone = ['#d8c08a', '#cdb57d', '#e0cc9a', '#c9ad78', '#ece2c8'].map((h) => new THREE.Color(h));
  const roofs = ['#4b4f57', '#5a5e66', '#8a4a32', '#6e3d2c'].map((h) => new THREE.Color(h));
  for (let i = 0; i < houses; i++) {
    // entlang einer geschwungenen Dorfstraße
    const t = i / houses;
    const z = village.z0 + t * (village.z1 - village.z0) + (r() - 0.5) * 8;
    const road = Math.sin(t * 5) * 30 + (r() - 0.5) * 6;
    const x = road + (i % 2 ? 1 : -1) * (9 + r() * 10);
    const y = groundAt(x, z);
    const w = 6 + r() * 4;
    const d = 5 + r() * 3;
    const h = 3.6 + r() * 2;
    const yaw = Math.atan2(Math.cos(t * 5) * 30 * 5, village.z1 - village.z0) + (r() - 0.5) * 0.2;
    q.setFromEuler(e.set(0, yaw, 0));
    wall.setMatrixAt(i, m4.compose(v.set(x, y + h / 2 - 0.3, z), q, s.set(w, h, d)));
    wall.setColorAt(i, stone[Math.floor(r() * stone.length)]);
    roof.setMatrixAt(i, m4.compose(v.set(x, y + h - 0.3, z), q, s.set(w + 0.4, 2.4 + r(), d + 0.6)));
    roof.setColorAt(i, roofs[Math.floor(r() * roofs.length)]);
    v.set(w * 0.3, h + 1, 0).applyQuaternion(q);
    chimney.setMatrixAt(i, m4.compose(v.add(new THREE.Vector3(x, y, z)), q, s.set(1, 1, 1)));
  }
  // Roof prism liegt entlang z – um 90° gedreht passt es auf die Längsseite
  roof.geometry.rotateY(Math.PI / 2);
  // Kirche mit Turm
  const cz = (village.z0 + village.z1) / 2 + 15;
  const cx = Math.sin(0.55 * 5) * 30 + 26;
  const cy = groundAt(cx, cz);
  wall.setMatrixAt(houses, m4.compose(v.set(cx, cy + 5, cz), q.identity(), s.set(4.5, 12, 4.5)));
  wall.setColorAt(houses, stone[0]);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(3.1, 7, 4), new THREE.MeshLambertMaterial({ color: '#4b4f57', flatShading: true }));
  spire.position.set(cx, cy + 14.5, cz);
  spire.rotation.y = Math.PI / 4;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 16), new THREE.MeshLambertMaterial({ color: '#d8c08a' }));
  nave.position.set(cx, cy + 3.2, cz + 9);
  const naveRoof = new THREE.Mesh(prismGeometry(7.6, 3.5, 16.4), new THREE.MeshLambertMaterial({ color: '#4b4f57', flatShading: true }));
  naveRoof.position.set(cx, cy + 6.7, cz + 9);
  wall.castShadow = roof.castShadow = true;
  group.add(wall, roof, chimney, spire, nave, naveRoof);

  // --- Festzelte neben dem Ziel ---
  const tentBody = new THREE.MeshLambertMaterial({ map: stripes('#f4f1ea', '#c43c2a', 10) });
  const tentRoof = new THREE.MeshLambertMaterial({ color: '#f4f1ea', flatShading: true });
  const tents = [
    [-1, track.finishZ - 12, 6, 4],
    [1, track.finishZ + 6, 8, 5],
    [-1, track.finishZ + 20, 5, 5],
    [1, startZ + 4, 5, 4],
  ];
  for (const [side, z, w, d] of tents) {
    const x = fenceX(side, z) + side * (8 + w / 2);
    const y = groundAt(x, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), tentBody);
    body.position.set(x, y + 1.1, z);
    const top = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 2.2, 4), tentRoof);
    top.rotation.y = Math.PI / 4;
    top.position.set(x, y + 3.4, z);
    // Fahne auf dem Zelt
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6), new THREE.MeshLambertMaterial({ color: '#dddddd' }));
    pole.position.set(x, y + 5.2, z);
    body.castShadow = top.castShadow = true;
    group.add(body, top, pole);
  }

  // --- Wimpelketten ---
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.38, 0], 3));
  flagGeo.computeVertexNormals();
  const lines = [];
  // quer über die Strecke, hoch über der Bahn
  for (const z of [startZ + 22, track.finishZ - 18, track.finishZ - 40]) {
    if (z < 0 || z > L) continue;
    const xl = fenceX(-1, z);
    const xr = fenceX(1, z);
    lines.push([new THREE.Vector3(xl, groundAt(xl, z) + 6, z), new THREE.Vector3(xr, groundAt(xr, z) + 6, z), 2.5, true]);
  }
  // an den Zäunen bei Start und Ziel
  for (const side of [-1, 1]) {
    for (const [a, b] of [
      [4, 40],
      [track.finishZ - 60, track.finishZ + 20],
    ]) {
      for (let z = a; z < b && z < L - 8; z += 7.5) {
        const x1 = fenceX(side, z);
        const x2 = fenceX(side, z + 7.5);
        lines.push([new THREE.Vector3(x1, groundAt(x1, z) + 1.25, z), new THREE.Vector3(x2, groundAt(x2, z + 7.5) + 1.25, z + 7.5), 0.35, false]);
      }
    }
  }
  const colors = ['#c43c2a', '#f4f1ea', '#2b5fa8', '#f2c230', '#3d8a3a'].map((h) => new THREE.Color(h));
  let flagCount = 0;
  const flagList = [];
  const poles = [];
  for (const [p0, p1, sag, tall] of lines) {
    const n = Math.max(4, Math.round(p0.distanceTo(p1) / 0.6));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = p0.clone().lerp(p1, t);
      p.y -= sag * 4 * t * (1 - t);
      flagList.push({ p, yaw: Math.atan2(p1.x - p0.x, p1.z - p0.z) - Math.PI / 2, c: colors[flagCount++ % colors.length] });
    }
    if (tall) poles.push(p0, p1);
  }
  const flags = new THREE.InstancedMesh(flagGeo, new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide }), flagList.length);
  flagList.forEach((f, i) => {
    flags.setMatrixAt(i, m4.compose(f.p, q.setFromEuler(e.set(0, f.yaw, 0)), s.set(1, 1, 1)));
    flags.setColorAt(i, f.c);
  });
  group.add(flags);
  const poleMat = new THREE.MeshLambertMaterial({ color: '#f2efe8' });
  for (const p of poles) {
    const gy = groundAt(p.x, p.z);
    const h = p.y - gy + 0.3;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 6), poleMat);
    m.position.set(p.x, gy + h / 2, p.z);
    m.castShadow = true;
    group.add(m);
  }
  // Schnüre
  const linePts = [];
  for (const [p0, p1, sag] of lines) {
    const n = 16;
    for (let i = 0; i < n; i++) {
      for (const t of [i / n, (i + 1) / n]) {
        const p = p0.clone().lerp(p1, t);
        p.y -= sag * 4 * t * (1 - t);
        linePts.push(p);
      }
    }
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: '#555555' })));

  // --- Strohballenwand im Ziel (hat auch Kollision in der Simulation) ---
  for (const b of track.catchBales) {
    const m = createBale(b);
    m.position.set(b.x, b.y, b.z);
    group.add(m);
  }

  return { update() {} };
}

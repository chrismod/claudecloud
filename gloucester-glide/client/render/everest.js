// Mount-Everest-Welt: 3,6 km vom Gipfel ins grüne Tal. Wird in 100-m-Abschnitten gebaut:
// Grobe Fassungen der ganzen Strecke stehen sofort, Detailabschnitte (feines Gelände, Zelte,
// Menschen, Gras, Bäume) entstehen erst in der Nähe der Spieler und werden hinter ihnen wieder abgebaut.
import * as THREE from 'three';
import { fbm2, noise2 } from '../../shared/noise.js';
import { rng } from '../../shared/rng.js';
import { crownGeometry, coniferGeometry, prismGeometry, stripes } from './props.js';
import { tuftAssets } from './grass.js';
import { crowdMeshes, person, OUTFITS } from './crowd.js';
import { banner, checkerTexture } from './terrain.js';
import { createBale } from './cheese.js';
import { buildMountains } from './mountains.js';

const CHUNK = 100;
const HI_AHEAD = 650; // so weit voraus gibt es Details
const HI_BEHIND = 160;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const col = (h) => new THREE.Color(h);

const C = {
  snow: col('#f2f6fb'),
  snowShade: col('#d5e1ef'),
  ice: col('#9fd0ea'),
  iceDeep: col('#5fa3cc'),
  crevasse: col('#0d2b4a'),
  rock: col('#5e6068'),
  rockWarm: col('#7a7168'),
  gravel: col('#8c8378'),
  gravelDark: col('#6c655d'),
  alpine: col('#8a9a4c'),
  alpineDry: col('#a79f5c'),
  grass: col('#4f8a2c'),
  grassDeep: col('#3a6e24'),
  path: col('#7d6a52'),
};

// Spaltenpositionen: auf der Strecke im Raster, nach außen immer gröber, endet genau bei ±extent
const NEAR = 120; // bis hierhin Nah-/Detailgelände, dahinter die fernen Flanken
function axis(half, step, extent, grow) {
  const out = [];
  for (let v = -half; v <= half + 1e-6; v += step) out.push(v);
  const tail = [];
  for (let d = step, v = half; ; ) {
    d *= grow;
    v += d;
    if (v >= extent - d * 0.3) break;
    tail.push(v);
  }
  tail.push(extent);
  return [...tail.map((t) => -t).reverse(), ...out, ...tail];
}
// ferne Flanken: Spalten von NEAR bis extent (eine Seite)
function farAxis(extent, step, grow) {
  const out = [NEAR - 6];
  for (let d = step, v = NEAR - 6; v < extent; ) {
    d *= grow;
    v = Math.min(extent, v + d);
    out.push(v);
  }
  return out;
}

export function buildEverestWorld(scene, track, { quality = 1 } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const L = track.length;
  const half = track.width / 2;
  const seed = track.def.seed >>> 0;
  const zoneOf = (z) => track.zoneAt(Math.max(0, Math.min(L - 1, z)));

  // ---------- Höhen außerhalb der Strecke (nur Optik) ----------
  const edge = (side, z) => track.heightAt(side * half, z);
  const outerHeight = (x, z) => {
    const zc = Math.min(L, Math.max(0, z));
    const side = x < 0 ? -1 : 1;
    const out = Math.abs(x) - half;
    let h = out > 0 ? edge(side, zc) : track.heightAt(x, zc);
    if (out > 0) {
      // steile Talflanken mit Graten, nach außen höher, weit draußen flacher (dort stehen die Gipfel)
      const rise = out < 300 ? out * 0.5 : 150 + (out - 300) * 0.2;
      // Basislager: neben der Bahn eine flache Ebene für die Zeltstadt, die Flanken beginnen erst weiter draußen
      const camp = smooth((zc - 1490) / 40) * (1 - smooth((zc - 1800) / 40)) * (1 - smooth((out - 70) / 60));
      h += (out * 1.1 * (1 - smooth(out / 40)) + smooth(out / 40) * 35 + rise) * (1 - camp);
      h += fbm2(x * 0.012, z * 0.012, seed + 99, 4) * 45 * smooth(out / 80) * (1 - camp);
      h += fbm2(x * 0.05, z * 0.05, seed + 98, 2) * 1.2 * camp;
    }
    if (z < 0) h += z * 0.7 + fbm2(x * 0.02, z * 0.02, seed + 7, 3) * 8 * smooth(-z / 30); // hinter dem Gipfel geht es abwärts
    if (z > L) {
      const ax = Math.abs(x);
      const valley = track.heightAt(0, L) - 0.4 + fbm2(x * 0.02, z * 0.02, seed + 8, 2) * 3 + (ax > 80 ? (ax - 80) * 0.5 : 0);
      h += (valley - h) * smooth((z - L - 5) / 80);
    }
    return h;
  };
  const groundAt = (x, z) => (Math.abs(x) <= half && z >= 0 && z <= L ? track.heightAt(x, z) : outerHeight(x, z));

  // ---------- Farbe des Bodens ----------
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  const colorAt = (x, z, y, ny, ao) => {
    const zc = Math.min(L - 1, Math.max(0, z));
    const zone = zoneOf(zc);
    const dx = Math.abs(x - track.centerAt(zc));
    const alt = track.altitudeAt(y);
    const k = noise2(x * 0.08, z * 0.08, seed + 5);
    // Umgebung nach Höhe: Schnee – Fels/Geröll – Almwiese – Grün
    const snowLine = 5150 + (noise2(x * 0.01, z * 0.01, seed + 6) - 0.5) * 700;
    if (alt > snowLine) c.copy(C.snow).lerp(C.snowShade, (1 - ny) * 0.6 + k * 0.2);
    else if (alt > 4250) c.copy(C.gravel).lerp(C.rockWarm, k);
    else if (alt > 3850) c.copy(C.alpine).lerp(C.alpineDry, k * 0.7);
    else c.copy(C.grass).lerp(C.grassDeep, k);
    // Steile Wände: blanker Fels
    if (ny < 0.62) c.lerp(k > 0.5 ? C.rock : C.rockWarm, smooth((0.62 - ny) * 4));
    // Auf der Bahn bestimmt der Untergrund der Physik die Farbe – Eis sieht man!
    if (z >= 0 && z <= L && dx < track.inner + 3 && track.surfaceAt) {
      const s = track.surfaceAt(x, z);
      if (s === 2) tmp.copy(C.ice).lerp(C.iceDeep, noise2(x * 0.3, z * 0.3, seed + 9) * 0.5);
      else if (s === 1) tmp.copy(C.snow).lerp(C.snowShade, 0.15 + k * 0.2);
      else if (s === 3) tmp.copy(C.gravel).lerp(C.gravelDark, k);
      else tmp.copy(zone.id === 'alpine' ? C.alpine : C.grass).lerp(C.grassDeep, k * 0.6);
      // ausgetretener Pfad in der Mitte (unten im Tal)
      if (s === 0 || s === 3) tmp.lerp(C.path, smooth(1 - dx / 2.2) * 0.5);
      c.lerp(tmp, smooth((track.inner + 3 - dx) / 3));
    }
    // Gletscherspalte: je tiefer, desto dunkler blau
    for (const cv of track.crevasses) {
      if (z > cv.z0 - 1 && z < cv.z1 + 1 && y < cv.rim - 0.5) c.copy(C.iceDeep).lerp(C.crevasse, smooth((cv.rim - y) / cv.depth));
    }
    c.multiplyScalar(ao * (0.93 + noise2(x * 1.1, z * 1.1, seed + 6) * 0.14));
    return c;
  };

  // ---------- Gelände-Mesh für einen Bereich ----------
  // feine, körnige Struktur (passt zu Schnee, Geröll und Gras)
  const detail = (() => {
    const n = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = n;
    const g = cv.getContext('2d');
    g.fillStyle = '#e6e6e6';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 14000; i++) {
      const v = 190 + Math.floor(Math.random() * 65);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  })();
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
  function groundMesh(xs, zs, { ao = false } = {}) {
    const cols = xs.length;
    const rows = zs.length;
    const N = cols * rows;
    const pos = new Float32Array(N * 3);
    const nrm = new Float32Array(N * 3);
    const clr = new Float32Array(N * 3);
    const uv = new Float32Array(N * 2);
    const e = 0.6;
    for (let j = 0; j < rows; j++) {
      const z = zs[j];
      for (let i = 0; i < cols; i++) {
        const x = xs[i];
        const k = j * cols + i;
        const y = groundAt(x, z);
        pos[k * 3] = x;
        pos[k * 3 + 1] = y;
        pos[k * 3 + 2] = z;
        // Normale aus der Höhenfunktion: keine Lichtkanten zwischen den Abschnitten
        const step = Math.abs(x) > half ? Math.max(e, (Math.abs(x) - half) * 0.05) : e;
        const nx = -(groundAt(x + step, z) - groundAt(x - step, z)) / (2 * step);
        const nz = -(groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e);
        const l = Math.sqrt(nx * nx + 1 + nz * nz);
        nrm[k * 3] = nx / l;
        nrm[k * 3 + 1] = 1 / l;
        nrm[k * 3 + 2] = nz / l;
        let occl = 1;
        if (ao && Math.abs(x) < half + 6) {
          const avg = (groundAt(x - 4, z) + groundAt(x + 4, z) + groundAt(x, z - 4) + groundAt(x, z + 4)) / 4;
          occl = Math.min(1.05, Math.max(0.75, 1 - (avg - y) * 0.06));
        }
        const cc = colorAt(x, z, y, 1 / l, occl);
        clr[k * 3] = cc.r;
        clr[k * 3 + 1] = cc.g;
        clr[k * 3 + 2] = cc.b;
        uv[k * 2] = x / 3;
        uv[k * 2 + 1] = z / 3;
      }
    }
    const index = [];
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        const a = j * cols + i;
        index.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(clr, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, groundMat);
    m.receiveShadow = true;
    return m;
  }

  const xsHi = axis(half, track.res, NEAR, 1.15);
  const xsLo = axis(half, 4, NEAR, 1.25);
  const xsFar = farAxis(900, 8, 1.2);
  const rowsOf = (z0, z1, step) => {
    const out = [];
    for (let z = z0; z < z1 - 1e-6; z += step) out.push(z);
    out.push(z1);
    return out;
  };

  // ---------- Grobe Fassung der ganzen Strecke + Ränder (immer da) ----------
  const nChunks = Math.ceil(L / CHUNK);
  const chunks = [];
  for (let k = 0; k < nChunks; k++) {
    const z0 = k * CHUNK;
    const z1 = Math.min(L, z0 + CHUNK);
    const lo = groundMesh(xsLo, rowsOf(z0, z1, 4));
    lo.position.y = -0.25; // knapp unter dem Detailgelände, falls beide kurz sichtbar sind
    group.add(lo);
    // ferne Flanken links und rechts (immer sichtbar, ragen leicht unter das Nahgelände)
    for (const side of [-1, 1]) {
      const far = groundMesh(side < 0 ? xsFar.map((x) => -x).reverse() : xsFar, rowsOf(z0, z1, 10));
      far.position.y = -0.4;
      group.add(far);
    }
    chunks.push({ k, z0, z1, lo, hi: null, crowd: null });
  }
  // Gipfel (hinter dem Start fällt der Berg ab) und weites Tal hinter dem Ziel
  const pre = [];
  for (let d = 2, z = 0; z > -500; d *= 1.18) (z -= d), pre.push(z);
  const xsAll = [...xsFar.map((x) => -x).reverse(), ...xsLo.filter((x) => Math.abs(x) < NEAR - 6), ...xsFar];
  group.add(groundMesh(xsAll, [...pre.reverse(), 0]));
  const post = [L];
  for (let d = 2, z = L; z < L + 900; d *= 1.15) (z += d), post.push(z);
  group.add(groundMesh(xsAll, post));

  // Himalaya ringsum
  buildMountains(group, track);

  // ---------- Gemeinsame Modelle ----------
  const r0 = rng(seed ^ 0x77e);
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const rp = rockGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const s = 0.8 + noise2(rp.getX(i) * 2.3 + 5, rp.getY(i) * 2.3 + rp.getZ(i) * 1.9, 5) * 0.35;
      rp.setXYZ(i, rp.getX(i) * s, rp.getY(i) * s * 0.8, rp.getZ(i) * s);
    }
    rockGeo.computeVertexNormals();
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: '#6f6c66', roughness: 0.95, flatShading: true });
  const snowRockMat = new THREE.MeshStandardMaterial({ color: '#8d8f96', roughness: 0.9, flatShading: true });
  const iceGeo = new THREE.BoxGeometry(2, 2, 2, 2, 3, 2);
  {
    const p = iceGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + Math.random() * 0.3), p.getY(i) * (0.9 + Math.random() * 0.2), p.getZ(i) * (0.85 + Math.random() * 0.3));
    iceGeo.computeVertexNormals();
  }
  const iceMat = new THREE.MeshStandardMaterial({ color: '#cdeaf8', roughness: 0.25, metalness: 0.05, flatShading: true, emissive: '#16405c', emissiveIntensity: 0.12 });
  const tentGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const tentColors = ['#f2b51a', '#ff7a1a', '#d6332a', '#f2b51a', '#1f62c8', '#2fa36b'].map(col);
  const flagColors = ['#2a6fd6', '#f4f4f4', '#d8302a', '#2f9a4a', '#f2c230'].map(col); // Gebetsfahnen: Himmel, Luft, Feuer, Wasser, Erde
  const flagGeo = new THREE.PlaneGeometry(0.34, 0.42);
  flagGeo.translate(0, -0.21, 0);
  const flagMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const poleMat = new THREE.MeshLambertMaterial({ color: '#cfc5b0' });
  const crown = crownGeometry();
  const conifer = coniferGeometry();
  const leafMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 2.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#5a4332' });
  const tuft = tuftAssets();

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  // Gebetsfahnen an einer Leine (durchhängend)
  function prayerFlags(g, p0, p1, sag) {
    const n = Math.max(4, Math.round(p0.distanceTo(p1) / 0.55));
    const inst = new THREE.InstancedMesh(flagGeo, flagMat, n - 1);
    const yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z) - Math.PI / 2;
    const pts = [];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      v.copy(p0).lerp(p1, t);
      v.y -= sag * 4 * t * (1 - t);
      inst.setMatrixAt(i - 1, m4.compose(v, q.setFromEuler(eu.set((Math.random() - 0.5) * 0.3, yaw, (Math.random() - 0.5) * 0.2)), s.set(1, 1, 1)));
      inst.setColorAt(i - 1, flagColors[(i - 1) % 5]);
    }
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const p = p0.clone().lerp(p1, t);
      p.y -= sag * 4 * t * (1 - t);
      pts.push(p);
    }
    g.add(inst, new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#6b5a48' })));
  }
  function pole(g, x, z, h) {
    const y = groundAt(x, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 6), poleMat);
    m.position.set(x, y + h / 2, z);
    g.add(m);
    return new THREE.Vector3(x, y + h, z);
  }

  // Zelt (Kuppelzelt) an einer Stelle
  function tent(g, x, z, size, colr) {
    const y = groundAt(x, z);
    const m = new THREE.Mesh(tentGeo, new THREE.MeshLambertMaterial({ color: colr }));
    m.scale.set(size * 1.2, size * 0.9, size);
    m.position.set(x, y - 0.05, z);
    m.rotation.y = Math.random() * 6.28;
    m.castShadow = true;
    g.add(m);
  }

  // Leiter über eine Gletscherspalte
  function ladder(g, l) {
    const lg = new THREE.Group();
    const alu = new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.7, roughness: 0.35 });
    const len = l.hz * 2;
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, len), alu);
      rail.position.set(sx * (l.hx - 0.05), 0, 0);
      lg.add(rail);
    }
    for (let zz = -len / 2 + 0.2; zz < len / 2; zz += 0.33) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, l.hx * 2, 6), alu);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, 0.02, zz);
      lg.add(rung);
    }
    // Fixseile als Geländer
    for (const sx of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(new THREE.Vector3(sx * (l.hx + 0.25), 0.9 - 0.25 * 4 * t * (1 - t), -len / 2 + t * len));
      }
      lg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#e0442a' })));
    }
    // Oberseite = Mitte + Normale · hy; geneigt wie in der Physik
    lg.position.set(l.x, l.y + l.cos * l.hy, l.z + l.sin * l.hy);
    lg.rotation.x = Math.atan2(l.sin, l.cos);
    lg.traverse((o) => (o.castShadow = true));
    g.add(lg);
  }

  // Schild „Everest Base Camp“ auf einem Felsblock
  function basecampSign(g, z) {
    const x = track.centerAt(z) + track.inner + 3.5;
    const y = groundAt(x, z);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.scale.set(2.2, 1.6, 1.4);
    rock.position.set(x, y + 0.9, z);
    rock.castShadow = true;
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#e8402a';
    ctx.font = '800 64px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EVEREST', 256, 80);
    ctx.fillText('BASE CAMP', 256, 150);
    ctx.font = '700 48px "Barlow Condensed", sans-serif';
    ctx.fillText('5364 m', 256, 215);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    sign.position.set(x - 1.45, y + 1.3, z);
    sign.rotation.y = -Math.PI / 2 + 0.5;
    g.add(rock, sign);
  }

  // Stupa (weiße Kuppel, goldene Spitze) im Tal
  function stupa(g, x, z) {
    const y = groundAt(x, z);
    const white = new THREE.MeshLambertMaterial({ color: '#f2f0ea' });
    const gold = new THREE.MeshStandardMaterial({ color: '#d4a63a', metalness: 0.6, roughness: 0.35 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 6), white);
    base.position.set(x, y + 0.6, z);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), white);
    dome.position.set(x, y + 1.4, z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), gold);
    box.position.set(x, y + 4.5, z);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 12), gold);
    spire.position.set(x, y + 6.8, z);
    for (const o of [base, dome, box, spire]) {
      o.castShadow = true;
      g.add(o);
    }
    // Gebetsfahnen von der Spitze nach unten
    const top = new THREE.Vector3(x, y + 8.3, z);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const end = pole(g, x + Math.cos(a) * 12, z + Math.sin(a) * 12, 2.5);
      prayerFlags(g, top, end, 1.2);
    }
  }

  // Sherpa-Haus: Steinmauern, bunte Blechdächer
  const roofColors = ['#2f6fd6', '#2f9a4a', '#c43c2a', '#2f6fd6', '#8a3d8a'].map(col);
  function house(g, x, z, yaw) {
    const y = groundAt(x, z);
    const w = 7 + Math.random() * 3;
    const d = 5 + Math.random() * 2;
    const h = 4 + Math.random() * 1.5;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: Math.random() < 0.5 ? '#ece6d8' : '#cfc3a8' }));
    wall.position.set(x, y + h / 2 - 0.4, z);
    wall.rotation.y = yaw;
    const roof = new THREE.Mesh(prismGeometry(d + 0.8, 1.6, w + 0.6), new THREE.MeshLambertMaterial({ color: roofColors[Math.floor(Math.random() * roofColors.length)], flatShading: true }));
    roof.geometry.rotateY(Math.PI / 2);
    roof.position.set(x, y + h - 0.4, z);
    roof.rotation.y = yaw;
    wall.castShadow = roof.castShadow = true;
    g.add(wall, roof);
  }

  // Yak: kompakter Körper, Hörner, zottelig dunkel
  const yakMat = new THREE.MeshLambertMaterial({ color: '#2c2420', flatShading: true });
  const hornMat = new THREE.MeshLambertMaterial({ color: '#e8e0cc' });
  function yak(g, x, z, yaw) {
    const y = groundAt(x, z);
    const yk = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 3, 8), yakMat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.55), yakMat);
    head.position.set(1.05, 1.1, 0);
    yk.add(body, head);
    for (const sz of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 6), hornMat);
      horn.position.set(1.1, 1.45, sz * 0.25);
      horn.rotation.x = sz * 0.6;
      yk.add(horn);
      for (const sx of [-0.55, 0.55]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 5), yakMat);
        leg.position.set(sx, 0.35, sz * 0.28);
        yk.add(leg);
      }
    }
    yk.position.set(x, y, z);
    yk.rotation.y = yaw;
    yk.traverse((o) => (o.castShadow = true));
    g.add(yk);
  }

  // Steinmännchen
  function cairn(g, x, z) {
    const y = groundAt(x, z);
    let h = y;
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
      const sc = 0.35 - i * 0.04 + Math.random() * 0.05;
      const st = new THREE.Mesh(rockGeo, rockMat);
      st.scale.set(sc * 1.3, sc * 0.7, sc * 1.2);
      st.position.set(x + (Math.random() - 0.5) * 0.1, h + sc * 0.6, z + (Math.random() - 0.5) * 0.1);
      h += sc * 1.1;
      st.castShadow = true;
      g.add(st);
    }
  }

  // ---------- Detailabschnitt ----------
  function buildHi(ch) {
    const g = new THREE.Group();
    const r = rng((seed ^ (ch.k * 0x9e3779b1)) >>> 0);
    const rnd = () => r();
    const { z0, z1 } = ch;
    g.add(groundMesh(xsHi, rowsOf(z0, z1, track.res), { ao: true }));
    const zone = zoneOf((z0 + z1) / 2);
    const inChunk = (o) => o.z >= z0 && o.z < z1;
    const cz = (z) => track.centerAt(Math.max(0, Math.min(L, z)));

    // Hindernisse der Simulation
    for (const rk of track.rocks.filter(inChunk)) {
      const m = new THREE.Mesh(rockGeo, zone.surface === 1 ? snowRockMat : rockMat);
      m.position.set(rk.x, rk.y, rk.z);
      m.scale.setScalar(rk.radius * 1.05);
      m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    for (const sr of track.seracs.filter(inChunk)) {
      const m = new THREE.Mesh(iceGeo, iceMat);
      m.position.set(sr.x, sr.y, sr.z);
      m.scale.set(sr.hx, sr.hy, sr.hz);
      // gleiche Drehung wie in der Physik (yawQuat(yaw − 1.5) ≈ Drehung um 2·atan(yaw − 1.5))
      m.rotation.y = 2 * Math.atan(sr.yaw - 1.5);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    for (const l of track.ladders.filter(inChunk)) ladder(g, l);

    // Kulisse je Zone
    const people = [];
    const sideX = (z, side, d) => cz(z) + side * d;
    if (zone.id === 'summit' || zone.id === 'icefall') {
      // Markierungsstäbe mit Fähnchen entlang der Route
      for (let z = z0 + (ch.k % 2) * 15; z < z1; z += 30) {
        for (const side of [-1, 1]) {
          const x = sideX(z, side, track.inner + 1.5 + rnd());
          const top = pole(g, x, z, 1.6);
          const f = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color: '#e8402a', side: THREE.DoubleSide }));
          f.position.copy(top);
          f.rotation.y = Math.PI / 2;
          g.add(f);
        }
      }
      // Eistürme am Rand im Eisbruch
      if (zone.id === 'icefall') {
        for (let i = 0; i < 18; i++) {
          const z = z0 + rnd() * (z1 - z0);
          const side = rnd() < 0.5 ? -1 : 1;
          const x = sideX(z, side, track.outer + 2 + rnd() * 30);
          const m = new THREE.Mesh(iceGeo, iceMat);
          const sc = 1 + rnd() * 3;
          m.position.set(x, groundAt(x, z) + sc * 0.8, z);
          m.scale.set(sc * (0.6 + rnd() * 0.6), sc * (1 + rnd()), sc * (0.6 + rnd() * 0.6));
          m.rotation.set((rnd() - 0.5) * 0.4, rnd() * 3, (rnd() - 0.5) * 0.4);
          m.castShadow = true;
          g.add(m);
        }
      }
      // Gebetsfahnen quer über die Route, alle paar hundert Meter
      if (ch.k % 3 === 1) {
        const z = z0 + 50;
        const a = pole(g, sideX(z, -1, track.outer + 1), z, 5);
        const b = pole(g, sideX(z, 1, track.outer + 1), z, 5);
        prayerFlags(g, a, b, 3);
      }
    }
    if (zone.id === 'basecamp') {
      // Zeltstadt auf beiden Seiten
      // auf der Ebene neben dem Höhenfeld (|x| > Rand), in Grüppchen
      for (let i = 0; i < 60; i++) {
        const z = z0 + rnd() * (z1 - z0);
        const side = rnd() < 0.5 ? -1 : 1;
        const x = side * (half + 4 + rnd() * 55);
        tent(g, x, z, 1.1 + rnd() * 0.8, tentColors[Math.floor(rnd() * tentColors.length)]);
      }
      // große Gemeinschaftszelte
      for (let i = 0; i < 3; i++) {
        const z = z0 + 15 + rnd() * 70;
        const side = rnd() < 0.5 ? -1 : 1;
        const x = side * (half + 8 + rnd() * 30);
        const y = groundAt(x, z);
        const body = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 4), new THREE.MeshLambertMaterial({ map: stripes('#f2b51a', '#e8a312', 6) }));
        body.position.set(x, y + 1, z);
        body.castShadow = true;
        g.add(body);
      }
      // Gebetsfahnen von Mast zu Mast, kreuz und quer
      for (let i = 0; i < 4; i++) {
        const z = z0 + 10 + i * 22;
        const a = pole(g, sideX(z, -1, track.outer + 2 + rnd() * 6), z, 6);
        const b = pole(g, sideX(z + 12, 1, track.outer + 2 + rnd() * 6), z + 12, 6);
        prayerFlags(g, a, b, 3.5);
      }
      if (track.def.basecampZ >= z0 && track.def.basecampZ < z1) basecampSign(g, track.def.basecampZ);
      // Bergsteiger feuern an
      for (let z = z0; z < z1; z += 1.1) {
        for (const side of [-1, 1]) {
          if (rnd() > 0.55) continue;
          const x = sideX(z, side, track.inner + 2 + rnd() * 3);
          people.push(person(x, z, groundAt(x, z), Math.atan2(-side, 0.3 * (rnd() - 0.5)), OUTFITS.climbers, rnd));
        }
      }
    }
    if (zone.id === 'moraine') {
      for (let i = 0; i < 10; i++) {
        const z = z0 + rnd() * (z1 - z0);
        const side = rnd() < 0.5 ? -1 : 1;
        if (rnd() < 0.4) cairn(g, sideX(z, side, track.inner + 2 + rnd() * 4), z);
        const x = sideX(z, side, track.outer + 4 + rnd() * 40);
        const m = new THREE.Mesh(rockGeo, rockMat);
        const sc = 1.5 + rnd() * 4;
        m.position.set(x, groundAt(x, z) + sc * 0.3, z);
        m.scale.setScalar(sc);
        m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        m.castShadow = true;
        g.add(m);
      }
    }
    // Wiesen: Grasbüschel, Sträucher, Bäume
    if (zone.id === 'alpine' || zone.id === 'valley') {
      const count = Math.round((zone.id === 'valley' ? 1500 : 900) * quality);
      const tufts = new THREE.InstancedMesh(tuft.geo, tuft.mat, count);
      const cc = new THREE.Color();
      let n = 0;
      for (let k = 0; k < count * 3 && n < count; k++) {
        const z = z0 + rnd() * (z1 - z0);
        const side = rnd() < 0.5 ? -1 : 1;
        const d = track.inner + rnd() * 40;
        const x = sideX(z, side, d);
        if (rnd() > Math.max(0, noise2(x * 0.12, z * 0.12, seed + 31) * 1.6 - 0.3)) continue;
        const sc = 0.7 + rnd() * 0.8;
        tufts.setMatrixAt(n, m4.compose(v.set(x, groundAt(x, z) - 0.03, z), q.setFromEuler(eu.set(0, rnd() * 6.28, 0)), s.set(sc, sc * (0.7 + rnd() * 0.7), sc)));
        cc.setHSL(zone.id === 'alpine' ? 0.17 + rnd() * 0.05 : 0.24 + rnd() * 0.04, 0.4, 0.4 + rnd() * 0.12);
        tufts.setColorAt(n++, cc);
      }
      tufts.count = n;
      g.add(tufts);
      // Bäume (im Tal dicht, auf den Almen vereinzelt Rhododendron-Büsche)
      const trees = zone.id === 'valley' ? Math.round(70 * quality) : Math.round(26 * quality);
      const crowns = new THREE.InstancedMesh(zone.id === 'valley' && ch.k % 2 ? conifer : crown, leafMat, trees);
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees);
      const leaf = zone.id === 'valley' ? ['#3f6f2c', '#4a7f30', '#2f5a2e', '#58902f'] : ['#4f6b2e', '#7a3d5a', '#b8406a', '#5a7a34'];
      for (let i = 0; i < trees; i++) {
        const z = z0 + rnd() * (z1 - z0);
        const side = rnd() < 0.5 ? -1 : 1;
        const x = sideX(z, side, track.outer + 3 + rnd() * rnd() * 120);
        const y = groundAt(x, z);
        const sc = zone.id === 'valley' ? 0.8 + rnd() * 0.9 : 0.35 + rnd() * 0.3;
        trunks.setMatrixAt(i, m4.compose(v.set(x, y + 1.1 * sc, z), q.identity(), s.set(sc, sc, sc)));
        crowns.setMatrixAt(i, m4.compose(v.set(x, y + (zone.id === 'valley' ? 3.1 : 1.2) * sc, z), q.setFromEuler(eu.set(0, rnd() * 6, 0)), s.set(sc, sc, sc)));
        crowns.setColorAt(i, col(leaf[Math.floor(rnd() * leaf.length)]));
      }
      crowns.castShadow = true;
      g.add(crowns, trunks);
      if (zone.id === 'alpine') {
        for (let i = 0; i < 3; i++) {
          const z = z0 + rnd() * (z1 - z0);
          const side = rnd() < 0.5 ? -1 : 1;
          yak(g, sideX(z, side, track.outer + 2 + rnd() * 20), z, rnd() * 6.28);
        }
      }
    }
    // Ziel: Dorf, Stupa, Publikum
    if (track.finishZ >= z0 - 60 && track.finishZ < z1 + 60 && zone.id === 'valley') {
      if (track.finishZ >= z0 && track.finishZ < z1) {
        for (let i = 0; i < 9; i++) {
          const z = track.finishZ - 60 + i * 14 + rnd() * 6;
          const side = i % 2 ? 1 : -1;
          house(g, sideX(z, side, track.outer + 14 + rnd() * 18), z, rnd() * 0.4 - 0.2);
        }
        stupa(g, sideX(track.finishZ - 30, 1, track.outer + 10), track.finishZ - 30);
      }
      for (let z = Math.max(z0, track.finishZ - 60); z < Math.min(z1, track.finishZ + 20); z += 0.9) {
        for (const side of [-1, 1]) {
          if (rnd() > 0.75) continue;
          for (let row = 0; row < 2; row++) {
            const x = sideX(z, side, track.inner + 2 + row * 0.9 + rnd() * 0.4);
            people.push(person(x, z, groundAt(x, z), Math.atan2(-side, 0.3 * (rnd() - 0.5)), rnd() < 0.5 ? OUTFITS.climbers : OUTFITS.village, rnd));
          }
        }
      }
    }
    // Start am Gipfel: Steinmann mit Gebetsfahnen, ein paar Bergsteiger
    if (z0 === 0) {
      const top = new THREE.Vector3(track.start.x - 6, groundAt(track.start.x - 6, -3) + 3, -3);
      cairn(g, top.x, -3);
      for (let i = 0; i < 7; i++) {
        const a = -0.6 + (i / 6) * 4.4;
        const end = pole(g, top.x + Math.cos(a) * 14, -3 + Math.sin(a) * 14, 1.2);
        prayerFlags(g, top, end, 1.4);
      }
      for (let i = 0; i < 14; i++) {
        const side = i % 2 ? 1 : -1;
        const z = 3 + rnd() * 26;
        const x = sideX(z, side, track.inner + 2 + rnd() * 3);
        people.push(person(x, z, groundAt(x, z), Math.atan2(-side, 0.2), OUTFITS.climbers, rnd));
      }
    }
    if (track.start.z + 18 >= z0 && track.start.z + 18 < z1) g.add(banner(track, track.start.z + 18, 'START', '#1d3b6b', groundAt));
    if (track.finishZ >= z0 && track.finishZ < z1) {
      g.add(banner(track, track.finishZ, 'ZIEL', null, groundAt));
      const lineGeo = new THREE.PlaneGeometry(track.outer * 2, 0.6, 32, 1);
      lineGeo.rotateX(-Math.PI / 2);
      const lp = lineGeo.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        const x = lp.getX(i) + track.centerAt(track.finishZ);
        lp.setXYZ(i, x, groundAt(x, track.finishZ + lp.getZ(i)) + 0.04, track.finishZ + lp.getZ(i));
      }
      g.add(new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ map: checkerTexture(), polygonOffset: true, polygonOffsetFactor: -2 })));
    }
    for (const b of track.catchBales.filter(inChunk)) {
      const m = createBale(b);
      m.position.set(b.x, b.y, b.z);
      g.add(m);
    }
    ch.crowd = crowdMeshes(g, people);
    group.add(g);
    ch.hi = g;
  }

  function disposeHi(ch) {
    if (!ch.hi) return;
    group.remove(ch.hi);
    const shared = new Set([rockGeo, iceGeo, tentGeo, flagGeo, crown, conifer, trunkGeo, tuft.geo]);
    const sharedMat = new Set([groundMat, rockMat, snowRockMat, iceMat, flagMat, poleMat, leafMat, trunkMat, tuft.mat, yakMat, hornMat]);
    ch.hi.traverse((o) => {
      if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
      for (const m of [].concat(o.material ?? [])) if (!sharedMat.has(m)) (m.map?.dispose(), m.dispose());
    });
    ch.hi = null;
    ch.crowd = null;
  }

  // Detailabschnitte nahe der Spieler sicherstellen (höchstens zwei neue pro Bild, nächste zuerst)
  const wanted = (ch, zs) => zs.some((z) => ch.z1 > z - HI_BEHIND && ch.z0 < z + HI_AHEAD);
  function ensure(zs, budget) {
    const missing = chunks.filter((ch) => !ch.hi && wanted(ch, zs)).sort((a, b) => Math.min(...zs.map((z) => Math.abs(a.z0 - z))) - Math.min(...zs.map((z) => Math.abs(b.z0 - z))));
    for (const ch of missing.slice(0, budget)) buildHi(ch);
    for (const ch of chunks) if (ch.hi && !zs.some((z) => ch.z1 > z - HI_BEHIND - 150 && ch.z0 < z + HI_AHEAD + 150)) disposeHi(ch);
  }
  ensure([track.start.z], 99);

  return {
    group,
    groundAt,
    // Farbe aufgewirbelter Teilchen je Untergrund
    dustColor: (sfc) => ['#6f8a3c', '#f4f8ff', '#d8f0ff', '#8a8073'][sfc] ?? null,
    update(time, foci) {
      const zs = foci.map((f) => f.p.z);
      ensure(zs, 2);
      for (const ch of chunks) ch.crowd?.update(time, foci);
      tuft.time.value = time;
    },
    // vor jeder Ansicht: Detail oder Grobfassung je nach Abstand zur Kamera
    prepareView(camPos) {
      for (const ch of chunks) {
        const near = ch.z1 > camPos.z - HI_BEHIND && ch.z0 < camPos.z + HI_AHEAD;
        const hi = !!ch.hi && near;
        if (ch.hi) ch.hi.visible = hi;
        ch.lo.visible = !hi;
      }
    },
    dispose() {
      for (const ch of chunks) disposeHi(ch);
      scene.remove(group);
      group.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material ?? [])) (m.map?.dispose(), m.dispose());
      });
    },
  };
}

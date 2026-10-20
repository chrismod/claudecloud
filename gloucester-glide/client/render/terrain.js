// Gelände (Strecke + Hügellandschaft mit Feldern und Hecken), Felsen, Zäune, Banner, Ziellinie.
// Bäume, Dorf, Zelte, Wimpel, Gras und Zuschauer kommen aus props.js, grass.js und crowd.js.
import * as THREE from 'three';
import { fbm2, noise2 } from '../../shared/noise.js';
import { rng } from '../../shared/rng.js';
import { buildProps } from './props.js';
import { buildGrass } from './grass.js';
import { buildCrowd } from './crowd.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Spaltenpositionen: fein auf der Strecke, nach außen immer gröber
function axis(inner, step, extent, grow) {
  const out = [];
  for (let v = -inner; v <= inner + 1e-6; v += step) out.push(v);
  let d = step;
  let v = inner;
  const tail = [];
  while (v < extent) {
    d *= grow;
    v += d;
    tail.push(v);
  }
  return [...tail.map((t) => -t).reverse(), ...out, ...tail];
}

export function buildWorld(scene, track, { quality = 1 } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const half = track.width / 2;
  const seed = track.def.seed >>> 0;
  const { nz, res, heights } = track;
  const L = track.length;
  const H = (c, r) => heights[c * (nz + 1) + r];

  // Höhe überall (außerhalb der Strecke frei erfunden, nur Optik)
  const edge = (side, z) => track.heightAt(side * half, z);
  const outerHeight = (x, z) => {
    const zc = Math.min(L, Math.max(0, z));
    const side = x < 0 ? -1 : 1;
    const out = Math.abs(x) - half;
    let h = out > 0 ? edge(side, zc) : track.heightAt(x, zc);
    if (out > 0) {
      // Böschung läuft aus, dann sanfte Hügel
      h += out * 0.9 * (1 - smooth(out / 26)) + smooth(out / 26) * 12 + out * 0.08;
      h += fbm2(x * 0.02, z * 0.02, seed + 99, 3) * 7 * smooth(out / 30);
    }
    if (z < 0) h += -z * 0.35 + fbm2(x * 0.03, z * 0.03, seed + 7, 2) * 3 * smooth(-z / 20);
    if (z > L) {
      // Hinter dem Auslauf öffnet sich ein breites Tal (dort liegt das Dorf)
      const ax = Math.abs(x);
      const valley = track.heightAt(0, L) - 0.4 + fbm2(x * 0.02, z * 0.02, seed + 8, 2) * 3 + (ax > 70 ? (ax - 70) * 0.3 : 0);
      h += (valley - h) * smooth((z - L - 5) / 70);
    }
    return h;
  };
  const groundAt = (x, z) => (Math.abs(x) <= half && z >= 0 && z <= L ? track.heightAt(x, z) : outerHeight(x, z));

  const xs = axis(half, res, 300, 1.11);
  const zsTrack = [];
  for (let r = 0; r <= nz; r++) zsTrack.push(r * res);
  const before = [];
  for (let d = res, z = 0; z > -200; d *= 1.11) (z -= d), before.push(z);
  const after = [];
  for (let d = res, z = L; z < L + 320; d *= 1.11) (z += d), after.push(z);
  const zs = [...before.reverse(), ...zsTrack, ...after];
  const c0 = xs.indexOf(-half);
  const r0 = before.length;

  const cols = xs.length;
  const rows = zs.length;
  const N = cols * rows;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const uv = new Float32Array(N * 2);
  const farm = new Float32Array(N);
  for (let j = 0; j < rows; j++) {
    const z = zs[j];
    const inZ = j >= r0 && j <= r0 + nz;
    for (let i = 0; i < cols; i++) {
      const x = xs[i];
      const inX = i >= c0 && i <= c0 + track.nx;
      const k = j * cols + i;
      pos[k * 3] = x;
      pos[k * 3 + 1] = inX && inZ ? H(i - c0, j - r0) : outerHeight(x, z);
      pos[k * 3 + 2] = z;
      uv[k * 2] = x / 3;
      uv[k * 2 + 1] = z / 3;
      // Felder erst weiter draußen
      const zc = Math.min(L, Math.max(0, z));
      const away = Math.max(Math.abs(x - track.centerAt(zc)) - track.outer - 30, z < -40 ? -z - 40 : 0, z > L + 30 ? z - L - 30 : 0);
      farm[k] = smooth(away / 25);
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
  geo.setIndex(index);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal.array;

  // Farben: Rasenstreifen, ausgefahrene Spur, sattere Böschungen, Senken dunkler (Umgebungsverdeckung)
  const c = new THREE.Color();
  const grassA = new THREE.Color('#3f7424');
  const grassB = new THREE.Color('#5a8c2c');
  const mown = new THREE.Color('#7aa944');
  const mownDark = new THREE.Color('#41722a');
  const mud = new THREE.Color('#5b4430');
  const bank = new THREE.Color('#355f20');
  const meadow = new THREE.Color('#4f7e2d');
  const dry = new THREE.Color('#a29a52');
  const yAt = (i, j) => pos[(Math.min(rows - 1, Math.max(0, j)) * cols + Math.min(cols - 1, Math.max(0, i))) * 3 + 1];
  for (let j = 0; j < rows; j++) {
    const z = zs[j];
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const x = xs[i];
      const zc = Math.min(L, Math.max(0, z));
      const dx = Math.abs(x - track.centerAt(zc));
      const n = noise2(x * 0.15, z * 0.15, seed + 3);
      c.copy(grassA).lerp(grassB, n);
      // Böschung: je steiler zur Seite, desto satter
      const sideSlope = Math.abs(nrm[k * 3]);
      c.lerp(bank, smooth((sideSlope - 0.25) * 2.5) * 0.6);
      if (dx < track.inner + 2 && z > -2 && z < L) {
        const fade = smooth((track.inner + 2 - dx) / 2);
        c.lerp(Math.floor(z / 6) % 2 === 0 ? mown : mownDark, 0.55 * fade);
        const wear = smooth(1 - dx / 5) * smooth((noise2(x * 0.3, z * 0.08, seed + 4) - 0.35) * 2.5) * smooth(z / 20);
        c.lerp(mud, wear * 0.7);
      } else if (dx > track.outer + 1 || Math.abs(x) > half) {
        c.copy(meadow).lerp(dry, smooth((noise2(x * 0.04, z * 0.04, seed + 5) - 0.45) * 3) * 0.55);
      }
      // Umgebungsverdeckung: liegt der Punkt tiefer als seine Nachbarn, wird er dunkler
      const y = pos[k * 3 + 1];
      const avg = (yAt(i - 4, j) + yAt(i + 4, j) + yAt(i, j - 4) + yAt(i, j + 4)) / 4;
      const ao = Math.min(1.06, Math.max(0.72, 1 - (avg - y) * 0.09));
      c.multiplyScalar(ao * (0.92 + noise2(x * 1.3, z * 1.3, seed + 6) * 0.16));
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('farm', new THREE.BufferAttribute(farm, 1));
  const ground = new THREE.Mesh(geo, groundMaterial());
  ground.receiveShadow = true;
  group.add(ground);

  const r = rng(seed ^ 0xa11ce);

  // Felsen
  const rockGeo = new THREE.IcosahedronGeometry(1, 2);
  const rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const s = 0.82 + noise2(rp.getX(i) * 2.2 + 5, rp.getY(i) * 2.2 + rp.getZ(i) * 1.7, 5) * 0.32;
    rp.setXYZ(i, rp.getX(i) * s, rp.getY(i) * s * 0.85, rp.getZ(i) * s);
  }
  rockGeo.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8f8b7e', roughness: 0.92, flatShading: true });
  const moss = new THREE.MeshStandardMaterial({ color: '#5d7334', roughness: 1, flatShading: true });
  for (const rk of track.rocks) {
    const m = new THREE.Mesh(rockGeo, r() < 0.4 ? moss : rockMat);
    m.position.set(rk.x, rk.y, rk.z);
    m.scale.setScalar(rk.radius * 1.05);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  // Zäune entlang der Böschungskante
  const fenceX = (side, z) => Math.max(-half + 0.5, Math.min(half - 0.5, track.centerAt(z) + side * (track.outer + 1)));
  const fenceZ = [];
  for (let z = 2; z < track.finishZ + 30 && z < L; z += 2.5) fenceZ.push(z);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), new THREE.MeshLambertMaterial({ color: '#76563a' }), fenceZ.length * 2);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.1, 2.5), new THREE.MeshLambertMaterial({ color: '#e6dcc6' }), fenceZ.length * 4);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let pi = 0;
  let ri = 0;
  for (const side of [-1, 1]) {
    for (const z of fenceZ) {
      const x = fenceX(side, z);
      const y = groundAt(x, z);
      posts.setMatrixAt(pi++, m4.compose(v.set(x, y + 0.5, z), q.identity(), one));
      const z2 = z + 2.5;
      const x2 = fenceX(side, z2);
      const y2 = groundAt(x2, z2);
      const dz = z2 - z;
      const dxr = x2 - x;
      const dy = y2 - y;
      e.set(-Math.atan2(dy, Math.hypot(dz, dxr)), Math.atan2(dxr, dz), 0, 'YXZ');
      q.setFromEuler(e);
      const s = new THREE.Vector3(1, 1, Math.hypot(dz, dxr, dy) / 2.5);
      for (const hgt of [0.45, 0.88]) rails.setMatrixAt(ri++, m4.compose(v.set((x + x2) / 2, (y + y2) / 2 + hgt, (z + z2) / 2), q, s));
    }
  }
  posts.castShadow = rails.castShadow = true;
  group.add(posts, rails);

  // Start- und Zielbanner
  const startZ = track.start.z + 18;
  group.add(banner(track, startZ, 'START', '#1d3b6b', groundAt));
  group.add(banner(track, track.finishZ, 'ZIEL', null, groundAt));
  // Ziellinie auf dem Boden
  const lineGeo = new THREE.PlaneGeometry(track.outer * 2, 0.6, 32, 1);
  lineGeo.rotateX(-Math.PI / 2);
  const lp = lineGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i) + track.centerAt(track.finishZ);
    lp.setXYZ(i, x, groundAt(x, track.finishZ + lp.getZ(i)) + 0.04, track.finishZ + lp.getZ(i));
  }
  group.add(new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ map: checkerTexture(), polygonOffset: true, polygonOffsetFactor: -2 })));

  // Fähnchen an den Kontrollpunkten
  const flagGeo = new THREE.ConeGeometry(0.35, 0.9, 3);
  flagGeo.rotateZ(-Math.PI / 2);
  const poleMat = new THREE.MeshLambertMaterial({ color: '#eeeeee' });
  const flagMat = new THREE.MeshLambertMaterial({ color: '#e07a1f' });
  for (const cp of track.checkpoints.slice(1)) {
    for (const side of [-1, 1]) {
      const x = cp.x + side * (track.inner + 0.5);
      const y = groundAt(x, cp.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2), poleMat);
      pole.position.set(x, y + 1.1, cp.z);
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(x + 0.45, y + 1.9, cp.z);
      group.add(pole, flag);
    }
  }

  const props = buildProps(group, track, { groundAt, fenceX, rng: r, startZ, quality });
  const grass = buildGrass(group, track, { groundAt, rng: r, quality });
  const crowd = buildCrowd(group, track, { groundAt, fenceX, rng: r });

  return {
    group,
    groundAt,
    update(time, cheesePos, speed) {
      crowd.update(time, cheesePos, speed);
      grass.update(time);
      props.update(time);
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) [].concat(o.material).forEach((m) => (m.map?.dispose(), m.dispose()));
      });
    },
  };
}

// Boden: Vertexfarben × Grasstruktur; weiter draußen ein Flickenteppich aus Feldern mit Hecken
function groundMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTexture() });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float farm;\nvarying float vFarm;\nvarying vec2 vWorldXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFarm = farm;\nvWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vFarm;
        varying vec2 vWorldXZ;
        float fhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vFarm > 0.001) {
          vec2 p = mat2(0.94, 0.34, -0.34, 0.94) * vWorldXZ;
          vec2 size = vec2(46.0, 62.0);
          vec2 cell = floor(p / size);
          vec2 f = fract(p / size);
          float h = fhash(cell);
          vec3 field = h < 0.3 ? vec3(0.25, 0.42, 0.13) : h < 0.55 ? vec3(0.33, 0.5, 0.17) : h < 0.72 ? vec3(0.72, 0.62, 0.3) : h < 0.86 ? vec3(0.45, 0.55, 0.2) : vec3(0.55, 0.47, 0.25);
          // Saatreihen auf den Äckern
          if (h > 0.55 && h < 0.72) field *= 0.9 + 0.1 * sin(p.x * 2.2);
          float edge = min(min(f.x, 1.0 - f.x) * size.x, min(f.y, 1.0 - f.y) * size.y);
          field = mix(vec3(0.12, 0.22, 0.07), field, smoothstep(0.8, 2.2, edge));
          field = pow(field, vec3(2.2));
          diffuseColor.rgb = mix(diffuseColor.rgb, field * (0.9 + 0.2 * fhash(floor(p * 0.5))), vFarm);
        }`,
      );
  };
  return mat;
}

// Feine Grasstruktur, wird mit den Vertexfarben multipliziert
function grassTexture() {
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 9000; i++) {
    const v = 150 + Math.floor(Math.random() * 105);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1 + Math.random();
    const x = Math.random() * n;
    const y = Math.random() * n;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 5);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function checkerTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 16;
  const g = cv.getContext('2d');
  for (let i = 0; i < 32; i++)
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
      g.fillRect(i * 8, j * 8, 8, 8);
    }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function banner(track, z, text, color, groundAt) {
  const g = new THREE.Group();
  const cx = track.centerAt(z);
  const w = track.inner * 2 + 3;
  const y = Math.max(groundAt(cx - w / 2, z), groundAt(cx + w / 2, z));
  const poleMat = new THREE.MeshLambertMaterial({ color: '#f2efe8' });
  for (const s of [-1, 1]) {
    const px = cx + (s * w) / 2;
    const gy = groundAt(px, z);
    const h = y - gy + 6;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, h, 8), poleMat);
    pole.position.set(px, gy + h / 2, z);
    pole.castShadow = true;
    g.add(pole);
  }
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  if (color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1024, 128);
  } else {
    for (let i = 0; i < 64; i++)
      for (let j = 0; j < 8; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
        ctx.fillRect(i * 16, j * 16, 16, 16);
      }
    ctx.fillStyle = '#e07a1f';
    ctx.fillRect(312, 14, 400, 100);
  }
  ctx.fillStyle = '#fff';
  ctx.font = '800 92px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  cloth.position.set(cx, y + 5.6, z);
  cloth.rotation.y = Math.PI; // Schrift zeigt bergauf, zur Kamera
  g.add(cloth);
  g.userData = { left: new THREE.Vector3(cx - w / 2, y + 5.9, z), right: new THREE.Vector3(cx + w / 2, y + 5.9, z) };
  return g;
}

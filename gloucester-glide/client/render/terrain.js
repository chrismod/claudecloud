// Gelände-Mesh (Strecke + umliegende Hügel), Felsen, Zäune, Bäume, Zuschauer, Banner.
import * as THREE from 'three';
import { fbm2, noise2 } from '../../shared/noise.js';
import { rng } from '../../shared/rng.js';

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

export function buildWorld(scene, track) {
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
    if (z > L) h += (z - L) * 0.01 + fbm2(x * 0.02, z * 0.02, seed + 8, 2) * 4 * smooth((z - L) / 40);
    return h;
  };

  const xs = axis(half, res, 260, 1.12);
  const zsTrack = [];
  for (let r = 0; r <= nz; r++) zsTrack.push(r * res);
  const before = [];
  for (let d = res, z = 0; z > -160; d *= 1.12) (z -= d), before.push(z);
  const after = [];
  for (let d = res, z = L; z < L + 260; d *= 1.12) (z += d), after.push(z);
  const zs = [...before.reverse(), ...zsTrack, ...after];
  const c0 = xs.indexOf(-half);
  const r0 = before.length;

  const cols = xs.length;
  const rows = zs.length;
  const pos = new Float32Array(cols * rows * 3);
  const col = new Float32Array(cols * rows * 3);
  const c = new THREE.Color();
  const grassA = new THREE.Color('#3f7424');
  const grassB = new THREE.Color('#5a8c2c');
  const mown = new THREE.Color('#79a843');
  const mownDark = new THREE.Color('#3d6e22');
  const mud = new THREE.Color('#5e4630');
  const meadow = new THREE.Color('#4b7a2b');
  const dry = new THREE.Color('#9a9a4c');
  const uv = new Float32Array(cols * rows * 2);

  for (let j = 0; j < rows; j++) {
    const z = zs[j];
    const inZ = j >= r0 && j <= r0 + nz;
    for (let i = 0; i < cols; i++) {
      const x = xs[i];
      const inX = i >= c0 && i <= c0 + track.nx;
      const y = inX && inZ ? H(i - c0, j - r0) : outerHeight(x, z);
      const k = (j * cols + i) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;
      uv[(j * cols + i) * 2] = x / 3;
      uv[(j * cols + i) * 2 + 1] = z / 3;

      // Farbe
      const zc = Math.min(L, Math.max(0, z));
      const dx = Math.abs(x - track.centerAt(zc));
      const n = noise2(x * 0.15, z * 0.15, seed + 3);
      c.copy(grassA).lerp(grassB, n);
      if (dx < track.inner + 2 && z > -2 && z < L) {
        // Gemähte Streifen auf der Bahn
        const fade = smooth((track.inner + 2 - dx) / 2);
        c.lerp(Math.floor(z / 6) % 2 === 0 ? mown : mownDark, 0.55 * fade);
        // Ausgefahrene Spur in der Mitte
        const wear = smooth(1 - dx / 5) * smooth((noise2(x * 0.3, z * 0.08, seed + 4) - 0.35) * 2.5) * smooth(z / 20);
        c.lerp(mud, wear * 0.65);
      } else if (dx > track.outer + 1 || Math.abs(x) > half) {
        c.copy(meadow).lerp(dry, smooth((noise2(x * 0.04, z * 0.04, seed + 5) - 0.45) * 3) * 0.6);
      }
      c.multiplyScalar(0.92 + noise2(x * 1.3, z * 1.3, seed + 6) * 0.16);
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
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
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTexture() }));
  ground.receiveShadow = true;
  group.add(ground);

  const groundAt = (x, z) => (Math.abs(x) <= half && z >= 0 && z <= L ? track.heightAt(x, z) : outerHeight(x, z));
  const r = rng(seed ^ 0xa11ce);

  // Felsen
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const s = 0.85 + noise2(rp.getX(i) * 3, rp.getY(i) * 3 + rp.getZ(i) * 2, 5) * 0.3;
    rp.setXYZ(i, rp.getX(i) * s, rp.getY(i) * s, rp.getZ(i) * s);
  }
  rockGeo.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8a877c', roughness: 0.95, flatShading: true });
  for (const rk of track.rocks) {
    const m = new THREE.Mesh(rockGeo, rockMat);
    m.position.set(rk.x, rk.y, rk.z);
    m.scale.setScalar(rk.radius * 1.05);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  // Zäune entlang der Böschungskante
  const fenceZ = [];
  for (let z = 2; z < track.finishZ + 30 && z < L; z += 2.5) fenceZ.push(z);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), new THREE.MeshLambertMaterial({ color: '#7a5a3a' }), fenceZ.length * 2);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.08, 2.5), new THREE.MeshLambertMaterial({ color: '#d9cdb5' }), fenceZ.length * 4);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let pi = 0;
  let ri = 0;
  const fenceX = (side, z) => Math.max(-half + 0.5, Math.min(half - 0.5, track.centerAt(z) + side * (track.outer + 1)));
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
      for (const hgt of [0.45, 0.85]) rails.setMatrixAt(ri++, m4.compose(v.set((x + x2) / 2, (y + y2) / 2 + hgt, (z + z2) / 2), q, s));
    }
  }
  posts.castShadow = rails.castShadow = true;
  group.add(posts, rails);

  // Bäume auf den Hügeln
  const treeCount = 900;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 2, 6), new THREE.MeshLambertMaterial({ color: '#5a4030' }), treeCount);
  const crownGeo = new THREE.IcosahedronGeometry(1.8, 0);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), treeCount);
  const leaf = [new THREE.Color('#4a7f30'), new THREE.Color('#5a8f35'), new THREE.Color('#6b9a3a'), new THREE.Color('#3f6f2c')];
  let t = 0;
  for (let k = 0; k < treeCount * 6 && t < treeCount; k++) {
    const side = r() < 0.5 ? -1 : 1;
    const z = -120 + r() * (L + 320);
    const zc = Math.min(L, Math.max(0, z));
    const x = side * (Math.max(half, Math.abs(track.centerAt(zc)) + track.outer + 8) + 6 + r() * 160);
    // in Gruppen (Waldstücke)
    if (noise2(x * 0.025, z * 0.025, seed + 21) < 0.48) continue;
    const y = groundAt(x, z);
    const s = 0.8 + r() * 1.1;
    trunk.setMatrixAt(t, m4.compose(v.set(x, y + 1 * s, z), q.identity(), new THREE.Vector3(s, s, s)));
    e.set(r() * 0.4, r() * 6, r() * 0.4);
    crown.setMatrixAt(t, m4.compose(v.set(x, y + 3.2 * s, z), q.setFromEuler(e), new THREE.Vector3(s, s * (1.1 + r() * 0.5), s)));
    crown.setColorAt(t, leaf[Math.floor(r() * leaf.length)]);
    t++;
  }
  trunk.count = crown.count = t;
  crown.castShadow = true;
  group.add(trunk, crown);

  // Zuschauer hinter dem Zaun
  const spectators = buildSpectators(group, track, groundAt, fenceX, r);

  // Start- und Zielbanner
  group.add(banner(track, track.start.z + 7, 'START', '#1d3b6b', groundAt));
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
  for (const cp of track.checkpoints.slice(1)) {
    for (const side of [-1, 1]) {
      const x = cp.x + side * (track.inner + 0.5);
      const y = groundAt(x, cp.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2), new THREE.MeshLambertMaterial({ color: '#eeeeee' }));
      pole.position.set(x, y + 1.1, cp.z);
      const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color: '#e07a1f' }));
      flag.position.set(x + 0.45, y + 1.9, cp.z);
      group.add(pole, flag);
    }
  }

  return {
    group,
    groundAt,
    update(time, cheesePos, speed) {
      spectators.update(time, cheesePos, speed);
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

function buildSpectators(group, track, groundAt, fenceX, r) {
  const shirts = ['#c43c2a', '#2b5fa8', '#f2c230', '#ffffff', '#3d8a3a', '#e07a1f', '#7a3d8a', '#1b1d17', '#e8a0b4'].map((h) => new THREE.Color(h));
  const skins = ['#f1c7a5', '#d9a07a', '#a8714f', '#6e4a33'].map((h) => new THREE.Color(h));
  const people = [];
  for (let z = 4; z < track.finishZ + 25 && z < track.length; z += 0.9) {
    for (const side of [-1, 1]) {
      // dichter am Start, im Ziel und an den steilen Stellen
      const density = 0.35 + (z < 30 || z > track.finishZ - 30 ? 0.5 : 0);
      if (r() > density) continue;
      const rowsBack = 1 + Math.floor(r() * 3);
      for (let k = 0; k < rowsBack; k++) {
        const fx = fenceX(side, z);
        const x = fx + side * (0.8 + k * 0.9 + r() * 0.5);
        const zz = z + (r() - 0.5) * 0.6;
        people.push({ x, z: zz, y: groundAt(x, zz), h: 0.85 + r() * 0.3, shirt: shirts[Math.floor(r() * shirts.length)], skin: skins[Math.floor(r() * skins.length)], phase: r() * 6.28, excite: 0 });
      }
    }
  }
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.24, 0.8, 3, 8), new THREE.MeshLambertMaterial(), people.length);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshLambertMaterial(), people.length);
  people.forEach((p, i) => {
    body.setColorAt(i, p.shirt);
    head.setColorAt(i, p.skin);
  });
  body.castShadow = true;
  group.add(body, head);
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let last = 0;
  const update = (time, cp, speed) => {
    const dt = Math.min(0.05, time - last);
    last = time;
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      const near = cp ? Math.abs(p.z - cp.z) : 99;
      const target = near < 22 ? Math.min(1, (1 - near / 22) * (0.4 + speed / 25)) : 0;
      p.excite += (target - p.excite) * Math.min(1, dt * 3);
      const jump = Math.max(0, Math.sin(time * 9 + p.phase)) * 0.35 * p.excite;
      const sway = Math.sin(time * 1.3 + p.phase) * 0.03;
      s.set(1, p.h, 1);
      v.set(p.x + sway, p.y + 0.64 * p.h + jump, p.z);
      body.setMatrixAt(i, m4.compose(v, q.identity(), s));
      v.y += 0.62 * p.h + 0.1;
      head.setMatrixAt(i, m4.compose(v, q, s.set(1, 1, 1)));
    }
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  };
  update(0, null, 0);
  return { update, count: people.length };
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
  cloth.position.set(cx, y + 5.2, z);
  cloth.rotation.y = Math.PI; // Schrift zeigt bergauf, zur Kamera
  cloth.castShadow = true;
  g.add(cloth);
  return g;
}

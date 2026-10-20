// Grasbüschel auf Böschungen und am Rand, wiegen sich im Wind (im Shader)
import * as THREE from 'three';
import { noise2 } from '../../shared/noise.js';

function bladeTexture() {
  const w = 128;
  const h = 128;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  for (let i = 0; i < 60; i++) {
    const x = 10 + Math.random() * (w - 20);
    const top = 14 + Math.random() * 70;
    const lean = (Math.random() - 0.5) * 30;
    // Halm: unten dunkel, oben hell
    const grad = g.createLinearGradient(0, h, 0, top);
    const v = 170 + Math.random() * 60;
    grad.addColorStop(0, 'rgb(70,95,50)');
    grad.addColorStop(1, `rgb(${v * 0.8},${v},${v * 0.6})`);
    g.strokeStyle = grad;
    g.lineWidth = 1 + Math.random() * 1.6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, h);
    g.quadraticCurveTo(x + lean * 0.2, (h + top) / 2, x + lean, top);
    g.stroke();
  }
  // ab und zu eine Blüte
  for (let i = 0; i < 3; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#fff6d8' : '#f2d23a';
    g.beginPath();
    g.arc(10 + Math.random() * (w - 20), 12 + Math.random() * 30, 4, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildGrass(group, track, { groundAt, rng: r, quality }) {
  // Büschel aus drei gekreuzten Flächen, Unterkante bei y = 0
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const p = new THREE.PlaneGeometry(0.6, 0.38);
    p.translate(0, 0.19, 0);
    p.rotateY((k * Math.PI) / 3);
    parts.push(p);
  }
  const geo = new THREE.BufferGeometry();
  const pos = [];
  const uv = [];
  const idx = [];
  let base = 0;
  for (const p of parts) {
    pos.push(...p.attributes.position.array);
    uv.push(...p.attributes.uv.array);
    idx.push(...Array.from(p.index.array, (i) => i + base));
    base += p.attributes.position.count;
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  // Normalen nach oben: Büschel werden wie der Boden beleuchtet und wirken nicht wie Pappe
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));

  const time = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ map: bladeTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    // Rückseiten nicht abdunkeln: Normale zeigt immer nach oben
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sway = sin(uTime * 1.8 + wpos.x * 0.35 + wpos.z * 0.22) * 0.5 + sin(uTime * 3.1 + wpos.z * 0.9) * 0.25;
      transformed.x += sway * 0.12 * position.y * 2.0;
      transformed.z += sway * 0.06 * position.y * 2.0;`,
    );
  };

  const count = Math.round(22000 * quality);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const seed = track.def.seed >>> 0;
  const L = track.length;
  let n = 0;
  for (let k = 0; k < count * 4 && n < count; k++) {
    const z = -20 + r() * (Math.min(L, track.finishZ + 40) + 20);
    const zc = Math.max(0, Math.min(L, z));
    const side = r() < 0.5 ? -1 : 1;
    // auf der oberen Böschung und hinter dem Zaun, am Bahnrand nur vereinzelt, nie auf der gemähten Mitte
    const d = track.inner + r() * (track.outer - track.inner + 14);
    const x = track.centerAt(zc) + side * d;
    if (Math.abs(x) > track.width / 2 + 14) continue;
    const t = (d - track.inner) / (track.outer - track.inner);
    const near = t < 0.4 ? 0.12 : t < 0.8 ? 0.5 : 1;
    // in Flecken, nicht gleichmäßig
    if (r() > near * Math.max(0, noise2(x * 0.12, z * 0.12, seed + 31) * 1.6 - 0.35)) continue;
    const y = groundAt(x, z) - 0.03;
    const sc = 0.7 + r() * 0.8;
    q.setFromEuler(e.set((r() - 0.5) * 0.25, r() * 6.28, (r() - 0.5) * 0.25));
    mesh.setMatrixAt(n, m4.compose(v.set(x, y, z), q, s.set(sc, sc * (0.7 + r() * 0.7), sc)));
    c.setHSL(0.24 + r() * 0.04, 0.4 + r() * 0.15, 0.42 + r() * 0.12);
    mesh.setColorAt(n++, c);
  }
  mesh.count = n;
  mesh.frustumCulled = false;
  group.add(mesh);

  return {
    update(t) {
      time.value = t;
    },
  };
}

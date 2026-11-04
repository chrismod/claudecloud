// Modelle der Hüterpilze: Sporenturm, Leuchtschirm, Quellpilz.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tube } from './geometries.js';
import { glowTex } from './wisps.js';
import { U } from './shared.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function colorize(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const e = new Float32Array(p.count);
  const t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const glow = fn(p.getX(i), p.getY(i), p.getZ(i), t) ?? 0;
    c.set([t.r, t.g, t.b], i * 3);
    e[i] = glow;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(e, 1));
  return g;
}

function capLathe(r, h, y, segs = 28, dome = 1) {
  const pts = [V(0.05, y - h * 0.15, 0)];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.max(0.01, r * Math.cos(a)), y + h * Math.sin(a) ** dome));
  }
  return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x, p.y)), segs);
}

function buildTower() {
  const parts = [];
  const stalk = [];
  const rad = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    stalk.push(V(Math.sin(t * 5) * 0.35, t * 5.6, Math.cos(t * 4) * 0.3));
    rad.push(0.42 * (1 - t * 0.55) + (i === 0 ? 0.3 : 0));
  }
  parts.push(colorize(tube(stalk, rad, 10), (x, y, z, c) => (c.setRGB(0.78, 0.7, 0.58).lerp(new THREE.Color(0.95, 0.9, 0.8), y / 5.6), Math.sin(y * 6 + Math.atan2(z, x) * 3) > 0.85 ? 0.8 : 0)));
  // drei Schirmringe übereinander
  [[1.5, 2.0], [1.1, 3.4], [0.75, 4.7]].forEach(([r, y], k) => {
    const cap = capLathe(r, 0.45, y, 24, 0.6);
    cap.translate(Math.sin((y / 5.6) * 5) * 0.35, 0, Math.cos((y / 5.6) * 4) * 0.3);
    parts.push(colorize(cap, (x, yy, z, c) => (c.setRGB(0.95, 0.75, 0.35), yy < y + 0.02 ? 1.2 : 0.15)));
  });
  // Sporenkugel an der Spitze
  const orb = new THREE.IcosahedronGeometry(0.55, 2);
  orb.translate(stalk[10].x, 6.1, stalk[10].z);
  parts.push(colorize(orb, (x, y, z, c) => (c.setRGB(1, 0.85, 0.5), 2)));
  return mergeGeometries(parts);
}

function buildLamp() {
  const parts = [];
  const stem = [];
  for (let i = 0; i <= 8; i++) stem.push(V(Math.sin(i * 0.4) * 0.2, (i / 8) * 4.2, 0));
  parts.push(colorize(tube(stem, stem.map((_, i) => 0.32 * (1 - i / 14) + (i === 0 ? 0.25 : 0)), 10), (x, y, z, c) => (c.setRGB(0.85, 0.88, 0.95), 0.1)));
  const cap = capLathe(3.2, 1.3, 4.0, 36, 0.7);
  parts.push(colorize(cap, (x, y, z, c) => (y < 4.05 ? (c.setRGB(0.55, 0.9, 1), 1.6) : (c.setRGB(0.06, 0.2, 0.42).lerp(new THREE.Color(0.12, 0.42, 0.55), Math.max(0, 1 - (y - 4) / 1.3)), 0.12))));
  // hängende Leuchttropfen am Rand
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const d = new THREE.SphereGeometry(0.16, 8, 6);
    d.scale(1, 1.4, 1);
    d.translate(Math.cos(a) * 2.8, 3.55 - (k % 3) * 0.25, Math.sin(a) * 2.8);
    parts.push(colorize(d, (x, y, z, c) => (c.setRGB(0.75, 1, 1), 2.2)));
  }
  return mergeGeometries(parts);
}

function buildSpring() {
  const parts = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const h = 1.2 + (k % 3) * 0.6;
    const pod = new THREE.SphereGeometry(0.55, 14, 10);
    pod.scale(1, h / 1.1, 1);
    pod.translate(Math.cos(a) * 1.4, h * 0.5, Math.sin(a) * 1.4);
    parts.push(colorize(pod, (x, y, z, c) => (c.setRGB(0.22, 0.42, 0.16).lerp(new THREE.Color(0.6, 0.85, 0.35), y / h), y > h * 0.85 ? 1.2 : 0.05)));
  }
  const pool = new THREE.CylinderGeometry(1.1, 1.2, 0.2, 24);
  pool.translate(0, 0.1, 0);
  parts.push(colorize(pool, (x, y, z, c) => (c.setRGB(0.4, 1, 0.75), 1.8)));
  return mergeGeometries(parts);
}

const GEO = {};
const geo = (type) => (GEO[type] ??= type === 'tower' ? buildTower() : type === 'lamp' ? buildLamp() : buildSpring());

function material() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const uniforms = { uPulse: { value: 0 }, uHurt: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uNight: U.uNight, uTime: U.uTime });
    shader.vertexShader = 'attribute float aGlow; varying float vGlow; varying vec3 vCol;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow; vCol = color;');
    shader.fragmentShader =
      'uniform float uPulse, uHurt, uNight, uTime; varying float vGlow; varying vec3 vCol;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vCol * vGlow * (0.12 + uNight * 0.9 + uPulse * 1.6) * (0.85 + 0.15 * sin(uTime * 2.0));
        totalEmissiveRadiance += vec3(0.9, 0.1, 0.6) * uHurt * 0.6;`,
      );
  };
  mat.customProgramCacheKey = () => 'guardian';
  return { mat, uniforms };
}

const HALO = { tower: new THREE.Color(1, 0.8, 0.45), lamp: new THREE.Color(0.5, 0.85, 1), spring: new THREE.Color(0.55, 1, 0.7) };

export function createGuardianViews(scene, field) {
  const views = new Map();
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.8, 1), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  function make(g) {
    const { mat, uniforms } = material();
    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(geo(g.type), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    grp.add(mesh);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: HALO[g.type], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    halo.scale.setScalar(g.type === 'lamp' ? 9 : 6);
    halo.position.y = g.type === 'tower' ? 6 : g.type === 'lamp' ? 3.8 : 1;
    grp.add(halo);
    let ring = null;
    if (g.type === 'lamp' || g.type === 'tower') {
      const r = g.type === 'lamp' ? 18 : 11;
      ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r, 96).rotateX(-Math.PI / 2), ringMat.clone());
      ring.position.y = 0.4;
      grp.add(ring);
    }
    grp.position.set(g.x, field.height(g.x, g.z) - 0.2, g.z);
    grp.rotation.y = g.id * 1.7;
    scene.add(grp);
    return { grp, mesh, halo, ring, uniforms, pulse: 0 };
  }

  function sync(list, dt, time) {
    const seen = new Set();
    for (const g of list) {
      seen.add(g.id);
      let v = views.get(g.id);
      if (!v) views.set(g.id, (v = make(g)));
      const born = g.born ?? 1;
      const s = 1 - (1 - born) ** 3;
      v.mesh.scale.set(s, s * (1 + Math.sin(time * 1.5 + g.id) * 0.015), s);
      v.pulse = Math.max(0, v.pulse - dt * 1.5);
      v.uniforms.uPulse.value = v.pulse + (g.giving ? 0.4 : 0) + (g.repairing ? 0.5 : 0);
      v.uniforms.uHurt.value = g.hurt ?? 0;
      v.halo.material.opacity = (0.06 + U.uNight.value * 0.45 + v.pulse * 0.6) * born;
      if (v.ring) {
        const k = g.type === 'tower' ? v.pulse : 1;
        v.ring.material.opacity = g.type === 'tower' ? v.pulse * 0.6 : 0.06 + U.uNight.value * 0.1;
        if (g.type === 'tower') v.ring.scale.setScalar(0.3 + (1 - k) * 0.7);
      }
    }
    for (const [id, v] of views)
      if (!seen.has(id)) {
        scene.remove(v.grp);
        views.delete(id);
      }
  }

  return {
    sync,
    pulse(id) {
      const v = views.get(id);
      if (v) v.pulse = 1;
    },
  };
}

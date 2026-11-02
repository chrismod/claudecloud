// Moderherzen: pulsierende Fäulnisnester mit Ranken, die ins Land greifen.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { tube } from './geometries.js';
import { U, GLSL_NOISE } from './shared.js';
import { rng } from '../noise.js';

function lump(r, seed, rough) {
  const ico = new THREE.IcosahedronGeometry(r, 3);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d = Math.sin(n.x * 4 + seed) * Math.sin(n.y * 5 - seed) * Math.sin(n.z * 3 + seed * 2) + 0.4 * Math.sin((n.x - n.z) * 9 + seed);
    v.addScaledVector(n, d * rough * r);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function strip(g) {
  let q = g.index ? g.toNonIndexed() : g;
  for (const n of Object.keys(q.attributes)) if (n !== 'position' && n !== 'normal') q.deleteAttribute(n);
  return q;
}

function buildVariant(seed) {
  const r = rng(seed);
  const parts = [];
  const core = lump(2.2, seed, 0.28);
  core.scale(1, 0.75, 1);
  core.translate(0, 1.2, 0);
  parts.push(core);
  // Nebenknollen
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2;
    const s = 0.6 + r() * 0.8;
    const g = lump(s, seed + i * 7, 0.3);
    g.translate(Math.cos(a) * (2 + r()), s * 0.5, Math.sin(a) * (2 + r()));
    parts.push(g);
  }
  // Ranken
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.5;
    const len = 6 + r() * 7;
    const pts = [];
    const rad = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const wob = Math.sin(t * 6 + k) * 0.8;
      pts.push(new THREE.Vector3(Math.cos(a) * (1.5 + len * t) - Math.sin(a) * wob, 1.0 * (1 - t) ** 1.5 + Math.sin(t * Math.PI) * 0.6 - 0.15, Math.sin(a) * (1.5 + len * t) + Math.cos(a) * wob));
      rad.push(0.45 * (1 - t * 0.9));
    }
    parts.push(tube(pts, rad, 7));
  }
  // Sporenkapseln auf Stielen
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const d = 1 + r() * 1.5;
    const h = 2.4 + r() * 1.8;
    parts.push(tube([new THREE.Vector3(Math.cos(a) * d * 0.5, 1.5, Math.sin(a) * d * 0.5), new THREE.Vector3(Math.cos(a) * d, h, Math.sin(a) * d)], [0.12, 0.06], 5, false));
    const pod = lump(0.32, seed + 50 + i, 0.15);
    pod.translate(Math.cos(a) * d, h + 0.2, Math.sin(a) * d);
    parts.push(pod);
  }
  const g = mergeGeometries(parts.map(strip));
  g.computeBoundingSphere();
  return g;
}

const variants = [];
const variant = (i) => (variants[i] ??= buildVariant(500 + i * 31));

function makeMaterial() {
  const uniforms = { uBeat: { value: 0 }, uPurify: { value: 0 }, uFade: { value: 1 } };
  const mat = new THREE.MeshStandardMaterial({ color: 0x120818, roughness: 0.32, metalness: 0.1 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uTime: U.uTime, uNight: U.uNight });
    shader.vertexShader =
      'uniform float uBeat; uniform float uTime; uniform float uFade; varying vec3 vP;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `vec3 transformed = position;
        float sw = sin(position.x * 1.7 + uTime * 1.3) * sin(position.z * 1.9 - uTime * 1.1);
        transformed += normal * (sw * 0.08 + uBeat * 0.18 * smoothstep(3.5, 0.0, length(position.xz)));
        transformed *= uFade;
        vP = position;`,
      );
    shader.fragmentShader =
      `uniform float uBeat, uPurify, uTime, uNight, uFade; varying vec3 vP;\n${GLSL_NOISE}\n` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float n = mzNoise(vP.xz * 1.3 + vP.y);
          diffuseColor.rgb = mix(vec3(0.025, 0.008, 0.035), vec3(0.09, 0.03, 0.08), n);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.5, 0.42), uPurify * 0.6);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float vein = 1.0 - smoothstep(0.0, 0.07, mzVeins(vP.xz * 1.4 + vP.y * 0.8));
          vec3 sick = mix(vec3(0.55, 0.06, 0.95), vec3(0.45, 1.0, 0.12), smoothstep(0.3, 0.8, mzNoise(vP.xz * 0.4 + uTime * 0.1)));
          float flow = 0.55 + 0.45 * sin(length(vP.xz) * 2.5 - uTime * 3.0);
          totalEmissiveRadiance += sick * vein * (0.35 + uBeat * 1.4 + uNight * 0.4) * flow * (1.0 - uPurify);
          totalEmissiveRadiance += vec3(1.0, 0.9, 0.6) * vein * uPurify * (1.5 + 1.5 * sin(uTime * 14.0));`,
        );
  };
  mat.customProgramCacheKey = () => 'nest';
  return { mat, uniforms };
}

export function createNests(scene, field) {
  const nests = new Map();

  function make(n) {
    const { mat, uniforms } = makeMaterial();
    const mesh = new THREE.Mesh(variant(Math.floor(n.seed * 3)), mat);
    mesh.position.set(n.x, field.height(n.x, n.z) - 0.2, n.z);
    mesh.rotation.y = n.seed * 20;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { n, mesh, uniforms, purify: 0, dying: 0, phase: n.seed * 10 };
  }

  // alive(id) → lebt das Herz noch?
  function update(focus, alive, dt, time) {
    const near = field.nestsNear(focus.x, focus.z, 230);
    const ids = new Set(near.map((n) => n.id));
    for (const [id, o] of nests)
      if (!ids.has(id) || (!alive(id) && o.dying >= 1)) {
        scene.remove(o.mesh);
        o.mesh.material.dispose();
        nests.delete(id);
      }
    for (const n of near) {
      let o = nests.get(n.id);
      if (!o) {
        if (!alive(n.id)) continue;
        o = make(n);
        nests.set(n.id, o);
      }
      // Herzschlag: doppelter Schlag, nachts schneller
      const bpm = 0.9 + U.uNight.value * 0.6;
      const t = (time * bpm + o.phase) % 1;
      const beat = Math.exp(-((t - 0.05) ** 2) * 900) + 0.6 * Math.exp(-((t - 0.2) ** 2) * 900);
      o.uniforms.uBeat.value = beat;
      o.uniforms.uPurify.value = o.purify;
      if (!alive(n.id)) o.dying = Math.min(1, o.dying + dt * 0.5);
      o.uniforms.uFade.value = Math.max(0.001, 1 - o.dying * o.dying);
    }
  }

  return { nests, update };
}

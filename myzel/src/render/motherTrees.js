// Mutterbäume: uralte Riesen, die das Myzelnetz zusammenhalten. Schlafend sind sie kahl und grau,
// erwacht tragen sie eine gewaltige Krone mit hängenden Lichtern.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tube, blob } from './geometries.js';
import { U, GLSL_NOISE, addOcclusion } from './shared.js';
import { rng } from '../noise.js';
import { glowTex } from './wisps.js';

function buildVariant(seed) {
  const r = rng(seed);
  const bark = [];
  const crown = [];
  const lanterns = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // Stamm, leicht gedreht
  const pts = [];
  const rad = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(V(Math.sin(t * 2.5 + seed) * 0.8, t * 15, Math.cos(t * 2.1 + seed) * 0.6));
    rad.push(2.3 * (1 - t * 0.55) + (i === 0 ? 0.8 : 0));
  }
  bark.push(tube(pts, rad, 14, false));
  // Wurzeln
  const nr = 8;
  for (let k = 0; k < nr; k++) {
    const a = (k / nr) * Math.PI * 2 + r() * 0.4;
    const len = 6 + r() * 5;
    const rp = [];
    const rr = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      rp.push(V(Math.cos(a) * (1.2 + len * t), 2.8 * (1 - t) ** 1.6 - 0.6 * t, Math.sin(a) * (1.2 + len * t)));
      rr.push(1.0 * (1 - t * 0.85));
    }
    bark.push(tube(rp, rr, 8));
  }
  // Äste rekursiv
  const tips = [];
  function branch(start, dir, len, radius, depth) {
    const bp = [];
    const br = [];
    const segs = 5;
    const d = dir.clone();
    const p = start.clone();
    for (let i = 0; i <= segs; i++) {
      bp.push(p.clone());
      br.push(radius * (1 - (i / segs) * 0.6));
      d.y += 0.05 - depth * 0.04;
      d.x += (r() - 0.5) * 0.25;
      d.z += (r() - 0.5) * 0.25;
      d.normalize();
      p.addScaledVector(d, len / segs);
    }
    bark.push(tube(bp, br, depth === 0 ? 10 : 6));
    if (depth >= 2) {
      tips.push(p.clone());
      return;
    }
    const n = depth === 0 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const nd = d.clone();
      const a = (k / n) * Math.PI * 2 + r();
      nd.x += Math.cos(a) * 0.8;
      nd.z += Math.sin(a) * 0.8;
      nd.y += 0.1;
      nd.normalize();
      branch(bp[Math.floor(segs * (0.6 + r() * 0.4))], nd, len * 0.6, radius * 0.5, depth + 1);
    }
    tips.push(p.clone());
  }
  const top = pts[10];
  const nb = 5;
  for (let k = 0; k < nb; k++) {
    const a = (k / nb) * Math.PI * 2 + r() * 0.5;
    branch(pts[7 + (k % 3)], V(Math.cos(a), 0.55 + r() * 0.3, Math.sin(a)).normalize(), 10 + r() * 3, 0.95, 0);
  }
  branch(top, V(0, 1, 0), 6, 0.9, 1);

  for (const tp of tips) {
    const n = 1 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const s = 2.6 + r() * 2.2;
      const g = blob(s, 1, r() * 100, 0.3);
      g.scale(1, 0.7, 1);
      g.translate(tp.x + (r() - 0.5) * 2, tp.y + r() * 1.5, tp.z + (r() - 0.5) * 2);
      crown.push(g);
    }
    if (r() < 0.7) {
      const hang = 2 + r() * 4;
      lanterns.push(V(tp.x + (r() - 0.5) * 2, tp.y - hang, tp.z + (r() - 0.5) * 2));
    }
  }

  const prep = (list, colorFn) =>
    mergeGeometries(
      list.map((g) => {
        let q = g.index ? g.toNonIndexed() : g;
        for (const n of Object.keys(q.attributes)) if (n !== 'position' && n !== 'normal') q.deleteAttribute(n);
        const c = new Float32Array(q.attributes.position.count * 3);
        const p = q.attributes.position;
        const tmp = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
          colorFn(p.getX(i), p.getY(i), p.getZ(i), tmp);
          c[i * 3] = tmp.r;
          c[i * 3 + 1] = tmp.g;
          c[i * 3 + 2] = tmp.b;
        }
        q.setAttribute('color', new THREE.BufferAttribute(c, 3));
        return q;
      }),
    );
  const barkGeo = prep(bark, (x, y, z, c) => c.setRGB(1, 1, 1));
  const crownGeo = prep(crown, (x, y, z, c) => {
    const t = Math.min(1, Math.max(0, (y - 12) / 16));
    c.set('#1f4a1a').lerp(new THREE.Color('#7fb03a'), t);
  });
  return { barkGeo, crownGeo, lanterns };
}

const variants = [];
const variant = (i) => (variants[i] ??= buildVariant(1000 + i * 77));

function barkMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const uniforms = { uAwake: { value: 0 }, uStir: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uTime: U.uTime, uNight: U.uNight, uP1: U.uP1, uP2: U.uP2 });
    shader.vertexShader = 'varying vec3 vP;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vP = position;');
    shader.fragmentShader =
      `uniform float uAwake, uStir, uTime, uNight; uniform vec3 uP1, uP2; varying vec3 vP;\n${GLSL_NOISE}\n` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float bn = mzNoise(vec2(atan(vP.z, vP.x) * 4.0, vP.y * 0.6)) * 0.6 + mzNoise(vP.xz * 2.0 + vP.y) * 0.4;
          vec3 deadBark = mix(vec3(0.24, 0.23, 0.22), vec3(0.42, 0.41, 0.39), bn);
          vec3 liveBark = mix(vec3(0.17, 0.11, 0.07), vec3(0.36, 0.25, 0.16), bn);
          diffuseColor.rgb = mix(deadBark, liveBark, uAwake);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.22, 0.05), uAwake * smoothstep(0.55, 0.8, bn) * smoothstep(6.0, 0.0, vP.y) * 0.8);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float rune = 1.0 - smoothstep(0.0, 0.06, mzVeins(vec2(atan(vP.z, vP.x) * 3.0, vP.y * 0.45)));
          float flow = 0.5 + 0.5 * sin(vP.y * 0.8 - uTime * 2.5);
          vec3 rc = mix(uP1, uP2, 0.5 + 0.5 * sin(vP.y * 0.2));
          totalEmissiveRadiance += rc * rune * (uAwake * (0.25 + uNight * 0.9) * flow + uStir * (0.6 + 0.4 * sin(uTime * 6.0)));`,
        );
  };
  mat.customProgramCacheKey = () => 'motherbark';
  return { mat, uniforms };
}

export function createMotherTrees(scene, field) {
  const trees = new Map();
  const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, emissive: '#c8ff70', emissiveIntensity: 0 });
  crownMat.onBeforeCompile = (shader) => addOcclusion(shader, false);
  crownMat.customProgramCacheKey = () => 'mothercrown';
  const lanternGeo = new THREE.SphereGeometry(0.32, 12, 8);

  function make(site) {
    const v = variant(site.variant);
    const g = new THREE.Group();
    g.position.set(site.x, field.height(site.x, site.z) - 0.6, site.z);
    g.rotation.y = site.rot;
    const { mat, uniforms } = barkMaterial();
    const bark = new THREE.Mesh(v.barkGeo, mat);
    bark.castShadow = true;
    bark.receiveShadow = true;
    g.add(bark);
    const cm = crownMat.clone();
    cm.onBeforeCompile = crownMat.onBeforeCompile;
    cm.customProgramCacheKey = crownMat.customProgramCacheKey;
    const crown = new THREE.Mesh(v.crownGeo, cm);
    crown.castShadow = true;
    crown.receiveShadow = true;
    g.add(crown);
    const lMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.2, 1.2) });
    const lanterns = new THREE.InstancedMesh(lanternGeo, lMat, v.lanterns.length);
    const m = new THREE.Matrix4();
    v.lanterns.forEach((p, i) => lanterns.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    g.add(lanterns);
    // Lichtsäule beim Erwachen
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 6, 140, 24, 1, true),
      new THREE.MeshBasicMaterial({ map: glowTex(), color: new THREE.Color(1, 0.9, 0.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 70;
    g.add(beam);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(1, 0.85, 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    halo.position.y = 16;
    halo.scale.setScalar(40);
    g.add(halo);
    scene.add(g);
    return { site, group: g, bark, crown, lanterns, beam, halo, uniforms, awake: 0, stir: 0, burst: 0 };
  }

  function update(focus, isAwake, dt, time) {
    const near = field.sitesNear(focus.x, focus.z, 320);
    const ids = new Set(near.map((s) => s.id));
    for (const [id, t] of trees)
      if (!ids.has(id)) {
        scene.remove(t.group);
        trees.delete(id);
      }
    for (const s of near) {
      let t = trees.get(s.id);
      if (!t) {
        t = make(s);
        t.awake = isAwake(s.id) ? 1 : 0;
        trees.set(s.id, t);
      }
      const target = isAwake(s.id) ? 1 : 0;
      t.awake += (target - t.awake) * Math.min(1, dt * (target ? 0.5 : 4));
      t.burst = Math.max(0, t.burst - dt * 0.18);
      const a = t.awake;
      t.uniforms.uAwake.value = a;
      t.uniforms.uStir.value = t.stir;
      const cs = Math.max(0.0001, a < 0.999 ? 1 - (1 - a) ** 3 : 1);
      t.crown.scale.set(cs, cs, cs);
      t.crown.visible = a > 0.01;
      t.crown.material.emissiveIntensity = U.uNight.value * 0.06 * a;
      t.lanterns.visible = a > 0.3;
      t.lanterns.scale.setScalar(Math.max(0.001, a));
      t.lanterns.material.color.setRGB(2.6, 2.2, 1.1).multiplyScalar(0.4 + U.uNight.value * 0.8 + 0.2 * Math.sin(time * 1.5));
      t.beam.material.opacity = t.burst * 0.55;
      t.beam.visible = t.burst > 0.01;
      t.halo.material.opacity = t.stir * 0.5 + t.burst * 0.8 + a * U.uNight.value * 0.25;
    }
  }

  return { trees, update };
}

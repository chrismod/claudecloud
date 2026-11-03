// Darstellung der Begegnungen: verirrte Lichter, Moderlinge, Sternsporen.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { tube } from './geometries.js';
import { glowTex } from './wisps.js';
import { U } from './shared.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const additive = (color, opacity = 1) =>
  new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity });

// --- Verirrtes Licht -----------------------------------------------------------------------------
class WispLight {
  constructor(scene, w) {
    this.color = new THREE.Color().setHSL(w.hue, 0.75, 0.68);
    this.g = new THREE.Group();
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(3) }));
    this.halo = new THREE.Sprite(additive(this.color, 0.9));
    this.halo.scale.setScalar(2.6);
    this.g.add(this.core, this.halo);
    // Käfig aus Fäulnisranken, solange es gefangen ist
    const thorns = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const pts = [V(Math.cos(a) * 1.6, -1.4, Math.sin(a) * 1.6), V(Math.cos(a + 0.5) * 1.1, 0, Math.sin(a + 0.5) * 1.1), V(Math.cos(a + 1.1) * 0.5, 1.2, Math.sin(a + 1.1) * 0.5)];
      thorns.push(tube(pts, [0.12, 0.07, 0.01], 5));
    }
    this.cage = new THREE.Mesh(mergeGeometries(thorns.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x14061a, emissive: 0x5a0f8a, emissiveIntensity: 0.6, roughness: 0.3 }));
    this.g.add(this.cage);
    scene.add(this.g);
  }
  update(w, dt, time) {
    this.g.position.set(w.x, w.y, w.z);
    const flick = w.state === 'lost' || w.state === 'trapped' ? 0.55 + 0.45 * Math.abs(Math.sin(time * 7 + w.id) * Math.sin(time * 2.3 + w.id * 3)) : 1;
    const light = w.state === 'trapped' ? 0.35 : w.light;
    this.halo.material.opacity = (0.35 + light * 0.65) * flick;
    this.halo.scale.setScalar((3 + light * 2) * (w.state === 'home' ? 1 + w.t : 1));
    this.core.scale.setScalar(0.8 + light * 0.6);
    this.cage.visible = w.state === 'trapped';
    this.cage.rotation.y += dt * 0.6;
    if (w.state === 'home') this.halo.material.opacity *= Math.max(0, 1 - w.t / 3);
  }
  dispose(scene) {
    scene.remove(this.g);
  }
}

// --- Moderling ---------------------------------------------------------------------------------
let MOD_GEO = null;
function moderGeometry() {
  const ico = new THREE.IcosahedronGeometry(0.55, 2);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const body = mergeVertices(ico);
  const p = body.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    v.addScaledVector(n, (Math.sin(n.x * 6) * Math.sin(n.z * 5) + 0.6 * Math.sin(n.y * 9)) * 0.08);
    v.y *= 0.65;
    v.z *= 1.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  body.computeVertexNormals();
  body.translate(0, 0.45, 0);
  const leg = tube([V(0, 0, 0), V(0.35, 0.25, 0), V(0.6, -0.35, 0)], [0.06, 0.045, 0.015], 5);
  const eye = new THREE.SphereGeometry(0.075, 8, 6);
  return { body, leg, eye };
}

class Moderling {
  constructor(scene) {
    MOD_GEO ??= moderGeometry();
    this.g = new THREE.Group();
    this.mat = new THREE.MeshStandardMaterial({ color: 0x0c0410, emissive: 0x6a12a8, emissiveIntensity: 0.25, roughness: 0.25, metalness: 0.2 });
    this.body = new THREE.Mesh(MOD_GEO.body, this.mat);
    this.body.castShadow = true;
    this.g.add(this.body);
    this.legs = [];
    for (let k = 0; k < 6; k++) {
      const side = k < 3 ? 1 : -1;
      const l = new THREE.Mesh(MOD_GEO.leg, this.mat);
      l.position.set(side * 0.3, 0.42, -0.35 + (k % 3) * 0.35);
      l.rotation.y = side > 0 ? 0 : Math.PI;
      l.userData.ph = k * 1.7;
      this.legs.push(l);
      this.g.add(l);
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.2, 5) });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(MOD_GEO.eye, eyeMat);
      e.position.set(s * 0.17, 0.62, 0.6);
      this.g.add(e);
    }
    this.aura = new THREE.Sprite(additive(new THREE.Color(0.6, 0.1, 1), 0.35));
    this.aura.scale.setScalar(4.2);
    this.aura.position.y = 0.5;
    this.g.add(this.aura);
    scene.add(this.g);
  }
  update(m, dt, time, field) {
    const y = field.height(m.x, m.z);
    this.g.position.set(m.x, y - (m.state === 'burrow' ? (1 - (m.fade ?? 1)) * 1.2 : 0), m.z);
    this.g.rotation.y = m.heading;
    const s = m.state === 'dead' ? (m.fade ?? 1) * (1 + (1 - (m.fade ?? 1)) * 0.8) : 1;
    this.g.scale.setScalar(Math.max(0.001, s * (1.25 + m.maxHp * 0.15)));
    for (const l of this.legs) l.rotation.z = Math.sin(m.t * 14 + l.userData.ph) * 0.35;
    this.body.position.y = Math.abs(Math.sin(m.t * 7)) * 0.08;
    this.body.scale.set(1 + Math.sin(m.t * 5) * 0.05, 1 - Math.sin(m.t * 5) * 0.05, 1);
    this.mat.emissiveIntensity = 0.45 + m.hit * 2.5 + U.uNight.value * 0.5 + Math.max(0, Math.sin(m.t * 3)) * 0.3;
    this.mat.emissive.setRGB(0.42 + m.hit * 0.6, 0.07 + m.hit * 0.6, 0.66 + m.hit * 0.3);
    this.aura.material.opacity = 0.45 + Math.sin(m.t * 4) * 0.12;
  }
  dispose(scene) {
    scene.remove(this.g);
    this.mat.dispose();
  }
}

// --- Sternspore ------------------------------------------------------------------------------
class StarSpore {
  constructor(scene) {
    this.g = new THREE.Group();
    const seed = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.6) }));
    this.seed = seed;
    this.halo = new THREE.Sprite(additive(new THREE.Color(1, 0.9, 0.6), 1));
    this.halo.scale.setScalar(5);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 1.6, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({ map: glowTex(), color: new THREE.Color(1, 0.85, 0.5), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.position.y = 30;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.7, 1), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.g.add(seed, this.halo, this.beam, this.ring);
    scene.add(this.g);
  }
  update(s, dt, time) {
    this.g.position.set(s.x, s.y, s.z);
    this.seed.rotation.y += dt * 2;
    this.seed.rotation.x += dt * 1.3;
    const landed = s.state === 'landed';
    const left = landed ? 1 - s.t / s.life : 1;
    const urgent = landed && left < 0.3 ? 0.5 + 0.5 * Math.sin(time * 12) : 1;
    this.halo.scale.setScalar((landed ? 4 + Math.sin(time * 3) * 0.6 : 7) * (0.6 + left * 0.4));
    this.halo.material.opacity = urgent;
    this.beam.visible = landed;
    this.beam.position.y = 30 - (s.y - s.gy);
    this.beam.material.opacity = 0.35 * left * urgent;
    this.ring.visible = landed;
    this.ring.position.y = -(s.y - s.gy) + 0.15;
    this.ring.scale.setScalar(0.4 + left * 0.6);
  }
  dispose(scene) {
    scene.remove(this.g);
  }
}

// Synchronisiert die Logik-Objekte mit ihren Darstellungen
export function createCreatureViews(scene, field) {
  const wispViews = new Map();
  const modViews = new Map();
  let starView = null;
  let starId = null;

  function sync(enc, dt, time) {
    const seenW = new Set();
    for (const w of enc.wisps) {
      seenW.add(w.id);
      let v = wispViews.get(w.id);
      if (!v) wispViews.set(w.id, (v = new WispLight(scene, w)));
      v.update(w, dt, time);
    }
    for (const [id, v] of wispViews) if (!seenW.has(id)) (v.dispose(scene), wispViews.delete(id));
    const seenM = new Set();
    for (const m of enc.moderlings) {
      seenM.add(m.id);
      let v = modViews.get(m.id);
      if (!v) modViews.set(m.id, (v = new Moderling(scene)));
      v.update(m, dt, time, field);
    }
    for (const [id, v] of modViews) if (!seenM.has(id)) (v.dispose(scene), modViews.delete(id));
    const s = enc.star;
    if (s && starId !== s.id) {
      starView?.dispose(scene);
      starView = new StarSpore(scene);
      starId = s.id;
    }
    if (!s && starView) {
      starView.dispose(scene);
      starView = null;
      starId = null;
    }
    if (s) starView.update(s, dt, time);
  }

  return { sync };
}

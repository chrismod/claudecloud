// Die beiden Waldgeister und der Myzelfaden zwischen ihnen.
//  Hyphe (Spieler 1): bernsteinfarbener Pilzgeist mit getupftem Hut
//  Keim  (Spieler 2): jadegrüner Samengeist mit zwei Keimblättern
import * as THREE from 'three';
import { U } from './shared.js';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let GLOW;
export const glowTex = () => (GLOW ??= glowTexture());

function capGeometry() {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.max(0.001, 0.62 * Math.cos(a) * (1 + 0.1 * Math.sin(a * 3))), 0.3 * Math.sin(a)));
  }
  pts.unshift(new THREE.Vector2(0.2, -0.04));
  return new THREE.LatheGeometry(pts, 20);
}

function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.22, 0.12, 0.26, 0.42, 0, 0.62);
  s.bezierCurveTo(-0.26, 0.42, -0.22, 0.12, 0, 0);
  const g = new THREE.ShapeGeometry(s, 8);
  return g;
}

export class WispView {
  constructor(scene, kind) {
    this.kind = kind;
    const color = kind === 0 ? U.uP1.value.clone() : U.uP2.value.clone();
    this.color = color;
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);

    const bodyMat = new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.55), emissive: color, emissiveIntensity: 2.4, roughness: 0.4 });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 20), bodyMat);
    this.body.add(this.core);

    // Augen
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1008 });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), eyeMat);
      e.scale.set(0.8, 1.25, 0.6);
      e.position.set(s * 0.15, 0.07, 0.37);
      this.body.add(e);
      this.eyes.push(e);
    }

    if (kind === 0) {
      const cap = new THREE.Mesh(
        capGeometry(),
        new THREE.MeshStandardMaterial({ color: '#d2401e', emissive: '#ff5a1e', emissiveIntensity: 0.35, roughness: 0.55 }),
      );
      cap.position.y = 0.26;
      cap.rotation.z = 0.12;
      this.body.add(cap);
      const dotMat = new THREE.MeshStandardMaterial({ color: '#fff6e6', emissive: '#fff0d0', emissiveIntensity: 0.6 });
      for (let i = 0; i < 7; i++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dotMat);
        const a = i * 2.1;
        const r = i === 0 ? 0 : 0.3 + (i % 2) * 0.12;
        const y = 0.3 * Math.sin(Math.acos(Math.min(1, r / 0.62)));
        d.position.set(Math.cos(a) * r, y - 0.01, Math.sin(a) * r);
        d.scale.y = 0.45;
        cap.add(d);
      }
      this.accessory = cap;
    } else {
      const leafMat = new THREE.MeshStandardMaterial({ color: '#58d27a', emissive: '#2bdc90', emissiveIntensity: 0.5, side: THREE.DoubleSide, roughness: 0.5 });
      const sprout = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.3, 6), leafMat);
      stem.position.y = 0.15;
      sprout.add(stem);
      for (const s of [-1, 1]) {
        const l = new THREE.Mesh(leafGeometry(), leafMat);
        l.position.y = 0.28;
        l.rotation.set(-0.3, s > 0 ? 0 : Math.PI, s * -1.05);
        sprout.add(l);
      }
      sprout.position.y = 0.36;
      this.body.add(sprout);
      this.accessory = sprout;
    }

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    halo.scale.setScalar(4.2);
    this.halo = halo;
    this.group.add(halo);

    // umkreisende Sporen
    this.motes = [];
    const moteMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3) });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), moteMat);
      this.group.add(m);
      this.motes.push(m);
    }

    this.light = new THREE.PointLight(color, 18, 18, 1.5);
    this.light.position.y = 0.2;
    this.group.add(this.light);
    this.group.scale.setScalar(1.3);
    scene.add(this.group);
    this.heading = 0;
    this.t = Math.random() * 10;
  }

  update(p, dt, night) {
    this.t += dt;
    const t = this.t;
    this.group.position.set(p.x, p.y, p.z);
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0.4) {
      const target = Math.atan2(p.vx, p.vz);
      let d = target - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 8);
    }
    this.body.rotation.y = this.heading;
    // Squash & Stretch, Neigung in Flugrichtung
    const st = Math.min(1, sp / 14);
    this.body.rotation.x = st * 0.45;
    this.body.scale.set(1 - st * 0.12 + Math.sin(t * 3) * 0.02, 1 + st * 0.1 + Math.sin(t * 3 + 1) * 0.03, 1 + st * 0.15);
    this.accessory.rotation.x = -st * 0.4 + Math.sin(t * 2.1) * 0.06;
    // Blinzeln
    const blink = (t % 4.3) < 0.12 ? 0.15 : 1;
    this.eyes.forEach((e) => (e.scale.y = 1.25 * blink));
    const energy = p.energy ?? 1;
    const act = p.activity ?? 0;
    this.core.material.emissiveIntensity = 1.6 + energy * 1.2 + act * 1.5;
    this.halo.scale.setScalar(3.4 + energy * 1.2 + act * 2.0 + Math.sin(t * 4) * 0.15);
    this.halo.material.opacity = 0.55 + night * 0.35 + act * 0.2;
    this.light.intensity = (8 + night * 26 + act * 14) * (0.5 + energy * 0.5);
    this.motes.forEach((m, i) => {
      const a = t * (1.4 + i * 0.13) + i * 1.05;
      const r = 0.75 + Math.sin(t * 0.9 + i) * 0.15 + act * 0.4;
      m.position.set(Math.cos(a) * r, Math.sin(a * 1.3 + i) * 0.35, Math.sin(a) * r);
    });
  }
}

// Leuchtender Faden als zur Kamera gedrehtes Band
export class Thread {
  constructor(scene) {
    this.n = 64;
    const n = this.n;
    this.pos = new Float32Array(n * 2 * 3);
    const t = new Float32Array(n * 2);
    const side = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      t[i * 2] = t[i * 2 + 1] = i / (n - 1);
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: U.uTime, uP1: U.uP1, uP2: U.uP2, uStrength: { value: 0 }, uStrain: { value: 0 } },
      vertexShader: `attribute float aT; attribute float aSide; varying float vT; varying float vS;
        void main(){ vT = aT; vS = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime, uStrength, uStrain; uniform vec3 uP1, uP2; varying float vT; varying float vS;
        void main(){
          vec3 c = mix(uP1, uP2, vT);
          c = mix(c, vec3(1.0, 0.35, 0.25), uStrain * 0.7);
          float core = exp(-vS * vS * 5.0);
          float pulse = 0.55 + 0.45 * sin(vT * 38.0 - uTime * 9.0);
          float a = core * (0.55 + uStrength * (0.8 + 1.2 * pulse));
          gl_FragColor = vec4(c * a * 1.6, a);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.vis = 0;
  }

  update(a, b, camera, { visible, weaving, strain, height }, dt) {
    this.vis += ((visible ? 1 : 0) - this.vis) * Math.min(1, dt * 6);
    this.mesh.visible = this.vis > 0.01;
    if (!this.mesh.visible) return;
    const s = this.mat.uniforms.uStrength;
    s.value += ((weaving ? 1 : 0.25) * this.vis - s.value) * Math.min(1, dt * 8);
    this.mat.uniforms.uStrain.value = strain;
    const n = this.n;
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const sag = Math.max(0.3, (1 - strain) * dist * 0.06);
    const cam = camera.position;
    const time = U.uTime.value;
    const w = (weaving ? 0.32 : 0.16) * (0.6 + this.vis * 0.4);
    let px = a.x;
    let py = a.y;
    let pz = a.z;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let x = a.x + (b.x - a.x) * t;
      let z = a.z + (b.z - a.z) * t;
      let y = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag;
      y = Math.max(y, height(x, z) + 0.35);
      const wob = Math.sin(t * Math.PI) * (0.25 + (weaving ? 0.15 : 0));
      x += Math.sin(t * 9 + time * 2.3) * wob * 0.6;
      y += Math.sin(t * 7 - time * 3.1) * wob * 0.5;
      z += Math.cos(t * 8 + time * 1.9) * wob * 0.6;
      // Seitenvektor: quer zur Linie und zur Kamera
      let tx = x - px;
      let ty = y - py;
      let tz = z - pz;
      if (i === 0) {
        tx = b.x - a.x;
        ty = b.y - a.y;
        tz = b.z - a.z;
      }
      const vx = cam.x - x;
      const vy = cam.y - y;
      const vz = cam.z - z;
      let sx = ty * vz - tz * vy;
      let sy = tz * vx - tx * vz;
      let sz = tx * vy - ty * vx;
      const l = Math.hypot(sx, sy, sz) || 1;
      sx = (sx / l) * w;
      sy = (sy / l) * w;
      sz = (sz / l) * w;
      const o = i * 6;
      this.pos[o] = x - sx;
      this.pos[o + 1] = y - sy;
      this.pos[o + 2] = z - sz;
      this.pos[o + 3] = x + sx;
      this.pos[o + 4] = y + sy;
      this.pos[o + 5] = z + sz;
      px = x;
      py = y;
      pz = z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

// Partikeleffekte: Dampf über heißem Käse, Tropfen/Krümel beim Reißen, Spritzer im Glas.
import * as THREE from 'three';
import { softDotTexture } from './textures.js';

const STEAM_MAX = 500;
const BITS_MAX = 220;

const steamVertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const steamFragment = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vec3(1.0, 0.98, 0.94), t.a * vAlpha);
  }
`;

export class Effects {
  constructor(scene, renderer) {
    this.renderer = renderer;
    // Dampf
    this.steam = Array.from({ length: STEAM_MAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, size: 0, a: 0 }));
    this.steamCursor = 0;
    const geo = new THREE.BufferGeometry();
    this.steamPos = new Float32Array(STEAM_MAX * 3);
    this.steamSize = new Float32Array(STEAM_MAX);
    this.steamAlpha = new Float32Array(STEAM_MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.steamPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.steamSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.steamAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.steamMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: softDotTexture() }, uScale: { value: 400 } },
      vertexShader: steamVertex,
      fragmentShader: steamFragment,
      transparent: true,
      depthWrite: false,
    });
    this.steamPoints = new THREE.Points(geo, this.steamMat);
    this.steamPoints.frustumCulled = false;
    this.steamPoints.renderOrder = 10;
    scene.add(this.steamPoints);

    // Tropfen, Krümel, Spritzer
    this.bits = Array.from({ length: BITS_MAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, spin: 0, rot: 0, kind: 0 }));
    this.bitCursor = 0;
    this.bitMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.6 }),
      BITS_MAX,
    );
    this.bitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bitMesh.castShadow = true;
    this.bitMesh.frustumCulled = false;
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < BITS_MAX; i++) this.bitMesh.setColorAt(i, white);
    scene.add(this.bitMesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  resize(heightPx) {
    this.steamMat.uniforms.uScale.value = heightPx * this.renderer.getPixelRatio() * 0.9;
  }

  spawnSteam(x, y, strength) {
    const p = this.steam[this.steamCursor];
    this.steamCursor = (this.steamCursor + 1) % STEAM_MAX;
    p.life = 0;
    p.max = 1.1 + Math.random() * 0.9;
    p.x = x + (Math.random() - 0.5) * 0.1;
    p.y = y + 0.05;
    p.z = (Math.random() - 0.3) * 0.3;
    p.vx = (Math.random() - 0.5) * 0.25;
    p.vy = 0.45 + Math.random() * 0.45;
    p.size = 0.2 + Math.random() * 0.15;
    p.a = 0.18 + strength * 0.22;
  }

  burst(x, y, kind, count, opts = {}) {
    // kind 0: warmer Käsetropfen, 1: kalter Krümel, 2: Martini-Spritzer
    for (let i = 0; i < count; i++) {
      const idx = this.bitCursor;
      const b = this.bits[idx];
      this.bitCursor = (idx + 1) % BITS_MAX;
      const ang = Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 2.2) * (0.4 + Math.random());
      b.life = 0;
      b.max = 0.9 + Math.random() * 0.8;
      b.x = x;
      b.y = y;
      b.z = (Math.random() - 0.5) * 0.2;
      b.vx = Math.cos(ang) * sp * 0.8;
      b.vy = Math.abs(Math.sin(ang)) * sp + (opts.up ?? 0.8);
      b.vz = (Math.random() - 0.5) * sp * 0.6;
      b.s = (kind === 2 ? 0.035 : kind === 1 ? 0.045 : 0.04) * (0.6 + Math.random() * 0.8);
      b.spin = (Math.random() - 0.5) * 20;
      b.rot = Math.random() * 6;
      b.kind = kind;
      const color = kind === 2 ? '#e9f3d6' : kind === 1 ? '#efc160' : '#fff1cc';
      this.bitMesh.setColorAt(idx, this._c.set(color));
    }
    this.bitMesh.instanceColor.needsUpdate = true;
  }

  update(dt, world) {
    // Dampf entsteht entlang heißer Fäden
    if (world) {
      for (const s of world.strands) {
        if (s.T < 0.12) continue;
        const len = s.totalRest();
        const rate = 7 * s.T * s.T * len;
        const n = rate * dt;
        const count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
        for (let c = 0; c < count; c++) {
          const i = Math.floor(Math.random() * (s.particles.length - 1));
          const a = s.particles[i];
          const b = s.particles[i + 1];
          const t = Math.random();
          this.spawnSteam(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, s.T);
        }
      }
    }
    for (let i = 0; i < STEAM_MAX; i++) {
      const p = this.steam[i];
      if (p.life >= p.max) {
        this.steamAlpha[i] = 0;
        continue;
      }
      p.life += dt;
      const t = p.life / p.max;
      p.x += p.vx * dt + Math.sin(p.life * 3 + i) * 0.003;
      p.y += p.vy * dt;
      p.vy *= 1 - dt * 0.4;
      this.steamPos[i * 3] = p.x;
      this.steamPos[i * 3 + 1] = p.y;
      this.steamPos[i * 3 + 2] = p.z;
      this.steamSize[i] = p.size * (1 + t * 2.2);
      this.steamAlpha[i] = p.a * Math.sin(Math.PI * Math.min(1, t)) * (1 - t * 0.3);
    }
    const g = this.steamPoints.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;

    for (let i = 0; i < BITS_MAX; i++) {
      const b = this.bits[i];
      let scale = 0;
      if (b.life < b.max) {
        b.life += dt;
        b.vy -= 18 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.rot += b.spin * dt;
        scale = b.s * Math.min(1, (b.max - b.life) * 4);
      }
      this._e.set(b.rot, b.rot * 0.7, 0);
      this._q.setFromEuler(this._e);
      const squash = b.kind === 1 ? 0.7 : 1;
      this._s.set(scale, scale * squash, scale);
      this._m.compose(this._v.set(b.x, b.y, b.z), this._q, this._s);
      this.bitMesh.setMatrixAt(i, this._m);
    }
    this.bitMesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const p of this.steam) p.life = p.max;
    for (const b of this.bits) b.life = b.max;
  }
}

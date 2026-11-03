// Effekte: Geschosse, Partikel, Strahlen/Blitze, Ringe, Lichtblitze, Brandfelder, Meteore.
import * as THREE from 'three';
import { DAMAGE_TYPES, ENEMIES } from '../game/data.js';

const P_MAX = 4000;

class Particles {
  constructor(parent, additive = true) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(P_MAX * 3);
    this.col = new Float32Array(P_MAX * 3);
    this.size = new Float32Array(P_MAX);
    this.alpha = new Float32Array(P_MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        uniform float scale;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float a = 1.0 - smoothstep(0.0, 1.0, d);
          a *= a;
          if (a * vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor, a * vAlpha);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
    parent.add(this.points);
    this.list = [];
  }

  emit(x, y, z, vx, vy, vz, color, size, life, o = {}) {
    if (this.list.length >= P_MAX) this.list.shift();
    this.list.push({ x, y, z, vx, vy, vz, r: color.r, g: color.g, b: color.b, size, life, max: life, grav: o.grav ?? 0, drag: o.drag ?? 1.5, grow: o.grow ?? 0, fade: o.fade ?? 1 });
  }

  update(dt) {
    let n = 0;
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr;
      p.vz *= dr;
      p.vy = p.vy * dr - p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02 && p.grav > 0) ((p.y = 0.02), (p.vy *= -0.3));
      p.size += p.grow * dt;
      L[n++] = p;
      const k = n - 1;
      this.pos[k * 3] = p.x;
      this.pos[k * 3 + 1] = p.y;
      this.pos[k * 3 + 2] = p.z;
      this.col[k * 3] = p.r;
      this.col[k * 3 + 1] = p.g;
      this.col[k * 3 + 2] = p.b;
      this.size[k] = p.size;
      const f = p.life / p.max;
      this.alpha[k] = p.fade === 1 ? f : Math.min(1, f * 3) * Math.min(1, (1 - f) * 6 + 0.2);
    }
    L.length = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const a of ['position', 'color', 'size', 'alpha']) g.attributes[a].needsUpdate = true;
  }

  clear() {
    this.list.length = 0;
  }
}

// Instanzierte, additive Effektformen mit Lebensdauer
class Pool {
  constructor(parent, geo, max, opts = {}) {
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, ...opts }), max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 11;
    this.max = max;
    parent.add(this.mesh);
    this.items = [];
    this.c = new THREE.Color();
  }
  add(item) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(item);
  }
}

const COL = {};
const col = (hex, k = 1) => {
  const key = hex + k;
  return COL[key] || (COL[key] = new THREE.Color(hex).multiplyScalar(k));
};

export class Fx {
  constructor(board, towers, enemies) {
    this.board = board;
    this.towers = towers;
    this.enemies = enemies;
    this.group = new THREE.Group();
    board.stage.scene.add(this.group);
    this.glow = new Particles(this.group, true);
    this.smoke = new Particles(this.group, false);

    // Geschosse
    this.proj = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), 800);
    this.proj.frustumCulled = false;
    this.proj.count = 0;
    this.group.add(this.proj);
    this.shells = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: '#2b2f38', roughness: 0.4, metalness: 0.5 }), 300);
    this.shells.frustumCulled = false;
    this.shells.castShadow = true;
    this.shells.count = 0;
    this.group.add(this.shells);
    const mg = new THREE.CylinderGeometry(0.35, 0.5, 2.6, 8);
    mg.rotateZ(-Math.PI / 2);
    this.missiles = new THREE.InstancedMesh(mg, new THREE.MeshStandardMaterial({ color: '#f2eee6', roughness: 0.4 }), 400);
    this.missiles.frustumCulled = false;
    this.missiles.count = 0;
    this.group.add(this.missiles);

    // Strahlen/Blitze als gestreckte Zylinder
    const seg = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    seg.translate(0, 0.5, 0);
    this.segs = new Pool(this.group, seg, 1200);
    const ring = new THREE.RingGeometry(0.86, 1, 48);
    ring.rotateX(-Math.PI / 2);
    this.rings = new Pool(this.group, ring, 200);
    this.flashes = new Pool(this.group, new THREE.SphereGeometry(1, 16, 12), 150);
    this.cones = new Pool(this.group, new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), 120, { opacity: 0.5 });

    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.tmpC = new THREE.Color();
    this.time = 0;
    this.lastP = new Map();
  }

  clear() {
    this.glow.clear();
    this.smoke.clear();
    for (const p of [this.segs, this.rings, this.flashes, this.cones]) p.items.length = 0;
  }

  wx(x) {
    return this.board.wx(x);
  }
  wz(y) {
    return this.board.wz(y);
  }

  // Ereignisse aus der Simulation in Effekte übersetzen
  handle(e, game) {
    const G = this.glow;
    const r = Math.random;
    switch (e.type) {
      case 'hit': {
        const c = col(DAMAGE_TYPES[e.dmgType]?.color || '#ffffff', 1.4);
        const y = 0.35;
        for (let i = 0; i < (e.crit ? 10 : 4); i++) G.emit(this.wx(e.x), y, this.wz(e.y), (r() - 0.5) * 2.4, r() * 1.6, (r() - 0.5) * 2.4, c, 0.06 + r() * 0.05, 0.25);
        break;
      }
      case 'explosion': {
        const c = col(DAMAGE_TYPES[e.dmgType]?.color || '#ffb35c', 1.6);
        const x = this.wx(e.x);
        const z = this.wz(e.y);
        const big = e.big ? 2 : 1;
        this.flashes.add({ x, y: 0.2, z, r0: e.r * 0.3, r1: e.r * 0.9, life: 0.25 * big, max: 0.25 * big, c: col(DAMAGE_TYPES[e.dmgType]?.color || '#ffb35c', 2.2) });
        this.rings.add({ x, y: 0.06, z, r0: 0.1, r1: e.r * 1.05, life: 0.4, max: 0.4, c });
        const n = Math.round(14 * e.r * big) + 6;
        for (let i = 0; i < n; i++) {
          const a = r() * Math.PI * 2;
          const sp = (1 + r() * 2.5) * e.r * big;
          G.emit(x, 0.15, z, Math.cos(a) * sp, 1 + r() * 2.5 * big, Math.sin(a) * sp, c, 0.08 + r() * 0.1, 0.35 + r() * 0.3, { grav: 4 });
        }
        if (e.dmgType === 'explosive') {
          for (let i = 0; i < 5 * big; i++) this.smoke.emit(x + (r() - 0.5) * e.r, 0.2, z + (r() - 0.5) * e.r, (r() - 0.5) * 0.4, 0.5 + r() * 0.5, (r() - 0.5) * 0.4, col('#5b5560'), 0.3 + r() * 0.25, 1 + r() * 0.6, { grow: 0.5, fade: 2 });
        }
        if (e.big) this.board.stage.shake = Math.max(this.board.stage.shake, 0.9);
        break;
      }
      case 'tracer': {
        const a = this.towers.muzzle(e.id, 0, this.v) || this.v.set(this.wx(e.x1), 0.8, this.wz(e.y1));
        const b = this.v2.set(this.wx(e.x2), 0.35, this.wz(e.y2));
        this.segs.add({ a: a.clone(), b: b.clone(), w: e.crit ? 0.045 : 0.03, life: 0.18, max: 0.18, c: col(e.crit ? '#fff1a8' : '#e4f1ff', 3) });
        for (let i = 0; i < 6; i++) G.emit(a.x, a.y, a.z, (r() - 0.5) * 1.5, r() * 1.2, (r() - 0.5) * 1.5, col('#fff1c8', 2), 0.08, 0.15);
        break;
      }
      case 'zap': {
        const pts = e.pts.map(([x, y], i) => (i === 0 ? (this.towers.muzzle(e.id, 0, new THREE.Vector3()) || new THREE.Vector3(this.wx(x), 0.9, this.wz(y))) : new THREE.Vector3(this.wx(x), 0.3, this.wz(y))));
        const c = col(e.stun ? '#ffffff' : '#c9a4ff', 3);
        for (let i = 0; i < pts.length - 1; i++) this.lightning(pts[i], pts[i + 1], c, 0.15);
        for (const p of pts.slice(1)) for (let k = 0; k < 4; k++) G.emit(p.x, p.y, p.z, (r() - 0.5) * 2, r() * 1.5, (r() - 0.5) * 2, c, 0.07, 0.2);
        break;
      }
      case 'pulse': {
        const x = this.wx(e.x);
        const z = this.wz(e.y);
        const t = game.towerAt.get(Math.floor(e.y) * game.map.W + Math.floor(e.x));
        const y = (t ? this.towerTop(t) : 0.3) + 0.02;
        this.rings.add({ x, y, z, r0: 0.2, r1: e.r, life: 0.5, max: 0.5, c: col('#9ae6ff', 0.9) });
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          G.emit(x + Math.cos(a) * 0.2, y + 0.1, z + Math.sin(a) * 0.2, Math.cos(a) * e.r * 1.6, 0.2, Math.sin(a) * e.r * 1.6, col('#c8f3ff', 1.4), 0.07, 0.45, { drag: 2.5 });
        }
        break;
      }
      case 'heal':
        this.rings.add({ x: this.wx(e.x), y: 0.08, z: this.wz(e.y), r0: 0.1, r1: e.r, life: 0.6, max: 0.6, c: col('#59d39a', 1.5) });
        break;
      case 'plague':
        this.rings.add({ x: this.wx(e.x), y: 0.08, z: this.wz(e.y), r0: 0.1, r1: e.r, life: 0.5, max: 0.5, c: col('#a6e85a', 1.6) });
        break;
      case 'death': {
        const x = this.wx(e.x);
        const z = this.wz(e.y);
        const y = e.flying ? 0.95 : 0.2;
        const c = this.tmpC.set(enemyColor(e.enemy)).multiplyScalar(1.3).clone();
        const n = e.boss ? 60 : 14;
        for (let i = 0; i < n; i++) {
          const a = r() * Math.PI * 2;
          const sp = 0.8 + r() * (e.boss ? 4 : 2);
          G.emit(x, y, z, Math.cos(a) * sp, 1 + r() * 2.5, Math.sin(a) * sp, c, 0.06 + r() * 0.08, 0.5 + r() * 0.4, { grav: 6, drag: 1 });
        }
        this.flashes.add({ x, y, z, r0: 0.1, r1: e.boss ? 1.2 : 0.35, life: 0.2, max: 0.2, c: col('#ffffff', 1.2) });
        if (e.boss) this.board.stage.shake = 1;
        break;
      }
      case 'spawn': {
        const idx = game.map.spawns.findIndex((s) => Math.abs(s.x + 0.5 - e.x) < 0.6 && Math.abs(s.y + 0.5 - e.y) < 0.6);
        if (idx >= 0) this.board.portalPulse(idx);
        break;
      }
      case 'leak': {
        this.board.leak();
        this.board.stage.shake = Math.max(this.board.stage.shake, 0.5);
        const b = game.map.base;
        const x = this.wx(b.x + 0.5);
        const z = this.wz(b.y + 0.5);
        this.rings.add({ x, y: 0.4, z, r0: 0.2, r1: 1.2, life: 0.5, max: 0.5, c: col('#ff4d6d', 2) });
        break;
      }
      case 'build':
      case 'upgrade':
      case 'module': {
        const x = this.wx(e.x);
        const z = this.wz(e.y);
        const t = game.towers.find((t) => t.id === e.id);
        const y = t ? this.towerTop(t) : 0.3;
        this.rings.add({ x, y: y + 0.02, z, r0: 0.2, r1: 0.6, life: 0.45, max: 0.45, c: col(e.type === 'build' ? '#ffffff' : '#ffe27a', 1.6) });
        for (let i = 0; i < 18; i++) {
          const a = r() * Math.PI * 2;
          G.emit(x + Math.cos(a) * 0.35, y + 0.05, z + Math.sin(a) * 0.35, 0, 1 + r() * 1.5, 0, col(e.type === 'build' ? '#ffffff' : '#ffd84d', 1.5), 0.06, 0.6, { drag: 2 });
        }
        break;
      }
      case 'rank': {
        const x = this.wx(e.x);
        const z = this.wz(e.y);
        for (let i = 0; i < 12; i++) G.emit(x + (r() - 0.5) * 0.4, 0.8, z + (r() - 0.5) * 0.4, (r() - 0.5) * 0.5, 1.2 + r(), (r() - 0.5) * 0.5, col('#b48cff', 2), 0.07, 0.8);
        break;
      }
      case 'sell': {
        const x = this.wx(e.x);
        const z = this.wz(e.y);
        for (let i = 0; i < 20; i++) G.emit(x + (r() - 0.5) * 0.5, 0.4, z + (r() - 0.5) * 0.5, (r() - 0.5), 1 + r(), (r() - 0.5), col('#ffd25e', 1.4), 0.06, 0.7, { grav: 2 });
        break;
      }
      case 'ability': {
        if (e.key === 'blizzard') {
          for (const en of game.enemies) this.flashes.add({ x: this.wx(en.x), y: 0.3, z: this.wz(en.y), r0: 0.2, r1: 0.5, life: 0.4, max: 0.4, c: col('#9ae6ff', 1.2) });
          for (let i = 0; i < 300; i++) {
            const x = (r() - 0.5) * game.map.W;
            const z = (r() - 0.5) * game.map.H;
            G.emit(x, 2 + r() * 2, z, (r() - 0.5) * 0.5, -1.5 - r(), (r() - 0.5) * 0.5, col('#e6f8ff', 1.2), 0.06 + r() * 0.05, 1.5 + r(), { drag: 0.2 });
          }
        } else if (e.key === 'overdrive') {
          for (const t of game.towers) {
            this.rings.add({ x: this.wx(t.x), y: this.towerTop(t) + 0.05, z: this.wz(t.y), r0: 0.2, r1: 0.55, life: 0.6, max: 0.6, c: col('#ffd84d', 1.8) });
          }
        }
        break;
      }
      default:
    }
  }

  towerTop(t) {
    return t.tile === 'R' ? 0.55 : 0.3;
  }

  lightning(a, b, c, life) {
    const n = Math.max(2, Math.round(a.distanceTo(b) / 0.25));
    let prev = a.clone();
    for (let i = 1; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      if (i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.18));
      this.segs.add({ a: prev, b: p, w: 0.022, life, max: life, c });
      this.segs.add({ a: prev, b: p, w: 0.06, life: life * 0.7, max: life * 0.7, c: col('#7a5cff', 0.8) });
      prev = p;
    }
  }

  segMatrix(a, b, w) {
    const d = this.v.copy(b).sub(a);
    const len = d.length();
    this.q.setFromUnitVectors(this.up, d.normalize());
    return this.m4.compose(a, this.q, this.s.set(w, len, w));
  }

  update(dt, game) {
    if (dt <= 0) return; // Pause: alles bleibt, wie es ist
    this.time += dt;
    const G = this.glow;
    const r = Math.random;
    const { m4, v, s, q } = this;

    // Dauerstrahlen und Flammen direkt aus dem Turmzustand
    for (const t of game.towers) {
      if (!t.beam) continue;
      const mz = this.towers.muzzle(t.id, 0, new THREE.Vector3());
      if (!mz) continue;
      if (t.beam.kind === 'beam') {
        const k = 0.5 + t.beam.mult * 0.9;
        t.beam.list.forEach((e, i) => {
          if (!e.alive) return;
          const from = i === 0 ? mz : this.enemies.worldPos(t.beam.list[0], new THREE.Vector3());
          const to = this.enemies.worldPos(e, new THREE.Vector3());
          const w = (i === 0 ? 0.035 : 0.02) * (0.7 + t.beam.mult * 0.8) * (1 + Math.sin(this.time * 40) * 0.12);
          this.segs.add({ a: from, b: to, w, life: dt * 1.01, max: dt, c: col('#ffffff', 1.5 + k) });
          this.segs.add({ a: from, b: to, w: w * 2.6, life: dt * 1.01, max: dt, c: col('#d0459b', 0.9 + k) });
          if (r() < 0.6) G.emit(to.x, to.y, to.z, (r() - 0.5) * 1.5, r() * 1.2, (r() - 0.5) * 1.5, col('#ff9be0', 1.6), 0.06 + 0.04 * t.beam.mult, 0.25);
        });
      } else if (t.beam.kind === 'cone') {
        const half = ((t.beam.cone / 2) * Math.PI) / 180;
        const n = Math.ceil(dt * 120);
        for (let i = 0; i < n; i++) {
          const a = t.aim + (r() - 0.5) * 2 * half * 0.85;
          const sp = t.beam.range * (1.6 + r() * 0.6);
          const hot = r() < 0.5;
          G.emit(mz.x, mz.y, mz.z, Math.cos(a) * sp, (r() - 0.3) * 0.5, Math.sin(a) * sp, col(hot ? '#ffd27a' : '#ff6a2a', hot ? 1.6 : 1.3), 0.07 + r() * 0.05, 0.42 + r() * 0.12, { drag: 1.6, grow: 0.5 });
        }
        if (r() < 0.3) this.smoke.emit(mz.x, mz.y + 0.1, mz.z, Math.cos(t.aim) * 0.8, 0.6, Math.sin(t.aim) * 0.8, col('#4a4246'), 0.18, 0.9, { grow: 0.4, fade: 2 });
      }
    }

    // Brandfelder
    for (const f of game.fields) {
      if (r() < dt * 30 * f.r) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * f.r;
        G.emit(this.wx(f.x) + Math.cos(a) * d, 0.05, this.wz(f.y) + Math.sin(a) * d, 0, 0.6 + r() * 0.8, 0, col(r() < 0.5 ? '#ff8a3d' : '#ffd27a', 1.4), 0.08 + r() * 0.06, 0.5, { drag: 1 });
      }
      this.cones.add({ x: this.wx(f.x), y: 0.025, z: this.wz(f.y), r0: f.r, r1: f.r, life: dt * 1.01, max: dt, c: col('#ff5a1f', 0.35 * Math.min(1, f.t)) });
    }

    // Meteore im Anflug
    for (const m of game.meteors) {
      const h = m.t * 9;
      const x = this.wx(m.x) - m.t * 3;
      const z = this.wz(m.y);
      this.flashes.add({ x, y: h, z, r0: 0.28, r1: 0.28, life: dt * 1.01, max: dt, c: col('#ffb35c', 2.5) });
      for (let i = 0; i < 6; i++) G.emit(x + (r() - 0.5) * 0.2, h, z + (r() - 0.5) * 0.2, 1.5 + r(), 2 + r(), (r() - 0.5), col('#ff8a3d', 1.6), 0.18 + r() * 0.1, 0.4, { grow: 0.3 });
      this.rings.add({ x: this.wx(m.x), y: 0.05, z, r0: 1.6, r1: 1.6, life: dt * 1.01, max: dt, c: col('#ff8a3d', 0.8) });
    }

    // Geschosse
    let np = 0;
    let ns = 0;
    let nm = 0;
    for (const p of game.projectiles) {
      if (!p.alive) continue;
      const x = this.wx(p.x);
      const z = this.wz(p.y);
      if (p.kind === 'bolt') {
        const ty = p.target.flying ? 0.95 : 0.3;
        const dist = Math.hypot(p.target.x - p.x, p.target.y - p.y);
        const y = ty + Math.min(1, dist / 2) * 0.35;
        const ang = Math.atan2(p.target.y - p.y, p.target.x - p.x);
        q.setFromAxisAngle(this.up, -ang);
        m4.compose(v.set(x, y, z), q, s.set(0.11, 0.035, 0.035));
        this.proj.setColorAt(np, col(p.crit ? '#fff1a8' : '#7ff5e4', 3));
        this.proj.setMatrixAt(np++, m4);
      } else if (p.kind === 'shell' || p.kind === 'bomblet') {
        const y = 0.6 + (p.h || 0) * 1.4;
        m4.compose(v.set(x, y, z), q.identity(), s.setScalar(p.kind === 'shell' ? 0.075 : 0.045));
        this.shells.setMatrixAt(ns++, m4);
        if (r() < 0.5) G.emit(x, y, z, 0, 0, 0, col('#ffb35c', 1.4), 0.07, 0.25);
      } else if (p.kind === 'glob') {
        const y = 0.5 + (p.h || 0) * 1.2;
        m4.compose(v.set(x, y, z), q.identity(), s.setScalar(0.07));
        this.proj.setColorAt(np, col('#a6e85a', 2));
        this.proj.setMatrixAt(np++, m4);
        if (r() < 0.4) G.emit(x, y, z, 0, -0.3, 0, col('#a6e85a', 1.2), 0.05, 0.3);
      } else if (p.kind === 'missile') {
        if (p.delay > 0) continue;
        const y = 0.65 + Math.min(0.4, (4 - p.life) * 0.6) * (p.target?.flying ? 1 : 0.6);
        const ang = Math.atan2(p.vy, p.vx);
        q.setFromAxisAngle(this.up, -ang);
        const sc = p.splash > 1 ? 0.07 : 0.045;
        m4.compose(v.set(x, y, z), q, s.setScalar(sc));
        this.missiles.setMatrixAt(nm++, m4);
        const bx = x - Math.cos(ang) * sc * 1.4;
        const bz = z - Math.sin(ang) * sc * 1.4;
        G.emit(bx, y, bz, 0, 0, 0, col('#fff07a', 2), 0.07, 0.12);
        if (r() < 0.7) this.smoke.emit(bx, y, bz, (r() - 0.5) * 0.2, 0.15, (r() - 0.5) * 0.2, col('#d8d2cc'), 0.06, 0.7, { grow: 0.35, fade: 2 });
      }
    }
    this.proj.count = np;
    this.proj.instanceMatrix.needsUpdate = true;
    if (this.proj.instanceColor) this.proj.instanceColor.needsUpdate = true;
    this.shells.count = ns;
    this.shells.instanceMatrix.needsUpdate = true;
    this.missiles.count = nm;
    this.missiles.instanceMatrix.needsUpdate = true;

    // Brennende/vergiftete Gegner qualmen
    for (const e of game.enemies) {
      if (e.burnT > 0 && r() < dt * 14) G.emit(this.wx(e.x) + (r() - 0.5) * 0.15, 0.3, this.wz(e.y) + (r() - 0.5) * 0.15, 0, 0.8, 0, col('#ff8a3d', 1.4), 0.06, 0.4);
      if (e.poisonT > 0 && r() < dt * 8) G.emit(this.wx(e.x), 0.35, this.wz(e.y), (r() - 0.5) * 0.2, 0.4, (r() - 0.5) * 0.2, col('#a6e85a', 1), 0.05, 0.6);
      if (e.freezeT > 0 && r() < dt * 6) G.emit(this.wx(e.x), 0.4, this.wz(e.y), 0, 0.2, 0, col('#e6f8ff', 1.4), 0.05, 0.5);
    }

    // Pools
    this.updatePool(this.segs, dt, (it) => this.segMatrix(it.a, it.b, it.w * (it.life / it.max) ** 0.5));
    this.updatePool(this.rings, dt, (it) => {
      const k = 1 - it.life / it.max;
      const rr = it.r0 + (it.r1 - it.r0) * (1 - (1 - k) ** 3);
      return m4.compose(v.set(it.x, it.y, it.z), q.identity(), s.set(rr, 1, rr));
    });
    this.updatePool(this.flashes, dt, (it) => {
      const k = 1 - it.life / it.max;
      const rr = it.r0 + (it.r1 - it.r0) * k;
      return m4.compose(v.set(it.x, it.y, it.z), q.identity(), s.setScalar(rr));
    });
    this.updatePool(this.cones, dt, (it) => m4.compose(v.set(it.x, it.y, it.z), q.identity(), s.set(it.r1, 1, it.r1)));

    this.glow.update(dt);
    this.smoke.update(dt);
  }

  updatePool(pool, dt, matrixOf) {
    let n = 0;
    const L = pool.items;
    for (let i = 0; i < L.length; i++) {
      const it = L[i];
      it.life -= dt;
      if (it.life <= 0) continue;
      L[n++] = it;
      pool.mesh.setMatrixAt(n - 1, matrixOf(it));
      const f = it.life / it.max;
      pool.mesh.setColorAt(n - 1, pool.c.copy(it.c).multiplyScalar(f));
    }
    L.length = n;
    pool.mesh.count = n;
    pool.mesh.instanceMatrix.needsUpdate = true;
    if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
  }

  setScale(h) {
    for (const p of [this.glow, this.smoke]) p.points.material.uniforms.scale.value = h * 0.9;
  }
}

const ENEMY_COLORS = {};
function enemyColor(type) {
  return (ENEMY_COLORS[type] ||= ENEMIES[type]?.color || '#ffffff');
}

// Gegner als instanzierte Meshes je Art – hunderte Einheiten bei wenigen Draw-Calls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ENEMIES } from '../game/data.js';

const MAX = 600;

export function shapeFor(type) {
  switch (type) {
    case 'runner': {
      const g = new THREE.ConeGeometry(0.75, 2, 8);
      g.rotateZ(-Math.PI / 2);
      g.scale(1, 0.8, 1);
      return { geo: g, flat: false, eyes: [0.25, 0.25, 0.32] };
    }
    case 'brute':
      return { geo: new RoundedBoxGeometry(1.7, 1.25, 1.5, 2, 0.3), flat: false, eyes: [0.86, 0.15, 0.32] };
    case 'glider': {
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(1.3, 0.38, 1.1);
      return { geo: g, flat: true, eyes: [0.7, 0.05, 0.28] };
    }
    case 'splitter':
      return { geo: new THREE.IcosahedronGeometry(1, 0), flat: true, eyes: [0.8, 0.2, 0.3] };
    case 'shard':
      return { geo: new THREE.TetrahedronGeometry(1.2, 0), flat: true };
    case 'mender':
      return { geo: new THREE.SphereGeometry(1, 18, 12), flat: false, eyes: [0.88, 0.2, 0.3] };
    case 'warden':
      return { geo: new THREE.DodecahedronGeometry(1, 0), flat: true, eyes: [0.86, 0.2, 0.3] };
    case 'icebreaker': {
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(1.15, 1.25, 1.15);
      return { geo: g, flat: true, eyes: [0.66, 0.25, 0.25] };
    }
    case 'colossus':
      return { geo: new THREE.DodecahedronGeometry(1, 1).scale(1.15, 0.95, 1.1), flat: true, eyes: [1.0, 0.2, 0.35] };
    case 'brood':
      return { geo: new THREE.IcosahedronGeometry(1, 1), flat: true, eyes: [0.95, 0.25, 0.3] };
    case 'broodling':
      return { geo: new THREE.SphereGeometry(1, 10, 8), flat: false };
    default:
      return { geo: new THREE.SphereGeometry(1, 20, 14), flat: false, eyes: [0.86, 0.22, 0.32] };
  }
}

export class EnemyViews {
  constructor(board) {
    this.board = board;
    this.group = new THREE.Group();
    board.stage.scene.add(this.group);
    this.meshes = {};
    this.shapes = {};
    for (const type of Object.keys(ENEMIES)) {
      const s = shapeFor(type);
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.38, metalness: 0.05, flatShading: s.flat });
      const m = new THREE.InstancedMesh(s.geo, mat, MAX);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
      this.meshes[type] = m;
      this.shapes[type] = s;
    }
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#1b1d26', roughness: 0.2 });
    this.eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), eyeMat, MAX * 2);
    this.eyes.frustumCulled = false;
    this.eyeWhites = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), MAX * 2);
    this.eyeWhites.frustumCulled = false;
    this.shields = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshStandardMaterial({ color: '#8fc4ff', emissive: '#4f8df5', emissiveIntensity: 0.9, transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.1 }),
      MAX,
    );
    this.shields.frustumCulled = false;
    this.halos = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.12, 6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#59d39a').multiplyScalar(1.8), toneMapped: false }), MAX);
    this.halos.frustumCulled = false;
    this.shadows = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }),
      MAX,
    );
    this.shadows.frustumCulled = false;
    this.group.add(this.eyes, this.eyeWhites, this.shields, this.halos, this.shadows);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
    this.time = 0;
    this.yaw = new Map();
    this.spawnAge = new Map();
  }

  // Höhe des Körpermittelpunkts über dem Boden
  height(e, t) {
    const size = e.def.size * 1.2;
    if (e.flying) return 0.95 + Math.sin(t * 3 + e.id) * 0.06;
    let bob = 0;
    if (e.type === 'walker' || e.type === 'broodling' || e.type === 'shard') bob = Math.abs(Math.sin(t * 9 + e.id)) * size * 0.35;
    if (e.freezeT > 0) bob = 0;
    return size * (e.type === 'brute' ? 0.66 : e.type === 'runner' ? 0.8 : 1) + 0.03 + bob;
  }

  update(dt, game) {
    this.time += dt;
    const t = this.time;
    const counts = {};
    for (const k in this.meshes) counts[k] = 0;
    let eyes = 0;
    let shields = 0;
    let halos = 0;
    let shadows = 0;
    const { m4, q, v, s, c } = this;
    const up = new THREE.Vector3(0, 1, 0);
    const seen = new Set();
    for (const e of game.enemies) {
      if (!e.alive) continue;
      seen.add(e.id);
      const mesh = this.meshes[e.type];
      const i = counts[e.type]++;
      if (i >= MAX) continue;
      const size = e.def.size;
      const x = this.board.wx(e.x);
      const z = this.board.wz(e.y);
      const y = this.height(e, t);
      // Blickrichtung weich nachführen
      const want = -Math.atan2(e.dy, e.dx);
      let yaw = this.yaw.get(e.id);
      if (yaw == null) yaw = want;
      let d = want - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * Math.min(1, dt * 10);
      this.yaw.set(e.id, yaw);
      let age = (this.spawnAge.get(e.id) || 0) + dt;
      this.spawnAge.set(e.id, age);
      const grow = Math.min(1, age * 3);
      let squash = 1;
      if (e.type === 'walker' || e.type === 'broodling') squash = 1 - Math.abs(Math.cos(t * 9 + e.id)) * 0.12;
      if (e.freezeT > 0) squash = 1;
      q.setFromAxisAngle(up, yaw);
      if (e.type === 'splitter' || e.type === 'shard') q.multiply(new THREE.Quaternion().setFromAxisAngle(v.set(0, 0, 1), -t * 4 - e.id));
      if (e.flying) q.multiply(new THREE.Quaternion().setFromAxisAngle(v.set(1, 0, 0), Math.sin(t * 2 + e.id) * 0.15));
      const sz = size * grow * 1.2;
      m4.compose(v.set(x, y, z), q, s.set(sz, sz * squash, sz));
      mesh.setMatrixAt(i, m4);
      // Farbe: Treffer blitzen weiß, Statuseffekte färben
      c.set(e.def.color);
      if (e.freezeT > 0) c.lerp(this.tint('#bfefff'), 0.65);
      else if (e.slowT > 0) c.lerp(this.tint('#9ad8ff'), 0.35);
      if (e.burnT > 0) c.lerp(this.tint('#ff7a2a'), 0.25 + Math.sin(t * 20 + e.id) * 0.1);
      if (e.poisonT > 0) c.lerp(this.tint('#9be35a'), 0.3);
      if (e.hitT > 0) c.lerp(this.tint('#ffffff'), Math.min(1, e.hitT * 8) * 0.7);
      mesh.setColorAt(i, c);

      const shape = this.shapes[e.type];
      if (shape.eyes && eyes < MAX * 2 - 2) {
        const [fx, fy, fz] = shape.eyes;
        for (const side of [-1, 1]) {
          const local = v.set(fx, fy, fz * side).applyQuaternion(q).multiplyScalar(sz);
          m4.compose(local.add(s.set(x, y, z)), q, s.set(sz * 0.2, sz * 0.24, sz * 0.2));
          this.eyeWhites.setMatrixAt(eyes, m4);
          const local2 = v.set(fx + 0.12, fy, fz * side).applyQuaternion(q).multiplyScalar(sz);
          m4.compose(local2.add(s.set(x, y, z)), q, s.set(sz * 0.11, sz * 0.14, sz * 0.11));
          this.eyes.setMatrixAt(eyes, m4);
          eyes++;
        }
      }
      if (e.maxShield > 0 && e.shield > 0) {
        const f = 0.5 + 0.5 * (e.shield / e.maxShield);
        m4.compose(v.set(x, y, z), q.identity(), s.setScalar(sz * 1.6 * f));
        this.shields.setMatrixAt(shields++, m4);
      }
      if (e.def.heal) {
        q.setFromAxisAngle(v.set(1, 0, 0), Math.PI / 2);
        const pulse = 1 + Math.sin(t * 4 + e.id) * 0.08;
        m4.compose(v.set(x, y, z), q, s.setScalar(sz * 1.45 * pulse));
        this.halos.setMatrixAt(halos++, m4);
      }
      if (e.flying) {
        m4.compose(v.set(x, 0.03, z), q.identity(), s.setScalar(sz * 1.1));
        this.shadows.setMatrixAt(shadows++, m4);
      }
    }
    for (const k in this.meshes) {
      const m = this.meshes[k];
      m.count = Math.min(MAX, counts[k]);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.eyes.count = this.eyeWhites.count = eyes;
    this.eyes.instanceMatrix.needsUpdate = this.eyeWhites.instanceMatrix.needsUpdate = true;
    this.shields.count = shields;
    this.shields.instanceMatrix.needsUpdate = true;
    this.halos.count = halos;
    this.halos.instanceMatrix.needsUpdate = true;
    this.shadows.count = shadows;
    this.shadows.instanceMatrix.needsUpdate = true;
    if (this.yaw.size > seen.size + 50) {
      for (const id of this.yaw.keys()) if (!seen.has(id)) (this.yaw.delete(id), this.spawnAge.delete(id));
    }
  }

  tint(hex) {
    return (this._tints ||= new Map()).get(hex) || this._tints.set(hex, new THREE.Color(hex)).get(hex);
  }

  worldPos(e, out) {
    return out.set(this.board.wx(e.x), this.height(e, this.time), this.board.wz(e.y));
  }

  clear() {
    for (const k in this.meshes) this.meshes[k].count = 0;
    this.yaw.clear();
    this.spawnAge.clear();
  }
}

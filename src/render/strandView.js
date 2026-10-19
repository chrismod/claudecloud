// Rendert Käsefäden als Röhren mit variablem Radius entlang der Partikelkette.
import * as THREE from 'three';
import { setness } from '../physics/material.js';

const RADIAL = 12;
const VISUAL_SCALE = 1.25; // Fäden etwas dicker zeichnen als ihr Kollisionsradius
const SUB = 3; // Catmull-Rom-Unterteilungen je Segment

const HOT_COLOR = new THREE.Color('#fff2d2');
const COLD_COLOR = new THREE.Color('#f1c153');
const HOT_SHEEN = new THREE.Color('#fff2c4');
const GLOW = new THREE.Color('#ff9440');

const capGeometry = new THREE.SphereGeometry(1, 16, 12);

class StrandMesh {
  constructor(fiberTex) {
    this.capacity = 0;
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.MeshPhysicalMaterial({
      color: HOT_COLOR.clone(),
      roughness: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.3,
      sheen: 1,
      sheenColor: HOT_SHEEN.clone(),
      sheenRoughness: 0.45,
      bumpMap: fiberTex,
      bumpScale: 0.6,
      emissive: GLOW.clone(),
      emissiveIntensity: 0.1,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.caps = [new THREE.Mesh(capGeometry, this.material), new THREE.Mesh(capGeometry, this.material)];
    this.group = new THREE.Group();
    this.group.add(this.mesh, ...this.caps);
    for (const c of this.caps) c.castShadow = true;
  }

  ensure(rings) {
    if (rings <= this.capacity) return;
    const cap = Math.max(rings, Math.ceil(this.capacity * 1.5), 64);
    const verts = cap * (RADIAL + 1);
    this.positions = new Float32Array(verts * 3);
    this.normals = new Float32Array(verts * 3);
    this.uvs = new Float32Array(verts * 2);
    const idx = new Uint32Array((cap - 1) * RADIAL * 6);
    let k = 0;
    for (let r = 0; r < cap - 1; r++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = r * (RADIAL + 1) + j;
        const b = a + RADIAL + 1;
        idx[k++] = a;
        idx[k++] = a + 1;
        idx[k++] = b;
        idx[k++] = a + 1;
        idx[k++] = b + 1;
        idx[k++] = b;
      }
    }
    const g = this.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.capacity = cap;
  }

  update(strand) {
    const p = strand.particles;
    const n = p.length;
    if (n < 2) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // Radius je Partikel aus den angrenzenden Segmenten
    const segR = new Float32Array(n - 1);
    for (let i = 0; i < n - 1; i++) segR[i] = strand.segmentRadius(i) * VISUAL_SCALE;
    const partR = (i) => {
      if (i <= 0) return segR[0];
      if (i >= n - 1) return segR[n - 2];
      return (segR[i - 1] + segR[i]) * 0.5;
    };

    const rings = (n - 1) * SUB + 1;
    this.ensure(rings);
    const cx = new Float32Array(rings);
    const cy = new Float32Array(rings);
    const cr = new Float32Array(rings);
    let r = 0;
    for (let i = 0; i < n - 1; i++) {
      const p0 = p[Math.max(0, i - 1)];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[Math.min(n - 1, i + 2)];
      const r1 = partR(i);
      const r2 = partR(i + 1);
      for (let k = 0; k < SUB; k++) {
        const t = k / SUB;
        const t2 = t * t;
        const t3 = t2 * t;
        cx[r] = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        cy[r] = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
        cr[r] = r1 + (r2 - r1) * t;
        r++;
      }
    }
    cx[r] = p[n - 1].x;
    cy[r] = p[n - 1].y;
    cr[r] = partR(n - 1);

    const pos = this.positions;
    const nor = this.normals;
    const uv = this.uvs;
    let arc = 0;
    for (let i = 0; i < rings; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(rings - 1, i + 1);
      let tx = cx[b] - cx[a];
      let ty = cy[b] - cy[a];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty;
      const ny = tx;
      if (i > 0) arc += Math.hypot(cx[i] - cx[i - 1], cy[i] - cy[i - 1]);
      const rad = cr[i];
      for (let j = 0; j <= RADIAL; j++) {
        const ang = (j / RADIAL) * Math.PI * 2;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const ox = nx * c;
        const oy = ny * c;
        const oz = s;
        const v = i * (RADIAL + 1) + j;
        pos[v * 3] = cx[i] + ox * rad;
        pos[v * 3 + 1] = cy[i] + oy * rad;
        pos[v * 3 + 2] = oz * rad;
        nor[v * 3] = ox;
        nor[v * 3 + 1] = oy;
        nor[v * 3 + 2] = oz;
        uv[v * 2] = arc / 0.7;
        uv[v * 2 + 1] = j / RADIAL;
      }
    }
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    g.setDrawRange(0, (rings - 1) * RADIAL * 6);

    // Endkappen: am Spieß ein kleiner Käseklecks, sonst abgerundetes Ende
    const ends = [p[0], p[n - 1]];
    const endR = [cr[0], cr[rings - 1]];
    for (let e = 0; e < 2; e++) {
      const q = ends[e];
      const glued = q.pin && q.pin.kind === 'anchor';
      const s = glued ? Math.max(endR[e] * 1.5, 0.1) : endR[e];
      this.caps[e].position.set(q.x, q.y, 0);
      this.caps[e].scale.set(s, s, glued ? s * 1.3 : s);
    }

    // Material folgt der Temperatur
    const set = setness(strand.T);
    const m = this.material;
    m.color.copy(HOT_COLOR).lerp(COLD_COLOR, set);
    m.roughness = 0.26 + set * 0.38;
    m.clearcoat = 0.85 * (1 - set);
    m.sheen = 1 - set * 0.7;
    m.emissiveIntensity = 0.13 * (1 - set) * (1 - set);
    m.bumpScale = 0.5 + set * 0.7;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class StrandView {
  constructor(scene, fiberTex) {
    this.scene = scene;
    this.fiberTex = fiberTex;
    this.meshes = new Map();
    this.pool = [];
  }

  sync(world) {
    const alive = new Set();
    for (const s of world.strands) {
      alive.add(s.id);
      let sm = this.meshes.get(s.id);
      if (!sm) {
        sm = this.pool.pop() || new StrandMesh(this.fiberTex);
        this.meshes.set(s.id, sm);
        this.scene.add(sm.group);
      }
      sm.update(s);
    }
    for (const [id, sm] of this.meshes) {
      if (alive.has(id)) continue;
      this.scene.remove(sm.group);
      this.meshes.delete(id);
      this.pool.push(sm);
    }
  }

  clear() {
    for (const sm of this.meshes.values()) {
      this.scene.remove(sm.group);
      this.pool.push(sm);
    }
    this.meshes.clear();
  }
}

// Tiere kehren in belebte Gebiete zurück: Hirsche (nachts mit leuchtenden Flecken), Hasen und
// Vogelschwärme. Sie meiden Wasser und fliehen vor der Fäulnis.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tube } from './geometries.js';
import { WATER } from '../config.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function colored(geo, fn) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), t);
    c.set([t.r, t.g, t.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const col = (hex) => {
  const c = new THREE.Color(hex);
  return (x, y, z, t) => t.copy(c);
};

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const SPOT = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 1.6), transparent: true, opacity: 0 });

// --- Modelle ------------------------------------------------------------------------------------
function deerParts(stag) {
  const fur = new THREE.Color('#8c5a32');
  const belly = new THREE.Color('#e8d6b8');
  const furFn = (x, y, z, t) => t.copy(fur).lerp(belly, Math.max(0, Math.min(1, (0.95 - y) * 3.5)));
  const body = new THREE.CapsuleGeometry(0.3, 0.75, 4, 10);
  body.rotateX(Math.PI / 2);
  body.scale(1, 1.05, 1);
  body.translate(0, 1.05, 0);
  const neck = tube([V(0, 1.15, 0.45), V(0, 1.5, 0.68), V(0, 1.72, 0.78)], [0.17, 0.13, 0.11], 8);
  const tail = new THREE.SphereGeometry(0.08, 6, 4);
  tail.translate(0, 1.15, -0.55);
  const torso = mergeGeometries([colored(body, furFn), colored(neck, furFn), colored(tail, col('#f2ece0'))]);

  const headParts = [];
  const skull = new THREE.SphereGeometry(0.15, 10, 8);
  skull.scale(0.9, 0.95, 1.4);
  headParts.push(colored(skull, col('#8a5a34')));
  const snout = new THREE.SphereGeometry(0.075, 8, 6);
  snout.scale(1, 0.85, 1.3);
  snout.translate(0, -0.05, 0.2);
  headParts.push(colored(snout, col('#3a2a20')));
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.06, 0.2, 6);
    ear.rotateZ(s * 1.1);
    ear.translate(s * 0.13, 0.1, -0.05);
    headParts.push(colored(ear, col('#7a4c2c')));
    const eye = new THREE.SphereGeometry(0.025, 6, 4);
    eye.translate(s * 0.1, 0.03, 0.1);
    headParts.push(colored(eye, col('#0c0806')));
    if (stag) {
      const a = [V(s * 0.06, 0.12, -0.02), V(s * 0.2, 0.38, -0.06), V(s * 0.3, 0.62, -0.02), V(s * 0.28, 0.82, 0.05)];
      headParts.push(colored(tube(a, [0.03, 0.025, 0.02, 0.012], 5), col('#d8c8a8')));
      headParts.push(colored(tube([a[1], V(s * 0.16, 0.55, 0.14)], [0.02, 0.01], 4), col('#d8c8a8')));
      headParts.push(colored(tube([a[2], V(s * 0.42, 0.75, -0.08)], [0.018, 0.008], 4), col('#d8c8a8')));
    }
  }
  const head = mergeGeometries(headParts);

  const leg = mergeGeometries([colored(tube([V(0, 0, 0), V(0, -0.45, 0.02), V(0, -0.9, 0)], [0.06, 0.04, 0.03], 6), col('#7a4c2c')), colored(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 6).translate(0, -0.92, 0), col('#1c1410'))]);

  // Geisterflecken für die Nacht
  const spots = [];
  for (let i = 0; i < 9; i++) {
    const sp = new THREE.SphereGeometry(0.035, 6, 4);
    sp.translate((i % 2 ? 1 : -1) * (0.12 + (i % 3) * 0.04), 1.32 - Math.abs(Math.sin(i)) * 0.06, -0.35 + i * 0.09);
    spots.push(sp);
  }
  return { torso, head, leg, spots: mergeGeometries(spots) };
}

function rabbitGeo() {
  const fur = (x, y, z, t) => t.set('#9a8268').lerp(new THREE.Color('#e9e0d0'), Math.max(0, Math.min(1, (0.16 - y) * 6)));
  const body = new THREE.SphereGeometry(0.17, 10, 8);
  body.scale(1, 0.9, 1.3);
  body.translate(0, 0.17, 0);
  const head = new THREE.SphereGeometry(0.1, 8, 6);
  head.translate(0, 0.32, 0.18);
  const parts = [colored(body, fur), colored(head, fur)];
  for (const s of [-1, 1]) {
    const ear = new THREE.CapsuleGeometry(0.025, 0.16, 2, 6);
    ear.rotateX(-0.35);
    ear.rotateZ(s * 0.18);
    ear.translate(s * 0.04, 0.47, 0.13);
    parts.push(colored(ear, col('#8a735c')));
    const eye = new THREE.SphereGeometry(0.018, 5, 4);
    eye.translate(s * 0.07, 0.35, 0.25);
    parts.push(colored(eye, col('#0a0806')));
  }
  const tail = new THREE.SphereGeometry(0.05, 6, 4);
  tail.translate(0, 0.2, -0.22);
  parts.push(colored(tail, col('#ffffff')));
  return mergeGeometries(parts);
}

function birdParts() {
  const body = new THREE.SphereGeometry(0.09, 6, 4);
  body.scale(0.8, 0.7, 1.8);
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.08, 0.42, 0, -0.04, 0, 0, -0.1], 3));
  wing.computeVertexNormals();
  return { body: colored(body, col('#2a2420')), wing: colored(wing, col('#3a3028')) };
}

let DEER = null;
let RABBIT = null;
let BIRD = null;

// --- Tiere -------------------------------------------------------------------------------------
class Deer {
  constructor(scene, x, z, field) {
    DEER ??= { stag: deerParts(true), doe: deerParts(false) };
    this.kind = 'deer';
    const p = Math.random() < 0.45 ? DEER.stag : DEER.doe;
    this.g = new THREE.Group();
    this.torso = new THREE.Mesh(p.torso, MAT);
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 1.72, 0.8);
    this.head = new THREE.Mesh(p.head, MAT);
    this.head.position.set(0, 0.02, 0.06);
    this.headPivot.add(this.head);
    this.spots = new THREE.Mesh(p.spots, SPOT);
    this.legs = [];
    for (const [lx, lz, ph] of [[-0.16, 0.42, 0], [0.16, 0.42, Math.PI], [-0.16, -0.42, Math.PI], [0.16, -0.42, 0]]) {
      const l = new THREE.Mesh(p.leg, MAT);
      l.position.set(lx, 0.95, lz);
      l.userData.ph = ph;
      this.legs.push(l);
      this.g.add(l);
    }
    this.g.add(this.torso, this.headPivot, this.spots);
    this.torso.castShadow = true;
    this.g.scale.setScalar(0.001);
    scene.add(this.g);
    this.init(x, z, field);
    this.speedWalk = 1.3;
    this.speedRun = 7;
  }
  init(x, z, field) {
    this.x = x;
    this.z = z;
    this.heading = Math.random() * Math.PI * 2;
    this.state = 'graze';
    this.t = 2 + Math.random() * 3;
    this.phase = Math.random() * 6;
    this.fade = 0;
    this.leaving = false;
    this.y = field.height(x, z);
    this.speed = 0;
  }
  pose(dt, moving, time, night) {
    const sp = this.speed;
    this.phase += dt * sp * 3.2;
    const amp = Math.min(0.55, sp * 0.2);
    for (const l of this.legs) l.rotation.x = Math.sin(this.phase + l.userData.ph) * amp;
    const bob = Math.abs(Math.sin(this.phase)) * amp * 0.12;
    this.torso.position.y = bob;
    this.spots.position.y = bob;
    const graze = this.state === 'graze' ? 1 : 0;
    this.headPivot.rotation.x += ((graze ? 1.25 : this.state === 'curious' ? -0.2 : 0.1) - this.headPivot.rotation.x) * Math.min(1, dt * 3);
    this.headPivot.position.y = 1.72 + bob - graze * 0.15;
    this.head.rotation.z = graze ? Math.sin(time * 6) * 0.04 : 0;
  }
}

class Rabbit {
  constructor(scene, x, z, field) {
    RABBIT ??= rabbitGeo();
    this.kind = 'rabbit';
    this.g = new THREE.Group();
    this.body = new THREE.Mesh(RABBIT, MAT);
    this.body.castShadow = true;
    this.g.add(this.body);
    this.g.scale.setScalar(0.001);
    scene.add(this.g);
    this.init(x, z, field);
    this.speedWalk = 2.2;
    this.speedRun = 6.5;
  }
  init(x, z, field) {
    Deer.prototype.init.call(this, x, z, field);
  }
  pose(dt, moving) {
    if (this.speed > 0.3) this.phase += dt * (5 + this.speed);
    const hop = this.speed > 0.3 ? Math.abs(Math.sin(this.phase)) : 0;
    this.body.position.y = hop * (0.12 + this.speed * 0.03);
    this.body.rotation.x = -Math.cos(this.phase) * hop * 0.25;
  }
}

class Flock {
  constructor(scene, x, z) {
    BIRD ??= birdParts();
    this.g = new THREE.Group();
    this.birds = [];
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Group();
      b.add(new THREE.Mesh(BIRD.body, MAT));
      const wl = new THREE.Mesh(BIRD.wing, MAT);
      const wr = new THREE.Mesh(BIRD.wing, MAT);
      wr.scale.x = -1;
      b.add(wl, wr);
      b.userData = { wl, wr, off: V((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 6), ph: Math.random() * 6 };
      this.g.add(b);
      this.birds.push(b);
    }
    scene.add(this.g);
    this.cx = x;
    this.cz = z;
    this.r = 18 + Math.random() * 14;
    this.a = Math.random() * 6.28;
    this.h = 16 + Math.random() * 8;
    this.fade = 0;
    this.leaving = false;
  }
  update(dt, time, field) {
    this.a += dt * (7 / this.r);
    const x = this.cx + Math.cos(this.a) * this.r;
    const z = this.cz + Math.sin(this.a) * this.r;
    const y = Math.max(field.height(x, z), WATER) + this.h;
    this.g.position.set(x, y, z);
    this.g.rotation.y = -this.a;
    this.fade = Math.max(0, Math.min(1, this.fade + dt * (this.leaving ? -0.4 : 0.4)));
    this.g.visible = this.fade > 0.01;
    for (const b of this.birds) {
      const u = b.userData;
      b.position.copy(u.off).multiplyScalar(1 + (1 - this.fade) * 4);
      b.position.y += Math.sin(time * 0.8 + u.ph) * 0.6 + (1 - this.fade) * 20;
      const f = Math.sin(time * 14 + u.ph) * 0.9;
      u.wl.rotation.z = f;
      u.wr.rotation.z = -f;
    }
  }
}

// --- Verwaltung --------------------------------------------------------------------------------
export function createFauna(scene, field, sim) {
  const animals = [];
  const flocks = [];
  let spawnT = 1;
  let healthy = 0;

  const good = (x, z) => {
    const s = sim.sample(x, z);
    return s.loaded && !s.water && s.L > 0.65 && s.B < 0.05 && field.height(x, z) > WATER + 0.3;
  };

  function findSpot(fx, fz, rMin, rMax) {
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      const x = fx + Math.cos(a) * r;
      const z = fz + Math.sin(a) * r;
      if (good(x, z)) return { x, z };
    }
    return null;
  }

  // gibt die Zahl neu zurückgekehrter Tiere zurück
  function update(dt, { focus, players, time, night, day }) {
    let returned = 0;
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 1.5;
      // gesunde Fläche um den Fokus schätzen
      let ok = 0;
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 70;
        if (good(focus.x + Math.cos(a) * r, focus.z + Math.sin(a) * r)) ok++;
      }
      healthy = healthy * 0.6 + (ok / 40) * Math.PI * 70 * 70 * 0.4;
      const deer = animals.filter((a) => a.kind === 'deer' && !a.leaving).length;
      const rabbits = animals.filter((a) => a.kind === 'rabbit' && !a.leaving).length;
      const maxDeer = Math.min(5, Math.floor(healthy / 2600));
      const maxRabbits = Math.min(8, Math.floor(healthy / 900));
      if (deer < maxDeer) {
        const s = findSpot(focus.x, focus.z, 22, 55);
        if (s) {
          animals.push(new Deer(scene, s.x, s.z, field));
          returned++;
        }
      } else if (rabbits < maxRabbits) {
        const s = findSpot(focus.x, focus.z, 10, 45);
        if (s) {
          animals.push(new Rabbit(scene, s.x, s.z, field));
          returned++;
        }
      }
      const liveFlocks = flocks.filter((f) => !f.leaving).length;
      if (day && healthy > 3500 && liveFlocks < 2) flocks.push(new Flock(scene, focus.x + (Math.random() - 0.5) * 40, focus.z + (Math.random() - 0.5) * 40));
      if (!day || healthy < 2000) flocks.forEach((f) => (f.leaving = true));
    }

    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i];
      const d = Math.hypot(a.x - focus.x, a.z - focus.z);
      if (d > 100) a.leaving = true;
      const here = sim.sample(a.x, a.z);
      // Spieler und Fäulnis in der Nähe?
      let near = null;
      let nd = Infinity;
      for (const p of players) {
        const q = Math.hypot(p.x - a.x, p.z - a.z);
        if (q < nd) (nd = q), (near = p);
      }
      const rotAhead = sim.sample(a.x + Math.sin(a.heading) * 4, a.z + Math.cos(a.heading) * 4).B;
      a.t -= dt;
      if (here.B > 0.25 || rotAhead > 0.3) {
        a.state = 'flee';
        a.t = 2;
        a.heading += Math.PI * (0.6 + Math.random() * 0.8);
      } else if (a.kind === 'rabbit' && nd < 4) {
        a.state = 'flee';
        a.t = 1.2;
        a.heading = Math.atan2(a.x - near.x, a.z - near.z) + (Math.random() - 0.5);
      } else if (a.kind === 'deer' && nd < 7 && a.state !== 'flee') {
        a.state = 'curious';
        a.heading += Math.atan2(Math.sin(Math.atan2(near.x - a.x, near.z - a.z) - a.heading), Math.cos(Math.atan2(near.x - a.x, near.z - a.z) - a.heading)) * Math.min(1, dt * 2);
      } else if (a.t <= 0) {
        if (a.state === 'walk') {
          a.state = 'graze';
          a.t = 3 + Math.random() * 5;
        } else {
          const s = findSpot(a.x, a.z, 4, 14);
          if (s) {
            a.state = 'walk';
            a.target = s;
            a.t = 8;
          } else a.t = 2;
        }
      }
      let want = 0;
      if (a.state === 'walk' && a.target) {
        const dx = a.target.x - a.x;
        const dz = a.target.z - a.z;
        if (Math.hypot(dx, dz) < 0.8) a.t = 0;
        const th = Math.atan2(dx, dz);
        a.heading += Math.atan2(Math.sin(th - a.heading), Math.cos(th - a.heading)) * Math.min(1, dt * 3);
        want = a.speedWalk;
      } else if (a.state === 'flee') want = a.speedRun;
      a.speed += (want - a.speed) * Math.min(1, dt * 3);
      const nx = a.x + Math.sin(a.heading) * a.speed * dt;
      const nz = a.z + Math.cos(a.heading) * a.speed * dt;
      if (field.height(nx, nz) > WATER + 0.2) {
        a.x = nx;
        a.z = nz;
      } else {
        a.heading += Math.PI * 0.5;
        a.t = 0.5;
      }
      a.y += (field.height(a.x, a.z) - a.y) * Math.min(1, dt * 10);
      a.fade = Math.max(0, Math.min(1, a.fade + dt * (a.leaving ? -0.7 : 0.6)));
      a.g.position.set(a.x, a.y, a.z);
      a.g.rotation.y = a.heading;
      a.g.scale.setScalar(Math.max(0.001, a.fade * (a.kind === 'deer' ? 1.45 : 1.7)));
      a.pose(dt, a.speed > 0.2, time, night);
      if (a.leaving && a.fade <= 0) {
        scene.remove(a.g);
        animals.splice(i, 1);
      }
    }
    SPOT.opacity = night * 0.95;
    for (let i = flocks.length - 1; i >= 0; i--) {
      const f = flocks[i];
      f.update(dt, time, field);
      if (f.leaving && f.fade <= 0) {
        scene.remove(f.g);
        flocks.splice(i, 1);
      }
    }
    return returned;
  }

  return { animals, flocks, update, get healthy() { return healthy; } };
}

// Zuschauer hinter dem Zaun: Beine, Oberkörper, Kopf, Arme (jubeln, wenn der Käse vorbeirollt), manche mit Hut
import * as THREE from 'three';

const palette = (list) => list.map((h) => new THREE.Color(h));
export const OUTFITS = {
  // Zuschauer am Cooper's Hill
  village: {
    shirts: palette(['#c43c2a', '#2b5fa8', '#f2c230', '#f4f1ea', '#3d8a3a', '#e07a1f', '#7a3d8a', '#1b1d17', '#e8a0b4', '#5fa8c4']),
    trousers: palette(['#2b3346', '#3a3a3a', '#5a4a3a', '#30476b', '#6b6b5a']),
    skins: palette(['#f1c7a5', '#e2b08c', '#c58e68', '#8d5a3c', '#5e3d2a']),
    hats: palette(['#1b1d17', '#c43c2a', '#f4f1ea', '#2b5fa8', '#7a5a3a']),
    hatChance: 0.3,
  },
  // Bergsteiger in Daunenjacken, fast alle mit Mütze
  climbers: {
    shirts: palette(['#e8402a', '#f2a51a', '#1f6fd1', '#e8e23a', '#2fa36b', '#d02f6b', '#ff7a1a', '#3a3a8a']),
    trousers: palette(['#1b1d22', '#2d3340', '#3a3a3a', '#5a2a2a']),
    skins: palette(['#e2b08c', '#c58e68', '#a8714f', '#8d5a3c']),
    hats: palette(['#d62f2f', '#1f6fd1', '#f2c230', '#1b1d17', '#ffffff']),
    hatChance: 0.9,
    bulk: 1.18,
  },
};

// Zuschauerplätze entlang des Zauns (klassische Strecken)
export function buildCrowd(group, track, { groundAt, fenceX, rng: r }) {
  const people = [];
  for (let z = 3; z < track.finishZ + 30 && z < track.length; z += 0.85) {
    for (const side of [-1, 1]) {
      // dichter am Start, im Ziel und an den steilen Stellen
      const density = 0.32 + (z < 30 || z > track.finishZ - 35 ? 0.55 : 0);
      if (r() > density) continue;
      const rowsBack = 1 + Math.floor(r() * 3);
      for (let k = 0; k < rowsBack; k++) {
        const fx = fenceX(side, z);
        const x = fx + side * (0.8 + k * 0.85 + r() * 0.4);
        const zz = z + (r() - 0.5) * 0.6;
        people.push(person(x, zz, groundAt(x, zz), Math.atan2(-side, 0.35 * (r() - 0.5)) + (r() - 0.5) * 0.5, OUTFITS.village, r));
      }
    }
  }
  return crowdMeshes(group, people);
}

// Eine Person; yaw = Blickrichtung (zur Bahn)
export function person(x, z, y, yaw, outfit, r) {
  const pick = (list) => list[Math.floor(r() * list.length)];
  return {
    x,
    z,
    y,
    yaw,
    h: 0.88 + r() * 0.24,
    bulk: outfit.bulk ?? 1,
    shirt: pick(outfit.shirts),
    legs: pick(outfit.trousers),
    skin: pick(outfit.skins),
    hat: r() < outfit.hatChance ? pick(outfit.hats) : null,
    phase: r() * 6.28,
    temper: 0.6 + r() * 0.8,
    excite: 0,
    dirty: true,
  };
}

// Zeichnet eine Liste von Personen; update(time, foci) mit foci = [{ p, speed }] lässt Nahe jubeln
export function crowdMeshes(group, people) {
  const n = people.length;
  if (!n) return { update() {}, count: 0 };
  const lambert = () => new THREE.MeshLambertMaterial();
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.8, 0.2), lambert(), n);
  const torso = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.21, 0.42, 2, 7), lambert(), n);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 8, 6), lambert(), n);
  const armGeo = new THREE.CapsuleGeometry(0.06, 0.5, 1, 4);
  armGeo.translate(0, -0.27, 0); // Drehpunkt an der Schulter
  const arms = new THREE.InstancedMesh(armGeo, lambert(), n * 2);
  const hatGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.14, 8);
  const hatMesh = new THREE.InstancedMesh(hatGeo, lambert(), n);
  people.forEach((p, i) => {
    legs.setColorAt(i, p.legs);
    torso.setColorAt(i, p.shirt);
    head.setColorAt(i, p.skin);
    arms.setColorAt(i * 2, p.shirt);
    arms.setColorAt(i * 2 + 1, p.shirt);
    hatMesh.setColorAt(i, p.hat ?? p.skin);
  });
  legs.castShadow = torso.castShadow = true;
  group.add(legs, torso, head, arms, hatMesh);

  const base = new THREE.Matrix4();
  const part = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const sv = new THREE.Vector3();
  const zero = new THREE.Vector3(0, 0, 0);
  const place = (mesh, i, x, y, z, rx = 0, rz = 0, sc = one) => {
    part.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, 0, rz)), sc);
    mesh.setMatrixAt(i, out.multiplyMatrices(base, part));
  };

  let last = 0;
  const update = (time, foci = []) => {
    const dt = Math.min(0.05, Math.max(0, time - last));
    last = time;
    for (let i = 0; i < n; i++) {
      const p = people[i];
      let target = 0;
      for (const f of foci) {
        const near = Math.abs(p.z - f.p.z);
        if (near < 26) target = Math.max(target, Math.min(1, (1 - near / 26) * (0.35 + f.speed / 22) * p.temper));
      }
      if (target < 0.005 && p.excite < 0.005 && !p.dirty) continue;
      p.dirty = false;
      p.excite += (target - p.excite) * Math.min(1, dt * 3);
      const x = p.excite;
      const hop = Math.max(0, Math.sin(time * 8 + p.phase)) * 0.22 * x;
      const lean = Math.sin(time * 1.1 + p.phase) * 0.04 + x * 0.12;
      q.setFromEuler(e.set(0, p.yaw, 0));
      base.compose(v.set(p.x, p.y + hop, p.z), q, sv.set(p.h * p.bulk, p.h, p.h * p.bulk));
      place(legs, i, 0, 0.4, 0);
      place(torso, i, 0, 1.08, 0, lean);
      place(head, i, 0, 1.56 + lean * 0.1, lean * 0.5);
      place(hatMesh, i, 0, 1.7 + lean * 0.1, lean * 0.5, 0, 0, p.hat ? one : zero);
      // Arme: hängen, beim Jubeln hoch in die Luft und winken
      const wave = Math.sin(time * 10 + p.phase) * 0.35 * x;
      const up = 0.15 + x * 2.6;
      place(arms, i * 2, -0.27, 1.33, 0, 0, -(up + wave));
      place(arms, i * 2 + 1, 0.27, 1.33, 0, 0, up - wave);
    }
    legs.instanceMatrix.needsUpdate = true;
    torso.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    hatMesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { update, count: n };
}

// Grafik der Strecken-Gegenstände: Käsekisten, Käsestücke, Boost-Felder, Räder, Raketen, Pfützen
import * as THREE from 'three';
import { boxTexture, cheeseTexture, padTexture } from './textures.js';

function wedge(w, h, l) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(l, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  geo.translate(-l / 3, -h / 3, -w / 2);
  return geo;
}

export function createItemViews(scene, race) {
  const track = race.track;
  // Käsekisten: rotierende, leuchtende Würfel mit Fragezeichen
  const boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  const boxMat = new THREE.MeshPhysicalMaterial({ map: boxTexture(), emissive: '#ff9a1a', emissiveMap: boxTexture(), emissiveIntensity: 0.55, roughness: 0.15, clearcoat: 1, transmission: 0, transparent: true, opacity: 0.92 });
  const boxes = new THREE.InstancedMesh(boxGeo, boxMat, race.boxes.length);
  boxes.castShadow = true;
  scene.add(boxes);
  const innerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2a0').multiplyScalar(2.2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const inner = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 1), innerMat, race.boxes.length);
  scene.add(inner);

  // Käsestücke: kleine goldene Keile
  const coinMat = new THREE.MeshPhysicalMaterial({ map: cheeseTexture(true), color: '#ffe08a', emissive: '#ffb300', emissiveIntensity: 0.35, roughness: 0.3, clearcoat: 1 });
  const coins = new THREE.InstancedMesh(wedge(0.5, 0.55, 0.9), coinMat, race.coins.length);
  coins.castShadow = true;
  scene.add(coins);

  // Boost-Felder
  const padMat = new THREE.MeshStandardMaterial({ map: padTexture(), emissive: '#ffffff', emissiveMap: padTexture(), emissiveIntensity: 0.9, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -3 });
  const padMeshes = [];
  for (const p of race.pads) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.4), padMat);
    m.rotation.order = 'YXZ';
    m.rotation.y = p.heading;
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, p.y + 0.04, p.z);
    m.receiveShadow = true;
    scene.add(m);
    padMeshes.push(m);
  }
  const padTex = padMat.map;

  // Geschosse
  const cheeseMat = new THREE.MeshStandardMaterial({ map: cheeseTexture(true), roughness: 0.5 });
  const rindMat = new THREE.MeshStandardMaterial({ color: '#d9a326', roughness: 0.6 });
  const wheelGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.45, 28).rotateZ(Math.PI / 2);
  const rindGeo = new THREE.TorusGeometry(0.62, 0.07, 8, 28).rotateY(Math.PI / 2);
  const rocketMat = new THREE.MeshPhysicalMaterial({ color: '#c8281e', roughness: 0.3, clearcoat: 1, metalness: 0.2 });
  const views = new Map();

  function makeWheel() {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const a = new THREE.Mesh(wheelGeo, cheeseMat);
    a.castShadow = true;
    inner.add(a);
    inner.add(new THREE.Mesh(rindGeo, rindMat));
    const r2 = new THREE.Mesh(rindGeo, rindMat);
    r2.position.x = 0.2;
    inner.add(r2);
    g.userData.inner = inner;
    return g;
  }
  function makeRocket() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.6, 16).rotateX(Math.PI / 2), rocketMat);
    body.castShadow = true;
    g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 16).rotateX(Math.PI / 2).translate(0, 0, 1.1), rocketMat);
    g.add(nose);
    // Halbmond Raclette als Sprengkopf
    const rac = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 20, 1, false, 0, Math.PI), cheeseMat);
    rac.rotation.set(Math.PI / 2, 0, 0);
    rac.position.z = 0.2;
    g.add(rac);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.5 }));
      fin.position.z = -0.65;
      fin.rotation.z = (i * Math.PI) / 2;
      fin.position.x = Math.sin((i * Math.PI) / 2) * 0.3;
      fin.position.y = Math.cos((i * Math.PI) / 2) * 0.3;
      g.add(fin);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a40').multiplyScalar(5), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.z = -0.9;
    g.add(glow);
    return g;
  }
  const puddleMat = new THREE.MeshPhysicalMaterial({ color: '#ffcf4a', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#ff9a00', emissiveIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -5 });
  function makePuddle() {
    const g = new THREE.Group();
    // unregelmäßiger Klecks
    const shape = new THREE.Shape();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 2.4 * (0.85 + Math.sin(a * 3 + Math.random()) * 0.08 + Math.random() * 0.08);
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.2, bevelSegments: 3 }).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, puddleMat);
    m.receiveShadow = true;
    g.add(m);
    // Blasen
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12 + Math.random() * 0.12, 10, 8), puddleMat);
      b.position.set((Math.random() - 0.5) * 2.6, 0.12, (Math.random() - 0.5) * 2.6);
      b.userData.ph = Math.random() * 6;
      g.add(b);
    }
    // Fonduegabel steckt drin
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), new THREE.MeshStandardMaterial({ color: '#ddd', metalness: 1, roughness: 0.2 }));
    fork.position.set(0.6, 0.6, 0.2);
    fork.rotation.z = 0.5;
    g.add(fork);
    return g;
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);

  function update(dt, time, fx) {
    race.boxes.forEach((b, i) => {
      const visible = b.respawn <= 0;
      const grow = visible ? 1 : Math.max(0, 1 - b.respawn * 4) ** 2;
      const s = b.respawn > 0 && b.respawn < 0.3 ? 1 - b.respawn / 0.3 : grow;
      e.set(time * 0.9 + i, time * 1.3 + i * 0.7, 0.4);
      q.setFromEuler(e);
      v.set(b.x, b.y + Math.sin(time * 2 + i) * 0.15, b.z);
      m4.compose(v, q, s > 0 ? one.clone().multiplyScalar(s) : zero);
      boxes.setMatrixAt(i, m4);
      m4.compose(v, q, s > 0 ? one.clone().multiplyScalar(s * (0.9 + Math.sin(time * 6 + i) * 0.1)) : zero);
      inner.setMatrixAt(i, m4);
    });
    boxes.instanceMatrix.needsUpdate = true;
    inner.instanceMatrix.needsUpdate = true;
    race.coins.forEach((c, i) => {
      const s = c.respawn > 0 ? 0 : 1;
      e.set(0, time * 2.5 + i * 0.4, 0);
      q.setFromEuler(e);
      v.set(c.x, c.y + Math.sin(time * 3 + i * 0.6) * 0.12, c.z);
      m4.compose(v, q, s ? one : zero);
      coins.setMatrixAt(i, m4);
    });
    coins.instanceMatrix.needsUpdate = true;
    padTex.offset.y = -((time * 1.6) % 1);

    // Geschosse synchronisieren
    const seen = new Set();
    for (const p of race.projectiles) {
      seen.add(p.id);
      let g = views.get(p.id);
      if (!g) {
        g = p.type === 'rocket' ? makeRocket() : makeWheel();
        scene.add(g);
        views.set(p.id, g);
      }
      g.position.set(p.x, p.y, p.z);
      const yaw = Math.atan2(p.vx, p.vz);
      g.rotation.set(0, yaw, 0);
      if (p.type === 'wheel') {
        g.userData.inner.rotation.x = p.spin / 0.62;
        if (Math.random() < 0.5) fx.sparks(p.x, p.y - 0.5, p.z, [2.5, 1.8, 0.4], 1, 2);
      } else {
        g.rotation.z = time * 8;
        const bx = p.x - Math.sin(yaw) * 1.1;
        const bz = p.z - Math.cos(yaw) * 1.1;
        fx.flame(bx, p.y, bz, -Math.sin(yaw) * 6, -Math.cos(yaw) * 6, [3.5, 1.5, 0.3]);
        if (Math.random() < 0.6) fx.smoke(bx, p.y - 0.2, bz, [0.7, 0.7, 0.72], 1);
      }
    }
    for (const p of race.puddles) {
      seen.add(p.id);
      let g = views.get(p.id);
      if (!g) {
        g = makePuddle();
        g.position.set(p.x, p.y + 0.02, p.z);
        g.rotation.y = Math.random() * 6;
        g.scale.setScalar(0.1);
        scene.add(g);
        views.set(p.id, g);
      }
      g.scale.setScalar(Math.min(1, g.scale.x + dt * 4));
      g.children.forEach((c) => {
        if (c.userData.ph !== undefined) c.scale.setScalar(0.6 + Math.abs(Math.sin(time * 2 + c.userData.ph)) * 0.6);
      });
      if (p.life < 2) g.scale.setScalar(Math.max(0.01, p.life / 2));
    }
    for (const [id, g] of views) {
      if (!seen.has(id)) {
        scene.remove(g);
        views.delete(id);
      }
    }
  }
  void track;
  return { update, padMeshes };
}

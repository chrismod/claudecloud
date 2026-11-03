// Prozedurale Turmmodelle und ihre Darstellung (Zielen, Rückstoß, Stufen, Module).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TOWERS, MAX_LEVEL } from '../game/data.js';
import { tileTop } from './board.js';

const matCache = new Map();
export function towerMats(type, ghost = false) {
  const key = type + (ghost ? ':g' : '');
  if (matCache.has(key)) return matCache.get(key);
  const d = TOWERS[type];
  const extra = ghost ? { transparent: true, opacity: 0.55, depthWrite: false } : {};
  const m = {
    body: new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.42, metalness: 0.12, ...extra }),
    dark: new THREE.MeshStandardMaterial({ color: '#363d4a', roughness: 0.45, metalness: 0.45, ...extra }),
    light: new THREE.MeshStandardMaterial({ color: '#f2eee6', roughness: 0.55, ...extra }),
    accent: new THREE.MeshStandardMaterial({ color: d.accent, emissive: d.accent, emissiveIntensity: 1.5, roughness: 0.3, ...extra }),
    glass: new THREE.MeshStandardMaterial({ color: d.accent, emissive: d.color, emissiveIntensity: 0.8, roughness: 0.1, transparent: true, opacity: ghost ? 0.4 : 0.82, flatShading: true, depthWrite: !ghost }),
    gold: new THREE.MeshStandardMaterial({ color: '#ffd25e', emissive: '#ffb020', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.6, ...extra }),
    off: new THREE.MeshStandardMaterial({ color: '#555c68', roughness: 0.6, ...extra }),
  };
  matCache.set(key, m);
  return m;
}

const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
// Lauf entlang +x
const barrel = (r, len, mat, x0 = 0, y = 0, z = 0) => {
  const g = new THREE.CylinderGeometry(r, r * 1.08, len, 10);
  g.rotateZ(-Math.PI / 2);
  g.translate(x0 + len / 2, 0, 0);
  return mesh(g, mat, 0, y, z);
};
const marker = (x, y, z) => {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  return o;
};

// Kopf je Turmart: { head, gun, muzzles[], spin[], bob }
const HEADS = {
  bolt(m, lv, mod) {
    const head = new THREE.Group();
    const gun = new THREE.Group();
    head.add(mesh(new RoundedBoxGeometry(0.34, 0.2, 0.3, 2, 0.06), m.body, 0, 0.12, 0));
    head.add(mesh(new RoundedBoxGeometry(0.18, 0.08, 0.2, 1, 0.03), m.light, -0.04, 0.25, 0));
    const zs = mod === 0 ? [-0.075, 0.075] : [0];
    const muzzles = [];
    for (const z of zs) {
      gun.add(barrel(mod === 1 ? 0.05 : 0.04, 0.3, m.dark, 0.1, 0.13, z));
      gun.add(mesh(cyl(0.05, 0.05, 0.04, 10).rotateZ(Math.PI / 2), m.accent, 0.4, 0.13, z));
      muzzles.push(marker(0.43, 0.13, z));
    }
    gun.add(...muzzles);
    head.add(gun);
    return { head, gun, muzzles };
  },
  mortar(m, lv, mod) {
    const head = new THREE.Group();
    const gun = new THREE.Group();
    head.add(mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.body, 0, 0.02, 0));
    head.add(mesh(cyl(0.24, 0.24, 0.05, 16), m.dark, 0, 0.03, 0));
    gun.position.set(0.02, 0.14, 0);
    gun.rotation.z = 0.85;
    const r = mod === 0 ? 0.1 : 0.085;
    gun.add(barrel(r, 0.3, m.dark, -0.04));
    gun.add(mesh(cyl(r + 0.025, r + 0.025, 0.05, 12).rotateZ(Math.PI / 2), mod === 1 ? m.accent : m.light, 0.25, 0, 0));
    const mz = marker(0.3, 0, 0);
    gun.add(mz);
    head.add(gun);
    return { head, gun, muzzles: [mz], recoilAxis: 'x' };
  },
  frost(m, lv, mod) {
    const head = new THREE.Group();
    head.add(mesh(cyl(0.12, 0.2, 0.12, 8), m.light, 0, 0.06, 0));
    const crystal = mesh(new THREE.OctahedronGeometry(0.15, 0), m.glass, 0, 0.5, 0);
    crystal.scale.set(1, 1.9, 1);
    const orbit = new THREE.Group();
    orbit.position.y = 0.48;
    const n = mod === 0 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = mesh(new THREE.OctahedronGeometry(0.05, 0), mod === 1 ? m.accent : m.glass, Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25);
      s.scale.y = 1.8;
      orbit.add(s);
    }
    head.add(crystal, orbit);
    return { head, muzzles: [marker(0, 0.5, 0)], spin: [[orbit, 1.4], [crystal, 0.5]], bob: crystal, fixed: true };
  },
  tesla(m, lv, mod) {
    const head = new THREE.Group();
    head.add(mesh(cyl(0.05, 0.07, 0.55, 8), m.dark, 0, 0.28, 0));
    const coils = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const t = mesh(new THREE.TorusGeometry(0.13 - i * 0.025, 0.028, 8, 20), i === 1 && mod === 1 ? m.gold : m.accent, 0, 0.18 + i * 0.13, 0);
      t.rotation.x = Math.PI / 2;
      coils.add(t);
    }
    const orb = mesh(new THREE.SphereGeometry(mod === 0 ? 0.1 : 0.085, 16, 12), m.accent, 0, 0.62, 0);
    head.add(coils, orb);
    return { head, muzzles: [marker(0, 0.62, 0)], fixed: true, flicker: orb };
  },
  sniper(m, lv, mod) {
    const head = new THREE.Group();
    const gun = new THREE.Group();
    head.add(mesh(new RoundedBoxGeometry(0.3, 0.16, 0.2, 2, 0.05), m.body, -0.02, 0.12, 0));
    gun.add(barrel(0.028, 0.5, m.dark, 0.08, 0.14, 0));
    gun.add(mesh(cyl(0.045, 0.04, 0.08, 8).rotateZ(Math.PI / 2), mod === 1 ? m.accent : m.dark, 0.6, 0.14, 0));
    const scope = barrel(0.035, 0.16, m.light, -0.05, 0.25, 0);
    gun.add(scope);
    gun.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), m.accent, 0.12, 0.25, 0));
    const mz = marker(0.64, 0.14, 0);
    gun.add(mz);
    head.add(gun);
    return { head, gun, muzzles: [mz] };
  },
  acid(m, lv, mod) {
    const head = new THREE.Group();
    const gun = new THREE.Group();
    head.add(mesh(cyl(0.16, 0.18, 0.1, 12), m.dark, 0, 0.05, 0));
    const tank = mesh(new THREE.SphereGeometry(0.17, 16, 12), m.glass, -0.02, 0.24, 0);
    head.add(tank);
    head.add(mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 20), m.body, -0.02, 0.24, 0).rotateX(Math.PI / 2));
    gun.add(barrel(0.045, 0.22, m.body, 0.1, 0.2, 0));
    gun.add(mesh(cyl(0.065, 0.05, 0.05, 10).rotateZ(Math.PI / 2), m.accent, 0.34, 0.2, 0));
    const mz = marker(0.36, 0.2, 0);
    gun.add(mz);
    head.add(gun);
    return { head, gun, muzzles: [mz], bob: tank };
  },
  flame(m, lv, mod) {
    const head = new THREE.Group();
    const gun = new THREE.Group();
    head.add(mesh(new RoundedBoxGeometry(0.28, 0.18, 0.26, 2, 0.05), m.body, 0, 0.12, 0));
    for (const z of [-0.08, 0.08]) head.add(mesh(cyl(0.06, 0.06, 0.24, 10).rotateZ(Math.PI / 2), m.light, -0.2, 0.14, z));
    const noz = new THREE.CylinderGeometry(mod === 1 ? 0.09 : 0.065, 0.04, 0.18, 10);
    noz.rotateZ(-Math.PI / 2);
    noz.translate(0.25, 0, 0);
    gun.add(barrel(0.04, 0.16, m.dark, 0.08, 0.13, 0));
    gun.add(mesh(noz, m.dark, 0, 0.13, 0));
    gun.add(mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 14).rotateY(Math.PI / 2), m.accent, 0.34, 0.13, 0));
    const mz = marker(0.36, 0.13, 0);
    gun.add(mz);
    head.add(gun);
    return { head, gun, muzzles: [mz] };
  },
  laser(m, lv, mod) {
    const head = new THREE.Group();
    const gun = new THREE.Group();
    head.add(mesh(cyl(0.05, 0.08, 0.2, 8), m.dark, 0, 0.1, 0));
    const ring = mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), m.body, 0, 0.3, 0);
    head.add(ring);
    const prism = new THREE.CylinderGeometry(0.11, 0.11, 0.36, 3);
    prism.rotateZ(-Math.PI / 2);
    gun.add(mesh(prism, m.glass, 0, 0.3, 0));
    gun.add(mesh(new THREE.SphereGeometry(mod === 0 ? 0.06 : 0.05, 12, 8), m.accent, 0.2, 0.3, 0));
    if (mod === 1) for (const z of [-0.09, 0.09]) gun.add(mesh(new THREE.OctahedronGeometry(0.035, 0), m.accent, 0.12, 0.3, z));
    const mz = marker(0.22, 0.3, 0);
    gun.add(mz);
    head.add(gun);
    return { head, gun, muzzles: [mz], spin: [[ring, 0]] };
  },
  missile(m, lv, mod) {
    const head = new THREE.Group();
    const gun = new THREE.Group();
    head.add(mesh(cyl(0.14, 0.18, 0.1, 10), m.dark, 0, 0.05, 0));
    gun.position.y = 0.2;
    gun.rotation.z = 0.35;
    gun.add(mesh(new RoundedBoxGeometry(0.34, 0.24, 0.32, 2, 0.04), m.body, 0, 0, 0));
    const n = mod === 1 ? 1 : mod === 0 ? 3 : 2;
    const muzzles = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < (mod === 1 ? 1 : 2); j++) {
        const z = n === 1 ? 0 : (i - (n - 1) / 2) * 0.1;
        const y = mod === 1 ? 0 : (j - 0.5) * 0.1;
        const r = mod === 1 ? 0.085 : 0.035;
        gun.add(mesh(cyl(r, r, 0.03, 10).rotateZ(Math.PI / 2), m.dark, 0.17, y, z));
        gun.add(mesh(new THREE.SphereGeometry(r * 0.7, 8, 6), m.accent, 0.165, y, z));
        muzzles.push(marker(0.2, y, z));
      }
    }
    gun.add(...muzzles);
    head.add(gun);
    return { head, gun, muzzles };
  },
  amp(m, lv, mod) {
    const head = new THREE.Group();
    head.add(mesh(cyl(0.07, 0.12, 0.38, 8), m.light, 0, 0.19, 0));
    const r1 = mesh(new THREE.TorusGeometry(0.22, 0.022, 8, 32), m.gold, 0, 0.42, 0);
    const r2 = mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 28), mod === 0 ? m.accent : m.gold, 0, 0.42, 0);
    r2.rotation.x = Math.PI / 2;
    const orb = mesh(new THREE.SphereGeometry(0.08, 16, 12), m.accent, 0, 0.42, 0);
    head.add(r1, r2, orb);
    return { head, muzzles: [marker(0, 0.42, 0)], spin: [[r1, 1.1, 'y'], [r2, -1.6, 'y']], fixed: true, pulse: orb };
  },
  mint(m, lv, mod) {
    const head = new THREE.Group();
    head.add(mesh(new RoundedBoxGeometry(0.4, 0.22, 0.34, 2, 0.05), m.body, 0, 0.11, 0));
    head.add(mesh(new RoundedBoxGeometry(0.26, 0.06, 0.22, 1, 0.02), m.dark, 0, 0.25, 0));
    head.add(mesh(cyl(0.04, 0.05, 0.2, 8), m.dark, -0.13, 0.32, -0.1));
    const coin = mesh(cyl(0.12, 0.12, 0.03, 20).rotateX(Math.PI / 2), m.gold, 0, 0.45, 0);
    head.add(coin);
    if (mod === 0) head.add(mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 24), m.accent, 0, 0.45, 0));
    return { head, muzzles: [marker(0, 0.45, 0)], spin: [[coin, 2.2, 'y']], fixed: true, bob: coin };
  },
};

export function buildTowerModel(type, level = 1, module = null, ghost = false) {
  const m = towerMats(type, ghost);
  const root = new THREE.Group();
  // Sockel mit Stufenanzeige
  root.add(mesh(cyl(0.35, 0.39, 0.1, 8), m.light, 0, 0.05, 0));
  root.add(mesh(cyl(0.29, 0.32, 0.1, 8), m.body, 0, 0.15, 0));
  for (let i = 0; i < MAX_LEVEL; i++) {
    const a = (i / MAX_LEVEL) * Math.PI * 2 + Math.PI / 2;
    const pip = mesh(new THREE.BoxGeometry(0.035, 0.05, 0.035), i < level ? m.accent : m.off, Math.cos(a) * 0.37, 0.07, Math.sin(a) * 0.37);
    pip.castShadow = false;
    root.add(pip);
  }
  if (level >= MAX_LEVEL) {
    const halo = mesh(new THREE.TorusGeometry(0.31, 0.02, 6, 32), m.gold, 0, 0.21, 0);
    halo.rotation.x = Math.PI / 2;
    root.add(halo);
  }
  const parts = HEADS[type](m, level, module);
  parts.head.position.y = 0.2;
  const s = 1 + (level - 1) * 0.022;
  parts.head.scale.setScalar(s);
  root.add(parts.head);
  if (ghost) root.traverse((o) => ((o.castShadow = false), (o.receiveShadow = false)));
  return { root, ...parts };
}

export class TowerViews {
  constructor(board) {
    this.board = board;
    this.views = new Map();
    this.group = new THREE.Group();
    board.stage.scene.add(this.group);
    this.time = 0;
    this.v = new THREE.Vector3();
  }

  clear() {
    for (const v of this.views.values()) this.group.remove(v.model.root);
    this.views.clear();
  }

  sync(game) {
    const seen = new Set();
    for (const t of game.towers) {
      seen.add(t.id);
      let v = this.views.get(t.id);
      const key = `${t.level}:${t.module}`;
      if (v && v.key !== key) {
        this.group.remove(v.model.root);
        v.model = this.make(t);
        v.key = key;
        v.pop = 1;
      }
      if (!v) {
        v = { model: this.make(t), key, aim: t.aim, recoil: 0, pop: 1, tower: t };
        this.views.set(t.id, v);
      }
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.group.remove(v.model.root);
        this.views.delete(id);
      }
    }
  }

  make(t) {
    const model = buildTowerModel(t.type, t.level, t.module);
    model.root.position.set(this.board.wx(t.x), tileTop(t.tile), this.board.wz(t.y));
    model.head.rotation.y = -t.aim;
    this.group.add(model.root);
    return model;
  }

  shot(id) {
    const v = this.views.get(id);
    if (v) v.recoil = 1;
  }

  muzzle(id, i = 0, out = new THREE.Vector3()) {
    const v = this.views.get(id);
    if (!v) return null;
    const ms = v.model.muzzles;
    const mz = ms[i % ms.length];
    mz.updateWorldMatrix(true, false);
    return mz.getWorldPosition(out);
  }

  update(dt) {
    this.time += dt;
    for (const v of this.views.values()) {
      const m = v.model;
      const t = v.tower;
      if (!m.fixed) {
        let d = -t.aim - v.aim;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        v.aim += d * Math.min(1, dt * 14);
        m.head.rotation.y = v.aim;
      }
      if (m.gun) {
        v.recoil = Math.max(0, v.recoil - dt * 6);
        const k = v.recoil * v.recoil * 0.06;
        if (m.recoilAxis === 'x') m.gun.position.x = 0.02 - k;
        else m.gun.position.x = -k;
      }
      if (m.spin) for (const [o, sp, ax] of m.spin) o.rotation[ax || 'y'] += sp * dt;
      if (m.bob) m.bob.position.y += Math.sin(this.time * 2.4 + t.id) * 0.0007;
      if (m.flicker) m.flicker.scale.setScalar(1 + (v.recoil > 0.5 ? 0.4 : 0) + Math.sin(this.time * 30 + t.id) * 0.03);
      if (m.pulse) m.pulse.scale.setScalar(1 + Math.sin(this.time * 3 + t.id) * 0.15);
      if (v.pop > 0) {
        v.pop = Math.max(0, v.pop - dt * 4);
        const s = 1 + Math.sin(v.pop * Math.PI) * 0.12;
        m.root.scale.set(s, 1 + Math.sin(v.pop * Math.PI) * 0.2, s);
      }
    }
  }
}

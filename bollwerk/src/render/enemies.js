// Gegner als instanzierte Meshes je Art – hunderte Einheiten bei wenigen Draw-Calls.
// Jede Art hat ihre eigene Bewegung (hüpfen, rennen, stampfen, fliegen, rotieren, schweben),
// dazu Rim-Licht, Treffer-Stauchung, Todesanimation, Eisblöcke und Boss-Details.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ENEMIES } from '../game/data.js';

const MAX = 600;
const SCALE = 1.2; // Gegner etwas größer als ihr Kollisionsradius

export function shapeFor(type) {
  switch (type) {
    case 'runner': {
      const g = new THREE.ConeGeometry(0.75, 2, 8);
      g.rotateZ(-Math.PI / 2);
      g.scale(1, 0.8, 1);
      return { geo: g, flat: false, eyes: [0.25, 0.25, 0.32], anim: 'run' };
    }
    case 'brute':
      return { geo: new RoundedBoxGeometry(1.7, 1.25, 1.5, 2, 0.3), flat: false, eyes: [0.86, 0.15, 0.32], anim: 'stomp', horns: 0.5 };
    case 'glider': {
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(1.3, 0.38, 1.1);
      return { geo: g, flat: true, eyes: [0.7, 0.05, 0.28], anim: 'fly', wings: true };
    }
    case 'splitter':
      return { geo: new THREE.IcosahedronGeometry(1, 0), flat: true, eyes: [0.8, 0.2, 0.3], anim: 'spin' };
    case 'shard':
      return { geo: new THREE.TetrahedronGeometry(1.2, 0), flat: true, anim: 'tumble' };
    case 'mender':
      return { geo: new THREE.SphereGeometry(1, 18, 12), flat: false, eyes: [0.88, 0.2, 0.3], anim: 'float' };
    case 'warden':
      return { geo: new THREE.DodecahedronGeometry(1, 0), flat: true, eyes: [0.86, 0.2, 0.3], anim: 'hop' };
    case 'icebreaker': {
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(1.15, 1.25, 1.15);
      return { geo: g, flat: true, eyes: [0.66, 0.25, 0.25], anim: 'crystal' };
    }
    case 'colossus':
      return { geo: new THREE.DodecahedronGeometry(1, 1).scale(1.15, 0.95, 1.1), flat: true, eyes: [1.0, 0.2, 0.35], anim: 'stomp', horns: 0.75, glowEyes: true };
    case 'brood':
      return { geo: new THREE.IcosahedronGeometry(1, 1), flat: true, eyes: [0.95, 0.25, 0.3], anim: 'pulse', glowEyes: true };
    case 'phantom': {
      const g = mergeGeometries([new THREE.SphereGeometry(0.9, 20, 14).toNonIndexed(), new THREE.ConeGeometry(0.85, 1.3, 20, 1, true).rotateX(Math.PI).translate(0, -0.75, 0).toNonIndexed()]);
      return { geo: g, flat: false, eyes: [0.8, 0.2, 0.32], anim: 'float', glowEyes: true };
    }
    case 'aegis':
      return { geo: new RoundedBoxGeometry(1.7, 1.3, 1.7, 3, 0.45), flat: false, eyes: [0.86, 0.2, 0.36], anim: 'stomp', glowEyes: true, plates: true };
    case 'broodling':
      return { geo: new THREE.SphereGeometry(1, 10, 8), flat: false, anim: 'hop' };
    default:
      return { geo: new THREE.SphereGeometry(1, 20, 14), flat: false, eyes: [0.86, 0.22, 0.32], anim: 'hop' };
  }
}

// Rim-Licht: Kanten leuchten in der eigenen Farbe – gibt den Gegnern Kontur vor jedem Hintergrund
function rimMaterial(flat) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.36, metalness: 0.05, flatShading: flat });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        vec3 vd = normalize(vViewPosition);
        float fr = pow(1.0 - clamp(abs(dot(normal, vd)), 0.0, 1.0), 2.4);
        totalEmissiveRadiance += diffuseColor.rgb * fr * 0.55 + vec3(fr * 0.05);
      }`,
    );
  };
  return m;
}

// Schildblase: am Rand dicht, in der Mitte fast durchsichtig
function bubbleMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, transparent: true, depthWrite: false, roughness: 0.1 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `vec3 vdB = normalize(vViewPosition);
      float frB = pow(1.0 - clamp(abs(dot(normal, vdB)), 0.0, 1.0), 2.0);
      gl_FragColor = vec4(outgoingLight + diffuseColor.rgb * frB * 1.5, 0.06 + frB * 0.75);`,
    );
  };
  return m;
}

function inst(geo, mat, max, shadow = false) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = shadow;
  return m;
}

export class EnemyViews {
  constructor(board) {
    this.board = board;
    this.fx = null;
    this.group = new THREE.Group();
    board.stage.scene.add(this.group);
    this.meshes = {};
    this.shapes = {};
    for (const type of Object.keys(ENEMIES)) {
      const s = shapeFor(type);
      const m = inst(s.geo, rimMaterial(s.flat), MAX, true);
      this.group.add(m);
      this.meshes[type] = m;
      this.shapes[type] = s;
    }
    const P = (geo, mat, max, sh) => {
      const m = inst(geo, mat, max, sh);
      this.group.add(m);
      return m;
    };
    this.eyeWhites = P(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), MAX * 2);
    this.eyes = P(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: '#1b1d26', roughness: 0.2 }), MAX * 2);
    this.glowEyes = P(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd84a').multiplyScalar(1.8), toneMapped: false }), 40);
    this.shields = P(new THREE.SphereGeometry(1, 24, 16), bubbleMaterial('#7fb6ff'), MAX);
    this.shields.renderOrder = 3;
    this.halos = P(new THREE.TorusGeometry(1, 0.12, 6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#59d39a').multiplyScalar(1.8), toneMapped: false }), MAX);
    this.shadows = P(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }), MAX);
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.7, 0, 1.25, 0.55, 0, 0.9, 0, 0, 0, 0.55, 0, 0.9, -0.7, 0, 1.25], 3));
    wing.computeVertexNormals();
    this.wings = P(wing, new THREE.MeshStandardMaterial({ color: '#e8f8ff', emissive: '#7fd2ff', emissiveIntensity: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), MAX * 2, true);
    this.horns = P(new THREE.ConeGeometry(0.16, 0.55, 8).translate(0, 0.27, 0), new THREE.MeshStandardMaterial({ color: '#f1e6d2', roughness: 0.5 }), 200, true);
    this.ice = P(new RoundedBoxGeometry(1, 1, 1, 2, 0.12), new THREE.MeshStandardMaterial({ color: '#cdf3ff', emissive: '#7fd6ff', emissiveIntensity: 0.35, transparent: true, opacity: 0.45, roughness: 0.05, depthWrite: false }), MAX);
    this.ice.renderOrder = 4;
    this.plates = P(new RoundedBoxGeometry(0.5, 0.75, 0.12, 2, 0.05), new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#e0a020', emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.25 }), 40, true);
    this.bossRings = P(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 40);
    this.ghosts = P(this.shapes.phantom.geo, new THREE.MeshBasicMaterial({ color: '#9d8cff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), 20);

    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.q2 = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.e = new THREE.Euler();
    this.c = new THREE.Color();
    this.up = new THREE.Vector3(0, 1, 0);
    this.time = 0;
    this.state = new Map(); // id → { yaw, roll, age, phase, step }
    this.dying = [];
    this.tints = new Map();
  }

  tint(hex) {
    let c = this.tints.get(hex);
    if (!c) this.tints.set(hex, (c = new THREE.Color(hex)));
    return c;
  }

  st(e) {
    let s = this.state.get(e.id);
    if (!s) {
      s = { yaw: -Math.atan2(e.dy, e.dx), roll: 0, age: 0, phase: Math.random() * 6, step: 0, punch: 0 };
      this.state.set(e.id, s);
    }
    return s;
  }

  // Höhe des Körpermittelpunkts über dem Boden (ohne Animation) – für Balken, Strahlen, Texte
  baseHeight(e) {
    const size = e.def.size * SCALE;
    if (e.flying) return 0.95;
    if (e.type === 'phantom') return size * 1.6 + 0.1;
    if (e.type === 'mender') return size + 0.12;
    return size * (e.type === 'brute' || e.type === 'aegis' ? 0.66 : e.type === 'runner' ? 0.8 : 1) + 0.03;
  }

  worldPos(e, out) {
    const s = this.state.get(e.id);
    return out.set(this.board.wx(e.x), this.baseHeight(e) + (s?.lift || 0), this.board.wz(e.y));
  }

  die(ev) {
    const s = this.state.get(ev.id);
    const def = ENEMIES[ev.enemy];
    this.dying.push({ type: ev.enemy, x: this.board.wx(ev.x), z: this.board.wz(ev.y), y: ev.flying ? 0.95 : def.size * SCALE, yaw: s?.yaw || 0, size: def.size * SCALE, t: 0, max: def.boss ? 0.5 : 0.24, color: def.color });
    this.state.delete(ev.id);
  }

  update(dt, game) {
    this.time += dt;
    const T = this.time;
    const counts = {};
    for (const k in this.meshes) counts[k] = 0;
    const n = { eyes: 0, glow: 0, shields: 0, halos: 0, shadows: 0, wings: 0, horns: 0, ice: 0, plates: 0, rings: 0, ghosts: 0 };
    const { m4, q, q2, v, s, c, up } = this;
    const fx = this.fx;

    for (const e of game.enemies) {
      if (!e.alive) continue;
      const shape = this.shapes[e.type];
      const mesh = this.meshes[e.type];
      const i = counts[e.type];
      if (i >= MAX) continue;
      const S = this.st(e);
      const def = e.def;
      const size = def.size * SCALE;
      const moving = e.speed > 0 ? game.speedOf(e) / e.speed : 0;
      S.age += dt;
      S.phase += dt * moving * (shape.anim === 'run' ? 16 : shape.anim === 'stomp' ? 5 : 9) * (1 + (e.speed - 1) * 0.3);
      const ph = S.phase;
      const x = this.board.wx(e.x);
      const z = this.board.wz(e.y);
      let y = this.baseHeight(e);

      // Blickrichtung und Schräglage aus der Drehrate
      const want = -Math.atan2(e.dy, e.dx);
      let d = want - S.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const turn = d * Math.min(1, dt * 10);
      S.yaw += turn;
      S.roll += ((dt > 0 ? -turn / dt : 0) * 0.12 - S.roll) * Math.min(1, dt * 6);

      let sx = 1;
      let sy = 1;
      let sz = 1;
      let pitch = 0;
      let roll = 0;
      let spin = 0;
      switch (shape.anim) {
        case 'hop': {
          const h = Math.abs(Math.sin(ph));
          y += h * size * 0.45;
          const sq = Math.cos(ph) ** 2;
          sy = 1 - sq * 0.22 + h * 0.08;
          sx = sz = 1 + sq * 0.12;
          pitch = -0.12 * moving;
          break;
        }
        case 'run':
          y += Math.abs(Math.sin(ph)) * size * 0.25;
          pitch = -0.3 * moving;
          roll = Math.sin(ph) * 0.18;
          if (fx && moving > 0.5 && Math.random() < dt * 10) fx.dust(x, z, 0.04, 0.4);
          break;
        case 'stomp': {
          const st = Math.sin(ph * 2);
          y += Math.max(0, st) * size * 0.12;
          roll = Math.sin(ph) * (def.boss ? 0.09 : 0.12);
          sy = 1 - Math.max(0, -st) * 0.08;
          const stepNow = Math.floor((ph * 2) / Math.PI);
          if (stepNow !== S.step) {
            S.step = stepNow;
            if (fx && moving > 0.2) fx.dust(x, z, def.boss ? 0.12 : 0.07, def.boss ? 1.4 : 0.8);
            if (def.boss && moving > 0.2) this.board.stage.shake = Math.max(this.board.stage.shake, 0.18);
          }
          break;
        }
        case 'fly':
          y += Math.sin(T * 3 + e.id) * 0.07;
          roll = S.roll * 3;
          pitch = Math.sin(T * 2 + e.id) * 0.08;
          break;
        case 'spin':
          spin = T * 2.5 + e.id;
          y += Math.abs(Math.sin(ph * 0.8)) * size * 0.2;
          sx = sy = sz = 1 + Math.sin(T * 6 + e.id) * 0.06;
          break;
        case 'tumble':
          spin = T * 7 + e.id;
          pitch = T * 5;
          y += Math.abs(Math.sin(ph)) * size * 0.5;
          break;
        case 'float':
          y += Math.sin(T * 2.2 + e.id) * 0.06;
          pitch = -0.08;
          break;
        case 'crystal':
          spin = T * 1.2 + e.id;
          y += Math.abs(Math.sin(ph * 0.7)) * size * 0.15;
          if (fx && Math.random() < dt * 4) fx.sparkle(x, y + size, z, '#e6fbff');
          break;
        case 'pulse': {
          const p = Math.sin(T * 3 + e.id);
          sx = sz = 1 + p * 0.07;
          sy = 1 - p * 0.07;
          y += Math.abs(Math.sin(ph * 0.6)) * size * 0.08;
          break;
        }
        default:
      }
      // Koloss holt aus: duckt sich, glüht, dann Sprung beim Stampfer
      if (e.windup > 0) {
        const k = 1 - e.windup / (def.stomp?.windup || 1);
        sy *= 1 - k * 0.25;
        sx *= 1 + k * 0.12;
        sz *= 1 + k * 0.12;
        y -= k * size * 0.15;
      }
      // Treffer-Stauchung
      if (e.hitT > 0) {
        const k = e.hitT / 0.12;
        sx *= 1 + k * 0.14;
        sz *= 1 + k * 0.14;
        sy *= 1 - k * 0.14;
      }
      if (e.freezeT > 0) {
        sx = sz = 1;
        sy = 1;
        roll = pitch = 0;
      }
      // Auftauchen aus dem Portal
      const grow = Math.min(1, S.age * 2.5);
      const ease = 1 - (1 - grow) ** 3;
      if (!e.flying) y -= (1 - ease) * size;
      S.lift = y - this.baseHeight(e);

      q.setFromAxisAngle(up, S.yaw);
      if (spin) q.multiply(q2.setFromAxisAngle(this.v2.set(0, 1, 0), spin));
      if (pitch) q.multiply(q2.setFromAxisAngle(this.v2.set(0, 0, 1), pitch));
      if (roll) q.multiply(q2.setFromAxisAngle(this.v2.set(1, 0, 0), roll));
      const sc = size * ease;
      const phased = e.phaseT > 0;
      m4.compose(v.set(x, y, z), q, s.set(sc * sx, sc * sy, sc * sz));
      if (phased && n.ghosts < 20) {
        // Phantom in der Zwischenwelt: nur als flackernder Geist sichtbar
        this.ghosts.setMatrixAt(n.ghosts++, m4);
        m4.makeScale(0, 0, 0);
      }
      mesh.setMatrixAt(i, m4);
      counts[e.type]++;

      // Farbe: Statuseffekte und Treffer
      c.set(def.color);
      if (e.freezeT > 0) c.lerp(this.tint('#d8f6ff'), 0.6);
      else if (e.slowT > 0) c.lerp(this.tint('#9ad8ff'), 0.3);
      if (e.burnT > 0) c.lerp(this.tint('#ff7a2a'), 0.25 + Math.sin(T * 20 + e.id) * 0.1);
      if (e.poisonT > 0) c.lerp(this.tint('#9be35a'), 0.3);
      if (e.windup > 0) c.lerp(this.tint('#ff5030'), (1 - e.windup / (def.stomp?.windup || 1)) * 0.6);
      if (e.hitT > 0) c.lerp(this.tint('#ffffff'), Math.min(1, e.hitT * 8) * 0.75);
      mesh.setColorAt(i, c);

      const center = this.v2.set(x, y, z);
      // Augen (blinzeln gelegentlich)
      if (shape.eyes && !phased) {
        const [fx_, fy, fz] = shape.eyes;
        const blink = Math.sin(T * 0.7 + e.id * 1.7) > 0.985 ? 0.15 : 1;
        for (const side of [-1, 1]) {
          if (shape.glowEyes && def.boss) {
            if (n.glow < 40) {
              v.set(fx_ + 0.04, fy, fz * side).multiply(s.set(sx, sy, sz)).applyQuaternion(q).multiplyScalar(sc).add(center);
              m4.compose(v, q, s.set(sc * 0.085, sc * 0.065 * blink, sc * 0.085));
              this.glowEyes.setMatrixAt(n.glow++, m4);
            }
            continue;
          }
          if (n.eyes >= MAX * 2) continue;
          v.set(fx_, fy, fz * side).multiply(s.set(sx, sy, sz)).applyQuaternion(q).multiplyScalar(sc).add(center);
          m4.compose(v, q, s.set(sc * 0.2, sc * 0.24 * blink, sc * 0.2));
          this.eyeWhites.setMatrixAt(n.eyes, m4);
          v.set(fx_ + 0.12, fy, fz * side).multiply(s.set(sx, sy, sz)).applyQuaternion(q).multiplyScalar(sc).add(center);
          m4.compose(v, q, s.set(sc * 0.11, sc * 0.14 * blink, sc * 0.11));
          this.eyes.setMatrixAt(n.eyes++, m4);
        }
      }
      // Hörner
      if (shape.horns && n.horns < 198) {
        for (const side of [-1, 1]) {
          v.set(0.35, 0.75 * sy, 0.55 * side).applyQuaternion(q).multiplyScalar(sc).add(center);
          q2.copy(q).multiply(new THREE.Quaternion().setFromEuler(this.e.set(side * 0.55, 0, -0.35)));
          m4.compose(v, q2, s.setScalar(sc * shape.horns));
          this.horns.setMatrixAt(n.horns++, m4);
        }
      }
      // Flügel mit Schlag
      if (shape.wings && n.wings < MAX * 2 - 2) {
        const flap = Math.sin(T * 11 + e.id) * 0.6;
        for (const side of [-1, 1]) {
          v.set(-0.1, 0.05, 0.35 * side).applyQuaternion(q).multiplyScalar(sc).add(center);
          q2.copy(q).multiply(new THREE.Quaternion().setFromEuler(this.e.set(side * flap, side < 0 ? Math.PI : 0, 0)));
          m4.compose(v, q2, s.setScalar(sc * 1.1));
          this.wings.setMatrixAt(n.wings++, m4);
        }
      }
      // Schilde
      if (e.maxShield > 0 && e.shield > 0) {
        const f = 0.55 + 0.45 * (e.shield / e.maxShield);
        const wob = 1 + Math.sin(T * 5 + e.id) * 0.03;
        m4.compose(center, q.identity(), s.setScalar(sc * 1.65 * f * wob));
        this.shields.setMatrixAt(n.shields++, m4);
      }
      // Heilerring
      if (def.heal) {
        q2.setFromEuler(this.e.set(Math.PI / 2 + Math.sin(T * 1.3 + e.id) * 0.3, T * 2, 0));
        m4.compose(center, q2, s.setScalar(sc * 1.45 * (1 + Math.sin(T * 4 + e.id) * 0.08)));
        this.halos.setMatrixAt(n.halos++, m4);
      }
      // Eisblock
      if (e.freezeT > 0) {
        m4.compose(center, q.setFromAxisAngle(up, S.yaw), s.set(sc * 2.2, sc * 2.1, sc * 2.0));
        this.ice.setMatrixAt(n.ice++, m4);
      }
      // Ägis: kreisende Schildplatten
      if (shape.plates && n.plates < 36) {
        for (let k = 0; k < 4; k++) {
          const a = T * 1.4 + (k / 4) * Math.PI * 2;
          v.set(Math.cos(a) * sc * 1.9, sc * 0.2 + Math.sin(T * 3 + k) * 0.05, Math.sin(a) * sc * 1.9).add(center);
          q2.setFromAxisAngle(up, -a + Math.PI / 2);
          m4.compose(v, q2, s.setScalar(sc));
          this.plates.setMatrixAt(n.plates++, m4);
        }
      }
      // Bossring am Boden
      if (def.boss && n.rings < 38) {
        const r = sc * 1.7 * (1 + (e.windup > 0 ? (1 - e.windup) * 1.2 : 0));
        m4.compose(v.set(x, 0.04, z), q.setFromAxisAngle(up, T * 0.8), s.set(r, 1, r));
        this.bossRings.setMatrixAt(n.rings, m4);
        this.bossRings.setColorAt(n.rings++, c.set(e.windup > 0 ? '#ff5030' : def.color).multiplyScalar(e.windup > 0 ? 1.4 : 0.7));
      }
      // Schatten für Schwebende
      if (e.flying || e.type === 'phantom' || e.type === 'mender') {
        m4.compose(v.set(x, 0.03, z), q.identity(), s.setScalar(sc * (e.flying ? 1.1 : 0.9)));
        this.shadows.setMatrixAt(n.shadows++, m4);
      }
    }

    // Todesanimation: kurz aufblähen, aufhellen, verschwinden
    let k = 0;
    for (const dd of this.dying) {
      dd.t += dt;
      if (dd.t >= dd.max) continue;
      this.dying[k++] = dd;
      const mesh = this.meshes[dd.type];
      const i = counts[dd.type];
      if (i >= MAX) continue;
      const f = dd.t / dd.max;
      const sc = dd.size * (f < 0.35 ? 1 + f * 1.4 : 1.49 * (1 - (f - 0.35) / 0.65));
      q.setFromAxisAngle(up, dd.yaw + f * 2);
      m4.compose(v.set(dd.x, dd.y + f * 0.2, dd.z), q, s.set(sc, sc * (1 - f * 0.3), sc));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, c.set(dd.color).lerp(this.tint('#ffffff'), Math.min(1, f * 2)));
      counts[dd.type]++;
    }
    this.dying.length = k;

    for (const key in this.meshes) {
      const m = this.meshes[key];
      m.count = Math.min(MAX, counts[key]);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    const fin = (m, cnt) => {
      m.count = cnt;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    fin(this.eyes, n.eyes);
    fin(this.eyeWhites, n.eyes);
    fin(this.glowEyes, n.glow);
    fin(this.shields, n.shields);
    fin(this.halos, n.halos);
    fin(this.shadows, n.shadows);
    fin(this.wings, n.wings);
    fin(this.horns, n.horns);
    fin(this.ice, n.ice);
    fin(this.plates, n.plates);
    fin(this.bossRings, n.rings);
    fin(this.ghosts, n.ghosts);
    this.ghosts.material.opacity = 0.25 + Math.sin(T * 30) * 0.12;

    if (this.state.size > game.enemies.length + 80) {
      const alive = new Set(game.enemies.map((e) => e.id));
      for (const id of this.state.keys()) if (!alive.has(id)) this.state.delete(id);
    }
  }

  clear() {
    for (const k in this.meshes) this.meshes[k].count = 0;
    this.state.clear();
    this.dying.length = 0;
  }
}

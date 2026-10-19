// Rennsimulation mit Rapier. Läuft im Browser (Spiel) und auf dem Server (Prüfung der Läufe).
// Wichtig für die Server-Prüfung: Hier wird nur mit +, -, *, / und Math.sqrt gerechnet –
// diese Operationen sind in allen JavaScript-Engines exakt gleich. Kein Math.sin/cos/exp/pow.

import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { CHEESES } from './cheeses.js';

export const DT = 1 / 60;
export const MAX_TICKS = 60 * 180; // 3 Minuten
const MAX_YAW = 2.2; // rad/s
const JUMP_COOLDOWN = 45;
export const TUNE = { base: 20, speed: 1.5, damp: 6 };

let ready = null;
export function initPhysics() {
  ready ||= RAPIER.init();
  return ready;
}

// --- Vektorhilfen (nur Grundrechenarten) ---
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = (a) => Math.sqrt(dot(a, a));
function rotate(q, v) {
  // v' = v + 2w(q×v) + 2 q×(q×v)
  const t = scale(cross(q, v), 2);
  const u = cross(q, t);
  return { x: v.x + q.w * t.x + u.x, y: v.y + q.w * t.y + u.y, z: v.z + q.w * t.z + u.z };
}
// Drehung um die y-Achse aus einem rationalen Parameter (ohne Winkelfunktionen)
function yawQuat(u) {
  const d = 1 + u * u;
  const c = (1 - u * u) / d; // cos θ
  const s = (2 * u) / d; // sin θ
  // Halbwinkel: cos(θ/2) = sqrt((1+c)/2), sin(θ/2) = sign(s) sqrt((1-c)/2)
  const hc = Math.sqrt((1 + c) / 2);
  const hs = (s < 0 ? -1 : 1) * Math.sqrt((1 - c) / 2);
  return { x: 0, y: hs, z: 0, w: hc };
}

// Eingaben je Tick: steer ∈ [-100, 100], flags: 1 = Sprung, 2 = Zurücksetzen
export const JUMP = 1;
export const RESPAWN = 2;

export class Race {
  constructor(track, cheeseId) {
    const C = CHEESES[cheeseId];
    if (!C) throw new Error(`Unbekannter Käse: ${cheeseId}`);
    this.track = track;
    this.cheese = C;
    this.tick = 0;
    this.finished = false;
    this.finishTime = null;
    this.checkpoint = 0;
    this.respawns = 0;
    this.jumpCooldown = 0;
    this.events = [];
    this.grounded = false;
    this.maxSpeed = 0;
    this.flatTicks = 0;

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = DT;
    this.world = world;

    // Gelände
    const ground = RAPIER.ColliderDesc.heightfield(track.nz, track.nx, track.heights, {
      x: track.width,
      y: 1,
      z: track.length,
    })
      .setTranslation(0, 0, track.length / 2)
      .setFriction(0.9)
      .setRestitution(0.1);
    this.groundCollider = world.createCollider(ground);

    for (const r of track.rocks) {
      world.createCollider(RAPIER.ColliderDesc.ball(r.radius).setTranslation(r.x, r.y, r.z).setFriction(0.6).setRestitution(0.35));
    }
    this.bales = track.bales.map((b) => {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(b.x, b.y, b.z).setRotation(yawQuat(b.yaw - 1.5)).setCanSleep(true),
      );
      world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setDensity(90).setFriction(0.8).setRestitution(0.1), body);
      return body;
    });

    // Der Käse: Zylinder, Achse = lokale y-Achse, quer zur Fahrtrichtung gedreht
    const s = track.start;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s.x, s.y + C.radius + 0.05, s.z)
        .setRotation({ x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 })
        .setCcdEnabled(true)
        .setCanSleep(false)
        .setAngularDamping(0.05),
    );
    world.createCollider(
      RAPIER.ColliderDesc.roundCylinder(C.halfWidth - 0.04, C.radius - 0.04, 0.04)
        .setDensity(C.density)
        .setFriction(C.friction)
        .setRestitution(C.restitution),
      body,
    );
    // Wie beim echten Rennen wird der Käse mit Schwung losgeschickt
    body.setLinvel({ x: 0, y: 0, z: 4 }, true);
    body.setAngvel({ x: 4 / C.radius, y: 0, z: 0 }, true);
    this.body = body;
    this.mass = body.mass();
    this.inertia = this.mass * C.radius * C.radius * 0.5;
    this.prev = { ...body.translation() };
    this.prevVel = { x: 0, y: 0, z: 0 };
    this.fwd = { x: 0, y: 0, z: 1 };
  }

  get time() {
    return this.finishTime ?? this.tick * DT;
  }

  isGrounded() {
    const p = this.body.translation();
    const ray = new RAPIER.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, this.cheese.radius + 0.3, true, undefined, undefined, undefined, this.body);
    return !!hit;
  }

  respawn() {
    const cp = this.track.checkpoints[this.checkpoint];
    const b = this.body;
    b.setTranslation({ x: cp.x, y: cp.y + this.cheese.radius + 0.4, z: cp.z }, true);
    b.setRotation({ x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 }, true);
    b.setLinvel({ x: 0, y: 0, z: 2 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.respawns++;
    this.prev = { ...b.translation() };
    this.events.push({ type: 'respawn' });
  }

  step(steer = 0, flags = 0) {
    if (this.finished || this.tick >= MAX_TICKS) return;
    const C = this.cheese;
    const b = this.body;
    if (flags & RESPAWN) this.respawn();

    const q = b.rotation();
    const v = b.linvel();
    const w = b.angvel();
    const axle = rotate(q, { x: 0, y: 1, z: 0 });
    const up = { x: 0, y: 1, z: 0 };
    let fwd = cross(axle, up);
    const fl = len(fwd);
    if (fl > 0.2) fwd = scale(fwd, 1 / fl);
    else fwd = this.fwd; // liegt flach – letzte Fahrtrichtung beibehalten
    this.fwd = fwd;
    const tilt = axle.y; // 0 = aufrecht, ±1 = flach
    const speed = len(v);
    const grounded = this.isGrounded();
    this.grounded = grounded;
    const I = this.inertia;

    // Lenken: Giergeschwindigkeit auf den Zielwert regeln.
    // steer > 0 = nach rechts aus Sicht der Kamera (die hinter dem Käse Richtung +z blickt), also Richtung −x
    const s = Math.max(-100, Math.min(100, steer)) / 100;
    const target = -s * MAX_YAW * C.steer * (grounded ? 1 : 0.35);
    b.applyTorqueImpulse(scale(up, (target - w.y) * I * 0.25), true);

    // Aufrichten: ein schnell rollender Laib bleibt stabil (vereinfachte Kreiselwirkung)
    const flat = tilt > 0.8 || tilt < -0.8;
    if (flat) this.flatTicks++;
    if (!flat) {
      const k = C.stability * (TUNE.base + Math.min(speed, 25) * TUNE.speed);
      const wf = dot(w, fwd);
      b.applyTorqueImpulse(scale(fwd, (-tilt * k - wf * TUNE.damp) * I * DT), true);
    }

    // Luftwiderstand (quadratisch)
    const kd = 0.006 * C.drag;
    b.applyImpulse(scale(v, -speed * kd * DT * this.mass), true);

    // Sprung bzw. Aufstellen, wenn der Laib flach liegt
    if (this.jumpCooldown > 0) this.jumpCooldown--;
    if (flags & JUMP && grounded && this.jumpCooldown === 0) {
      this.jumpCooldown = JUMP_COOLDOWN;
      if (flat || tilt > 0.5 || tilt < -0.5) {
        b.applyImpulse({ x: 0, y: 5.5 * this.mass, z: 0 }, true);
        // Achse in die Waagerechte drehen
        const h = { x: axle.x, y: 0, z: axle.z };
        const hl = len(h);
        const target = hl > 0.05 ? scale(h, 1 / hl) : cross(up, fwd);
        b.applyTorqueImpulse(scale(cross(axle, target), 9 * I), true);
        this.events.push({ type: 'flip' });
      } else {
        b.applyImpulse({ x: 0, y: 4.2 * this.mass, z: 0 }, true);
        this.events.push({ type: 'jump' });
      }
    }

    this.prev = { ...b.translation() };
    this.world.step();
    this.tick++;

    const p = b.translation();
    const nv = b.linvel();
    // Aufprall-Ereignisse (für Ton und Partikel)
    const dv = len({ x: nv.x - v.x, y: nv.y - v.y, z: nv.z - v.z });
    if (dv > 2.5) this.events.push({ type: 'impact', strength: dv, x: p.x, y: p.y, z: p.z });
    const ns = len(nv);
    if (ns > this.maxSpeed) this.maxSpeed = ns;

    // Kontrollpunkte
    const cps = this.track.checkpoints;
    while (this.checkpoint + 1 < cps.length && p.z > cps[this.checkpoint + 1].z) {
      this.checkpoint++;
      this.events.push({ type: 'checkpoint', index: this.checkpoint });
    }

    // Ziel: Zeit auf Bruchteile eines Ticks genau
    const fz = this.track.finishZ;
    if (p.z >= fz && this.prev.z < fz) {
      const frac = (fz - this.prev.z) / (p.z - this.prev.z);
      this.finishTime = (this.tick - 1 + frac) * DT;
      this.finished = true;
      this.events.push({ type: 'finish', time: this.finishTime });
      return;
    }

    // Aus der Strecke gefallen → automatisch zurück
    const ground = this.track.heightAt(p.x, p.z);
    if (p.y < ground - 6 || p.x < -this.track.width / 2 - 2 || p.x > this.track.width / 2 + 2 || p.z < -5) this.respawn();
  }

  transform() {
    const b = this.body;
    return { p: b.translation(), q: b.rotation(), v: b.linvel() };
  }

  free() {
    this.world.free();
  }
}

// Ganzen Lauf aus Eingaben nachspielen (Server-Prüfung, Ghost-Erzeugung)
export function replay(track, cheeseId, ticks, { recordEvery = 2 } = {}) {
  const race = new Race(track, cheeseId);
  const frames = [];
  for (let i = 0; i < ticks.length && !race.finished; i++) {
    race.step(ticks[i].steer, ticks[i].flags);
    if (recordEvery && race.tick % recordEvery === 0) {
      const { p, q } = race.transform();
      frames.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
    }
  }
  const result = { finished: race.finished, time: race.finished ? race.finishTime : null, ticks: race.tick, respawns: race.respawns, frames };
  race.free();
  return result;
}

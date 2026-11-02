// Die beiden Geister: Bewegung, Sporenhaushalt und was ihre Steuerung in der Welt anrichtet.
import { HOVER, WATER, TETHER } from '../config.js';
import { smoothstep } from '../noise.js';

export const NAMES = ['Hyphe', 'Keim'];
export const ROLES = ['Pilzgeist', 'Samengeist'];

export const BOONS = [
  { name: 'Weite Fäden', text: 'Der Faden zwischen euch reicht weiter.' },
  { name: 'Tiefe Wurzeln', text: 'Eure Spuren werden breiter.' },
  { name: 'Sporenfülle', text: 'Ihr tragt mehr Sporen.' },
  { name: 'Glühende Pfade', text: 'Was ihr im Vorbeiziehen sät, wächst üppiger.' },
  { name: 'Windreiter', text: 'Ihr gleitet schneller.' },
  { name: 'Echo des Waldes', text: 'Der Wald gibt euch schneller Sporen zurück.' },
];

export function boonsFor(n) {
  return {
    tether: TETHER * (n >= 1 ? 1.3 : 1),
    radius: n >= 2 ? 1.25 : 1,
    maxSpores: 100 + (n >= 3 ? 60 : 0),
    trail: n >= 4 ? 0.62 : 0.45,
    speed: n >= 5 ? 1.18 : 1,
    regen: 1 + Math.max(0, n - 5) * 0.25,
  };
}

export const COST = {
  weave: 0.11, // Sporen pro neuer Myzeleinheit
  thread: 0.05,
  pulse: 12,
  cleanse: 0.05, // Sporen pro geläuterter Fäulniseinheit beim Weben
};

export class Player {
  constructor(i, binding) {
    this.i = i;
    this.binding = binding;
    this.name = NAMES[i];
    this.hue = i === 0 ? 0 : 1;
    this.x = 0;
    this.z = 0;
    this.y = 3;
    this.vx = 0;
    this.vz = 0;
    this.spores = 70;
    this.max = 100;
    this.pulseCd = 0;
    this.activity = 0;
    this.weaving = false;
    this.boosting = false;
    this.decompose = null; // { e, t }
    this.ritual = false;
    this.lastPaint = 0;
    this.denyCd = 0;
  }

  get energy() {
    return this.spores / this.max;
  }

  // Bewegung relativ zur Kamera
  move(inp, dt, { yaw, field, boons, trees }) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const wx = cy * inp.mx + sy * inp.my;
    const wz = -sy * inp.mx + cy * inp.my;
    this.boosting = inp.boost > 0.3;
    const speed = (this.boosting ? 15 : 8.5) * boons.speed;
    const k = Math.min(1, dt * (Math.hypot(wx, wz) > 0.1 ? 5 : 3));
    this.vx += (wx * speed - this.vx) * k;
    this.vz += (wz * speed - this.vz) * k;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    // Stämme der Mutterbäume sind fest
    for (const s of trees) {
      const dx = this.x - s.x;
      const dz = this.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.6 && d > 0.001) {
        this.x = s.x + (dx / d) * 3.6;
        this.z = s.z + (dz / d) * 3.6;
      }
    }
    const ahead = field.height(this.x + this.vx * 0.25, this.z + this.vz * 0.25);
    const ground = Math.max(field.height(this.x, this.z), ahead, WATER);
    const target = ground + HOVER + Math.sin(performance.now() / 600 + this.i * 2) * 0.15;
    this.y += (target - this.y) * Math.min(1, dt * 7);
    if (this.y < ground + 0.6) this.y = ground + 0.6;
  }

  // Spuren in der Welt
  act(inp, dt, { sim, boons, perks }) {
    const sample = sim.sample(this.x, this.z);
    this.max = boons.maxSpores;
    // passiv: wer sich bewegt, hinterlässt feine Hyphen
    const sp = Math.hypot(this.vx, this.vz);
    sim.paint(this.x, this.z, 2.1 * boons.radius, boons.trail * smoothstep(0.5, 3, sp) + 0.08, this.hue, 0.45);
    // Weben: kräftig, kostet Sporen
    this.weaving = inp.weave > 0.3 && this.spores > 0.5;
    let spent = 0;
    if (this.weaving) {
      // Weben läutert zuerst die Fäulnis, dann wächst Myzel
      const removed = sim.cleanse(this.x, this.z, 3.8 * boons.radius, Math.min(1, dt * 5));
      const added = sim.paint(this.x, this.z, 3.8 * boons.radius, 1, this.hue, 0.55);
      spent += added * COST.weave + removed * COST.cleanse;
    }
    // Fäulnis zehrt an den Sporen
    this.inRot = sample.B > 0.35;
    if (this.inRot && !this.weaving) spent += 3.5 * sample.B * perks.rotDrain * dt;
    // Der Wald gibt zurück: Regeneration auf lebendigem Boden
    const regen = 2.6 * boons.regen * perks.regen * smoothstep(0.45, 0.9, sample.L) * (this.weaving ? 0.3 : 1) * (1 - sample.B);
    this.spores = Math.min(this.max, Math.max(0, this.spores - spent + regen * dt));
    this.pulseCd = Math.max(0, this.pulseCd - dt);
    this.denyCd = Math.max(0, this.denyCd - dt);
    const targetAct = this.weaving ? 1 : this.boosting ? 0.4 : 0;
    this.activity += (targetAct - this.activity) * Math.min(1, dt * 6);
    return sample;
  }

  tryPulse(sim, boons, perks) {
    if (this.pulseCd > 0) return false;
    if (this.spores < COST.pulse) return false;
    this.spores -= COST.pulse;
    this.pulseCd = 0.8;
    const r = 7.5 * boons.radius * perks.pulseRadius;
    sim.cleanse(this.x, this.z, r + 1, perks.pulseCleanse);
    sim.paint(this.x, this.z, r, 0.92, this.hue, 1);
    sim.excite(this.x, this.z, 2);
    this.activity = 1.6;
    return true;
  }
}

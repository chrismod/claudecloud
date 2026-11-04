// Hüterpilze: Bauwerke, die die Spieler mit Sporenkernen pflanzen. Reine Logik.
//  Sporenturm   – pulst regelmäßig: spinnt Myzel, läutert Fäulnis, trifft Moderlinge
//  Leuchtschirm – hält die Fäulnis in seinem Umkreis fern (wie ein kleiner Mutterbaum)
//  Quellpilz    – füllt die Sporen von Geistern in der Nähe auf und lässt den Boden erblühen
// Moderlinge greifen Hüterpilze an; webende Geister reparieren sie.
import { WATER } from '../config.js';

export const GUARDIAN_TYPES = {
  tower: { name: 'Sporenturm', cost: 3, hp: 100, radius: 11, text: 'Pulst alle 5 s: spinnt Myzel, läutert Fäulnis, trifft Moderlinge' },
  lamp: { name: 'Leuchtschirm', cost: 2, hp: 80, radius: 18, text: 'Hält die Fäulnis 18 m fern' },
  spring: { name: 'Quellpilz', cost: 2, hp: 80, radius: 12, text: 'Füllt die Sporen von Geistern in der Nähe auf' },
};
export const GUARDIAN_ORDER = ['tower', 'lamp', 'spring'];

export function createGuardians(state, { field }) {
  const s = Object.assign({ list: [], nextId: 1 }, state || {});
  for (const g of s.list) g.t ??= Math.random() * 5;

  function canPlace(type, x, z, ctx) {
    const T = GUARDIAN_TYPES[type];
    if (!T) return 'unbekannt';
    if ((ctx.cores ?? 0) < T.cost) return `Zu wenige Sporenkerne (${T.cost} nötig)`;
    if (field.height(x, z) < WATER + 0.3) return 'Nicht im Wasser';
    if (s.list.some((g) => Math.hypot(g.x - x, g.z - z) < 7)) return 'Zu nah an einem anderen Hüterpilz';
    if ((ctx.sites ?? []).some((t) => Math.hypot(t.x - x, t.z - z) < 7)) return 'Zu nah am Mutterbaum';
    if ((ctx.nests ?? []).some((n) => Math.hypot(n.x - x, n.z - z) < 9)) return 'Zu nah am Moderherz';
    return null;
  }

  function place(type, x, z, ctx) {
    const err = canPlace(type, x, z, ctx);
    if (err) return { ok: false, reason: err };
    const T = GUARDIAN_TYPES[type];
    const g = { id: s.nextId++, type, x, z, hp: T.hp, t: 1.5, born: 0 };
    s.list.push(g);
    return { ok: true, g, cost: T.cost };
  }

  // ctx: { sim, enc, players, dt-unabhängige Zeit }
  function update(dt, ctx) {
    const ev = [];
    for (let i = s.list.length - 1; i >= 0; i--) {
      const g = s.list[i];
      const T = GUARDIAN_TYPES[g.type];
      g.born = Math.min(1, (g.born ?? 1) + dt / 1.5);
      g.hurt = Math.max(0, (g.hurt ?? 0) - dt * 2);
      // Moderlinge nagen am Hüterpilz
      for (const m of ctx.enc.moderlings) {
        if (m.state !== 'hunt') continue;
        if (Math.hypot(m.x - g.x, m.z - g.z) < 2.2) {
          g.hp -= dt * 6;
          g.hurt = 1;
        }
      }
      // webende Geister reparieren
      for (const p of ctx.players)
        if (p.weaving && Math.hypot(p.x - g.x, p.z - g.z) < 5 && g.hp < T.hp) {
          g.hp = Math.min(T.hp, g.hp + dt * 18);
          g.repairing = 0.3;
        }
      g.repairing = Math.max(0, (g.repairing ?? 0) - dt);
      if (g.hp <= 0) {
        s.list.splice(i, 1);
        ev.push({ type: 'guardianLost', g });
        continue;
      }
      if (g.born < 1) continue;
      if (g.type === 'tower') {
        g.t -= dt;
        if (g.t <= 0) {
          g.t = 5;
          ctx.sim.cleanse(g.x, g.z, T.radius, 0.9);
          ctx.sim.paint(g.x, g.z, T.radius * 0.8, 0.75, 0.5, 0.5);
          ctx.sim.excite(g.x, g.z, 2);
          ev.push({ type: 'towerPulse', g, hits: ctx.enc.pulse(g.x, g.z, T.radius, -1) });
        }
      } else if (g.type === 'spring') {
        for (const p of ctx.players)
          if (Math.hypot(p.x - g.x, p.z - g.z) < T.radius) {
            const before = p.spores;
            p.spores = Math.min(p.max, p.spores + dt * 7);
            if (p.spores > before) g.giving = 0.3;
          }
        g.giving = Math.max(0, (g.giving ?? 0) - dt);
        g.t -= dt;
        if (g.t <= 0) {
          g.t = 3;
          ctx.sim.paint(g.x, g.z, 6, 0.85, 0.5, 0.3);
          ctx.sim.bloom(g.x, g.z, 5, 0.8);
        }
      }
    }
    return ev;
  }

  return {
    state: s,
    list: () => s.list,
    canPlace,
    place,
    update,
    protectors: () => s.list.filter((g) => g.type === 'lamp').map((g) => ({ x: g.x, z: g.z, r: GUARDIAN_TYPES.lamp.radius })),
  };
}

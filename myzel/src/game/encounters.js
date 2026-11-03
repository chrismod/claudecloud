// Begegnungen: verirrte Lichter, Moderlinge und Sternsporen. Reine Logik ohne three.js –
// gibt Ereignisse zurück, die main.js in Anzeige, Klang und Fortschritt übersetzt.
import { WATER } from '../config.js';

export const POWERS = [
  { id: 'weaver', name: 'Sternenweber', text: 'Weben kostet keine Sporen', dur: 40 },
  { id: 'storm', name: 'Lichtsturm', text: 'Doppelt so weiter Sporenpuls', dur: 40 },
  { id: 'wind', name: 'Windgeist', text: 'Ihr gleitet viel schneller', dur: 40 },
  { id: 'bloom', name: 'Großes Erblühen', text: 'Rings um euch erblüht der Wald', dur: 0 },
];

const WISP_HUES = [0.95, 0.75, 0.58, 0.12, 0.32];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createEncounters({ field, sim, rand = Math.random }) {
  const wisps = [];
  const moderlings = [];
  let star = null;
  let nextStar = 35;
  let wispT = 2;
  let modT = 4;
  let nextId = 1;

  const dry = (x, z) => field.height(x, z) > WATER + 0.4;

  function findSpot(fx, fz, rMin, rMax, ok, tries = 14) {
    for (let k = 0; k < tries; k++) {
      const a = rand() * Math.PI * 2;
      const r = rMin + rand() * (rMax - rMin);
      const x = fx + Math.cos(a) * r;
      const z = fz + Math.sin(a) * r;
      if (dry(x, z) && sim.isLoaded(Math.floor(x), Math.floor(z)) && ok(x, z)) return { x, z };
    }
    return null;
  }

  // --- Verirrte Lichter ------------------------------------------------------------------------
  function spawnWisp(ctx) {
    const nests = ctx.nests;
    let spot = null;
    if (nests.length && rand() < 0.45) {
      const n = nests[Math.floor(rand() * nests.length)];
      spot = findSpot(n.x, n.z, 9, 18, () => true, 8);
    }
    spot ??= findSpot(ctx.focus.x, ctx.focus.z, 55, 110, (x, z) => sim.sample(x, z).L < 0.35 && !ctx.awakeSites.some((s) => Math.hypot(s.x - x, s.z - z) < 45));
    if (!spot) return null;
    const w = { id: nextId++, x: spot.x, z: spot.z, y: field.height(spot.x, spot.z) + 1.4, state: 'lost', hue: WISP_HUES[Math.floor(rand() * WISP_HUES.length)], light: 1, follower: -1, t: rand() * 10, trapped: false };
    w.trapped = sim.sample(w.x, w.z).B > 0.35;
    if (w.trapped) w.state = 'trapped';
    wisps.push(w);
    return w;
  }

  function updateWisps(dt, ctx, ev) {
    wispT -= dt;
    const free = wisps.filter((w) => w.state === 'lost' || w.state === 'trapped').length;
    if (wispT <= 0) {
      wispT = 6;
      if (free < 2) {
        const w = spawnWisp(ctx);
        if (w) ev.push({ type: 'wispSpawn', w });
      }
    }
    const chains = new Map();
    for (let i = wisps.length - 1; i >= 0; i--) {
      const w = wisps[i];
      w.t += dt;
      const s = sim.sample(w.x, w.z);
      if (w.state === 'trapped') {
        if (s.B < 0.18) {
          w.state = 'lost';
          ev.push({ type: 'wispFreed', w });
        }
      } else if (w.state === 'lost') {
        if (s.B > 0.45) w.state = 'trapped';
        for (const p of ctx.players) {
          if (dist(p, w) < 3.4 && (chains.get(p.i)?.length ?? countFollowers(p.i)) < 4) {
            w.state = 'follow';
            w.follower = p.i;
            w.light = Math.max(w.light, 0.5);
            ev.push({ type: 'wispJoin', w, p });
            break;
          }
        }
      }
      if (w.state === 'follow') {
        const p = ctx.players.find((q) => q.i === w.follower);
        if (!p) {
          w.state = 'lost';
          continue;
        }
        const chain = chains.get(p.i) ?? [];
        chains.set(p.i, chain);
        const lead = chain.length ? chain[chain.length - 1] : p;
        chain.push(w);
        const d = dist(lead, w);
        const gap = chain.length === 1 ? 2.2 : 1.6;
        if (d > gap) {
          const k = Math.min(1, dt * 6) * (d - gap) / d;
          w.x += (lead.x - w.x) * k;
          w.z += (lead.z - w.z) * k;
        }
        // Fäulnis zehrt am Licht
        if (s.B > 0.4) w.light -= dt * 0.22 * s.B;
        else w.light = Math.min(1, w.light + dt * 0.04);
        if (w.light <= 0) {
          w.state = 'lost';
          w.light = 0.35;
          w.follower = -1;
          ev.push({ type: 'wispLost', w });
        }
        const home = ctx.awakeSites.find((t) => Math.hypot(t.x - w.x, t.z - w.z) < 15);
        if (home) {
          w.state = 'home';
          w.home = home;
          w.t = 0;
          ev.push({ type: 'wispHome', w, site: home });
        }
      }
      if (w.state === 'home') {
        // spiralförmig in die Krone
        const a = w.t * 3;
        const r = Math.max(0, 8 - w.t * 3);
        w.x += (w.home.x + Math.cos(a) * r - w.x) * Math.min(1, dt * 3);
        w.z += (w.home.z + Math.sin(a) * r - w.z) * Math.min(1, dt * 3);
        w.y += dt * 5;
        if (w.t > 3) wisps.splice(i, 1);
        continue;
      }
      const ground = Math.max(field.height(w.x, w.z), WATER);
      w.y += (ground + 1.4 + Math.sin(w.t * 2.3) * 0.35 - w.y) * Math.min(1, dt * 4);
      if (w.state !== 'follow' && Math.hypot(w.x - ctx.focus.x, w.z - ctx.focus.z) > 230) wisps.splice(i, 1);
    }
  }

  const countFollowers = (pi) => wisps.filter((w) => w.state === 'follow' && w.follower === pi).length;

  // --- Moderlinge ------------------------------------------------------------------------------
  function updateModerlings(dt, ctx, ev) {
    const night = ctx.night > 0.5;
    modT -= dt;
    const cap = Math.min(10, 3 + (ctx.nights ?? 0));
    const alive = moderlings.filter((m) => m.state !== 'burrow' && m.state !== 'dead').length;
    if (night && modT <= 0) {
      modT = 6 + rand() * 4;
      const near = ctx.nests.filter((n) => Math.hypot(n.x - ctx.focus.x, n.z - ctx.focus.z) < 110);
      if (alive < cap && near.length) {
        const n = near[Math.floor(rand() * near.length)];
        const a = rand() * Math.PI * 2;
        const m = { id: nextId++, x: n.x + Math.cos(a) * 3, z: n.z + Math.sin(a) * 3, heading: a, hp: 1 + Math.min(1.5, (ctx.nights ?? 0) * 0.25), maxHp: 0, state: 'hunt', target: null, think: 0, biteCd: 0, t: rand() * 10, hit: 0, eaten: 0 };
        m.maxHp = m.hp;
        moderlings.push(m);
        ev.push({ type: 'moderSpawn', m });
      }
    }
    for (let i = moderlings.length - 1; i >= 0; i--) {
      const m = moderlings[i];
      m.t += dt;
      m.hit = Math.max(0, m.hit - dt * 3);
      m.biteCd -= dt;
      if (m.state === 'dead' || m.state === 'burrow') {
        m.fade = (m.fade ?? 1) - dt * (m.state === 'dead' ? 2.5 : 0.7);
        if (m.fade <= 0) moderlings.splice(i, 1);
        continue;
      }
      if (!night && ctx.night < 0.3) {
        m.state = 'burrow';
        continue;
      }
      // Ziel wählen: ein Geist in der Nähe – oder frisches Myzel
      m.think -= dt;
      let nearP = null;
      let nd = Infinity;
      for (const p of ctx.players) {
        const d = dist(p, m);
        if (d < nd) (nd = d), (nearP = p);
      }
      if (m.think <= 0) {
        m.think = 1;
        if (nearP && nd < 16) m.target = { p: nearP };
        else {
          let best = null;
          let bm = 0.55;
          for (let k = 0; k < 10; k++) {
            const a = rand() * Math.PI * 2;
            const r = 4 + rand() * 24;
            const x = m.x + Math.cos(a) * r;
            const z = m.z + Math.sin(a) * r;
            const s = sim.sample(x, z);
            if (s.M > bm && !s.water && s.P < 0.5) (bm = s.M), (best = { x, z });
          }
          m.target = best ?? { x: ctx.focus.x + (rand() - 0.5) * 30, z: ctx.focus.z + (rand() - 0.5) * 30 };
        }
      }
      const tx = m.target?.p ? m.target.p.x : m.target?.x ?? m.x;
      const tz = m.target?.p ? m.target.p.z : m.target?.z ?? m.z;
      const dx = tx - m.x;
      const dz = tz - m.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      m.heading += Math.atan2(Math.sin(want - m.heading), Math.cos(want - m.heading)) * Math.min(1, dt * 4);
      const here = sim.sample(m.x, m.z);
      const speed = (here.P > 0.5 ? 1.2 : 3.1) * (m.target?.p ? 1.15 : 1);
      if (d > 0.8) {
        const nx = m.x + Math.sin(m.heading) * speed * dt;
        const nz = m.z + Math.cos(m.heading) * speed * dt;
        if (dry(nx, nz)) (m.x = nx), (m.z = nz);
        else m.think = 0;
      }
      // fressen und Fäulnis säen
      if (here.M > 0.3 && here.P < 0.5) {
        const eaten = sim.taint(m.x, m.z, 1.8, 0.75, dt * 0.6);
        m.eaten += eaten;
        if (eaten > 0.01) ev.push({ type: 'moderEat', m });
      }
      // beißen
      if (nearP && nd < 1.6 && m.biteCd <= 0) {
        m.biteCd = 2.3;
        ev.push({ type: 'moderBite', m, p: nearP });
        m.heading += Math.PI; // zurückweichen
        m.x -= Math.sin(want) * 1.5;
        m.z -= Math.cos(want) * 1.5;
      }
      // Weben verbrennt sie langsam, der gespannte Faden schnell
      for (const p of ctx.players) if (p.weaving && dist(p, m) < 3.2) damage(m, dt * 1.3, p.i, ev);
      if (ctx.thread) {
        const { a, b } = ctx.thread;
        if (segDist(m, a, b) < 1.6) damage(m, dt * 2.5, -1, ev);
      }
    }
  }

  function segDist(p, a, b) {
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2));
    return Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t));
  }

  function damage(m, amount, by, ev) {
    if (m.state === 'dead' || m.state === 'burrow') return;
    m.hp -= amount;
    m.hit = 1;
    if (m.hp <= 0) {
      m.state = 'dead';
      ev.push({ type: 'moderKilled', m, by });
    }
  }

  // Sporenpuls trifft Moderlinge im Umkreis
  function pulse(x, z, r, by) {
    const ev = [];
    for (const m of moderlings) if (Math.hypot(m.x - x, m.z - z) < r) damage(m, 1.2, by, ev);
    return ev;
  }

  // --- Sternsporen -----------------------------------------------------------------------------
  function updateStar(dt, ctx, ev) {
    if (!star) {
      nextStar -= dt;
      if (nextStar <= 0) {
        const s = findSpot(ctx.focus.x, ctx.focus.z, 45, 100, (x, z) => sim.sample(x, z).B < 0.3);
        nextStar = s ? 75 + rand() * 60 : 5;
        if (s) {
          star = { id: nextId++, x: s.x, z: s.z, gy: field.height(s.x, s.z), y: field.height(s.x, s.z) + 90, state: 'fall', t: 0, life: ctx.night > 0.5 ? 50 : 42, power: POWERS[Math.floor(rand() * POWERS.length)] };
          ev.push({ type: 'starIncoming', s: star });
        }
      }
      return;
    }
    star.t += dt;
    if (star.state === 'fall') {
      const k = Math.min(1, star.t / 3);
      star.y = star.gy + 1.2 + 90 * (1 - k) * (1 - k);
      if (k >= 1) {
        star.state = 'landed';
        star.t = 0;
        ev.push({ type: 'starLanded', s: star });
      }
      return;
    }
    star.y = star.gy + 1.2 + Math.sin(star.t * 3) * 0.2;
    for (const p of ctx.players)
      if (dist(p, star) < 3) {
        ev.push({ type: 'starCaught', s: star, p, power: star.power });
        star = null;
        return;
      }
    if (star.t > star.life) {
      ev.push({ type: 'starLost', s: star });
      star = null;
    }
  }

  // ctx: { players:[{i,x,z,weaving}], focus, night, nights, nests:[lebende], awakeSites:[{x,z,id}], thread:{a,b}|null }
  function update(dt, ctx) {
    const ev = [];
    updateWisps(dt, ctx, ev);
    updateModerlings(dt, ctx, ev);
    updateStar(dt, ctx, ev);
    return ev;
  }

  return {
    wisps,
    moderlings,
    get star() {
      return star;
    },
    update,
    pulse,
    followers: countFollowers,
    // Test-/Debughilfen
    _forceStar(t = 0) {
      nextStar = t;
    },
  };
}

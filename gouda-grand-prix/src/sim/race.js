// Rennsimulation: Kart-Physik (Arcade), Driften mit Mini-Turbo, Käsekisten, Käse-Angriffe und -Upgrades,
// Käsestücke, Boost-Felder, Gegner-KI, Runden und Platzierungen. Ohne DOM und ohne Grafik.
import { buildTrack, trackDelta, ROAD_HALF, CURB, WALL } from './track.js';
import { DRIVERS, DIFFICULTIES, MAX_CHEESE, rollItem } from './config.js';

export const DT = 1 / 120;
const G = 30;
const BASE_SPEED = 30.5; // m/s ≈ 110 km/h
const KART_R = 1.25;
const OFFROAD = ROAD_HALF + CURB;
const COUNTDOWN = 3.2;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function emptyInput() {
  return { throttle: 0, brake: 0, steer: 0, drift: false, item: false, back: false };
}

/**
 * entrants: [{ driver: 'greta', human: 0|1|-1, upgrades: {motor,tires,turbo,rind} }]
 */
export function createRace({ trackDef, entrants, difficulty = 'mittel', seed = 1, laps }) {
  const track = buildTrack(trackDef);
  const L = track.length;
  const rnd = mulberry32(seed);
  const diff = DIFFICULTIES.find((d) => d.id === difficulty) ?? DIFFICULTIES[1];
  const totalLaps = laps ?? trackDef.laps ?? 3;
  const events = [];
  const emit = (type, data = {}) => events.push({ type, ...data });

  // --- Karts ---------------------------------------------------------------------------------
  const karts = entrants.map((e, idx) => {
    const driver = DRIVERS.find((d) => d.id === e.driver) ?? DRIVERS[idx % DRIVERS.length];
    const up = { motor: 0, tires: 0, turbo: 0, rind: 0, ...(e.upgrades ?? {}) };
    // Startaufstellung: versetzt in zwei Reihen hinter der Linie
    const slot = idx;
    const s0 = L - 7 - slot * 5.2;
    const d0 = slot % 2 ? 4.2 : -4.2;
    const p = track.pointAt(s0, d0);
    const k = {
      idx,
      driver,
      human: e.human ?? -1,
      up,
      x: p.x,
      y: p.y,
      z: p.z,
      vx: 0,
      vy: 0,
      vz: 0,
      heading: p.heading,
      fs: 0,
      ls: 0,
      onGround: true,
      airT: 0,
      slope: 0,
      hint: track.indexAt(s0),
      loc: {},
      s: s0,
      d: d0,
      lap: -1,
      progress: s0 - L,
      bestProgress: s0 - L,
      rank: idx,
      finished: false,
      finishTime: 0,
      lapStart: 0,
      lapTimes: [],
      // Fahrzustand
      steerVis: 0,
      drift: 0, // Richtung: -1 links, 1 rechts, 0 kein Drift
      driftT: 0,
      driftLevel: 0,
      hopT: 0,
      boostT: 0,
      boostPower: 1,
      spinT: 0,
      spinVis: 0,
      tumbleT: 0,
      stallT: 0,
      invulnT: 0,
      shieldT: 0,
      goldenT: 0,
      stinkT: 0,
      offroad: false,
      wallT: 0,
      cheese: 0,
      cheeseTotal: 0,
      item: null,
      itemCharges: 0,
      rollT: 0,
      rollItem: null,
      orbit: 0,
      itemHeldT: 0,
      hits: 0,
      hitBy: null,
      input: emptyInput(),
      prevItem: false,
      prevDrift: false,
      startPress: null,
      stats: {
        top: BASE_SPEED * (1 + driver.speed * 0.02 + up.motor * 0.025),
        accel: 0.62 + driver.accel * 0.06,
        turn: 1.85 + driver.handling * 0.08 + up.tires * 0.07,
        grip: 7 + driver.handling * 0.4 + up.tires * 0.6,
        weight: 1 + driver.weight * 0.12,
        charge: 1 + up.turbo * 0.15,
        boostLen: 1 + up.turbo * 0.12,
        rind: up.rind,
      },
      ai: null,
    };
    if (k.human < 0) {
      k.ai = {
        line: (rnd() * 2 - 1) * 4,
        phase: rnd() * 10,
        skill: clamp(diff.aiSkill + (rnd() - 0.5) * 0.2, 0.3, 1),
        hold: 0,
        driftWant: 0,
        stuckT: 0,
        reverseT: 0,
        itemDelay: 1 + rnd() * 3,
      };
    }
    track.locate(k.x, k.z, k.hint, k.loc);
    return k;
  });

  // --- Strecken-Gegenstände ------------------------------------------------------------------
  const boxes = [];
  for (const f of trackDef.itemRows ?? []) {
    for (const d of [-6.4, -3.2, 0, 3.2, 6.4]) {
      const p = track.pointAt(f * L, d);
      boxes.push({ x: p.x, y: p.y + 1.1, z: p.z, s: f * L, d, respawn: 0 });
    }
  }
  const coins = [];
  for (const [f, d] of trackDef.cheeseLines ?? []) {
    for (let j = 0; j < 5; j++) {
      const s = f * L + j * 4.5;
      const p = track.pointAt(s, d);
      coins.push({ x: p.x, y: p.y + 0.8, z: p.z, s, d, respawn: 0 });
    }
  }
  const pads = (trackDef.boostPads ?? []).map(([f, d]) => {
    const p = track.pointAt(f * L, d);
    return { s: f * L, d, x: p.x, y: p.y, z: p.z, heading: p.heading };
  });

  const projectiles = []; // Emmentaler-Räder und Raclette-Raketen
  const puddles = []; // Fondue-Pfützen
  let nextId = 1;

  const race = {
    track,
    def: trackDef,
    laps: totalLaps,
    karts,
    boxes,
    coins,
    pads,
    projectiles,
    puddles,
    events,
    phase: 'countdown',
    time: -COUNTDOWN, // Rennzeit; < 0 = Countdown
    finishedHumans: 0,
    difficulty: diff,
    countdown: COUNTDOWN,
    setInput(humanIdx, input) {
      const k = karts.find((q) => q.human === humanIdx);
      if (k) Object.assign(k.input, input);
    },
    step,
    standings,
    kartsByRank() {
      return [...karts].sort((a, b) => a.rank - b.rank);
    },
  };

  // --- Hilfen ---------------------------------------------------------------------------------
  function vmaxOf(k) {
    let v = k.stats.top * (1 + k.cheese * 0.012);
    if (k.ai) v *= diff.aiSpeed * k.ai.speedMul;
    if (k.boostT > 0) v *= k.boostPower;
    if (k.goldenT > 0) v *= 1.22;
    if (k.stinkT > 0) v *= 0.86;
    if (k.offroad && k.boostT <= 0 && k.goldenT <= 0) v *= 0.55;
    return v;
  }

  function hit(k, kind, by) {
    if (k.finished && kind !== 'bump') return false;
    if (k.goldenT > 0 || k.invulnT > 0) return false;
    if (k.shieldT > 0) {
      k.shieldT = 0;
      k.invulnT = 0.6;
      emit('shieldBreak', { kart: k, by });
      return true;
    }
    const rind = k.stats.rind;
    const lose = Math.min(k.cheese, kind === 'tumble' ? 3 : 2) - (rind >= 2 ? 1 : 0);
    if (lose > 0) k.cheese -= lose;
    k.drift = 0;
    k.driftT = 0;
    k.boostT = 0;
    if (kind === 'tumble') {
      k.tumbleT = 1.35 * (1 - rind * 0.1);
      k.vy = 9;
      k.onGround = false;
      k.fs *= 0.25;
      k.invulnT = k.tumbleT + 0.8;
    } else {
      k.spinT = 1.05 * (1 - rind * 0.1);
      k.invulnT = k.spinT + 0.6;
    }
    k.hits++;
    k.hitBy = by ?? null;
    emit('hit', { kart: k, by, kind, lost: Math.max(0, lose) });
    return true;
  }

  function useItem(k) {
    if (!k.item || k.rollT > 0 || k.spinT > 0 || k.tumbleT > 0) return;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    const item = k.item;
    if (item === 'wheel' || item === 'triple') {
      if (item === 'triple' && k.orbit === 0 && k.itemCharges === 3) {
        // erstes Drücken: Räder kreisen lassen
        k.orbit = 3;
        k.itemCharges = 3;
        emit('orbit', { kart: k });
        return;
      }
      const back = k.input.back;
      const dir = back ? -1 : 1;
      const sp = 54;
      const spawn = back ? -2.6 : 2.6;
      projectiles.push({
        id: nextId++,
        type: 'wheel',
        owner: k,
        x: k.x + fx * spawn,
        y: k.y + 0.6,
        z: k.z + fz * spawn,
        vx: fx * sp * dir + k.vx * 0.3,
        vz: fz * sp * dir + k.vz * 0.3,
        vy: 0,
        life: 7,
        bounces: 0,
        age: 0,
        hint: k.hint,
        spin: 0,
      });
      emit('fire', { kart: k, item: 'wheel' });
      if (item === 'triple') {
        k.orbit = Math.max(0, k.orbit - 1);
        k.itemCharges--;
        if (k.itemCharges <= 0) (k.item = null), (k.orbit = 0);
      } else k.item = null;
    } else if (item === 'fondue') {
      const front = k.input.back ? false : !!k.ai?.throwFondue;
      const off = front ? 14 : -3.4;
      const px = k.x + fx * off;
      const pz = k.z + fz * off;
      puddles.push({ id: nextId++, x: px, z: pz, y: track.groundAt(px, pz, k.hint), r: 2.4, life: 40, owner: k, age: 0 });
      k.item = null;
      emit('fire', { kart: k, item: 'fondue' });
    } else if (item === 'rocket') {
      const ahead = karts.filter((q) => q !== k && !q.finished && q.rank < k.rank).sort((a, b) => b.rank - a.rank)[0];
      projectiles.push({
        id: nextId++,
        type: 'rocket',
        owner: k,
        target: ahead ?? null,
        x: k.x + fx * 2.5,
        y: k.y + 1.2,
        z: k.z + fz * 2.5,
        vx: fx * 40,
        vz: fz * 40,
        vy: 0,
        s: k.s,
        d: k.d,
        life: 14,
        age: 0,
        hint: k.hint,
      });
      k.item = null;
      emit('fire', { kart: k, item: 'rocket' });
    } else if (item === 'stink') {
      let n = 0;
      for (const q of karts)
        if (q !== k && !q.finished && q.rank < k.rank && q.goldenT <= 0) {
          q.stinkT = 4.5;
          n++;
          emit('stinked', { kart: q, by: k });
        }
      k.item = null;
      emit('fire', { kart: k, item: 'stink', count: n });
    } else if (item === 'turbo') {
      boost(k, 1.35 * k.stats.boostLen, 1.42);
      k.itemCharges--;
      emit('fire', { kart: k, item: 'turbo' });
      if (k.itemCharges <= 0) k.item = null;
    } else if (item === 'shield') {
      k.shieldT = 14;
      k.item = null;
      emit('fire', { kart: k, item: 'shield' });
    } else if (item === 'golden') {
      k.goldenT = 7.5;
      k.spinT = 0;
      k.stinkT = 0;
      boost(k, 0.6, 1.3);
      k.item = null;
      emit('fire', { kart: k, item: 'golden' });
    }
  }

  function boost(k, t, power) {
    const fresh = k.boostT < 0.25;
    k.boostT = Math.max(k.boostT, t);
    k.boostPower = Math.max(k.boostT > t ? k.boostPower : 1, power);
    if (k.fs < k.stats.top * 0.7) k.fs = Math.max(k.fs, k.stats.top * 0.75);
    if (fresh) emit('boost', { kart: k, power });
  }

  // --- Gegner-KI ------------------------------------------------------------------------------
  function aiThink(k, dt) {
    const ai = k.ai;
    const inp = k.input;
    const sk = ai.skill;
    ai.phase += dt;
    // Gummiband gegenüber dem besten Menschen
    const humans = karts.filter((q) => q.human >= 0);
    ai.speedMul = 1;
    if (humans.length) {
      const lead = Math.max(...humans.map((h) => h.progress));
      const gap = lead - k.progress; // > 0: KI liegt hinten
      ai.speedMul = 1 + clamp(gap / 260, -1, 1) * diff.rubber + (gap > 0 ? 0.01 : 0);
    }
    const look = 9 + Math.max(0, k.fs) * 0.55;
    // Ideallinie: in Kurven innen, mit leichtem Pendeln
    const iAhead = track.wrap(k.loc.i + Math.round(look * 0.8));
    const curvAhead = track.curv[iAhead];
    let target = ai.line * (1 - Math.min(1, Math.abs(curvAhead) * 25)) - Math.sign(curvAhead) * Math.min(5, Math.abs(curvAhead) * 180);
    target += Math.sin(ai.phase * 0.7) * (1.6 - sk);
    // Käsekisten anpeilen, wenn die Hand leer ist; Pfützen ausweichen
    if (!k.item && k.rollT <= 0) {
      let best = null;
      for (const b of boxes) {
        if (b.respawn > 0) continue;
        const ds = trackDelta(track, k.s, b.s);
        if (ds > 4 && ds < 45 && (!best || Math.abs(b.d - k.d) < Math.abs(best.d - k.d))) best = b;
      }
      if (best && rnd() < sk) target = best.d;
    }
    for (const p of puddles) {
      const loc = track.locate(p.x, p.z, k.hint, tmpLoc);
      const ds = trackDelta(track, k.s, loc.s);
      if (ds > 0 && ds < 40 && Math.abs(loc.d - target) < 4.5) target = loc.d + (target > loc.d ? 5 : -5);
    }
    target = clamp(target, -ROAD_HALF + 1.5, ROAD_HALF - 1.5);
    const tp = track.pointAt(k.s + look, target, tmpPt);
    const want = Math.atan2(tp.x - k.x, tp.z - k.z);
    const diffA = wrapAngle(want - k.heading);
    inp.steer = clamp(-diffA * (2.4 + sk), -1, 1);
    // Geschwindigkeit vor Kurven
    let kmax = 0;
    for (let j = 6; j < 40; j += 3) kmax = Math.max(kmax, Math.abs(track.curv[track.wrap(k.loc.i + j)]));
    const vCorner = Math.sqrt(26 / Math.max(kmax, 0.002)) * (0.95 + sk * 0.12);
    inp.throttle = k.fs > vCorner + 3 && k.drift === 0 ? 0 : 1;
    inp.brake = k.fs > vCorner + 9 && k.drift === 0 ? 0.6 : 0;
    // Driften in längeren Kurven
    const cNear = track.curv[track.wrap(k.loc.i + 10)];
    if (k.drift === 0) {
      inp.drift = Math.abs(cNear) > 0.022 && k.fs > 17 && k.onGround && rnd() < sk * 0.08;
    } else {
      const done = Math.abs(cNear) < 0.01 || (k.driftLevel >= 2 && rnd() < 0.02) || Math.sign(cNear) !== -k.drift;
      inp.drift = !done;
    }
    // Feststecken: zurücksetzen
    if (k.fs < 2 && race.time > 2 && k.spinT <= 0 && k.tumbleT <= 0) ai.stuckT += dt;
    else ai.stuckT = Math.max(0, ai.stuckT - dt);
    if (ai.stuckT > 1.2) (ai.reverseT = 0.9), (ai.stuckT = 0);
    if (ai.reverseT > 0) {
      ai.reverseT -= dt;
      inp.throttle = 0;
      inp.brake = 1;
      inp.steer = -inp.steer;
    }
    // Gegenstände
    inp.item = false;
    inp.back = false;
    if (k.item && k.rollT <= 0) {
      k.itemHeldT += dt;
      if (k.itemHeldT < ai.itemDelay) return;
      const it = k.item;
      const fx = Math.sin(k.heading);
      const fz = Math.cos(k.heading);
      const inFront = karts.some((q) => {
        if (q === k || q.finished) return false;
        const dx = q.x - k.x;
        const dz = q.z - k.z;
        const dist = Math.hypot(dx, dz);
        return dist < 55 && dist > 3 && (dx * fx + dz * fz) / dist > 0.97;
      });
      const behind = karts.some((q) => q !== k && trackDelta(track, k.s, q.s) < -2 && trackDelta(track, k.s, q.s) > -28);
      if (it === 'wheel' || it === 'triple') inp.item = inFront || k.itemHeldT > 9 || (it === 'triple' && k.orbit === 0);
      else if (it === 'fondue') {
        inp.item = behind || k.itemHeldT > 12;
        ai.throwFondue = false;
      } else if (it === 'turbo') inp.item = Math.abs(cNear) < 0.008 && k.boostT <= 0;
      else inp.item = true;
      if (inp.item) {
        k.itemHeldT = it === 'triple' || it === 'turbo' ? k.itemHeldT - 1.5 : 0;
        ai.itemDelay = 0.6 + rnd() * 2.5 * (1.3 - sk);
      }
    }
  }
  const tmpLoc = {};
  const tmpPt = {};

  // --- Kart-Physik ----------------------------------------------------------------------------
  function stepKart(k, dt) {
    const inp = k.input;
    const st = k.stats;
    const racing = race.time >= 0;
    const control = racing && k.spinT <= 0 && k.tumbleT <= 0 && !k.finished;

    // Timer
    k.boostT = Math.max(0, k.boostT - dt);
    if (k.boostT <= 0) k.boostPower = 1;
    k.spinT = Math.max(0, k.spinT - dt);
    k.tumbleT = Math.max(0, k.tumbleT - dt);
    k.invulnT = Math.max(0, k.invulnT - dt);
    k.shieldT = Math.max(0, k.shieldT - dt);
    k.goldenT = Math.max(0, k.goldenT - dt);
    k.stinkT = Math.max(0, k.stinkT - dt);
    k.stallT = Math.max(0, k.stallT - dt);
    k.hopT = Math.max(0, k.hopT - dt);
    k.wallT = Math.max(0, k.wallT - dt);
    if (k.spinT > 0) k.spinVis += dt * 13;
    else k.spinVis *= Math.exp(-dt * 10);

    // Item-Roulette
    if (k.rollT > 0) {
      k.rollT -= dt;
      if (k.rollT <= 0) {
        k.item = k.rollItem;
        k.itemCharges = k.item === 'turbo' || k.item === 'triple' ? 3 : 1;
        k.itemHeldT = 0;
        emit('itemReady', { kart: k, item: k.item });
      }
    }
    if (inp.item && !k.prevItem && control) useItem(k);
    k.prevItem = inp.item;

    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    const rx = -fz;
    const rz = fx;
    let fs = k.vx * fx + k.vz * fz;
    let ls = k.vx * rx + k.vz * rz;
    const vmax = vmaxOf(k);
    const throttle = control && k.stallT <= 0 ? inp.throttle : 0;
    const brake = control ? inp.brake : 0;

    // Driften: Knopf beim Lenken drücken → Hüpfer, dann rutschen und Turbo laden
    const driftDown = control && inp.drift;
    if (driftDown && !k.prevDrift && k.onGround && k.drift === 0) {
      k.hopT = 0.25;
      k.vy = 4.2;
      k.onGround = false;
      k.pendingDrift = true;
      emit('hop', { kart: k });
    }
    if (k.pendingDrift && driftDown && Math.abs(inp.steer) > 0.25 && fs > 9) {
      k.drift = inp.steer > 0 ? 1 : -1;
      k.driftT = 0;
      k.driftLevel = 0;
      k.pendingDrift = false;
      emit('driftStart', { kart: k });
    }
    if (!driftDown) k.pendingDrift = false;
    if (k.drift !== 0 && (!driftDown || fs < 7 || !control)) {
      // loslassen → Mini-Turbo
      if (control && k.driftLevel > 0) {
        const t = [0, 0.7, 1.15, 1.7][k.driftLevel] * st.boostLen;
        boost(k, t, [1, 1.28, 1.34, 1.4][k.driftLevel]);
        emit('miniTurbo', { kart: k, level: k.driftLevel });
      }
      k.drift = 0;
      k.driftT = 0;
      k.driftLevel = 0;
    }
    k.prevDrift = driftDown;

    // Lenken
    let yawRate = 0;
    const speedF = clamp(Math.abs(fs) / 9, 0, 1) * (1 - 0.22 * clamp(fs / BASE_SPEED, 0, 1.4));
    if (control) {
      if (k.drift !== 0) {
        const into = inp.steer * k.drift; // -1 (gegenlenken) … 1 (einlenken)
        yawRate = -k.drift * st.turn * (0.62 + 0.42 * into) * clamp(Math.abs(fs) / 12, 0, 1);
        const rate = (0.55 + 0.5 * Math.max(0, into)) * st.charge;
        k.driftT += dt * rate;
        const lvl = k.driftT > 2.6 ? 3 : k.driftT > 1.6 ? 2 : k.driftT > 0.75 ? 1 : 0;
        if (lvl > k.driftLevel) emit('driftLevel', { kart: k, level: lvl });
        k.driftLevel = lvl;
      } else {
        yawRate = -inp.steer * st.turn * speedF * (fs < -0.5 ? -1 : 1);
      }
      if (!k.onGround) yawRate *= 0.6;
    }
    k.heading = wrapAngle(k.heading + yawRate * dt);
    k.steerVis += ((control ? inp.steer : 0) - k.steerVis) * Math.min(1, dt * 10);

    // Antrieb
    if (k.onGround) {
      if (throttle > 0) {
        if (fs < vmax) fs += (vmax - fs) * st.accel * throttle * dt * (fs < 6 ? 2.2 : 1) + (k.boostT > 0 ? 18 * dt : 0);
        else fs -= Math.min(fs - vmax, (k.offroad ? 40 : 12) * dt);
      } else if (brake > 0) {
        fs -= (fs > 0 ? 38 : 9) * brake * dt;
        fs = Math.max(fs, -9);
      } else {
        fs -= Math.sign(fs) * Math.min(Math.abs(fs), (4 + Math.abs(fs) * 0.25) * dt);
        if (k.boostT > 0 && fs < vmax) fs += 25 * dt;
      }
      if (fs > vmax && throttle <= 0) fs -= Math.min(fs - vmax, 14 * dt);
      if (k.spinT > 0 || k.tumbleT > 0) fs *= Math.exp(-2.6 * dt);
      // Steigung
      fs -= k.slope * G * 0.45 * dt;
      // Seitenhaftung
      const grip = k.drift !== 0 ? 2.2 : k.spinT > 0 ? 0.8 : k.offroad ? st.grip * 0.7 : st.grip;
      ls *= Math.exp(-grip * dt);
    }
    // Startboost / Abwürgen
    if (!racing) {
      fs = 0;
      ls = 0;
      if (inp.throttle > 0.5 && k.startPress === null) k.startPress = race.time;
      if (inp.throttle < 0.2) k.startPress = null;
    }
    k.fs = fs;
    k.ls = ls;
    const nfx = Math.sin(k.heading);
    const nfz = Math.cos(k.heading);
    k.vx = nfx * fs + -nfz * ls;
    k.vz = nfz * fs + nfx * ls;

    // Bewegung
    k.x += k.vx * dt;
    k.z += k.vz * dt;
    const prevGround = k.groundY ?? k.y;
    track.locate(k.x, k.z, k.hint, k.loc);
    k.hint = k.loc.i;

    // Bande
    const lim = WALL - KART_R;
    if (Math.abs(k.loc.d) > lim) {
      const sign = Math.sign(k.loc.d);
      const Rx = -k.loc.tz;
      const Rz = k.loc.tx;
      const push = k.loc.d - sign * lim;
      k.x -= Rx * push;
      k.z -= Rz * push;
      const vn = k.vx * Rx + k.vz * Rz;
      if (vn * sign > 0) {
        k.vx -= Rx * vn * 1.4;
        k.vz -= Rz * vn * 1.4;
        const fx2 = Math.sin(k.heading);
        const fz2 = Math.cos(k.heading);
        k.fs = k.vx * fx2 + k.vz * fz2;
        k.ls = k.vx * -fz2 + k.vz * fx2;
        if (Math.abs(vn) > 5 && k.wallT <= 0) {
          k.wallT = 0.3;
          k.vx *= 0.82;
          k.vz *= 0.82;
          emit('wall', { kart: k, strength: Math.abs(vn) });
        }
        // Lenkung sanft an der Wand entlang
        const along = Math.atan2(k.loc.tx, k.loc.tz);
        const dir = Math.cos(wrapAngle(k.heading - along)) >= 0 ? along : along + Math.PI;
        k.heading = wrapAngle(k.heading + wrapAngle(dir - k.heading) * Math.min(1, dt * 3));
      }
      track.locate(k.x, k.z, k.hint, k.loc);
    }
    k.s = k.loc.s;
    k.d = k.loc.d;
    k.offroad = Math.abs(k.d) > OFFROAD + 0.3;

    // Höhe: Boden folgen, über Kuppen und Schanzen abheben
    const ground = k.loc.y;
    k.groundY = ground;
    const horiz = Math.hypot(k.vx, k.vz);
    k.slope = clamp((ground - prevGround) / Math.max(0.01, horiz * dt), -0.5, 0.5);
    if (k.onGround) {
      const gv = (ground - prevGround) / dt;
      k.vy = gv;
    }
    k.vy -= G * dt;
    k.y += k.vy * dt;
    if (k.y <= ground) {
      if (!k.onGround && k.airT > 0.25) emit('land', { kart: k, impact: -k.vy, air: k.airT });
      k.y = ground;
      if (k.vy < 0) k.vy = 0;
      k.onGround = true;
      k.airT = 0;
    } else if (k.y - ground > 0.08) {
      k.onGround = false;
      k.airT += dt;
    }

    // Runden
    const prog = progressOf(k);
    k.progress = prog;
    if (!k.finished && racing) k.bestProgress = Math.max(k.bestProgress, prog);

    // Startboost ausgewertet bei GO
    if (k.armedStart) {
      k.armedStart = false;
      if (k.startPress !== null) {
        const early = -k.startPress; // Sekunden vor GO gedrückt
        if (early <= 1.05) boost(k, 1.1, 1.38), emit('startBoost', { kart: k });
        else if (early > 1.6) (k.stallT = 1.0), emit('stall', { kart: k });
      }
    }
  }

  function progressOf(k) {
    // Rundenwechsel am Nulldurchgang von s erkennen
    const prevS = k.lastS ?? k.s;
    const delta = k.s - prevS;
    if (delta < -L / 2) {
      k.lap++;
      onLap(k);
    } else if (delta > L / 2) k.lap--;
    k.lastS = k.s;
    return k.lap * L + k.s;
  }

  function onLap(k) {
    if (k.lap < 1 || k.finished) {
      if (k.lap === 0) k.lapStart = 0;
      return;
    }
    if (k.lap > (k.maxLap ?? 0)) {
      k.maxLap = k.lap;
      k.lapTimes.push(race.time - k.lapStart);
      k.lapStart = race.time;
      if (k.lap >= totalLaps) {
        k.finished = true;
        k.finishTime = race.time;
        k.drift = 0;
        emit('finish', { kart: k });
        if (k.human >= 0) race.finishedHumans++;
      } else emit('lap', { kart: k, lap: k.lap + 1, final: k.lap + 1 === totalLaps });
    }
  }

  function collideKarts() {
    for (let i = 0; i < karts.length; i++) {
      const a = karts[i];
      for (let j = i + 1; j < karts.length; j++) {
        const b = karts[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dd = dx * dx + dz * dz;
        if (dd > (KART_R * 2) ** 2 || Math.abs(a.y - b.y) > 2) continue;
        const dist = Math.sqrt(dd) || 0.01;
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = KART_R * 2 - dist;
        const ma = a.stats.weight * (a.goldenT > 0 ? 6 : 1);
        const mb = b.stats.weight * (b.goldenT > 0 ? 6 : 1);
        const ta = mb / (ma + mb);
        a.x -= nx * overlap * ta;
        a.z -= nz * overlap * ta;
        b.x += nx * overlap * (1 - ta);
        b.z += nz * overlap * (1 - ta);
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0) {
          const imp = (-(1.5) * rv) / (1 / ma + 1 / mb);
          a.vx -= (imp / ma) * nx;
          a.vz -= (imp / ma) * nz;
          b.vx += (imp / mb) * nx;
          b.vz += (imp / mb) * nz;
          for (const k of [a, b]) {
            const fx = Math.sin(k.heading);
            const fz = Math.cos(k.heading);
            k.fs = k.vx * fx + k.vz * fz;
            k.ls = k.vx * -fz + k.vz * fx;
          }
          if (a.goldenT > 0 && b.goldenT <= 0) hit(b, 'tumble', a);
          else if (b.goldenT > 0 && a.goldenT <= 0) hit(a, 'tumble', b);
          else if (-rv > 3) emit('bump', { a, b, strength: -rv });
        }
      }
    }
  }

  function stepPickups(dt) {
    for (const b of boxes) {
      if (b.respawn > 0) {
        b.respawn -= dt;
        continue;
      }
      for (const k of karts) {
        if ((k.x - b.x) ** 2 + (k.z - b.z) ** 2 < 2.4 ** 2 && Math.abs(k.y + 0.8 - b.y) < 2.5) {
          b.respawn = 2.5;
          emit('box', { kart: k, box: b });
          if (!k.item && k.rollT <= 0 && !k.finished) {
            k.rollT = k.human >= 0 ? 1.9 : 1.2;
            k.rollItem = rollItem(k.rank, karts.length, rnd);
          }
          break;
        }
      }
    }
    for (const c of coins) {
      if (c.respawn > 0) {
        c.respawn -= dt;
        continue;
      }
      for (const k of karts) {
        if ((k.x - c.x) ** 2 + (k.z - c.z) ** 2 < 1.8 ** 2 && Math.abs(k.y + 0.6 - c.y) < 2) {
          c.respawn = 12;
          k.cheeseTotal++;
          if (k.cheese < MAX_CHEESE) k.cheese++;
          emit('cheese', { kart: k, coin: c });
          break;
        }
      }
    }
    for (const p of pads) {
      for (const k of karts) {
        if (!k.onGround) continue;
        const ds = trackDelta(track, p.s, k.s);
        if (ds > -2.5 && ds < 2.5 && Math.abs(k.d - p.d) < 3) {
          if (k.boostT < 0.9) emit('pad', { kart: k });
          boost(k, 1.2, 1.36);
        }
      }
    }
  }

  function stepProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.age += dt;
      p.life -= dt;
      let dead = p.life <= 0;
      if (p.type === 'wheel') {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        const loc = track.locate(p.x, p.z, p.hint, tmpLoc);
        p.hint = loc.i;
        if (Math.abs(loc.d) > WALL - 0.8) {
          const Rx = -loc.tz;
          const Rz = loc.tx;
          const sign = Math.sign(loc.d);
          const vn = p.vx * Rx + p.vz * Rz;
          if (vn * sign > 0) {
            p.vx -= 2 * vn * Rx;
            p.vz -= 2 * vn * Rz;
            p.bounces++;
            emit('wheelBounce', { p });
            if (p.bounces > 4) dead = true;
          }
          p.x -= Rx * (loc.d - sign * (WALL - 0.8));
          p.z -= Rz * (loc.d - sign * (WALL - 0.8));
        }
        // Rad springt über Kuppen leicht
        p.vy -= G * dt;
        p.y += p.vy * dt;
        if (p.y < loc.y + 0.6) (p.y = loc.y + 0.6), (p.vy = Math.max(0, p.vy));
        p.spin += Math.hypot(p.vx, p.vz) * dt;
      } else if (p.type === 'rocket') {
        const t = p.target && !p.target.finished ? p.target : null;
        const sp = 62;
        const gap = t ? trackDelta(track, p.s, t.s) : 999;
        if (t && gap < 22 && gap > -6) {
          // Endanflug direkt aufs Ziel
          const dx = t.x - p.x;
          const dz = t.z - p.z;
          const dy = t.y + 0.7 - p.y;
          const l = Math.hypot(dx, dz, dy) || 1;
          p.vx += ((dx / l) * sp - p.vx) * Math.min(1, dt * 8);
          p.vz += ((dz / l) * sp - p.vz) * Math.min(1, dt * 8);
          p.x += p.vx * dt;
          p.z += p.vz * dt;
          p.y += dy * Math.min(1, dt * 6);
          const loc = track.locate(p.x, p.z, p.hint, tmpLoc);
          p.hint = loc.i;
          p.s = loc.s;
        } else {
          // der Strecke folgen
          p.s = (p.s + sp * dt) % L;
          const wantD = t ? t.d : 0;
          p.d += clamp(wantD - p.d, -8 * dt, 8 * dt);
          const q = track.pointAt(p.s, p.d, tmpPt);
          p.vx = (q.x - p.x) / dt;
          p.vz = (q.z - p.z) / dt;
          p.x = q.x;
          p.z = q.z;
          p.y += (q.y + 1.3 - p.y) * Math.min(1, dt * 6);
          p.hint = track.indexAt(p.s);
        }
      }
      // Treffer
      if (!dead) {
        for (const k of karts) {
          if (k === p.owner && p.age < 0.5) continue;
          const r = p.type === 'rocket' ? 2.2 : 1.9;
          if ((k.x - p.x) ** 2 + (k.z - p.z) ** 2 < r * r && Math.abs(k.y + 0.6 - p.y) < 2.2) {
            hit(k, p.type === 'rocket' ? 'tumble' : 'spin', p.owner);
            emit(p.type === 'rocket' ? 'explode' : 'wheelHit', { x: p.x, y: p.y, z: p.z, kart: k, by: p.owner });
            dead = true;
            break;
          }
        }
      }
      // Räder zerstören Pfützen nicht, aber Raketen und Räder sich gegenseitig
      if (!dead && p.type === 'wheel') {
        for (const q of projectiles) {
          if (q === p || q.dead) continue;
          if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 2.2 ** 2) {
            q.dead = true;
            dead = true;
            emit('wheelHit', { x: p.x, y: p.y, z: p.z });
          }
        }
      }
      if (dead || p.dead) {
        if (p.type === 'rocket' && !p.dead && p.life <= 0) emit('explode', { x: p.x, y: p.y, z: p.z });
        projectiles.splice(i, 1);
      }
    }
    // Kreisende Räder (3 × Emmentaler) treffen, was sie berühren
    for (const k of karts) {
      if (k.orbit <= 0) continue;
      for (let j = 0; j < k.orbit; j++) {
        const a = race.time * 5 + (j / k.orbit) * Math.PI * 2;
        const ox = k.x + Math.sin(a) * 2.4;
        const oz = k.z + Math.cos(a) * 2.4;
        for (const q of karts) {
          if (q === k) continue;
          if ((q.x - ox) ** 2 + (q.z - oz) ** 2 < 1.7 ** 2) {
            if (hit(q, 'spin', k)) {
              emit('wheelHit', { x: ox, y: k.y + 0.6, z: oz, kart: q, by: k });
              k.orbit--;
              k.itemCharges--;
              if (k.itemCharges <= 0) (k.item = null), (k.orbit = 0);
              break;
            }
          }
        }
      }
    }
    for (let i = puddles.length - 1; i >= 0; i--) {
      const p = puddles[i];
      p.age += dt;
      p.life -= dt;
      let dead = p.life <= 0;
      for (const k of karts) {
        if (k === p.owner && p.age < 1) continue;
        if (!k.onGround) continue;
        if ((k.x - p.x) ** 2 + (k.z - p.z) ** 2 < (p.r + 0.6) ** 2) {
          if (hit(k, 'spin', p.owner)) {
            emit('splash', { x: p.x, y: p.y, z: p.z, kart: k, by: p.owner });
            dead = true;
            break;
          }
          if (k.goldenT > 0) dead = true;
        }
      }
      if (dead) puddles.splice(i, 1);
    }
  }

  function standings() {
    // Fertige nach Zielzeit, dann nach Fortschritt
    const order = [...karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    order.forEach((k, i) => {
      if (k.rank !== i && race.time > 0) emit('rank', { kart: k, from: k.rank, to: i });
      k.rank = i;
    });
    return order;
  }

  function step(dt = DT) {
    const before = race.time;
    race.time += dt;
    if (before < 0 && race.time >= 0) {
      race.phase = 'race';
      for (const k of karts) k.armedStart = true;
      emit('go');
    } else if (race.time < 0) {
      const sec = Math.ceil(-race.time);
      if (sec !== Math.ceil(-before) && sec <= 3) emit('count', { n: sec });
    }
    for (const k of karts) {
      if (k.ai) {
        if (race.time >= 0) aiThink(k, dt);
        else {
          // KI drückt kurz vor GO aufs Gas (je nach Können für den Startboost)
          k.ai.speedMul = 1;
          k.input.throttle = race.time > -0.25 - k.ai.skill * 0.35 ? 1 : 0;
        }
      }
      if (k.finished && k.human >= 0) {
        // nach dem Ziel fährt der Autopilot weiter
        if (!k.ai) k.ai = { line: 0, phase: 0, skill: 0.6, hold: 0, stuckT: 0, reverseT: 0, itemDelay: 99, speedMul: 1, auto: true };
        aiThink(k, dt);
        k.input.item = false;
      }
      stepKart(k, dt);
    }
    collideKarts();
    stepPickups(dt);
    stepProjectiles(dt);
    standings();
    const humans = karts.filter((k) => k.human >= 0);
    if (race.phase === 'race') {
      const done = humans.length ? humans.every((k) => k.finished) : karts.every((k) => k.finished);
      if (done) {
        race.phase = 'done';
        race.doneAt = race.time;
        emit('raceDone');
      }
    }
  }

  return race;
}

// Ergebnis für Karts, die noch nicht im Ziel sind: Zeit aus Restweg und Tempo hochrechnen
export function finalResults(race) {
  const L = race.track.length;
  const list = race.karts.map((k) => {
    let time = k.finishTime;
    if (!k.finished) {
      const left = race.laps * L - k.progress;
      time = race.time + Math.max(0, left) / Math.max(18, k.stats.top * 0.85);
    }
    return { kart: k, time, estimated: !k.finished };
  });
  list.sort((a, b) => a.time - b.time);
  return list;
}

// 2D-Physik für Filatura: Käsefäden als XPBD-Partikelketten, eine Olive als
// Kugel und statische Kollisionskörper. Bewusst ohne three.js-Abhängigkeit,
// damit sich alles headless testen lässt.

import {
  materialAt,
  COOL_TIME,
  THREAD_RADIUS,
  SEGMENT_LENGTH,
  DENSITY,
  STRAND_GRAVITY_SCALE,
} from './material.js';

export const GRAVITY = -18;
export const OLIVE_RADIUS = 0.32;
export const A0 = Math.PI * THREAD_RADIUS * THREAD_RADIUS;
export const MIN_RADIUS = THREAD_RADIUS * 0.28;

const SUBSTEPS = 20;
const ANCHOR_PICK_RADIUS = 0.65;
const MIN_STRAND_LENGTH = 0.35;
const DRAW_SLACK = 1.06; // gezogener Faden hängt leicht durch

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

let nextStrandId = 1;

class Particle {
  constructor(x, y, vx = 0, vy = 0) {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.vx = vx;
    this.vy = vy;
    this.w = 1;
    this.pin = null; // {kind: 'anchor', anchor} | {kind: 'cursor'} | {kind: 'olive'}
    this.contact = false;
    this.cnx = 0;
    this.cny = 0;
  }
}

export class Strand {
  constructor(particles, rest, vol, T) {
    this.id = nextStrandId++;
    this.particles = particles;
    this.rest = rest; // Ruhelänge je Segment
    this.vol = vol; // Käsevolumen je Segment (bleibt erhalten → Fäden werden dünner)
    this.strain = rest.map(() => 0); // geglättete Dehnung je Segment
    this.base = rest.map(() => 0); // eingefrorene Referenzdehnung (Bruch misst die Abweichung davon)
    this.bendRest = particles.map((_, i) => this._bendDistance(i));
    this.T = T;
    this.state = 'live';
    this.mat = materialAt(T);
  }

  _bendDistance(i) {
    const p = this.particles;
    if (i <= 0 || i >= p.length - 1) return 0;
    return Math.hypot(p[i + 1].x - p[i - 1].x, p[i + 1].y - p[i - 1].y);
  }

  get segmentCount() {
    return this.particles.length - 1;
  }

  segmentLength(i) {
    const a = this.particles[i];
    const b = this.particles[i + 1];
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  // Aktueller Radius eines Segments (Volumenerhaltung: länger → dünner)
  segmentRadius(i) {
    const L = Math.max(this.segmentLength(i), 1e-4);
    return Math.sqrt(this.vol[i] / (Math.PI * L));
  }

  totalRest() {
    let s = 0;
    for (const r of this.rest) s += r;
    return s;
  }

  updateMasses() {
    const p = this.particles;
    const n = p.length;
    for (let i = 0; i < n; i++) {
      const pi = p[i];
      if (pi.pin && pi.pin.kind !== 'olive') {
        pi.w = 0;
        continue;
      }
      const v = (i > 0 ? this.vol[i - 1] : 0) + (i < n - 1 ? this.vol[i] : 0);
      pi.w = 1 / Math.max(DENSITY * 0.5 * v, 1e-4);
    }
  }
}

function buildStatics(level) {
  const statics = [];
  for (const s of level.statics || []) {
    if (s.type === 'box') {
      const a = s.angle || 0;
      statics.push({
        type: 'box',
        x: s.x,
        y: s.y,
        hw: s.w / 2,
        hh: s.h / 2,
        c: Math.cos(a),
        s: Math.sin(a),
        friction: s.friction ?? 0.35,
      });
    } else if (s.type === 'capsule') {
      statics.push({ type: 'capsule', ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, r: s.r ?? 0.05, friction: 0.2 });
    }
  }
  if (level.glass) {
    for (const c of glassColliders(level.glass)) statics.push({ type: 'capsule', friction: 0.1, ...c });
  }
  return statics;
}

export function glassGeometry(g) {
  return {
    x: g.x,
    rimY: g.y,
    halfWidth: g.halfWidth ?? 1.15,
    depth: g.depth ?? 1.2,
    stem: g.stem ?? 1.25,
    baseHalf: 0.75,
  };
}

export function glassColliders(g) {
  const G = glassGeometry(g);
  const apexY = G.rimY - G.depth;
  const r = 0.05;
  return [
    { ax: G.x - G.halfWidth, ay: G.rimY, bx: G.x, by: apexY, r },
    { ax: G.x, ay: apexY, bx: G.x + G.halfWidth, by: G.rimY, r },
    { ax: G.x, ay: apexY, bx: G.x, by: apexY - G.stem, r: 0.06 },
    { ax: G.x - G.baseHalf, ay: apexY - G.stem, bx: G.x + G.baseHalf, by: apexY - G.stem, r: 0.05 },
  ];
}

export class World {
  constructor(level) {
    this.level = level;
    this.statics = buildStatics(level);
    this.anchors = (level.anchors || []).map((a, i) => ({ id: i, x: a.x, y: a.y }));
    this.strands = [];
    this.drawing = null;
    this.cursor = { x: 0, y: 0, fx: 0, fy: 0 };
    this.budget = level.cheese ?? 20; // Käsevorrat in Fadenlängen-Einheiten
    this.used = 0;
    this.time = 0;
    this.events = [];
    this.pendingImpact = null;
    this.killY = level.killY ?? -9;

    const o = level.olive;
    this.olive = {
      x: o.x,
      y: o.y,
      px: o.x,
      py: o.y,
      vx: 0,
      vy: 0,
      r: OLIVE_RADIUS,
      w: 0,
      angle: 0,
      omega: 0,
      contact: false,
      cnx: 0,
      cny: 1,
      state: 'waiting', // waiting | rolling | won | lost
      push: o.vx ?? 0,
      goalTime: 0,
    };
    this.glass = level.glass ? glassGeometry(level.glass) : null;
  }

  get cheeseLeft() {
    return Math.max(0, this.budget - this.used);
  }

  emit(e) {
    this.events.push(e);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  pickAnchor(x, y, radius = ANCHOR_PICK_RADIUS, exclude = null) {
    let best = null;
    let bd = radius;
    for (const a of this.anchors) {
      if (a === exclude) continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- Zeichnen

  beginStrand(anchor, x = anchor.x, y = anchor.y) {
    if (this.drawing || this.cheeseLeft <= 0.05) return null;
    const p0 = new Particle(anchor.x, anchor.y);
    p0.pin = { kind: 'anchor', anchor };
    const p1 = new Particle(anchor.x, anchor.y);
    p1.pin = { kind: 'cursor' };
    const s = new Strand([p0, p1], [1e-3], [A0 * 1e-3], 1);
    s.state = 'drawing';
    s.startAnchor = anchor;
    s.updateMasses();
    this.strands.push(s);
    this.drawing = s;
    this.cursor.x = this.cursor.fx = x;
    this.cursor.y = this.cursor.fy = y;
    this.emit({ type: 'draw-start', x: anchor.x, y: anchor.y });
    return s;
  }

  dragTo(x, y) {
    this.cursor.x = x;
    this.cursor.y = y;
  }

  endStrand(x = this.cursor.x, y = this.cursor.y) {
    const s = this.drawing;
    if (!s) return null;
    this.drawing = null;
    const last = s.particles[s.particles.length - 1];
    last.x = x;
    last.y = y;

    if (s.totalRest() < MIN_STRAND_LENGTH) {
      this.removeStrand(s);
      this.used = Math.max(0, this.used - s.vol.reduce((a, b) => a + b, 0) / A0);
      return { result: 'cancelled' };
    }

    const anchor = this.pickAnchor(x, y, ANCHOR_PICK_RADIUS, s.startAnchor);
    const o = this.olive;
    let result = 'free';
    if (anchor) {
      last.x = last.px = anchor.x;
      last.y = last.py = anchor.y;
      last.pin = { kind: 'anchor', anchor };
      result = 'anchor';
    } else if (o.state !== 'lost' && Math.hypot(o.x - x, o.y - y) < o.r + 0.4) {
      const d = Math.hypot(x - o.x, y - o.y) || 1;
      last.x = last.px = o.x + ((x - o.x) / d) * o.r;
      last.y = last.py = o.y + ((y - o.y) / d) * o.r;
      last.pin = { kind: 'olive' };
      result = 'olive';
    } else {
      last.pin = null;
    }
    last.vx = last.vy = 0;
    s.state = 'live';
    s.updateMasses();
    s.bendRest = s.particles.map((_, i) => s._bendDistance(i));
    this.emit({ type: 'attach', result, x: last.x, y: last.y });
    return { result, strand: s };
  }

  cancelStrand() {
    if (!this.drawing) return;
    const s = this.drawing;
    this.drawing = null;
    this.removeStrand(s);
    this.used = Math.max(0, this.used - s.vol.reduce((a, b) => a + b, 0) / A0);
  }

  removeStrand(s) {
    const i = this.strands.indexOf(s);
    if (i >= 0) this.strands.splice(i, 1);
  }

  // Schneidet alle Fäden, die die Strecke (ax,ay)-(bx,by) kreuzen.
  cut(ax, ay, bx, by) {
    let cuts = 0;
    for (const s of [...this.strands]) {
      if (s.state !== 'live') continue;
      const p = s.particles;
      for (let i = 0; i < p.length - 1; i++) {
        const hit = segmentIntersection(ax, ay, bx, by, p[i].x, p[i].y, p[i + 1].x, p[i + 1].y);
        if (hit) {
          this.snap(s, i, 'cut');
          cuts++;
          break;
        }
      }
    }
    return cuts;
  }

  releaseOlive() {
    const o = this.olive;
    if (o.state !== 'waiting') return false;
    o.state = 'rolling';
    o.w = 1;
    o.vx = o.push;
    o.px = o.x - o.vx / 60;
    this.emit({ type: 'release', x: o.x, y: o.y });
    return true;
  }

  // ---------------------------------------------------------------- Simulation

  step(dt = 1 / 60) {
    const h = dt / SUBSTEPS;
    const c = this.cursor;
    for (const s of this.strands) materialAt(s.T, s.mat);

    for (let k = 0; k < SUBSTEPS; k++) {
      const t = (k + 1) / SUBSTEPS;
      const cx = c.fx + (c.x - c.fx) * t;
      const cy = c.fy + (c.y - c.fy) * t;
      this._integrate(h, cx, cy);
      this._solveStrands(h, k);
      this._solveOliveAttachments();
      this._collideOliveStrands();
      this._collideStatics();
      this._updateVelocities(h);
      if (this.pendingImpact) this._applyImpact(h);
    }
    c.fx = c.x;
    c.fy = c.y;

    this._postStep(dt);
    this.time += dt;
  }

  _integrate(h, cx, cy) {
    const g = GRAVITY * h;
    const gs = g * STRAND_GRAVITY_SCALE;
    for (const s of this.strands) {
      const damp = Math.exp(-s.mat.damping * h);
      for (const p of s.particles) {
        p.contact = false;
        if (p.pin) {
          if (p.pin.kind === 'anchor') {
            p.px = p.x = p.pin.anchor.x;
            p.py = p.y = p.pin.anchor.y;
            continue;
          }
          if (p.pin.kind === 'cursor') {
            p.px = p.x;
            p.py = p.y;
            p.x = cx;
            p.y = cy;
            continue;
          }
        }
        p.vy += gs;
        p.vx *= damp;
        p.vy *= damp;
        p.px = p.x;
        p.py = p.y;
        p.x += p.vx * h;
        p.y += p.vy * h;
      }
    }
    const o = this.olive;
    o.contact = false;
    o.px = o.x;
    o.py = o.y;
    if (o.state === 'rolling' || o.state === 'won') {
      o.vy += g;
      const damp = Math.exp(-0.03 * h);
      o.vx *= damp;
      o.vy *= damp;
      o.x += o.vx * h;
      o.y += o.vy * h;
    }
  }

  _solveStrands(h, k) {
    const h2 = h * h;
    for (const s of this.strands) {
      const p = s.particles;
      const n = p.length - 1;
      const m = s.mat;
      const forward = (k & 1) === 0;
      for (let j = 0; j < n; j++) {
        const i = forward ? j : n - 1 - j;
        const a = p[i];
        const b = p[i + 1];
        const wsum = a.w + b.w;
        if (wsum === 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L = Math.hypot(dx, dy);
        if (L < 1e-9) continue;
        const rest = s.rest[i];
        const areaRel = s.vol[i] / (rest * A0);
        const alpha = (m.stretchCompliance * rest) / Math.max(areaRel, 0.05) / h2;
        const dl = -(L - rest) / (wsum + alpha);
        const nx = dx / L;
        const ny = dy / L;
        a.x -= nx * dl * a.w;
        a.y -= ny * dl * a.w;
        b.x += nx * dl * b.w;
        b.y += ny * dl * b.w;
      }
      if (m.bendCompliance === Infinity) continue;
      for (let i = 1; i < n; i++) {
        const a = p[i - 1];
        const b = p[i + 1];
        const wsum = a.w + b.w;
        if (wsum === 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L = Math.hypot(dx, dy);
        if (L < 1e-9) continue;
        const areaRel = Math.min(s.vol[i - 1] / (s.rest[i - 1] * A0), s.vol[i] / (s.rest[i] * A0));
        const alpha = m.bendCompliance / Math.max(areaRel * areaRel, 0.01) / h2;
        const dl = -(L - s.bendRest[i]) / (wsum + alpha);
        const nx = dx / L;
        const ny = dy / L;
        a.x -= nx * dl * a.w;
        a.y -= ny * dl * a.w;
        b.x += nx * dl * b.w;
        b.y += ny * dl * b.w;
      }
    }
  }

  _solveOliveAttachments() {
    const o = this.olive;
    const target = o.r + THREAD_RADIUS * 0.3;
    for (const s of this.strands) {
      for (const p of s.particles) {
        if (!p.pin || p.pin.kind !== 'olive') continue;
        const wsum = p.w + o.w;
        const dx = p.x - o.x;
        const dy = p.y - o.y;
        const L = Math.hypot(dx, dy) || 1e-6;
        const C = L - target;
        const dl = -C / wsum;
        const nx = dx / L;
        const ny = dy / L;
        p.x += nx * dl * p.w;
        p.y += ny * dl * p.w;
        o.x -= nx * dl * o.w;
        o.y -= ny * dl * o.w;
      }
    }
  }

  _collideOliveStrands() {
    const o = this.olive;
    if (o.state === 'lost') return;
    const R = o.r;
    for (const s of this.strands) {
      const p = s.particles;
      // Der Faden, an dem die Olive hängt, kollidiert nicht mit ihr
      if ((p[0].pin && p[0].pin.kind === 'olive') || (p[p.length - 1].pin && p[p.length - 1].pin.kind === 'olive')) continue;
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i];
        const b = p[i + 1];
        const minX = Math.min(a.x, b.x) - R - 0.2;
        const maxX = Math.max(a.x, b.x) + R + 0.2;
        if (o.x < minX || o.x > maxX) continue;
        const minY = Math.min(a.y, b.y) - R - 0.2;
        const maxY = Math.max(a.y, b.y) + R + 0.2;
        if (o.y < minY || o.y > maxY) continue;
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const len2 = ex * ex + ey * ey;
        const t = len2 > 1e-12 ? clamp(((o.x - a.x) * ex + (o.y - a.y) * ey) / len2, 0, 1) : 0;
        const qx = a.x + ex * t;
        const qy = a.y + ey * t;
        const dx = o.x - qx;
        const dy = o.y - qy;
        const d = Math.hypot(dx, dy);
        const rs = Math.sqrt(s.vol[i] / (Math.PI * Math.max(s.rest[i], 1e-4)));
        const minD = R + rs;
        if (d >= minD || d < 1e-7) continue;
        const nx = dx / d;
        const ny = dy / d;
        // Sprödbruch: kalter Käse zerbricht, wenn die Olive zu schnell aufschlägt
        const vrel = (o.vx - (a.vx * (1 - t) + b.vx * t)) * nx + (o.vy - (a.vy * (1 - t) + b.vy * t)) * ny;
        if (-vrel > s.mat.impactBreak && !this.pendingImpact) {
          this.pendingImpact = { strand: s, i, vx: o.vx, vy: o.vy, v: -vrel };
          continue;
        }
        const wseg = a.w * (1 - t) * (1 - t) + b.w * t * t;
        const wsum = o.w + wseg;
        if (wsum === 0) continue;
        const lam = (minD - d) / wsum;
        o.x += nx * lam * o.w;
        o.y += ny * lam * o.w;
        a.x -= nx * lam * a.w * (1 - t);
        a.y -= ny * lam * a.w * (1 - t);
        b.x -= nx * lam * b.w * t;
        b.y -= ny * lam * b.w * t;
        o.contact = true;
        o.cnx = nx;
        o.cny = ny;
        o.friction = 0.6; // Käse ist etwas klebrig
      }
    }
  }

  _collideStatics() {
    const o = this.olive;
    if (o.w > 0) {
      for (const st of this.statics) {
        const n = resolveCircleStatic(o, o.r, st);
        if (n) {
          o.contact = true;
          o.cnx = n.x;
          o.cny = n.y;
          o.friction = st.friction;
        }
      }
    }
    for (const s of this.strands) {
      for (const p of s.particles) {
        if (p.w === 0) continue;
        for (const st of this.statics) {
          if (st.oliveOnly) continue;
          const n = resolveCircleStatic(p, THREAD_RADIUS * 0.8, st);
          if (n) {
            p.contact = true;
            p.cnx = n.x;
            p.cny = n.y;
          }
        }
      }
    }
  }

  _updateVelocities(h) {
    const inv = 1 / h;
    for (const s of this.strands) {
      for (const p of s.particles) {
        if (p.pin && p.pin.kind !== 'olive') {
          p.vx = (p.x - p.px) * inv;
          p.vy = (p.y - p.py) * inv;
          continue;
        }
        p.vx = (p.x - p.px) * inv;
        p.vy = (p.y - p.py) * inv;
        if (p.contact) {
          // Klebriger Käse: Tangentialbewegung an Oberflächen stark gebremst
          const vn = p.vx * p.cnx + p.vy * p.cny;
          const tx = p.vx - vn * p.cnx;
          const ty = p.vy - vn * p.cny;
          p.vx = vn * p.cnx + tx * 0.6;
          p.vy = vn * p.cny + ty * 0.6;
        }
      }
    }
    const o = this.olive;
    if (o.w > 0) {
      o.vx = (o.x - o.px) * inv;
      o.vy = (o.y - o.py) * inv;
      if (o.contact) {
        const vn = o.vx * o.cnx + o.vy * o.cny;
        if (vn < 0) {
          o.vx -= vn * o.cnx;
          o.vy -= vn * o.cny;
        }
        // Rollwiderstand
        const f = Math.exp(-(o.friction ?? 0.2) * 0.15 * h);
        o.vx *= f;
        o.vy *= f;
        o.omega = (o.cnx * o.vy - o.cny * o.vx) / o.r;
      }
      o.angle += o.omega * h;
    }
  }

  _applyImpact(h) {
    const { strand, i, vx, vy, v } = this.pendingImpact;
    this.pendingImpact = null;
    if (!this.strands.includes(strand)) return;
    this.snap(strand, i, 'impact', v);
    const o = this.olive;
    o.vx = vx * 0.8;
    o.vy = vy * 0.8;
    o.px = o.x - o.vx * h;
    o.py = o.y - o.vy * h;
  }

  _postStep(dt) {
    for (const s of [...this.strands]) {
      if (s.state === 'live') s.T = Math.max(0, s.T - dt / COOL_TIME);
      const m = materialAt(s.T, s.mat);
      if (s.state === 'drawing') this._spool(s);
      this._plastic(s, m, dt);
      if (this.strands.includes(s)) this._resample(s);
    }
    // Herabgefallene Fäden entfernen
    for (const s of [...this.strands]) {
      if (s.state === 'drawing') continue;
      if (s.particles.length < 2 || s.particles.every((p) => p.y < this.killY - 4)) this.removeStrand(s);
    }
    this._oliveState(dt);
  }

  _spool(s) {
    const p = s.particles;
    const anchor = p[0];
    const cur = p[p.length - 1];
    const target = Math.hypot(cur.x - anchor.x, cur.y - anchor.y) * DRAW_SLACK;
    const total = s.totalRest();
    if (target > total) {
      const grow = Math.min(target - total, this.cheeseLeft);
      if (grow > 0) {
        s.rest[0] += grow;
        s.vol[0] += A0 * grow;
        this.used += grow;
      }
    }
    // Neues Partikel direkt am Anker einfügen, wenn das Zufuhrsegment zu lang wird
    let guard = 0;
    while (s.rest[0] > SEGMENT_LENGTH * 1.25 && guard++ < 50) {
      const r0 = s.rest[0];
      const f = (r0 - SEGMENT_LENGTH) / r0;
      const a = p[0];
      const b = p[1];
      const np = new Particle(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, b.vx * f, b.vy * f);
      np.px = np.x - np.vx / 600;
      np.py = np.y - np.vy / 600;
      p.splice(1, 0, np);
      const v0 = s.vol[0];
      s.rest.splice(0, 1, r0 - SEGMENT_LENGTH, SEGMENT_LENGTH);
      s.vol.splice(0, 1, v0 * f, v0 * (1 - f));
      s.strain.splice(0, 1, 0, 0);
      s.base.splice(0, 1, 0, 0);
      s.bendRest.splice(1, 0, 0);
      s.updateMasses();
    }
  }

  _plastic(s, m, dt) {
    const p = s.particles;
    const n = p.length - 1;
    const drawing = s.state === 'drawing';
    let worst = -1;
    let worstScore = 1;
    const ema = Math.min(1, dt * 30);
    for (let i = 0; i < n; i++) {
      const L = s.segmentLength(i);
      const rest = s.rest[i];
      const e = L / rest - 1;
      s.strain[i] += (e - s.strain[i]) * ema;
      s.base[i] += (s.strain[i] - s.base[i]) * Math.min(1, m.baseFollow * dt);
      if (!(drawing && i === 0)) {
        const shrink = drawing ? 0 : m.shrink;
        const rate = m.flow * Math.max(0, e - m.yieldStrain) - shrink;
        s.rest[i] = Math.max(rest * (1 + rate * dt), SEGMENT_LENGTH * 0.2);
      }
      const r = Math.sqrt(s.vol[i] / (Math.PI * Math.max(L, 1e-4)));
      const score = Math.max(MIN_RADIUS / r, (s.strain[i] - Math.max(0, s.base[i])) / m.breakStrain);
      if (score > worstScore) {
        worstScore = score;
        worst = i;
      }
    }
    if (m.bendFlow > 0) {
      const f = Math.min(1, m.bendFlow * dt);
      for (let i = 1; i < n; i++) s.bendRest[i] += (s._bendDistance(i) - s.bendRest[i]) * f;
    }
    if (worst >= 0) this.snap(s, worst, 'tear');
  }

  _resample(s) {
    const p = s.particles;
    // zu lange Segmente teilen
    for (let i = 0; i < p.length - 1; i++) {
      if (s.state === 'drawing' && i === 0) continue;
      if (s.rest[i] > SEGMENT_LENGTH * 1.9) {
        const a = p[i];
        const b = p[i + 1];
        const np = new Particle((a.x + b.x) / 2, (a.y + b.y) / 2, (a.vx + b.vx) / 2, (a.vy + b.vy) / 2);
        np.px = (a.px + b.px) / 2;
        np.py = (a.py + b.py) / 2;
        p.splice(i + 1, 0, np);
        const r = s.rest[i] / 2;
        const v = s.vol[i] / 2;
        s.rest.splice(i, 1, r, r);
        s.vol.splice(i, 1, v, v);
        s.strain.splice(i, 1, s.strain[i], s.strain[i]);
        s.base.splice(i, 1, s.base[i], s.base[i]);
        s.bendRest.splice(i + 1, 0, 0);
        s.bendRest[i + 1] = s._bendDistance(i + 1);
        if (i > 0) s.bendRest[i] = s._bendDistance(i);
        if (i + 2 < p.length - 1) s.bendRest[i + 2] = s._bendDistance(i + 2);
        s.updateMasses();
        i++;
      }
    }
    // zu kurze Segmente (durch Zusammenziehen) zusammenlegen
    for (let i = 1; i < p.length - 1; i++) {
      if (s.state === 'drawing' && i === 1) continue;
      if (s.rest[i - 1] + s.rest[i] < SEGMENT_LENGTH * 0.9 && !p[i].pin) {
        p.splice(i, 1);
        s.rest.splice(i - 1, 2, s.rest[i - 1] + s.rest[i]);
        s.vol.splice(i - 1, 2, s.vol[i - 1] + s.vol[i]);
        s.strain.splice(i - 1, 2, Math.max(s.strain[i - 1], s.strain[i]));
        s.base.splice(i - 1, 2, Math.max(s.base[i - 1], s.base[i]));
        s.bendRest.splice(i, 1);
        if (i - 1 > 0) s.bendRest[i - 1] = s._bendDistance(i - 1);
        if (i < p.length - 1) s.bendRest[i] = s._bendDistance(i);
        s.updateMasses();
      }
    }
  }

  // Bricht Segment i: der Faden zerfällt in zwei Teile.
  snap(s, i, cause, strength = 0) {
    const p = s.particles;
    const a = p[i];
    const b = p[i + 1];
    this.emit({
      type: 'snap',
      cause,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      T: s.T,
      strength,
    });
    if (s === this.drawing) this.drawing = null;
    this.removeStrand(s);

    const parts = [
      { particles: p.slice(0, i + 1), rest: s.rest.slice(0, i), vol: s.vol.slice(0, i), strain: s.strain.slice(0, i), base: s.base.slice(0, i), bend: s.bendRest.slice(0, i + 1) },
      { particles: p.slice(i + 1), rest: s.rest.slice(i + 1), vol: s.vol.slice(i + 1), strain: s.strain.slice(i + 1), base: s.base.slice(i + 1), bend: s.bendRest.slice(i + 1) },
    ];
    for (const part of parts) {
      if (part.particles.length < 2) continue;
      for (const q of part.particles) if (q.pin && q.pin.kind === 'cursor') q.pin = null;
      const ns = new Strand(part.particles, part.rest, part.vol, s.T);
      ns.strain = part.strain;
      ns.base = part.base;
      ns.bendRest = part.bend;
      ns.bendRest[0] = 0;
      ns.bendRest[ns.bendRest.length - 1] = 0;
      ns.updateMasses();
      this.strands.push(ns);
    }
  }

  _oliveState(dt) {
    const o = this.olive;
    if (o.state !== 'rolling') return;
    const g = this.glass;
    if (g) {
      const cy = g.rimY - g.depth * 0.55;
      const inside = Math.hypot(o.x - g.x, o.y - cy) < g.depth * 0.6 && o.y < g.rimY;
      const slow = Math.hypot(o.vx, o.vy) < 2.5;
      o.goalTime = inside && slow ? o.goalTime + dt : 0;
      if (o.goalTime > 0.35) {
        o.state = 'won';
        this.emit({ type: 'won', x: o.x, y: o.y });
        return;
      }
    }
    // Feststecken: Olive bleibt längere Zeit in einem kleinen Umkreis
    if (!o.home || Math.hypot(o.x - o.home.x, o.y - o.home.y) > 1.2) {
      o.home = { x: o.x, y: o.y };
      o.stillTime = 0;
    } else {
      o.stillTime += dt;
    }
    const fell = o.y < this.killY || Math.abs(o.x) > 40;
    if (fell || o.stillTime > 3.5) {
      o.state = 'lost';
      o.w = 0;
      this.emit({ type: 'lost', reason: fell ? 'fell' : 'stuck', x: o.x, y: o.y });
    }
  }
}

// Schiebt einen Kreis (Partikel oder Olive) aus einem statischen Körper heraus.
function resolveCircleStatic(p, rad, st) {
  if (st.type === 'box') {
    const dx = p.x - st.x;
    const dy = p.y - st.y;
    if (Math.abs(dx) > st.hw + st.hh + rad || Math.abs(dy) > st.hw + st.hh + rad) return null;
    const lx = dx * st.c + dy * st.s;
    const ly = -dx * st.s + dy * st.c;
    let nlx;
    let nly;
    let pen;
    if (Math.abs(lx) <= st.hw && Math.abs(ly) <= st.hh) {
      const px = st.hw - Math.abs(lx);
      const py = st.hh - Math.abs(ly);
      if (px < py) {
        nlx = Math.sign(lx) || 1;
        nly = 0;
        pen = rad + px;
      } else {
        nlx = 0;
        nly = Math.sign(ly) || 1;
        pen = rad + py;
      }
    } else {
      const qx = clamp(lx, -st.hw, st.hw);
      const qy = clamp(ly, -st.hh, st.hh);
      const ddx = lx - qx;
      const ddy = ly - qy;
      const d = Math.hypot(ddx, ddy);
      if (d >= rad) return null;
      nlx = ddx / d;
      nly = ddy / d;
      pen = rad - d;
    }
    const nx = nlx * st.c - nly * st.s;
    const ny = nlx * st.s + nly * st.c;
    p.x += nx * pen;
    p.y += ny * pen;
    return { x: nx, y: ny };
  }
  if (st.type === 'capsule') {
    const ex = st.bx - st.ax;
    const ey = st.by - st.ay;
    const len2 = ex * ex + ey * ey;
    const t = clamp(((p.x - st.ax) * ex + (p.y - st.ay) * ey) / len2, 0, 1);
    const qx = st.ax + ex * t;
    const qy = st.ay + ey * t;
    return pushOut(p, qx, qy, rad + st.r);
  }
  if (st.type === 'circle') return pushOut(p, st.x, st.y, rad + st.r);
  return null;
}

function pushOut(p, qx, qy, minD) {
  const dx = p.x - qx;
  const dy = p.y - qy;
  const d = Math.hypot(dx, dy);
  if (d >= minD || d < 1e-9) return null;
  const nx = dx / d;
  const ny = dy / d;
  p.x = qx + nx * minD;
  p.y = qy + ny * minD;
  return { x: nx, y: ny };
}

function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

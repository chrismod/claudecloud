// Zell-Simulation des Waldbodens in einem toroidalen 256×256-Fenster um die Spieler.
//
// Jede Zelle (1 m²) hat:
//   L  Leben/Bewuchs       – folgt dem Myzel, steuert Gras, Blumen, Bäume
//   M  Myzel               – wird von den Geistern gesponnen, wächst selbst weiter
//   H  Farbton             – wer das Myzel gesponnen hat (0 = Hyphe, 1 = Keim)
//   G  Leuchten            – erregbares Medium: Lichtwellen laufen durchs Netz
//   F  frische Spur        – kurzes Nachglühen hinter den Geistern
//   B  Fäulnis             – geht von Moderherzen aus, frisst Myzel und Leben, nachts weiter
// Nicht gespeicherte Hilfswerte: K (Tragfähigkeit aus Fruchtbarkeit), L0 (Grundzustand), Wasser,
// P (Schutz durch erwachte Mutterbäume).
//
// Myzel und Leben vergehen von selbst nie – nur die Fäulnis kann sie zerstören.
import { CHUNK, WIN, SLOTS, NEAR_R, WATER, PROTECT_R } from '../config.js';
import { smoothstep } from '../noise.js';

const N = WIN;
const MASK = N - 1;
const CELLS = CHUNK * CHUNK;
const A = 0.3; // Allee-Schwelle: darunter wächst Myzel nicht von selbst

export function createSim(field, store, opts = {}) {
  const nestAlive = opts.nestAlive ?? (() => true);
  const size = N * N;
  const B = new Float32Array(size);
  const P = new Float32Array(size);
  let protectors = []; // [{x, z}]
  let sources = []; // lebende Moderherzen im Fenster
  let night = 0;
  // Jahreszeit und Wetter: Wachstum, Fäulnis, gefrorene Seen
  const climate = { grow: 1, rot: 1, freeze: 0 };
  const counters = { healed: 0, cleansed: 0 }; // von außen ablesen und zurücksetzen
  const L = new Float32Array(size);
  const M = new Float32Array(size);
  const H = new Float32Array(size).fill(0.5);
  const G = new Float32Array(size);
  const R = new Float32Array(size); // Refraktärzeit
  const F = new Float32Array(size);
  const K = new Float32Array(size);
  const L0 = new Float32Array(size);
  const W = new Uint8Array(size); // 1 = Wasser
  const fireList = new Int32Array(size);

  // Slot → Chunk
  const slotCx = new Int32Array(SLOTS * SLOTS).fill(0x7fffffff);
  const slotCz = new Int32Array(SLOTS * SLOTS).fill(0x7fffffff);
  const slotActive = new Uint8Array(SLOTS * SLOTS);
  const slotDirty = new Uint8Array(SLOTS * SLOTS);
  const slotChanged = new Uint8Array(SLOTS * SLOTS); // seit letztem Speichern verändert
  let center = { cx: 0x7fffffff, cz: 0x7fffffff };
  const queue = []; // ausstehende Chunk-Ladevorgänge

  const idx = (ix, iz) => ((iz & MASK) << 8) | (ix & MASK);
  const slotOf = (cx, cz) => (cz & (SLOTS - 1)) * SLOTS + (cx & (SLOTS - 1));
  const key = (cx, cz) => cx + ',' + cz;

  function writeBack(s) {
    if (!slotActive[s]) return;
    if (!slotDirty[s]) return;
    const cx = slotCx[s];
    const cz = slotCz[s];
    const data = { L: new Uint8Array(CELLS), M: new Uint8Array(CELLS), H: new Uint8Array(CELLS), B: new Uint8Array(CELLS) };
    for (let lz = 0; lz < CHUNK; lz++)
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = idx(cx * CHUNK + lx, cz * CHUNK + lz);
        const j = lz * CHUNK + lx;
        data.L[j] = Math.round(L[i] * 255);
        data.M[j] = Math.round(M[i] * 255);
        data.H[j] = Math.round(H[i] * 255);
        data.B[j] = Math.round(B[i] * 255);
      }
    store.put(key(cx, cz), data);
    slotChanged[s] = 0;
  }

  function loadChunk(cx, cz) {
    const s = slotOf(cx, cz);
    if (slotActive[s] && slotCx[s] === cx && slotCz[s] === cz) return;
    const saved = store.get(key(cx, cz));
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const nests = field.nestsNear(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK + 30).filter((n) => nestAlive(n.id));
    const prot = protectors.filter((p) => Math.abs(p.x - x0 - 16) < (p.r ?? PROTECT_R) + 24 && Math.abs(p.z - z0 - 16) < (p.r ?? PROTECT_R) + 24);
    for (let lz = 0; lz < CHUNK; lz++)
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = cx * CHUNK + lx + 0.5;
        const z = cz * CHUNK + lz + 0.5;
        const i = idx(cx * CHUNK + lx, cz * CHUNK + lz);
        const h = field.height(x, z);
        const f = field.fertility(x, z, h);
        const base = field.baseState(x, z);
        K[i] = 0.4 + 0.6 * f;
        L0[i] = base.life;
        W[i] = h < WATER ? 1 : 0;
        P[i] = protectionAt(x, z, prot);
        if (saved) {
          const j = lz * CHUNK + lx;
          L[i] = saved.L[j] / 255;
          M[i] = saved.M[j] / 255;
          H[i] = saved.H[j] / 255;
          B[i] = saved.B ? saved.B[j] / 255 : 0;
        } else {
          L[i] = base.life;
          M[i] = base.myc;
          H[i] = 0.5;
          // Fäulnis um die Moderherzen im Tagesgleichgewicht
          let b = 0;
          for (const n of nests) b = Math.max(b, smoothstep(22, 3, Math.hypot(n.x - x, n.z - z)));
          B[i] = b * (1 - P[i]);
        }
        G[i] = 0;
        R[i] = 0;
        F[i] = 0;
      }
    slotCx[s] = cx;
    slotCz[s] = cz;
    slotActive[s] = 1;
    slotDirty[s] = saved ? 1 : 0;
    slotChanged[s] = 0;
  }

  function evictSlot(s) {
    writeBack(s);
    slotActive[s] = 0;
    // neutral füllen, damit veraltete Daten nicht sichtbar werden
    const sx = s % SLOTS;
    const sz = (s / SLOTS) | 0;
    for (let lz = 0; lz < CHUNK; lz++) {
      const row = (sz * CHUNK + lz) << 8;
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = row | (sx * CHUNK + lx);
        L[i] = 0.05;
        M[i] = 0;
        B[i] = 0;
        P[i] = 0;
        G[i] = 0;
        F[i] = 0;
        R[i] = 0;
        K[i] = 0;
      }
    }
  }

  // Fenster um den Chunk (ccx, ccz) zentrieren. immediate=true lädt alles sofort.
  function ensureWindow(ccx, ccz, immediate = false) {
    if (ccx === center.cx && ccz === center.cz && !immediate) return;
    center = { cx: ccx, cz: ccz };
    queue.length = 0;
    for (let s = 0; s < SLOTS * SLOTS; s++) {
      if (!slotActive[s]) continue;
      if (Math.abs(slotCx[s] - ccx) > NEAR_R || Math.abs(slotCz[s] - ccz) > NEAR_R) evictSlot(s);
    }
    const want = [];
    for (let dz = -NEAR_R; dz <= NEAR_R; dz++)
      for (let dx = -NEAR_R; dx <= NEAR_R; dx++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const s = slotOf(cx, cz);
        if (slotActive[s] && slotCx[s] === cx && slotCz[s] === cz) continue;
        if (slotActive[s]) evictSlot(s);
        want.push({ cx, cz, d: dx * dx + dz * dz });
      }
    want.sort((a, b) => a.d - b.d);
    if (immediate) want.forEach((w) => loadChunk(w.cx, w.cz));
    else queue.push(...want);
  }

  // Ausstehende Chunks innerhalb eines Zeitbudgets laden
  function pump(budgetMs = 3) {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budgetMs) {
      const w = queue.shift();
      if (Math.abs(w.cx - center.cx) <= NEAR_R && Math.abs(w.cz - center.cz) <= NEAR_R) loadChunk(w.cx, w.cz);
    }
    return queue.length;
  }

  function protectionAt(x, z, list = protectors) {
    let p = 0;
    for (const q of list) {
      const d = Math.hypot(q.x - x, q.z - z);
      const r = q.r ?? PROTECT_R;
      if (d < r) p = Math.max(p, smoothstep(r, r - Math.min(10, r * 0.4), d));
    }
    return p;
  }

  // Erwachte Mutterbäume schützen ihre Umgebung
  function setProtectors(list) {
    protectors = list.map((p) => ({ x: p.x, z: p.z, r: p.r ?? PROTECT_R }));
    for (let s = 0; s < SLOTS * SLOTS; s++) {
      if (!slotActive[s]) continue;
      const cx = slotCx[s];
      const cz = slotCz[s];
      const near = protectors.filter((p) => Math.abs(p.x - cx * CHUNK - 16) < p.r + 24 && Math.abs(p.z - cz * CHUNK - 16) < p.r + 24);
      for (let lz = 0; lz < CHUNK; lz++)
        for (let lx = 0; lx < CHUNK; lx++) P[idx(cx * CHUNK + lx, cz * CHUNK + lz)] = near.length ? protectionAt(cx * CHUNK + lx + 0.5, cz * CHUNK + lz + 0.5, near) : 0;
    }
  }

  const isLoaded = (ix, iz) => {
    const cx = Math.floor(ix / CHUNK);
    const cz = Math.floor(iz / CHUNK);
    const s = slotOf(cx, cz);
    return slotActive[s] && slotCx[s] === cx && slotCz[s] === cz;
  };

  function markDirty(ix, iz) {
    const s = slotOf(Math.floor(ix / CHUNK), Math.floor(iz / CHUNK));
    slotDirty[s] = 1;
    slotChanged[s] = 1;
  }

  // Myzel spinnen. Gibt die neu entstandene Myzelmenge zurück (Kosten).
  function paint(x, z, radius, target, hue, glow = 0.6) {
    let added = 0;
    const r2 = radius * radius;
    const x0 = Math.floor(x - radius);
    const x1 = Math.ceil(x + radius);
    const z0 = Math.floor(z - radius);
    const z1 = Math.ceil(z + radius);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const dx = ix + 0.5 - x;
        const dz = iz + 0.5 - z;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        if (!isLoaded(ix, iz)) continue;
        const i = idx(ix, iz);
        const w = smoothstep(1, 0.45, Math.sqrt(d2) / radius);
        const t = target * w * (1 - B[i] * 0.75);
        if (t > M[i]) {
          added += t - M[i];
          if (M[i] < 0.5 && t >= 0.5 && !W[i]) counters.healed++;
          // Farbton gewichtet mischen: wer mehr spinnt, färbt mehr
          H[i] += (hue - H[i]) * Math.min(1, ((t - M[i]) / Math.max(t, 0.05)) * 1.2);
          M[i] = t;
          markDirty(ix, iz);
        } else if (w > 0.6) {
          H[i] += (hue - H[i]) * 0.02;
        }
        if (glow * w > F[i]) F[i] = glow * w;
      }
    return added;
  }

  // Fäulnis läutern (Weben, Sporenpuls). Gibt die entfernte Fäulnismenge zurück.
  function cleanse(x, z, radius, amount) {
    let removed = 0;
    const r2 = radius * radius;
    for (let iz = Math.floor(z - radius); iz <= Math.ceil(z + radius); iz++)
      for (let ix = Math.floor(x - radius); ix <= Math.ceil(x + radius); ix++) {
        const d2 = (ix + 0.5 - x) ** 2 + (iz + 0.5 - z) ** 2;
        if (d2 > r2 || !isLoaded(ix, iz)) continue;
        const i = idx(ix, iz);
        if (B[i] <= 0) continue;
        const nb = B[i] * (1 - amount * smoothstep(1, 0.5, Math.sqrt(d2) / radius));
        removed += B[i] - nb;
        B[i] = nb < 0.01 ? 0 : nb;
        markDirty(ix, iz);
      }
    counters.cleansed += removed;
    return removed;
  }

  // Fäulnis säen und Myzel fressen (Moderlinge). Gibt das gefressene Myzel zurück.
  function taint(x, z, radius, amount, eat) {
    let eaten = 0;
    const r2 = radius * radius;
    for (let iz = Math.floor(z - radius); iz <= Math.ceil(z + radius); iz++)
      for (let ix = Math.floor(x - radius); ix <= Math.ceil(x + radius); ix++) {
        const d2 = (ix + 0.5 - x) ** 2 + (iz + 0.5 - z) ** 2;
        if (d2 > r2 || !isLoaded(ix, iz)) continue;
        const i = idx(ix, iz);
        const w = smoothstep(1, 0.4, Math.sqrt(d2) / radius) * (1 - P[i]);
        if (amount * w > B[i]) B[i] = amount * w;
        const e = Math.min(M[i], eat * w);
        M[i] -= e;
        eaten += e;
        markDirty(ix, iz);
      }
    return eaten;
  }

  function paintLine(x1, z1, x2, z2, radius, target, hue, glow = 0.5) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(1, Math.ceil(len / (radius * 0.8)));
    let added = 0;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      added += paint(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, radius, target, hue, glow);
    }
    return added;
  }

  // Leben direkt anheben (Erwachen eines Mutterbaums, Zersetzung)
  function bloom(x, z, radius, life) {
    const r2 = radius * radius;
    for (let iz = Math.floor(z - radius); iz <= Math.ceil(z + radius); iz++)
      for (let ix = Math.floor(x - radius); ix <= Math.ceil(x + radius); ix++) {
        const d2 = (ix + 0.5 - x) ** 2 + (iz + 0.5 - z) ** 2;
        if (d2 > r2 || !isLoaded(ix, iz)) continue;
        const i = idx(ix, iz);
        const t = life * smoothstep(1, 0.6, Math.sqrt(d2) / radius);
        if (t > L[i]) {
          L[i] = t;
          markDirty(ix, iz);
        }
      }
  }

  // Lichtwelle auslösen
  function excite(x, z, radius = 1.5) {
    for (let iz = Math.floor(z - radius); iz <= Math.ceil(z + radius); iz++)
      for (let ix = Math.floor(x - radius); ix <= Math.ceil(x + radius); ix++) {
        if ((ix + 0.5 - x) ** 2 + (iz + 0.5 - z) ** 2 > radius * radius || !isLoaded(ix, iz)) continue;
        const i = idx(ix, iz);
        if (M[i] > 0.2 && R[i] <= 0) {
          G[i] = 1;
          R[i] = 1;
        }
      }
  }

  // Langsame Regeln: Myzel wächst in fruchtbaren Boden, Leben folgt dem Myzel
  function step(dt) {
    const spread = 0.09 * dt * climate.grow;
    const grow = 0.05 * dt * climate.grow;
    const lifeRate = Math.min(1, 0.4 * dt * Math.sqrt(climate.grow));
    const waterBlock = 0.6 + 0.37 * climate.freeze;
    // Moderherzen speisen die Fäulnis
    for (const n of sources) {
      const r = 3.5;
      for (let iz = Math.floor(n.z - r); iz <= Math.ceil(n.z + r); iz++)
        for (let ix = Math.floor(n.x - r); ix <= Math.ceil(n.x + r); ix++) {
          if ((ix + 0.5 - n.x) ** 2 + (iz + 0.5 - n.z) ** 2 > r * r || !isLoaded(ix, iz)) continue;
          B[idx(ix, iz)] = 1;
        }
    }
    // nachts reicht sie weiter und frisst schneller
    const reach = 0.958 + 0.03 * night;
    const brate = (0.35 + 1.2 * night) * dt * climate.rot;
    const brecede = (0.05 * (1 - night)) * dt;
    const eat = (0.05 + 0.06 * night) * dt;
    for (let s = 0; s < SLOTS * SLOTS; s++) {
      if (!slotActive[s]) continue;
      const sx = s % SLOTS;
      const sz = (s / SLOTS) | 0;
      const left = slotActive[sz * SLOTS + ((sx + SLOTS - 1) % SLOTS)];
      const right = slotActive[sz * SLOTS + ((sx + 1) % SLOTS)];
      const up = slotActive[((sz + SLOTS - 1) % SLOTS) * SLOTS + sx];
      const down = slotActive[((sz + 1) % SLOTS) * SLOTS + sx];
      let changed = false;
      for (let lz = 0; lz < CHUNK; lz++) {
        const wz = sz * CHUNK + lz;
        for (let lx = 0; lx < CHUNK; lx++) {
          const wx = sx * CHUNK + lx;
          const i = (wz << 8) | wx;
          const m = M[i];
          const k = K[i];
          // Nachbarn (an inaktiven Rändern zählt die Zelle selbst)
          let best = m;
          let bi = i;
          let j;
          const b = B[i];
          let bb = b;
          if (lx > 0 || left) {
            j = (wz << 8) | ((wx - 1) & MASK);
            if (M[j] > best) (best = M[j]), (bi = j);
            if (B[j] > bb) bb = B[j];
          }
          if (lx < CHUNK - 1 || right) {
            j = (wz << 8) | ((wx + 1) & MASK);
            if (M[j] > best) (best = M[j]), (bi = j);
            if (B[j] > bb) bb = B[j];
          }
          if (lz > 0 || up) {
            j = (((wz - 1) & MASK) << 8) | wx;
            if (M[j] > best) (best = M[j]), (bi = j);
            if (B[j] > bb) bb = B[j];
          }
          if (lz < CHUNK - 1 || down) {
            j = (((wz + 1) & MASK) << 8) | wx;
            if (M[j] > best) (best = M[j]), (bi = j);
            if (B[j] > bb) bb = B[j];
          }
          // Fäulnis: schwächer mit jedem Meter vom Herz, gebremst durch kräftiges Myzel und Wasser
          const p = P[i];
          let nb = b;
          const btarget = bb * reach * (1 - p) * (W[i] ? waterBlock : 1);
          if (bb > 0.22 && btarget > b + 0.005) nb += (btarget - b) * Math.min(1, brate * (1 - 0.6 * m));
          else if (btarget < b) nb -= Math.min(b - btarget, brecede + (b - btarget) * 0.02 * dt);
          if (p > 0) nb *= 1 - Math.min(1, p * dt * 3);
          if (nb < 0.004) nb = 0;
          if (nb !== b) {
            B[i] = nb;
            if (Math.abs(nb - b) > 0.002) changed = true;
          }
          let nm = m;
          if (nb > 0.3) nm = Math.max(0, nm - eat * nb);
          if (best > m + 0.02 && best > A) {
            // Ausbreitung nur in fruchtbaren Boden, nie über den Nachbarn hinaus
            const gate = smoothstep(0.62, 0.9, k);
            if (gate > 0) {
              const d = spread * gate * (best - m) * smoothstep(A, 0.9, best);
              nm += d;
              H[i] += (H[bi] - H[i]) * Math.min(1, (d / Math.max(nm, 0.05)) * 1.5);
            }
          }
          if (nm > A && nm < k && nb < 0.3) nm += grow * (k - nm);
          if (nm !== m) {
            M[i] = nm;
            if (Math.abs(nm - m) > 0.001) changed = true;
          }
          // Leben folgt dem Myzel – wächst schnell, vergeht nur durch Fäulnis
          const rot = nb > 0.25 ? nb : 0;
          const target = Math.max(L0[i] * (1 - rot), Math.min(1, nm * (0.55 + 0.55 * k)));
          const l = L[i];
          if (target > l + 0.001 && rot < 0.3) {
            L[i] = l + (target - l) * lifeRate;
            changed = true;
          } else if (rot > 0.3 && l > target) {
            L[i] = Math.max(target, l - eat * 1.3 * rot);
            changed = true;
          }
        }
      }
      if (changed) {
        slotDirty[s] = 1;
        slotChanged[s] = 1;
      }
    }
  }

  // Schnelle Regeln: erregbares Medium (Lichtwellen) und Abklingen der frischen Spur
  function stepGlow(dt) {
    let nFire = 0;
    const decay = dt * 2.2;
    const refr = dt * 0.7;
    const fdec = dt * 0.45;
    for (let s = 0; s < SLOTS * SLOTS; s++) {
      if (!slotActive[s]) continue;
      const sx = s % SLOTS;
      const sz = (s / SLOTS) | 0;
      for (let lz = 0; lz < CHUNK; lz++) {
        const wz = sz * CHUNK + lz;
        const row = wz << 8;
        const rowU = ((wz - 1) & MASK) << 8;
        const rowD = ((wz + 1) & MASK) << 8;
        for (let lx = 0; lx < CHUNK; lx++) {
          const wx = sx * CHUNK + lx;
          const i = row | wx;
          if (F[i] > 0) F[i] = Math.max(0, F[i] - fdec);
          if (R[i] > 0) {
            R[i] -= refr;
            if (G[i] > 0) G[i] = Math.max(0, G[i] - decay);
            continue;
          }
          if (M[i] < 0.35) continue;
          if (
            G[row | ((wx - 1) & MASK)] > 0.55 ||
            G[row | ((wx + 1) & MASK)] > 0.55 ||
            G[rowU | wx] > 0.55 ||
            G[rowD | wx] > 0.55
          )
            fireList[nFire++] = i;
        }
      }
    }
    for (let k = 0; k < nFire; k++) {
      const i = fireList[k];
      G[i] = 1;
      R[i] = 1;
    }
  }

  // RGBA-Textur: R = Leben, G = Myzel, B = Farbton, A = Leuchten
  function writeTexture(data) {
    // vier Bytes auf einmal (Little Endian: R im niedrigsten Byte)
    const d32 = new Uint32Array(data.buffer, data.byteOffset, size);
    for (let i = 0; i < size; i++) {
      const g = G[i] > F[i] ? G[i] : F[i];
      d32[i] = ((L[i] * 255) | 0) | (((M[i] * 255) | 0) << 8) | (((H[i] * 255) | 0) << 16) | (((g * 255) | 0) << 24);
    }
  }

  // Zweite Textur: R = Fäulnis, G = Schutz
  function writeTexture2(data) {
    const d32 = new Uint32Array(data.buffer, data.byteOffset, size);
    for (let i = 0; i < size; i++) d32[i] = ((B[i] * 255) | 0) | (((P[i] * 255) | 0) << 8);
  }

  function sample(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (!isLoaded(ix, iz)) return { L: 0, M: 0, H: 0.5, G: 0, K: 0, B: 0, P: 0, water: false, loaded: false };
    const i = idx(ix, iz);
    return { L: L[i], M: M[i], H: H[i], G: Math.max(G[i], F[i]), K: K[i], B: B[i], P: P[i], water: !!W[i], loaded: true };
  }

  // Fäulnis-Lage im Fenster: befallene Fläche, bedrohtes Myzel und der bedrohte Punkt nächst (fx, fz)
  function rotStats(fx, fz) {
    let rot = 0;
    let threat = 0;
    let best = null;
    let bd = Infinity;
    for (let s = 0; s < SLOTS * SLOTS; s++) {
      if (!slotActive[s]) continue;
      const cx = slotCx[s];
      const cz = slotCz[s];
      for (let lz = 0; lz < CHUNK; lz += 1)
        for (let lx = 0; lx < CHUNK; lx += 1) {
          const i = idx(cx * CHUNK + lx, cz * CHUNK + lz);
          if (B[i] < 0.4) continue;
          rot++;
          if (M[i] > 0.35) {
            threat++;
            const x = cx * CHUNK + lx + 0.5;
            const z = cz * CHUNK + lz + 0.5;
            const d = (x - fx) ** 2 + (z - fz) ** 2;
            if (d < bd) {
              bd = d;
              best = { x, z };
            }
          }
        }
    }
    return { rot, threat, nearest: best };
  }

  // Anteil der Zellen im Kreis mit Myzel über der Schwelle (Wasser zählt nicht)
  function coverage(x, z, radius, thresh = 0.5) {
    let n = 0;
    let c = 0;
    for (let iz = Math.floor(z - radius); iz <= Math.ceil(z + radius); iz++)
      for (let ix = Math.floor(x - radius); ix <= Math.ceil(x + radius); ix++) {
        if ((ix + 0.5 - x) ** 2 + (iz + 0.5 - z) ** 2 > radius * radius || !isLoaded(ix, iz)) continue;
        const i = idx(ix, iz);
        if (W[i]) continue;
        n++;
        if (M[i] >= thresh) c++;
      }
    return n ? c / n : 0;
  }

  // Alle veränderten Chunks in den Speicher übernehmen
  function persist() {
    for (let s = 0; s < SLOTS * SLOTS; s++) if (slotActive[s] && slotChanged[s]) writeBack(s);
    store.flush();
  }

  // Zählt belebte Fläche (M ≥ 0.5) im Fenster
  function healedInWindow() {
    let c = 0;
    for (let s = 0; s < SLOTS * SLOTS; s++) {
      if (!slotActive[s]) continue;
      const sx = s % SLOTS;
      const sz = (s / SLOTS) | 0;
      for (let lz = 0; lz < CHUNK; lz++) {
        const row = (sz * CHUNK + lz) << 8;
        for (let lx = 0; lx < CHUNK; lx++) if (M[row | (sx * CHUNK + lx)] >= 0.5) c++;
      }
    }
    return c;
  }

  // Belebte Zellen pro geladenem Chunk: [[key, count], …]
  function chunkCounts() {
    const out = [];
    for (let s = 0; s < SLOTS * SLOTS; s++) {
      if (!slotActive[s]) continue;
      const sx = s % SLOTS;
      const sz = (s / SLOTS) | 0;
      let c = 0;
      for (let lz = 0; lz < CHUNK; lz++) {
        const row = (sz * CHUNK + lz) << 8;
        for (let lx = 0; lx < CHUNK; lx++) if (M[row | (sx * CHUNK + lx)] >= 0.5) c++;
      }
      out.push([key(slotCx[s], slotCz[s]), c]);
    }
    return out;
  }

  return {
    L, M, H, G, F, K, W, B, P,
    counters,
    climate,
    taint,
    chunkCounts,
    setProtectors,
    cleanse,
    writeTexture2,
    rotStats,
    setSources(list) {
      sources = list;
    },
    set night(v) {
      night = v;
    },
    get night() {
      return night;
    },
    idx,
    isLoaded,
    get center() {
      return center;
    },
    get pending() {
      return queue.length;
    },
    ensureWindow,
    pump,
    paint,
    paintLine,
    bloom,
    excite,
    step,
    stepGlow,
    writeTexture,
    sample,
    coverage,
    persist,
    healedInWindow,
  };
}

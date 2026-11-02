// Zell-Simulation des Waldbodens in einem toroidalen 256×256-Fenster um die Spieler.
//
// Jede Zelle (1 m²) hat:
//   L  Leben/Bewuchs       – folgt dem Myzel, steuert Gras, Blumen, Bäume
//   M  Myzel               – wird von den Geistern gesponnen, wächst selbst weiter
//   H  Farbton             – wer das Myzel gesponnen hat (0 = Hyphe, 1 = Keim)
//   G  Leuchten            – erregbares Medium: Lichtwellen laufen durchs Netz
//   F  frische Spur        – kurzes Nachglühen hinter den Geistern
// Nicht gespeicherte Hilfswerte: K (Tragfähigkeit aus Fruchtbarkeit), L0 (Grundzustand), Wasser.
//
// Die Regeln sind bewusst ohne Zerfall: Was die Spieler beleben, bleibt belebt.
import { CHUNK, WIN, SLOTS, NEAR_R, WATER } from '../config.js';
import { smoothstep } from '../noise.js';

const N = WIN;
const MASK = N - 1;
const CELLS = CHUNK * CHUNK;
const A = 0.3; // Allee-Schwelle: darunter wächst Myzel nicht von selbst

export function createSim(field, store) {
  const size = N * N;
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
    const data = { L: new Uint8Array(CELLS), M: new Uint8Array(CELLS), H: new Uint8Array(CELLS) };
    for (let lz = 0; lz < CHUNK; lz++)
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = idx(cx * CHUNK + lx, cz * CHUNK + lz);
        const j = lz * CHUNK + lx;
        data.L[j] = Math.round(L[i] * 255);
        data.M[j] = Math.round(M[i] * 255);
        data.H[j] = Math.round(H[i] * 255);
      }
    store.put(key(cx, cz), data);
    slotChanged[s] = 0;
  }

  function loadChunk(cx, cz) {
    const s = slotOf(cx, cz);
    if (slotActive[s] && slotCx[s] === cx && slotCz[s] === cz) return;
    const saved = store.get(key(cx, cz));
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
        if (saved) {
          const j = lz * CHUNK + lx;
          L[i] = saved.L[j] / 255;
          M[i] = saved.M[j] / 255;
          H[i] = saved.H[j] / 255;
        } else {
          L[i] = base.life;
          M[i] = base.myc;
          H[i] = 0.5;
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
        const t = target * w;
        if (t > M[i]) {
          added += t - M[i];
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
    const spread = 0.09 * dt;
    const grow = 0.05 * dt;
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
          if (lx > 0 || left) {
            j = (wz << 8) | ((wx - 1) & MASK);
            if (M[j] > best) (best = M[j]), (bi = j);
          }
          if (lx < CHUNK - 1 || right) {
            j = (wz << 8) | ((wx + 1) & MASK);
            if (M[j] > best) (best = M[j]), (bi = j);
          }
          if (lz > 0 || up) {
            j = (((wz - 1) & MASK) << 8) | wx;
            if (M[j] > best) (best = M[j]), (bi = j);
          }
          if (lz < CHUNK - 1 || down) {
            j = (((wz + 1) & MASK) << 8) | wx;
            if (M[j] > best) (best = M[j]), (bi = j);
          }
          let nm = m;
          if (best > m + 0.02 && best > A) {
            // Ausbreitung nur in fruchtbaren Boden, nie über den Nachbarn hinaus
            const gate = smoothstep(0.62, 0.9, k);
            if (gate > 0) {
              const d = spread * gate * (best - m) * smoothstep(A, 0.9, best);
              nm += d;
              H[i] += (H[bi] - H[i]) * Math.min(1, (d / Math.max(nm, 0.05)) * 1.5);
            }
          }
          if (nm > A && nm < k) nm += grow * (k - nm);
          if (nm !== m) {
            M[i] = nm;
            if (nm - m > 0.001) changed = true;
          }
          // Leben folgt dem Myzel – wächst schnell, vergeht nicht
          const target = Math.max(L0[i], Math.min(1, nm * (0.55 + 0.55 * k)));
          const l = L[i];
          if (target > l + 0.001) {
            L[i] = l + (target - l) * Math.min(1, 0.4 * dt);
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
    for (let i = 0, p = 0; i < size; i++, p += 4) {
      data[p] = L[i] * 255;
      data[p + 1] = M[i] * 255;
      data[p + 2] = H[i] * 255;
      const g = G[i] > F[i] ? G[i] : F[i];
      data[p + 3] = g * 255;
    }
  }

  function sample(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (!isLoaded(ix, iz)) return { L: 0, M: 0, H: 0.5, G: 0, K: 0, water: false, loaded: false };
    const i = idx(ix, iz);
    return { L: L[i], M: M[i], H: H[i], G: Math.max(G[i], F[i]), K: K[i], water: !!W[i], loaded: true };
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
    L, M, H, G, F, K, W,
    chunkCounts,
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

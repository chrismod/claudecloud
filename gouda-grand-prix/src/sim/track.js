// Strecke: geschlossener Spline → Proben im Meterabstand, Abstandssuche, Fahrbahnhöhe, Kurvenüberhöhung
// Läuft ohne DOM (auch in Node für Tests und Bots).
import { CatmullRomCurve3, Vector3 } from 'three';

export const ROAD_HALF = 9; // halbe Fahrbahnbreite
export const CURB = 1.4; // Randstein
export const WALL = 16.5; // Bande (Käselaib-Stapel) ab Mitte

const STEP = 1; // Meter zwischen den Proben

export function buildTrack(def) {
  const pts = def.points.map(([x, z, y = 0]) => new Vector3(x, y, z));
  const curve = new CatmullRomCurve3(pts, true, 'centripetal');
  const rough = curve.getLength();
  const n = Math.max(200, Math.round(rough / STEP));
  const raw = curve.getSpacedPoints(n).slice(0, n);

  const x = new Float32Array(n);
  const z = new Float32Array(n);
  let y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = raw[i].x;
    z[i] = raw[i].z;
    y[i] = raw[i].y;
  }
  // Höhenprofil glätten, Sprungschanzen bleiben als bewusste Kanten erhalten
  for (let pass = 0; pass < 6; pass++) {
    const t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = (y[(i - 1 + n) % n] + y[i] * 2 + y[(i + 1) % n]) / 4;
    y = t;
  }
  const y0 = Float32Array.from(y); // ohne Schanzen (für die Fahrbahngrafik)
  for (const r of def.ramps ?? []) {
    // Rampe: steigt über len Meter an und bricht dann ab
    const i0 = Math.round(r.at * n);
    for (let k = 0; k < r.len; k++) {
      const i = (i0 + k) % n;
      const u = k / r.len;
      y[i] += r.height * u * u;
    }
  }

  // Richtung, Rechtsvektor, Krümmung
  const tx = new Float32Array(n);
  const tz = new Float32Array(n);
  const heading = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    let dx = x[b] - x[a];
    let dz = z[b] - z[a];
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l;
    tz[i] = dz / l;
    heading[i] = Math.atan2(tx[i], tz[i]);
  }
  const seg = new Float32Array(n);
  let length = 0;
  for (let i = 0; i < n; i++) {
    const b = (i + 1) % n;
    seg[i] = Math.hypot(x[b] - x[i], z[b] - z[i]);
    length += seg[i];
  }
  const sAt = new Float32Array(n);
  for (let i = 1; i < n; i++) sAt[i] = sAt[i - 1] + seg[i - 1];

  const curv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 3 + n) % n;
    const b = (i + 3) % n;
    let d = heading[b] - heading[a];
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    curv[i] = d / 6;
  }
  // Überhöhung: Außenseite der Kurve höher (Linkskurve → rechts höher)
  let bank = new Float32Array(n);
  for (let i = 0; i < n; i++) bank[i] = Math.max(-0.16, Math.min(0.16, curv[i] * (def.banking ?? 3.2)));
  for (let pass = 0; pass < 12; pass++) {
    const t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = (bank[(i - 1 + n) % n] + bank[i] * 2 + bank[(i + 1) % n]) / 4;
    bank = t;
  }

  // Räumliches Raster für die Suche ohne Vorwissen
  const CELL = 40;
  const grid = new Map();
  const key = (cx, cz) => cx * 73856093 + cz * 19349663;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(x[i] / CELL), Math.floor(z[i] / CELL));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(i);
  }

  const track = {
    def,
    n,
    length,
    x,
    z,
    y,
    y0,
    tx,
    tz,
    heading,
    curv,
    bank,
    sAt,
    wrap(i) {
      return ((i % n) + n) % n;
    },
    // Index zur Streckenposition s (Meter)
    indexAt(s) {
      const f = (((s % length) + length) % length) / length;
      return Math.min(n - 1, Math.floor(f * n));
    },
    // Punkt auf der Strecke bei s und seitlichem Versatz d
    pointAt(s, d = 0, out = {}) {
      const f = ((((s % length) + length) % length) / length) * n;
      const i = Math.floor(f) % n;
      const j = (i + 1) % n;
      const u = f - Math.floor(f);
      const cx = x[i] + (x[j] - x[i]) * u;
      const cz = z[i] + (z[j] - z[i]) * u;
      const cy = y[i] + (y[j] - y[i]) * u;
      const ttx = tx[i] + (tx[j] - tx[i]) * u;
      const ttz = tz[i] + (tz[j] - tz[i]) * u;
      const l = Math.hypot(ttx, ttz) || 1;
      const b = bank[i] + (bank[j] - bank[i]) * u;
      out.x = cx - (ttz / l) * d;
      out.z = cz + (ttx / l) * d;
      out.y = cy + d * b;
      out.tx = ttx / l;
      out.tz = ttz / l;
      out.heading = Math.atan2(out.tx, out.tz);
      out.bank = b;
      return out;
    },
    /**
     * Nächster Streckenpunkt zu (px, pz). hint = letzter bekannter Index (lokale Suche, damit eng
     * benachbarte Abschnitte nicht verwechselt werden). Liefert { i, s, d, y, bank, tx, tz }.
     */
    locate(px, pz, hint = -1, out = {}) {
      let best = -1;
      let bestD = Infinity;
      if (hint >= 0) {
        for (let k = -24; k <= 24; k++) {
          const i = (hint + k + n) % n;
          const dd = (x[i] - px) ** 2 + (z[i] - pz) ** 2;
          if (dd < bestD) (bestD = dd), (best = i);
        }
      } else {
        const cx = Math.floor(px / CELL);
        const cz = Math.floor(pz / CELL);
        for (let a = -1; a <= 1; a++)
          for (let b = -1; b <= 1; b++) {
            const list = grid.get(key(cx + a, cz + b));
            if (!list) continue;
            for (const i of list) {
              const dd = (x[i] - px) ** 2 + (z[i] - pz) ** 2;
              if (dd < bestD) (bestD = dd), (best = i);
            }
          }
        if (best < 0) {
          for (let i = 0; i < n; i += 4) {
            const dd = (x[i] - px) ** 2 + (z[i] - pz) ** 2;
            if (dd < bestD) (bestD = dd), (best = i);
          }
        }
      }
      // auf das Segment davor oder danach projizieren
      const i = best;
      const ex = px - x[i];
      const ez = pz - z[i];
      const along = ex * tx[i] + ez * tz[i];
      const d = -ex * tz[i] + ez * tx[i];
      let s = sAt[i] + along;
      s = ((s % length) + length) % length;
      const j = along >= 0 ? (i + 1) % n : (i - 1 + n) % n;
      const u = Math.min(1, Math.abs(along) / (seg[i] || 1));
      const cy = y[i] + (y[j] - y[i]) * u;
      const b = bank[i] + (bank[j] - bank[i]) * u;
      out.i = i;
      out.s = s;
      out.d = d;
      out.dist = Math.sqrt(bestD);
      out.bank = b;
      out.y = cy + Math.max(-WALL, Math.min(WALL, d)) * b;
      out.tx = tx[i];
      out.tz = tz[i];
      return out;
    },
    // Fahrbahnhöhe an einer Weltposition (für Gegenstände ohne eigenen Hinweis)
    groundAt(px, pz, hint = -1) {
      return this.locate(px, pz, hint, tmp).y;
    },
  };
  const tmp = {};
  return track;
}

// Abstand mit Vorzeichen entlang der Strecke von a nach b (kürzester Weg auf dem Rundkurs)
export function trackDelta(track, a, b) {
  let d = b - a;
  const L = track.length;
  if (d > L / 2) d -= L;
  if (d < -L / 2) d += L;
  return d;
}

// Prüft die Streckenformen: Länge, engster Radius, Abstand zwischen Abschnitten, Steigungen
import { buildTrack, WALL } from '../src/sim/track.js';
import { TRACKS } from '../src/sim/tracks.js';

for (const def of TRACKS) {
  const t = buildTrack(def);
  let minR = Infinity, minRAt = 0;
  for (let i = 0; i < t.n; i++) { const r = 1 / Math.max(1e-6, Math.abs(t.curv[i])); if (r < minR) (minR = r), (minRAt = i); }
  let minSep = Infinity, sepAt = null;
  for (let i = 0; i < t.n; i += 2)
    for (let j = 0; j < t.n; j += 2) {
      let gap = Math.abs(i - j); gap = Math.min(gap, t.n - gap);
      if (gap < 90) continue;
      const d = Math.hypot(t.x[i] - t.x[j], t.z[i] - t.z[j]);
      if (d < minSep) (minSep = d), (sepAt = [i, j]);
    }
  let maxSlope = 0;
  for (let i = 0; i < t.n; i++) maxSlope = Math.max(maxSlope, Math.abs(t.y[(i + 1) % t.n] - t.y[i]));
  const xs = [...t.x], zs = [...t.z];
  console.log(`${def.name}: Länge ${t.length.toFixed(0)} m, engster Radius ${minR.toFixed(1)} m bei ${(minRAt / t.n).toFixed(3)}, ` +
    `min. Abstand ${minSep.toFixed(1)} m (${sepAt.map((i) => (i / t.n).toFixed(3))}) [braucht > ${(2 * WALL + 8).toFixed(0)}], ` +
    `max. Steigung ${(maxSlope * 100).toFixed(1)} %, Box x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)} z ${Math.min(...zs).toFixed(0)}..${Math.max(...zs).toFixed(0)}`);
}

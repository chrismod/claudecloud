// Himalaya-Kulisse: große Gipfel rund um die Strecke. Am Start ist man fast so hoch wie sie,
// unten im Tal ragen sie zwei Kilometer über einem auf.
import * as THREE from 'three';
import { fbm2, noise2 } from '../../shared/noise.js';
import { rng } from '../../shared/rng.js';

function peakGeometry(R, H, seed, altitudeAt, baseY) {
  const segs = 56;
  const rings = 18;
  const pos = [];
  const col = [];
  const snow = new THREE.Color('#f3f6fb');
  const shade = new THREE.Color('#c9d6e6');
  const rock = new THREE.Color('#80838c');
  const rockWarm = new THREE.Color('#8f877d');
  const green = new THREE.Color('#5a7a3e');
  const c = new THREE.Color();
  const pt = (ring, seg) => {
    const t = ring / rings; // 0 = Gipfel, 1 = Fuß
    const a = (seg / segs) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // Grate: einige ausgeprägte Rippen vom Gipfel nach unten
    const ridge = Math.abs(Math.sin(a * 3 + seed)) * 0.35 + Math.abs(Math.sin(a * 5 + seed * 2)) * 0.15;
    const n = fbm2(ca * 2 + seed, sa * 2 + t * 3, seed, 3);
    const r = R * t * (0.75 + ridge * 0.5 + n * 0.25);
    const h = H * Math.pow(1 - t, 1.35) * (1 + n * 0.12) + (t === 0 ? H * 0.04 : 0);
    return [ca * r, h, sa * r];
  };
  const P = [];
  for (let ring = 0; ring <= rings; ring++) {
    const row = [];
    for (let seg = 0; seg <= segs; seg++) row.push(pt(ring, seg % segs));
    P.push(row);
  }
  const tri = (a, b, d) => {
    // Flächennormale für die Färbung
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    const ny = Math.abs(uz * vx - ux * vz) / Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const y = (a[1] + b[1] + d[1]) / 3;
    const alt = altitudeAt(baseY + y);
    const k = noise2(a[0] * 0.004, a[2] * 0.004 + y * 0.003, 31);
    // Schnee bleibt auf flacheren Stellen liegen; steile Wände zeigen Fels
    const snowLine = 4700 + (k - 0.5) * 900;
    if (alt > snowLine && ny > 0.35) c.copy(snow).lerp(shade, (1 - ny) * 0.7);
    else if (alt < 3900) c.copy(green).lerp(rock, Math.max(0, (alt - 3500) / 400));
    else c.copy(rock).lerp(rockWarm, k);
    for (const v of [a, b, d]) {
      pos.push(v[0], v[1], v[2]);
      col.push(c.r, c.g, c.b);
    }
  };
  for (let ring = 0; ring < rings; ring++)
    for (let seg = 0; seg < segs; seg++) {
      const a = P[ring][seg];
      const b = P[ring][seg + 1];
      const d = P[ring + 1][seg];
      const e = P[ring + 1][seg + 1];
      if (ring > 0) tri(a, d, b);
      tri(b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function buildMountains(group, track) {
  const r = rng(0xe7e7e57);
  const L = track.length;
  const startY = track.start.y;
  const valleyY = (z) => track.heightAt(track.centerAt(Math.max(0, Math.min(L, z))), Math.max(0, Math.min(L, z)));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const peaks = [];
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -900 + r() * (L + 2400);
    const dist = 1100 + r() * 2600;
    const x = side * dist;
    const baseY = valleyY(z) - 250 - dist * 0.1;
    // Gipfelhöhe: in der Nähe des Starts knapp unter dem Everest, sonst darunter streuend
    const top = startY - 150 - r() * 1300 - Math.max(0, -z) * 0.2;
    let H = Math.max(700, top - baseY);
    // Der Fuß darf nicht bis an die Strecke reichen
    const R = Math.min(H * (0.9 + r() * 0.7), dist - 400);
    H = Math.min(H, R * 1.9);
    const m = new THREE.Mesh(peakGeometry(R, H, i * 1.7 + 0.3, track.altitudeAt, baseY), mat);
    m.position.set(x, baseY, z);
    m.rotation.y = r() * 6.28;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    peaks.push(m);
  }
  // Ein markanter Spitzberg (wie die Ama Dablam) über dem Tal
  const H = startY - valleyY(2600) - 900;
  const ama = new THREE.Mesh(peakGeometry(Math.min(H * 0.55, 1000), H, 9.1, track.altitudeAt, valleyY(2600) - 150), mat);
  ama.position.set(1500, valleyY(2600) - 150, 2600);
  ama.matrixAutoUpdate = false;
  ama.updateMatrix();
  group.add(ama);
  return peaks;
}

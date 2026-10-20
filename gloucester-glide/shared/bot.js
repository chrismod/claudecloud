// Einfacher Fahrer: steuert zur Ideallinie und weicht Felsen und Ballen aus. Für Tests, Tuning und das Menü.
export function botInput(race, { aggression = 1 } = {}) {
  const { p, v, q } = race.transform();
  const track = race.track;
  const sp = Math.sqrt(v.x * v.x + v.z * v.z);
  const look = 6 + Math.min(sp, 30) * 0.5;
  let tx = track.centerAt(p.z + look);
  // Hindernisse im Vorausblick: Ziel daneben legen
  const R = race.cheese.radius;
  for (const o of race.obstacles) {
    const dz = o.z - p.z;
    if (dz < 1 || dz > look + 10) continue;
    const clear = o.r + R + 1.2;
    const lineX = p.x + ((tx - p.x) * dz) / look;
    if (Math.abs(lineX - o.x) < clear) {
      const c = track.centerAt(o.z);
      const side = o.x > c ? -1 : 1;
      tx = o.x + side * (clear + 0.4);
      break;
    }
  }
  const dx = tx - p.x;
  const dz = look;
  const vl = sp || 1;
  const cross = (v.z / vl) * dx - (v.x / vl) * dz;
  const dl = Math.sqrt(dx * dx + dz * dz);
  const steer = Math.max(-100, Math.min(100, (-cross / dl) * 250 * aggression));
  // Liegt der Laib flach, springen (aufstellen)
  const ay = 1 - 2 * (q.x * q.x + q.z * q.z);
  let flags = 0;
  if ((ay > 0.75 || ay < -0.75) && race.grounded) flags |= 1;
  return { steer: Math.round(steer), flags };
}

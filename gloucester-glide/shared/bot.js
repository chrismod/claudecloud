// Einfacher Fahrer: steuert zur Ideallinie. Für Tests, Tuning und als Tempomacher.
export function botInput(race, { aggression = 1 } = {}) {
  const { p, v, q } = race.transform();
  const track = race.track;
  const look = 6 + Math.min(Math.sqrt(v.x * v.x + v.z * v.z), 30) * 0.5;
  const tx = track.centerAt(p.z + look);
  // gewünschte Richtung vs. aktuelle Bewegungsrichtung (Kreuzprodukt in der Ebene)
  const dx = tx - p.x;
  const dz = look;
  const vl = Math.sqrt(v.x * v.x + v.z * v.z) || 1;
  const cross = (v.z / vl) * dx - (v.x / vl) * dz; // >0: Ziel liegt links (−x)… Vorzeichen siehe unten
  const dl = Math.sqrt(dx * dx + dz * dz);
  let steer = Math.max(-100, Math.min(100, (-cross / dl) * 250 * aggression));
  // Achse prüfen: liegt der Laib flach, springen (aufstellen)
  const ax = 2 * (q.x * q.y - q.w * q.z);
  const ay = 1 - 2 * (q.x * q.x + q.z * q.z);
  let flags = 0;
  if ((ay > 0.75 || ay < -0.75) && race.grounded) flags |= 1;
  void ax;
  return { steer: Math.round(steer), flags };
}

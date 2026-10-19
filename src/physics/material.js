// Temperaturabhängiges Materialmodell für geschmolzenen Käse.
// T = 1 heißt frisch gezogen (weich, fließt, zieht sich zusammen),
// T = 0 heißt erstarrt (steif, behält seine Form, bricht spröde).

export const COOL_TIME = 9; // Sekunden, bis ein Faden komplett fest ist

export const THREAD_RADIUS = 0.075; // Radius eines frisch gezogenen Fadens
export const SEGMENT_LENGTH = 0.16; // Ziel-Segmentlänge der Partikelkette
// Träge Dichte ist bewusst hoch (gute Kopplung mit der schweren Olive),
// die Schwerkraft auf Fäden wird dafür skaliert.
export const DENSITY = 15;
export const STRAND_GRAVITY_SCALE = 0.27;

const HOT = {
  stretch: 6e-3, // Dehnungs-Compliance pro Längeneinheit
  bend: Infinity, // keine Biegesteifigkeit
  flow: 1.6, // plastisches Fließen (1/s) oberhalb der Fließgrenze
  yieldStrain: 0.015,
  shrink: 0.1, // aktives Zusammenziehen (1/s) – macht Fäden straff
  bendFlow: 40, // Biege-Ruhelage folgt sofort der aktuellen Form
  damping: 5,
  breakStrain: 2.5, // praktisch unzerreißbar – heißer Käse fließt stattdessen
};

const COLD = {
  stretch: 2.5e-5,
  bend: 4e-6,
  flow: 0,
  yieldStrain: 0.015,
  shrink: 0,
  bendFlow: 0,
  damping: 0.5,
  breakStrain: 0.055,
  impactBreak: 5.5,
};

const lerp = (a, b, t) => a + (b - a) * t;
const lerpLog = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// 0 = heiß, 1 = fest
export function setness(T) {
  return smooth(0, 1, 1 - T);
}

export function materialAt(T, out = {}) {
  const s = setness(T);
  out.setness = s;
  out.stretchCompliance = lerpLog(HOT.stretch, COLD.stretch, s);
  // Biegesteifigkeit setzt erst ein, wenn der Käse anzieht
  const sb = smooth(0.35, 1, s);
  out.bendCompliance = sb <= 0 ? Infinity : lerpLog(5e-1, COLD.bend, sb);
  out.flow = HOT.flow * (1 - smooth(0.45, 1, s));
  out.yieldStrain = lerp(HOT.yieldStrain, 0, smooth(0.3, 0.9, s));
  // thermisches Zusammenziehen hält die Fäden beim Abkühlen straff
  out.shrink = lerp(HOT.shrink, 0.04, smooth(0.25, 0.6, s)) * (1 - smooth(0.6, 0.85, s));
  out.bendFlow = HOT.bendFlow * (1 - smooth(0.6, 0.97, s));
  out.damping = lerp(HOT.damping, COLD.damping, s);
  // Referenzdehnung folgt der aktuellen Dehnung, solange der Käse noch weich ist
  out.baseFollow = 4 * (1 - smooth(0.7, 0.95, s));
  // Aufprallgeschwindigkeit, ab der der Faden bricht
  out.impactBreak = lerpLog(200, COLD.impactBreak, smooth(0.35, 0.9, s));
  out.breakStrain = lerpLog(HOT.breakStrain, COLD.breakStrain, smooth(0.5, 1, s));
  return out;
}

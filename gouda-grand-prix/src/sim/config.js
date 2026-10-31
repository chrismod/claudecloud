// Fahrer, Gegenstände (Käse-Angriffe und Käse-Upgrades), Werkstatt-Upgrades und Schwierigkeitsstufen

// Werte: speed/accel/handling/weight jeweils -2..+2 um den Durchschnitt
export const DRIVERS = [
  { id: 'greta', name: 'Gouda-Greta', cheese: 'Gouda', kart: '#e8582a', accent: '#ffd23f', fur: '#9a8a7d', belly: '#e9ddd0', speed: 0, accel: 0, handling: 1, weight: 0 },
  { id: 'emil', name: 'Emmentaler Emil', cheese: 'Emmentaler', kart: '#f2c230', accent: '#3b6fd8', fur: '#c7a27c', belly: '#f3e4cf', speed: 1, accel: -1, handling: 0, weight: 1 },
  { id: 'rocco', name: 'Roquefort-Rocco', cheese: 'Roquefort', kart: '#2f6fe0', accent: '#e8e8f0', fur: '#5c5f6b', belly: '#c9ccd6', speed: 2, accel: -1, handling: -1, weight: 1 },
  { id: 'brie', name: 'Brie-Brigitte', cheese: 'Brie', kart: '#f0f0ea', accent: '#e05a8a', fur: '#f2efe8', belly: '#ffffff', speed: -1, accel: 2, handling: 1, weight: -2 },
  { id: 'parmi', name: 'Parmi Pecorino', cheese: 'Parmigiano', kart: '#2ea65a', accent: '#f4e3b0', fur: '#7a5a3e', belly: '#d9bf9c', speed: 1, accel: 0, handling: -1, weight: 2 },
  { id: 'feta', name: 'Feta-Fiete', cheese: 'Feta', kart: '#18a7c9', accent: '#ffffff', fur: '#b9b3aa', belly: '#eeeae2', speed: 0, accel: 1, handling: 0, weight: -1 },
  { id: 'cami', name: 'Camembert-Cami', cheese: 'Camembert', kart: '#9a4fd6', accent: '#ffe08a', fur: '#3d3a3a', belly: '#8f8a86', speed: -1, accel: 1, handling: 2, weight: -1 },
  { id: 'hal', name: 'Halloumi-Hal', cheese: 'Halloumi', kart: '#d23a3a', accent: '#202020', fur: '#a0643c', belly: '#e3b48c', speed: 1, accel: 1, handling: -1, weight: 0 },
];

// Gegenstände aus den Käsekisten
export const ITEMS = {
  wheel: { name: 'Emmentaler-Rad', kind: 'attack', icon: 'wheel', desc: 'Rollt geradeaus und prallt von der Bande ab' },
  triple: { name: '3 × Emmentaler', kind: 'attack', icon: 'triple', desc: 'Drei Räder kreisen um dich – einzeln abfeuern' },
  fondue: { name: 'Fondue-Pfütze', kind: 'attack', icon: 'fondue', desc: 'Hinter dir fallen lassen – wer reinfährt, dreht sich' },
  rocket: { name: 'Raclette-Rakete', kind: 'attack', icon: 'rocket', desc: 'Sucht sich den Nächsten vor dir' },
  stink: { name: 'Stinkekäse', kind: 'attack', icon: 'stink', desc: 'Limburger-Wolke: Alle vor dir sehen grün und werden langsamer' },
  turbo: { name: 'Gouda-Turbo', kind: 'upgrade', icon: 'turbo', desc: 'Drei kräftige Schübe' },
  shield: { name: 'Parmesan-Panzer', kind: 'upgrade', icon: 'shield', desc: 'Harte Rinde: hält einen Treffer ab' },
  golden: { name: 'Goldener Gouda', kind: 'upgrade', icon: 'golden', desc: 'Unverwundbar und schnell – rammt alle weg' },
};

// Wahrscheinlichkeiten je Platzierungsbereich (vorne … hinten)
const TABLE = [
  //        wheel triple fondue rocket stink turbo shield golden
  [0.32, 0.04, 0.34, 0.0, 0.0, 0.06, 0.24, 0.0],
  [0.24, 0.12, 0.18, 0.1, 0.02, 0.2, 0.14, 0.0],
  [0.14, 0.14, 0.1, 0.2, 0.08, 0.24, 0.06, 0.04],
  [0.06, 0.12, 0.04, 0.26, 0.14, 0.22, 0.04, 0.12],
];
const ORDER = ['wheel', 'triple', 'fondue', 'rocket', 'stink', 'turbo', 'shield', 'golden'];

export function rollItem(rank, count, rnd) {
  const band = Math.min(3, Math.floor((rank / Math.max(1, count - 1)) * 3.999));
  const row = TABLE[band];
  let r = rnd() * row.reduce((a, b) => a + b, 0);
  for (let i = 0; i < row.length; i++) {
    r -= row[i];
    if (r <= 0) return ORDER[i];
  }
  return 'wheel';
}

// Werkstatt (zwischen den Rennen im Grand Prix): Stufen 0..3, Preis in Käsetalern
export const UPGRADES = [
  { id: 'motor', name: 'Gouda-Motor', desc: 'Höhere Spitze', costs: [40, 70, 110] },
  { id: 'tires', name: 'Raclette-Reifen', desc: 'Mehr Grip, engere Kurven', costs: [30, 60, 90] },
  { id: 'turbo', name: 'Fondue-Einspritzung', desc: 'Drift-Turbo lädt schneller, Schübe länger', costs: [30, 60, 90] },
  { id: 'rind', name: 'Parmesan-Rinde', desc: 'Kürzer ins Schleudern, weniger Käseverlust', costs: [25, 50, 80] },
];

export const DIFFICULTIES = [
  { id: 'mild', name: 'Mild', desc: 'Junger Gouda – gemütlich', aiSpeed: 0.86, aiSkill: 0.55, rubber: 0.1 },
  { id: 'mittel', name: 'Mittelalt', desc: 'Würzig – die Gegner wehren sich', aiSpeed: 0.95, aiSkill: 0.78, rubber: 0.07 },
  { id: 'alt', name: 'Extra-Würzig', desc: 'Alter Gouda – keine Gnade', aiSpeed: 1.02, aiSkill: 1.0, rubber: 0.05 },
];

// Punkte im Grand Prix je Platz, Käsetaler zusätzlich: 2 je eingesammeltem Käsestück
export const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
export const COINS = [60, 50, 42, 35, 30, 26, 22, 20];

export const MAX_CHEESE = 10;

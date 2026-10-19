// Leveldaten. Koordinaten in Welt-Einheiten, sichtbar ist etwa x ∈ [-10, 10], y ∈ [-5.6, 5.6].
// look: Aussehen des Blocks (bread | cheese | board)

const ground = (x0, x1, top, look = 'bread', depth = 6) => ({
  type: 'box',
  x: (x0 + x1) / 2,
  y: top - depth / 2,
  w: x1 - x0,
  h: depth,
  look,
});

const ledge = (x0, x1, top, h = 0.9, look = 'bread') => ({
  type: 'box',
  x: (x0 + x1) / 2,
  y: top - h / 2,
  w: x1 - x0,
  h,
  look,
});

export const LEVELS = [
  {
    id: 'primo-filo',
    name: 'Il primo filo',
    hint: 'Zieh einen Käsefaden von Spieß zu Spieß. Lass ihn kurz fest werden – dann: Olive los!',
    olive: { x: -8, y: 0.32, vx: 3.5 },
    glass: { x: 7.4, y: -0.9 },
    statics: [ground(-10.5, -2.6, 0), ground(2.6, 6, 0), ground(6, 10.5, -3.4, 'board', 3)],
    anchors: [
      { x: -2.48, y: -0.06 },
      { x: 2.48, y: -0.06 },
    ],
    cheese: 8,
    par: 6,
  },
  {
    id: 'la-rete',
    name: 'La rete',
    hint: 'Frischer Käse fängt weich auf – kalter zerbricht beim Aufprall. Zieh den Faden kurz vor dem Start.',
    olive: { x: -8.4, y: 3.32, vx: 3 },
    glass: { x: 7.0, y: -2.9, depth: 1.0, stem: 0.9 },
    statics: [
      ledge(-10.5, -5.2, 3, 1.1),
      ground(1.85, 5.6, -2.0),
      ground(5.6, 10.5, -4.85, 'board', 2),
      ground(8.15, 10.5, -0.4, 'cheese', 4.5),
    ],
    anchors: [
      { x: -5.3, y: -0.6 },
      { x: 1.75, y: -2.06 },
      { x: -1.5, y: 1.6 },
    ],
    cheese: 9,
    par: 7.8,
  },
  {
    id: 'due-ponti',
    name: 'Due ponti',
    hint: 'Die Brücke braucht festen Käse, das Netz weichen. Die Reihenfolge entscheidet.',
    olive: { x: -8.6, y: 1.32, vx: 3.4 },
    glass: { x: 7.1, y: -2.6, depth: 1.0, stem: 0.9 },
    statics: [
      ground(-10.5, -5.2, 1),
      ground(-1.6, 1.4, 1, 'cheese'),
      ground(5.5, 10.5, -4.55, 'board', 2),
      ground(8.25, 10.5, -1.2, 'bread', 3.4),
    ],
    anchors: [
      { x: -5.08, y: 0.94 },
      { x: -1.72, y: 0.94 },
      { x: 2.3, y: -1.3 },
      { x: 5.95, y: -2.25 },
    ],
    cheese: 10.5,
    par: 8.6,
  },
  {
    id: 'altalena',
    name: "L'altalena",
    hint: 'Häng die Olive an einen Faden, lass sie schwingen und schneide im richtigen Moment (wischen).',
    olive: { x: -7.6, y: 2.82, vx: 3.2 },
    glass: { x: 0, y: -0.9, depth: 1.0, stem: 0.9 },
    statics: [ledge(-10.5, -6.6, 2.5, 1.0), ground(-1.3, 1.3, -2.85, 'cheese', 4)],
    anchors: [{ x: -3.6, y: 4.6 }],
    cheese: 6,
    par: 4.5,
  },
];

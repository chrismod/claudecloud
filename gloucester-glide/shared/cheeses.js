// Käsesorten – jede fährt sich anders.
export const CHEESES = {
  gloucester: {
    id: 'gloucester',
    name: 'Double Gloucester',
    blurb: 'Der Klassiker vom Cooper’s Hill. Ausgewogen.',
    radius: 0.5,
    halfWidth: 0.17,
    density: 600,
    friction: 1.0,
    restitution: 0.22,
    steer: 1.0, // Lenkfreude
    stability: 1.0, // richtet sich auf
    drag: 1.0, // Luftwiderstand
    rind: '#c8641e',
    paste: '#f0a64a',
  },
  camembert: {
    id: 'camembert',
    name: 'Camembert',
    blurb: 'Leicht und wendig – aber springt bei jedem Buckel.',
    radius: 0.42,
    halfWidth: 0.12,
    density: 450,
    friction: 1.1,
    restitution: 0.38,
    steer: 1.4,
    stability: 0.8,
    drag: 1.25,
    rind: '#f2eee4',
    paste: '#f6e7b8',
  },
  parmigiano: {
    id: 'parmigiano',
    name: 'Parmigiano',
    blurb: 'Ein Panzer. Schwer zu lenken, kaum zu stoppen.',
    radius: 0.62,
    halfWidth: 0.24,
    density: 800,
    friction: 0.9,
    restitution: 0.12,
    steer: 0.7,
    stability: 1.5,
    drag: 0.8,
    rind: '#d9a64e',
    paste: '#f3d27a',
  },
};

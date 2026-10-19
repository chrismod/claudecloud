// Referenzlösungen (müssen gewinnen), alternative Lösungswege (müssen ebenfalls gewinnen)
// und typische Fehlversuche (dürfen nicht gewinnen) je Level. Schrittformat siehe tests/harness.js.

export const olivePast = (x) => (w) => w.olive.x > x;
const rolling = (w) => w.olive.state === 'rolling';

export const SOLUTIONS = {
  'primo-filo': {
    solve: [['draw', 0, 1], ['wait', 3], ['go']],
    fail: [[['go']], [['draw', 0, 1], ['go']]],
  },
  'la-rete': {
    solve: [['draw', 0, 1], ['go']],
    fail: [[['go']], [['draw', 0, 1], ['wait', 9], ['go']]],
  },
  'due-ponti': {
    solve: [['draw', 0, 1], ['wait', 3], ['draw', 2, 3], ['go']],
    fail: [[['draw', 0, 1], ['draw', 2, 3], ['wait', 9], ['go']]],
  },
  'il-cancello': {
    solve: [['go'], ['draw', 1, 2], ['wait', 3], ['cut', 'olive']],
    // ohne „Olive los!“: der Schnitt allein gibt die Olive frei
    also: [[['draw', 1, 2], ['wait', 3], ['cut', 'olive']]],
    fail: [[['go'], ['cut', 'olive']], [['go'], ['draw', 1, 2], ['cut', 'olive']]],
  },
  altalena: {
    solve: [['draw', 0, 'olive'], ['wait', 4], ['go'], ['wait', 1.9], ['cut', 'olive']],
    fail: [
      [['draw', 0, 'olive'], ['go'], ['wait', 1.9], ['cut', 'olive']],
      [['draw', 0, 'olive'], ['wait', 4], ['go'], ['wait', 0.6], ['cut', 'olive']],
    ],
  },
  'momento-giusto': {
    solve: [['wait', 5], ['draw', 0, 1]],
    fail: [[['draw', 0, 1]]],
  },
  caduta: {
    solve: [['go'], ['draw', 1, 2], ['wait', 3], ['cut', 'olive']],
    also: [[['draw', 1, 2], ['wait', 3], ['cut', 'olive']]],
    fail: [[['go'], ['cut', 'olive']], [['draw', 1, 2], ['wait', 9], ['go'], ['cut', 'olive']]],
  },
  'la-discesa': {
    solve: [['draw', 0, 1], ['draw', 2, 3], ['go']],
    fail: [[['draw', 0, 1], ['wait', 3], ['go']], [['draw', 2, 3], ['wait', 9], ['draw', 0, 1], ['wait', 3], ['go']]],
  },
  'doppio-taglio': {
    solve: [['go'], ['cut', -3.2, 3.0, -2.4, 3.8], ['wait', 1.4], ['cut', 'olive']],
    also: [[['cut', -3.2, 3.0, -2.4, 3.8], ['wait', 1.4], ['cut', 'olive']]],
    fail: [[['go'], ['cut', -3.2, 3.0, -2.4, 3.8], ['wait', 0.4], ['cut', 'olive']]],
  },
  zigzag: {
    solve: [['draw', 0, 1], ['draw', 2, 3], ['wait', 2], ['go']],
    fail: [[['draw', 0, 1], ['go']]],
  },
  rifare: {
    solve: [['draw', 0, 1], ['wait', 3], ['cut', -4.4, -1.2, -3.8, -2.4], ['draw', 2, 3], ['go']],
    fail: [[['draw', 0, 1], ['wait', 3], ['go']]],
  },
  volo: {
    solve: [['draw', 0, 'olive'], ['wait', 4], ['go'], ['wait', 2.6], ['cut', 'olive']],
    fail: [
      [['draw', 0, 'olive'], ['go'], ['wait', 2.6], ['cut', 'olive']],
      [['draw', 0, 'olive'], ['wait', 4], ['go'], ['wait', 1.2], ['cut', 'olive']],
    ],
  },
  fretta: {
    solve: [['draw', 0, 1], ['draw', 2, 3]],
    fail: [[['wait', 3.2], ['draw', 0, 1], ['draw', 2, 3]]],
  },
  'ponte-lungo': {
    solve: [['draw', 0, 1], ['draw', 1, 2], ['wait', 3], ['go']],
    fail: [[['go']]],
  },
  acchiappa: {
    solve: [['go'], ['until', olivePast(-2.2), 10], ['draw', 0, 'olive'], ['wait', 1.2], ['cut', 'olive']],
    fail: [[['go']]],
  },
  'prima-il-ponte': {
    solve: [['draw', 2, 3], ['wait', 3], ['draw', 0, 1], ['go']],
    fail: [[['draw', 0, 1], ['draw', 2, 3], ['wait', 9], ['go']]],
  },
  'tic-tac': {
    solve: [['draw', 0, 'olive'], ['until', rolling, 8], ['wait', 1.6], ['cut', 'olive']],
    fail: [[['wait', 7]], [['draw', 0, 'olive'], ['until', rolling, 8], ['wait', 0.6], ['cut', 'olive']]],
  },
  'sotto-sopra': {
    solve: [['go'], ['draw', 1, 2], ['wait', 3], ['cut', 'olive']],
    fail: [[['go'], ['draw', 1, 2], ['cut', 'olive']]],
  },
  labirinto: {
    solve: [['go'], ['draw', 1, 2], ['wait', 3], ['draw', 3, 4], ['cut', 'olive']],
    fail: [[['go'], ['draw', 3, 4], ['cut', 'olive']]],
  },
  'gran-finale': {
    solve: [['draw', 3, 4], ['draw', 1, 2], ['wait', 2], ['go'], ['cut', 'olive']],
    also: [[['draw', 3, 4], ['draw', 1, 2], ['wait', 2], ['cut', 'olive']]],
    fail: [[['draw', 1, 2], ['go'], ['cut', 'olive']], [['draw', 3, 4], ['draw', 1, 2], ['wait', 9], ['go'], ['cut', 'olive']]],
  },
};

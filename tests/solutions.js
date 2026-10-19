// Referenzlösungen (müssen gewinnen) und typische Fehlversuche (müssen scheitern) je Level.
// Schrittformat siehe tests/harness.js.

const olivePast = (x) => (w) => w.olive.x > x;
const oliveBefore = (x) => (w) => w.olive.x < x;

export const SOLUTIONS = {
  'primo-filo': {
    solve: [['draw', 0, 1], ['wait', 3], ['go']],
    fail: [[['go']]],
  },
  'doppio-filo': {
    solve: [['draw', 0, 1], ['draw', 2, 3], ['wait', 3], ['go']],
    fail: [[['draw', 0, 1], ['wait', 3], ['go']]],
  },
  'la-discesa': {
    solve: [['draw', 0, 1], ['wait', 3], ['go']],
    fail: [[['go']]],
  },
  taglia: {
    solve: [['go'], ['wait', 0.8], ['cut', 'olive']],
    fail: [[['go'], ['wait', 8]]],
  },
  'la-rete': {
    solve: [['draw', 0, 1], ['go']],
    fail: [[['draw', 0, 1], ['wait', 9], ['go']]],
  },
  'il-cancello': {
    solve: [['go'], ['draw', 1, 2], ['wait', 2.5], ['cut', 'olive']],
    fail: [[['go'], ['wait', 1], ['cut', 'olive']]],
  },
  'due-ponti': {
    solve: [['draw', 0, 1], ['wait', 3], ['draw', 2, 3], ['go']],
    fail: [[['draw', 0, 1], ['draw', 2, 3], ['wait', 9], ['go']]],
  },
  altalena: {
    solve: [['draw', 0, 'olive'], ['wait', 2.5], ['go'], ['wait', 1.7], ['cut', 'olive']],
    fail: [[['draw', 0, 'olive'], ['wait', 2.5], ['go'], ['wait', 0.3], ['cut', 'olive']]],
  },
  'momento-giusto': {
    solve: [['wait', 5], ['draw', 0, 1]],
    fail: [[['draw', 0, 1]]],
  },
  zigzag: {
    solve: [['draw', 0, 1], ['draw', 2, 3], ['go']],
    fail: [[['draw', 0, 1], ['draw', 2, 3], ['wait', 9], ['go']]],
  },
  rifare: {
    solve: [['draw', 0, 1], ['wait', 3], ['cut', -4.4, -1.2, -3.8, -2.4], ['draw', 2, 3], ['go']],
    fail: [[['draw', 0, 1], ['wait', 3], ['go']]],
  },
  caduta: {
    solve: [['go'], ['draw', 1, 2], ['wait', 0.5], ['cut', 'olive']],
    fail: [[['draw', 1, 2], ['wait', 9], ['go'], ['wait', 0.5], ['cut', 'olive']]],
  },
  'ponte-lungo': {
    solve: [['draw', 0, 1], ['draw', 1, 2], ['wait', 3], ['go']],
    fail: [[['go']]],
  },
  volo: {
    solve: [['draw', 0, 'olive'], ['wait', 2.5], ['go'], ['wait', 2.2], ['cut', 'olive']],
    fail: [[['draw', 0, 'olive'], ['wait', 2.5], ['go'], ['wait', 1.0], ['cut', 'olive']]],
  },
  fretta: {
    solve: [['draw', 0, 1], ['draw', 2, 3]],
    fail: [[['wait', 2.6], ['draw', 0, 1], ['draw', 2, 3]]],
  },
  acchiappa: {
    solve: [['go'], ['until', olivePast(-2.2), 10], ['draw', 0, 'olive'], ['wait', 1.2], ['cut', 'olive']],
    fail: [[['go']]],
  },
  'prima-il-ponte': {
    solve: [['draw', 2, 3], ['wait', 3], ['draw', 0, 1], ['go']],
    fail: [[['draw', 0, 1], ['draw', 2, 3], ['wait', 9], ['go']]],
  },
  'doppio-taglio': {
    solve: [['go'], ['cut', -3.2, 3.0, -2.4, 3.8], ['wait', 1.4], ['cut', 'olive']],
    fail: [[['go'], ['cut', -3.2, 3.0, -2.4, 3.8], ['wait', 0.4], ['cut', 'olive']]],
  },
  'tic-tac': {
    solve: [['draw', 0, 'olive'], ['until', (w) => w.olive.state === 'rolling', 5], ['wait', 1.6], ['cut', 'olive']],
    fail: [[['wait', 5]]],
  },
  'sotto-sopra': {
    solve: [['go'], ['draw', 1, 2], ['cut', 'olive']],
    fail: [[['draw', 1, 2], ['wait', 9], ['go'], ['cut', 'olive']]],
  },
  labirinto: {
    solve: [['go'], ['draw', 1, 2], ['wait', 3], ['draw', 3, 4], ['cut', 'olive']],
    fail: [[['go'], ['draw', 1, 2], ['draw', 3, 4], ['wait', 9], ['cut', 'olive']]],
  },
  'gran-finale': {
    solve: [['draw', 0, 1], ['wait', 3], ['go'], ['until', olivePast(-2.0), 10], ['draw', 2, 'olive'], ['wait', 2.1], ['cut', 'olive']],
    fail: [[['go']], [['draw', 0, 1], ['wait', 3], ['go'], ['until', olivePast(-2.0), 10], ['draw', 2, 'olive'], ['wait', 1.0], ['cut', 'olive']]],
  },
};

export { olivePast, oliveBefore };

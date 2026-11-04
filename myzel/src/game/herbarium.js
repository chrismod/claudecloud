// Herbarium: alle Arten und Wesen der Welt. Entdeckt wird, was man aus der Nähe gesehen hat.

export const ENTRIES = [
  // Pflanzen und Pilze (Schlüssel = Vegetationsart)
  { id: 'grass', group: 'Pflanzen', name: 'Silbergras', text: 'Wächst als Erstes, wo Myzel den Boden lockert. Im Herbst goldbraun, im Winter flach unter dem Schnee.' },
  { id: 'fern', group: 'Pflanzen', name: 'Wedelfarn', text: 'Liebt feuchten Grund am Wasser und den Schatten der Pilzwälder.' },
  { id: 'flower', group: 'Pflanzen', name: 'Sternblume', text: 'Blüht nur dort, wo das Leben schon tief verwurzelt ist. Im Frühling überall, im Winter nirgends.' },
  { id: 'reed', group: 'Pflanzen', name: 'Rohrkolben', text: 'Säumt die Ufer. Seine Wurzeln halten den Schlamm, wenn der Regen kommt.' },
  { id: 'bush', group: 'Pflanzen', name: 'Glutbeere', text: 'Ein Strauch mit roten Beeren, die nachts leise glimmen.' },
  { id: 'oakCrown', group: 'Pflanzen', name: 'Eiche', text: 'Ihr totes Gerippe steht seit Jahrhunderten. Belebt den Boden, und sie treibt wieder aus – im Herbst in Rot und Gold.' },
  { id: 'birchCrown', group: 'Pflanzen', name: 'Birke', text: 'Weiß wie Knochen, leicht wie Atem. Wächst gern an Seeufern.' },
  { id: 'firCrown', group: 'Pflanzen', name: 'Tanne', text: 'Herrin der Höhen. Behält ihr Kleid auch im tiefsten Winter.' },
  { id: 'mushRed', group: 'Pilze', name: 'Fliegenpilz', text: 'Rot mit weißen Warzen, ein Ring am Stiel, eine Knolle im Boden. Gedeiht besonders im Herbst.' },
  { id: 'mushBrown', group: 'Pilze', name: 'Steinpilz', text: 'Dicker Stiel, brauner Hut, gelbe Poren. Ein Zeichen für gesunden Waldboden.' },
  { id: 'parasol', group: 'Pilze', name: 'Riesenschirmling', text: 'Ein geschuppter Schirm auf hohem Stiel. Wächst, wo das Leben schon lange wohnt.' },
  { id: 'mushGlow', group: 'Pilze', name: 'Leuchthäubchen', text: 'Kleine Glocken, die nachts im Takt des Myzels leuchten. Überdauern sogar den Winter.' },
  { id: 'puff', group: 'Pilze', name: 'Bovist', text: 'Platzt bei Berührung und verstreut eine Wolke aus Sporen – Nahrung für die Geister.' },
  { id: 'gmCap', group: 'Pilze', name: 'Riesenpilz', text: 'Nur in den alten Pilzwäldern. Unter seinem Hut glühen die Lamellen wie Laternen.' },
  // Tiere
  { id: 'deer', group: 'Tiere', name: 'Lichthirsch', text: 'Kehrt in gesunde Wälder zurück. Nachts leuchten Geisterflecken auf seinem Rücken.' },
  { id: 'rabbit', group: 'Tiere', name: 'Feldhase', text: 'Scheu und schnell. Wo Hasen spielen, ist der Boden fruchtbar.' },
  { id: 'bird', group: 'Tiere', name: 'Vogelschwarm', text: 'Kreist über belebtem Land. Im Winter ziehen die Schwärme fort.' },
  // Wesen
  { id: 'mother', group: 'Wesen', name: 'Mutterbaum', text: 'Uralte Riesen, die das Myzelnetz zusammenhalten. Erwacht schützen sie ihren Hain vor der Fäulnis.' },
  { id: 'log', group: 'Wesen', name: 'Totholz', text: 'Gefallene Stämme voller Baumpilze. Zersetzt, werden sie zu Sporen und neuem Boden.' },
  { id: 'wisp', group: 'Wesen', name: 'Verirrtes Licht', text: 'Kleine Seelen des Waldes, die den Weg verloren haben. Sie folgen dem, der sie heimbringt.' },
  { id: 'nest', group: 'Wesen', name: 'Moderherz', text: 'Ein pulsierendes Nest der Fäulnis. Nachts schlägt es schneller.' },
  { id: 'moderling', group: 'Wesen', name: 'Moderling', text: 'Kriecht nachts aus den Moderherzen und frisst das Myzel. Fürchtet das Licht des Sporenpulses.' },
  { id: 'star', group: 'Wesen', name: 'Sternspore', text: 'Fällt vom Himmel und verglüht, wenn niemand sie fängt. Schenkt dem Fänger eine Kraft.' },
];
export const ENTRY = Object.fromEntries(ENTRIES.map((e) => [e.id, e]));

export function createHerbarium(found, onFind) {
  const set = new Set(found || []);
  return {
    has: (id) => set.has(id),
    list: () => [...set],
    get count() {
      return set.size;
    },
    total: ENTRIES.length,
    find(id) {
      if (!ENTRY[id] || set.has(id)) return false;
      set.add(id);
      onFind?.(ENTRY[id]);
      return true;
    },
  };
}

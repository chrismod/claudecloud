# Myzel

*Ein endloser Wald für zwei.*

Zwei Waldgeister gleiten durch eine unendliche, erschöpfte Welt: graue Erde, kahle Baumgerippe, trübe Tümpel.
Wo sie entlangziehen, spinnen sie Myzel – feine, leuchtende Pilzfäden im Boden. Das Myzel wächst in
fruchtbarer Erde von selbst weiter, und das Leben folgt ihm: erst Gras, dann Farne, Blumen und Pilze, zuletzt
Sträucher und Bäume. Nichts davon verschwindet wieder. Die Welt merkt sich jede Spur, auch nach dem Neuladen.

- **Hyphe** (Spieler 1) – bernsteinfarbener Pilzgeist mit getupftem Hut
- **Keim** (Spieler 2) – jadegrüner Samengeist mit zwei Keimblättern

Zwischen den beiden spannt sich ein leuchtender Faden. Webt ihr *beide* gleichzeitig, spinnt auch der Faden
Myzel – zu zweit zieht ihr breite Bahnen durch das tote Land. Wo eure Spuren sich mischen, mischen sich auch
eure Farben im Netz.

## Starten

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # Welt, Speicher und Zell-Simulation (headless, ~3 s)
npm run build   # statische Seite in dist/
```

Läuft in jedem aktuellen Browser mit WebGL 2. Gamepads werden nach dem ersten Tastendruck erkannt
(Browser-Vorgabe). Eine bestimmte Welt: `?seed=12345`.

## Steuerung

| | Gamepad | Tastatur Hyphe | Tastatur Keim |
| --- | --- | --- | --- |
| Gleiten | Linker Stick | W A S D | Pfeiltasten |
| Weben (halten) | RT | Shift links | Shift rechts |
| Sporenpuls | Ⓐ | Leertaste | Enter |
| Totholz zersetzen (halten) | Ⓧ | E | Ü / # |
| Schneller gleiten | LT / Ⓑ | Q | . |
| Rufen (zeigt den Weg) | Ⓨ | R | , |
| Kamera drehen | Rechter Stick | Y / C | Num 7 / 9 |
| Pause | Start | Esc | Backspace |

Beitreten im Titelbild mit Ⓐ (bzw. Leertaste / Enter), noch einmal Ⓐ oder Start zum Losgehen. Wer später
dazukommt, drückt einfach Ⓐ – der zweite Geist erscheint neben dem ersten.

## Spielidee

**Sporen** sind eure Kraft. Weben und der Sporenpuls kosten Sporen; das feine Myzel, das ihr im Vorbeigleiten
hinterlasst, ist gratis. Zurück bekommt ihr sie vom Wald selbst – ein Kreislauf:

- auf lebendigem Boden regenerieren sie langsam,
- **Boviste** platzen beim Durchfliegen und verstreuen Sporen (und säen dabei neues Myzel); sie wachsen nach,
- **Totholz** liegt im erschöpften Land. Haltet Ⓧ, um es zu zersetzen: viele Sporen, und an seiner Stelle
  entsteht ein Pilzring.

**Mutterbäume** schlafen überall in der Welt, etwa alle 200 m einer. Belebt den Boden rings um einen
schlafenden Baum (60 %), dann haltet gemeinsam Ⓐ, um ihn zu wecken. Er treibt eine gewaltige Krone aus,
eine Welle aus Leben rollt über das Land, und ihr erhaltet eine **Gabe**: weiterer Faden, breitere Spuren,
mehr Sporen, üppigere Pfade, schnelleres Gleiten, schnellere Regeneration. Erwachte Mutterbäume senden
regelmäßig Lichtimpulse durch das ganze verbundene Myzelnetz. Ⓨ zeigt die Richtung zum nächsten
schlafenden Baum.

Ein Tag dauert 12 Minuten. Nachts leuchten Myzeladern, Leuchtpilze, Riesenpilze und Glühwürmchen.

## Technik

Alles ist prozedural – keine Texturen, keine Modelle, keine Sounddateien. three.js, sonst nichts.

- **Welt** (`src/world/field.js`) – Höhe, Fruchtbarkeit, Biome (Laubwald, Nadelhöhen, Ufer, Pilzwälder mit
  Riesenpilzen) und Mutterbaum-Standorte als reine Funktionen eines Seeds. Endlos in alle Richtungen.
- **Zell-Simulation** (`src/world/sim.js`) – ein toroidales 256 × 256-Fenster (1 Zelle = 1 m²) um die Spieler.
  Jede Zelle hat Leben, Myzel und Farbton. Myzel wächst über eine Allee-Schwelle (zu wenig stirbt nicht, wächst
  aber auch nicht) und breitet sich nur in fruchtbaren Boden aus; Leben folgt dem Myzel. Darüber liegt ein
  *erregbares Medium*: Lichtwellen laufen mit ~15 m/s durch zusammenhängendes Myzel und nirgends sonst hin.
- **Speicher** (`src/world/store.js`) – veränderte Chunks (32 × 32 m) delta- und lauflängenkodiert im
  localStorage, dazu Metadaten (erwachte Bäume, zersetztes Totholz, Tageszeit, Positionen). Ein unberührter
  Chunk kostet keinen Speicher.
- **Vitalitätstextur** – die Simulation schreibt jedes Bild eine RGBA-Textur. Terrain, Wasser, Partikel und
  jede einzelne Pflanze lesen sie im Shader: Pflanzen haben eine Schwelle und wachsen (mit Überschwingen),
  sobald das Leben an ihrem Standort sie überschreitet. Die tote Welt ist vollständig „angelegt“ und erwacht
  nur. ~19 Pflanzenarten, alle instanziert, rund 40 000 Instanzen.
- **Darstellung** – Terrain in zwei Detailstufen bis zum Horizont, Boden-Shader mit Voronoi-Myzeladern,
  Tag-Nacht-Himmel mit Sternen und Wolken, Umgebungslicht aus dem Himmel (PMREM), Schatten,
  Bloom, Farbgebung, Vignette, Filmkorn, dynamische Auflösung.
- **Klang** (`src/audio.js`) – WebAudio: Wind über totem Land, ein Klangteppich, dessen Filter sich mit dem
  Leben öffnet, generative Kalimba-Melodie in Pentatonik, Vögel am Tag, Grillen in der Nacht, Chor beim
  Erwachen eines Mutterbaums.

```
src/
  main.js             Spielablauf, Streaming, HUD, Minikarte
  config.js           Konstanten
  noise.js            Simplex-Rauschen, Zufall
  audio.js            prozeduraler Klang
  world/
    field.js          die Welt als Funktion des Seeds
    flora.js          deterministische Bepflanzung je Chunk
    sim.js            Zell-Simulation (Myzel, Leben, Lichtwellen)
    store.js          dauerhafte Speicherung
  render/
    stage.js          Renderer, Nachbearbeitung
    sky.js            Himmel, Licht, Tag/Nacht
    terrain.js        Terrain-Chunks und Boden-Shader
    vegetation.js     instanzierte Pflanzen
    geometries.js     prozedurale Modelle
    motherTrees.js    Mutterbäume
    water.js          Wasser
    wisps.js          die Geister und ihr Faden
    particles.js      Effekte, Pollen, Glühwürmchen
  game/
    input.js          Gamepads und Tastatur
    players.js        Bewegung, Sporen, Gaben
    cameraRig.js      gemeinsame Kamera
tests/                headless Tests der Welt und Simulation
```

Testmodus für automatisierte Screenshots: `?manual&scale=0.5` – dann läuft keine eigene Schleife, und
`window.__myzel.step(n)` rechnet n Bilder.

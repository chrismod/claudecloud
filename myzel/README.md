# Myzel

*Ein endloser Wald für zwei.*

Zwei Waldgeister gleiten durch eine unendliche, erschöpfte Welt: graue Erde, kahle Baumgerippe, trübe Tümpel.
Wo sie entlangziehen, spinnen sie Myzel – feine, leuchtende Pilzfäden im Boden. Das Myzel wächst in
fruchtbarer Erde von selbst weiter, und das Leben folgt ihm: erst Gras, dann Farne, Blumen und Pilze, zuletzt
Sträucher und Bäume. Die Welt merkt sich jede Spur, auch nach dem Neuladen – und nur eines kann sie wieder
zerstören: die **Fäulnis**, die nachts aus den Moderherzen quillt.

- **Hyphe** (Spieler 1) – bernsteinfarbener Pilzgeist mit getupftem Hut
- **Keim** (Spieler 2) – jadegrüner Samengeist mit zwei Keimblättern

Zwischen den beiden spannt sich ein leuchtender Faden. Webt ihr *beide* gleichzeitig, spinnt auch der Faden
Myzel – zu zweit zieht ihr breite Bahnen durch das tote Land. Wo eure Spuren sich mischen, mischen sich auch
eure Farben im Netz.

## Starten

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # Welt, Speicher, Simulation, Fäulnis, Fortschritt, Begegnungen, Klima, Hüter (headless)
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
| Totholz zersetzen / Moderherz läutern (halten) | Ⓧ | E | Ü / # |
| Schneller gleiten | LT / Ⓑ | Q | . |
| Rufen (zeigt den Weg) | Ⓨ antippen | R antippen | , antippen |
| Hüterpilz pflanzen | Ⓨ halten | R halten | , halten |
| Bauart wechseln | R3 | F | Ö / Num 5 |
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

## Die Fäulnis und die Nacht

Überall im Land schlagen **Moderherzen** – pulsierende, schwarz-violette Nester mit Ranken. Von ihnen breitet
sich Fäulnis aus: schwarzer Schleim mit giftig glimmenden Adern, in dem Pflanzen welken und Myzel stirbt.
Tagsüber bleibt sie nah an ihrem Herz (~20 m) und zieht sich zurück; **nachts** schlagen die Herzen schneller,
die Fäulnis greift bis ~50 m weit und frisst, was ihr gesponnen habt. Seen halten sie auf.

- Ein Tag dauert 5 Minuten, die Nacht knapp 3. Die Anzeige unten zählt bis zur Nacht bzw. zum Morgen herunter.
  Ein Waldhorn kündigt die Dämmerung an, am Morgen seht ihr, wie viel Wald ihr gehalten oder verloren habt.
- In der Fäulnis zehrt sie an euren Sporen. **Weben** und der **Sporenpuls** brennen sie aus.
- Ein **Moderherz läutern**: daneben Ⓧ halten. Das kostet laufend Sporen – zu zweit geht es doppelt so schnell.
  Danach weicht die Fäulnis, und ein Pilzhain wächst.
- Ein **erwachter Mutterbaum** schützt seinen Hain (~46 m) für immer vor Fäulnis.
- Frisst die Fäulnis gerade euer Myzel, zeigt ein violetter Pfeil, wo.

## Was es sonst noch zu tun gibt

- **Verirrte Lichter** – kleine Lichtgeister irren durchs tote Land (Markierung am Bildschirmrand). Manche
  sind in Fäulnis gefangen: erst die Fäulnis ringsum läutern. Fliegt hin, dann folgt euch das Licht als
  Lichterkette (bis zu 4 pro Geist). Bringt es zu einem erwachten Mutterbaum – der Weg ist markiert. In der
  Fäulnis verblasst es, und ist sein Licht aufgezehrt, entgleitet es euch und bleibt dort zurück.
- **Moderlinge** – nachts kriechen sie aus den Moderherzen (mit jeder überstandenen Nacht mehr), fressen
  euer Myzel, säen Fäulnis und beißen euch Sporen ab. Der Sporenpuls tötet sie, Weben verbrennt sie
  langsam, und der gespannte Faden zwischen zwei webenden Geistern schneidet sie schnell. Bei Tag graben sie
  sich ein.
- **Sternsporen** – etwa alle ein bis zwei Minuten stürzt ein Stern vom Himmel (Lichtsäule, Countdown).
  Erreicht ihn rechtzeitig, dann schenkt er beiden eine Kraft: *Sternenweber* (Weben kostet nichts),
  *Lichtsturm* (doppelt weiter Puls), *Windgeist* (viel schneller) oder *Großes Erblühen*.
- Dazu passende Aufträge: „Bringt ein verirrtes Licht heim“, „Bis zum Morgen: vertreibt 4 Moderlinge“,
  „Fangt eine Sternspore“.

## Jahreszeiten und Wetter

Alle drei Spieltage wechselt die Jahreszeit (weich überblendet), und das Wetter wechselt alle ein bis
zweieinhalb Minuten – je nach Jahreszeit mit anderen Wahrscheinlichkeiten.

| | Wirkung | Aussehen |
| --- | --- | --- |
| Frühling | Wachstum ×1,35 | frisches Grün, blühende Bäume, mehr Blumen, Blütenblätter in der Luft |
| Sommer | – | volles Laub, Gewitter häufiger |
| Herbst | mehr Pilze, Fäulnis gieriger | rot-goldene Kronen, Laubteppich, fallende Blätter |
| Winter | Wachstum ×0,45, Fäulnis langsamer, Seen frieren zu – **die Fäulnis kann übers Eis** | kahle Laubbäume, Schneedecke, Eis, weniger Tiere |
| Regen | Wachstum ×1,8, wäscht Fäulnis zurück | Regenschnüre, nasser Boden, Pfützen, Ringe auf dem Wasser, danach ein Regenbogen |
| Nebel | Moderlinge kommen auch bei Tag | dichter Dunst |
| Gewitter | Fäulnis ×1,6, mehr Moderlinge | Blitze mit Donner (verzögert nach Entfernung), Sturmböen |
| Schnee | Wachstum ruht | Flocken, die Schneedecke wächst und taut im Frühling |

## Hüterpilze und Sporenkerne

**Sporenkerne** (◆) gibt es für Moderlinge (manchmal), Totholz, heimgebrachte Lichter, Sternsporen,
erfüllte Aufträge, Rangaufstiege, geläuterte Moderherzen, erwachte Mutterbäume und jeden Morgen. Damit
pflanzt ihr Hüterpilze (Ⓨ halten, Bauart mit R3 wechseln):

- **Sporenturm** (3 ◆) – pulst alle 5 Sekunden: spinnt Myzel, läutert Fäulnis, trifft Moderlinge im Umkreis von 11 m.
- **Leuchtschirm** (2 ◆) – hält die Fäulnis 18 m fern, wie ein kleiner Mutterbaum.
- **Quellpilz** (2 ◆) – füllt eure Sporen in 12 m Umkreis auf und lässt den Boden erblühen.

Moderlinge greifen Hüterpilze gezielt an. Webt daneben, um sie zu reparieren – sonst gehen sie verloren.

## Herbarium

23 Arten und Wesen: Pflanzen, Pilze, Tiere und die Wesen des Waldes. Was ihr aus der Nähe seht, wird
entdeckt (mit kleinem Text und Erfahrung). Das Herbarium steht im Pause-Menü.

## Fortschritt

- **Erfahrung** für alles, was ihr bewirkt: Boden beleben, Fäulnis läutern, Boviste, Totholz, Tiere,
  Moderherzen, Mutterbäume, jede überstandene Nacht.
- **Waldränge** (Keimling, Sprössling, Moosgänger, Hainhüter, Waldweber, Myzelweise, Hüter der Tiefe, Ältester …)
  mit dauerhaften Vorteilen: mehr Sporen, weiterer Puls, weniger Sporenverlust in der Fäulnis, längerer Fluss,
  schnellere Regeneration.
- **Fluss**: Wer zügig in frisches Land webt, kommt in den Fluss – bis ×5 Erfahrung.
- **Ruf des Waldes**: immer drei Aufträge (z. B. „Lasst 5 Boviste platzen“, „Webt gemeinsam 160 m² mit dem
  Faden“, „Läutert ein Moderherz“). Einer davon läuft gegen die Uhr: „Vor Einbruch der Nacht: belebt …“
  bzw. nachts „Bis zum Morgen: läutert …“. Erfüllte Aufträge bringen Erfahrung und füllen eure Sporen auf.
- **Tiere** kehren in gesunden Wald zurück: Hirsche (nachts mit leuchtenden Geisterflecken), Hasen und
  Vogelschwärme. Sie fliehen vor der Fäulnis.

Nachts leuchten Myzeladern, Leuchtpilze, Riesenpilze, Glühwürmchen – und die Fäulnis.

## Technik

Alles ist prozedural – keine Texturen, keine Modelle, keine Sounddateien. three.js, sonst nichts.

- **Welt** (`src/world/field.js`) – Höhe, Fruchtbarkeit, Biome (Laubwald, Nadelhöhen, Ufer, Pilzwälder mit
  Riesenpilzen), Mutterbaum- und Moderherz-Standorte als reine Funktionen eines Seeds. Endlos in alle Richtungen.
- **Zell-Simulation** (`src/world/sim.js`) – ein toroidales 256 × 256-Fenster (1 Zelle = 1 m²) um die Spieler.
  Jede Zelle hat Leben, Myzel, Farbton und Fäulnis. Myzel wächst über eine Allee-Schwelle (zu wenig stirbt nicht,
  wächst aber auch nicht) und breitet sich nur in fruchtbaren Boden aus; Leben folgt dem Myzel. Darüber liegt ein
  *erregbares Medium*: Lichtwellen laufen mit ~15 m/s durch zusammenhängendes Myzel und nirgends sonst hin.
  Fäulnis wird von den Moderherzen gespeist und verliert pro Meter an Kraft (nachts weniger), frisst Myzel und
  Leben, wird von kräftigem Myzel gebremst und von Wasser fast gestoppt; erwachte Mutterbäume löschen sie.
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
- **Klang** (`src/audio.js`) – alles live mit WebAudio erzeugt:
  - *3D-Klang*: Herzschläge der Moderherzen, Rufe der Lichter, Moderlinge, Sterne, Vögel kommen aus ihrer
    Richtung (HRTF), der Hörer folgt der Kamera.
  - *Adaptive Musik*: taktgenauer Scheduler mit Schichten, die nach Spielzustand ein- und ausblenden –
    Klangteppich, gezupfte Motive (Karplus-Strong-Saiten), Bass, FM-Glocken, Trommeln bei Gefahr,
    dunkles Cello nachts. Tag in D-Dur-Pentatonik, Nacht in d-Moll. Große Momente ducken die Musik
    (Erwachen mit Chor, Läutern, Waldhorn, Rang-Fanfare).
  - *Ambience*: Wind mit Böen, Laubrascheln, Amsel, Meise, Kuckuck, Specht; nachts Waldkauz, Grillen,
    Frösche am Wasser; Plätschern, Brodeln in der Fäulnis, Fluggeräusch, funkelnde Körner beim Weben.
  - Mischpult mit Hall (erzeugte Impulsantwort), Ping-Pong-Echo, Kompressor und Limiter.

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
    nests.js          Moderherzen
    fauna.js          Hirsche, Hasen, Vogelschwärme
    creatures.js      Darstellung der Lichter, Moderlinge, Sternsporen
    weather.js        Regen, Schnee, Laub, Blüten, Blitze
    guardians.js      Modelle der Hüterpilze
    water.js          Wasser
    wisps.js          die Geister und ihr Faden
    particles.js      Effekte, Pollen, Glühwürmchen
  game/
    input.js          Gamepads und Tastatur
    players.js        Bewegung, Sporen, Gaben
    progress.js       Erfahrung, Ränge, Fluss, Aufträge
    encounters.js     verirrte Lichter, Moderlinge, Sternsporen (Logik)
    climate.js        Jahreszeiten und Wetter
    guardians.js      Hüterpilze (Logik)
    herbarium.js      Arten und Texte
    cameraRig.js      gemeinsame Kamera
tests/                headless Tests der Welt und Simulation
```

Testmodus für automatisierte Screenshots: `?manual&scale=0.5` – dann läuft keine eigene Schleife, und
`window.__myzel.step(n)` rechnet n Bilder.

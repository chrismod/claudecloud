# Gouda Grand Prix

Kart-Rennen mit Käse: acht Mäuse in Käse-Karts, Käse-Angriffe, Käse-Upgrades und Splitscreen für zwei
Spieler mit Gamepads. Gebaut mit three.js, ohne externe Grafik- oder Ton-Dateien: Strecken, Texturen,
Modelle, Musik und Effekte entstehen prozedural im Browser.

## Starten

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Simulation headless: Strecken, komplette KI-Rennen, Gegenstände, Runden (~4 s)
npm run build    # → dist/ (statisch, läuft auf jedem Webserver, auch im Unterordner)
```

Hilfsskripte: `node scripts/track-report.mjs` (Streckenformen prüfen), `node scripts/sim-report.mjs [mild|mittel|alt]`
(Rennen nur mit KI fahren und auswerten).

## Spielmodi

- **Grand Prix:** drei Rennen hintereinander auf allen Strecken. Punkte je Platz (15, 12, 10, 8, …) und
  **Käsetaler** für Platz und eingesammelte Käsestücke. Zwischen den Rennen geht es in die **Käse-Werkstatt**.
  In späteren Rennen startet der Tabellenführer hinten.
- **Einzelrennen:** eine Strecke nach Wahl.
- **1 Spieler** gegen sieben KI-Mäuse oder **2 Spieler** im Splitscreen (oben/unten) gegen sechs.
- **Käse-Schärfe** (Schwierigkeit): Mild, Mittelalt, Extra-Würzig. Die KI driftet, sammelt Kisten, weicht
  Pfützen aus und setzt Gegenstände gezielt ein.

## Käse-Angriffe und Käse-Upgrades

Käsekisten (die leuchtenden ?-Würfel) geben einen Gegenstand. Was du bekommst, hängt von deiner Platzierung ab:
Hinten gibt es die starken Sachen.

| Gegenstand | Art | Wirkung |
| --- | --- | --- |
| Emmentaler-Rad | Angriff | rollt geradeaus und prallt bis zu viermal von der Bande ab (Stick ↓ = nach hinten) |
| 3 × Emmentaler | Angriff | drei Räder kreisen um dich und schützen dich, einzeln abfeuern |
| Fondue-Pfütze | Angriff | hinter dir fallen lassen – wer reinfährt, dreht sich |
| Raclette-Rakete | Angriff | folgt der Strecke zum Nächsten vor dir |
| Stinkekäse | Angriff | Limburger-Wolke: alle vor dir werden langsamer und sehen grün |
| Gouda-Turbo | Upgrade | drei kräftige Schübe |
| Parmesan-Panzer | Upgrade | harte Rinde, hält einen Treffer ab |
| Goldener Gouda | Upgrade | 7 Sekunden unverwundbar und schneller, rammt alle weg |

**Käsestücke** auf der Strecke machen dich schneller (bis zu 10 Stück, je +1,2 % Spitze). Bei Treffern
verlierst du welche.

**Käse-Werkstatt** (Grand Prix): Mit Käsetalern rüstest du dein Kart in drei Stufen auf. Die KI rüstet je nach
Schärfe ebenfalls auf.

| Upgrade | Wirkung |
| --- | --- |
| Gouda-Motor | höhere Spitze |
| Raclette-Reifen | mehr Grip, engere Kurven |
| Fondue-Einspritzung | Drift-Turbo lädt schneller, Schübe dauern länger |
| Parmesan-Rinde | kürzer ins Schleudern, ab Stufe 2 weniger Käseverlust |

## Fahren

- **Drift-Turbo:** Beim Lenken Drift halten → Hüpfer, dann rutschen. Die Funken werden blau, orange und lila;
  loslassen gibt einen Schub. Einlenken lädt schneller als Gegenlenken.
- **Raketenstart:** Gas geben, wenn die dritte rote Lampe angeht. Wer schon vor der zweiten Lampe Gas gibt,
  würgt den Motor ab.
- **Boost-Felder** (orange Pfeile) und **Schanzen**. Abseits der Fahrbahn wird es langsam.

## Steuerung

| Aktion | Gamepad | Spieler 1 (Tastatur) | Spieler 2 (Tastatur) |
| --- | --- | --- | --- |
| Gas | `A` / `RT` | `W` | `↑` |
| Bremse / rückwärts | `B` / `LT` | `S` | `↓` |
| Lenken | linker Stick / Steuerkreuz | `A` `D` | `←` `→` |
| Hüpfen & Driften | `RB` / `LB` halten | `Shift` links | `Shift` rechts / `Strg` rechts |
| Gegenstand | `X` (Stick ↓ = nach hinten) | `Leertaste` | `Enter` / `Num 0` |
| Rückspiegel | `Y` | `Q` | `Ende` |
| Pause | `Start` | `Esc` | `Esc` |

Gamepads werden in der Reihenfolge zugeordnet, in der sie sich melden (erste Taste drücken): das erste
gehört Spieler 1, das zweite Spieler 2. Beide Spieler können auch gleichzeitig mit Tastatur fahren.
In den Menüs steuern Steuerkreuz/Stick, `A` und `B` (oder Pfeiltasten/WASD, `Enter`, `Esc`); bei der
Fahrerwahl und in der Werkstatt wählen beide Spieler gleichzeitig. Gamepads mit Vibration rütteln bei
Treffern, Landungen und Mini-Turbos.

## Strecken

| Strecke | Stimmung | Besonderes |
| --- | --- | --- |
| Goudse Polder | Sommernachmittag | Windmühlen, Tulpenfelder, Grachten, Pappelalleen; flach und schnell |
| Emmentaler Alm | klarer Bergtag | Höhenunterschiede, Schanze, Nadelwald, Chalets, Kühe, verschneite Gipfel |
| Fondue-Vulkan | Nacht | Raclette-Lava, glühender Krater mit Rauch und Glut, Fackeln, zwei Schanzen, enge Kehren |

## Technik

- **Simulation** (`src/sim/`) ohne DOM, läuft auch in Node: Arcade-Kartphysik mit 120 Hz (Haftung, Drift,
  Hüpfer, Abheben über Kuppen und Schanzen, Bande, Kart-Kollisionen nach Gewicht), Gegenstände, Gegner-KI
  (Ideallinie, Kurvengeschwindigkeit, Drift, Kisten anfahren, Pfützen ausweichen, Gummiband), Runden und Platzierung.
- **Strecken** (`src/sim/tracks.js`) sind geschlossene Splines mit Höhenprofil, Kurvenüberhöhung, Schanzen,
  Kistenreihen, Käsestücken und Boost-Feldern. `scripts/track-report.mjs` prüft Radien und Abstände.
- **Grafik** (`src/render/`): three.js mit PBR-Materialien (Klarlack auf den Karts), Umgebungslicht aus dem
  prozeduralen Himmel (Wolken, Sterne), Schatten, die texelgenau mit jedem Spieler mitwandern, Nebel,
  instanzierte Vegetation mit Wind, MSAA, Bloom, Farbkorrektur, Vignette, Tempo-Unschärfe beim Turbo,
  chromatische Aberration bei Treffern und grüner Stinkekäse-Filter – im Splitscreen je Bildhälfte.
  Die Auflösung passt sich automatisch an, wenn die Bildrate einbricht.
- **Partikel**: Drift-Funken, Auspuffflammen, Staub, Rauch, Explosionen, Käsekrümel, Reifenspuren.
- **Ton** (`src/audio.js`): Motoren je Spieler, Drift-Quietschen, Effekte und Musik je Strecke – alles WebAudio-Synthese.
- **Anzeige und Menüs** (`src/ui/`): DOM über dem Canvas, komplett mit Gamepad bedienbar. Fahrer-Porträts werden
  beim Start aus den 3D-Modellen gerendert. Hinter Titel und Menüs läuft ein Demo-Rennen mit Kamerafahrten.

```
src/
  main.js            Spielablauf, Ereignisse → Ton/Effekte/Anzeige, Hauptschleife
  input.js           Gamepads und Tastatur für zwei Spieler, Menünavigation, Vibration
  audio.js           prozeduraler Ton und Musik
  sim/               track.js, tracks.js, race.js, config.js
  render/            view.js (Renderer, Splitscreen, Nachbearbeitung, Kamera), world.js, kart.js,
                     items.js, fx.js, textures.js, themes.js, portraits.js
  ui/                hud.js, screens.js, icons.js
tests/sim.test.js    Simulationstests
```

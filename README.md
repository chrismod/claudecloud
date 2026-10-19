# Filatura

*Ein Physik-Puzzle mit Käsefäden – gebaut mit three.js.*

Eine gefüllte Olive will ins Martiniglas. Dein Werkzeug: geschmolzener Mozzarella,
den du zwischen Cocktailspießen zu Fäden ziehst. Frischer Käse ist weich, dehnbar
und fängt Stöße ab – mit der Zeit kühlt er ab, zieht sich straff und wird fest,
aber auch spröde. Das *Wann* ist genauso wichtig wie das *Wo*.

> *Filatura* ist der italienische Fachbegriff für das Ziehen und Strecken des
> Käsebruchs bei Pasta-filata-Käsen wie Mozzarella.

## Starten

```bash
npm install
npm run dev            # Entwicklungsserver auf http://localhost:5173
npm test               # Physik-Tests + Lösbarkeit aller Level (headless, ~10 s)
npm run levels         # Report: Referenzlösung und Fehlversuche je Level
```

## Auf den eigenen Server stellen

```bash
npm run build:single   # → dist-single/filatura.html
```

Eine einzige HTML-Datei (~600 KB, three.js eingebettet), die auf jedem Webserver läuft: hochladen und
aufrufen, fertig. Nur die Schriften kommen von Google Fonts (ohne Internet gibt es Ersatzschriften).

Alternativ `npm run build` → Ordner `dist/` (index.html + assets/) mit relativen Pfaden, funktioniert auch
in einem Unterordner. `npm run build:artifact` erzeugt die Variante für claude.ai-Artifacts.

## Steuerung

| Aktion | Maus / Touch | Tastatur |
| --- | --- | --- |
| Käsefaden ziehen | Von einem Spieß ziehen und auf einem anderen Spieß – oder der Olive – loslassen | |
| Faden schneiden | Über den Faden wischen (irgendwo außerhalb eines Spießes beginnen) | |
| Olive loslassen | Button „Olive los!“ | Leertaste |
| Neustart | ↺ | R |
| Levelauswahl | ☰ | L |
| Hinweis ein/aus | ? | H |
| Ton an/aus | ♪ | M |
| Ziehen abbrechen | | Esc |

## Spielmechanik

Jeder Faden hat eine Temperatur, die über ~9 Sekunden von heiß nach kalt sinkt
(sichtbar an Farbe, Glanz und aufsteigendem Dampf):

| | heiß (frisch gezogen) | kalt (fest) |
| --- | --- | --- |
| Dehnung | weich, federnd | steif |
| Unter Last | fließt plastisch, hängt durch, wird dünner und reißt im Extremfall | behält seine Form |
| Biegung | keine Biegesteifigkeit | starr wie ein Stab |
| Aufprall | fängt weich ab | **bricht spröde** |
| Länge | zieht sich zusammen → wird straff | eingefroren |

Dazu kommen **Rampen**, **vorgespannte Fäden** (eine Olive hängt schon an einem Faden oder wird von
einer Käseleine gehalten – Schnitt!) und **Countdown-Level**, in denen die Olive von selbst losrollt.

22 Level, die nacheinander freigeschaltet werden:

| # | Level | Idee |
| --- | --- | --- |
| 1 | Il primo filo | eine Brücke |
| 2 | Doppio filo | zwei Brücken |
| 3 | La discesa | Rampe, schnelle Olive, Brücke |
| 4 | Taglia! | hängende Olive abschneiden |
| 5 | La rete | Netz: frisch fängt, kalt bricht |
| 6 | Il cancello | Käseleine kappen, wenn die Brücke fest ist |
| 7 | Due ponti | Brücke fest, Netz frisch – Reihenfolge |
| 8 | L'altalena | schaukeln und schneiden |
| 9 | Al momento giusto | Countdown: Netz erst kurz vorher ziehen |
| 10 | Zigzag | zwei Netze hintereinander |
| 11 | Rifare | vorgespanntes Netz wird zu kalt – ersetzen |
| 12 | Caduta libera | Netz unter die hängende Olive, dann schneiden |
| 13 | Il ponte lungo | weite Schlucht mit Zwischenspieß |
| 14 | Il volo | Schwung über den Abgrund |
| 15 | Fretta! | Countdown: Brücken sofort ziehen |
| 16 | Acchiappa! | rollende Olive mit kurzem Faden einfangen |
| 17 | Prima il ponte | Netz vor Brücke auf dem Weg, aber Brücke zuerst ziehen |
| 18 | Doppio taglio | zwei Fäden, zwei Schnitte |
| 19 | Tic tac | Countdown + Schaukel |
| 20 | Sotto e sopra | Leine, tiefer Fall, Netz |
| 21 | Il labirinto | Leine, Brücke, Netz |
| 22 | Gran finale | Brücke, fliegend anhängen, Schaukel, Schnitt |

Sterne (Oliven) gibt es für sparsamen Käseverbrauch.

## Technik

- **Physik** (`src/physics/`) – eigene 2D-Simulation ohne three.js-Abhängigkeit:
  Fäden sind XPBD-Partikelketten (20 Substeps pro Frame) mit Dehnungs- und
  Biege-Constraints. Ein temperaturabhängiges Materialmodell (`material.js`)
  steuert Nachgiebigkeit, plastisches Fließen, Zusammenziehen, Dämpfung und
  Bruchgrenzen. Das Käsevolumen jedes Segments bleibt erhalten, gedehnte Stellen
  werden also sichtbar dünner (Einschnürung). Die Olive ist eine Kugel mit
  Kollision gegen Fäden und Level-Geometrie.
- **Rendering** (`src/render/`) – three.js mit PBR-Materialien, Schatten und
  Glas mit Transmission. Fäden sind dynamische Röhren-Geometrien mit
  Catmull-Rom-Glättung, variablem Radius und Fasertextur. Alle Texturen (Holz,
  Brot, Emmentaler, Olivenhaut) werden prozedural erzeugt, es gibt keine
  externen Assets.
- **Effekte** – Dampf über heißem Käse, Tropfen beim Reißen, Krümel beim
  Brechen, Martini-Spritzer beim Treffer.
- **Sound** (`src/audio.js`) – prozedural per WebAudio.
- **Level** (`src/levels.js`) – datengetrieben. Zu jedem Level gibt es in `tests/solutions.js` eine
  Referenzlösung und typische Fehlversuche; `tests/levels.test.js` prüft headless, dass jede Lösung
  gewinnt und kein Fehlversuch.

```
src/
  main.js            Spielablauf, Eingabe, UI-Steuerung
  levels.js          Leveldaten
  audio.js           prozedurale Sounds
  physics/
    material.js      Temperatur → Materialparameter
    world.js         Simulation: Fäden, Olive, Kollisionen, Bruch, Schneiden
  render/
    stage.js         Renderer, Kamera, Licht, Hintergrund
    levelView.js     Plattformen, Spieße, Glas, Olive
    strandView.js    Käsefaden-Geometrie und -Material
    effects.js       Partikeleffekte
    textures.js      prozedurale Texturen
tests/               Regressionstests, Level-Lösungen und Harness
scripts/             Headless-Werkzeuge fürs Level-Design
```

## Ideen für später

- Weitere Käsesorten als Material: Raclette (sehr flüssig), Halloumi (zäh, quietscht), Fondue-Topf als Käsequelle
- Bewegliche Spieße, Ventilatoren, die Fäden schneller abkühlen, Wärmelampen
- Level-Editor und Teilen von Leveln per URL (das Lösungs-Harness kann neue Level direkt prüfen)
- Ghost-Replays und Highscores

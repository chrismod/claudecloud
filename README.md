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
npm run dev      # Entwicklungsserver auf http://localhost:5173
npm run build    # Produktions-Build nach dist/
npm test         # Physik- und Level-Regressionstests (headless)
npm run levels   # Report: Lösungs- und Fehlversuche je Level
```

## Steuerung

| Aktion | Maus / Touch | Tastatur |
| --- | --- | --- |
| Käsefaden ziehen | Von einem Spieß ziehen und auf einem anderen Spieß – oder der Olive – loslassen | |
| Faden schneiden | Über den Faden wischen (irgendwo außerhalb eines Spießes beginnen) | |
| Olive loslassen | Button „Olive los!“ | Leertaste |
| Neustart | ↺ | R |
| Levelauswahl | ☰ | L |
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

Daraus ergeben sich die Rätsel der vier Level:

1. **Il primo filo** – eine Brücke bauen.
2. **La rete** – ein Netz für eine fallende Olive: kalt zerbricht es, frisch fängt es.
3. **Due ponti** – Brücke *und* Netz: erst die Brücke ziehen und fest werden lassen, das Netz zuletzt.
4. **L'altalena** – die Olive an einen Faden hängen, schaukeln lassen und im richtigen Moment durchschneiden.

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
- **Level** (`src/levels.js`) – datengetrieben. Die Lösbarkeit wird in
  `tests/physics.test.js` headless geprüft.

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
tests/               node:test-Regressionstests
scripts/             Headless-Werkzeuge fürs Level-Design
```

## Ideen für später

- Weitere Käsesorten als Material: Raclette (sehr flüssig), Halloumi (zäh, quietscht), Fondue-Topf als Käsequelle
- Bewegliche Spieße, Ventilatoren, die Fäden schneller abkühlen, Wärmelampen
- Level-Editor und Teilen von Leveln per URL
- Ghost-Replays und Highscores

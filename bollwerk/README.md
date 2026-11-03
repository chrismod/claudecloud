# Bollwerk

*Tower Defense auf schwebenden Inseln – gebaut mit three.js.*

Gegnerwellen strömen aus Portalen einen gewundenen Weg entlang zum leuchtenden Kern. Du baust Türme
auf die Steinplattformen am Wegesrand, rüstest sie auf, wählst Module und setzt Fähigkeiten ein.
Die Spieltiefe orientiert sich an Genre-Größen wie Infinitode 2 (viele Turmarten mit Ausbaupfaden,
Schadensarten und Panzerung, Turmerfahrung, Bosse mit Fähigkeiten, Forschungsbaum, Endlosmodus), die
Optik ist ein kleines 3D-Diorama mit weichem Licht, Schatten und Leuchteffekten statt flacher Neonlinien.

Die Spielsprache ist **Englisch**; **Deutsch** lässt sich in den Einstellungen wählen.

## Starten

```bash
npm install
npm run dev            # Entwicklungsserver auf http://localhost:5173
npm test               # Regeln, Karten, Determinismus und Balance (headless, ~2 s)
npm run balance        # Bot spielt alle Karten und berichtet, wie weit er kommt
npm run build:single   # → dist-single/bollwerk.html (eine Datei, ~720 KB, three.js eingebettet)
npm run build:artifact # → dist-single/bollwerk-artifact.html (Variante für claude.ai-Artifacts)
```

`npm run build` erzeugt alternativ `dist/` mit relativen Pfaden (läuft auch in einem Unterordner).

## Steuerung

| Aktion | Maus / Touch | Tastatur |
| --- | --- | --- |
| Turm bauen | Turm in der Leiste wählen, dann auf eine Plattform klicken | `1`–`0`, `ß`; `Shift` hält die Auswahl |
| Turm verwalten | Turm anklicken | `U` aufrüsten · `T` Zielwahl · `Entf` verkaufen |
| Welle starten / früher rufen | Knopf oben in der Mitte | `Leertaste` |
| Fähigkeiten | Knöpfe unten links | `Q` Orbitalschlag · `W` Kälteeinbruch · `E` Überlast |
| Kamera | Ziehen verschiebt · rechte Maustaste dreht · Rad zoomt · zwei Finger zoomen/drehen | `C` zurücksetzen |
| Tempo / Pause | 1× 2× 3× · ❚❚ | `F` · `P` |
| Abbrechen / Menü | Rechtsklick | `Esc` |

Im Hochformat (Handy) dreht sich die Kamera, sodass die lange Kartenseite senkrecht liegt.

## Spielmechanik

- **Wirtschaft:** Kopfgeld je Gegner, Grundeinkommen je Welle, Bonus fürs frühe Rufen der nächsten Welle.
  Verkaufen bringt 70 % – ein Turm, der noch nicht geschossen hat, wird voll erstattet.
- **Aufrüsten:** Stufe 1–10. Auf **Stufe 5** wählst du eines von zwei **Modulen**, das die Spielweise
  ändert; auf **Stufe 10** kommt die **Meisterfähigkeit** dazu.
- **Erfahrung:** Türme sammeln mit jedem Schadenspunkt Erfahrung, bis zu 10 Ränge (+4 % Schaden, +1,5 % Reichweite je Rang).
- **Zielwahl** je Turm: vorderster, hinterster, stärkster, schwächster oder nächster Gegner.
- **Schadensarten:** kinetisch, explosiv, Feuer, Frost, Energie, Gift. Gegner haben Resistenzen und Schwächen.
- **Panzerung** zieht von jedem direkten Treffer einen festen Betrag ab (mindestens 20 % kommen durch).
  Dauerschaden (Feuer, Gift, Laser, Frost) ignoriert sie, Säure zersetzt sie. Energie wirkt doppelt auf Schilde.
- **Statuseffekte:** Verlangsamung, Einfrieren, Betäubung, Brand, Gift, Sprödigkeit, Markierung. Bosse sind halb so anfällig.
- **Sonderplattformen:** Kraftfeld (+25 % Schaden), Hochplateau (+20 % Reichweite, erhöht), Lehrstätte (doppelte Erfahrung), Goldader (+30 % Kopfgeld).
- **Fähigkeiten** mit Abklingzeit: Orbitalschlag (Flächenschaden an gewählter Stelle), Kälteeinbruch (friert alle ein), Überlast (+75 % Feuerrate).
- **Wellen** werden prozedural und deterministisch erzeugt; Lebenspunkte wachsen erst linear, dann exponentiell.
  Jede 10. Welle ist eine Bosswelle. Nach dem Kartenziel geht es im **Endlosmodus** weiter.

### Bosse

Jede 10. Welle kommt ein Boss, im Wechsel:

| Boss | Fähigkeit |
| --- | --- |
| Koloss | **Stampfer:** holt sichtbar aus (duckt sich, glüht rot) und legt alle Türme im Umkreis von 2 Feldern für 2,2 s lahm |
| Brutmutter | setzt ständig Brut frei und **platzt bei halbem Leben** zu einem Schwarm auf |
| Phantom | **Phasensprung:** springt ein Stück nach vorn und ist dabei 1 s unangreifbar |
| Ägis | riesiger regenerierender Schild, **Schutzaura** gibt allen Gegnern im Umkreis regelmäßig einen Schild |

### Forschung

Jede Partie bringt **Kristalle** – je mehr Wellen überstanden, desto mehr, dazu Boni für schwere Karten und
Siege (der erste Sieg auf einer Karte zählt doppelt). Im Forschungsbaum gibt es vier Zweige mit je sechs
Knoten, die nacheinander freigeschaltet werden:

| Zweig | Knoten |
| --- | --- |
| Wirtschaft | Startmünzen, Einkommen je Welle, Kopfgeld, Verkaufserstattung, Bonus fürs frühe Rufen, Zinsen |
| Arsenal | Schaden je Schadensart (kinetisch, explosiv, Energie, Elemente), Reichweite, Feuerrate |
| Festung | Leben des Kerns, Baukosten, Erfahrung, Aufrüstkosten, Veteranen (Startrang), Kernbarriere |
| Kommando | Abklingzeit, Orbitalschlag, Kälteeinbruch, Überlast, Schaden gegen Bosse, Feldreparatur |

Alles lässt sich jederzeit kostenlos zurückerstatten und neu verteilen.

### Türme

Namen auf Deutsch (englisch in Klammern):

| Turm | Kosten | Art | Besonderheit | Module (Stufe 5) |
| --- | --- | --- | --- | --- |
| Bolzer (Bolter) | 30 | kinetisch | schnell, günstig, Boden + Luft | Zwillingslauf · Wolframkern |
| Mörser (Mortar) | 60 | explosiv | Flächenschaden, nur Boden, Mindestreichweite | Streumunition · Brandsatz |
| Frostkristall (Frost Crystal) | 50 | Frost | Kältepuls verlangsamt alles in Reichweite | Permafrost · Sprödigkeit |
| Funkenturm (Spark Tower) | 70 | Energie | Kettenblitze | Kettenreaktion · Kondensator |
| Falke (Falcon) | 90 | kinetisch | riesige Reichweite, kritische Treffer | Kopfschuss · Durchschlag |
| Säurespeier (Acid Spitter) | 65 | Gift | Gift über Zeit, zersetzt Panzerung | Seuche · Zersetzung |
| Glutwerfer (Scorcher) | 80 | Feuer | Flammenkegel, Brand, nur Boden | Napalm · Feuersturm |
| Resonator (Resonator) | 100 | – | verstärkt Nachbartürme | Fernsicht · Beutezug |
| Schwarm (Swarm) | 110 | explosiv | Lenkraketen, stark gegen Flieger | Raketenhagel · Gefechtskopf |
| Münzpresse (Mint) | 80 | – | prägt Münzen zu jeder Welle | Zinseszins · Kopfgeldbüro |
| Prisma (Prism) | 120 | Energie | Dauerstrahl, wird immer stärker | Fokuslinse · Brechung |

### Gegner

Wanderer, Flitzer (ab Welle 3), Gleiter (fliegt, ab 5), Panzer (gepanzert, ab 7), Spalter (zerfällt in
Splitter, ab 9), Heiler (ab 12), Schildträger (ab 14), Eisbrecher (immun gegen Frost, ab 17) – und die
vier Bosse oben.

Jede Gegnerart bewegt sich anders: Wanderer hüpfen mit Stauchung, Flitzer rennen vornübergebeugt und
wirbeln Staub auf, Panzer und Bosse stampfen schwankend (Bosse lassen den Boden beben), Gleiter schlagen
mit den Flügeln und legen sich in die Kurve, Spalter rotieren, Eisbrecher funkeln. Treffer stauchen den
Körper, eingefrorene Gegner stecken in einem Eisblock, besiegte blähen sich kurz auf und zerplatzen.

### Karten

| # | Karte | Ziel | Idee | Neue Türme |
| --- | --- | --- | --- | --- |
| 1 | Lichtung | 20 | ein gewundener Weg zum Kennenlernen | Bolzer, Mörser, Frostkristall, Funkenturm |
| 2 | Gabelung | 25 | zwei Portale, gemeinsamer Weg zum Kern | Falke, Säurespeier |
| 3 | Spirale | 30 | langer Weg nach innen, Abendstimmung | Glutwerfer, Resonator |
| 4 | Kreuzweg | 30 | der Weg kreuzt sich selbst, zweites Portal | Schwarm, Münzpresse |
| 5 | Dreiklang | 30 | drei Portale, Kern in der Mitte | Prisma |

Karten werden nacheinander freigeschaltet. In den Einstellungen lässt sich alles sofort freischalten.

## Technik

- **Simulation** (`src/game/`) – reines JavaScript ohne three.js: feste Teilschritte, deterministischer
  Zufall (gleiche Saat → gleicher Verlauf). Läuft im Browser und headless in Node.
- **Darstellung** (`src/render/`) – three.js mit PBR-Materialien, Schatten, Bloom und 4×-Kantenglättung im
  HDR-Puffer. Gegner mit Rim-Licht-Shader, Gras und Bäume wiegen sich per Vertex-Shader im Wind,
  Kopfsteinpflaster und Steinplatten als prozedurale Texturen, Umgebungspartikel je Stimmung
  (Pollen, fallende Blätter, Glühwürmchen).
  Plattformen, Deko und alle Gegner sind instanziert (wenige Draw-Calls auch bei hunderten Einheiten),
  Türme werden prozedural aus Grundkörpern gebaut, Effekte laufen über Partikel- und Instanz-Pools.
  Keine externen Assets – auch die Vorschaubilder in Bauleiste und Almanach werden beim Start gerendert.
- **Sprachen** (`src/i18n.js`, `src/lang/en.js`, `src/lang/de.js`) – alle Texte liegen in den Sprachdateien,
  Spieldaten enthalten nur Zahlen und Mechanik.
- **Sound** (`src/audio.js`) – prozedural per WebAudio, gleiche Klänge werden gedrosselt.
- **Balancing** – `src/game/bot.js` spielt wie ein vorsichtiger Mensch (verteilt die Abdeckung, rüstet
  auf, nutzt Fähigkeiten). Die Tests prüfen, dass er jedes Kartenziel erreicht – und dass im Endlosmodus
  irgendwann jede Festung fällt.

```
src/
  main.js              Spielablauf, Eingabe, Verdrahtung, Fortschritt
  i18n.js              Übersetzungen (t(), Zahlenformat)
  lang/                en.js (Standard), de.js
  audio.js             prozedurale Klänge
  game/
    data.js            Türme, Gegner, Fähigkeiten, Feldboni
    maps.js            Karten, Wege (mit gerundeten Ecken)
    waves.js           Wellengenerator und Skalierung
    game.js            Simulation (inkl. Boss-Fähigkeiten)
    research.js        Forschungsbaum, Boni, Kristall-Belohnung
    bot.js             Autopilot für Tests und Balancing
  render/
    stage.js           Renderer, Kamera, Licht, Himmel, Bloom, Stimmungen
    board.js           Insel, Plattformen, Weg, Deko, Portale, Kern
    towers.js          Turmmodelle und -animation
    enemies.js         instanzierte Gegner
    fx.js              Geschosse, Partikel, Strahlen, Explosionen
    overlay.js         Lebensbalken und schwebende Zahlen
    thumbs.js          Vorschaubilder
  ui/
    hud.js             Ressourcen, Wellenkarte, Bauleiste, Inspektor
    screens.js         Kartenwahl, Forschung, Almanach, Endbildschirm
tests/                 Regeln, Karten, Determinismus, Balance
scripts/               Balancing-Bericht, Kartenprüfung, Single-File-Build
```

## Ideen für später

- Minen/Ressourcenfelder und baubare Modifikatoren auf freien Feldern
- Weitere Sprachen (eine neue Datei in `src/lang/` genügt)
- Täglicher Wettbewerb mit fester Saat und Bestenliste (die Simulation ist deterministisch)
- Karteneditor

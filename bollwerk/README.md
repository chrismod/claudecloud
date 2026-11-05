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
npm run tune           # Schwierigkeit aller 30 Level neu abstimmen (~2 min)
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

Angelehnt an Infinitode 2: Ausbau mit Münzen, Erfahrung mit Fähigkeitswahl, ein großer Forschungsbaum mit
Turmketten und endloser Forschung.

- **Wirtschaft:** Kopfgeld je Gegner, Grundeinkommen je Welle, Bonus fürs frühe Rufen der nächsten Welle.
  Verkaufen bringt 70 % – ein Turm, der noch nicht geschossen hat, wird voll erstattet.
- **Ausbau:** Münzen verbessern die Grundwerte. Ohne Forschung endet jeder Turm bei Ausbaustufe 6, die
  Turmforschung hebt die Grenze bis 10. „Max“ (bzw. `Shift+U`) rüstet so weit auf, wie das Geld reicht.
- **Erfahrung und Fähigkeiten:** Türme sammeln mit jedem Schadenspunkt Erfahrung. Auf **Erfahrungsstufe 4
  und 7** wählt man je eine von **drei Fähigkeiten**, auf **Stufe 10** kommt die **Meisterfähigkeit** dazu, auf
  **Stufe 20** wählt man zwischen der **Ultimate** des Turms (per Forschung freigeschaltet) und **+10 % Stärke**.
  Jede Stufe gibt +3 % Schaden und +1 % Reichweite. Ohne Forschung endet die Erfahrung bei Stufe 10, Forschung
  hebt sie auf 20, die endlose Forschung bis 50.
- **Turm-Einstellungen** (je Turm im Inspektor):
  - **Zielwahl:** vorderster, hinterster, stärkster, schwächster, nächster, zufälliger (`T` schaltet durch)
  - **Vorrang:** Bosse, Flieger, Schilde oder Gepanzerte zuerst – danach gilt die Zielwahl
  - **Ziel halten:** am aktuellen Gegner bleiben, bis er fällt oder die Reichweite verlässt
  - **Aktiv:** abgeschaltete Türme feuern nicht (damit andere die Erfahrung bekommen)
  - **Auf alle übertragen:** Einstellungen auf alle Türme des Typs; neue Türme übernehmen die letzten Einstellungen ihres Typs
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

Ein großer Graph mit 136 Knoten, verschieb- und zoombar wie in Infinitode 2:

- **Globale Zweige** (Kristalle), je eine Kette:
  - Wirtschaft: Startmünzen, Einkommen, Kopfgeld, Erstattung, Frühruf-Bonus, Zinsen, Kristall-Ausbeute
  - Arsenal: Schaden je Schadensart, Reichweite, Feuerrate, stärkere Sonderplattformen
  - Festung: Kernleben, Baukosten, Erfahrung, Aufrüstkosten, Veteranen, Kernbarriere
  - Kommando: Abklingzeit, Orbitalschlag (Schaden, Radius), Kälteeinbruch, Überlast, Schaden gegen Bosse, Boss-Kopfgeld, Feldreparatur
- **Eine Kette je Turm** (11 × 9 Knoten): Schaden → Ausbaugrenze → Reichweite und Feuerrate → Spezialwert
  (z. B. Sprünge beim Funkenturm, Verlangsamung beim Frostkristall) → Preis und Training → Erfahrungsgrenze →
  Ultimate (braucht Schaden 10 und volle Erfahrungsgrenze).
- **Endlose Forschung** ohne Obergrenze, bezahlt mit **Sternenstaub**. Den gibt es nur für Wellen über dem
  Kartenziel im Endlosmodus: Schaden, Feuerrate, Reichweite, Startmünzen, Kopfgeld, Kernleben,
  Erfahrungsgrenze aller Türme, Sternenstaub-Ausbeute. Die Kosten steigen je Stufe um 12–16 %.

Kristalle gibt es für jede Partie, auch für Wiederholungen – je mehr Wellen, desto mehr, dazu Boni für schwere
Karten und Siege (der erste Sieg auf einer Karte zählt doppelt). Alles lässt sich jederzeit zurückerstatten.

### Türme

Namen auf Deutsch (englisch in Klammern). Jeder Turm hat dazu eine Meisterfähigkeit (EP 10) und eine Ultimate (EP 20), z. B. Nullpunkt (Frostkristall friert jeden 6. Puls alles ein), Inferno (Glutwerfer in alle Richtungen), Weltuntergang (jede 5. Schwarm-Salve eine Riesenrakete).

| Turm | Kosten | Art | Besonderheit | Fähigkeiten (EP 4/7, zwei von drei) |
| --- | --- | --- | --- | --- |
| Bolzer (Bolter) | 30 | kinetisch | schnell, günstig, Boden + Luft | Zwillingslauf · Wolframkern · Schnellfeuer |
| Mörser (Mortar) | 60 | explosiv | Flächenschaden, nur Boden, Mindestreichweite | Streumunition · Brandsatz · Langes Rohr |
| Frostkristall (Frost Crystal) | 50 | Frost | Kältepuls verlangsamt alles in Reichweite | Permafrost · Sprödigkeit · Tiefe Kälte |
| Funkenturm (Spark Tower) | 70 | Energie | Kettenblitze | Kettenreaktion · Kondensator · Stromstoß |
| Falke (Falcon) | 90 | kinetisch | riesige Reichweite, kritische Treffer | Kopfschuss · Durchschlag · Schnellader |
| Säurespeier (Acid Spitter) | 65 | Gift | Gift über Zeit, zersetzt Panzerung | Seuche · Zersetzung · Ätzwolke |
| Glutwerfer (Scorcher) | 80 | Feuer | Flammenkegel, Brand, nur Boden | Napalm · Feuersturm · Zusatztanks |
| Resonator (Resonator) | 100 | – | verstärkt Nachbartürme | Fernsicht · Beutezug · Übertaktung |
| Schwarm (Swarm) | 110 | explosiv | Lenkraketen, stark gegen Flieger | Raketenhagel · Gefechtskopf · Streusprengköpfe |
| Münzpresse (Mint) | 80 | – | prägt Münzen zu jeder Welle | Zinseszins · Kopfgeldbüro · Goldstandard |
| Prisma (Prism) | 120 | Energie | Dauerstrahl, wird immer stärker | Fokuslinse · Brechung · Schnellladung |

### Gegner

Wanderer, Flitzer (ab Welle 3), Gleiter (fliegt, ab 5), Panzer (gepanzert, ab 7), Spalter (zerfällt in
Splitter, ab 9), Heiler (ab 12), Schildträger (ab 14), Eisbrecher (immun gegen Frost, ab 17) – und die
vier Bosse oben.

Jede Gegnerart bewegt sich anders: Wanderer hüpfen mit Stauchung, Flitzer rennen vornübergebeugt und
wirbeln Staub auf, Panzer und Bosse stampfen schwankend (Bosse lassen den Boden beben), Gleiter schlagen
mit den Flügeln und legen sich in die Kurve, Spalter rotieren, Eisbrecher funkeln. Treffer stauchen den
Körper, eingefrorene Gegner stecken in einem Eisblock, besiegte blähen sich kurz auf und zerplatzen.

### Level

30 Level in 6 Kapiteln, jedes mit eigener Landschaft. Level werden nacheinander freigeschaltet; in den
Einstellungen lässt sich alles sofort freischalten. Neue Türme kommen in den ersten acht Leveln dazu.
Ab Kapitel 2 tauchen Gegnerarten von Kapitel zu Kapitel früher auf, die Bosse starten je Kapitel mit
einem anderen.

| Kapitel | Landschaft | Level |
| --- | --- | --- |
| 1 · Grüntal | Wiese, Pollen | Lichtung · Bachlauf · Gabelung · Hügelkamm · Kreuzweg |
| 2 · Bernsteinwald | Herbstwald, fallende Blätter | Laubpfad · Zwei Bäche · Spirale · Wurzelwerk · Dreiklang |
| 3 · Dünenmeer | Wüste mit Kakteen, Sandwehen | Oase (Luftangriff) · Karawane (Ansturm) · Sandsturm · Fata Morgana · Sphinx (Boss alle 5 Wellen) |
| 4 · Frostgipfel | Schnee, verschneite Tannen, Schneefall | Gletscher · Lawine (schwer gepanzert) · Eisgrat · Frostbiss (nur 10 Leben) · Nordlicht |
| 5 · Glutöde | Asche, Lavapfützen, Glutfunken | Aschefeld · Magmastrom (Spalterschwarm) · Caldera · Obsidian (Schildwall) · Feuerprobe |
| 6 · Sternenfall | Nacht mit Sternenhimmel, Leuchtkristalle | Sternenpfad · Mondsichel · Nebel · Himmelsleiter (Luftangriff) · Bollwerk (4 Portale, Boss alle 5 Wellen) |

Die ersten fünf Karten sind von Hand gezeichnet. Für die übrigen werden nur die Wege als Wegpunkte
angegeben, Plattformen und Sonderfelder entstehen reproduzierbar daraus (`generateGrid` in
`src/game/maps.js`). Die Schwierigkeit jeder Karte stimmt `npm run tune` ab: Der Bot spielt mit der
Forschung, die man bis zu diesem Level ungefähr verdient hätte, und soll das Kartenziel im ersten
Kapitel um 60 %, im zweiten um 45 % und danach um 30 % übertreffen. Das Ergebnis steht in
`src/game/tuning.js`.

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
    maps.js            30 Level in 6 Kapiteln, Wege (mit gerundeten Ecken), Plattform-Generator
    tuning.js          Schwierigkeitsfaktor je Level (von scripts/tune.mjs erzeugt)
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
- Karteneditor (Karten brauchen nur Größe und Wegpunkte)

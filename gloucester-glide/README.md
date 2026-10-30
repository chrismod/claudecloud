# Gloucester Glide

Käserennen den Hang hinunter – frei nach dem Cheese Rolling am Cooper's Hill in Gloucestershire.
Du lenkst einen rollenden Käselaib durch eine steile, buckelige Mulde voller Felsen und
Strohballen, vorbei an jubelnden Zuschauern, ins Ziel. Gebaut mit three.js und der Physik-Engine Rapier.

- **Vier Käsesorten** mit eigenem Fahrverhalten: Double Gloucester (ausgewogen), Emmentaler (runder Riese,
  schnell, aber zerbrechlich), Camembert (wendig, springt gern, steckt viel weg), Parmigiano (schwer, schnell
  und hart, lenkt sich träge).
- **Laib-Integrität:** Harte Stöße beschädigen den Käse. Seitliche Treffer an Felsen und Ballen und Landungen
  auf der flachen Seite kosten am meisten, saubere Landungen auf der Kante wenig. Dellen und abgeplatzte Rinde
  sieht man am Laib, beim Emmentaler kommen die Löcher zum Vorschein. Ein angeschlagener Laib eiert, bei 0 %
  zerbricht er und das Rennen ist vorbei. Die Integrität im Ziel steht in der Bestenliste.
- **Strecken:** Cooper's Hill, Brockworth Bowl, jeden Tag ein neues **Tagesrennen** (für alle gleich) und
  die Expedition **Mount Everest**.
- **Mount Everest (3,5 km, gut drei Minuten):** Start am Gipfel auf 8.849 m in Schnee und Eis. Eisflächen sind
  rutschig (kaum Lenkung), Tiefschnee bremst. Im Khumbu-Eisbruch warten Eistürme und drei Gletscherspalten:
  mit Tempo an der Kante abspringen oder langsam über die schmale Leiter. Wer reinfällt, muss zurück zum
  letzten Kontrollpunkt. Dann vorbei am Basislager (5.364 m) mit Zeltstadt und Gebetsfahnen, über die Moräne
  und die Almen mit Yaks hinunter ins grüne Tal bis zum Ziel in Namche Bazar (3.440 m). Die Anzeige zeigt
  Abschnitt, Höhe über dem Meer und den Untergrund.
- **Zu zweit im Splitscreen:** Bildschirm links/rechts geteilt, jeder mit eigener Kamera und Anzeige. An jedem
  Kontrollpunkt sieht man den Abstand zum anderen. Die Käse fahren durcheinander durch. So bleibt jeder Lauf
  einzeln vom Server prüfbar, und beide Zeiten kommen in die Bestenliste.
- **Ghosts:** Fahr gegen den Rekordlauf, deine eigene Bestzeit oder einen beliebigen Lauf aus der Bestenliste.
  An jedem Kontrollpunkt siehst du deinen Abstand.
- **Geprüfte Bestenliste:** Der Browser schickt nur die Eingaben (Lenkung und Sprünge je Tick). Der Server
  fährt den Lauf in derselben Physik nach und rechnet die Zeit selbst aus. Eine behauptete Zeit zählt nicht.

## Starten

```bash
npm install
npm run dev     # Server (Port 8787) + Vite (http://localhost:5173) zusammen
npm test        # Simulation, Reproduzierbarkeit, Server-Prüfung (~5 s)
```

Ohne Server läuft das Spiel auch (`npm run dev:client`), dann aber nur mit lokalen Bestzeiten.

## Auf den eigenen Server

**Mit Docker** (empfohlen):

```bash
docker compose up -d --build     # → http://<server>:8787
```

Die Datenbank liegt im Volume `glide-data` (`/data/glide.db`). Vor den Container gehört ein Reverse-Proxy
mit HTTPS (Caddy, nginx, Traefik …). Der Server wertet `X-Forwarded-For` aus, damit die Drosselung je
Spieler greift.

**Ohne Docker** (Node 22.13 oder neuer):

```bash
npm ci
npm run build    # → dist/ (inkl. vorkomprimierter .br/.gz-Dateien)
npm start        # liefert Spiel und API auf Port 8787 aus
```

Umgebungsvariablen: `PORT` (8787), `HOST` (0.0.0.0), `DB_FILE` (`data/glide.db`), `LOG_LEVEL` (info).

## Steuerung

| Aktion | Tastatur | Gamepad | Touch |
| --- | --- | --- | --- |
| Lenken | `A` `D` / `←` `→` | linker Stick, Steuerkreuz | ‹ › |
| Springen / umgekippten Laib aufstellen | `Leertaste` / `W` | A | ⤒ |
| Zum letzten Kontrollpunkt | `R` | B / Y | ↺ |
| Neustart | `⌫` | | |
| Pause | `Esc` | Start | |

Zu zweit (Splitscreen):

| Aktion | Spieler 1 | Spieler 2 |
| --- | --- | --- |
| Lenken | `A` `D` | `←` `→` |
| Springen / Aufstellen | `W` (oder `Leertaste`) | `↑` |
| Zum letzten Kontrollpunkt | `S` | `↓` |
| Gamepad | erstes Gamepad | zweites Gamepad |

Ist nur ein Gamepad angeschlossen, fährt Spieler 2 damit und Spieler 1 mit WASD. Splitscreen gibt es mit
Tastatur oder Gamepads, nicht per Touch.

## Aufbau

```
shared/   Läuft im Browser und auf dem Server
  track.js    Streckengenerator (Gefällsprofil + Seed → Höhenfeld, Felsen, Ballen, Kontrollpunkte)
  sim.js      Rennphysik mit Rapier: fester Takt 60 Hz, Lenkung, Aufrichten, Sprung, Ziel
  inputs.js   Eingaben je Tick ↔ kompakte Base64-Lauflängen; Ghost-Frames
  cheeses.js  Käsesorten
  bot.js      einfacher Fahrer (Tests, Menü-Hintergrund)
server/   Fastify + SQLite (node:sqlite); Läufe werden in Worker-Threads nachgefahren
client/   three.js-Darstellung, Eingabe, Ton (Web Audio, alles prozedural), Menüs
  render/everest.js   Everest-Welt in 100-m-Abschnitten: grob für die ganze Strecke, Details nur nahe
                      den Spielern (werden dahinter wieder abgebaut)
  render/mountains.js Himalaya-Gipfel ringsum
tests/    node --test
```

### Warum die Server-Prüfung funktioniert

Das Spiel nutzt den deterministischen Build von Rapier (`@dimforge/rapier3d-deterministic-compat`), der
auf allen Plattformen bitgenau gleich rechnet. Der Code drumherum (Strecke und Steuerung) verwendet nur
`+ − × ÷` und `Math.sqrt`. Diese Operationen liefern in jeder JavaScript-Engine
bitgenau dasselbe Ergebnis, `Math.sin`, `Math.exp` usw. dagegen nicht unbedingt. Deshalb kommt der Server
mit denselben Eingaben auf dieselbe Zeit wie der Browser. Wer an `shared/` arbeitet, muss diese Regel
einhalten. Die Tests prüfen, dass Läufe beim Nachfahren identisch bleiben.

Weicht die vom Browser gemeldete Zeit doch einmal ab, gilt die Zeit des Servers. Die Abweichung landet
im Log (`desync`).

## Nächste Schritte

- Online-Rennen gegeneinander: Die Simulation ist schon tick-basiert und eingabegetrieben, also bereit
  für Lockstep oder einen autoritativen Server.
- Splitscreen mit Zusammenstößen zwischen den Käsen (dann bräuchte die Prüfung beide Eingaben)
- Mehr Strecken und Wetter (nasser Hang = weniger Grip)
- Grafikqualität im Menü einstellbar machen (derzeit automatisch: auf Handys weniger Gras und Bäume)

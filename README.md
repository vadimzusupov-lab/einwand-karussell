# Einwand-Karussell

Trainingsspiel für Setter und Closer von Franklin & Partners. Hebel ziehen, die Walzen zeigen Gesprächsphase, Einwand und einen Verstärker, und der Mitarbeiter antwortet spontan laut. Installierbare PWA, läuft offline, ohne Build-Schritt und ohne externe Abhängigkeiten.

## Dateien

```
index.html             Seitengerüst (Start, Automat, Einstellungen, Ergebnis-Karte)
styles.css             Design; ALLE Farben stehen oben als CSS-Variablen
app.js                 Spiel-Logik (Walzen, Hebel, Timer, Statistik)
data.js                Inhalte: Phasen, Einwände, Verstärker (setzt window.PHASEN usw.)
manifest.webmanifest   PWA-Manifest
service-worker.js      Offline-Cache (Cache-Version hier erhöhen!)
icons/                 App-Icons (192, 512, maskable, apple-touch-icon, icon.svg)
assets/logo.svg        Logo-Platzhalter (oben links im Header)
fonts/                 Hier kommen eigene woff2-Schriften hinein (optional)
```

Alle Pfade sind relativ, die App läuft deshalb unter `https://<user>.github.io/<repo>/`.

## Lokal testen

Service Worker brauchen `http://localhost` oder HTTPS, ein Doppelklick auf `index.html` genügt dafür nicht (die App startet dann trotzdem, nur ohne Offline-Funktion).

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000/` öffnen. Alternativ `npx serve`, falls Node installiert ist.

## Deployment auf GitHub Pages

1. Neues GitHub-Repo anlegen (privat oder öffentlich). Hinweis: GitHub Pages bei privaten Repos hängt vom GitHub-Plan ab.
2. Alle Dateien committen und auf `main` pushen.
3. Im Repo: **Settings, Pages, Source: „Deploy from a branch“**, Branch `main`, Ordner `/ (root)`, speichern.
4. Nach ca. ein bis zwei Minuten die URL `https://<user>.github.io/<repo>/` aufrufen und auf den Handys installieren:
   - **iOS (Safari):** Teilen, „Zum Home-Bildschirm“.
   - **Android (Chrome):** Menü, „App installieren“.
5. **Updates:** Nach jeder Änderung die Cache-Version in `service-worker.js` erhöhen (siehe unten), sonst sehen Nutzer evtl. alte Stände.

> **Hinweis zur Vertraulichkeit:** Die Inhalte in `data.js` sind nicht geheim. Ist das Repo öffentlich, kann jeder die Einwände und Tipps einsehen.

## Cache-Version erhöhen (bei jeder Änderung)

In `service-worker.js` ganz oben:

```js
const CACHE_VERSION = 'v1';   // -> 'v2', 'v3', ...
```

Neue Dateien (z. B. Schriften) zusätzlich in die Liste `PRECACHE` eintragen. Nach dem Deployment lädt die App beim nächsten Online-Start die neue Version im Hintergrund und zeigt oben „Neue Version bereit. Neu laden“. Die aktuelle Version steht unten in den Einstellungen („App-Version“).

## Farben, Logo und Schrift ändern (Corporate Design)

Die Farben sind aktuell **neutrale Platzhalter**. Alles steht am Anfang von `styles.css` im Block „CORPORATE DESIGN“:

```css
--color-primary:   #1F3A5F;  /* Automaten-Rahmen, Hauptbuttons */
--color-secondary: #2F6EA5;  /* Chips, Fortschritt, Fokus */
--color-accent:    #F2A541;  /* Hebel und „Drehen“-Button */
--color-bg-light:  #F4F6F9;  /* Hintergrund hell */
--color-bg-dark:   #0E1620;  /* Hintergrund dunkel (Dark Mode) */
--color-text:      #1A2330;
--color-success / --color-warning / --color-error   /* Schwierigkeits-Ampel */
--radius: 16px;
```

Zusätzlich anpassen, damit alles zusammenpasst:

- `index.html`: `<meta name="theme-color">` (Primärfarbe)
- `manifest.webmanifest`: `theme_color` (Primärfarbe) und `background_color` (Hintergrund hell)
- Icons: `icons/icon.svg` ist die Vorlage, die PNGs müssen bei einem Design-Wechsel neu erzeugt werden.
- Achte auf Kontraste (WCAG AA): `--color-on-primary` und `--color-on-accent` legen die Textfarbe auf Primär- bzw. Akzentfarbe fest.

**Logo:** Datei `assets/logo.svg` ersetzen (oder in `index.html` den Pfad bei `.brand-logo` ändern). Höhe im Header ist 32 px.

**Schrift:** woff2-Dateien in `fonts/` legen, den auskommentierten `@font-face`-Block am Ende von `styles.css` aktivieren, `--font-body` anpassen und die Dateien in `PRECACHE` (service-worker.js) eintragen, damit die Schrift offline funktioniert. Ohne Eintrag wird `system-ui` verwendet.

## Einwände ergänzen

In `data.js` im Array `EINWAENDE` einen Eintrag hinzufügen:

```js
{ id: 'kosten-06',                     // eindeutig, nie wiederverwenden
  phase: 'kosten',                     // id aus PHASEN
  rolle: ['setter', 'closer'],         // wer bekommt den Einwand?
  schwierigkeit: 'mittel',             // 'leicht' | 'mittel' | 'schwer'
  text: 'Das rechnet sich für uns nicht.',        // O-Ton des Interessenten
  dahinter: 'Was steckt wirklich dahinter? (Tipp)',
  validiert: false },
```

**Schwierigkeit:** `leicht` = Missverständnis oder Vorwand. `mittel` = teils berechtigt, braucht eine ehrliche Antwort. `schwer` = echter Ausschlussgrund; hier wird sauber qualifiziert statt überredet (die App zeigt dann „Ziel: sauber qualifizieren, nicht überreden“).

**Verstärker** stehen in `VERSTAERKER`. `passtZuPhasen: []` heißt „passt überall“, sonst eine Liste von Phasen-IDs. Neue Phasen kommen in `PHASEN`.

Keine konkreten Fördersätze, Beträge oder Garantien in Texte schreiben.

## Keine Musterantworten, Feld „validiert“

Die App enthält bewusst **keine Musterantworten**. Die richtigen Antworten werden im Team persönlich besprochen. Die Ergebniskarte zeigt nur Einwand, Verstärker, Schwierigkeit, Timer, den Tipp „Was steckt dahinter?“ und die Selbstbewertung.

- Ist bei einem Einwand `validiert: false`, steht unter dem Verstärker der kleine Hinweis **„Entwurf, noch nicht abgestimmt“**. Er bezieht sich auf den Tipp (`dahinter`). Setze `validiert: true`, sobald ihr den Tipp im Team abgestimmt habt, dann verschwindet der Hinweis.

## Bedienung im Überblick

- **Hebel** rechts: antippen oder nach unten ziehen. Der Button **Drehen** macht dasselbe (auch für Tastatur und Screenreader).
- **Ergebnis-Karte:** Einwand, Verstärker, Schwierigkeit, Timer, Tipp, Selbstbewertung. Mit „Zurück“ schließt die Karte, über „Letzte Karte öffnen“ kommt sie wieder.
- **Team-Modus** (Einstellungen): Namen kommagetrennt eintragen. Nach jedem Dreh kommt reihum jemand dran, niemand doppelt, bis alle dran waren. Optional mit Peer-Feedback-Leiste (nur Anzeige, wird nicht gespeichert).
- **Übungsmodus:** In den Einstellungen unter Statistik „Nur diese üben“. Dann kommen nur Einwände dran, die mit „Muss ich üben“ bewertet wurden (Rolle und Schwierigkeit werden dabei ignoriert).
- **Weniger Bewegung:** Bei aktivierter Systemeinstellung „Bewegung reduzieren“ rollen die Walzen nicht, sondern blenden nur über. Konfetti entfällt.

## Datenschutz

Keine Tracking- oder Analytics-Skripte, keine externen Requests, keine Schriften von Google. Einstellungen, Namen und Statistik liegen nur im `localStorage` des jeweiligen Geräts. Funktioniert `localStorage` nicht (z. B. privates Fenster), läuft die App trotzdem, merkt sich aber nichts.

## Technische Hinweise

- Kein Build, kein Framework: reines HTML, CSS und Vanilla-JS. `data.js` ist ein normales Skript (kein `fetch`, kein ES-Modul).
- Animationen nutzen nur `transform` und `opacity`.
- Speicher-Schlüssel: `ek.v1.settings`, `ek.v1.ratings`, `ek.v1.stats`.

# PACE

PACE ist eine installierbare PWA, die gute Tage wahrscheinlicher machen soll, ohne selbst zu einer neuen Pflicht oder einem Test der Lebensführung zu werden.

Die vier Blickrichtungen sind:

- **P – Proficiency:** Kompetenz erleben
- **A – Advancement:** echten Fortschritt ermöglichen und erkennen
- **C – Capacity:** Reserve schützen
- **E – Echo:** Resonanzchancen und Offenheit dafür schaffen

## Designprinzip

PACE bewertet keinen Tag mit Punkten, Streaks oder „3 von 4 geschafft“.

Die zentrale Frage für Features ist:

> Erhöht das die Wahrscheinlichkeit eines guten Tages – oder erhöht es vor allem den Druck, einen guten Tag produzieren zu müssen?

## Modularer Aufbau

PACE bleibt eine Zero-Build-PWA aus nativen ES-Modulen. Die Grenzen sind bewusst klein gehalten:

- `js/core/storage.js` – lokale IndexedDB-Speicherung, Migration alter Browserdaten, IDs, Datumshelfer
- `js/core/ui.js` – kleine gemeinsame UI-Helfer
- `js/core/google.js` – OAuth, serialisierte API-Queue, Batch-Zugriffe und 429-Retry
- `js/core/sync.js` – zentrale Synchronisationsqueue und Status (`lokal`, `wartet`, `syncing`, `synced`)
- `js/core/collections.js` – gemeinsame, explizite Merge-Regeln für geräteübergreifende Collections
- `js/features/*.js` – Feature-Orchestrierung und DOM/UI
- `js/features/*-data.js` – Sheet-Schemata und Zeile↔Objekt-Adapter größerer Features
- `js/features/*-domain.js` – reine, browserunabhängige Fachlogik, die direkt getestet werden kann

Größere Features wie Fortschritt, Tracking, Resonanzbibliothek und Haltepunkte sind damit nicht mehr gleichzeitig UI, Datenadapter und Fachlogik in einer Datei. Kleine Features wie Atemkreis oder Navigation bleiben bewusst einzelne Module.

Neue Funktionen sollen möglichst als eigenes Feature-Modul ergänzt werden. Fachlogik soll nach Möglichkeit in dependency-freie `*-domain.js`-Module, Sheet-Mapping in `*-data.js`, statt die UI-Datei weiter aufzublähen.

### Architektur-Checks

Das Repository enthält einen dependency-freien Quality-Check:

`npm run check`

Er prüft unter anderem:

- doppelte DOM-IDs und fehlende feste DOM-Referenzen
- nicht auflösbare oder zyklische ES-Module
- direkten `localStorage`-Zugriff außerhalb von `core/storage.js`
- Reinheit der `*-domain.js`-Module
- vollständige Offline-Cache-Liste des Service Workers
- Unit-Tests für Merge-Regeln und zentrale Domänenlogik

Die GitHub-Action `quality` führt zusätzlich einen Syntaxcheck aller JS/MJS-Dateien aus.

## Fortschritt: flexibles Netz statt Pflicht-Hierarchie

Als Denkmodell kann Fortschritt so aussehen:

`Zielbereich → Ziel → Meilenstein → Aufgabe → klare Anweisung`

Keine Ebene ist verpflichtend. Ein Fortschritt kann auch zuerst passieren und später eingeordnet werden.

Ziele, Meilensteine, Aufgaben und Ereignisse dürfen mehreren Zielbereichen gleichzeitig zugeordnet sein. Die App behandelt die Lebenslandkarte deshalb als Netz und nicht als strengen Baum.

## Zugehörige Companion-App

Im selben Repository ist eine separate Node-App zur Übernahme von Fitbit-/Google-Health-Rohdaten vorgesehen. Das Konzept und die Schlafberechnungsregeln stehen in [FITBIT_BRIDGE.md](FITBIT_BRIDGE.md).

## Datenschutz-Architektur

Das öffentliche GitHub-Repository enthält **nur App-Logik, UI, generische Erklärungstexte und PWA-Dateien**.

Persönliche Inhalte gehören ausschließlich in das private Google Sheet und in den lokalen IndexedDB-Speicher des Browsers. Insbesondere gehören persönliche Zielbereiche, Beispiele und Resonanzgeschichten **nicht** ins Repository.

### Private Sheet-Tabs

PACE verwendet aktuell:

- `Vorschlaege` – P/A/C/E-Ideen
- `Feststecken` – persönliche Schleifenunterbrechungen
- `Tage` – Tagesauswahl und Abendrückblick
- `Zielbereiche` – persönliche Verfassung / langfristige Zielbereiche
- `Fortschritt` – Ziele, Meilensteine, Aufgaben und Anweisungen
- `FortschrittEreignisse` – bottom-up archivierter echter Fortschritt
- `Beispiele` – private Beispiele für P/A/C/E
- `Resonanzchancen` – Situationen, die Resonanz wahrscheinlicher machen können
- `Geparkt` – offene Schleifen mit nächstem Schritt / Wiederaufnahme
- `Behalten` – kurze Savour-Marker
- `ErfassungKonfig` – private Konfiguration der flexiblen Erfassungsfelder und Gruppen
- `Haltepunkte` – private Aussagen, Geschichten/Bilder/Metaphern und viele-zu-viele-Zuordnungen
- `HaltepunktSituationen` – freiwillig festgehaltene aktuelle und später vergangene Situationen

Die App legt fehlende Tabs bei bestehender Google-Verbindung selbst an.

## Lokale Speicherung

PACE verwendet für dauerhafte lokale App-Daten **IndexedDB** statt `localStorage`. Beim ersten Start der IndexedDB-Version werden vorhandene PACE-Einträge aus `localStorage` automatisch in die neue Datenbank übernommen und erst nach erfolgreichem Schreiben aus `localStorage` entfernt.

Die Features arbeiten weiterhin mit einem synchronen In-Memory-Cache; Schreibvorgänge werden im Hintergrund nach IndexedDB persistiert. Dadurch musste die bestehende Feature-Logik nicht in eine Vielzahl asynchroner Einzelzugriffe umgebaut werden.

`localStorage` bleibt nur als technischer Fallback erhalten, falls IndexedDB im Browser tatsächlich nicht verfügbar oder nicht nutzbar ist.

## Google Sheets

PACE verwendet Googles OAuth Token Model direkt im Browser und fordert nur:

`https://www.googleapis.com/auth/drive.file`

Es wird **kein Client Secret** verwendet. Die Client-ID und Spreadsheet-ID werden lokal in IndexedDB gespeichert; der kurzlebige Access Token bleibt nur im Arbeitsspeicher.

### Einmalige Einrichtung

1. Google Sheets API im Google-Cloud-Projekt aktivieren.
2. OAuth-Konfiguration einrichten.
3. OAuth-Client vom Typ **Web application** anlegen.
4. Authorized JavaScript Origin: `https://david-bassler.github.io`
5. Client-ID in PACE eintragen.
6. Mit Google verbinden.
7. Ein neues PACE-Sheet anlegen oder die vorhandene Spreadsheet-ID verwenden.

### Google Picker für die bestehende Tracking-Tabelle

PACE verwendet für die bestehende Tracking-Tabelle wie vereinbart den **Google Picker**. Das PACE-Backend und die Tracking-Tabelle haben getrennte Spreadsheet-IDs; dadurch kann ein vorhandenes Tabellenblatt wie `Tage` nicht mit dem PACE-internen `Tage`-Tab kollidieren.

Der OAuth-Scope bleibt dabei unverändert:

`https://www.googleapis.com/auth/drive.file`

Für den Picker zusätzlich:

1. **Google Picker API** und **Google Drive API** im selben Cloud-Projekt aktivieren.
2. Einen Website-API-Key anlegen und auf die benötigten APIs beschränken.
3. Bei den Website-Referrern `https://david-bassler.github.io/*` und `https://docs.google.com/*` zulassen. Der zweite Referrer ist nötig, weil der Picker in einem `docs.google.com`-iframe läuft.
4. API-Key und Cloud-Projektnummer in PACE eintragen. PACE kann die Projektnummer meist aus dem numerischen Präfix der OAuth Client-ID ableiten.
5. Nach der Google-Verbindung **Tracking-Tabelle auswählen** drücken und die gewünschte Google-Tabelle im Picker wählen.

Die ausgewählte Datei-ID und der Dateiname werden lokal in IndexedDB gespeichert. Der Picker zeigt nur Google-Tabellen und verwendet wegen des eingeschränkten `drive.file`-Scopes die Listenansicht ohne Thumbnail-Abhängigkeit.

## Flexible Tabellen-Erfassung

PACE kann eine private, geräteübergreifend synchronisierbare Erfassungskonfiguration verwalten und Einträge in die über den Google Picker ausgewählte Tracking-Tabelle schreiben:

- Gruppen mit Titel, Icon und Reihenfolge
- einzelne Felder mit optionaler Gruppenzuordnung
- Ziel über **Tabellenblatt + stabile Spalten-ID** statt Spaltenbuchstaben
- Eingabetypen Text, Uhrzeit + Text, Uhrzeit, Zahl und Ja/Nein
- Schreibmodus „mit Zeilenumbruch anhängen“ oder „ersetzen“
- dynamische Schnell-Erfassungsoberfläche aus dieser Konfiguration
- neue Felder verwenden standardmäßig das Tabellenblatt `Tage`, können aber weiterhin auf andere Tabs zeigen

Die Tracking-Tabelle wird zentral unter **Einstellungen → Google Sheets** ausgewählt. Unter **Erfassung konfigurieren** werden nur Gruppen und Felder gepflegt; dort gibt es bewusst keinen zweiten Picker.

Beim Speichern liest PACE die ausgewählte Tracking-Datei direkt:

1. Ziel-Tabellenblatt prüfen.
2. In der ersten Spalte die eindeutige Zeile mit `ID` finden.
3. Die konfigurierte stabile Spalten-ID in die aktuelle Spaltenposition auflösen.
4. Über die Spreadsheet-Zeitzone das heutige Datum bestimmen. Fehlt die heutige Datenzeile, ergänzt PACE ab dem letzten vorhandenen Datum alle fehlenden Kalendertage in Spalte A bis einschließlich heute.
5. Vorhandenen Zellinhalt lesen und je nach Schreibmodus ersetzen oder mit Zeilenumbruch ergänzen.
6. Datumsauffüllung und Zielzellen gemeinsam über einen atomaren Google-Sheets-Batch aktualisieren.

Für neu ergänzte Datumszellen übernimmt PACE das Zellformat des letzten vorhandenen Datums. PACE schreibt bewusst **nicht**, wenn die ID-Zeile oder eine konfigurierte Spalten-ID fehlt bzw. mehrdeutig ist, das letzte vorhandene Datum mehrfach vorkommt oder eine zum Auffüllen benötigte Zelle in Spalte A bereits Inhalt bzw. eine Formel enthält. Doppelte IDs werden ebenfalls blockiert; es gibt keine Ersatzspalte. Formelzellen werden nicht überschrieben.

## Bestehende private TSV importieren

Für die ursprünglichen P/A/C/E-Vorschläge erwartet die Importfunktion:

```text
Typ	Bereich	Text
VORSCHLAG	P	...
VORSCHLAG	A	...
VORSCHLAG	C	...
VORSCHLAG	E	...
FESTSTECKEN		...
```

Die neueren privaten Daten werden direkt über die App gepflegt.

## Feature-Historie

Die Git-Historie ist absichtlich featureweise aufgebaut:

1. `refactor: split PACE into modular core`
2. `feat(progress): add personal constitution and flexible goal graph`
3. `feat(progress): add bottom-up progress inbox and next-step chooser`
4. `feat(meh): add explanations, private examples and resonance chances`
5. `feat(space): add parking, smaller-day mode and savour markers`
6. `fix: migrate existing local PACE data into modular app`
7. `fix(google): serialize requests and retry rate limits`
8. `refactor(sync): centralize feature sync and batch sheet traffic`
9. `feat(sync): surface local/pending/synced state clearly`

Dadurch lassen sich einzelne Ideen später leichter verändern oder zurücknehmen.

## GitHub Pages

Deployment:

- Branch: `main`
- Folder: `/ (root)`

URL:

`https://david-bassler.github.io/PACE/`

## Offline

Das App-Shell funktioniert offline. Bereits geladene private Inhalte bleiben im lokalen Browser-Cache verfügbar. Änderungen werden lokal gespeichert und bei bestehender Google-Verbindung wieder synchronisiert.


## Synchronisierung und Rate Limits

PACE bündelt Google-Sheets-Zugriffe inzwischen zentral:

- API-Anfragen laufen seriell statt parallel.
- Wiederholte Sheet-/Header-Prüfungen werden pro Sitzung gecacht.
- Mehrere Tabellen werden per Batch gelesen und geschrieben.
- HTTP 429 sowie vorübergehende 5xx-Fehler werden mit exponentiellem Backoff erneut versucht.
- Lokale Änderungen werden zuerst im Browser gespeichert und anschließend über eine gemeinsame Sync-Queue übertragen.
- Das UI unterscheidet sichtbar zwischen lokal gespeichert, wartend, synchronisierend und synchronisiert.

Dadurch bleibt die lokale App auch dann benutzbar, wenn Google vorübergehend limitiert.

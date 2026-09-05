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

Die App ist bewusst in kleine ES-Module getrennt:

- `js/core/storage.js` – lokale Speicherung, IDs, Datumshelfer
- `js/core/ui.js` – kleine gemeinsame UI-Helfer
- `js/core/google.js` – OAuth, serialisierte API-Queue, Batch-Zugriffe und 429-Retry
- `js/core/sync.js` – zentrale Synchronisationsqueue und Status (`lokal`, `wartet`, `syncing`, `synced`)
- `js/features/day.js` – Tagesform, P/A/C/E-Auswahl, Feststecken, Abendabschluss
- `js/features/settings.js` – Google-Konfiguration, Verbindung, TSV-Import, Installation
- `js/features/progress.js` – persönliche Verfassung, Zielnetz, Fortschritts-Inbox, nächste Schritte
- `js/features/wellbeing.js` – Meh-Modus, Erklärungstexte, private Beispiele, Resonanzchancen
- `js/features/space.js` – Parken, Tag verkleinern, „Das behalten“ / Savour-Marker
- `js/features/tracking.js` – konfigurierbare Tabellen-Erfassung, Gruppen/Felder und Schreibplan-Vorschau

Neue Funktionen sollen möglichst als eigenes Feature-Modul ergänzt werden statt die Tageslogik weiter aufzublähen.

## Fortschritt: flexibles Netz statt Pflicht-Hierarchie

Als Denkmodell kann Fortschritt so aussehen:

`Zielbereich → Ziel → Meilenstein → Aufgabe → klare Anweisung`

Keine Ebene ist verpflichtend. Ein Fortschritt kann auch zuerst passieren und später eingeordnet werden.

Ziele, Meilensteine, Aufgaben und Ereignisse dürfen mehreren Zielbereichen gleichzeitig zugeordnet sein. Die App behandelt die Lebenslandkarte deshalb als Netz und nicht als strengen Baum.

## Zugehörige Companion-App

Im selben Repository ist eine separate Node-App zur Übernahme von Fitbit-/Google-Health-Rohdaten vorgesehen. Das Konzept und die Schlafberechnungsregeln stehen in [FITBIT_BRIDGE.md](FITBIT_BRIDGE.md).

## Datenschutz-Architektur

Das öffentliche GitHub-Repository enthält **nur App-Logik, UI, generische Erklärungstexte und PWA-Dateien**.

Persönliche Inhalte gehören ausschließlich in das private Google Sheet und in den lokalen Browser-Cache. Insbesondere gehören persönliche Zielbereiche, Beispiele und Resonanzgeschichten **nicht** ins Repository.

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

Die App legt fehlende Tabs bei bestehender Google-Verbindung selbst an.

## Google Sheets

PACE verwendet Googles OAuth Token Model direkt im Browser und fordert nur:

`https://www.googleapis.com/auth/drive.file`

Es wird **kein Client Secret** verwendet. Die Client-ID und Spreadsheet-ID werden lokal gespeichert; der kurzlebige Access Token bleibt nur im Arbeitsspeicher.

### Einmalige Einrichtung

1. Google Sheets API im Google-Cloud-Projekt aktivieren.
2. OAuth-Konfiguration einrichten.
3. OAuth-Client vom Typ **Web application** anlegen.
4. Authorized JavaScript Origin: `https://david-bassler.github.io`
5. Client-ID in PACE eintragen.
6. Mit Google verbinden.
7. Ein neues PACE-Sheet anlegen oder die vorhandene Spreadsheet-ID verwenden.

## Flexible Tabellen-Erfassung – erster Umsetzungsstand

PACE kann bereits eine private, geräteübergreifend synchronisierbare Erfassungskonfiguration verwalten:

- Gruppen mit Titel, Icon und Reihenfolge
- einzelne Felder mit optionaler Gruppenzuordnung
- Ziel über **Tabellenblatt + stabile Spalten-ID** statt Spaltenbuchstaben
- vorläufige Eingabetypen wie Text, Uhrzeit + Text, Uhrzeit, Zahl und Ja/Nein
- Schreibmodus „mit Zeilenumbruch anhängen“ oder „ersetzen“
- dynamische Schnell-Erfassungsoberfläche aus dieser Konfiguration
- Schreibplan-Vorschau, damit Ziel und Format getestet werden können

Noch **nicht** implementiert ist der Zugriff auf die bestehende Tracking-Tabelle. Dafür wird später wie vereinbart der **Google Picker** ergänzt. Bis dahin verändert die neue Erfassungsoberfläche die bestehende Tracking-Tabelle nicht.

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

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
- `js/core/google.js` – OAuth und generischer Google-Sheets-Zugriff
- `js/features/day.js` – Tagesform, P/A/C/E-Auswahl, Feststecken, Abendabschluss
- `js/features/settings.js` – Google-Konfiguration, Verbindung, TSV-Import, Installation
- `js/features/progress.js` – persönliche Verfassung, Zielnetz, Fortschritts-Inbox, nächste Schritte
- `js/features/wellbeing.js` – Meh-Modus, Erklärungstexte, private Beispiele, Resonanzchancen
- `js/features/space.js` – Parken, Tag verkleinern, „Das behalten“ / Savour-Marker

Neue Funktionen sollen möglichst als eigenes Feature-Modul ergänzt werden statt die Tageslogik weiter aufzublähen.

## Fortschritt: flexibles Netz statt Pflicht-Hierarchie

Als Denkmodell kann Fortschritt so aussehen:

`Zielbereich → Ziel → Meilenstein → Aufgabe → klare Anweisung`

Keine Ebene ist verpflichtend. Ein Fortschritt kann auch zuerst passieren und später eingeordnet werden.

Ziele, Meilensteine, Aufgaben und Ereignisse dürfen mehreren Zielbereichen gleichzeitig zugeordnet sein. Die App behandelt die Lebenslandkarte deshalb als Netz und nicht als strengen Baum.

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

Dadurch lassen sich einzelne Ideen später leichter verändern oder zurücknehmen.

## GitHub Pages

Deployment:

- Branch: `main`
- Folder: `/ (root)`

URL:

`https://david-bassler.github.io/PACE/`

## Offline

Das App-Shell funktioniert offline. Bereits geladene private Inhalte bleiben im lokalen Browser-Cache verfügbar. Änderungen werden lokal gespeichert und bei bestehender Google-Verbindung wieder synchronisiert.

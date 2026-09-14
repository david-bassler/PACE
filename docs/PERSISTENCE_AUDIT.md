# PACE – Persistenz-Audit

## Verbindliche Regel

Dauerhafte inhaltliche Nutzereingaben dürfen in PACE nicht ausschließlich lokal existieren.

- **Google Sheets ist die dauerhafte, geräteübergreifende Datenebene.**
- **IndexedDB / redundanter Browser-Speicher ist Offline-, Recovery- und Queue-Schicht.**
- Ein neues Feature mit Text-, Zahlen-, Auswahl- oder sonstigen inhaltlichen Eingaben braucht deshalb entweder ein eigenes Sheet-Schema oder muss in ein vorhandenes geeignetes Schema integriert werden.
- Auch **nicht abgeschickte Entwürfe**, die PACE über einen Reload hinweg bewahrt, gelten als dauerhafte Nutzereingaben und müssen synchronisierbar sein.

## Audit 2026-09-14

| Bereich | Lokale Speicherung | Google-Sheets-Ziel | Ergebnis |
| --- | --- | --- | --- |
| Tagesauswahl, Tagesform, Abendnotizen, kleiner Tag | `pace-day-v5`, Energie-Cache | `Tage` | synchronisiert |
| Zielbereiche, Ziele, Aufgaben, Fortschrittsereignisse | `pace-progress-v1` | `Zielbereiche`, `Fortschritt`, `FortschrittEreignisse` | synchronisiert |
| Beispiele, Resonanzchancen und Resonanzbibliothek | `pace-library-v1` | `Beispiele`, `Resonanzchancen`, `Resonanzbibliothek` | synchronisiert |
| Geparkte Themen und Behalten-Einträge | `pace-space-v1` | `Geparkt`, `Behalten` | synchronisiert |
| Haltepunkte und Situationen | `pace-holding-v1` | `Haltepunkte`, `HaltepunktSituationen` | synchronisiert |
| Erfassungskonfiguration | `pace-tracking-config-v1` | `ErfassungKonfig` | synchronisiert |
| Tracking-Einträge | lokale Write-/Recovery-Operationen | ausgewählte Tracking-Tabelle | synchronisiert / bis Bestätigung lokal abgesichert |
| Richtung finden | `pace-regulation-state-v1` | `Werkzeugdaten` | synchronisiert |
| Unüberwindbar verkleinern | `pace-regulation-state-v1` | `Werkzeugdaten` | synchronisiert |
| Horizont / eigener Zeitraum | bisher `pace-horizon-v1` | `Nutzereingaben` | **im Audit ergänzt** |
| Atemtempo | bisher `pace-breath-settings-v1` | `Nutzereingaben` | **im Audit ergänzt** |
| Schnellerfassungs-Entwurf | bisher `pace-quick-capture-draft-v1` | `Nutzereingaben` | **im Audit ergänzt** |
| Nicht abgeschickte Tracking-Dialog-Entwürfe | bisher redundanter lokaler Draft-Store | `Nutzereingaben` | **im Audit ergänzt** |

## Neuer Tab `Nutzereingaben`

Der private PACE-Backend-Sheet-Tab `Nutzereingaben` enthält geräteübergreifende Zustände und Entwürfe, die nicht sinnvoll in die fachlichen Haupttabellen passen.

Spalten:

`ID · Bereich · Text · Status · Zusatz · Erstellt · Aktualisiert`

Aktuell werden dort gespeichert:

- `horizon` – gewählter Horizont, Modus und eigener Arbeitszeitraum je Tag
- `breath-settings` – Ein- und Ausatemtempo
- `quick-capture-draft` – noch nicht zugeordneter Text in der Schnellerfassung
- `tracking-entry-draft` – noch nicht abgeschickte Werte eines Erfassungsdialogs

## Bewusst lokale technische Daten

Nicht jede lokale Speicherung ist eine eigenständige Nutzereingabe. Folgende Daten dürfen lokal bleiben, weil sie **keine maßgebliche inhaltliche Datenquelle** darstellen:

- OAuth Client-ID, Spreadsheet-IDs, Picker-API-Key und ähnliche Bootstrap-Konfiguration. Diese Daten werden benötigt, um die Sheet-Verbindung überhaupt herzustellen; für Gerätewechsel gibt es den Setup-Transfer.
- Access Tokens. Sie bleiben absichtlich ausschließlich im Arbeitsspeicher.
- redundante Safety-Journale, Pending-Operationen und Recovery-Kopien von Tracking-Einträgen. Der fachliche Zielzustand dieser Daten ist bereits die Tracking-Tabelle; die lokalen Kopien existieren nur bis zur bestätigten Übertragung bzw. für Recovery.
- abgeleitete UI-Komfortdaten wie zuletzt verwendete Emojis oder automatisch gelernte Dezimalvorschläge. Sie sind keine autoritativen Nutzerdaten und können ohne Informationsverlust neu entstehen.
- temporäre, nicht persistierte UI-Zustände wie geöffnete Dialoge, Filtertexte oder aktuell markierte Vorschlagsbuttons.

## Review-Regel für neue Features

Vor Merge eines Features mit Nutzerinput prüfen:

1. Welche Information kann der Nutzer erzeugen oder verändern?
2. Bleibt sie nach Reload/Neustart erhalten oder soll sie erhalten bleiben?
3. In welchem Sheet liegt die autoritative Kopie?
4. Gibt es stabile IDs bzw. eine eindeutige Merge-Regel für mehrere Geräte?
5. Funktioniert Eingabe offline und wird sie nach erneuter Verbindung zuverlässig synchronisiert?
6. Wird lokaler Recovery-Speicher erst entfernt, wenn die eigentliche Übertragung bestätigt ist?

Wenn Frage 2 mit **ja** beantwortet wird und Frage 3 keine Antwort hat, ist das Feature noch nicht vollständig.

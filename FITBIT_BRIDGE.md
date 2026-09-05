# Fitbit-/Health-Bridge für PACE

Dieses Dokument beschreibt eine **separate Node-App im selben Repository**, die eng mit PACE zusammenarbeitet, aber eine eigene Aufgabe hat: Fitbit-/Google-Health-Rohdaten automatisiert abrufen und für PACE in einem privaten Google Sheet bereitstellen.

## Grundidee

Die Architektur soll bewusst getrennt bleiben:

```text
Fitbit / Google Health API
        ↓
separate Node-App
        ↓
privater Rohdaten-Tab im PACE-Sheet
        ↓
PACE
        ↓
berechnete / bestätigte Werte
        ↓
bestehende Tracking-Tabelle
```

Die Node-App soll möglichst **Rohdaten sammeln, nicht interpretieren**. PACE übernimmt anschließend die nutzerseitige Festlegung sinnvoller Grenzen und die daraus resultierenden Berechnungen.

## Schlafdaten

Für Schlaf sollen insbesondere die einzelnen erkannten Phasen gespeichert werden, nicht nur zusammengefasste Tageswerte.

Mindestens pro Phase:

- Datum / zugeordnete Nacht
- Session-ID bzw. eindeutiger Bezug zur Schlafsession
- Phasentyp, z. B. `AWAKE`, `LIGHT`, `DEEP`, `REM`
- Beginn als Original-Zeitstempel
- Ende als Original-Zeitstempel
- Zeitzoneninformation bzw. eindeutig interpretierbarer Zeitstempel
- optional weitere von der API gelieferte Rohinformationen

Die Rohdaten sollen möglichst unverändert erhalten bleiben, damit spätere Berechnungsregeln geändert werden können, ohne die Fitbit-/Health-Daten erneut beschaffen zu müssen.

## Manuell festgelegte Zeitpunkte in PACE

PACE soll bei der Schlafauswertung drei Zeitpunkte erfassen bzw. bestätigen können:

- **Einschlafzeitpunkt**
- **erster Weckerzeitpunkt**
- **Aufstehzeitpunkt**

Der Einschlafzeitpunkt wird bewusst nicht automatisch aus dem Session-Start übernommen, weil der automatisch erkannte Schlafbeginn unzutreffend sein kann.

Der Aufstehzeitpunkt bleibt als eigener Wert erhalten, wird aber nicht automatisch als Ende der "echten Schlafzeit" verwendet.

## Regel für die echte Schlafzeit

Für die derzeit gewünschte Auswertung gilt:

```text
Schlaffenster = erster Weckerzeitpunkt − Einschlafzeitpunkt
Wachzeit      = Summe aller AWAKE-Anteile innerhalb dieses Fensters
Echte Schlafzeit = Schlaffenster − Wachzeit
```

Das Zeitfenster endet also am **ersten Weckerzeitpunkt**.

Schlaf oder Dösen nach dem ersten Wecker gehört nicht zur "echten Schlafzeit", auch wenn Fitbit/Google Health dort weiterhin Schlafphasen erkennt. Die Zeit bis zum tatsächlichen Aufstehen kann separat gespeichert oder ausgewertet werden.

### Phasen an den Grenzen beschneiden

AWAKE-Phasen werden nur mit dem Anteil berücksichtigt, der tatsächlich innerhalb des gewählten Schlaffensters liegt.

Beispiel:

- AWAKE laut Sensor: 06:28–06:34
- erster Wecker: 06:30
- für die Schlafberechnung zählen nur 06:28–06:30

Dasselbe Prinzip gilt am Einschlafzeitpunkt.

## Weitere Schlafwerte

Aus demselben manuell begrenzten Zeitfenster kann PACE später bei Bedarf auch weitere Werte berechnen, z. B.:

- Minuten `LIGHT`
- Minuten `DEEP`
- Minuten `REM`
- Minuten `AWAKE`
- Anzahl bzw. Dauer nächtlicher Wachphasen

Welche Werte tatsächlich in die bestehende Tracking-Tabelle geschrieben werden, wird später konfiguriert.

## Speicherung

Für die Rohdaten ist ein eigener privater Tabellen-Tab im PACE-Spreadsheet vorgesehen. Dadurch können Node-App und PACE denselben privaten Datenspeicher verwenden.

Die bestehende große Tracking-Tabelle bleibt davon getrennt. Sie soll später nur die bestätigten bzw. berechneten Zielwerte erhalten.

## Zuständigkeiten

### Node-App

- Authentifizierung gegenüber Google Health / Fitbit-Nachfolger
- Abruf neuer Rohdaten
- Speicherung der Rohdaten im privaten Sheet
- möglichst keine fachliche Interpretation
- wiederholbare / idempotente Synchronisation ohne doppelte Rohdatensätze

### PACE

- Rohdaten lesen
- Einschlaf-, Wecker- und Aufstehzeit erfassen bzw. bestätigen
- Schlafphasen auf das relevante Zeitfenster beschneiden
- AWAKE-Zeit und echte Schlafzeit berechnen
- später: berechnete Werte über die konfigurierbare Tabellen-Erfassung in die bestehende Tracking-Tabelle schreiben

## Noch offen

Noch nicht festgelegt sind insbesondere:

- genauer Name und Schema des Rohdaten-Tabs
- wie Nächte eindeutig identifiziert werden
- Zeitplan / Trigger der Node-App
- Umgang mit nachträglich geänderten Sensordaten
- OAuth- und Refresh-Token-Verwaltung der Node-App
- welche weiteren Fitbit-/Health-Datentypen neben Schlaf automatisiert übernommen werden
- wie PACE die Zielzeile in Tracking-Sheets bestimmt, die nicht nach "eine Zeile = ein Tag" aufgebaut sind

Die konkrete Google-Picker-Anbindung für die bestehende Tracking-Tabelle ist ein separates PACE-Thema und wird später umgesetzt.

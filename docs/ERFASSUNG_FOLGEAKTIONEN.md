# PACE – Konfigurierbare Erfassungs-Folgeaktionen

Stand: 15.09.2026

## Zweck

Ein Erfassungsfeld kann beim Speichern **null oder mehrere zusätzliche Schreibaktionen** auslösen. Fachliche Regeln werden damit als private Konfiguration beschrieben und nicht im JavaScript hardcodiert.

Beispielhaft kann eine normale Texteingabe in einer Spalte gleichzeitig einen numerischen Zähler in einer anderen Spalte erhöhen. PACE kennt dabei nicht die fachliche Bedeutung der Regel; es kennt nur Trigger, Bedingung, Ziel, Operation und Wert.

## Grundmodell

```text
Erfassungsfeld wird gespeichert
        ↓
primäre Schreiboperation
        +
0..n konfigurierte Folgeaktionen
        ↓
gemeinsame Tracking-Operation / gemeinsames Integritätsjournal
```

Die Folgeaktionen gehören zur **gleichen logischen Erfassung**. Sie werden nicht erst nach einem erfolgreichen Haupt-Write als lose zweite Aktion gestartet.

## Konfiguration

Die autoritative Konfiguration liegt im privaten PACE-Backend-Tab `ErfassungAktionen`.

Spalten:

`ID · TriggerFeldID · Bedingung · Bedingungswert · ZielTabellenblatt · ZielSpaltenID · Operation · Wert · Reihenfolge · Status · Aktualisiert`

### Felder

- **ID** – stabile ID der Regel.
- **TriggerFeldID** – stabile ID des Erfassungsfeldes, dessen Speicherung die Regel auslösen kann.
- **Bedingung** – aktuell `nonempty` oder `equals`.
- **Bedingungswert** – nur für `equals` relevant.
- **ZielTabellenblatt** – Ziel-Tab in der ausgewählten Tracking-Tabelle.
- **ZielSpaltenID** – stabile ID aus der ID-Zeile der Tracking-Tabelle.
- **Operation** – aktuell `add_number`, `replace` oder `append_newline`.
- **Wert** – fester Wert der Aktion.
- **Reihenfolge** – Reihenfolge mehrerer Regeln desselben Triggers.
- **Status** – `active` oder `archived`.
- **Aktualisiert** – Zeitstempel für geräteübergreifendes Merge.

Ziele werden **niemals relativ** als „nächste Spalte“ oder „Zelle rechts daneben“ gespeichert. Wie bei normalen Erfassungsfeldern besteht ein Ziel immer aus Tabellenblatt + stabiler Spalten-ID. Dadurch bleiben Regeln gültig, wenn Spalten verschoben werden.

## Bedingungen

### `nonempty`

Die Folgeaktion wird ausgeführt, wenn das Triggerfeld in dieser Erfassung tatsächlich mit einem nichtleeren Wert gespeichert wird.

### `equals`

Die Folgeaktion wird nur ausgeführt, wenn der getrimmte Eingabewert exakt dem konfigurierten `Bedingungswert` entspricht.

Die erste Version hält Bedingungen bewusst klein. Neue Bedingungsarten sollen nur ergänzt werden, wenn ein realer Anwendungsfall sie benötigt; die Konfiguration soll keine allgemeine Programmiersprache werden.

## Operationen

### `add_number` – Zahl addieren

Der konfigurierte Wert wird numerisch zum bestehenden Zellwert addiert.

- leere Zielzelle = `0`
- `30` + `30` = `60`
- deutsche Dezimalschreibweise mit Komma wird akzeptiert, z. B. `1,5` + `0,5` = `2`
- ist ein vorhandener Zielwert nicht numerisch, bricht PACE die Operation ab, statt ihn still zu überschreiben
- das Ergebnis wird als echter numerischer Google-Sheets-Wert materialisiert, nicht als Textzahl

### `replace` – Wert setzen / ersetzen

Die Zielzelle erhält den konfigurierten Wert. Ein vorhandener Zellinhalt wird ersetzt.

### `append_newline` – Text anhängen

Der konfigurierte Text wird an vorhandenen Text mit Zeilenumbruch angehängt. Ist die Zelle leer, wird nur der neue Text geschrieben.

## Integrität und Offline-Verhalten

Beim Erzeugen eines Erfassungsplans werden die zu diesem Zeitpunkt gültigen Folgeaktionen **in den Plan eingefroren**. Das ist wichtig für Offline- und Pending-Einträge:

- Eine später geänderte Regel verändert keine bereits ausgelöste Erfassung.
- Eine später archivierte Regel entfernt keine Folgeaktion aus einer bereits wartenden Operation.
- Ein Retry verwendet dieselben stabilen Journal-Event-IDs und darf eine Addition nicht ein zweites Mal ausführen.

Vor dem Schreiben erweitert `tracking-sheet.js` den gespeicherten Plan um die eingefrorenen Folgeaktionen. Hauptschreibung und Folgeaktionen werden als einzelne Events derselben `operationId` in `_PACE_Log` geführt und anschließend aus diesem Journal materialisiert. Damit greifen dieselben Readback-, Konflikt- und Recovery-Mechanismen wie bei normalen Tracking-Einträgen.

Eine Folgeaktion darf ebenfalls keine Formelzelle überschreiben. Externe Änderungen werden weiterhin über die bestehende Rebase-/Konfliktlogik behandelt.

## Beispiel

Angenommen, das Erfassungsfeld `event-42` schreibt Text nach `Tage · ID 42`. Zusätzlich soll bei jeder Speicherung der numerische Wert in `Tage · ID 43` um 30 steigen.

Eine passende Zeile in `ErfassungAktionen` wäre semantisch:

```text
ID: action-score
TriggerFeldID: event-42
Bedingung: nonempty
Bedingungswert:
ZielTabellenblatt: Tage
ZielSpaltenID: 43
Operation: add_number
Wert: 30
Reihenfolge: 10
Status: active
```

PACE speichert dann beispielsweise den Text in ID 42 und erhöht ID 43 von `60` auf `90`, ohne dass irgendeine Bedeutung von „30“ im Anwendungscode fest verdrahtet ist.

## Konfiguration in der App

Unter **Konfiguration → Erfassung konfigurieren → Zusätzliche Schreibaktionen** können Regeln angelegt, bearbeitet, archiviert und wieder aktiviert werden.

Die Oberfläche bietet aktuell:

- auslösendes Erfassungsfeld
- Bedingung
- optionalen Vergleichswert
- Ziel-Tabellenblatt
- Ziel-Spalten-ID
- Operation
- Wert
- Reihenfolge

Die Konfiguration selbst wird lokal offline vorgehalten und mit `ErfassungAktionen` im PACE-Backend synchronisiert.

## Vertrag für spätere Konfiguration via Chat

Spätere Chat-basierte Konfiguration soll **dieselbe Datenstruktur** schreiben und keine neue Fachlogik in den PACE-Code einbauen.

Wenn ein Nutzer beispielsweise sagt: „Wenn ich X erfasse, erhöhe Y um 30“, muss der Chat-Workflow daraus eine oder mehrere Zeilen in `ErfassungAktionen` erzeugen oder aktualisieren.

Dafür müssen mindestens eindeutig bekannt sein:

1. die stabile `TriggerFeldID`,
2. die Bedingung,
3. Ziel-Tabellenblatt und stabile `ZielSpaltenID`,
4. Operation und Wert.

Wenn Trigger oder Ziel anhand der vorhandenen Konfiguration nicht eindeutig auflösbar sind, darf der Chat-Workflow **nicht anhand von Spaltenpositionen raten**. Er muss die Mehrdeutigkeit klären.

Für gewöhnliche neue Regeln dieser Art soll später **keine Codeänderung und kein Deployment** nötig sein. Der Chat verändert ausschließlich die private, synchronisierte Konfiguration.

## Erweiterungsregel

Neue generische Operationen oder Bedingungen werden erst dann in den Anwendungscode aufgenommen, wenn sie sich nicht durch die vorhandenen primitiven Operationen ausdrücken lassen. Fachliche Einzelfälle bleiben Konfiguration, keine `if`-Sonderfälle im Code.

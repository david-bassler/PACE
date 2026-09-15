# PACE – Erfassungsintegrität

Stand: 15.09.2026

## Ziel

Bei laufenden Tracking-Einträgen gilt: Ein Eintrag darf nicht still verschwinden. Im Zweifel soll PACE einen Eintrag als lokal/pending oder als wiederherstellbare Sicherheitskopie behandeln, statt Erfolg vorzutäuschen.

Dasselbe gilt für **konfigurierte Folgeaktionen** eines Eintrags. Wenn eine Erfassung außer dem primären Wert weitere Zellen verändern soll, gehören diese Änderungen zur selben logischen Operation und dürfen nicht als unverbundene Best-Effort-Schreibvorgänge behandelt werden.

## Schutzschichten

1. **Entwurf** – Der Inhalt der Schnelleingabe wird lokal als Draft gespeichert.
2. **Primäre Queue** – Vor dem Entfernen aus der Eingabe wird der konkrete Tracking-Eintrag dauerhaft lokal gespeichert.
3. **Eingefrorener Schreibplan** – Zum Zeitpunkt der Erfassung werden die aktuell passenden Folgeaktionen in den konkreten Plan aufgenommen. Spätere Konfigurationsänderungen verändern keinen bereits wartenden Eintrag.
4. **Bestätigtes lokales Speichern** – Fehler beim Schreiben nach IndexedDB/localStorage werden an kritische Aufrufer weitergegeben; die Eingabe darf dann nicht entfernt werden.
5. **Redundantes Sicherheitsjournal** – Beim Auslösen einer Schnellerfassung wird Feld + Inhalt zusätzlich synchron über einen getrennten lokalen Schlüssel protokolliert. Dieses Journal bleibt von der normalen `pace-`-Migration getrennt.
6. **Persistente Pending-Anzeige** – Noch nicht bestätigte Queue-Einträge bleiben nach Reload sichtbar und werden erneut zur Synchronisation vorgemerkt.
7. **Remote-Integritätsjournal** – Primärschreibung und alle Folgeaktionen erhalten stabile Event-IDs unter derselben `operationId` in `_PACE_Log`. Ein Retry darf deshalb beispielsweise eine konfigurierte `+30`-Addition nicht ein zweites Mal anwenden.
8. **Google-Readback** – Nach einem Tracking-Write liest PACE die Zielzellen zurück. Erst bei übereinstimmendem Inhalt gilt der Vorgang als bestätigt.
9. **Recovery-Hinweis** – Eine Sicherheitsjournal-Eingabe, die nie in der primären Queue beobachtet wurde, wird sichtbar als prüfungsbedürftig angezeigt und kann in die Eingabe zurückgeholt werden.

## Folgeaktionen

Die Konfiguration der zusätzlichen Schreibaktionen liegt im PACE-Backend-Tab `ErfassungAktionen`. Die vollständige Semantik steht in [ERFASSUNG_FOLGEAKTIONEN.md](ERFASSUNG_FOLGEAKTIONEN.md).

Wesentliche Integritätsregeln:

- Ziele werden über Tabellenblatt + stabile Spalten-ID aufgelöst.
- Formeln werden nicht überschrieben.
- `add_number` bricht bei einem nichtnumerischen vorhandenen Zellwert ab, statt Daten umzudeuten.
- Numerische Addition wird als Journaloperation replayt und als echter Zahlenwert in Google Sheets materialisiert.
- Mehrere Folgeaktionen einer Erfassung werden mit dem primären Eintrag unter derselben Operation protokolliert.
- Bereits wartende Operationen behalten die beim Auslösen gültigen Folgeaktionen, auch wenn die Regel danach geändert oder archiviert wird.

## Bewusste Sicherheitsentscheidung

PACE bevorzugt bei Unsicherheit **kein stilles Verwerfen**. Ein nicht eindeutig bestätigter Zustand bleibt sichtbar. Das kann in extremen Netzwerk-/Browserfehlern eher zu einem prüfungsbedürftigen oder potentiell doppelten Eintrag führen als zu unbemerktem Datenverlust.

## Grenzen

Keine Browser-App kann Datenverlust absolut ausschließen, etwa wenn Website-Daten vom Betriebssystem oder Nutzer gelöscht werden oder beide lokalen Speichermechanismen gleichzeitig ausfallen. PACE soll solche normalen technischen Fehlerzustände aber erkennen und nicht als erfolgreichen Eintrag darstellen.

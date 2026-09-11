# PACE – Erfassungsintegrität

Stand: 11.09.2026

## Ziel

Bei laufenden Tracking-Einträgen gilt: Ein Eintrag darf nicht still verschwinden. Im Zweifel soll PACE einen Eintrag als lokal/pending oder als wiederherstellbare Sicherheitskopie behandeln, statt Erfolg vorzutäuschen.

## Schutzschichten

1. **Entwurf** – Der Inhalt der Schnelleingabe wird lokal als Draft gespeichert.
2. **Primäre Queue** – Vor dem Entfernen aus der Eingabe wird der konkrete Tracking-Eintrag dauerhaft lokal gespeichert.
3. **Bestätigtes lokales Speichern** – Fehler beim Schreiben nach IndexedDB/localStorage werden an kritische Aufrufer weitergegeben; die Eingabe darf dann nicht entfernt werden.
4. **Redundantes Sicherheitsjournal** – Beim Auslösen einer Schnellerfassung wird Feld + Inhalt zusätzlich synchron über einen getrennten lokalen Schlüssel protokolliert. Dieses Journal bleibt von der normalen `pace-`-Migration getrennt.
5. **Persistente Pending-Anzeige** – Noch nicht bestätigte Queue-Einträge bleiben nach Reload sichtbar und werden erneut zur Synchronisation vorgemerkt.
6. **Google-Readback** – Nach einem Tracking-Write liest PACE die Zielzellen zurück. Erst bei übereinstimmendem Inhalt gilt der Vorgang als bestätigt.
7. **Recovery-Hinweis** – Eine Sicherheitsjournal-Eingabe, die nie in der primären Queue beobachtet wurde, wird sichtbar als prüfungsbedürftig angezeigt und kann in die Eingabe zurückgeholt werden.

## Bewusste Sicherheitsentscheidung

PACE bevorzugt bei Unsicherheit **kein stilles Verwerfen**. Ein nicht eindeutig bestätigter Zustand bleibt sichtbar. Das kann in extremen Netzwerk-/Browserfehlern eher zu einem prüfungsbedürftigen oder potentiell doppelten Eintrag führen als zu unbemerktem Datenverlust.

## Grenzen

Keine Browser-App kann Datenverlust absolut ausschließen, etwa wenn Website-Daten vom Betriebssystem oder Nutzer gelöscht werden oder beide lokalen Speichermechanismen gleichzeitig ausfallen. PACE soll solche normalen technischen Fehlerzustände aber erkennen und nicht als erfolgreichen Eintrag darstellen.

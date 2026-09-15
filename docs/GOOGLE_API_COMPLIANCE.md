# PACE – Google-API- und Drive-Policy-Notiz

Stand: 2026-09-15

Diese Datei dokumentiert die beabsichtigte Datenarchitektur von PACE und die dazugehörige Auslegung der aktuellen Google-Drive-/Sheets-Richtlinien. Sie ist eine technische Compliance-Notiz und keine Rechtsberatung.

## Kurzfassung

PACE verwendet Google Sheets als **nutzereigenen, dauerhaften Anwendungsdatenspeicher**.

Das Architekturmodell ist:

```text
PACE UI ⇄ Google Sheets
            ↑
      autoritative Nutzerdaten

lokaler Browser-Speicher = Offline-/Recovery-/Queue-Kopie
```

PACE betreibt **keine separate entwicklerkontrollierte Backend-Datenbank**, deren Inhalt zusätzlich nach Google Drive gesichert wird. Google Drive / Google Sheets ist deshalb in PACE nicht als sekundäres Backup-Ziel konzipiert.

## Relevante Google-Aussagen

Google beschreibt Drive-integrierte Apps ausdrücklich auch als:

> “An app that uses Drive as its storage solution.”

Quelle: https://developers.google.com/workspace/drive/api/guides/about-sdk

Gleichzeitig nennt die Drive-Policy als nicht zulässigen Use Case ohne vorherige schriftliche Zustimmung:

> “Backup of user or app content from a developer’s app or project to Drive.”

Quelle: https://developers.google.com/workspace/drive/api/terms

PACE wird bewusst nach dem ersten Modell gebaut: Das vom Nutzer erzeugte oder ausgewählte Google Sheet ist selbst der dauerhafte Datenspeicher der Anwendung. Es existiert kein davon unabhängiger autoritativer PACE-Cloud-Datenbestand, der zusätzlich nach Drive kopiert wird.

Weitere relevante Google-Dokumentation:

- Drive API – OAuth scopes / `drive.file`: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Sheets API – Scopes: https://developers.google.com/workspace/sheets/api/scopes
- Google Workspace API User Data Policy: https://developers.google.com/workspace/workspace-api-user-data-developer-policy
- Google Picker: https://developers.google.com/drive/picker/guides/overview

## PACE-spezifische Regeln

### 1. Google Sheets ist die autoritative dauerhafte Datenebene

Dauerhafte inhaltliche Nutzerdaten müssen in einem Google Sheet liegen, das dem Nutzer gehört bzw. von ihm für PACE ausgewählt oder durch PACE in seinem Google-Konto erstellt wurde.

Lokale Browserdaten dürfen für Offline-Nutzung, schnelle UI-Reaktion, Queueing und Recovery existieren, sind aber nicht als unabhängige dauerhafte Hauptdatenbank gedacht.

### 2. Kein „Backup nach Drive“-Produktmodell

PACE darf die aktuelle Architektur nicht als „Google-Drive-Backup“, „Backup in Sheets“ oder vergleichbar beschreiben.

Bevorzugte Begriffe sind:

- **Speicherung in Google Sheets**
- **Synchronisierung mit dem Google Sheet**
- **nutzereigene dauerhafte Datenquelle**
- **lokale Offline-Kopie**
- **Recovery-Kopie**
- **lokale Write-Queue**

Das ist keine reine Wortwahlregel: Die Implementierung muss diesem Modell entsprechen.

### 3. `drive.file` bleibt der bevorzugte Scope

PACE fordert aktuell nur:

```text
https://www.googleapis.com/auth/drive.file
```

Dieser Scope soll beibehalten werden, solange kein zwingender Produktgrund für einen breiteren Scope existiert.

PACE soll nur mit Dateien arbeiten, die die App selbst erstellt hat oder die der Nutzer der App gezielt zugänglich gemacht hat, insbesondere über den Google Picker.

Ein Wechsel auf umfassendere Drive- oder Sheets-Berechtigungen erfordert vorab eine neue Compliance-Prüfung.

### 4. Nutzerwahl und Nutzerkontrolle

Bestehende Tracking-Tabellen werden über den Google Picker gewählt. PACE soll keine versteckte allgemeine Drive-Suche oder pauschale Dateierfassung einführen.

PACE-Daten bleiben für den Nutzer als normale Google-Sheets-Dateien zugänglich. Der Nutzer kann die Dateien unabhängig von PACE in Google Sheets öffnen.

### 5. Access Tokens bleiben flüchtig

Google Access Tokens werden nicht dauerhaft gespeichert. Sie bleiben nur im Arbeitsspeicher und werden nach Ablauf verworfen bzw. neu angefordert.

Client-ID, Spreadsheet-IDs, Picker-API-Key und Projektnummer sind technische Bootstrap-Konfiguration und dürfen lokal persistiert werden.

## Abgrenzung: zulässiges Storage-Modell vs. problematisches Backup-Modell

### Aktuelles PACE-Modell

```text
Nutzer gibt Daten in PACE ein
→ lokale Offline-/Recovery-Kopie
→ Speicherung/Synchronisierung in das nutzereigene Google Sheet
→ dieses Sheet ist die dauerhafte fachliche Datenquelle
```

### Modell, das vor Umsetzung neu geprüft werden muss

```text
PACE-Server oder andere autoritative Datenbank
→ vollständige oder regelmäßige Kopie nach Google Drive
→ Drive dient hauptsächlich der Sicherung/Wiederherstellung
```

Ebenso neu zu prüfen wäre eine Funktion wie „PACE-Daten als Backup-Datei nach Drive exportieren“, wenn der eigentliche Datenbestand unabhängig davon an einem anderen Ort autoritativ gespeichert wird.

## Review-Regel für neue Features

Vor Merge eines Features mit dauerhafter Nutzereingabe muss beantwortet werden:

1. Welches Google Sheet bzw. welcher Sheet-Tab ist die autoritative dauerhafte Kopie?
2. Ist lokaler Speicher nur Offline-, Recovery- oder Queue-Schicht?
3. Entsteht irgendwo ein zweiter entwicklerkontrollierter autoritativer Datenbestand?
4. Arbeitet die Funktion nur mit vom Nutzer erstellten/ausgewählten bzw. von PACE erstellten Dateien innerhalb des `drive.file`-Modells?
5. Wird die Funktion in UI und Dokumentation als Speicherung/Synchronisierung und nicht als Drive-Backup beschrieben?
6. Erfordert die Funktion einen breiteren OAuth-Scope? Falls ja: vor Umsetzung Richtlinien und Verifizierungsfolgen neu prüfen.

Wenn Punkt 1 oder 2 nicht klar beantwortet werden kann, ist das Datenmodell des Features noch nicht vollständig spezifiziert.

## Bei einer späteren öffentlichen Veröffentlichung

Die derzeitige persönliche Nutzung ist von einer breiten öffentlichen Produktfreigabe zu unterscheiden. Vor einer Veröffentlichung für beliebige Nutzer müssen zusätzlich mindestens geprüft werden:

- OAuth Consent Screen / Produktionsstatus
- öffentliche Datenschutzerklärung
- korrekte Offenlegung der Verwendung von Google-Nutzerdaten
- ggf. Brand Verification bzw. weitere Google-Verifizierungsanforderungen
- Domain-/Origin-Konfiguration
- weiterhin minimale Scopes und Limited-Use-Konformität

## Änderungsregel

Diese Einschätzung gilt nur für die hier beschriebene Architektur. Änderungen an Datenhaltung, OAuth-Scopes, Drive-Zugriff, Backend-Infrastruktur oder Export-/Backup-Funktionen lösen eine erneute Google-API-Policy-Prüfung aus.

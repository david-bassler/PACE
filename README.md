# PACE

PACE ist eine installierbare PWA für vier Tagesqualitäten:

- **P – Proficiency:** Kompetenz
- **A – Advancement:** Fortschritt
- **C – Capacity:** Reserve
- **E – Echo:** Resonanz

## Datenschutz-Architektur

Das öffentliche GitHub-Repository enthält **nur App-Logik, UI und PWA-Dateien**.

Persönliche Inhalte gehören ausschließlich in ein privates Google Sheet:

- `Vorschlaege` – P/A/C/E-Inhalte
- `Feststecken` – persönliche Unterbrechungsstrategien
- `Tage` – Tagesauswahl und Abendrückblick

Nach einer erfolgreichen Synchronisierung werden die Inhalte nur für Offline-Nutzung lokal im Browser gecacht.

Es gibt **keine persönlichen Fallback-Listen im Repository**.

## Google Sheets

PACE verwendet Googles OAuth Token Model direkt im Browser und fordert nur:

`https://www.googleapis.com/auth/drive.file`

Damit ist die App auf Dateien beschränkt, die sie selbst erstellt bzw. für die sie Zugriff erhalten hat.

Es wird **kein Client Secret** verwendet. Der kurzlebige Access Token wird nicht in `localStorage` gespeichert.

### Einmalige Einrichtung

1. In Google Cloud die **Google Sheets API** aktivieren.
2. OAuth Consent Screen konfigurieren.
3. OAuth Client vom Typ **Web application** anlegen.
4. Authorized JavaScript Origin:
   `https://david-bassler.github.io`
5. Die Client-ID in PACE unter dem Zahnrad eintragen.
6. Mit Google verbinden.
7. **Neues PACE-Sheet anlegen**.
8. Die private TSV-Datei über **Private TSV importieren** einspielen.

## TSV-Format

Die App erwartet drei Spalten:

```text
Typ	Bereich	Text
VORSCHLAG	P	...
VORSCHLAG	A	...
VORSCHLAG	C	...
VORSCHLAG	E	...
FESTSTECKEN		...
```

Die TSV-Datei bleibt lokal und wird von der App direkt in dein privates Google Sheet geschrieben.

## GitHub Pages

Unter **Settings → Pages**:

- Deploy from a branch
- Branch: `main`
- Folder: `/ (root)`

Danach:

`https://david-bassler.github.io/PACE/`

## Offline

Das App-Shell funktioniert offline. Private Inhalte stehen offline zur Verfügung, sobald sie mindestens einmal aus Google Sheets geladen und lokal gecacht wurden.

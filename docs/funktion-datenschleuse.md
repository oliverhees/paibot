<!--
PaiBot – Doku: die Datenschleuse zuschalten, prüfen und wieder ausschalten.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-20
-->

# Datenschleuse

**Ergebnis:** Bevor eine Nachricht an das KI-Modell geht, ersetzt die Datenschleuse Namen, Telefonnummern, Adressen und ähnliche Angaben durch Platzhalter wie `<PERSON_0>`. In der Antwort tauscht sie die Platzhalter wieder zurück. Du liest also die echten Namen, der Modell-Anbieter sieht sie nicht.

Die Datenschleuse ist **standardmäßig aus**. Sie ist eine technische Schutzmaßnahme und erkennt nicht alles (siehe [Grenzen](#grenzen)).

## Wofür

Du schreibst mit deinem Bot über echte Menschen, Kunden oder Termine und willst nicht, dass der Modell-Anbieter diese Angaben im Klartext bekommt. Dann schaltest du die Datenschleuse zu. Sie läuft als eigener Dienst auf deinem Server, zwischen PaiBot und dem Anbieter.

Die Datenschleuse ist ein eigenes Projekt (Lizenz AGPL-3.0, Quellcode: <https://github.com/oliverhees/datenschleuse>). PaiBot enthält keinen Code daraus, sondern startet sie als getrennten Dienst in genau einer festgelegten Version.

## So benutzt du es

Voraussetzung: PaiBot läuft schon mit Docker Compose (siehe [Installation](installation.md)), und du hast Node.js 22 für den Befehl `pnpm schleuse:config` (oder `node scripts/schleuse-config.mjs`, ohne weitere Pakete).

**Zuschalten**

1. Öffne `deploy/.env`. Wurde die Datei mit `sh deploy/env-erzeugen.sh` angelegt, stehen `SCHLEUSE_KEY` und `SCHLEUSE_STATE_KEY` schon darin. Fehlen sie (ältere Datei), erzeuge sie:

   ```bash
   echo "SCHLEUSE_KEY=sk-$(openssl rand -hex 32)" >> deploy/.env
   echo "SCHLEUSE_STATE_KEY=$(openssl rand -base64 32 | tr '+/' '-_')" >> deploy/.env
   ```

2. Trage in `deploy/.env` diese drei Zeilen ein (bei den ersten beiden nur das `#` entfernen):

   ```text
   COMPOSE_PROFILES=schleuse
   SCHLEUSE_URL=http://datenschleuse:4000/v1
   SCHLEUSE_ANBIETER_SCHLUESSEL=<derselbe Schlüssel, den du in PaiBot für EUrouter eingetragen hast>
   ```

3. Erzeuge die Konfiguration der Datenschleuse:

   ```bash
   pnpm schleuse:config --env-datei deploy/.env
   ```

   Das schreibt `deploy/schleuse/config.yaml` und `deploy/schleuse/nlp-config.yml`. Beide enthalten keine Geheimnisse und bleiben außerhalb von Git.

4. Starte den Stack neu. Beim ersten Mal werden zwei Images gebaut; das dauert einige Minuten.

   ```bash
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
   ```

**Prüfen**

5. Schau nach, ob alle Dienste laufen:

   ```bash
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps
   ```

   Erwartet: `datenschleuse` und `schleuse-analyzer` stehen auf `healthy`, ebenso `web` und `worker`.

6. Prüfe, ob der Worker die Datenschleuse erreicht:

   ```bash
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec worker \
     wget -qO- http://datenschleuse:4000/health/liveliness
   ```

   Erwartet: `"I'm alive!"`.

**Ausschalten**

7. Setze in `deploy/.env` wieder ein `#` vor `COMPOSE_PROFILES=schleuse` und vor `SCHLEUSE_URL=…` und entferne die beiden Dienste:

   ```bash
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env --profile schleuse rm -sf datenschleuse schleuse-analyzer
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
   ```

   Danach gilt die Datenschleuse für PaiBot als „nicht installiert“. Eine Unterhaltung, die die Datenschleuse verlangt, bekommt dann keine Antwort, statt ungeschützt an den Anbieter zu gehen.

Auf einem Server mit Coolify: [Datenschleuse zuschalten mit Coolify](deploy-coolify.md#datenschleuse-zuschalten).

## So sieht es aus

Folgt mit der Oberfläche. Den Schalter „Datenschleuse“ an der Unterhaltung und den Hinweis an jeder Antwort gibt es erst mit der Chat-Oberfläche. Bis dahin prüfst du den Dienst wie in Schritt 5 und 6.

## Einstellungen

Alle Werte stehen in `deploy/.env`. Nach einer Änderung an den Werten mit `SCHLEUSE_` im Namen `pnpm schleuse:config --env-datei deploy/.env` und danach `docker compose … up -d --build` ausführen.

| Einstellung                    | Wo            | Bedeutung                                                                                                                                                                       | Standard                              |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `COMPOSE_PROFILES`             | `deploy/.env` | `schleuse` startet die beiden Dienste der Datenschleuse                                                                                                                         | leer (aus)                            |
| `SCHLEUSE_URL`                 | `deploy/.env` | Adresse, unter der der Worker die Datenschleuse erreicht; leer heißt „nicht installiert“                                                                                        | leer                                  |
| `SCHLEUSE_KEY`                 | `deploy/.env` | Zugangsschlüssel zwischen PaiBot und Datenschleuse, `sk-` und mindestens 32 Zeichen; ohne ihn startet die Datenschleuse nicht                                                   | von `env-erzeugen.sh` erzeugt         |
| `SCHLEUSE_STATE_KEY`           | `deploy/.env` | Schlüssel für den verschlüsselten Zwischenstand der Datenschleuse                                                                                                               | von `env-erzeugen.sh` erzeugt         |
| `SCHLEUSE_ANBIETER_SCHLUESSEL` | `deploy/.env` | Schlüssel deines Modell-Anbieters; die Datenschleuse braucht ihn, um weiterzuleiten                                                                                             | leer                                  |
| `SCHLEUSE_ANBIETER`            | `deploy/.env` | Anbieter als `<schlüssel>=<basis-url>`; der Schlüssel ist der Name der Vorlage in PaiBot                                                                                        | `eurouter=https://api.eurouter.ai/v1` |
| `SCHLEUSE_SCHLUESSEL_WEG`      | `deploy/.env` | `umgebung`: Die Datenschleuse liest den Anbieter-Schlüssel aus `SCHLEUSE_ANBIETER_SCHLUESSEL`. `anfrage`: Der Schlüssel kommt mit jeder Anfrage und wird dort nicht gespeichert | `umgebung`                            |
| `SCHLEUSE_SPRACHMODELL`        | `deploy/.env` | Sprachmodell für Namen, Orte und Organisationen: `de_core_news_md` oder `de_core_news_lg` (findet etwas mehr Namen, braucht deutlich mehr Speicher)                             | `de_core_news_md`                     |
| `SCHLEUSE_QI_STUFE`            | `deploy/.env` | wie früh Angaben wie Postleitzahl, Geburtsjahr oder Beruf verallgemeinert werden: `utility`, `balanced`, `paranoid`                                                             | `balanced`                            |
| `SCHLEUSE_ANALYZER_SPEICHER`   | `deploy/.env` | Speichergrenze der Erkennung; für `de_core_news_lg` `1536m` setzen                                                                                                              | `768m`                                |
| `SCHLEUSE_SPEICHER`            | `deploy/.env` | Speichergrenze der Datenschleuse selbst                                                                                                                                         | `768m`                                |

Speicher: Mit `de_core_news_md` brauchen beide Dienste zusammen im Betrieb knapp 1 GB Arbeitsspeicher, mit `de_core_news_lg` rund 0,6 GB mehr. Plane das bei einem kleinen Server ein.

## So funktioniert es

```text
worker ──(Netz paibot-schleuse)──► datenschleuse ──(Netz schleuse-aussen)──► Modell-Anbieter
                                        │
                                (Netz schleuse-analyse)
                                        ▼
                                 schleuse-analyzer
```

1. Steht die Datenschleuse für eine Unterhaltung auf „An“, schickt der Worker die Anfrage nicht direkt zum Anbieter, sondern an `SCHLEUSE_URL`, mit `SCHLEUSE_KEY` und der ID der Unterhaltung. Das Modell heißt dort `<anbieter>/<modell>`, z. B. `eurouter/mistral-small-latest`.
2. Die Datenschleuse lässt den Text vom Dienst `schleuse-analyzer` prüfen (Muster für Mail, Telefon, IBAN, Straße und Ähnliches, dazu ein deutsches Sprachmodell für Namen, Orte und Organisationen).
3. Gefundene Angaben ersetzt sie durch nummerierte Platzhalter und schickt nur den so geänderten Text an den Anbieter. Die ID der Unterhaltung bleibt bei ihr.
4. In der Antwort, auch beim Streamen, tauscht sie die Platzhalter wieder gegen die echten Angaben. Das gilt auch für Argumente, mit denen das Modell ein Werkzeug aufruft.
5. Klappt die Prüfung nicht (Erkennung nicht erreichbar, unbekannter Inhalt, Bild im Anhang), wird die Anfrage **blockiert** und geht gar nicht an den Anbieter. PaiBot fällt dann nie auf den direkten Weg zurück.

Abschirmung:

| Dienst              | Netze                                                    | Warum                                                                        |
| ------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `worker`            | `paibot-intern`, `paibot-aussen`, `paibot-schleuse`      | spricht als einziger PaiBot-Dienst mit der Datenschleuse                     |
| `datenschleuse`     | `paibot-schleuse`, `schleuse-analyse`, `schleuse-aussen` | erreicht die Erkennung und den Anbieter, aber nicht die Datenbank von PaiBot |
| `schleuse-analyzer` | `schleuse-analyse`                                       | ohne Weg nach draußen; nur die Datenschleuse erreicht ihn                    |

- Keiner der beiden Dienste veröffentlicht einen Port. `web` erreicht die Datenschleuse nicht.
- Die Datenschleuse hat keine eigene Datenbank und keine Verwaltungs-Oberfläche. Ihr Zwischenstand liegt verschlüsselt im Arbeitsspeicher und ist nach einem Neustart weg.
- Beide Container laufen ohne Root-Rechte, ohne Linux-Fähigkeiten, mit `no-new-privileges` und schreibgeschütztem Dateisystem (beschreibbar ist nur ein kleiner Bereich im Arbeitsspeicher), mit Speichergrenze, Healthcheck und Neustart nach einem Absturz.
- Gebaut wird aus einem festen Commit der Datenschleuse und festen Basis-Images (per Prüfsumme); das Sprachmodell wird beim Bau mit Prüfsumme geladen.
- Die Konfiguration erzeugt `pnpm schleuse:config` (`scripts/schleuse-config.mjs`). Gleiche Werte ergeben immer dieselbe Datei; sie verweist auf Schlüssel nur über den Namen einer Umgebungsvariable.

**Der Schlüssel deines Anbieters liegt mit `SCHLEUSE_SCHLUESSEL_WEG=umgebung` an zwei Stellen:** verschlüsselt in der Datenbank von PaiBot und im Klartext in `deploy/.env` bzw. in der Umgebung der Datenschleuse. Wechselst du den Schlüssel beim Anbieter, trage ihn an beiden Stellen neu ein und starte die Datenschleuse neu. Mit `SCHLEUSE_SCHLUESSEL_WEG=anfrage` hält die Datenschleuse keinen Schlüssel; diesen Weg nutzt PaiBot aber erst, wenn der Worker den Schlüssel mitschickt (geplant). Bis dahin bleibt `umgebung` nötig.

## Grenzen

- **Nicht jede Angabe wird erkannt.** Namen, Orte und Organisationen findet ein Sprachmodell, das sich irren kann: Es übersieht manche Namen und markiert manchmal Wörter, die keine sind. Prüfe sensible Texte selbst, bevor du sie schickst.
- Die Datenschleuse ist eine technische Maßnahme. Sie ersetzt keine eigene Prüfung, was du einem Anbieter anvertraust.
- Erkannt wird auf Deutsch. Text in anderen Sprachen wird mit dem deutschen Modell geprüft und schlechter erkannt.
- **Werkzeuge:** Die Beschreibungen der Werkzeuge (Name, Beschreibung, Parameter), die mit einer Anfrage gehen, werden **nicht** maskiert. Argumente von Werkzeug-Aufrufen und Werkzeug-Ergebnisse im Verlauf werden maskiert; in der Antwort kommen die Argumente zurückgetauscht an, das Werkzeug arbeitet also mit den echten Angaben auf deinem Server.
- **Dateien und Bilder:** Bilder und Dateien als Anhang werden nicht geprüft, sondern blockiert. Die Anfrage geht dann gar nicht raus.
- Was nach dem Zurücktauschen in PaiBot gespeichert wird, ist der Klartext (Unterhaltungen in deiner Datenbank).
- Ohne Oberfläche gibt es noch keinen Schalter je Unterhaltung und keinen Hinweis an der Antwort (geplant mit der Chat-Oberfläche).
- Eine blockierte Anfrage zeigt PaiBot heute noch als „Anbieter nicht erreichbar“ statt als „Datenschleuse hat blockiert“ (Anpassung geplant).
- Ein Neustart der Datenschleuse löscht ihren Zwischenstand; laufende Unterhaltungen beginnen bei der Verallgemeinerung von vorn.

## Fehlerbehebung

| Beobachtung                                                                   | Ursache                                                                            | Was tun                                                                                                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `datenschleuse` startet ständig neu, Log: „Start abgebrochen: SCHLEUSE_KEY …“ | Schlüssel fehlt oder ist zu kurz                                                   | `SCHLEUSE_KEY=sk-$(openssl rand -hex 32)` in `deploy/.env`, neu starten                                                                  |
| Log: „Start abgebrochen: deploy/schleuse/config.yaml fehlt“                   | Konfiguration nicht erzeugt (Docker legt dann einen leeren Ordner an)              | Ordner `deploy/schleuse/config.yaml` löschen, `pnpm schleuse:config --env-datei deploy/.env`, neu starten                                |
| Log: „Start abgebrochen: SCHLEUSE_ANBIETER_SCHLUESSEL fehlt“                  | Weg `umgebung`, aber kein Anbieter-Schlüssel                                       | Schlüssel eintragen oder `SCHLEUSE_SCHLUESSEL_WEG=anfrage` (siehe oben)                                                                  |
| `schleuse-analyzer` wird nicht `healthy`                                      | Sprachmodell lädt noch, Speichergrenze zu klein oder Modell passt nicht zum Image  | Log lesen; bei `de_core_news_lg` `SCHLEUSE_ANALYZER_SPEICHER=1536m`; nach Wechsel des Modells `pnpm schleuse:config` und `up -d --build` |
| `pnpm schleuse:config` bricht ab                                              | Wert unzulässig (z. B. http-Adresse, `de_core_news_sm`)                            | die Meldung nennt den Wert und die erlaubten Möglichkeiten                                                                               |
| Worker bricht beim Start ab: „SCHLEUSE_KEY fehlt.“                            | `SCHLEUSE_URL` gesetzt, Schlüssel nicht                                            | `SCHLEUSE_KEY` eintragen oder `SCHLEUSE_URL` wieder auskommentieren                                                                      |
| Antworten bleiben mit Datenschleuse aus                                       | Anfrage blockiert oder Datenschleuse nicht erreichbar; PaiBot geht dann nie direkt | `docker compose … logs datenschleuse` lesen; Schritt 5 und 6 wiederholen                                                                 |

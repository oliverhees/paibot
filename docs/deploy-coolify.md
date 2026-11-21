<!--
PaiBot – Anleitung: PaiBot mit Coolify auf dem eigenen Server betreiben.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-07
-->

# PaiBot mit Coolify betreiben

Ziel: PaiBot läuft auf deinem eigenen Server in der EU, unter deiner Domain mit HTTPS, und `/api/health` meldet `"db":"ok"`.

PaiBot ist ein Docker-Compose-Stack (`deploy/docker-compose.yml`). Coolify ist der bequeme Weg, ihn auf einem Server zu betreiben; nötig ist es nicht (siehe [`deploy/README.md`](../deploy/README.md)).

## 1. Server und Coolify

Du brauchst einen Server bei einem Hoster mit Rechenzentrum in der EU (Ubuntu LTS, mindestens 2 vCPU und 4 GB RAM) mit Coolify.

**Empfohlen:** [coolify-shield](https://github.com/oliverhees/coolify-shield). Ein Befehl auf deinem Rechner führt dich durch Bestellung, Coolify-Installation und Absicherung (SSH nur per Schlüssel, Firewall, WireGuard-Tunnel). Das Coolify-Dashboard ist danach nur noch durch den Tunnel erreichbar: `http://10.8.0.1:8000`.

Wer Coolify von Hand installiert, folgt https://coolify.io/docs und sichert Server und Dashboard selbst ab.

## 2. Domain

Lege eine Domain oder Subdomain an (z. B. `paibot.deine-domain.de`), deren A-Record auf die Server-IP zeigt.

## 3. PaiBot als Ressource anlegen

1. In Coolify ein Projekt anlegen, z. B. „PaiBot“.
2. Neue Ressource → aus dem öffentlichen GitHub-Repo `https://github.com/oliverhees/paibot` → Build-Art **Docker Compose**.
3. Compose-Datei: `deploy/docker-compose.yml`, Branch `main`.
4. Werte erzeugen, am besten auf deinem eigenen Rechner (die Ausgabe nicht in Chats oder Tickets kopieren):

   ```bash
   openssl rand -hex 32      # für POSTGRES_PASSWORD
   openssl rand -hex 32      # für POSTGRES_APP_PASSWORD
   openssl rand -base64 32   # für PAIBOT_SECRET
   ```

5. Umgebungsvariablen in Coolify setzen:
   - `POSTGRES_PASSWORD`: erster Wert (Migrations-Rolle, Besitzer der Tabellen)
   - `POSTGRES_APP_PASSWORD`: zweiter Wert (App-Rolle, mit der PaiBot arbeitet)
   - `PAIBOT_SECRET`: dritter Wert. Zusätzlich im Passwort-Manager sichern; ohne ihn lassen sich gespeicherte Anbieter-Schlüssel nicht mehr lesen.
   - `APP_URL`: `https://paibot.deine-domain.de`
6. Beim Dienst `web` die Domain eintragen (Port 3000). Coolify besorgt das HTTPS-Zertifikat. Der Dienst `worker` bekommt **keine** Domain; er hat keinen Port.
7. Deploy starten. Coolify zeigt danach drei Dienste: `postgres`, `web` und `worker`. Der Worker startet erst, wenn `web` gesund ist, und nutzt dieselben Variablen (keine zusätzlichen nötig).

Die Datenbank veröffentlicht keinen Port und hängt nur im internen Netz des Stacks. Die Web-App ist nur auf `127.0.0.1` gebunden. Von außen ist PaiBot nur über deine Domain erreichbar.

Beim ersten Start legt PaiBot die App-Rolle `paibot_app` selbst an und gibt ihr nur die Rechte, die sie braucht. Was die Rollen dürfen: [Installation, Abschnitt „Rollen der Datenbank“](installation.md#rollen-der-datenbank).

## Bestehende Installation umstellen

Lief PaiBot bei dir schon mit nur `POSTGRES_PASSWORD`, startet der neue Stand erst, wenn die neuen Werte gesetzt sind. Deine Daten bleiben erhalten.

1. In Coolify eine Sicherung der Datenbank anlegen.
2. `POSTGRES_APP_PASSWORD` neu setzen (`openssl rand -hex 32`). `PAIBOT_SECRET` nur setzen, wenn es noch fehlt; ein vorhandenes nie ersetzen.
3. Ist `POSTGRES_PASSWORD` kürzer als 24 Zeichen, im Terminal des Dienstes `postgres` in Coolify `psql -U paibot -d paibot -c "\password paibot"` ausführen, ein neues Passwort setzen und danach die Variable `POSTGRES_PASSWORD` anpassen.
4. Neu deployen. Im Log von `web` stehen „App-Rolle paibot_app angelegt“ und „Rechte der App-Rolle paibot_app gesetzt“.

Musst du sofort wieder online sein, ohne umzustellen: `PAIBOT_ALLOW_PRIVILEGED_DB=1` setzen. PaiBot startet dann mit Warnung im Log. Das ist nur für den Übergang gedacht.

## Datenschleuse zuschalten

Die Datenschleuse ist standardmäßig aus. So schaltest du sie in Coolify zu (Hintergrund und Grenzen: [Datenschleuse](funktion-datenschleuse.md)):

1. Werte auf deinem eigenen Rechner erzeugen:

   ```bash
   echo "sk-$(openssl rand -hex 32)"           # für SCHLEUSE_KEY
   openssl rand -base64 32 | tr '+/' '-_'      # für SCHLEUSE_STATE_KEY
   ```

2. Umgebungsvariablen in Coolify setzen: `COMPOSE_PROFILES=schleuse`, `SCHLEUSE_URL=http://datenschleuse:4000/v1`, `SCHLEUSE_KEY` und `SCHLEUSE_STATE_KEY`. Den Schlüssel deines Anbieters setzt du nicht: PaiBot schickt ihn mit jeder Anfrage an die Datenschleuse mit.
3. Die Konfiguration erzeugen, auf deinem Rechner im Ordner von PaiBot: `pnpm schleuse:config --zeigen`. Die Ausgabe enthält zwei Dateien, `config.yaml` und `nlp-config.yml`, ohne Geheimnisse.
4. In Coolify bei den Diensten `datenschleuse` und `schleuse-analyzer` die eingebundenen Dateien `deploy/schleuse/config.yaml` bzw. `deploy/schleuse/nlp-config.yml` mit diesem Inhalt füllen (Bereich für gespeicherte Dateien des Dienstes).
5. Neu deployen. Die Dienste `datenschleuse` und `schleuse-analyzer` bekommen **keine** Domain. Beim ersten Mal werden zwei Images gebaut; das dauert einige Minuten.
6. Prüfen: Beide Dienste stehen auf „healthy“; im Terminal des Dienstes `worker` gibt `wget -qO- http://datenschleuse:4000/health/liveliness` `"I'm alive!"` aus.

Dieser Weg ist auf Coolify noch nicht vollständig durchgespielt. Fehlt in deiner Coolify-Version die Möglichkeit, den Inhalt eingebundener Dateien einzutragen, betreibe die Datenschleuse mit Docker Compose wie in der [Anleitung](funktion-datenschleuse.md#so-benutzt-du-es). Ausschalten: `COMPOSE_PROFILES` und `SCHLEUSE_URL` entfernen und neu deployen.

## 4. Prüfen

```bash
curl https://paibot.deine-domain.de/api/health
```

Erwartet: `{"status":"ok","app":"PaiBot","db":"ok",...}`. In Coolify stehen `web` und `worker` auf „healthy“; im Log von `worker` steht „Bereit: nimmt Läufe an“.

| Ergebnis                                               | Bedeutung                                                                     | Was tun                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `"db":"ok"`                                            | alles läuft                                                                   | –                                                                                            |
| `"db":"down"`, HTTP 503                                | App läuft, Datenbank nicht erreichbar                                         | Logs von `postgres` und `web` in Coolify prüfen, Passwort vergleichen                        |
| Kopfzeile `X-Pb-Db-Rolle: zu_viele_rechte` (`curl -I`) | App arbeitet mit zu vielen Rechten                                            | „Bestehende Installation umstellen“ und `PAIBOT_ALLOW_PRIVILEGED_DB` wieder entfernen        |
| Deploy bricht ab, Log: „Start abgebrochen“             | Pflichtwert fehlt, zu kurz oder Platzhalter; oder „Datenbank nicht auf Stand“ | die Zeile davor im Log nennt den Wert; Werte wie in Schritt 4 erzeugen                       |
| keine Antwort                                          | Domain, DNS oder Proxy falsch                                                 | A-Record und Domain-Eintrag beim Dienst `web` prüfen                                         |
| Dienst `worker` nicht „healthy“                        | Worker wartet noch auf `web` oder die Datenbank, oder sein Start brach ab     | Logs von `worker` in Coolify lesen; die letzte Zeile vor „Start abgebrochen“ nennt den Grund |

## So sieht es aus

Öffnest du deine Domain im Browser, zeigt die Startseite „Datenbank: ok“, sobald die Datenbank erreichbar ist.

![Startseite von PaiBot im dunklen Design mit grünem Punkt und dem Status „Datenbank: ok“](assets/screenshots/startseite.png)

## 5. Danach

- Backups der Datenbank einrichten (Ziel: S3-kompatibler Speicher in der EU). Die Sicherungen enthalten deine Unterhaltungen lesbar; schütze den Speicher entsprechend und lege `PAIBOT_SECRET` nicht dort ab.
- Automatische Deploys bei Push auf `main` aktivieren, wenn gewünscht

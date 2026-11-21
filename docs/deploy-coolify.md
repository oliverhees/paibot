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

PaiBot ist ein Docker-Compose-Stack. Für Coolify gibt es eine eigene Compose-Datei, `deploy/docker-compose.coolify.yml`: Coolify erzeugt damit die Passwörter der Datenbank, `PAIBOT_SECRET` und die Adresse selbst. Coolify ist der bequeme Weg, PaiBot auf einem Server zu betreiben; nötig ist es nicht (siehe [`deploy/README.md`](../deploy/README.md)).

**Was auf Coolify ausprobiert ist (Stand 21.11.2026):** Mit `deploy/docker-compose.yml` und von Hand eingetragenen Werten (Weg B) läuft PaiBot auf Coolify: Bau rund 2 Minuten, Domain von Coolify am Dienst `web` mit gültigem Zertifikat, Einrichtung erreichbar, Verbindung zum Anbieter steht. Der Weg A mit `deploy/docker-compose.coolify.yml` und von Coolify erzeugten Werten folgt der Doku und dem Quelltext von Coolify, ist auf einem echten Server aber **noch nicht durchgespielt**.

## 1. Server und Coolify

Du brauchst einen Server bei einem Hoster mit Rechenzentrum in der EU (Ubuntu LTS, mindestens 2 vCPU und 4 GB RAM) mit Coolify.

**Empfohlen:** [coolify-shield](https://github.com/oliverhees/coolify-shield). Ein Befehl auf deinem Rechner führt dich durch Bestellung, Coolify-Installation und Absicherung (SSH nur per Schlüssel, Firewall, WireGuard-Tunnel). Das Coolify-Dashboard ist danach nur noch durch den Tunnel erreichbar: `http://10.8.0.1:8000`.

Wer Coolify von Hand installiert, folgt https://coolify.io/docs und sichert Server und Dashboard selbst ab.

## 2. Domain

Zwei Möglichkeiten:

- **Domain von Coolify:** Ist in Coolify beim Server eine Wildcard-Domain eingestellt (z. B. `sslip.io`), erzeugt Coolify für den Dienst `web` selbst eine Adresse mit HTTPS. Für den Anfang reicht das.
- **Eigene Domain:** Lege eine Domain oder Subdomain an (z. B. `paibot.deine-domain.de`), deren A-Eintrag auf die **öffentliche** IP des Servers zeigt. Der WireGuard-Tunnel aus coolify-shield ist nur für das Dashboard; über ihn erreicht niemand PaiBot.

## 3. PaiBot als Ressource anlegen

### Weg A: Coolify erzeugt die Werte (empfohlen für eine neue Installation)

1. In Coolify ein Projekt anlegen, z. B. „PaiBot“.
2. Neue Ressource → aus dem öffentlichen GitHub-Repo `https://github.com/oliverhees/paibot` → Build Pack **Docker Compose**, Branch `main`.
3. **Base Directory** `/deploy`, **Docker Compose Location** `/docker-compose.coolify.yml`.
4. Speichern. Coolify liest die Datei ein und legt unter **Environment Variables** vier Werte an:

   | Variable                       | Wofür                                                          |
   | ------------------------------ | -------------------------------------------------------------- |
   | `SERVICE_HEX_64_PGOWNER`       | Passwort des Tabellen-Besitzers (nur `postgres` und `migrate`) |
   | `SERVICE_HEX_64_PGAPP`         | Passwort der App-Rolle, ein eigener Wert                       |
   | `SERVICE_REALBASE64_32_PAIBOT` | `PAIBOT_SECRET`: 32 zufällige Byte als Base64                  |
   | `SERVICE_URL_WEB`              | `APP_URL`: die Domain des Dienstes `web`, mit `https://`       |

   Die Werte bleiben bei jedem Deploy gleich. Du trägst keinen davon selbst ein.

5. **Domain prüfen:** Unter **Domains** steht sie beim Dienst `web`, mit `:3000` am Ende (der Port im Container; im Browser bleibt es `https://` ohne Port). Eigene Domain: dort `https://paibot.deine-domain.de:3000` eintragen. `migrate`, `worker` und `postgres` bekommen **keine** Domain.
6. **Geheimnisse aus dem Bau heraushalten:** Coolify gibt beim Bau sonst alle Variablen als Build-Argumente mit und schreibt `ARG`-Zeilen ins Dockerfile; so könnten Passwörter und `PAIBOT_SECRET` im Image landen. PaiBot braucht beim Bau keinen dieser Werte. Darum:
   - unter **Advanced** bei **Build arguments** „Managed manually in Dockerfile“ wählen (in älteren Versionen von Coolify: „Inject Build Args to Dockerfile“ ausschalten),
   - bei `SERVICE_HEX_64_PGOWNER`, `SERVICE_HEX_64_PGAPP`, `SERVICE_REALBASE64_32_PAIBOT` und, falls gesetzt, `SCHLEUSE_KEY`, `SCHLEUSE_STATE_KEY` und `SCHLEUSE_ANBIETER_SCHLUESSEL` **Build time** auf „Not available during build“ stellen (älter: Häkchen „Build Variable?“ entfernen).
7. Deploy starten. Coolify zeigt danach vier Dienste: `postgres`, `migrate`, `web` und `worker`. `migrate` wendet die Migrationen an, richtet die App-Rolle ein und beendet sich; erst danach starten `web` und `worker`.
8. **`PAIBOT_SECRET` sichern:** den Wert von `SERVICE_REALBASE64_32_PAIBOT` in deinen Passwort-Manager kopieren, getrennt von den Sicherungen der Datenbank. Ohne ihn lassen sich gespeicherte Anbieter-Schlüssel nicht mehr lesen; ein neuer Wert ersetzt ihn nicht.

Lief PaiBot schon mit `deploy/docker-compose.yml`, bleib bei Weg B. Willst du trotzdem umsteigen, trägst du vor dem ersten Deploy deine bisherigen Werte in die drei `SERVICE_…`-Variablen ein: `POSTGRES_PASSWORD` in `SERVICE_HEX_64_PGOWNER`, `POSTGRES_APP_PASSWORD` in `SERVICE_HEX_64_PGAPP`, `PAIBOT_SECRET` in `SERVICE_REALBASE64_32_PAIBOT`.

### Weg B: Werte selbst erzeugen

1. Ressource wie in Weg A anlegen, aber mit **Docker Compose Location** `/docker-compose.yml`.
2. Werte erzeugen, am besten auf deinem eigenen Rechner (die Ausgabe nicht in Chats oder Tickets kopieren):

   ```bash
   openssl rand -hex 32      # für POSTGRES_PASSWORD
   openssl rand -hex 32      # für POSTGRES_APP_PASSWORD
   openssl rand -base64 32   # für PAIBOT_SECRET
   ```

3. Umgebungsvariablen in Coolify setzen:
   - `POSTGRES_PASSWORD`: erster Wert (Migrations-Rolle, Besitzer der Tabellen)
   - `POSTGRES_APP_PASSWORD`: zweiter Wert (App-Rolle, mit der PaiBot arbeitet)
   - `PAIBOT_SECRET`: dritter Wert. Zusätzlich im Passwort-Manager sichern; ohne ihn lassen sich gespeicherte Anbieter-Schlüssel nicht mehr lesen.
   - `APP_URL`: die Adresse, unter der du PaiBot öffnest, z. B. `https://paibot.deine-domain.de` (ohne Port)
4. Beim Dienst `web` die Domain eintragen (Port 3000). Coolify besorgt das HTTPS-Zertifikat.
5. Geheimnisse aus dem Bau heraushalten wie in Weg A, Schritt 6 (hier bei `POSTGRES_PASSWORD`, `POSTGRES_APP_PASSWORD` und `PAIBOT_SECRET`).
6. Deploy starten.

### Für beide Wege

Die Datenbank veröffentlicht keinen Port und hängt nur im internen Netz des Stacks. Bei Weg A belegt auch die Web-App keinen Port auf dem Server: Der Proxy von Coolify erreicht sie über das Docker-Netz, deshalb gibt es kein `WEB_PORT` und zwei Installationen auf einem Server stören sich nicht. Bei Weg B (`docker-compose.yml`) ist die Web-App auf `127.0.0.1` gebunden (Port aus `WEB_PORT`, Standard 3000). Von außen ist PaiBot nur über deine Domain erreichbar.

Beim ersten Start legt `migrate` die App-Rolle `paibot_app` an und gibt ihr nur die Rechte, die sie braucht. Nur `migrate` bekommt die Zugangsdaten der Migrations-Rolle; `web` und `worker` arbeiten nur mit der App-Rolle. Was die Rollen dürfen: [Installation, Abschnitt „Rollen der Datenbank“](installation.md#rollen-der-datenbank).

### Stolperfallen

| Was du siehst                                                                 | Was es heißt                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Im Dialog „Add domain“ steht `migrate` ganz oben                              | Die Domain gehört nur zum Dienst `web`. Wähle `web` aus.                                                                                                                                                                                                                    |
| `migrate` steht nach dem Deploy auf „Exited“                                  | Richtig so: Er läuft bei jedem Deploy einmal durch und beendet sich mit Exit 0. Wegen `restart: "no"` zählt Coolify ihn nicht in den Zustand der Anwendung.                                                                                                                 |
| Der Einrichtungs-Code steht nicht unter „Deployments“                         | „Deployments“ zeigt nur das Bau-Protokoll. Der Code steht im Reiter **Logs** der Ressource beim Container `web`.                                                                                                                                                            |
| Im Bau-Protokoll steht „Added … ARG declarations“                             | Coolify schreibt Variablen ins Dockerfile. Schritt 6 aus Weg A nachholen und neu deployen.                                                                                                                                                                                  |
| PaiBot über die Tunnel-Adresse nicht erreichbar                               | Der Tunnel ist nur fürs Dashboard. PaiBot läuft über die öffentliche IP (A-Eintrag) oder die Domain von Coolify.                                                                                                                                                            |
| Coolify bricht beim Einlesen ab („expected type 'uint32'“)                    | Alte Compose-Datei mit `mode: 01777`. Mit dem aktuellen Stand von `main` neu einlesen (dort steht `mode: 1023`).                                                                                                                                                            |
| `Bind for 127.0.0.1:3000 failed: port is already allocated` beim Dienst `web` | Eine ältere Fassung von `docker-compose.coolify.yml` hat Port 3000 auf dem Server veröffentlicht; ein zweiter Stack oder ein anderer Dienst hatte ihn schon. Die aktuelle Datei belegt keinen Port mehr (`expose` statt `ports`). Neu einlesen bzw. neu bauen und deployen. |

**Beim Probelauf von Weg A prüfen** (noch nicht auf Coolify durchgespielt): Im Bau-Protokoll steht keine Zeile „Added … ARG declarations“ mehr. Auf dem Server findet `docker history --no-trunc <image>` keines der Geheimnisse (Suche nach `PAIBOT_SECRET`, `SERVICE_` und `POSTGRES`). Im Container `web` gibt `printenv APP_URL` die Adresse ohne `:3000` aus. Die Ressource steht auf „Running“, obwohl `migrate` „Exited“ zeigt.

## Bestehende Installation umstellen

Gilt für Weg B. Lief PaiBot bei dir schon mit nur `POSTGRES_PASSWORD`, startet der neue Stand erst, wenn die neuen Werte gesetzt sind. Deine Daten bleiben erhalten.

1. In Coolify eine Sicherung der Datenbank anlegen.
2. `POSTGRES_APP_PASSWORD` neu setzen (`openssl rand -hex 32`). `PAIBOT_SECRET` nur setzen, wenn es noch fehlt; ein vorhandenes nie ersetzen.
3. Ist `POSTGRES_PASSWORD` kürzer als 24 Zeichen, im Terminal des Dienstes `postgres` in Coolify `psql -U paibot -d paibot -c "\password paibot"` ausführen, ein neues Passwort setzen und danach die Variable `POSTGRES_PASSWORD` anpassen.
4. Neu deployen. Im Log von `migrate` stehen „App-Rolle paibot_app angelegt“, „Rechte der App-Rolle paibot_app gesetzt“ und „Migrations-Schritt fertig.“.

Lief bei dir schon ein Stand, in dem `web` selbst migriert hat, reicht ein neues Deploy: `migrate` kommt dazu, die Daten bleiben. Hast du in Coolify bei `web` von Hand `DATABASE_MIGRATION_URL` eingetragen, entferne sie dort, sonst startet die Web-App nicht.

Musst du sofort wieder online sein, ohne umzustellen: `PAIBOT_ALLOW_PRIVILEGED_DB=1` setzen. PaiBot startet dann mit Warnung im Log. Das ist nur für den Übergang gedacht.

**Hinter Coolify gilt `TRUST_PROXY=1`.** Coolify stellt einen Proxy (Traefik) vor PaiBot. Im Compose steht `TRUST_PROXY` für `web` schon auf `1`, damit PaiBot die Adresse der Besucher aus dem Eintrag kennt, den der Proxy anhängt. Setzt du es auf `0`, sperrt PaiBot Anmelde-Versuche nicht mehr je Adresse (die gemeinsame Bremse gilt weiter) und meldet das beim Start im Log und auf der Seite „Einrichtung“. Mehr dazu in [Einrichtung und Zugang](funktion-einrichtung-und-zugang.md).

**Größe und Zahl von Anfragen im Proxy begrenzen.** PaiBot weist zu große Anfragen selbst ab (16 KiB, Nachrichten 256 KiB, Bot ändern 64 KiB) und hält vor jeder Prüfung höchstens 16 KiB je Anfrage im Speicher. Wie viele Anfragen gleichzeitig offen sind, kann die App nicht begrenzen; jede kostet Speicher. Begrenze deshalb in Traefik die Größe auf **300 KB** und die gleichzeitigen Anfragen auf **20 je Besucher-Adresse** (Traefik zählt offene Anfragen je Adresse und lehnt darüber mit 429 ab; dieselben Werte wie in der [Installation](installation.md)): Trag beim Dienst `web` unter „Container Labels“ zwei Middlewares ein und häng sie an den Router, den Coolify für `web` anlegt (dessen Name steht schon in den Labels):

```text
traefik.http.middlewares.paibot-groesse.buffering.maxRequestBodyBytes=300000
traefik.http.middlewares.paibot-gleichzeitig.inflightreq.amount=20
traefik.http.routers.<router-von-web>.middlewares=paibot-groesse,paibot-gleichzeitig
```

Steht beim Router schon eine Zeile `…middlewares=…`, häng `,paibot-groesse,paibot-gleichzeitig` an. Danach prüfen: `curl -s -o /dev/null -w '%{http_code}\n' -X POST --data-binary @<datei-über-300-KB> https://paibot.deine-domain.de/x` antwortet `413`. Eine früher hier genannte Grenze von 1 MiB ist zu groß; stell sie auf 300000 um.

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

| Ergebnis                                         | Bedeutung                                                                     | Was tun                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `"db":"ok"`                                      | alles läuft                                                                   | –                                                                                            |
| `"db":"down"`, HTTP 503                          | App läuft, Datenbank nicht erreichbar                                         | Logs von `postgres` und `web` in Coolify prüfen, Passwort vergleichen                        |
| Im Log von `web`: „WARNUNG: … zu vielen Rechten“ | App arbeitet mit zu vielen Rechten                                            | „Bestehende Installation umstellen“ und `PAIBOT_ALLOW_PRIVILEGED_DB` wieder entfernen        |
| Deploy bricht ab, Log: „Start abgebrochen“       | Pflichtwert fehlt, zu kurz oder Platzhalter; oder „Datenbank nicht auf Stand“ | die Zeile davor im Log nennt den Wert; Werte wie in Schritt 3 prüfen                         |
| `web` und `worker` starten nicht                 | `migrate` ist mit Fehler beendet                                              | Log von `migrate` in Coolify lesen                                                           |
| keine Antwort                                    | Domain, DNS oder Proxy falsch                                                 | A-Record und Domain-Eintrag beim Dienst `web` prüfen                                         |
| Dienst `worker` nicht „healthy“                  | Worker wartet noch auf `migrate` oder die Datenbank, oder sein Start brach ab | Logs von `worker` in Coolify lesen; die letzte Zeile vor „Start abgebrochen“ nennt den Grund |

## So sieht es aus

Öffnest du deine Domain im Browser, begrüßt dich die Einrichtung. Den Einrichtungs-Code findest du in Coolify bei der Anwendung im Reiter **Logs** beim Container `web` (Suche nach „Einrichtungs-Code“), nicht unter „Deployments“. Wie es weitergeht, steht in [Einrichtung und Zugang](funktion-einrichtung-und-zugang.md).

![Einrichtung, Schritt 1 im dunklen Design: Begrüßung durch den Bot Pai und das leere Feld „Einrichtungs-Code“ mit dem Hinweis auf die Logs in Coolify](assets/screenshots/einrichtung-code.png)

## 5. Danach

- Nach dem ersten Start und der Einrichtung: unter **Einstellungen → Selbsttest** prüfen, ob `APP_URL`, `TRUST_PROXY`, HSTS, Datenbank-Rolle und Worker stimmen. Zu jedem Punkt steht ein Ausweg ([Selbsttest](funktion-selbsttest.md)).
- Backups der Datenbank einrichten (Ziel: S3-kompatibler Speicher in der EU). Die Sicherungen enthalten deine Unterhaltungen lesbar; schütze den Speicher entsprechend und lege `PAIBOT_SECRET` nicht dort ab.
- Automatische Deploys bei Push auf `main` aktivieren, wenn gewünscht

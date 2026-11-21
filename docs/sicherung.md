<!--
PaiBot – Installation sichern, in eine frische Installation zurückspielen und nachprüfen.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Sicherung und Wiederherstellung

**Ergebnis:** Mit einem Befehl sicherst du deine Installation, mit einem Befehl spielst du die Sicherung in eine frische Installation zurück, und PaiBot prüft danach selbst nach, dass alles da ist und die Belege-Kette gültig ist.

## Wofür

Damit ein kaputter Server, ein Fehler beim Aktualisieren oder ein Umzug auf einen neuen Server nicht deine Unterhaltungen, Bots, Anbieter und Belege kostet. Und damit du vorher ausprobieren kannst, ob deine Sicherung wirklich funktioniert.

## So benutzt du es

Alle Befehle laufen auf dem Server im Ordner von PaiBot. Du brauchst nur Docker, kein Node und kein pnpm. Hast du mit fertigem Image installiert, hänge an jeden Befehl `--image` an.

**Sichern**

1. Sicherung anlegen, während PaiBot läuft:

   ```bash
   sh deploy/sicherung.sh sichern
   ```

   Es entsteht ein Ordner `~/paibot-sicherungen/paibot-sicherung-<Zeit>` mit zwei Dateien, nur für dich lesbar: `datenbank.dump` (die Datenbank) und `begleit.json` (Stand von PaiBot aus der Start-Zeile des Workers, Zeitpunkt, Stand der Migrationen, Zeilen je Tabelle, Anker der Belege-Kette, Prüfsumme). Anderes Ziel: `--ziel <ordner>`.

2. Den Ordner vom Server wegbringen, zum Beispiel auf deinen Rechner (`scp -r server:paibot-sicherungen/paibot-sicherung-<Zeit> .`) oder auf verschlüsselten Speicher.
3. `deploy/.env` getrennt davon sicher aufbewahren, zum Beispiel im Passwort-Manager. Sie ist **nicht** in der Sicherung. Wichtig ist vor allem `PAIBOT_SECRET`: Ohne genau diesen Wert sind deine gespeicherten Anbieter-Schlüssel nach dem Zurückspielen nicht lesbar (siehe [So funktioniert es](#so-funktioniert-es)).

**Probe-Wiederherstellung** (empfohlen, einmal nach dem ersten Sichern; braucht etwa so viel freien Arbeitsspeicher wie PaiBot selbst)

4. Eine zweite, frische Installation auf demselben Server anlegen, mit eigenem Namen und Port, aber demselben `PAIBOT_SECRET`:

   ```bash
   cp deploy/.env deploy/.env.probe
   sed -i 's/^WEB_PORT=.*/WEB_PORT=3001/; s#^APP_URL=.*#APP_URL=http://localhost:3001#' deploy/.env.probe
   ```

5. Die Sicherung in die Probe zurückspielen:

   ```bash
   COMPOSE_PROJECT_NAME=paibot-probe sh deploy/sicherung.sh zurueckspielen \
     ~/paibot-sicherungen/paibot-sicherung-<Zeit> --env-datei deploy/.env.probe
   ```

   Der Befehl startet die Datenbank der Probe, spielt die Sicherung ein, vergleicht jede Tabelle mit der Begleit-Datei, lässt den Migrations-Schritt laufen, startet `web` und `worker` und prüft danach alles nach. Erwartet ist am Ende `Ergebnis: Alles aus der Sicherung ist da.`

6. Nachsehen: `curl http://localhost:3001/api/health` meldet `"db":"ok"`. Wer die Probe im Browser ansehen will, öffnet einen Tunnel (`ssh -L 3001:127.0.0.1:3001 server`) und meldet sich unter `http://localhost:3001` mit seinem gewohnten Passwort an.
7. Die Probe wieder entfernen (löscht nur die Probe):

   ```bash
   COMPOSE_PROJECT_NAME=paibot-probe docker compose -f deploy/docker-compose.yml \
     --env-file deploy/.env.probe down -v
   rm deploy/.env.probe
   ```

**Zurückspielen im Ernstfall**

8. Auf dem (neuen) Server PaiBot wie in der [Installation](installation.md) holen und `deploy/.env` aus deiner Aufbewahrung zurücklegen (mindestens dasselbe `PAIBOT_SECRET`; die Passwörter der Datenbank dürfen neu sein). Starten musst du noch nichts.
9. Zurückspielen:

   ```bash
   sh deploy/sicherung.sh zurueckspielen ~/paibot-sicherungen/paibot-sicherung-<Zeit>
   ```

   Das geht nur in eine frische Installation: eine leere Datenbank oder eine, die noch nie eingerichtet wurde. Läuft dort schon eine benutzte Installation, bricht der Befehl ab und nennt den Ausweg (erst sichern, dann `docker compose … down -v`).

10. Später jederzeit nachprüfen, ob der Stand der Sicherung noch vollständig da ist:

    ```bash
    sh deploy/sicherung.sh pruefen ~/paibot-sicherungen/paibot-sicherung-<Zeit>
    ```

**Mit Coolify** (noch nicht auf Coolify durchgespielt)

11. Per SSH auf den Server, einmal die Skripte holen: `git clone --depth 1 https://github.com/oliverhees/paibot paibot-skripte && cd paibot-skripte`.
12. Den Namen des Datenbank-Containers suchen: `docker ps --format '{{.Names}}' | grep postgres` (bei Coolify etwa `postgres-<kennung>`).
13. Sichern: `sh deploy/sicherung.sh sichern --container <name>`. Zurückspielen in eine neu angelegte, noch nicht eingerichtete Ressource: `sh deploy/sicherung.sh zurueckspielen <ordner> --container <name-der-neuen-datenbank>`. Das Skript findet `web`, `worker` und `migrate` über das Compose-Projekt des Containers, hält sie an, spielt ein und startet `migrate`, `web` und `worker` wieder.
14. `PAIBOT_SECRET` steht in Coolify bei der Ressource unter **Environment Variables**: mit `deploy/docker-compose.coolify.yml` als `SERVICE_REALBASE64_32_PAIBOT`, mit `deploy/docker-compose.yml` als `PAIBOT_SECRET`. Kopiere den Wert in deinen Passwort-Manager, nicht neben die Sicherung. Beim Zurückspielen in eine neue Ressource trägst du dort vor dem ersten Deploy genau diesen Wert ein.

Beispiel (alles in einem Rutsch):

```text
sh deploy/sicherung.sh sichern
sh deploy/sicherung.sh zurueckspielen ~/paibot-sicherungen/paibot-sicherung-20261121T082618Z
sh deploy/sicherung.sh pruefen ~/paibot-sicherungen/paibot-sicherung-20261121T082618Z
```

## So sieht es aus

Ohne Oberfläche. Die Befehle zeigen ihr Ergebnis im Terminal. So sieht die Ausgabe aus (aufgenommen mit Beispiel-Daten, Ordner gekürzt):

```text
$ sh deploy/sicherung.sh sichern
PaiBot – sichern nach /root/paibot-sicherungen/paibot-sicherung-20261121T082618Z
✓ Datenbank gesichert: 152456 Byte, SHA-256 a891d7f4cf906c4aa530db4ad2879f4e23bf025b9f597b75251d3d3e98f26d55
✓ Begleit-Datei: /root/paibot-sicherungen/paibot-sicherung-20261121T082618Z/begleit.json
  Die Sicherung enthält deine Unterhaltungen lesbar und ist nicht verschlüsselt.
  PAIBOT_SECRET und deploy/.env sind nicht enthalten: getrennt und sicher aufbewahren.
  Zurückspielen: sh deploy/sicherung.sh zurueckspielen /root/paibot-sicherungen/paibot-sicherung-20261121T082618Z
```

Zurückspielen in eine frische Installation, mit Prüfung am Ende:

```text
$ sh deploy/sicherung.sh zurueckspielen /root/paibot-sicherungen/paibot-sicherung-20261121T082618Z
PaiBot – zurückspielen aus /root/paibot-sicherungen/paibot-sicherung-20261121T082618Z
✓ Prüfsumme der Datei datenbank.dump stimmt (SHA-256).
✓ Ziel-Datenbank ist leer.
Eingespielt. Aktive Läufe, die der Worker beim Start als unterbrochen beendet: 2.
✓ Migrationen: 8 in der Sicherung, 8 in der Datenbank.
✓ Belege: Anfang und Beleg Nr. 3 wie in der Sicherung (3 Belege).
✓ Tabellen: 17 verglichen, gleiche Zeilen wie in der Sicherung.
✓ Migrations-Schritt fertig: Datenbank auf Stand, Rechte der App-Rolle gesetzt.
✓ web und worker laufen.
PaiBot – Sicherung prüfen: /root/paibot-sicherungen/paibot-sicherung-20261121T082618Z
✓ Prüfsumme der Datei datenbank.dump stimmt (SHA-256).
✓ Migrationen: 8 in der Sicherung, 8 in der Datenbank.
✓ Belege: Anfang und Beleg Nr. 3 wie in der Sicherung (3 Belege).
✓ Tabellen: 17 verglichen, 17 mit gleicher Zahl an Zeilen.
  Belege-Kette gültig: 3 Einträge geprüft.
  Letzter Eintrag: 3 (sha256:6833b36be17be6ca98169fa3449646efb4378c90bcc62c861b617f3d71e157b3)
  Kette gültig, alle Schlüssel aus der Kette.
✓ Belege-Kette geprüft, gegen den Anker aus der Begleit-Datei.
Ergebnis: Alles aus der Sicherung ist da.
```

In eine benutzte Installation spielt der Befehl nichts ein:

```text
Die Datenbank dieser Installation ist nicht leer (Einrichtung abgeschlossen, public.belege (3), …).
Zurückspielen geht nur in eine frische Installation, damit nichts überschrieben wird.
Ausweg: 1. diese Installation erst sichern (sh deploy/sicherung.sh sichern),
        2. Stack samt Volume löschen: docker compose … down -v,
        3. die Sicherung erneut zurückspielen (startet die Datenbank selbst).
```

## Einstellungen

| Einstellung                  | Wo                       | Bedeutung                                                                            | Standard                           |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------- |
| `--image`                    | Befehl                   | fertiges Image: `deploy/docker-compose.image.yml`                                    | eigener Bau (`docker-compose.yml`) |
| `--compose-datei <datei>`    | Befehl, mehrfach möglich | andere Compose-Datei(en)                                                             | `deploy/docker-compose.yml`        |
| `--env-datei <datei>`        | Befehl                   | Einstellungen der Installation                                                       | `deploy/.env`                      |
| `--container <name>`         | Befehl                   | ohne Compose-Datei direkt mit dem Container der Datenbank (z. B. Coolify)            | aus                                |
| `--ziel <ordner>`            | Befehl `sichern`         | wohin die Sicherung kommt                                                            | `~/paibot-sicherungen`             |
| `--ohne-start`               | Befehl `zurueckspielen`  | nur einspielen und vergleichen, nichts starten                                       | aus                                |
| `COMPOSE_PROJECT_NAME`       | Umgebungsvariable        | Name des Stacks, z. B. für die Probe-Wiederherstellung neben der echten Installation | `paibot`                           |
| `PAIBOT_SICHERUNG_WARTEZEIT` | Umgebungsvariable        | Sekunden, die der Befehl auf Datenbank, `migrate`, `web` und `worker` wartet         | `240`                              |
| `PAIBOT_BELEGE_PRUEFER`      | Umgebungsvariable        | Pfad zu einem fertigen Prüfer `belege-pruefen.mjs`, statt ihn selbst zu bauen        | leer                               |

Exit-Codes: `0` in Ordnung, `1` Fehler oder Abweichung, `2` falscher Aufruf, `3` die Ziel-Datenbank ist nicht frisch.

## So funktioniert es

Beteiligt sind zwei Skripte: `deploy/sicherung.sh` läuft auf dem Server und steuert Docker; `deploy/sicherung-db.sh` reicht es als Text in den Container `postgres` und führt dort `pg_dump`, `pg_restore` und `psql` aus.

**Was in der Sicherung steht:** die Schemas der App im eigenen Format von `pg_dump`: `public` (Tabellen der App, Belege, Regeln, Schlüssel nur verschlüsselt) und `drizzle` (Stand der Migrationen). Nicht dabei sind das Schema der Warteschlange (`pgboss`), die Quarantäne (`paibot_quarantaene`, siehe [Sicherheit](sicherheit.md)) und alles, was jemand sonst in der Datenbank angelegt hat. Offene Aufträge der Warteschlange werden bewusst nicht gesichert: Sonst würde eine zurückgespielte Installation alte Anfragen später noch einmal an deinen Anbieter schicken, bei einer Probe-Wiederherstellung sogar doppelt. Die Warteschlange legt sich beim Start selbst neu an.

**Sichern liest nur:** Das Skript legt einmal die Rolle `paibot_sicherung` an. Sie kann sich nicht anmelden, hat kein Passwort und darf nur lesen (Mitglied von `pg_read_all_data`); benutzt wird sie über `SET ROLE`. Die Zeilen je Tabelle in der Begleit-Datei und der Dump kommen aus demselben Snapshot der Datenbank, passen also genau zueinander, auch wenn PaiBot währenddessen weiterläuft. Danach liest das Skript das Inhaltsverzeichnis der Datei einmal zur Probe. Ordner und Dateien sind nur für den Besitzer lesbar (`700` und `600`).

**Zurückspielen** nutzt im Container den Zugang der Migrations-Rolle (`POSTGRES_USER`) nur zum Vorbereiten, Prüfen und Aufräumen. Eingespielt wird die Datei mit einer eigenen Rolle nur für diesen Lauf:

1. Prüfsumme der Datei gegen die Begleit-Datei.
2. Zustand der Ziel-Datenbank: `leer`, `frisch` (migriert, aber nie eingerichtet: außer Standard-Regeln, Einrichtungs-Code, Fehlversuchen und dem Zustand der Datenschleuse leer; dann wird sie vorher geleert) oder benutzt (dann Abbruch).
3. `web` und `worker` anhalten, die Sicherung in einer einzigen Transaktion einspielen (`pg_restore --single-transaction`), und zwar nur die Schemas `public` und `drizzle`. Das übernimmt eine Rolle `paibot_einspielen_…`, die das Skript dafür anlegt: Anmeldung mit einem Einmal-Passwort, kein Superuser, darf keine Rollen und keine Datenbanken anlegen, nur Objekte in dieser einen Datenbank. Was die Datei beim Einspielen ausführen will, läuft also nur mit diesen Rechten; Befehle auf dem Server (`COPY … TO PROGRAM`), Dateien schreiben oder neue Rollen anlegen scheitern.
4. Inhalt prüfen, bevor irgendetwas anderes mit der Datenbank arbeitet: In `public` und `drizzle` darf nur liegen, was die Migrationen von PaiBot anlegen. Funktionen nur mit dem Namen und genau dem Rumpf aus den Migrationen; Prüfregeln, Standardwerte, Indizes und Trigger-Bedingungen nur mit den eingebauten Funktionen, die PaiBot selbst nutzt; keine Sichten, Zeilen-Regeln, eigenen Typen, Operatoren oder Umwandlungen; die Rolle des Einspielens besitzt sonst nichts. Findet das Skript etwas anderes, nennt es die Stellen, leert die Datenbank wieder und bricht mit Exit-Code 4 ab. Sonst gehen alle Objekte an die Migrations-Rolle, und die Rolle des Einspielens wird gelöscht.
5. Läufe, die beim Sichern gerade liefen oder warteten, werden zum Aufräumen freigegeben. Der Worker beendet sie beim Start als „unterbrochen“ und schreibt zu einer offenen Entscheidung im Tor das Ergebnis als Beleg. So bleibt keine Unterhaltung gesperrt.
6. Vergleich mit der Begleit-Datei: jede Tabelle mit derselben Zahl an Zeilen, gleicher Stand der Migrationen, gleicher Anfang und Kopf der Belege-Kette. Weicht etwas ab, startet nichts.
7. Start: `migrate` bringt die Datenbank auf den Stand des Codes (auch wenn die Sicherung von einer älteren Version stammt) und setzt Rechte, Einstellungen und Passwort der App-Rolle neu; danach starten `web` und `worker`.
8. Prüfen (wie `pruefen`): Prüfsumme, Migrationen nicht älter als in der Sicherung, Belege bis zum Kopf der Sicherung unverändert, und die ganze Kette mit dem eigenständigen Prüfer `belege-pruefen.mjs` gegen den Anker aus der Begleit-Datei. Der Prüfer läuft in einem Node-Container ohne Netz. Fehlt er, baut ein Wegwerf-Container ihn einmal aus dem Quellcode in diesem Ordner (dafür braucht der Server beim ersten Mal Internet).

**Was an `PAIBOT_SECRET` hängt:** Aus `PAIBOT_SECRET` leitet PaiBot vier Schlüssel ab ([Sicherheit](sicherheit.md#so-funktioniert-es)). Mit einem anderen Wert nach dem Zurückspielen gilt:

| Was                                    | mit anderem `PAIBOT_SECRET`                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| gespeicherte Schlüssel deiner Anbieter | nicht lesbar (`entschluesseln_fehlgeschlagen`); Modell-Aufrufe scheitern, bis du die Schlüssel neu einträgst |
| privater Signaturschlüssel der Belege  | nicht lesbar; Läufe und Aktionen, die einen neuen Beleg brauchen, scheitern                                  |
| Prüfsummen von Inhalten in Belegen     | passen nicht mehr zum Schlüssel; die Prüfung „Inhalt gegen Beleg“ schlägt fehl                               |
| Prüfzeichen und bekannte Geräte        | neu; offene Seiten neu laden, bekannte Geräte gelten wieder als unbekannt                                    |
| Passwort, Anmeldungen, Belege-Kette    | unabhängig davon: Anmeldung geht, die Kette bleibt mit den öffentlichen Schlüsseln prüfbar                   |

Darum: `PAIBOT_SECRET` immer mit aufbewahren, aber nie neben der Sicherung.

## Grenzen

- Die Sicherungs-Datei ist **nicht verschlüsselt** und enthält deine Unterhaltungen lesbar (Anbieter-Schlüssel und Signaturschlüssel nur verschlüsselt, das Passwort nur als Hash). Schütze sie wie ein Passwort: verschlüsselter Speicher, nur du hast Zugriff, oder vor dem Hochladen selbst verschlüsseln (z. B. mit `gpg --symmetric`; nicht Teil von PaiBot).
- **Spiel nur Sicherungen zurück, die du selbst angelegt und sicher aufbewahrt hast.** Eine fremde oder veränderte Sicherung kann beim Einspielen eigene Anweisungen mitbringen. Das Skript spielt sie ohne Superuser-Rechte ein und weist ab, was PaiBot nicht selbst anlegt; ihre Daten (Unterhaltungen, Einstellungen, Anbieter) übernimmt es aber so, wie sie in der Datei stehen. Die Prüfsumme in der Begleit-Datei schützt nur vor Beschädigung, nicht vor Absicht: Wer die Datei ändert, kann auch die Begleit-Datei ändern.
- Zurückspielen geht nur in eine leere oder nie eingerichtete Installation, nie über eine benutzte hinweg.
- Offene Aufträge der Warteschlange werden nicht zurückgespielt; Läufe, die beim Sichern aktiv waren, enden als „unterbrochen“.
- Eine Sicherung von einer **neueren** Version lässt sich nicht in eine ältere zurückspielen (die ältere startet dann mit „Datenbank nicht auf Stand“ nicht).
- Die Konfiguration der Datenschleuse (`deploy/schleuse/`) und ihr Zwischenstand im Speicher gehören nicht zur Sicherung; die Konfiguration legst du wie bei der [Installation](funktion-datenschleuse.md#so-benutzt-du-es) neu an.
- Kein Zeitplan eingebaut: Regelmäßig sichern geht z. B. mit `cron` auf dem Server. Alte Sicherungen räumt der Befehl nicht weg.
- Mit Coolify noch nicht durchgespielt (siehe oben).

## Fehlerbehebung

| Beobachtung                                                                 | Ursache                                                                        | Was tun                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `Sichern gescheitert. Läuft der Dienst postgres?`                           | Datenbank-Container läuft nicht                                                | `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d`, dann erneut sichern                |
| `deploy/.env fehlt`                                                         | Befehl nicht im Ordner von PaiBot oder andere Datei                            | in den Ordner wechseln oder `--env-datei <datei>`; bei Coolify `--container <name>`                            |
| `Prüfsumme der Datei datenbank.dump stimmt nicht`                           | Datei beim Kopieren beschädigt oder verändert                                  | Ordner erneut kopieren oder eine andere Sicherung nehmen                                                       |
| `Die Datenbank dieser Installation ist nicht leer` (Exit-Code 3)            | Ziel ist eine benutzte Installation                                            | erst sichern, dann `docker compose … down -v` und erneut zurückspielen                                         |
| `pg_restore ist gescheitert`                                                | Datei passt nicht zur Datenbank (z. B. ältere Postgres-Version)                | Meldung darüber lesen; die Datenbank bleibt leer, nichts ist halb eingespielt                                  |
| `Die Sicherung enthält Teile, die PaiBot nicht selbst anlegt` (Exit-Code 4) | Datei stammt nicht von `sicherung.sh` dieser Installation oder wurde verändert | nicht erneut versuchen; eine eigene, sicher aufbewahrte Sicherung nehmen. Die Datenbank ist wieder leer        |
| `Migrations-Schritt gescheitert`                                            | Sicherung ist neuer als der Code oder Werte in `.env` fehlen                   | Log von `migrate` lesen; Code auf dieselbe oder eine neuere Version bringen                                    |
| `Belege-Kette NICHT geprüft: Der Prüfer ließ sich nicht bauen`              | kein Internet beim ersten Bau des Prüfers                                      | einmal mit Internet wiederholen, oder in der App unter Belege exportieren und mit `pnpm belege:pruefen` prüfen |
| `✗ Belege-Kette: Prüfung fehlgeschlagen`                                    | Belege in der Datenbank verändert                                              | die Zeilen darüber nennen den Beleg; mit einer älteren Sicherung vergleichen ([Belege](funktion-belege.md))    |
| Nach dem Zurückspielen lässt sich kein Anbieter mehr nutzen                 | anderes `PAIBOT_SECRET` als beim Sichern                                       | das alte `PAIBOT_SECRET` in `deploy/.env` setzen und neu starten; sonst die Schlüssel neu eintragen            |

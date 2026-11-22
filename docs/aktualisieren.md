<!--
PaiBot – auf eine neue Version wechseln: mit eigenem Bau oder mit fertigem Image.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Aktualisieren

**Ergebnis:** Deine Installation läuft auf der neuen Version, deine Daten sind auf dem neuen Stand, und du hast vorher eine Sicherung, mit der du zurück kannst.

Es gibt zwei Wege, je nachdem, wie du PaiBot installiert hast:

| Du hast installiert …                                  | Weg                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| aus dem Quellcode (`docker compose … up -d --build`)   | [Mit eigenem Bau](#mit-eigenem-bau)                                                                |
| mit fertigem Image (`deploy/docker-compose.image.yml`) | [Mit fertigem Image](#mit-fertigem-image)                                                          |
| mit Coolify                                            | wie „mit eigenem Bau“, Coolify baut nach dem Wechsel des Stands neu ([Coolify](deploy-coolify.md)) |

Bei beiden Wegen gilt: Die Datenbank bringt der Einmal-Dienst `migrate` auf den neuen Stand, bevor `web` und `worker` starten. Du rufst dafür nichts selbst auf.

## 1. Vorher sichern

Lege vor jedem Wechsel eine Sicherung an:

```bash
sh deploy/sicherung.sh sichern
```

Mit fertigem Image hängst du `--image` an. Der Befehl legt unter `~/paibot-sicherungen/` einen Ordner mit der Datenbank und einer Begleit-Datei an (Version, Stand der Migrationen, Prüfsumme, Anker der Belege-Kette). Alles Weitere, auch wie du die Sicherung vorher zur Probe zurückspielst: [Sicherung und Wiederherstellung](sicherung.md).

Die Sicherung enthält deine Unterhaltungen lesbar. Behandle sie wie ein Passwort und lege `PAIBOT_SECRET` nicht daneben ab (siehe [Sicherheit](sicherheit.md#was-in-der-datenbank-steht)). Ohne das `PAIBOT_SECRET` deiner Installation lassen sich die gespeicherten Schlüssel aus der Sicherung nicht nutzen.

## Mit eigenem Bau

1. Sicherung anlegen (oben).
2. Den Stand der neuen Version holen, zum Beispiel `v0.3.0`:

   ```bash
   git fetch --tags
   git checkout v0.3.0
   ```

3. Prüfe, ob die neue Version neue Einträge in `deploy/.env` braucht: Vergleiche deine Datei mit `deploy/.env.example` der neuen Version. Neue Werte trägst du von Hand nach; vorhandene Werte (vor allem `PAIBOT_SECRET` und die Passwörter der Datenbank) änderst du nicht.
4. Neu bauen und starten:

   ```bash
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
   ```

   Docker baut das neue Image, `migrate` läuft einmal und endet mit `Exited (0)`, danach starten `web` und `worker` neu.

5. Prüfen:

   ```bash
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps -a
   curl http://localhost:3000/api/health
   ```

   Erwartet: `web` und `worker` stehen auf `healthy`, `migrate` auf `Exited (0)`, und die Statusprüfung meldet `"status":"ok"`.

## Mit fertigem Image

1. Sicherung anlegen (oben).
2. Den Ordner `deploy/` auf den Stand der neuen Version bringen, damit Compose-Datei und Version zusammenpassen:

   ```bash
   git fetch --depth 1 origin tag v0.3.0
   git checkout v0.3.0
   ```

3. In `deploy/.env` `PAIBOT_VERSION` auf die neue Version setzen, zum Beispiel `PAIBOT_VERSION=0.3.0` (oder mit Digest, siehe [Fest auf ein Image pinnen](installation.md#fest-auf-ein-image-pinnen)). Neue Einträge aus `deploy/.env.example` trägst du wie oben nach.
4. Starten:

   ```bash
   docker compose -f deploy/docker-compose.image.yml --env-file deploy/.env up -d
   ```

   Docker lädt das neue Image, `migrate` bringt die Datenbank auf Stand, danach starten `web` und `worker` neu.

5. Prüfen wie oben, mit `deploy/docker-compose.image.yml`.

Die Datenschleuse (Profil `schleuse`) wird auch auf diesem Weg aus einem festen Commit gebaut, weil es von ihr noch kein fertiges Image gibt.

## Zurück auf die alte Version

Eine Datenbank, die schon auf der neueren Version lief, passt nicht mehr zur älteren: Die ältere Version meldet dann im Log „Datenbank nicht auf Stand“ und startet nicht. Das gilt auch für den Wechsel auf den Stand mit der Datenbank für Apps: Danach gibt es kein Zurück auf eine ältere Version ohne die Sicherung von vorher, also mach sie vor dem Wechsel. Zurück geht es nur mit der Sicherung von vorher:

1. Möchtest du den Stand der neueren Version behalten, sichere ihn zuerst (`sh deploy/sicherung.sh sichern`).
2. Den alten Stand holen (`git checkout v<alte Version>`, bei fertigem Image zusätzlich `PAIBOT_VERSION` zurücksetzen).
3. Stack samt Datenbank löschen (die Sicherungen bleiben, sie liegen außerhalb):

   ```bash
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env down -v
   ```

4. Die Sicherung von vorher zurückspielen; der Befehl startet danach alles und prüft nach:

   ```bash
   sh deploy/sicherung.sh zurueckspielen ~/paibot-sicherungen/paibot-sicherung-<Zeit>
   ```

Mit fertigem Image steht in Schritt 3 `deploy/docker-compose.image.yml`, und in Schritt 4 hängst du `--image` an.

## Fehlerbehebung

| Beobachtung                                               | Ursache                                                | Was tun                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `migrate` endet nicht mit `Exited (0)`                    | die Migration ist gescheitert (Log von `migrate`)      | `… logs migrate` lesen; `web` und `worker` starten erst, wenn `migrate` durchläuft |
| „Datenbank nicht auf Stand“                               | die Version ist älter als die Datenbank                | neuere Version starten oder die Sicherung von vorher einspielen (oben)             |
| „PAIBOT_VERSION fehlt“                                    | beim fertigen Image fehlt die Version in `deploy/.env` | `PAIBOT_VERSION=<Version>` eintragen                                               |
| „manifest unknown“ oder „not found“ beim Laden des Images | diese Version gibt es (noch) nicht als Image           | Version prüfen; sonst mit eigenem Bau aktualisieren                                |
| Nach dem Wechsel lässt sich kein Schlüssel mehr nutzen    | `PAIBOT_SECRET` wurde geändert                         | den alten Wert aus deiner Aufbewahrung zurück in `deploy/.env` setzen              |

Mehr zur Installation: [Installation](installation.md).

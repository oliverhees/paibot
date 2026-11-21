<!--
PaiBot – Anleitung für den Betrieb mit Docker Compose, lokal und auf dem Server.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-07
-->

# Deployment

PaiBot läuft als Docker-Compose-Stack: Postgres, der Einmal-Dienst für die Migrationen, die Web-App und der Worker. Die Datenschleuse lässt sich als Profil `schleuse` zuschalten (Standard: aus). Der Browser-Dienst kommt später dazu.

| Dienst              | Aufgabe                                                    | Erreichbar                                     |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `postgres`          | Datenbank                                                  | nur im internen Netz `paibot-intern`           |
| `migrate`           | einmal je Start: Migrationen, App-Rolle einrichten, Ende   | kein Port; nur Netz `paibot-intern`            |
| `web`               | PaiBot-App (Next.js)                                       | `127.0.0.1:3000`, nach außen über deine Domain |
| `worker`            | holt Aufträge ab; die Ausführung der Antworten folgt       | kein Port; Netz `paibot-intern` und nach außen |
| `datenschleuse`     | nur mit Profil `schleuse`: maskiert Anfragen an das Modell | kein Port; nur der Worker erreicht sie         |
| `schleuse-analyzer` | nur mit Profil `schleuse`: erkennt Namen, Orte, Nummern    | kein Port; nur die Datenschleuse erreicht ihn  |

`migrate`, `web` und `worker` kommen aus demselben Image. Die Variable `PAIBOT_ROLE` (`migrate`, `web` oder `worker`) wählt, was startet. Nur `migrate` bekommt die Zugangsdaten des Tabellen-Besitzers (`DATABASE_MIGRATION_URL`); er beendet sich nach getaner Arbeit mit Exit 0. `web` und `worker` starten erst danach (`service_completed_successfully`) und bekommen nur die eingeschränkte Rolle der Datenbank (`DATABASE_URL`). Speicher-Grenzen: `PAIBOT_WEB_SPEICHER` (768m), `PAIBOT_WORKER_SPEICHER` (512m), `PAIBOT_MIGRATE_SPEICHER` (384m).

## Lokal testen

```bash
sh deploy/env-erzeugen.sh               # deploy/.env mit Zufallswerten
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
curl http://localhost:3000/api/health  # {"status":"ok","db":"ok",...}
docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps -a   # web und worker „healthy“, migrate „Exited (0)“
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs worker
```

Nur die Datenbank für die Entwicklung starten (mit Port auf `127.0.0.1`, über den Zusatz `docker-compose.entwicklung.yml`) und die App mit `pnpm dev` laufen lassen:

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.entwicklung.yml \
  --env-file deploy/.env up -d postgres
cp apps/web/.env.example apps/web/.env.local   # Passwörter aus deploy/.env eintragen
pnpm dev
```

| Datei                              | Inhalt                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `docker-compose.yml`               | Betrieb: internes Netz für die Datenbank, gehärtete Container, Healthchecks |
| `docker-compose.image.yml`         | wie `docker-compose.yml`, aber mit fertigem Image (`PAIBOT_VERSION`)        |
| `docker-compose.entwicklung.yml`   | nur Entwicklung: Datenbank-Port auf `127.0.0.1`                             |
| `env-erzeugen.sh`                  | legt `deploy/.env` mit zufälligen Passwörtern und `PAIBOT_SECRET` an        |
| `docker-compose.schleuse-test.yml` | nur Tests: Datenschleuse mit Test-Anbieter auf `127.0.0.1`                  |
| `schleuse/`                        | Konfiguration der Datenschleuse, erzeugt mit `pnpm schleuse:config`         |
| `.env.example`                     | Vorlage mit allen Variablen (Werte leer)                                    |

Variablen und Rollen der Datenbank: [docs/installation.md](../docs/installation.md#einstellungen).

Datenschleuse zuschalten: [docs/funktion-datenschleuse.md](../docs/funktion-datenschleuse.md).

## Mit Coolify auf deinem Server

Ausführlich: [docs/deploy-coolify.md](../docs/deploy-coolify.md).

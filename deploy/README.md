<!--
PaiBot – Anleitung für den Betrieb mit Docker Compose, lokal und auf dem Server.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-07
-->

# Deployment

PaiBot läuft als Docker-Compose-Stack. Aktuell: Postgres, die Web-App und der Worker. Weitere Dienste (Datenschleuse, Browser-Dienst) kommen dazu.

| Dienst     | Aufgabe                                                    | Erreichbar                                     |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `postgres` | Datenbank                                                  | nur im internen Netz `paibot-intern`           |
| `web`      | PaiBot-App (Next.js), wendet beim Start die Migrationen an | `127.0.0.1:3000`, nach außen über deine Domain |
| `worker`   | führt die Antworten deines Bots im Hintergrund aus         | kein Port; Netz `paibot-intern` und nach außen |

`web` und `worker` kommen aus demselben Image. Die Variable `PAIBOT_ROLE` (`web` oder `worker`) wählt, was startet. Der Worker startet erst, wenn `web` gesund ist, und bekommt nur die eingeschränkte Rolle der Datenbank (`DATABASE_URL`), nie `DATABASE_MIGRATION_URL`.

## Lokal testen

```bash
sh deploy/env-erzeugen.sh               # deploy/.env mit Zufallswerten
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
curl http://localhost:3000/api/health  # {"status":"ok","db":"ok",...}
docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps   # web und worker „healthy“
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs worker
```

Nur die Datenbank für die Entwicklung starten (mit Port auf `127.0.0.1`, über den Zusatz `docker-compose.entwicklung.yml`) und die App mit `pnpm dev` laufen lassen:

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.entwicklung.yml \
  --env-file deploy/.env up -d postgres
cp apps/web/.env.example apps/web/.env.local   # Passwörter aus deploy/.env eintragen
pnpm dev
```

| Datei                            | Inhalt                                                                      |
| -------------------------------- | --------------------------------------------------------------------------- |
| `docker-compose.yml`             | Betrieb: internes Netz für die Datenbank, gehärtete Container, Healthchecks |
| `docker-compose.entwicklung.yml` | nur Entwicklung: Datenbank-Port auf `127.0.0.1`                             |
| `env-erzeugen.sh`                | legt `deploy/.env` mit zufälligen Passwörtern und `PAIBOT_SECRET` an        |
| `.env.example`                   | Vorlage mit allen Variablen (Werte leer)                                    |

Variablen und Rollen der Datenbank: [docs/installation.md](../docs/installation.md#einstellungen).

## Mit Coolify auf deinem Server

Ausführlich: [docs/deploy-coolify.md](../docs/deploy-coolify.md).

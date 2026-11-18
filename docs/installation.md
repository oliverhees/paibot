<!--
PaiBot – Installation mit Docker Compose, lokal und auf dem Server.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-18
-->

# Installation

**Ergebnis:** PaiBot läuft bei dir, und `/api/health` meldet `"db":"ok"`.

Der offizielle Weg ist **Docker Compose**. Das gilt lokal und auf dem Server. Alle Dienste stehen in `deploy/docker-compose.yml`.

## Was du brauchst

| Wofür               | Voraussetzung                                                             |
| ------------------- | ------------------------------------------------------------------------- |
| Lokal und Server    | Docker mit dem Compose-Plugin                                             |
| Server (empfohlen)  | Server mit Rechenzentrum in der EU, Ubuntu LTS, mind. 2 vCPU und 4 GB RAM |
| Entwicklung am Code | Node.js 22 und pnpm 10                                                    |

## Was heute mitläuft

| Dienst     | Aufgabe                                                    | Erreichbar                                     |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `postgres` | Datenbank                                                  | nur auf dem Rechner selbst (`127.0.0.1`)       |
| `web`      | PaiBot-App (Next.js), wendet beim Start die Migrationen an | `127.0.0.1:3000`, nach außen über deine Domain |

Weitere Dienste (Datenschleuse, Hintergrund-Jobs, Browser-Dienst) sind **geplant** und noch nicht Teil des Stacks.

## Lokal mit Docker Compose

```bash
git clone https://github.com/oliverhees/paibot.git
cd paibot
cp deploy/.env.example deploy/.env      # POSTGRES_PASSWORD setzen
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
curl http://localhost:3000/api/health
```

Erwartet: `{"status":"ok","app":"PaiBot","db":"ok",...}`.

## Auf dem Server

Der Ablauf ist derselbe Stack, nur mit Domain und HTTPS davor. Schritt für Schritt mit Coolify: [deploy-coolify.md](deploy-coolify.md). Coolify ist bequem, aber nicht nötig: Wer einen eigenen Reverse-Proxy nutzt, startet denselben Compose-Stack und leitet seine Domain auf Port 3000 des Dienstes `web`.

Die Ports von Datenbank und Web-App sind absichtlich nur an `127.0.0.1` gebunden. Von außen erreichst du PaiBot nur über den Proxy mit HTTPS.

## Einstellungen

Alle Werte stehen in `deploy/.env` (Vorlage: `deploy/.env.example`). Diese Datei wird nie committet.

| Variable            | Bedeutung                           | Standard                |
| ------------------- | ----------------------------------- | ----------------------- |
| `POSTGRES_PASSWORD` | Passwort der Datenbank, **Pflicht** | keiner                  |
| `POSTGRES_USER`     | Datenbank-Benutzer                  | `paibot`                |
| `POSTGRES_DB`       | Name der Datenbank                  | `paibot`                |
| `APP_URL`           | öffentliche Adresse der App         | `http://localhost:3000` |
| `WEB_PORT`          | Port der Web-App auf dem Rechner    | `3000`                  |

Die Details zu Compose stehen in [deploy/README.md](../deploy/README.md).

## Nur entwickeln

Datenbank per Docker, App direkt mit pnpm:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d postgres
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm dev
```

## Fehlerbehebung

| Beobachtung                   | Ursache                                     | Was tun                                                     |
| ----------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Compose bricht mit „fehlt“ ab | `POSTGRES_PASSWORD` nicht gesetzt           | in `deploy/.env` eintragen                                  |
| `"db":"down"`, HTTP 503       | App läuft, Datenbank nicht erreichbar       | Logs von `postgres` und `web` prüfen, Passwort vergleichen  |
| `"db":"not_configured"`       | `DATABASE_URL` fehlt (z. B. bei `pnpm dev`) | `apps/web/.env.local` aus `apps/web/.env.example` anlegen   |
| keine Antwort                 | Port, Domain oder Proxy falsch              | `WEB_PORT`, DNS und Domain-Eintrag beim Dienst `web` prüfen |

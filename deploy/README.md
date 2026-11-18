# Deployment

PaiBot läuft als Docker-Compose-Stack. Aktuell: Postgres und die Web-App. Weitere Dienste (Datenschleuse, Inngest, Browser-Dienst) kommen dazu.

| Dienst     | Aufgabe                                                    | Erreichbar                                     |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `postgres` | Datenbank                                                  | nur intern bzw. `127.0.0.1`                    |
| `web`      | PaiBot-App (Next.js), wendet beim Start die Migrationen an | `127.0.0.1:3000`, nach außen über deine Domain |

## Lokal testen

```bash
cp deploy/.env.example deploy/.env      # Passwort setzen
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
curl http://localhost:3000/api/health  # {"status":"ok","db":"ok",...}
```

Nur die Datenbank für die Entwicklung starten und die App mit `pnpm dev` laufen lassen:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d postgres
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

## Mit Coolify auf deinem Server

Ausführlich: [docs/deploy-coolify.md](../docs/deploy-coolify.md).

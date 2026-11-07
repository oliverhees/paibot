# Paibot mit Coolify betreiben

Ziel von Folge 2: Paibot läuft auf deinem eigenen Server in der EU, unter deiner Domain mit HTTPS, und `/api/health` meldet `"db":"ok"`.

## 1. Server

- Ein Server bei einem Hoster mit Rechenzentrum in der EU
- Betriebssystem: aktuelles Ubuntu LTS
- Für den Start reicht ein kleiner Server; die tatsächlich nötige Größe messen wir in der Folge. Später brauchen vor allem Browser-Sitzungen Arbeitsspeicher.
- Eine Domain oder Subdomain (z. B. `paibot.deine-domain.de`), deren A-Record auf die Server-IP zeigt

## 2. Coolify installieren

Installiere Coolify nach der offiziellen Anleitung unter https://coolify.io/docs (Installationsskript per SSH als root). Danach ist die Oberfläche unter `http://<server-ip>:8000` erreichbar. Lege dort dein Admin-Konto an und sichere die Oberfläche mit einer eigenen Domain und HTTPS ab.

## 3. Paibot als Ressource anlegen

1. In Coolify ein Projekt anlegen, z. B. „Paibot“.
2. Neue Ressource → aus dem öffentlichen GitHub-Repo `https://github.com/oliverhees/paibot` → Build-Art **Docker Compose**.
3. Compose-Datei: `deploy/docker-compose.yml`, Branch `main`.
4. Umgebungsvariablen setzen:
   - `POSTGRES_PASSWORD`: langes Zufallspasswort
   - `APP_URL`: `https://paibot.deine-domain.de`
5. Beim Dienst `web` die Domain eintragen (Port 3000). Coolify besorgt das HTTPS-Zertifikat.
6. Die Portfreigaben aus der Compose-Datei braucht Coolify nicht; Postgres bleibt ohnehin intern.
7. Deploy starten.

## 4. Prüfen

```bash
curl https://paibot.deine-domain.de/api/health
```

Erwartet: `{"status":"ok","app":"Paibot","db":"ok",...}`.

| Ergebnis                | Bedeutung                             | Was tun                                                               |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| `"db":"ok"`             | alles läuft                           | –                                                                     |
| `"db":"down"`, HTTP 503 | App läuft, Datenbank nicht erreichbar | Logs von `postgres` und `web` in Coolify prüfen, Passwort vergleichen |
| keine Antwort           | Domain, DNS oder Proxy falsch         | A-Record und Domain-Eintrag beim Dienst `web` prüfen                  |

## 5. Danach

- Backups der Datenbank einrichten (Ziel: S3-kompatibler Speicher in der EU)
- Automatische Deploys bei Push auf `main` aktivieren, wenn gewünscht

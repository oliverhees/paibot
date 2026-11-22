# PaiBot – baut die Web-App als schlankes Produktions-Image.
#
# Autor:     Oliver Hees
# Website:   https://paibot.de
# Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
# Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
# Seit:      2026-11-07

# Baut das PaiBot-Image mit drei Rollen: Web-App (Next.js), Worker (ein gebündeltes Skript) und
# migrate (Einmal-Schritt: Migrationen und App-Rolle einrichten, danach Ende mit Exit 0).
# Die Rolle wählt PAIBOT_ROLE: web (Standard), worker oder migrate.
# Build-Kontext ist das Repo-Wurzelverzeichnis: docker build -f apps/web/Dockerfile .
# Basis-Images sind per Digest fest; der Tag steht zur Lesbarkeit davor.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
# corepack kommt nicht mehr mit Node 26: feste Fassung aus deploy/corepack (Prüfsummen, keine Skripte).
COPY deploy/corepack/package.json deploy/corepack/package-lock.json /opt/corepack/
RUN npm ci --prefix /opt/corepack --no-audit --no-fund --ignore-scripts
ENV PATH=/opt/corepack/node_modules/.bin:$PATH
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Text-Index der Doku dieser Version; der Bau bricht ab, wenn er fehlt oder leer ist.
RUN pnpm doku:index
RUN pnpm --filter @paibot/web build
RUN pnpm --filter @paibot/worker build

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS run
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/packages/db/drizzle \
    NEXT_TELEMETRY_DISABLED=1 \
    PAIBOT_ROLE=web \
    PAIBOT_DOKU_INDEX=/app/doku-index/doku-index.json \
    PAIBOT_WORKER_HEALTH_FILE=/tmp/paibot-worker.herzschlag
WORKDIR /app
RUN addgroup -S paibot && adduser -S paibot -G paibot
COPY --from=build --chown=paibot:paibot /app/apps/web/.next/standalone ./
COPY --from=build --chown=paibot:paibot /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=paibot:paibot /app/apps/web/public ./apps/web/public
COPY --from=build --chown=paibot:paibot /app/packages/db/drizzle ./packages/db/drizzle
# Der Worker ist eine einzelne Datei ohne eigene node_modules (pg-native bleibt bewusst draußen).
COPY --from=build --chown=paibot:paibot /app/apps/worker/dist/worker.mjs ./apps/worker/dist/worker.mjs
# Index der Doku dieser Version (eine Kopie für Web und Worker); gehört root und ist nur lesbar,
# damit die App ihn zur Laufzeit nicht ändern kann. Der Ordner wird vorher angelegt: Sonst
# bekäme er die Rechte der Datei und wäre für die App nicht zu betreten.
RUN mkdir -p /app/doku-index && chmod 0555 /app/doku-index
COPY --from=build --chown=root:root --chmod=0444 /app/doku-index/doku-index.json ./doku-index/doku-index.json
USER paibot
# Läuft als Nicht-Root und verträgt ein schreibgeschütztes Dateisystem (read_only im Compose);
# beschreibbar sind nur /tmp und der Cache von Next.js (tmpfs).
EXPOSE 3000
# web: Health-Endpunkt. worker: hat keinen Port; gesund, solange er seine Herzschlag-Datei
# in den letzten 30 Sekunden geschrieben hat.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD if [ "$PAIBOT_ROLE" = "worker" ]; then \
        [ $(( $(date +%s) - $(stat -c %Y "$PAIBOT_WORKER_HEALTH_FILE" 2>/dev/null) )) -lt 30 ]; \
      else wget -qO- http://127.0.0.1:3000/api/health >/dev/null; fi || exit 1
# exec ersetzt die Shell, damit SIGTERM direkt bei Node ankommt.
# migrate nutzt denselben Einstieg wie web; der Start-Schritt beendet den Prozess, bevor der
# Server Anfragen annimmt.
CMD ["sh", "-c", "case \"$PAIBOT_ROLE\" in web|migrate) exec node apps/web/server.js ;; worker) exec node apps/worker/dist/worker.mjs ;; *) echo \"[paibot] PAIBOT_ROLE muss web, worker oder migrate sein.\" >&2; exit 64 ;; esac"]

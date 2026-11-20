# PaiBot – baut die Web-App als schlankes Produktions-Image.
#
# Autor:     Oliver Hees
# Website:   https://paibot.de
# Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
# Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
# Seit:      2026-11-07

# Baut die PaiBot-Web-App als schlankes Produktions-Image.
# Build-Kontext ist das Repo-Wurzelverzeichnis: docker build -f apps/web/Dockerfile .
# Basis-Images sind per Digest fest; der Tag steht zur Lesbarkeit davor.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @paibot/web build

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS run
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/packages/db/drizzle \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup -S paibot && adduser -S paibot -G paibot
COPY --from=build --chown=paibot:paibot /app/apps/web/.next/standalone ./
COPY --from=build --chown=paibot:paibot /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=paibot:paibot /app/apps/web/public ./apps/web/public
COPY --from=build --chown=paibot:paibot /app/packages/db/drizzle ./packages/db/drizzle
USER paibot
# Läuft als Nicht-Root und verträgt ein schreibgeschütztes Dateisystem (read_only im Compose);
# beschreibbar sind nur /tmp und der Cache von Next.js (tmpfs).
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]

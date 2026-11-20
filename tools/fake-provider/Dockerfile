# PaiBot – baut den Test-Anbieter als kleines Image für Tests und das Compose-Testprofil.
#
# Autor:     Oliver Hees
# Website:   https://paibot.de
# Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
# Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
# Seit:      2026-11-20

# Build-Kontext ist das Repo-Wurzelverzeichnis:
#   docker build -f tools/fake-provider/Dockerfile -t paibot-fake-provider .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @paibot/fake-provider build

FROM node:22-alpine AS run
ENV NODE_ENV=production \
    FAKE_PROVIDER_HOST=0.0.0.0 \
    FAKE_PROVIDER_PORT=8080
WORKDIR /app
RUN addgroup -S fake && adduser -S fake -G fake
COPY --from=build --chown=fake:fake /app/tools/fake-provider/dist/fake-provider.mjs ./fake-provider.mjs
USER fake
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "fake-provider.mjs"]

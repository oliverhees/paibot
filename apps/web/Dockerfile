# Baut die Paibot-Web-App als schlankes Produktions-Image.
# Build-Kontext ist das Repo-Wurzelverzeichnis: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @paibot/web build

FROM node:22-alpine AS run
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/packages/db/drizzle \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup -S paibot && adduser -S paibot -G paibot
COPY --from=build --chown=paibot:paibot /app/apps/web/.next/standalone ./
COPY --from=build --chown=paibot:paibot /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=paibot:paibot /app/packages/db/drizzle ./packages/db/drizzle
USER paibot
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]

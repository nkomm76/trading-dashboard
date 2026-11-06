# Dividenden-Dashboard als Container: eigenständiger Next.js-Server, läuft als Nutzer ohne Root-Rechte.
# Stufen: deps (Pakete) → build (Next.js-Build) → tools (Migrationen, Notfall-Skripte) und runner (App)

FROM node:26-alpine AS deps
WORKDIR /app
# openssl braucht die Migrations-Engine von Prisma; deren Programmdatei lädt "npm ci" per Install-Skript
RUN apk add --no-cache openssl
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN npx prisma generate && npx next build

# Werkzeuge: Datenbank-Migrationen und "npm run reset-2fa" (volle Pakete, kein Server)
FROM build AS tools
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/robots.txt || exit 1
CMD ["node", "server.js"]

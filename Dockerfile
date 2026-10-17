# syntax=docker/dockerfile:1

# One image, two jobs:
#   - default command runs the Next.js web app
#   - the deploy overrides the command to run DB migrations (node src/db/migrate.mjs)

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app

# --- Build: install all deps and build the app ---
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# --- Production dependencies only (smaller, no build tooling) ---
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

# --- Runtime image ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
# Migration SQL files + the production migration runner
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src/db/migrate.mjs ./src/db/migrate.mjs

USER nextjs
EXPOSE 3000

CMD ["node_modules/.bin/next", "start"]

# Production image for the Vortec Management backend (Express + Prisma).
# Dev workflow (`npm run dev`) is unaffected by this file — see DEC-030.
#
# Keeps devDependencies in the final image (not a pruned/multi-stage
# node_modules) because `tsx` is needed at container start to run
# `prisma/seed.ts`, which isn't part of the `tsc` build output. Acceptable
# image-size trade-off for a small internal tool — revisit if this needs to
# be leaner.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
# prisma/seed.ts imports from ../src (e.g. src/auth.ts) and runs via `tsx`
# directly against the TS source, not the `tsc` output — so `src` has to
# come along too, not just `dist`.
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 4000
# Applies any pending migrations (never `migrate dev` — that's interactive
# and can create new migrations, wrong for a running container), then seeds
# (idempotent — see prisma/seed.ts's per-entity count() guards, safe to run
# on every start), then starts the compiled server.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && node dist/index.js"]

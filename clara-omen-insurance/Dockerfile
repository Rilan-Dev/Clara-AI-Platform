# Clara Omen Insurance — Next.js standalone Dockerfile
# Build context: repository root (.)

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ── Stage 1: Install dependencies ─────────────────────────────────────────
FROM base AS deps
WORKDIR /app/clara-omen-insurance
COPY clara-omen-insurance/package.json clara-omen-insurance/package-lock.json* ./
RUN npm install --ignore-scripts --legacy-peer-deps

# ── Stage 2: Build ────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app/clara-omen-insurance
COPY --from=deps /app/clara-omen-insurance/node_modules ./node_modules
COPY packages /app/packages
COPY clara-omen-insurance ./
ENV NODE_ENV=production
RUN ln -s /app/clara-omen-insurance/node_modules /app/node_modules && npm run build

# ── Stage 3: Production runner ────────────────────────────────────────────
FROM base AS runner
WORKDIR /app/clara-omen-insurance
ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 clarauser

COPY --from=builder /app/clara-omen-insurance/public ./public
COPY --from=builder /app/clara-omen-insurance/.next-app/standalone/clara-omen-insurance ./
COPY --from=builder /app/clara-omen-insurance/.next-app/static ./.next/static

USER clarauser
EXPOSE 3001

CMD ["node", "server.js"]

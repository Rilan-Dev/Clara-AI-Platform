# Clara Backend — Next.js standalone Dockerfile
# This Dockerfile expects the build context to be the repository root (`.`)

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

# ── Stage 1: Install dependencies ──────────────────────────────────────────
FROM base AS deps
WORKDIR /app/clara-backend
COPY clara-backend/package.json clara-backend/package-lock.json* ./
RUN npm install --ignore-scripts --legacy-peer-deps

# ── Stage 2: Build ─────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app/clara-backend
COPY --from=deps /app/clara-backend/node_modules ./node_modules
COPY packages /app/packages
COPY clara-backend ./
ENV NODE_ENV=production
RUN ln -s /app/clara-backend/node_modules /app/node_modules && npm run build

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app/clara-backend
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 clarauser

COPY --from=builder /app/clara-backend/public ./public
COPY --from=builder /app/clara-backend/scripts ./scripts
COPY --from=builder /app/clara-backend/.next-app/standalone/clara-backend ./
# Keep browser assets inside the configured distDir so standalone Next can serve /_next/static.
COPY --from=builder /app/clara-backend/.next-app/static ./.next-app/static

USER clarauser
EXPOSE 3000

# Start the standalone Next.js server
CMD ["sh", "./scripts/docker-start.sh"]

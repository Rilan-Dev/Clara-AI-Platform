# Clara TechVision — Next.js standalone Dockerfile
# This Dockerfile expects to be run from the repository root (context: .)

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ── Stage 1: Install dependencies ──────────────────────────────────────────
FROM base AS deps
WORKDIR /app/clara-techvision
COPY clara-techvision/package.json clara-techvision/package-lock.json* ./
RUN npm install --ignore-scripts --legacy-peer-deps

# ── Stage 2: Build ─────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app/clara-techvision
COPY --from=deps /app/clara-techvision/node_modules ./node_modules
COPY clara-techvision ./
ENV NODE_ENV=production
RUN npm run build

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app/clara-techvision
ENV NODE_ENV=production
ENV PORT=3002

RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 clarauser

COPY --from=builder /app/clara-techvision/public ./public
COPY --from=builder /app/clara-techvision/.next-app/standalone ./
COPY --from=builder /app/clara-techvision/.next-app/static ./.next/static

USER clarauser
EXPOSE 3002

# Start the standalone Next.js server
CMD ["node", "server.js"]

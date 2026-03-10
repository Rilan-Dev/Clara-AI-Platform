# Clara Backend — Vite + Express Dockerfile
# This Dockerfile expects to be run from the repository root (context: .)

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
COPY clara-backend ./
ENV NODE_ENV=production
RUN npm run build

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app/clara-backend
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 clarauser

# Copy built frontend and source code
COPY --from=builder /app/clara-backend/dist ./dist
COPY --from=builder /app/clara-backend/node_modules ./node_modules
COPY --from=builder /app/clara-backend/package.json ./package.json
COPY --from=builder /app/clara-backend/src ./src
COPY --from=builder /app/clara-backend/tsconfig.json ./tsconfig.json
COPY --from=builder /app/clara-backend/public ./public
COPY --from=builder /app/clara-backend/scripts ./scripts

USER clarauser
EXPOSE 3000

# Start the Express server
CMD ["npm", "run", "start"]

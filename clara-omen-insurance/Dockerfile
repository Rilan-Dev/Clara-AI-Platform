# Clara Omen Insurance — Vite + Express Dockerfile
# This Dockerfile expects to be run from the repository root (context: .)

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ── Stage 1: Install dependencies ──────────────────────────────────────────
FROM base AS deps
WORKDIR /app/clara-omen-insurance
COPY clara-omen-insurance/package.json clara-omen-insurance/package-lock.json* ./
RUN npm install --ignore-scripts --legacy-peer-deps

# ── Stage 2: Build ─────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app/clara-omen-insurance
COPY --from=deps /app/clara-omen-insurance/node_modules ./node_modules
COPY clara-omen-insurance ./
ENV NODE_ENV=production
RUN npm run build

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app/clara-omen-insurance
ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 clarauser

# Copy built frontend and source code for the Express server
COPY --from=builder /app/clara-omen-insurance/dist ./dist
COPY --from=builder /app/clara-omen-insurance/node_modules ./node_modules
COPY --from=builder /app/clara-omen-insurance/package.json ./package.json
COPY --from=builder /app/clara-omen-insurance/src ./src
COPY --from=builder /app/clara-omen-insurance/tsconfig.json ./tsconfig.json
COPY --from=builder /app/clara-omen-insurance/public ./public

USER clarauser
EXPOSE 3001

# Start the Express server using tsx
CMD ["npm", "run", "start"]

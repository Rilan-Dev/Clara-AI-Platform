# Clara TechVision — Vite + Express Dockerfile
# This Dockerfile expects to be run from the repository root (context: .)

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ── Stage 1: Install dependencies ──────────────────────────────────────────
FROM base AS deps
# Copy root workspace files and the specific app's package.json
COPY package.json package-lock.json ./
COPY packages/consumer-runtime ./packages/consumer-runtime
COPY clara-techvision/package.json ./clara-techvision/

# Install dependencies using npm workspaces
RUN npm install --ignore-scripts --legacy-peer-deps

# ── Stage 2: Build ─────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
# Copy shared package and the app itself
COPY packages/consumer-runtime ./packages/consumer-runtime
COPY clara-techvision ./clara-techvision

WORKDIR /app/clara-techvision
ENV NODE_ENV=production
# Build the Vite frontend into /app/clara-techvision/dist
RUN npm run build

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app/clara-techvision
ENV NODE_ENV=production
ENV PORT=3002

RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 clarauser

# Copy built frontend and source code for the Express server
COPY --from=builder /app/clara-techvision/dist ./dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/clara-techvision/package.json ./package.json
COPY --from=builder /app/clara-techvision/src ./src
COPY --from=builder /app/clara-techvision/tsconfig.json ./tsconfig.json
COPY --from=builder /app/clara-techvision/public ./public

USER clarauser
EXPOSE 3002

# Start the Express server using tsx
CMD ["npm", "run", "start"]

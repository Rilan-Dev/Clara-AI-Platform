# Clara Backend — Next.js standalone Dockerfile
# This Dockerfile expects the build context to be the repository root (`.`)

FROM mcr.microsoft.com/playwright:v1.56.1-noble AS base
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

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

# Copy voice relay scripts into standalone output so they run alongside Next.js.
# Also copy the ws package (used by the relay) into standalone node_modules.
RUN mkdir -p /app/clara-backend/.next-app/standalone/clara-backend/scripts && \
    cp /app/clara-backend/scripts/start.mjs       /app/clara-backend/.next-app/standalone/clara-backend/scripts/start.mjs && \
    cp /app/clara-backend/scripts/voice-relay.mjs /app/clara-backend/.next-app/standalone/clara-backend/scripts/voice-relay.mjs && \
    cp -r /app/clara-backend/node_modules/ws      /app/clara-backend/.next-app/standalone/clara-backend/node_modules/ws

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app/clara-backend
ENV NODE_ENV=production
ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=builder /app/clara-backend/public ./public
COPY --from=builder /app/clara-backend/scripts ./scripts
COPY --from=builder /app/clara-backend/.next-app/standalone/clara-backend ./
# Keep browser assets inside the configured distDir so standalone Next can serve /_next/static.
COPY --from=builder /app/clara-backend/.next-app/static ./.next-app/static

USER pwuser
EXPOSE 3000

# Start the standalone Next.js server
CMD ["sh", "./scripts/docker-start.sh"]

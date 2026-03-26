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
COPY clara-backend/packages /app/packages
COPY clara-backend ./
ENV NODE_ENV=production
# Bake NEXT_PUBLIC env vars into the client bundle at build time
ARG SKIP_AUTH=true
ENV SKIP_AUTH=$SKIP_AUTH

RUN ln -s /app/clara-backend/node_modules /app/node_modules && npm run build

# Copy voice relay scripts and the ws module into standalone output.
# Scripts go into the project-specific subfolder; ws goes into the root node_modules.
RUN mkdir -p /app/clara-backend/.next/standalone/clara-backend/scripts /app/clara-backend/.next/standalone/node_modules && \
    cp /app/clara-backend/scripts/start.mjs        /app/clara-backend/.next/standalone/clara-backend/scripts/start.mjs && \
    cp /app/clara-backend/scripts/voice-relay.mjs  /app/clara-backend/.next/standalone/clara-backend/scripts/voice-relay.mjs && \
    cp /app/clara-backend/scripts/phone-stream.mjs /app/clara-backend/.next/standalone/clara-backend/scripts/phone-stream.mjs && \
    cp -r /app/clara-backend/node_modules/ws      /app/clara-backend/.next/standalone/node_modules/ws

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app/clara-backend
ENV NODE_ENV=production
ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=builder /app/clara-backend/public ./public
# Copy the full standalone Next.js output (includes server.js, node_modules, etc.)
COPY --from=builder /app/clara-backend/.next/standalone ./
# Keep browser assets inside the configured distDir so standalone Next can serve /_next/static.
COPY --from=builder /app/clara-backend/.next/static ./.next/static
# Overwrite scripts/ with the full scripts directory (includes docker-start.sh etc.)
# The relay scripts (start.mjs, voice-relay.mjs, phone-stream.mjs) and ws module are already
# inside the standalone output from the builder stage RUN cp commands above.
COPY --from=builder /app/clara-backend/scripts ./scripts

USER pwuser
EXPOSE 3000

# Start via the relay-enabled custom entry point
CMD ["sh", "./scripts/docker-start.sh"]

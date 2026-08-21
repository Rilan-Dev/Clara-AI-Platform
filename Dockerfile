# Clara Backend — Next.js standalone Dockerfile
# Build context is the repository root (`.`).
# The Next.js application lives under `clara-backend/`.

FROM mcr.microsoft.com/playwright:v1.56.1-noble AS base
WORKDIR /app/clara-backend
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

FROM base AS deps
COPY clara-backend/package.json clara-backend/package-lock.json* ./
RUN npm install --ignore-scripts --legacy-peer-deps

FROM base AS builder
COPY --from=deps /app/clara-backend/node_modules ./node_modules
COPY clara-backend/packages ./packages
COPY clara-backend/. ./
ENV NODE_ENV=production

# Bake NEXT_PUBLIC env vars into the client bundle at build time.
ARG SKIP_AUTH=true
ENV SKIP_AUTH=$SKIP_AUTH

RUN npm run build

# Next standalone output contains the application server and production
# dependencies. The custom relay entry point and ws package are added beside it.
RUN mkdir -p .next/standalone/scripts .next/standalone/node_modules && \
    cp scripts/start.mjs .next/standalone/scripts/start.mjs && \
    cp scripts/voice-relay.mjs .next/standalone/scripts/voice-relay.mjs && \
    cp scripts/phone-stream.mjs .next/standalone/scripts/phone-stream.mjs && \
    cp -r node_modules/ws .next/standalone/node_modules/ws

FROM base AS runner
WORKDIR /app/clara-backend
ENV NODE_ENV=production
ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=builder /app/clara-backend/public ./public
COPY --from=builder /app/clara-backend/.next/standalone ./
COPY --from=builder /app/clara-backend/.next/static ./.next/static
COPY --from=builder /app/clara-backend/scripts ./scripts

USER pwuser
EXPOSE 3000
CMD ["sh", "./scripts/docker-start.sh"]

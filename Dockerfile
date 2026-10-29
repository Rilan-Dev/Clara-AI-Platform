# Clara AI Platform — Next.js standalone + worker Dockerfile
# Build context is the repository root (.).
#
# IMPORTANT: backend and worker intentionally share this dependency stage.
# Keeping the two services on separate Dockerfiles caused Docker Compose to run
# two full npm ci processes concurrently against the same large Activepieces
# dependency graph. That doubled registry/network/CPU/RAM pressure and was the
# dominant source of multi-hour local builds.
#
# Compose targets:
#   clara-backend -> runner
#   clara-worker  -> worker
#
# The shared deps stage is built once per Docker build graph and reused by both
# targets.

FROM mcr.microsoft.com/playwright:v1.56.1-noble AS base
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

FROM base AS deps
COPY package.json package-lock.json* ./
# BuildKit cache keeps the npm download cache outside the image layer so
# subsequent builds avoid re-downloading the large dependency graph.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund && \
    test -x node_modules/.bin/tsx

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY packages ./packages
COPY . ./
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Docker production builds intentionally skip duplicate type/lint passes.
# npm run type-check and npm run lint remain separate verification gates.
ARG CLARA_SKIP_TYPECHECK=1
ENV CLARA_SKIP_TYPECHECK=$CLARA_SKIP_TYPECHECK

# Bake NEXT_PUBLIC env vars into the client bundle at build time.
ARG SKIP_AUTH=true
ENV SKIP_AUTH=$SKIP_AUTH

RUN --mount=type=secret,id=clara_integration_encryption_key,env=INTEGRATION_ENCRYPTION_KEY \
    npm run build

# Next standalone output contains the application server and production
# dependencies. The custom relay entry point and ws package are added beside it.
RUN mkdir -p .next/standalone/scripts .next/standalone/node_modules && \
    cp scripts/start.mjs .next/standalone/scripts/start.mjs && \
    cp scripts/voice-relay.mjs .next/standalone/scripts/voice-relay.mjs && \
    cp scripts/phone-stream.mjs .next/standalone/scripts/phone-stream.mjs && \
    cp scripts/sarvam-relay.mjs .next/standalone/scripts/sarvam-relay.mjs && \
    cp scripts/probe-rag-reranker.mjs .next/standalone/scripts/probe-rag-reranker.mjs && \
    cp -r node_modules/ws .next/standalone/node_modules/ws

# The ElevenLabs Speech Engine is imported by the custom server entry point,
# which is outside Next.js's standalone dependency tracing graph. The SDK is
# already installed in the shared dependency layer, so copy only its runtime
# package and its lockfile-resolved dependency closure into standalone instead
# of running a second npm install. Keep this list aligned with the installed
# package version: ioredis 6 no longer depends on lodash.defaults or
# redis-parser, so obsolete ioredis 5-era copies must not be assumed present.
# This preserves the exact lockfile-resolved versions and removes the
# multi-minute registry/resolution/install step.
RUN mkdir -p .next/standalone/node_modules/@elevenlabs .next/standalone/node_modules/@ioredis && \
    cp -r node_modules/@elevenlabs/elevenlabs-js .next/standalone/node_modules/@elevenlabs/elevenlabs-js && \
    cp -r node_modules/command-exists .next/standalone/node_modules/command-exists && \
    cp -r node_modules/node-fetch .next/standalone/node_modules/node-fetch && \
    cp -r node_modules/data-uri-to-buffer .next/standalone/node_modules/data-uri-to-buffer && \
    cp -r node_modules/fetch-blob .next/standalone/node_modules/fetch-blob && \
    cp -r node_modules/formdata-polyfill .next/standalone/node_modules/formdata-polyfill && \
    cp -r node_modules/node-domexception .next/standalone/node_modules/node-domexception && \
    cp -r node_modules/web-streams-polyfill .next/standalone/node_modules/web-streams-polyfill && \
    cp -r node_modules/ioredis .next/standalone/node_modules/ioredis && \
    cp -r node_modules/@ioredis/commands .next/standalone/node_modules/@ioredis/commands && \
    cp -r node_modules/cluster-key-slot .next/standalone/node_modules/cluster-key-slot && \
    cp -r node_modules/debug .next/standalone/node_modules/debug && \
    cp -r node_modules/ms .next/standalone/node_modules/ms && \
    cp -r node_modules/denque .next/standalone/node_modules/denque && \
    cp -r node_modules/redis-errors .next/standalone/node_modules/redis-errors && \
    cp -r node_modules/standard-as-callback .next/standalone/node_modules/standard-as-callback && \
    cp -r node_modules/undici .next/standalone/node_modules/undici

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/scripts ./scripts
# Schema migrations are applied at startup (src/instrumentation.node.ts);
# the standalone output does not trace these SQL files.
COPY --from=builder /app/src/lib/db/migrations ./src/lib/db/migrations

USER pwuser
EXPOSE 3000
CMD ["sh", "./scripts/docker-start.sh"]

# Worker image: reuse the exact same node_modules layer as the backend.
FROM base AS worker
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=deps /app/node_modules ./node_modules

# Workspace packages
COPY packages ./packages

# Worker source
COPY src ./src
COPY workers ./workers
COPY tsconfig.json ./tsconfig.json
COPY tsconfig.worker.json ./tsconfig.worker.json

# Operator scripts (embedding-egress probe etc.) — node builtins only, so
# they run in this image with zero extra dependencies:
#   docker compose exec clara-worker node scripts/probe-embedding-egress.mjs
COPY scripts ./scripts

USER pwuser

# worker-entry starts the automatic document ingest poller, then loads the
# existing crawl/retry workers in the same long-lived process.
CMD ["node_modules/.bin/tsx", "--tsconfig", "tsconfig.worker.json", "workers/worker-entry.ts"]

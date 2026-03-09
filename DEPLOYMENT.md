# Clara AI Platform — Deployment Guide

> **Last updated:** March 2025  
> **Architecture:** 3 Next.js 15 apps + PostgreSQL 16 + Qdrant

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Docker Compose (Recommended)](#docker-compose)
4. [Manual Production Deploy](#manual-production-deploy)
5. [Environment Variables Reference](#environment-variables-reference)
6. [Database Migrations](#database-migrations)
7. [Seeding Demo Data](#seeding-demo-data)
8. [Reverse Proxy (Nginx)](#reverse-proxy-nginx)
9. [Health Checks](#health-checks)
10. [Monitoring & Logs](#monitoring--logs)

---

## Prerequisites

| Tool             | Minimum Version | Notes                        |
|------------------|-----------------|------------------------------|
| Node.js          | 20.x LTS        | Required for all apps        |
| npm              | 10.x            | Included with Node 20        |
| PostgreSQL       | 15+             | Or use Docker Compose        |
| Qdrant           | 1.7+            | Or use Docker Compose        |
| Docker           | 24+             | Optional — for compose setup |
| Docker Compose   | v2.x            | Plugin, not standalone       |

---

## Local Development

```bash
# 1. Clone the repo
git clone <repo-url> clara-platform
cd clara-platform

# 2. Copy and fill environment variables
cp .env.example clara-backend/.env.local
cp .env.example clara-omen-insurance/.env.local
cp .env.example clara-techvision/.env.local

# 3. Start PostgreSQL and Qdrant (via Docker or locally)
docker compose up -d postgres qdrant

# 4. Install and start the backend
cd clara-backend
npm install
npm run dev    # → http://localhost:3000

# 5. Run DB migrations (first time only — runs automatically on startup)
# Migrations run automatically when the dev server starts

# 6. Seed demo data
npm run seed

# 7. Start tenant apps (new terminals)
cd ../clara-omen-insurance && npm install && npm run dev   # → http://localhost:3001
cd ../clara-techvision    && npm install && npm run dev   # → http://localhost:3002
```

**Default credentials (after seed):**

| App                        | URL                      | Email                        | Password     |
|----------------------------|--------------------------|------------------------------|--------------|
| Platform Admin             | localhost:3010/dashboard | admin@clara.ai               | Admin1234!   |
| Omen Insurance Portal      | localhost:3001           | admin@omeninsurance.com      | Omen1234!    |
| TechVision Portal          | localhost:3002           | admin@techvision.io          | Tech1234!    |

---

## Docker Compose

The easiest way to run the full stack in production.

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env — set OPENAI_API_KEY, AUTH_SECRET, POSTGRES_PASSWORD

# 2. Build and start all services
docker compose up --build -d

# 3. Check status
docker compose ps
docker compose logs -f clara-backend

# 4. Seed demo data (first time)
docker compose exec clara-backend npm run seed

# 5. Stop everything
docker compose down

# 6. Stop and remove all data (destructive)
docker compose down -v
```

### Exposed Ports

| Service          | Port  | Description                  |
|------------------|-------|------------------------------|
| clara-backend    | 3010  | Main API + marketing + admin |
| clara-omen       | 3001  | Omen Insurance demo app      |
| clara-techvision | 3002  | TechVision demo app          |
| postgres         | 5432  | Database (internal access)   |
| qdrant           | 6333  | Vector DB HTTP                |

---

## Manual Production Deploy

If you prefer to deploy without Docker (e.g. on Vercel, Railway, Fly.io):

### Backend (clara-backend)

```bash
cd clara-backend

# Install
npm ci

# Build
npm run build

# Start (standalone output)
node .next/standalone/server.js
```

Set `output: 'standalone'` in `next.config.ts` (already configured).

### Tenant Apps

Same process, different ports:

```bash
# Omen
cd clara-omen-insurance && npm ci && npm run build
PORT=3001 node .next/standalone/server.js

# TechVision
cd clara-techvision && npm ci && npm run build
PORT=3002 node .next/standalone/server.js
```

---

## Environment Variables Reference

See `.env.example` for the complete list. Key variables:

| Variable              | Required | Description                                |
|-----------------------|----------|--------------------------------------------|
| `DATABASE_URL`        | ✅        | PostgreSQL connection string               |
| `QDRANT_URL`          | ✅        | Qdrant HTTP endpoint                       |
| `OPENAI_API_KEY`      | ✅        | OpenAI API key (RAG + voice)               |
| `AUTH_SECRET`         | ✅        | JWT signing secret (min 32 chars)          |
| `STRIPE_SECRET_KEY`   | ⚠️        | Required for billing (leave blank to skip) |
| `NEXT_PUBLIC_APP_URL` | ✅        | Public URL of the backend                  |

---

## Database Migrations

Migrations live in `clara-backend/src/lib/db/migrations/` and are named `001_*.sql`, `002_*.sql`, etc.

The migration runner (`src/lib/db/migrate.ts`) auto-runs on backend startup — **no manual step needed**.

To add a new migration:

```bash
# Create a new migration file
touch clara-backend/src/lib/db/migrations/007_my_feature.sql
# Restart the dev server — it will run automatically
```

---

## Seeding Demo Data

```bash
cd clara-backend

# Seed (idempotent — safe to run multiple times)
npm run seed

# Reset and re-seed
npm run seed:reset
```

Creates:
- Platform super-admin (`admin@clara.ai`)
- Omen United Insurance org (Pro plan) + admin user
- TechVision Solutions org (Starter plan) + admin user
- 5 knowledge bases, 2 assistant configs, 700 synthetic queries

---

## Reverse Proxy (Nginx)

Example config to serve all three apps from a single domain with subdomains:

```nginx
# /etc/nginx/sites-available/clara

server {
    listen 443 ssl;
    server_name clara.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name omen.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name techvision.yourdomain.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Health Checks

All apps expose a health endpoint:

```bash
curl http://localhost:3000/api/health  # Backend
```

Response:
```json
{
  "status": "ok",
  "db": "connected",
  "qdrant": "connected",
  "timestamp": "2025-03-01T12:00:00.000Z"
}
```

---

## Monitoring & Logs

### Docker Compose

```bash
# All logs
docker compose logs -f

# Backend only
docker compose logs -f clara-backend

# Last 100 lines
docker compose logs --tail=100 clara-backend
```

### Process logs (without Docker)

Use PM2 for production process management:

```bash
npm install -g pm2

# Start all apps
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs
```

Example `ecosystem.config.js`:

```js
module.exports = {
  apps: [
    { name: "clara-backend",    cwd: "./clara-backend",         script: ".next/standalone/server.js", env: { PORT: 3010 } },
    { name: "clara-omen",       cwd: "./clara-omen-insurance",  script: ".next/standalone/server.js", env: { PORT: 3001 } },
    { name: "clara-techvision", cwd: "./clara-techvision",      script: ".next/standalone/server.js", env: { PORT: 3002 } },
  ],
};
```

---

## Troubleshooting

**`relation "subscription_plans" does not exist`**  
→ Migrations haven't run. Restart the backend dev server or run `npm run migrate`.

**`OPENAI_API_KEY is not set`**  
→ Check your `.env.local` file. Restart the server after editing.

**Qdrant collection not found**  
→ The collection is created automatically on first document upload. Check Qdrant is running at `QDRANT_URL`.

**Auth redirect loop on `/dashboard`**  
→ Ensure your `AUTH_SECRET` is set and matches across restarts.

# 🚀 Clara AI RAG — Deployment Guide

Production deployment guide for **Clara AI RAG** using Docker.

---

## 📋 Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Docker | 24+ | `docker --version` |
| Docker Compose | v2+ (plugin) | `docker compose version` |
| Node.js | 20 LTS | `node --version` (local dev only) |
| Git | any | `git --version` |

---

## 🏗️ Project Structure

```
Clara-AI-RAG/
├── Dockerfile                    # Multi-stage production build
├── .dockerignore                 # Excludes secrets & build artifacts
├── docker-compose.yaml           # Full stack: NGINX + Web + Qdrant
├── .env.example                  # Template (safe to commit)
├── .env                          # Your secrets (NEVER commit)
├── deploy/
│   └── nginx/
│       ├── nginx.conf            # Reverse proxy config
│       └── certs/                # TLS certificates (gitignored)
│           └── README.md
├── .github/
│   └── workflows/
│       └── ci.yml                # CI/CD pipeline
└── src/app/api/health/route.ts   # Healthcheck endpoint
```

---

## 🔧 Step 1 — Configure Environment

```bash
# Copy the template
cp .env.example .env

# Edit with your secrets
notepad .env   # Windows
# nano .env    # Linux/Mac
```

**Required values to fill in:**

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your OpenAI API key |
| `GEMINI_API_KEY` | Your Google AI Studio key |
| `NEXT_PUBLIC_GEMINI_API_KEY` | Same as above (client-side) |
| `QDRANT_API_KEY` | A strong random key for Qdrant auth |
| `AUTH_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_PASSWORD` | Strong admin password |

> ⚠️ **Never commit `.env` to Git.** It's already in `.gitignore`.

---

## 🐳 Step 2 — Build & Start (Docker)

### Option A: Full Stack (recommended)

This starts NGINX (port 80/443), the Next.js app, and Qdrant:

```bash
docker compose up --build -d
```

### Option B: Without NGINX (development)

If you don't have TLS certs yet, modify `docker-compose.yaml`:
- Change `web.expose` to `web.ports: ["3000:3000"]`
- Comment out the entire `nginx` service

```bash
docker compose up --build -d web qdrant
```

### Verify it's running

```bash
# Check all containers are healthy
docker compose ps

# Test health endpoint
curl http://localhost:3000/api/health

# Stream logs
docker compose logs -f web
```

---

## 🔒 Step 3 — TLS/HTTPS Setup

### Option A: Self-signed (testing only)

```bash
cd deploy/nginx/certs

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout privkey.pem -out fullchain.pem \
  -subj "/CN=localhost"

cd ../../..
docker compose restart nginx
```

### Option B: Let's Encrypt (production)

```bash
# Install certbot on your server
sudo certbot certonly --standalone -d your-domain.com

# Copy generated certs
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem deploy/nginx/certs/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem   deploy/nginx/certs/

docker compose restart nginx
```

---

## 📦 Step 4 — Document Ingestion

1. Open the admin panel: `https://your-domain.com/ingest` (or `http://localhost:3000/ingest`)
2. Login with your `ADMIN_USERNAME` / `ADMIN_PASSWORD`
3. Upload a PDF or text document
4. Wait for ingestion to complete
5. Navigate to the chat interface and test

---

## 🔄 Step 5 — Switching AI Providers

```bash
# Edit .env
NEXT_PUBLIC_AI_PROVIDER="gemini"   # or "openai"

# Restart the app
docker compose down
docker compose up -d
```

> ⚠️ **Re-ingest all documents** after switching providers.
> OpenAI uses 1536-dim embeddings, Gemini uses 768-dim — they're incompatible.

---

## 🔄 Step 6 — CI/CD Pipeline

The GitHub Actions pipeline (`.github/workflows/ci.yml`) runs automatically on push to `main`:

1. **Lint & Type Check** — validates code quality
2. **Build & Push** — creates Docker image, pushes to Docker Hub
3. **Security Scan** — runs Trivy vulnerability scanner

### Required GitHub Secrets

Set these in your repo: **Settings → Secrets → Actions**:

| Secret | Value |
|--------|-------|
| `DOCKER_USER` | Your Docker Hub username |
| `DOCKER_PASS` | Your Docker Hub password/token |

---

## 🛠️ Common Operations

### Restart a single service
```bash
docker compose restart web
```

### View logs
```bash
docker compose logs -f web      # App logs
docker compose logs -f qdrant   # Vector DB logs
docker compose logs -f nginx    # Proxy logs
```

### Update to latest code
```bash
git pull origin main
docker compose up --build -d
```

### Backup Qdrant data
```bash
docker compose exec qdrant tar czf /tmp/backup.tar.gz /qdrant/storage
docker compose cp qdrant:/tmp/backup.tar.gz ./qdrant-backup.tar.gz
```

### Reset everything
```bash
docker compose down -v    # ⚠️ Destroys Qdrant data volume
docker compose up --build -d
```

---

## 🏥 Troubleshooting

| Symptom | Fix |
|---------|-----|
| Container exits immediately | `docker compose logs web` — check for missing env vars |
| Qdrant health fails | Ensure `QDRANT_API_KEY` matches between `.env` and Qdrant config |
| NGINX 502 Bad Gateway | Web container isn't healthy yet — wait or check `docker compose ps` |
| Build fails on `standalone` | Ensure `next.config.ts` has `output: "standalone"` |
| Voice not working | Check `NEXT_PUBLIC_AI_PROVIDER` matches your intended provider |
| Large Docker image | Ensure `.dockerignore` exists and excludes `node_modules`, `.git` |

---

## 📊 Architecture

```
                    ┌─────────────┐
   Users ──────────►│    NGINX    │
   (80/443)         │  (TLS/gzip) │
                    └──────┬──────┘
                           │ :3000
                    ┌──────▼──────┐
                    │   Next.js   │
                    │  (web app)  │
                    └──────┬──────┘
                           │ :6333
                    ┌──────▼──────┐
                    │   Qdrant    │
                    │ (vector DB) │
                    └─────────────┘
```

- **NGINX** sits on `frontend` network, handles TLS + compression + rate limiting
- **Web** bridges `frontend` ↔ `backend` networks
- **Qdrant** is on `backend` (internal-only) — not accessible from outside

# Clara AI Platform — Setup Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (local or hosted)
- Qdrant (local via Docker or Qdrant Cloud)
- OpenAI API key

---

## Directory Structure

```
clara-platform/
├── clara-backend/        → Port 3010 (API + Admin + Marketing)
├── clara-omen-insurance/ → Port 3001 (Insurance tenant demo)
├── clara-techvision/     → Port 3002 (Tech company tenant demo)
├── START-ALL.bat         → Windows launcher
└── START-ALL.sh          → Mac/Linux launcher
```

---

## Step 1 — Configure clara-backend

```bash
cd clara-backend
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/clara_dev
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-key
OPENAI_API_KEY=sk-...
AUTH_SECRET=your-32-character-secret-here
PORT=3010
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Install and run:
```bash
npm install
npm run dev
```

On first startup, all database migrations (001–006) run automatically.

---

## Step 2 — Seed Demo Data

```bash
cd clara-backend
npm run seed
```

This creates:
- Platform admin: `admin@clara.ai` / `Admin1234!`
- Omen Insurance admin: `admin@omeninsurance.com` / `Omen1234!`
- TechVision admin: `admin@techvision.io` / `Tech1234!`
- 3 KBs for Omen (Pro plan), 2 KBs for TechVision (Starter plan)
- 700 synthetic query events for analytics

To reset demo data:
```bash
npm run seed:reset
npm run seed
```

---

## Step 3 — Install Tenant Apps

```bash
cd clara-omen-insurance && npm install
cd ../clara-techvision && npm install
```

The `.env.local` files are pre-configured with the seed org IDs. No changes needed for local development.

---

## Step 4 — Start Everything

**Windows:**
```
Double-click START-ALL.bat
```

**Mac/Linux:**
```bash
chmod +x START-ALL.sh
./START-ALL.sh
```

**Or manually:**
```bash
# Terminal 1
cd clara-backend && npm run dev        # → http://localhost:3000

# Terminal 2
cd clara-omen-insurance && npm run dev # → http://localhost:3001

# Terminal 3
cd clara-techvision && npm run dev     # → http://localhost:3002
```

---

## URLs

| App | URL | Login |
|-----|-----|-------|
| Clara Platform | http://localhost:3000 | Marketing landing page |
| Clara Admin | http://localhost:3000/admin | admin@clara.ai / Admin1234! |
| Omen Insurance | http://localhost:3001 | admin@omeninsurance.com / Omen1234! |
| TechVision | http://localhost:3002 | admin@techvision.io / Tech1234! |

---

## Adding Documents to KBs

1. Log in to Omen Insurance or TechVision portal
2. Go to **Knowledge Bases** → select a KB
3. Use the **Upload** tab to add PDFs, DOCX, or TXT files
4. Wait for status to change from `processing` → `ready`
5. Test in **Chat** tab

---

## Production Deployment

See `DEPLOYMENT.md` for Vercel + Railway setup.

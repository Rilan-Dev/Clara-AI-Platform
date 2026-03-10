import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { registerApiRoutes } from "@/server/routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const distDir = path.join(rootDir, "dist");

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function buildAllowedOrigins() {
  const origins = new Set<string>();
  const multi = process.env.ALLOWED_ORIGINS ?? "";
  const single = process.env.ALLOWED_ORIGIN ?? "";

  for (const raw of [...multi.split(","), ...single.split(",")]) {
    const value = normalizeOrigin(raw);
    if (value) {
      origins.add(value);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://127.0.0.1:3002",
      "http://127.0.0.1:3003",
      "http://127.0.0.1:5173",
    ].forEach((origin) => origins.add(normalizeOrigin(origin)));
  }

  return origins;
}

const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/embed",
  "/api/subscriptions/plans",
  "/api/health",
  "/api/gemini",
];

function startsWith(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const app = express();
const allowedOrigins = buildAllowedOrigins();

app.set("trust proxy", true);

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalized = normalizeOrigin(origin);

    if (allowedOrigins.has(normalized)) {
      callback(null, true);
      return;
    }

    console.warn("[cors] blocked origin:", origin, "allowed:", [...allowedOrigins]);
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "x-clara-token"],
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "wss:", "https://api.openai.com", "https://realtime.openai.com"],
      mediaSrc: ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", (req, res, next) => {
  if (startsWith(req.path, PUBLIC_API_PREFIXES.map((prefix) => prefix.replace("/api", "")))) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cookieToken =
    req.cookies.clara_platform_token ??
    req.cookies.clara_admin_token ??
    req.cookies.clara_token;

  if (!bearerToken && !cookieToken) {
    res.status(401).json({ error: "Unauthorised", message: "A valid auth token is required." });
    return;
  }

  if (!authHeader && cookieToken) {
    req.headers.authorization = `Bearer ${cookieToken}`;
  }

  next();
});

registerApiRoutes(app);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
}

app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server] unhandled error", error);
  res.status(500).json({ error: error.message || "Internal server error" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`[clara-backend] server running on http://localhost:${port}`);
});
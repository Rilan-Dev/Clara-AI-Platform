import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Request, Response, NextFunction } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createConsumerServer(opts: {
  port: number;
  cookieName: string;
  backendUrl: string;
  appLabel: string;
  distDir: string;
}) {
  const { port, cookieName, backendUrl, appLabel, distDir } = opts;

  const app = express();

  app.set("trust proxy", true);

  app.use(cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
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

  // Raw body for proxy (preserves multipart/file uploads)
  app.use(express.raw({ type: () => true, limit: "25mb" }));

  return { app, port, cookieName, backendUrl, appLabel, distDir };
}

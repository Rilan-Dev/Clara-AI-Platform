import path from "node:path";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { SECURITY_HEADERS } from "./security-headers.js";

type CreateConsumerServerOptions = {
  appName: string;
  port: number;
  rootDir: string;
  registerApiRoutes: (app: ReturnType<typeof express>) => void;
};

export function createConsumerServer({ appName, port, rootDir, registerApiRoutes }: CreateConsumerServerOptions) {
  const app     = express();
  const distDir = path.join(rootDir, "dist");

  app.set("trust proxy", true);
  app.use(cors({ origin: true, credentials: true }));
  app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
  app.use((_req, res, next) => {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(header, value);
    }
    next();
  });
  app.use(compression());
  app.use(cookieParser());
  app.use(express.raw({ type: () => true, limit: "25mb" }));

  registerApiRoutes(app);

  if (process.env.NODE_ENV === "production") {
    app.use(express.static(distDir));
  }

  app.get(/.*/, (_req: express.Request, res: express.Response) => {
    res.sendFile(path.join(distDir, "index.html"));
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[${appName}]`, error);
    res.status(500).json({ error: error.message || "Internal server error" });
  });

  app.listen(port, () => {
    console.log(`[${appName}] server running on http://localhost:${port}`);
  });

  return app;
}

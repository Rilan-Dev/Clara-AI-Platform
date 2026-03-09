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
const app = express();
const port = Number(process.env.PORT ?? 3002);

app.set("trust proxy", true);
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
app.use(compression());
app.use(cookieParser());
app.use(express.raw({ type: () => true, limit: "25mb" }));

registerApiRoutes(app);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
}

app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[clara-techvision]", error);
  res.status(500).json({ error: error.message || "Internal server error" });
});

app.listen(port, () => {
  console.log(`[clara-techvision] server running on http://localhost:${port}`);
});

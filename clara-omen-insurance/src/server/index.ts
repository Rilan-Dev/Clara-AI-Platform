import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createConsumerServer } from "./create-server.js";
import { registerRoutes } from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../../dist");

const BACKEND_URL = process.env.CLARA_BACKEND_URL ?? "http://localhost:3000";
const PORT = Number(process.env.PORT ?? 3001);
const COOKIE_NAME = "clara_omen_token";

const { app } = createConsumerServer({
  port: PORT,
  cookieName: COOKIE_NAME,
  backendUrl: BACKEND_URL,
  appLabel: "clara-omen-insurance",
  distDir,
});

registerRoutes(app, { backendUrl: BACKEND_URL, cookieName: COOKIE_NAME });

// Serve Vite build in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
}

app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[clara-omen-insurance] server running on http://localhost:${PORT}`);
});

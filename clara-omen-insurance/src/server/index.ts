import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConsumerServer } from "./create-server.js";
import { registerApiRoutes }   from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const rootDir    = path.resolve(__dirname, "..", "..");

createConsumerServer({
  appName: "clara-omen-insurance",
  port:    Number(process.env.PORT ?? 3001),
  rootDir,
  registerApiRoutes,
});

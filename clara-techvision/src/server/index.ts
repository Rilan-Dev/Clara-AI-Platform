import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConsumerServer } from "@clara/consumer-runtime/server";

import { registerApiRoutes } from "@/server/routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");

createConsumerServer({
  appName: "clara-techvision",
  port: Number(process.env.PORT ?? 3002),
  rootDir,
  registerApiRoutes,
});

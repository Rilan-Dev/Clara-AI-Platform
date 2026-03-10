import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfig: NextConfig = {
  distDir: ".next-app",
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  outputFileTracingRoot: join(__dirname, ".."),
};

export default nextConfig;

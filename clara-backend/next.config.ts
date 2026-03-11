import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfig: NextConfig = {
  distDir: ".next-app",
  output: "standalone",
  serverExternalPackages: ["pg"],
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  outputFileTracingRoot: join(__dirname, ".."),
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    },
  ],
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve ?? {};
    config.resolve.modules = [join(__dirname, "node_modules"), ...(config.resolve.modules ?? [])];
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "pdfjs-dist/build/pdf.worker.mjs": false,
      "pdfjs-dist/legacy/build/pdf.worker.mjs": false,
    };

    if (isServer && Array.isArray(config.externals)) {
      config.externals.push({ pg: "commonjs pg", cheerio: "commonjs cheerio" });
    }

    return config;
  },
};

export default nextConfig;

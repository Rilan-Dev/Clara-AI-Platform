import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfig: NextConfig = {
  // Standard Vercel output uses .next
  deploymentId: process.env.NEXT_DEPLOYMENT_ID,
  output: "standalone",
  serverExternalPackages: ["pg", "resend"],
  reactStrictMode: true,
  // Serve routes at both /path and /path/ instead of redirecting between them.
  // The sandbox preview proxy issues its own 301 adding a trailing slash, which
  // fought Next.js's default 308 slash-removal redirect and caused an infinite
  // redirect loop (ERR_TOO_MANY_REDIRECTS) on /dashboard.
  skipTrailingSlashRedirect: true,
  experimental: {
    externalDir: true,
    // Dev-server memory guard: keep webpack buffers off the heap so cold
    // compiles in the 4GB sandbox don't OOM-kill next-server.
    webpackMemoryOptimizations: true,
  },
  outputFileTracingRoot: __dirname,
  headers: async () => [
    {
      source: "/worklets/:path*",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
        { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        { key: "Cache-Control", value: "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
      ],
    },
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
